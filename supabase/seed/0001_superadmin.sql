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


-- =============================================================================
-- REPARACIÓN DE CUENTAS CREADAS CON `INSERT` DIRECTO EN `auth.users`
-- =============================================================================
-- La cabecera de este fichero ya advertía de que un INSERT manual en auth.users
-- "funciona hoy y produce un usuario que no puede iniciar sesión mañana", y
-- nombraba `confirmation_token`. La advertencia era exacta.
--
-- GoTrue está escrito en Go y lee esas columnas como `string`, no como puntero.
-- Un NULL no equivale a cadena vacía: rompe el escaneo de la fila con
--
--     error finding user: Scan error on column index 3, name
--     "confirmation_token": converting NULL to string is unsupported
--
-- y el endpoint de login devuelve un 500. En la pantalla eso se lee como
-- "credenciales incorrectas", que es exactamente el diagnóstico equivocado: la
-- contraseña está bien, GoTrue ni siquiera puede leer al usuario.
--
-- Además, sin fila en `auth.identities` el proveedor `email` no existe para esa
-- cuenta y el login con contraseña no llega a intentarse.
--
-- LO CORRECTO es crear los usuarios con la Admin API (`auth.admin.createUser`),
-- que rellena ambas cosas. Este bloque es la red para las cuentas que ya se
-- crearon a mano. Es idempotente.
-- =============================================================================

update auth.users
   set confirmation_token         = coalesce(confirmation_token, ''),
       recovery_token             = coalesce(recovery_token, ''),
       email_change_token_new     = coalesce(email_change_token_new, ''),
       email_change               = coalesce(email_change, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       phone_change               = coalesce(phone_change, ''),
       phone_change_token         = coalesce(phone_change_token, ''),
       reauthentication_token     = coalesce(reauthentication_token, '')
 where confirmation_token is null
    or recovery_token is null
    or email_change_token_new is null
    or email_change is null;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select extensions.gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from auth.users u
where not exists (
  select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
);
