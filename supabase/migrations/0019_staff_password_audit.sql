-- =============================================================================
-- 0019_staff_password_audit.sql — auditoría del cambio de contraseña de staff
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Gemelo de `audit_student_pin_reset`: la Edge Function `staff-password` corre
-- con service_role y necesita dejar rastro, pero `app.audit()` vive en el
-- esquema `app`, que PostgREST no expone.
--
-- Nunca registra la contraseña, ni la vieja ni la nueva, ni su hash: un
-- audit_log con credenciales dentro es una fuga de datos con formato de tabla.
-- =============================================================================

create or replace function public.audit_staff_password_change(
  p_actor_id  uuid,
  p_school_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   bigint;
  v_role public.user_role;
begin
  -- El rol se lee de la base de datos, no se recibe: congelarlo aquí es lo que
  -- hace que el registro siga siendo cierto si mañana le cambian el rol.
  select p.role into v_role from public.profiles p where p.id = p_actor_id;

  if v_role is null then
    raise exception 'audit_staff_password_change: el actor % no tiene perfil', p_actor_id
      using errcode = 'foreign_key_violation';
  end if;

  insert into public.audit_log (
    school_id, actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_school_id, p_actor_id, v_role, 'staff.password_changed', 'profiles', p_actor_id,
    jsonb_build_object('must_change_password', false)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.audit_staff_password_change(uuid, uuid) is
  'Rastro del cambio de contraseña de personal. Solo service_role. Nunca registra la credencial.';

revoke all on function public.audit_staff_password_change(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.audit_staff_password_change(uuid, uuid) to service_role;
