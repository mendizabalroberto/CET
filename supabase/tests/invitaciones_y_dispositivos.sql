-- invitaciones_y_dispositivos.sql — pgTAP de 0064
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
begin;
select plan(8);

select has_table('public', 'guardian_invites', 'existe la invitacion de tutor');
select has_table('public', 'student_devices',  'existe el dispositivo casado');

select is(
  (select relrowsecurity from pg_class where oid = 'public.guardian_invites'::regclass),
  true, 'guardian_invites tiene RLS habilitada');
select is(
  (select relrowsecurity from pg_class where oid = 'public.student_devices'::regclass),
  true, 'student_devices tiene RLS habilitada');

select col_is_unique('public', 'guardian_invites', 'token_hash', 'el hash de la invitacion es unico');
select col_is_unique('public', 'student_devices',  'device_hash', 'el hash del dispositivo es unico');

-- Un grant por columna, no una politica: el motor lo impide, no el criterio.
select is(
  has_column_privilege('authenticated', 'public.guardian_invites', 'token_hash', 'SELECT'),
  false, 'authenticated no lee el hash de la invitacion');
select is(
  has_column_privilege('authenticated', 'public.student_devices', 'device_hash', 'SELECT'),
  false, 'authenticated no lee el hash del dispositivo');

select * from finish();
rollback;
