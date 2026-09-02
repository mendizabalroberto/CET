-- =============================================================================
-- 0089_la_geo_completa_llega_a_la_rpc.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- 0088 ABRIO TRES COLUMNAS QUE NADIE PODIA ESCRIBIR
--
-- `latitud`, `longitud` y `zona_horaria` existen en `accesos_de_alumno` desde
-- 0088, con su grant por columna decidido y comentado. Pero el UNICO camino que
-- escribe en esa tabla es `app.registrar_acceso()`, y esa funcion nacio en 0078
-- con once parametros: los tres nuevos no tenian por donde entrar. El resultado
-- era una migracion que parecia hecha y en la practica solo dejaba tres
-- columnas a NULL en cada fila nueva.
--
-- Esto no se arregla con un INSERT desde la aplicacion. Insertar y evaluar las
-- señales son la MISMA operacion dentro de Postgres a proposito (0078, §5): los
-- dos que escriben accesos son runtimes distintos —Node en Vercel y Deno en
-- `auth-pin`— y una regla de deteccion implementada dos veces no falla
-- ruidosamente, deja de disparar. Asi que la puerta se ensancha; no se abre una
-- segunda.
--
-- POR QUE SE DEJA CAER LA FIRMA VIEJA EN VEZ DE SOBRECARGARLA
--
-- `create or replace function` NO cambia la firma: crearia una funcion NUEVA de
-- catorce parametros al lado de la de once, y las dos convivirian. Con dos
-- firmas vivas, un llamante que se quedara en la vieja seguiria funcionando
-- —escribiendo NULL en las tres columnas— sin que nada avisara jamas. Es el
-- mismo razonamiento con el que 0084 dejo caer `app.minutos_de_sesion` de tres
-- argumentos: el `drop` es lo que obliga a que todos los llamantes se
-- actualicen, y lo que convierte un fallo silencioso en un error inmediato.
--
-- Y el orden del `drop` importa: `public.registrar_acceso` es un envoltorio que
-- llama a `app.registrar_acceso`, asi que se deja caer primero el envoltorio.
-- Al reves, Postgres no se queja —una funcion no depende de otra en el catalogo
-- como depende una vista de una tabla— pero el envoltorio quedaria unos
-- milisegundos apuntando a algo que ya no existe, y dentro de la transaccion
-- unica de `db-apply` eso no lo ve nadie. Se hace en el orden legible.
--
-- LOS TRES PARAMETROS VAN AL FINAL, Y CON DEFAULT
--
-- Añadirlos en medio —junto a `p_pais`, donde conceptualmente les tocaria—
-- rompe a cualquier llamante POSICIONAL sin que el compilador de nadie lo note:
-- `supabase-js` llama por nombre, pero `supabase/tests/accesos_de_alumno.sql`
-- llama con once argumentos posicionales, y ese es exactamente el tipo de
-- llamante que se estropea en silencio. Al final y con `default null`, las once
-- posiciones de siempre siguen significando lo mismo.
--
-- QUE NO CAMBIA AQUI
--
-- Ni una señal. `salto_de_pais` sigue comparando codigos de pais y NO
-- distancias, aunque 0088 explique por que las coordenadas permitirian medirlas:
-- esta migracion existe para que el dato se guarde, y cambiar a la vez lo que
-- se guarda y lo que se decide con ello significa no poder saber cual de las dos
-- cosas rompio la deteccion. Primero se recoge; medir es otro dia.
--
-- Tampoco cambia el grant por columna de la tabla: 0088 lo dejo decidido y esta
-- migracion no lo toca ni para reponerlo. `latitud` y `longitud` siguen fuera
-- del alcance de `authenticated` —parecen mas precisas de lo que son— y
-- `zona_horaria` sigue dentro.
--
-- APLICARLA DOS VECES NO ROMPE NADA: los `drop` llevan `if exists` y las
-- creaciones son `create or replace` sobre la firma nueva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Fuera las firmas de once parametros
-- -----------------------------------------------------------------------------
drop function if exists public.registrar_acceso(
  uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text);
