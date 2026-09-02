-- =============================================================================
-- 0087_telegram_del_tutor.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- NOTIFICACIONES A LOS PADRES, Y POR QUE NO SE LES PIDE SU USUARIO
--
-- La forma obvia -«pon aqui tu @usuario de Telegram»- NO FUNCIONA, y conviene
-- que quede escrito para que nadie la vuelva a intentar: un bot de Telegram no
-- puede iniciar una conversacion. Solo puede responder a quien le haya escrito
-- antes. Guardar `@fulanita` no sirve de nada: no hay forma de mandarle un
-- mensaje.
--
-- Lo unico que funciona es al reves. El tutor pulsa un enlace
-- `https://t.me/<bot>?start=<token>`, Telegram abre el chat, el pulsa
-- «Empezar», y el bot recibe `/start <token>` JUNTO CON SU chat_id. Ese
-- `chat_id` es lo unico que hay que guardar, y es lo unico con lo que se le
-- puede escribir despues. El tutor no teclea nada.
--
-- POR ESO ESTA TABLA TIENE DOS MITADES
--
-- El token pendiente (`token_hash`, `token_expira_at`) es la mitad de ida: la
-- credencial de un solo uso que viaja en el enlace. El `chat_id` es la de
-- vuelta: lo que Telegram devuelve y lo que permite escribir.
--
-- EL TOKEN ES UNA CREDENCIAL, ASI QUE SE GUARDA HASHEADO
--
-- Mismo criterio que `student_access_links` (0057) y `guardian_invites`: en la
-- base vive el SHA-256 y el token en claro solo existe en la pantalla que lo
-- acaba de generar. Quien lo tuviera podria vincular SU Telegram a la cuenta de
-- un padre y recibir las notificaciones sobre un menor ajeno.
--
-- SHA-256 y no Argon2id, igual que 0057: un token de 256 bits no se adivina por
-- fuerza bruta, asi que el coste alto de Argon2 no compra nada y si costaria en
-- cada vinculacion. Argon2 es para secretos con poca entropia, como un PIN.
--
-- `chat_id` ES bigint Y NO integer
--
-- Telegram documenta que los identificadores de chat pueden superar los 32 bits
-- -y los de grupo son negativos y grandes-. Un `integer` desbordaria en
-- silencio y la fila apuntaria a otra conversacion. Es el tipo que la propia
-- documentacion de la API pide usar.
--
-- QUIEN VE QUE
--
-- El tutor necesita saber UNA cosa: si esta conectado o no. No necesita ver su
-- `chat_id` -no le dice nada- ni el hash del token. Asi que el GRANT es POR
-- COLUMNA, como en `accesos_de_alumno` (0078): la sesion alcanza `vinculado_at`
-- y nada mas. Un XSS en el panel del tutor no puede sacar el `chat_id` con el
-- que se le escribe a un padre.
--
-- Una fila por tutor: la clave primaria es `guardian_id`. Vincular otra vez
-- reemplaza, no acumula, y `chat_id` es unico para que dos padres no puedan
-- apuntar al mismo chat -que seria un padre recibiendo datos del hijo de otro-.
-- =============================================================================

create table if not exists public.telegram_de_tutor (
  guardian_id     uuid primary key references public.profiles(id) on delete cascade,
  -- Nulo hasta que el bot confirma. Su presencia ES el estado «conectado».
  chat_id         bigint unique,
  token_hash      text,
  token_expira_at timestamptz,
  vinculado_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.telegram_de_tutor is
  'Vinculo entre un tutor y su chat de Telegram. Un bot no puede iniciar conversacion, asi que el chat_id solo se consigue cuando el tutor pulsa el enlace y escribe /start: ver la cabecera de 0087.';
comment on column public.telegram_de_tutor.chat_id is
  'Identificador del chat que devuelve Telegram. Lo unico con lo que se le puede escribir. bigint porque supera los 32 bits. Fuera del GRANT de authenticated.';
comment on column public.telegram_de_tutor.token_hash is
  'SHA-256 del token del enlace de vinculacion. El token en claro solo existe en la pantalla que lo genero. Fuera del GRANT de authenticated.';

create index if not exists telegram_de_tutor_token_idx
  on public.telegram_de_tutor (token_hash)
  where token_hash is not null;

alter table public.telegram_de_tutor enable row level security;

-- -----------------------------------------------------------------------------
-- Acceso: el tutor ve SI esta conectado, y nada mas
-- -----------------------------------------------------------------------------
revoke all on public.telegram_de_tutor from authenticated, anon;

-- Ni `chat_id` ni `token_hash` ni `token_expira_at` entran aqui.
grant select (guardian_id, vinculado_at, created_at, updated_at)
  on public.telegram_de_tutor to authenticated;

-- Nadie escribe con sesion: el enlace lo genera una accion de servidor y el
-- `chat_id` lo escribe el webhook, las dos con `service_role`. Si `authenticated`
-- pudiera escribir, un tutor podria ponerse el `chat_id` que quisiera.
create policy telegram_select_propio on public.telegram_de_tutor
  for select to authenticated
  using (guardian_id = (select auth.uid()));

comment on policy telegram_select_propio on public.telegram_de_tutor is
  'Un tutor solo ve su propia fila, y de ella solo las columnas del GRANT: si esta vinculado y desde cuando.';
