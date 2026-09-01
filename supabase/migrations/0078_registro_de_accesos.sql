-- =============================================================================
-- 0078_registro_de_accesos.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: docs/superpowers/specs/2026-09-01-registro-de-accesos-de-alumno-design.md
-- =============================================================================
-- DE UN HIJO DE TUTOR NO QUEDABA NI UN RASTRO DE DESDE DONDE ENTRA
--
-- El hijo de un tutor no tiene puerta de colegio: entra por la cookie de
-- dispositivo, y esa cookie nace del canje de un enlace de un solo uso
-- (`student_access_links`). Ese enlace es un bearer token de siete dias que
-- viaja por WhatsApp o por correo. Quien lo tenga en la mano fija un PIN nuevo
-- y se queda con la cuenta del niño; no hace falta romper nada.
--
-- Y cuando eso pasaba, la base no tenia con que responder a la pregunta
-- elemental —«¿desde donde se canjeo?», «¿desde donde entra desde entonces?»—:
--
--   · `audit_log` tiene `ip_hash` y `user_agent`, y el camino del tutor los
--     deja los dos en NULL. Un registro forense con las dos columnas forenses
--     vacias.
--   · `auth_attempts` si guarda `ip_hash`, pero es municion del lockout: se
--     poda, y solo mira intentos fallidos recientes. No es un archivo.
--   · `student_devices` sabe QUE aparato, nunca DESDE DONDE.
--
-- Sin esta tabla, un robo de enlace es indistinguible de un niño que se ha
-- cambiado de tablet, y un colegio que pregunta formalmente que ocurrio con la
-- cuenta de un alumno suyo no recibe respuesta ninguna.
--
-- LA IP SE GUARDA EN CLARO, Y ESO ES UNA DECISION, NO UN DESCUIDO
--
-- Decision explicita del propietario del producto el 01/09/2026 (§2 del
-- diseño), tomada despues de plantearle dos alternativas mas conservadoras
-- (solo hash + zona gruesa; o IP en claro purgada a los 30 dias). El coste
-- queda escrito para que nadie lo descubra despues: esto es un historial de
-- ubicacion permanente de un menor, y convierte a `accesos_de_alumno` en la
-- tabla mas sensible del sistema. Contradice `DATA_MODEL.md:283` («Nunca la IP
-- en claro»), que pasa a valer solo para `audit_log` y `auth_attempts`.
--
-- LA COMPENSACION ES EL CONTROL DE ACCESO, NO LA RETENCION
--
-- `ip`, `ip_hash` y `user_agent` quedan FUERA del grant de `authenticated`.
-- Ninguna politica puede devolver lo que el motor no concede por columna: es el
-- mismo patron que ya protege `attempt_items.answer_key` (0013) y
-- `students.pin_hash`. El tutor lee «Chrome en Android · Madrid · hace 2 dias»,
-- que es cuanto necesita para reconocer un aparato y revocarlo; la IP no
-- aparece jamas en una respuesta HTTP. Sin esto, un XSS en el panel del tutor
-- exfiltra el historial de ubicacion de un niño.
--
-- Y no hay INSERT para `authenticated`. Un rastro que la propia victima puede
-- fabricar no prueba nada — la misma leccion de 0074 sobre `app.audit()`.
--
-- POR QUE LAS REGLAS DE DETECCION VIVEN EN POSTGRES Y NO EN LA APLICACION
--
-- Los dos que escriben accesos son runtimes distintos: la Edge Function corre
-- en Deno y la web en Node. Una regla escrita dos veces diverge —es
-- exactamente por lo que los parametros de Argon2id ya estan centralizados en
-- este proyecto—, y una regla de deteccion divergente no falla ruidosamente:
-- deja de disparar. Asi que insertar y evaluar son la misma operacion,
-- `app.registrar_acceso()`.
--
-- `p_ip_hash` lo calcula QUIEN LLAMA y no la base: el salt (`CET_IP_HASH_SALT`)
-- vive en el entorno de las funciones, y meterlo en Postgres seria copiarlo a
-- un sitio mas del que puede escaparse.
--
-- Y el envoltorio en `public` porque PostgREST solo sirve `public` y
-- `graphql_public`: desde `app` responde 406/PGRST106. Es el fallo de 0023, de
-- 0063 y de 0077, por cuarta vez; aqui va escrito desde el principio.
--
-- NINGUNA SEÑAL BLOQUEA
--
-- Bloquear por geografia deja a un niño sin deberes porque esta en casa de su
-- abuela o porque su operador movil lo saca por otro pais, y eso pasa muchisimo
-- mas a menudo que un robo de cuenta. El bloqueo real ya existe y esta bien
-- puesto: el lockout por PIN y el rate limit, que miden intentos y no lugares.
-- Ademas `x-forwarded-for` es falsificable: estas señales dicen «esto merece
-- una mirada», nunca «esto fue un ataque».
--
-- APLICARLA DOS VECES NO ROMPE NADA: el tipo se crea bajo guarda, la tabla y
-- los indices con `if not exists`, las columnas con `add column if not exists`,
-- las politicas con `drop policy if exists` delante y las funciones con
-- `create or replace`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · El tipo de acceso
-- -----------------------------------------------------------------------------
-- `create type` no admite `if not exists`, de ahi la guarda. Sin ella, la
-- segunda aplicacion de este fichero muere con 42710 y arrastra consigo, por la
-- transaccion unica de `db-apply`, todo lo demas que si estaba bien.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'acceso_tipo')
  then
    create type public.acceso_tipo as enum (
      'enlace_canjeado', 'login_ok', 'login_fallido', 'dispositivo_olvidado');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2 · La tabla
