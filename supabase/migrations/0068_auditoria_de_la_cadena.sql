-- =============================================================================
-- 0068_auditoria_de_la_cadena.sql — el tutor y el alumno dejan rastro
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- `0067` abrió `app.audit()` al tutor. No bastaba: la web no llama a `app.audit`
-- —vive en el esquema `app`, que PostgREST no expone y no debe exponer— sino a
-- su envoltorio público `public.audit_staff_action` (0023), y ese cierra la
-- puerta DOS VECES antes de llegar a la de dentro:
--
--   1. `if not (app.is_staff() or app.is_superadmin())` → un tutor no pasa.
--   2. una lista blanca de `p_action` que no conoce ninguna acción de la cadena
--      de invitación → `invalid_parameter_value`.
--
-- Sin esta migración, las cuatro escrituras de auditoría de `lib/tutor` fallan.
-- Y fallan en silencio para el usuario, porque una auditoría que revienta no
-- puede tumbar el alta de un niño: quedarían actos sobre datos de un menor sin
-- constancia, que es exactamente lo que `modules/admin` §1 prohíbe.
--
-- POR QUÉ UN VOCABULARIO POR ROL Y NO UNA LISTA MÁS LARGA
-- ---------------------------------------------------------------------------
-- Añadir las acciones nuevas a la lista común y dejar entrar al tutor sería
-- darle también `attempt.regraded` y `registration.approved`. El envoltorio no
-- es solo un validador de vocabulario: es la puerta, y una puerta que distingue
-- QUIÉN llama tiene que distinguir también QUÉ puede decir cada quien.
--
-- El alumno entra aquí por un único motivo y con una única acción: el canje de
-- su enlace lo audita su propia sesión recién abierta, porque el actor de ese
-- hecho es él. La alternativa —auditarlo con `service_role`— escribiría el
-- registro con `actor_id` nulo, y un registro forense sin actor vale la mitad.
-- =============================================================================

create or replace function public.audit_staff_action(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid  default null,
  p_before      jsonb default null,
  p_after       jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  bigint;
  v_rol public.user_role := app.current_role();

  -- El vocabulario del personal: el de 0023, más la emisión de una invitación
  -- de tutor, que es la creación de una credencial de un adulto y por tanto un
  -- hecho que tiene que constar.
  v_de_personal constant text[] := array[
    'attempt.answer_key_viewed',
    'attempt.answer_key_denied',
    'attempt.graded_manually',
    'attempt.regraded',
    'student.created',
    'student.unlocked',
    'registration.approved',
    'registration.rejected',
    'tutor.invitado'
  ];

  -- El vocabulario del tutor. Los tres actos que puede cometer sobre un menor:
  -- crearlo, emitirle una credencial y retirarle un dispositivo.
  v_de_tutor constant text[] := array[
    'tutor.hijo_creado',
    'tutor.enlace_generado',
    'tutor.dispositivo_olvidado'
  ];

  -- El del alumno. Uno solo, y sobre sí mismo.
  v_de_alumno constant text[] := array[
    'alumno.enlace_canjeado'
  ];

  v_permitidas text[];
begin
  -- Guarda explícita, además de la que ya tiene `app.audit()`. Se repite a
  -- propósito: este envoltorio es una puerta a una tabla forense, y una puerta
  -- se cierra por sí misma en vez de confiar en que la de dentro siga cerrada
  -- mañana.
  --
  -- `app.current_role()` resuelve contra el perfil ACTIVO de `auth.uid()`, así
  -- que una sesión sin JWT (service_role, una conexión directa) devuelve NULL y
  -- no casa con ninguna rama: para eso están los envoltorios de 0014 y 0019.
  if app.is_staff() or app.is_superadmin() then
    v_permitidas := v_de_personal;
  elsif v_rol = 'guardian' then
    v_permitidas := v_de_tutor;
  elsif v_rol = 'student' then
    v_permitidas := v_de_alumno;
  else
    raise exception 'Solo el personal, el tutor y el alumno escriben en el audit_log'
      using errcode = 'insufficient_privilege';
  end if;

  if not (p_action = any (v_permitidas)) then
    raise exception 'audit_staff_action: accion % no permitida para el rol %', p_action, v_rol
      using errcode = 'invalid_parameter_value',
            hint    = 'El vocabulario del audit_log se amplia con una migracion, no desde el cliente';
  end if;

  -- quote_ident evita que un `p_entity_type` con comillas resuelva a otra cosa.
  -- El identificador no se ejecuta: to_regclass solo RESUELVE un nombre.
  if pg_catalog.to_regclass('public.' || pg_catalog.quote_ident(p_entity_type)) is null then
    raise exception 'audit_staff_action: entity_type % no es una tabla de public', p_entity_type
      using errcode = 'invalid_parameter_value';
  end if;

  -- La identidad la pone `app.audit()` desde la sesión. Este envoltorio no
  -- tiene forma de decir quién es el actor ni siquiera queriendo: no recibe
  -- ese dato.
  v_id := app.audit(p_action, p_entity_type, p_entity_id, p_before, p_after);
  return v_id;
end;
$$;

comment on function public.audit_staff_action(text, text, uuid, jsonb, jsonb) is
  'Envoltorio publico de app.audit(). Vocabulario POR ROL: el personal, el tutor sobre sus hijos, y el alumno solo para el canje de su enlace. El actor lo deriva el servidor de la sesion.';

revoke all on function public.audit_staff_action(text, text, uuid, jsonb, jsonb) from public;
grant execute on function public.audit_staff_action(text, text, uuid, jsonb, jsonb)
  to authenticated;
