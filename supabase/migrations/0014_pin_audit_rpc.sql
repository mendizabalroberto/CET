-- =============================================================================
-- 0014_pin_audit_rpc.sql — envoltorio auditable para la gestión de PIN
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- `app.audit()` vive en el esquema `app`, que NO está expuesto por PostgREST
-- (y no debe estarlo: es la superficie privada del servidor). La Edge Function
-- `student-pin` necesita dejar rastro de una regeneración de PIN, así que se le
-- da un envoltorio mínimo en `public`, restringido a `service_role`.
--
-- El envoltorio NO acepta un `action` arbitrario del llamante: solo las dos
-- operaciones que la función puede hacer. Si aceptara texto libre, cualquiera
-- con service_role podría escribir entradas de auditoría con nombres falsos y
-- ensuciar la única prueba de lo que hace el personal.
-- =============================================================================

create or replace function public.audit_student_pin_reset(
  p_student_id uuid,
  p_actor_id   uuid,
  p_school_id  uuid,
  p_op         text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     bigint;
  v_action text;
  v_role   public.user_role;
begin
  if p_op not in ('reset', 'provision') then
    raise exception 'audit_student_pin_reset: operación no permitida (%)', p_op
      using errcode = 'invalid_parameter_value';
  end if;

  v_action := 'student.pin_' || p_op;

  -- El rol del actor se lee de la base de datos, no se recibe: congelarlo aquí
  -- es lo que hace que el registro siga siendo cierto si mañana le degradan.
  select p.role into v_role from public.profiles p where p.id = p_actor_id;

  insert into public.audit_log (
    school_id, actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_school_id, p_actor_id, v_role, v_action, 'students', p_student_id,
    -- NUNCA el PIN ni su hash: un audit_log con credenciales dentro es una fuga
    -- de datos con formato de tabla. Solo el hecho de que ocurrió.
    jsonb_build_object('pin_regenerated', true, 'pin_must_change', true)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.audit_student_pin_reset(uuid, uuid, uuid, text) is
  'Envoltorio auditable para student-pin. Solo service_role. Nunca registra el PIN ni su hash.';

revoke all on function public.audit_student_pin_reset(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.audit_student_pin_reset(uuid, uuid, uuid, text) to service_role;

do $$
declare v_missing text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_missing
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'public')
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
    );
  if v_missing is not null then
    raise exception 'Funciones security definer SIN search_path: %', v_missing;
  end if;
end;
$$;