-- -----------------------------------------------------------------------------
-- `inet` y no `text` a proposito: «¿vino de la misma red?» es `ip << '10.0.0.0/24'`,
-- un operador nativo. Con `text` habria que reimplementarlo a mano, y mal.
--
-- `ip_hash` se conserva PESE a tener la IP en claro: permite comparar sin leer
-- la IP, y es lo unico que sobrevive si algun dia se purga la columna.
--
-- `origen` distingue «no se sabe» de «esa capa no puede saberlo»: la web
-- (Vercel) conoce la geo, la Edge Function no. Sin esta columna, «ciudad NULL»
-- mezcla las dos cosas y la tabla deja de poder interpretarse.
--
-- Sin particionar, al contrario que `learning_events`: aquello crece con cada
-- pulsacion, esto con cada login. Si algun dia pesa, se parte por `created_at`.
create table if not exists public.accesos_de_alumno (
  id              bigint generated always as identity primary key,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  device_id       uuid references public.student_devices (id) on delete set null,
  tipo            public.acceso_tipo not null,
  ip              inet,
  ip_hash         text,
  pais            text,
  region          text,
  ciudad          text,
  agente_familia  text,
  user_agent      text,
  origen          text not null check (origen in ('web', 'edge')),
  senales         text[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index if not exists accesos_alumno_ts_idx
  on public.accesos_de_alumno (student_id, created_at desc);
create index if not exists accesos_ip_idx
  on public.accesos_de_alumno (ip);
create index if not exists accesos_ip_hash_idx
  on public.accesos_de_alumno (ip_hash);

comment on table public.accesos_de_alumno is
  'Desde donde entra un alumno. La tabla mas sensible del sistema: guarda la IP en claro y sin caducidad, por decision explicita del 01/09/2026. `ip`, `ip_hash` y `user_agent` estan fuera del grant de authenticated y solo los ve service_role.';
comment on column public.accesos_de_alumno.origen is
  'Que capa escribio la fila: `web` (Next.js, conoce la geo de Vercel) o `edge` (auth-pin, la recibe por cabecera). Sin esto, ciudad NULL mezcla "no se sabe" con "esa capa no puede saberlo".';
comment on column public.accesos_de_alumno.senales is
  'Resultado de las reglas de deteccion de app.registrar_acceso(). Ninguna bloquea: dicen "esto merece una mirada".';

-- -----------------------------------------------------------------------------
-- 3 · La IP desde la que se GENERO el enlace
-- -----------------------------------------------------------------------------
-- Sin esto, `canje_fuera_de_red` —la señal mas valiosa de toda la tabla— no
-- tiene con que comparar: se sabria desde donde se canjeo el enlace pero no
-- desde donde lo creo el tutor, que es justo la pareja de datos que distingue
-- «el niño abrio el enlace en el movil de casa» de «lo abrio alguien en otra red».
alter table public.student_access_links
  add column if not exists creado_desde_ip      inet;
alter table public.student_access_links
  add column if not exists creado_desde_ip_hash text;

-- Las dos columnas nuevas NO pueden entrar en el alcance de `authenticated`, y
-- aqui hay una trampa que este repositorio ya documento una vez y volveria a
-- pisar: 0057 dio `grant select on public.student_access_links to authenticated`
-- a nivel de TABLA, y un grant de tabla alcanza tambien a las columnas añadidas
-- DESPUES. Un `revoke select (creado_desde_ip) ... from authenticated` no
-- retiraria nada mientras el SELECT de tabla siga puesto — es exactamente lo
-- que denuncia la capa 0 de `rls_answer_key_hidden.sql`, y es tambien por lo
-- que el `revoke select (token_hash)` de 0075 no llego a hacer efecto.
--
-- Asi que se quita el SELECT de tabla y se devuelve por columna. `token_hash`
-- queda fuera de verdad, que es lo que 0075 quiso decir, y las dos columnas
-- nuevas nacen ya fuera del alcance de todo rol salvo `service_role`.
revoke select on public.student_access_links from authenticated;
grant select (id, student_id, created_by, expires_at, revoked_at,
              last_used_at, created_at)
  on public.student_access_links to authenticated;

comment on column public.student_access_links.creado_desde_ip is
  'IP del tutor cuando genero el enlace. Solo service_role. Es el lado izquierdo de la comparacion de canje_fuera_de_red.';

-- =============================================================================
-- 4 · ACCESO — el invariante que sostiene el diseño entero
-- =============================================================================
-- Este bloque es el que hay que leer si algun dia se toca esta tabla.
--
-- `revoke all` primero y grant por COLUMNA despues. Un `revoke select (ip)`
-- sobre un rol que conserva el SELECT de tabla no retira nada —lo documenta
-- `rls_answer_key_hidden.sql`, capa 0—, asi que el orden importa: se quita
-- todo, y se devuelve solo lo que el tutor necesita ver.
revoke all on public.accesos_de_alumno from authenticated, anon;

-- Ni `ip`, ni `ip_hash`, ni `user_agent`. Y ni INSERT, ni UPDATE, ni DELETE.
grant select (id, student_id, device_id, tipo, pais, region, ciudad,
              agente_familia, senales, created_at)
  on public.accesos_de_alumno to authenticated;

-- 0013 hizo `grant all on all tables in schema public to service_role`, pero
-- aquello fue una FOTO: una tabla creada despues no la alcanza. Sin esta linea,
-- la deteccion —que corre con service_role y es la unica que ve la IP— no
-- podria ni leer su propia tabla.
grant all on public.accesos_de_alumno to service_role;

alter table public.accesos_de_alumno enable row level security;

-- El grant por columna decide QUE columnas; la politica decide QUE FILAS. Las
-- dos hacen falta: sin la politica, un tutor veria las ciudades de todos los
-- niños del sistema.
drop policy if exists accesos_select on public.accesos_de_alumno;
create policy accesos_select on public.accesos_de_alumno
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

comment on policy accesos_select on public.accesos_de_alumno is
  'Los cuatro caminos de app.puede_ver_alumno: el propio alumno, su tutor, personal con matricula vigente, superadmin. Nunca devuelve NULL.';

-- =============================================================================
-- 5 · app.registrar_acceso — insertar y evaluar son la misma operacion
-- =============================================================================
-- IPv6, decision que el diseño no fijaba
-- --------------------------------------
-- «La misma red» esta escrito en el diseño como /24, que es una mascara IPv4:
-- `set_masklen(inet, 24)` sobre una direccion IPv6 es legal en Postgres y
-- ademas ABSURDO —recorta 24 de 128 bits y mete a un continente entero en la
-- misma «red», con lo que `canje_fuera_de_red` no dispararia jamas contra un
-- canje por IPv6, que es cada vez mas comun en movil—. Asi que aqui:
--
--     familia 4  ->  /24   (el bloque tipico de un ISP domestico)
--     familia 6  ->  /64   (la subred que un ISP asigna a UNA linea)
--
-- Y si las dos direcciones no son de la misma familia, las redes no coinciden y
-- la señal dispara. Es lo correcto y no un efecto colateral: crear el enlace por
-- IPv4 y canjearlo por IPv6 significa, casi siempre, dos aparatos distintos en
-- dos redes distintas. Merece una mirada, que es todo lo que una señal dice.
create or replace function app.registrar_acceso(
  p_student_id     uuid,
  p_device_id      uuid                default null,
  p_tipo           public.acceso_tipo  default 'login_ok',
  p_ip             inet                default null,
  p_ip_hash        text                default null,
  p_pais           text                default null,
  p_region         text                default null,
  p_ciudad         text                default null,
  p_agente_familia text                default null,
  p_user_agent     text                default null,
  p_origen         text                default 'edge'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id             bigint;
  v_senales        text[] := '{}';
  v_ip_del_enlace  inet;
  v_mascara        integer;
  v_cuentas        integer;
begin
  -- Se inserta PRIMERO y se marcan las señales despues. Asi el historial contra
  -- el que se evalua incluye esta misma fila, que es lo que `ip_multicuenta`
  -- necesita —la cuenta de alumnos distintos por IP tiene que contar tambien al
  -- que acaba de entrar— y lo que las otras tres excluyen a mano por `id`.
  insert into public.accesos_de_alumno (
    student_id, device_id, tipo, ip, ip_hash,
    pais, region, ciudad, agente_familia, user_agent, origen)
  values (
    p_student_id, p_device_id, p_tipo, p_ip, p_ip_hash,
    p_pais, p_region, p_ciudad, p_agente_familia, p_user_agent, p_origen)
  returning id into v_id;

  -- ---------------------------------------------------------------------------
  -- canje_fuera_de_red — el enlace se canjea desde una red distinta a la del
  -- tutor que lo genero. El enlace es un bearer que viaja por chat: canjearlo
  -- desde otra red es la señal mas valiosa de esta tabla.
  -- ---------------------------------------------------------------------------
  if p_tipo = 'enlace_canjeado' and p_ip is not null then
    -- El camino normal: el canje crea el dispositivo y lo enlaza con
    -- `created_from_link`, asi que del dispositivo se llega al enlace.
    select l.creado_desde_ip
      into v_ip_del_enlace
      from public.student_devices d
      join public.student_access_links l on l.id = d.created_from_link
     where d.id = p_device_id;

    -- Sin dispositivo (o sin enlace colgando de el) queda el ultimo enlace
    -- usado de ese alumno. Es una aproximacion, y por eso va segunda: mejor
    -- comparar con el enlace probable que no comparar nada.
    if v_ip_del_enlace is null then
      select l.creado_desde_ip
        into v_ip_del_enlace
        from public.student_access_links l
       where l.student_id = p_student_id
         and l.creado_desde_ip is not null
       order by coalesce(l.last_used_at, l.created_at) desc
       limit 1;
    end if;

    -- Si no se sabe desde donde se genero el enlace no hay comparacion posible,
    -- y «no lo se» tiene que ser silencio, no una señal.
    if v_ip_del_enlace is not null then
      if pg_catalog.family(p_ip) <> pg_catalog.family(v_ip_del_enlace) then
        v_senales := v_senales || 'canje_fuera_de_red';
      else
        v_mascara := case when pg_catalog.family(p_ip) = 4 then 24 else 64 end;
        if pg_catalog.network(pg_catalog.set_masklen(p_ip, v_mascara))
             is distinct from
           pg_catalog.network(pg_catalog.set_masklen(v_ip_del_enlace, v_mascara))
        then
          v_senales := v_senales || 'canje_fuera_de_red';
        end if;
      end if;
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- salto_de_pais — dos accesos del mismo alumno desde paises distintos en
  -- menos de 12 h. Credencial compartida o robada. 12 h absorbe un vuelo y una
  -- VPN torpe.
  -- ---------------------------------------------------------------------------
  if p_pais is not null and exists (
    select 1
      from public.accesos_de_alumno a
     where a.student_id = p_student_id
       and a.id <> v_id
       and a.pais is not null
       and a.pais <> p_pais
       and a.created_at > now() - interval '12 hours')
  then
    v_senales := v_senales || 'salto_de_pais';
  end if;

  -- ---------------------------------------------------------------------------
  -- ip_multicuenta — una IP con accesos de MAS DE 3 alumnos distintos en 24 h.
  -- Hermanos y un aula comparten IP; veinte cuentas, no. El umbral es
  -- estrictamente mayor que 3: tres hermanos en una casa no son una señal.
  -- ---------------------------------------------------------------------------
  if p_ip is not null then
    select count(distinct a.student_id)
      into v_cuentas
      from public.accesos_de_alumno a
     where a.ip = p_ip
       and a.created_at > now() - interval '24 hours';

    if v_cuentas > 3 then
      v_senales := v_senales || 'ip_multicuenta';
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- dispositivo_nuevo — primer acceso registrado de un `device_id`. Ruido cero,
  -- valor alto: es la fila que el tutor mira cuando se pregunta «¿y este
  -- aparato de donde ha salido?».
  -- ---------------------------------------------------------------------------
  if p_device_id is not null and not exists (
    select 1
      from public.accesos_de_alumno a
     where a.device_id = p_device_id
       and a.id <> v_id)
  then
    v_senales := v_senales || 'dispositivo_nuevo';
  end if;

  update public.accesos_de_alumno
     set senales = v_senales
   where id = v_id;

  return v_id;
end;
$$;

comment on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text) is
  'Escribe un acceso y evalua en el mismo paso las cuatro señales. Vive en la base y no en la aplicacion porque quienes escriben son dos runtimes distintos (Deno y Node) y una regla duplicada no falla: deja de disparar.';

-- El ACL por defecto de una funcion en Postgres YA incluye execute para PUBLIC.
-- Sin este revoke, `authenticated` la alcanzaria: un alumno podria fabricarse su
-- propio rastro y —peor— llamarla con el `p_student_id` de otro y ensuciar el
-- historial forense de un compañero.
revoke all on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- 6 · El envoltorio en `public`, sin el cual no lo alcanza nadie
-- -----------------------------------------------------------------------------
-- PostgREST sirve `public` y `graphql_public`. Llamar a `app` con
-- `.schema("app").rpc(...)` responde 406 / PGRST106: es lo que rompio 0023,
-- 0063 y 0077. Aqui va desde el primer dia, y `public_rpc_surface.sql` lo
-- vigila en su assert A1.
--
-- Recibe `p_student_id`, es decir la identidad de otro. Eso es exactamente lo
-- que el assert A2 de ese mismo fichero prohibe para `authenticated` — y por
-- eso este envoltorio es SOLO de `service_role`, como los de las Edge Functions
-- de 0014 y 0019: aceptan un actor porque corren SIN sesion.
create or replace function public.registrar_acceso(
  p_student_id     uuid,
  p_device_id      uuid                default null,
  p_tipo           public.acceso_tipo  default 'login_ok',
  p_ip             inet                default null,
  p_ip_hash        text                default null,
  p_pais           text                default null,
  p_region         text                default null,
  p_ciudad         text                default null,
  p_agente_familia text                default null,
  p_user_agent     text                default null,
  p_origen         text                default 'edge'
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select app.registrar_acceso(
    p_student_id, p_device_id, p_tipo, p_ip, p_ip_hash,
    p_pais, p_region, p_ciudad, p_agente_familia, p_user_agent, p_origen);
$$;

comment on function public.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text) is
  'Envoltorio de app.registrar_acceso() para que PostgREST lo alcance. Solo service_role: acepta el alumno como argumento, y eso solo es fiable sin sesion.';

revoke all on function public.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text)
  to service_role;
