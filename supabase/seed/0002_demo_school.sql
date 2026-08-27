-- =============================================================================
-- 0002_demo_school.sql — colegio de demostración
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Colegio con el que se prueba el vertical completo del Hito 2. Idempotente por
-- `slug`, que es la clave natural: reejecutar el seed actualiza, no duplica.
--
-- El id es FIJO y no aleatorio para que los seeds siguientes (curso Math Y6,
-- alumnos de prueba) puedan referenciarlo sin depender del orden de ejecución ni
-- de una variable de sesión.
-- =============================================================================

insert into public.schools (
  id, name, slug, country, timezone, default_locale,
  pin_length_primary, pin_length_secondary, settings, status
)
values (
  '00000000-0000-4000-8000-000000000001',
  'Cambridge Demo School',
  'demo',
  'ES',
  -- Las ventanas de examen se PRESENTAN en esta zona; se almacenan en UTC.
  -- Elegir una zona con horario de verano (no UTC) es deliberado: obliga a que
  -- las pruebas de ventanas temporales pasen por el caso real, no por el fácil.
  'Europe/Madrid',
  'en',
  4,   -- AD-4: primaria, PIN de 4 dígitos
  6,   -- AD-4: secundaria, PIN de 6 dígitos
  jsonb_build_object(
    'allowSelfRegistration', true,
    'defaultExamFeedback',   'after_submit',
    'pinLockoutThreshold',   5,
    'pinLockoutMinutes',     15
  ),
  'active'
)
on conflict (slug) do update
  set name                 = excluded.name,
      country              = excluded.country,
      timezone             = excluded.timezone,
      default_locale       = excluded.default_locale,
      pin_length_primary   = excluded.pin_length_primary,
      pin_length_secondary = excluded.pin_length_secondary,
      settings             = excluded.settings,
      status               = excluded.status;


-- -----------------------------------------------------------------------------
-- Clase Y6A — la clase real de la que salió el material de Y6A/
-- -----------------------------------------------------------------------------
insert into public.sections (id, school_id, name, year_level, academic_year)
values (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-000000000001',
  'Y6A',
  6,
  '2026-2027'
)
on conflict (school_id, academic_year, name) do update
  set year_level = excluded.year_level;
