-- =============================================================================
-- 0058_puede_ver_alumno.sql — el eje nuevo de autorizacion sobre datos de alumno
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Sustituye al patron `school_id = app.current_school_id()` en TODA tabla de
-- datos de alumno. Cuatro caminos, y solo cuatro. El coalesce(..., false) del
-- final no es cosmetico: 0025 documenta, con evidencia reproducida contra
-- produccion, que `school_id = NULL` no es FALSE sino NULL, y que una politica
-- que devuelve NULL no deja pasar sin decir por que. Doce politicas se
-- comportaron asi en silencio. Aqui esa clase de bug se elimina de raiz.
create or replace function app.puede_ver_alumno(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    -- 1. es el propio alumno
    auth.uid() = p_student_id
    -- 2. es su tutor, con vinculo sin revocar
    or exists (
      select 1 from public.guardian_students gs
      where gs.guardian_id = auth.uid()
        and gs.student_id = p_student_id
        and gs.revoked_at is null)
    -- 3. es personal de un colegio con matricula VIGENTE de ese alumno
    or (app.is_staff() and exists (
      select 1 from public.student_school_memberships m
      where m.student_id = p_student_id
        and m.school_id = app.current_school_id()
        and m.status = 'activa'
        and m.starts_on <= current_date
        and (m.ends_on is null or m.ends_on > current_date)))
    -- 4. superadmin
    or app.is_superadmin(),
    false);
$$;

comment on function app.puede_ver_alumno(uuid) is
  'Cuatro caminos: el propio alumno, su tutor, personal con matricula vigente, superadmin. Nunca devuelve NULL.';

revoke all on function app.puede_ver_alumno(uuid) from public;
grant execute on function app.puede_ver_alumno(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- puede_ver_informe (0053) deja de comparar colegios a mano
-- -----------------------------------------------------------------------------
drop function if exists app.puede_ver_informe(uuid);

create or replace function app.puede_ver_informe(p_student_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.puede_ver_alumno(p_student_id) then
    raise exception 'No tienes permiso para ver el informe de este alumno'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

revoke all on function app.puede_ver_informe(uuid) from public;
grant execute on function app.puede_ver_informe(uuid) to authenticated, service_role;
