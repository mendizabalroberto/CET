-- =============================================================================
-- 0001_superadmin.sql — superadmin de la plataforma
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- CÓMO SE CREA EL auth.users CORRESPONDIENTE (no se hace aquí, y es a propósito)
-- -----------------------------------------------------------------------------
-- Este fichero NO crea el usuario de autenticación ni contiene credencial
-- alguna. Escribir una contraseña en un fichero versionado es exactamente el
-- fallo que este proyecto no puede permitirse, y además `auth.users` tiene
-- columnas internas (formato del hash, `confirmation_token`, `aud`, esquema de
-- `raw_app_meta_data`) que GoTrue puede cambiar entre versiones: un INSERT
-- manual funciona hoy y produce un usuario que no puede iniciar sesión mañana.
--
-- El procedimiento correcto, ANTES de ejecutar este fichero, es una de estas dos
-- opciones:
--
--   A) Panel de Supabase → Authentication → Users → "Add user"
--      Email: mendizabal.roberto@gmail.com
--      Marcar "Auto Confirm User". La contraseña se genera en un gestor de
--      contraseñas y no se escribe en ningún sitio del repositorio.
--
--   B) Admin API con la service_role key (que vive en el gestor de secretos,
--      nunca en git):
--
--        curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
--          -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
--          -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
--          -H "Content-Type: application/json" \
--          -d '{"email":"mendizabal.roberto@gmail.com",
--               "password":"'"$CET_SUPERADMIN_PASSWORD"'",
--               "email_confirm":true}'
--
-- Después, este fichero LOCALIZA ese usuario por email y le crea su perfil.
-- Es idempotente: se puede ejecutar tantas veces como haga falta.
--
-- MFA: el superadmin debe activar TOTP en su primer acceso (AD-3). Es la única
-- cuenta que puede leer datos de TODOS los colegios; una contraseña sola no
-- basta para eso. Ver modules/auth/CLAUDE.md.
-- =============================================================================

do $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = 'mendizabal.roberto@gmail.com';

  if v_user_id is null then
    raise exception using
      errcode = 'no_data_found',
      message = 'No existe auth.users para mendizabal.roberto@gmail.com',
      hint    = 'Crea primero el usuario (panel de Supabase o Admin API) y vuelve a ejecutar este seed. Ver la cabecera del fichero.';
  end if;

  insert into public.profiles (id, school_id, role, full_name, email, locale, status)
  values (
    v_user_id,
    null,                      -- superadmin => sin colegio (constraint profiles_superadmin_has_no_school)
    'superadmin',
    'Roberto Mendizabal',
    'mendizabal.roberto@gmail.com',
    'es',
    'active'
  )
  on conflict (id) do update
    set role      = 'superadmin',
        school_id = null,
        full_name = 'Roberto Mendizabal',
        status    = 'active';

  raise notice 'Superadmin Roberto Mendizabal listo (profile %).', v_user_id;
end;
$$;
