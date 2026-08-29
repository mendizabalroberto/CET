-- =============================================================================
-- 0074_audit_sin_comodin_de_entidad.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- AGUJERO INTRODUCIDO POR 0067, CERRADO AQUI.
--
-- El guard que 0067 escribio para abrirle `app.audit()` al tutor decia, en sus
-- dos ramas nuevas:
--
--     (p_entity_id is null or p_entity_id = auth.uid() or puede_ver_alumno(...))
--
-- Ese `p_entity_id is null` era un comodin. `app.audit()` acepta `p_action` como
-- TEXTO LIBRE -la lista blanca vive en el envoltorio publico, no aqui- y
-- `authenticated` tiene EXECUTE sobre ella desde 0011. Con el comodin, cualquier
-- alumno podia llamarla directamente y escribir lo que quisiera en el log
-- forense mientras dejara la entidad a nulo:
--
--     select app.audit('exam.tampered', 'exam_attempts', null, null, '{"nota":10}');
--
-- Un log en el que cualquiera puede escribir no prueba nada, que es exactamente
-- lo que 0022 vino a arreglar y lo que `rls_student_cannot_read_peers.sql`
-- vigila en su assert 20. Ese assert es quien lo ha cazado.
--
-- El comodin no hacia falta para nada: las cuatro auditorias de la cadena de
-- invitacion apuntan a una PERSONA -el hijo, o el propio alumno- y no a nulo.
-- La unica que apuntaba a otra cosa era `tutor.dispositivo_olvidado`, que usaba
-- el id del dispositivo; se cambia para que apunte al alumno y lleve el
-- dispositivo en el payload, que ademas es mejor pista forense: un id de
-- entidad que apunta a la persona vale mas que uno que apunta al aparato.
-- =============================================================================

create or replace function app.audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid    default null,
  p_before      jsonb   default null,
  p_after       jsonb   default null,
  p_ip_hash     text    default null,
  p_user_agent  text    default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  -- Tres puertas, y ninguna con comodin:
  --   · personal y superadmin, como siempre;
  --   · el tutor, SOLO sobre si mismo o sobre un hijo suyo;
  --   · el alumno, SOLO sobre si mismo.
  -- `p_entity_id` nulo ya no pasa por las dos ultimas: sin entidad no hay a
  -- quien comprobar, y «no puedo comprobarlo» tiene que ser «no» y no «adelante».
  if app.is_app_user()
     and not (app.is_staff() or app.is_superadmin())
     and not (
       app.current_role() = 'guardian'
       and p_entity_id is not null
       and (p_entity_id = auth.uid() or app.puede_ver_alumno(p_entity_id))
     )
     and not (
       app.current_role() = 'student'
       and p_entity_id is not null
       and p_entity_id = auth.uid()
     ) then
    raise exception 'Solo el personal, el tutor sobre los suyos y el alumno sobre si mismo escriben en el audit_log'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.audit_log (
    school_id, actor_id, actor_role, action, entity_type, entity_id,
    before, after, ip_hash, user_agent
  )
  values (
    app.current_school_id(),
    auth.uid(),
    app.current_role(),
    p_action, p_entity_type, p_entity_id,
    p_before, p_after, p_ip_hash, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;
