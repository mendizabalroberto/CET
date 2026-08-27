-- 0020 · El claim `cet_role` del JWT, declarado por fin en una migración.
-- © 2026 Roberto Mendizabal. Todos los derechos reservados.
--
-- DERIVA QUE ORIGINA ESTE FICHERO
-- ---------------------------------------------------------------------------
-- `app.sync_role_claims()` y su trigger EXISTÍAN en producción pero no en
-- `supabase/migrations/`: se crearon a mano al arreglar el 404 del superadmin.
-- Comprobado el 2026-08-27 contra `clcutoqjdgeggvgyreud`:
--
--   select proname from pg_proc ... where nspname='app'  -> sync_role_claims ✓
--   grep -rl "function app.sync_role_claims" supabase/    -> 0 resultados ✗
--
-- Consecuencia si no se corrige: quien reconstruya la base desde las
-- migraciones obtiene un sistema donde NINGÚN JWT lleva `cet_role`. El
-- middleware no denegaría de más —trata el claim ausente como "no lo sé" y deja
-- decidir al layout— pero toda su matriz de roles quedaría inerte sin que nada
-- fallara: exactamente el fallo #5 del plan de verificación, el middleware que
-- compila, tipa, linta y no hace nada.
--
-- QUÉ HACE
-- El rol de dominio vive en `profiles`. El borde no puede consultar `profiles`
-- en cada navegación, así que el rol viaja dentro del JWT. Este trigger copia
-- `role` y `school_id` a `auth.users.raw_app_meta_data`, que es de donde el
-- servidor de Auth compone `app_metadata` al emitir cada token.
--
-- `raw_app_meta_data` y NO `raw_user_meta_data`: lo segundo lo edita el propio
-- usuario. Un rol que el usuario pueda escribir no es un rol, es una sugerencia.
--
-- LATENCIA, A PROPÓSITO: el claim solo cambia cuando se emite un token nuevo
-- (login o refresco). Un profesor recién suspendido conserva su claim hasta una
-- hora. Por eso el claim NUNCA concede nada por sí solo: `requireRole()` lee
-- `profiles` en cada carga y RLS está debajo de todo.

create or replace function app.sync_role_claims()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users u
     set raw_app_meta_data =
           coalesce(u.raw_app_meta_data, '{}'::jsonb)
           || jsonb_build_object(
                'cet_role', new.role::text,
                -- NULL para superadmin: no pertenece a ningún colegio.
                'cet_school_id', new.school_id
              )
   where u.id = new.id;

  return new;
end;
$$;

comment on function app.sync_role_claims() is
  'Copia role/school_id de profiles a auth.users.raw_app_meta_data para que viajen en el JWT como cet_role / cet_school_id.';

drop trigger if exists profiles_sync_role_claims on public.profiles;

create trigger profiles_sync_role_claims
  after insert or update of role, school_id on public.profiles
  for each row execute function app.sync_role_claims();

-- Backfill. Sin esto, un perfil creado antes de que el trigger existiera se
-- queda sin claim para siempre: el trigger solo dispara cuando alguien vuelve a
-- tocar la fila, y a un superadmin nadie le cambia el rol nunca.
--
-- Idempotente: `||` sobreescribe las dos claves y deja intactas las demás
-- (`provider`, `providers`, `must_change_password`).
update auth.users u
   set raw_app_meta_data =
         coalesce(u.raw_app_meta_data, '{}'::jsonb)
         || jsonb_build_object('cet_role', p.role::text, 'cet_school_id', p.school_id)
  from public.profiles p
 where p.id = u.id
   and coalesce(u.raw_app_meta_data ->> 'cet_role', '') is distinct from p.role::text;
