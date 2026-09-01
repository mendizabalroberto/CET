-- =============================================================================
-- 0079_senales_que_no_llegaban_a_escribirse.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- 0078 SE APLICO EN PRODUCCION CON UNA FUNCION QUE LANZABA EN TODAS SUS RAMAS
--
-- `app.registrar_acceso()` acumulaba las señales asi:
--
--     v_senales := v_senales || 'canje_fuera_de_red';
--
-- `v_senales` es `text[]` y el literal es de tipo UNKNOWN. Postgres, ante un
-- literal sin tipo, lo resuelve al tipo del OTRO operando, asi que de los tres
-- candidatos de `||` —`anyarray||anyarray`, `anyarray||anyelement`,
-- `anyelement||anyarray`— elige el primero e intenta leer
-- `canje_fuera_de_red` como si fuera un literal de array. Resultado:
--
--     ERROR: malformed array literal: "canje_fuera_de_red"
--
-- No es un fallo de una rama rara: es la unica forma que tenia la funcion de
-- terminar cuando alguna señal disparaba. Lo canto el primer assert del grupo D
-- de `supabase/tests/accesos_de_alumno.sql`, que es exactamente para lo que
-- estaba escrito.
--
-- POR QUE ESTO HABRIA SIDO UN FALLO MUDO, Y NO UNA ALARMA
--
-- §5 del diseño exige que ninguna escritura de acceso pueda tumbar un login:
-- quien llama captura la excepcion y grita en `console.error`, igual que
-- `auditar()`. Con esa regla puesta —y es la regla correcta—, esta excepcion no
-- habria roto nada visible: los niños seguirian entrando, el canje seguiria
-- funcionando, y `accesos_de_alumno` se habria quedado VACIA para siempre. La
-- misma clase de fallo que 0077: una tuberia que nadie ve rota porque el
-- producto sigue de pie. Ahi esta el valor de tener el pgTAP escrito a la vez
-- que la migracion y no despues.
--
-- POR QUE UN FICHERO NUEVO Y NO UNA CORRECCION EN 0078
--
-- `db-apply.mjs` se niega a reaplicar un fichero cuyo contenido cambio despues
-- de aplicarse —el esquema real dejaria de corresponderse con el repositorio— y
-- ofrece dos salidas. La que toca aqui es la primera, literalmente: «escribe una
-- migracion NUEVA con la diferencia y deja el fichero viejo como estaba». 0078
-- queda intacto, con su bug y su fecha, y esta es la diferencia.
--
-- EL ARREGLO
--
-- `::text` explicito en los cuatro appends. Deja de haber literal UNKNOWN, y con
-- ello deja de haber resolucion de operador que adivinar: `text[] || text` solo
-- casa con `anyarray || anyelement`. Todo lo demas —firma, permisos, umbrales,
-- la decision de /24 para IPv4 y /64 para IPv6— es identico a 0078.
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
  --
  -- IPv6: «la misma red» esta escrito en el diseño como /24, que es una mascara
  -- IPv4. `set_masklen(inet, 24)` sobre una direccion IPv6 es legal y ademas
  -- absurdo —recorta 24 de 128 bits y mete a un continente entero en la misma
  -- «red», con lo que la señal no dispararia jamas contra un canje por IPv6, que
  -- en movil ya es lo normal—. Por eso: familia 4 -> /24 (el bloque tipico de un
  -- ISP domestico), familia 6 -> /64 (la subred que un ISP asigna a UNA linea).
  -- Y si las dos direcciones no son de la misma familia, la señal dispara: crear
  -- el enlace por IPv4 y canjearlo por IPv6 significa, casi siempre, dos
  -- aparatos en dos redes. Merece una mirada, que es todo lo que una señal dice.
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

comment on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text) is
  'Escribe un acceso y evalua en el mismo paso las cuatro señales. Vive en la base y no en la aplicacion porque quienes escriben son dos runtimes distintos (Deno y Node) y una regla duplicada no falla: deja de disparar.';

-- `create or replace function` NO toca el ACL de una funcion que ya existe, asi
-- que estas dos lineas son redundantes hoy. Van igualmente: el dia que alguien
-- copie este fichero como plantilla, o que un `drop`+`create` se cuele en medio,
-- el ACL por defecto de Postgres —que YA incluye execute para PUBLIC— dejaria la
-- funcion abierta a `authenticated`, y con ella la capacidad de que un alumno
-- fabrique el rastro forense de otro.
revoke all on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function app.registrar_acceso(uuid, uuid, public.acceso_tipo, inet, text, text, text, text, text, text, text)
  to service_role;
