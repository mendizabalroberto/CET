-- =============================================================================
-- 0018_public_school_list.sql — lista de colegios para la pantalla de login
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- EL PROBLEMA
-- El selector de colegio se dibuja ANTES de que exista sesión, así que lo
-- consulta el rol `anon`. Pero `0013_grants.sql` no concede nada a `anon`, y con
-- razón: dar SELECT sobre `schools` permitiría enumerar la lista completa de
-- colegios de la plataforma, que es información comercial.
--
-- Las vías A y E documentaron contratos mutuamente contradictorios sobre esto y
-- ninguna implementó el de la otra. Resultado: `permission denied for table
-- schools`, el desplegable salía vacío y NINGÚN alumno podía entrar. Lo detectó
-- la primera ejecución de los e2e.
--
-- LA SOLUCIÓN
-- Ni abrir la tabla ni dejar el login roto: una función `security definer` que
-- devuelve EXACTAMENTE las cuatro columnas que el selector necesita, solo de los
-- colegios activos. La tabla sigue cerrada a `anon`; se expone una proyección,
-- no un permiso. `settings` no sale de aquí bajo ningún concepto.
-- =============================================================================

create or replace function public.list_active_schools()
returns table (
  id                   uuid,
  name                 text,
  pin_length_primary   smallint,
  pin_length_secondary smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.pin_length_primary, s.pin_length_secondary
  from public.schools s
  where s.status = 'active'
  order by s.name;
$$;

comment on function public.list_active_schools() is
  'Proyección mínima de colegios activos para el selector de login. La tabla sigue '
  'cerrada a anon; esto expone cuatro columnas, no un permiso. Nunca devuelve settings.';

revoke all on function public.list_active_schools() from public;
grant execute on function public.list_active_schools() to anon, authenticated, service_role;