drop function if exists app.registrar_acceso(
  uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text);

-- -----------------------------------------------------------------------------
-- 2 · app.registrar_acceso — el mismo cuerpo de 0078, con tres columnas mas
-- -----------------------------------------------------------------------------
-- El cuerpo se reproduce ENTERO y no se «parchea»: una funcion no se edita en
-- Postgres, se sustituye. Las cuatro reglas de deteccion, sus umbrales y sus
-- comentarios son literalmente los de 0078 salvo el INSERT, que es lo unico que
-- esta migracion cambia. Quien compare los dos ficheros debe encontrar
-- exactamente esa diferencia y ninguna otra.
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
  p_origen         text                default 'edge',
  p_latitud        numeric             default null,
  p_longitud       numeric             default null,
  p_zona_horaria   text                default null
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
  --
  -- Las coordenadas NO se validan aqui. Vienen del borde de Vercel y quien las
  -- reenvia ya las ha acotado a ±90 / ±180 antes de llamar: repetir la
  -- comprobacion en plpgsql significaria decidir que hacer con una fuera de
  -- rango, y la unica respuesta razonable —guardar NULL— es la que la capa de
  -- arriba ya produce. Un `check` en la columna, en cambio, tumbaria el registro
  -- entero del acceso por un dato decorativo, que es justo lo que 0078 prohibe.
  insert into public.accesos_de_alumno (
    student_id, device_id, tipo, ip, ip_hash,
    pais, region, ciudad, agente_familia, user_agent, origen,
    latitud, longitud, zona_horaria)
  values (
    p_student_id, p_device_id, p_tipo, p_ip, p_ip_hash,
    p_pais, p_region, p_ciudad, p_agente_familia, p_user_agent, p_origen,
    p_latitud, p_longitud, p_zona_horaria)
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

comment on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text) is
  'Escribe un acceso y evalua en el mismo paso las cuatro señales. Vive en la base y no en la aplicacion porque quienes escriben son dos runtimes distintos (Deno y Node) y una regla duplicada no falla: deja de disparar. Desde 0089 recibe tambien latitud, longitud y zona horaria.';

-- El ACL por defecto de una funcion en Postgres YA incluye execute para PUBLIC,
-- y una funcion RECIEN CREADA nace con ese ACL otra vez: el `revoke` de 0078
-- murio con la firma que se acaba de dejar caer. Sin estas dos lineas,
-- `authenticated` alcanzaria la funcion nueva y un alumno podria fabricarse su
-- propio rastro —o, peor, llamarla con el `p_student_id` de otro—.
revoke all on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- 3 · El envoltorio en `public`, sin el cual no lo alcanza nadie
-- -----------------------------------------------------------------------------
-- PostgREST sirve `public` y `graphql_public`. Llamar a `app` con
-- `.schema("app").rpc(...)` responde 406 / PGRST106: es lo que rompio 0023,
-- 0063 y 0077, y lo que vigila el assert A1 de `public_rpc_surface.sql`.
--
-- Solo `service_role`, como en 0078: recibe `p_student_id`, es decir la
-- identidad de OTRO, y eso solo es fiable en una capa que corre sin sesion.
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
  p_origen         text                default 'edge',
  p_latitud        numeric             default null,
  p_longitud       numeric             default null,
  p_zona_horaria   text                default null
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select app.registrar_acceso(
    p_student_id, p_device_id, p_tipo, p_ip, p_ip_hash,
    p_pais, p_region, p_ciudad, p_agente_familia, p_user_agent, p_origen,
    p_latitud, p_longitud, p_zona_horaria);
$$;

comment on function public.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text) is
  'Envoltorio de app.registrar_acceso() para que PostgREST lo alcance. Solo service_role: acepta el alumno como argumento, y eso solo es fiable sin sesion.';

revoke all on function public.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text)
  to service_role;
