-- =============================================================================
-- 2026-08-29-limpiar-alta-e2e.sql — borra lo que dejó el e2e de la cadena
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- QUÉ BORRA, Y POR QUÉ SE PUEDE CONFIAR EN EL FILTRO
--
-- `apps/web/e2e/alta-por-enlace.spec.ts` crea datos REALES, porque este
-- proyecto no tiene base de pruebas. Para que el rastro fuera reconocible, el
-- correo del tutor lleva siempre el dominio `@cet-e2e.invalid` y el nombre del
-- menor empieza siempre por `E2E `. Este fichero borra exactamente eso y nada
-- más: comprobado antes de escribirlo, ningún perfil real cae en el filtro.
--
-- Depurar la cadena contra producción costó doce ejecuciones —cada una con su
-- tutor y su menor— porque cada arreglo destapaba el siguiente eslabón roto.
--
-- EL ORDEN NO ES CAPRICHOSO
--   1. `learning_events` y `audit_log` NO tienen clave ajena al alumno: es
--      deliberado (DATA_MODEL), así que borrar la cuenta los deja huérfanos
--      contando para siempre en los informes. Van PRIMERO, mientras los ids
--      todavía se pueden localizar por el nombre.
--   2. `guardian_invites` tampoco cae en cascada: se busca por su propio correo.
--   3. `auth.users` al final. Eso sí arrastra en cascada `profiles`,
--      `students`, `guardian_students`, `student_access_links` y
--      `student_devices`.
--
-- Es RE-EJECUTABLE: volver a lanzarlo con la base ya limpia no borra nada y no
-- falla. Se puede usar después de cada tanda de e2e.
-- =============================================================================

-- 1 · Telemetría del canje (`pin_changed`, que escribe `set-from-link`).
delete from public.learning_events
where student_id in (
  select id from public.profiles
  where role = 'student' and full_name like 'E2E %'
);

-- 2 · Auditoría. Se borra porque habla de cuentas que van a dejar de existir, y
--     una línea forense cuyo actor no existe no prueba nada y ensucia el rastro
--     de las que sí importan.
delete from public.audit_log
where actor_id in (
  select id from public.profiles
  where full_name like 'E2E %' or email like '%@cet-e2e.invalid'
);

-- 3 · Las invitaciones de tutor, usadas y sin usar.
delete from public.guardian_invites
where email like '%@cet-e2e.invalid';

-- 4 · Y las cuentas.
delete from auth.users
where email like '%@cet-e2e.invalid'
   or id in (select id from public.profiles where full_name like 'E2E %');

-- 5 · Parte de guerra. Si algo quedara vivo, sale aquí y no en un silencio.
do $$
declare
  quedan integer;
begin
  select count(*) into quedan
  from public.profiles
  where full_name like 'E2E %' or email like '%@cet-e2e.invalid';

  if quedan = 0 then
    raise notice 'Limpieza del e2e: sin restos.';
  else
    raise warning 'Limpieza del e2e: quedan % perfiles. Revisar a mano.', quedan;
  end if;
end;
$$;
