-- =============================================================================
-- 0090_el_cast_que_0089_se_dejo_por_el_camino.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- 0089 REINTRODUJO, LETRA POR LETRA, EL FALLO QUE 0079 HABIA ARREGLADO
--
-- 0089 amplio la firma de `app.registrar_acceso()` a catorce parametros, y para
-- ello reprodujo el cuerpo entero de la funcion —una funcion no se edita en
-- Postgres, se sustituye—. Lo copio de 0078. Y 0078 es justamente la version
-- que 0079 tuvo que corregir:
--
--     v_senales := v_senales || 'canje_fuera_de_red';
--
-- `v_senales` es `text[]` y ese literal es de tipo UNKNOWN. Postgres lo resuelve
-- al tipo del otro operando, elige `anyarray || anyarray` e intenta leer
-- `canje_fuera_de_red` como si fuera un literal de array:
--
--     ERROR: malformed array literal: "canje_fuera_de_red"
--
-- No es una rama rara: es la unica forma que tiene la funcion de terminar cuando
-- alguna señal dispara. Y habria sido un fallo MUDO otra vez, por la misma razon
-- que en 0079: quien llama captura la excepcion y solo grita en `console.error`
-- —regla de 0078, y es la regla correcta: ningun rastro puede tumbar un login—,
-- asi que los niños seguirian entrando, los canjes funcionando, y
-- `accesos_de_alumno` se habria quedado sin una sola fila con señales.
--
-- LO QUE ESTO ENSEÑA, Y NO ES «acuerdate del cast»
--
-- Que reproducir un cuerpo de funcion desde la migracion que lo CREO, en vez de
-- desde la ultima que lo TOCO, es como se desandan las correcciones intermedias.
-- 0078 crea, 0079 corrige, 0089 amplia copiando de 0078 y devuelve el bug a la
-- base. El fichero del que hay que partir es siempre el ultimo, y por eso este
-- parrafo esta aqui: la proxima vez que haya que ensanchar esta firma, se parte
-- de 0090.
--
-- Lo canto el primer assert del grupo D de `supabase/tests/accesos_de_alumno.sql`
-- —el mismo que lo canto en 0079—, que es exactamente para lo que se escribio.
--
-- POR QUE UN FICHERO NUEVO Y NO UNA CORRECCION EN 0089
--
-- Porque 0089 ya se aplico. `db-apply.mjs` se niega a reaplicar un fichero cuyo
-- contenido cambio despues de aplicarse, y de sus dos salidas la que toca es la
-- primera, literalmente: «escribe una migracion NUEVA con la diferencia y deja
-- el fichero viejo como estaba». Es la misma decision que tomo 0079 con 0078.
--
-- EL ARREGLO
--
-- `::text` explicito en los cinco appends. Deja de haber literal UNKNOWN y con
-- ello resolucion de operador que adivinar: `text[] || text` solo casa con
-- `anyarray || anyelement`. Todo lo demas —la firma de catorce parametros, los
-- permisos, los umbrales, el INSERT con latitud/longitud/zona_horaria— es
-- identico a 0089. El envoltorio `public.registrar_acceso` no se toca: es
-- `language sql`, no tiene ni un literal de estos, y 0089 lo dejo correcto.
-- =============================================================================

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
        v_senales := v_senales || 'canje_fuera_de_red'::text;
      else
        v_mascara := case when pg_catalog.family(p_ip) = 4 then 24 else 64 end;
        if pg_catalog.network(pg_catalog.set_masklen(p_ip, v_mascara))
             is distinct from
           pg_catalog.network(pg_catalog.set_masklen(v_ip_del_enlace, v_mascara))
        then
          v_senales := v_senales || 'canje_fuera_de_red'::text;
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
    v_senales := v_senales || 'salto_de_pais'::text;
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
      v_senales := v_senales || 'ip_multicuenta'::text;
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
    v_senales := v_senales || 'dispositivo_nuevo'::text;
  end if;

  update public.accesos_de_alumno
     set senales = v_senales
   where id = v_id;

  return v_id;
end;
$$;

comment on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text) is
  'Escribe un acceso y evalua en el mismo paso las cuatro señales. Vive en la base y no en la aplicacion porque quienes escriben son dos runtimes distintos (Deno y Node) y una regla duplicada no falla: deja de disparar. Desde 0089 recibe tambien latitud, longitud y zona horaria; 0090 le devolvio los casts de 0079.';

-- `create or replace function` NO toca el ACL de una funcion que ya existe, asi
-- que estas dos lineas son redundantes hoy —0089 dejo el ACL bien puesto—. Van
-- igualmente, por el mismo motivo que las escribio 0079: el dia que un
-- `drop`+`create` se cuele en medio, el ACL por defecto de Postgres —que YA
-- incluye execute para PUBLIC— dejaria la funcion abierta a `authenticated`, y
-- con ella la capacidad de que un alumno fabrique el rastro forense de otro.
revoke all on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text, numeric, numeric, text)
  to service_role;
