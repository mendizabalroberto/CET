-- =============================================================================
-- 0065_invitaciones_y_dispositivos.sql — la cadena de invitacion
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Dos tablas con la MISMA disciplina que `student_access_links` (0057): el
-- secreto no se guarda, se guarda su SHA-256. Un token en claro en reposo es
-- una credencial en reposo, y una de ellas es la de un menor.
--
-- POR QUE DOS TABLAS Y NO UNA CON DISCRIMINADOR
-- La forma es casi identica, pero una guarda la credencial de un adulto y la
-- otra la de un menor, y las politicas que las gobiernan no se parecen. Una
-- tabla unica obligaria a cada politica a razonar sobre el tipo ANTES de
-- decidir, que es la clase de politica que se escribe mal una vez y filtra
-- durante meses.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- guardian_invites — el enlace con el que un tutor se da de alta
-- -----------------------------------------------------------------------------
create table public.guardian_invites (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  -- A quien va dirigida. La pantalla de alta lo muestra FIJO: un enlace
  -- reenviado por error no le fabrica una cuenta a otra persona.
  email        extensions.citext not null,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  used_at      timestamptz,
  used_by      uuid references public.profiles (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  -- Vacia hasta que exista la contratacion. Es la sutura, no una promesa.
  contrato_ref text,
  created_at   timestamptz not null default now(),
  constraint invitacion_caduca_despues_de_nacer check (expires_at > created_at)
);
alter table public.guardian_invites enable row level security;
create index invitaciones_email_idx on public.guardian_invites (email);

-- SIN NINGUNA POLITICA, y es deliberado. Esta tabla la lee la accion de canje
-- con `service_role`, que las ignora. Para todos los demas es inalcanzable,
-- que es el fallo seguro correcto (DATA_MODEL §0).

-- -----------------------------------------------------------------------------
-- student_devices — el dispositivo que ya canjeo un enlace
-- -----------------------------------------------------------------------------
create table public.student_devices (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles (id) on delete cascade,
  device_hash       text not null unique,
  -- Lo pone el tutor: "Tablet de casa". Es lo unico que le permite saber cual
  -- esta revocando.
  etiqueta          text,
  -- "Chrome en Android", NUNCA el user-agent completo. Minimizacion de datos:
  -- el user-agent entero de un menor es una huella digital.
  agente_familia    text,
  created_from_link uuid references public.student_access_links (id) on delete set null,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz,
  revoked_at        timestamptz
);
alter table public.student_devices enable row level security;
create index dispositivos_alumno_idx
  on public.student_devices (student_id) where revoked_at is null;

-- El alumno ve los suyos; el tutor, los de sus hijos. Nadie inserta ni
-- actualiza: eso lo hace `service_role` desde el canje.
create policy dispositivos_select_propio on public.student_devices
  for select to authenticated
  using (student_id = (select auth.uid()));

create policy dispositivos_select_tutor on public.student_devices
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));

-- =============================================================================
-- GRANTS POR COLUMNA — la garantia que no depende de una politica
-- =============================================================================
-- Mismo patron que 0013_grants.sql sobre `students.pin_hash`. Una politica mal
-- reescrita expone la fila entera; un grant retirado por columna lo impide el
-- motor, y ninguna politica puede devolverlo.
grant select (id, student_id, etiqueta, agente_familia, created_from_link,
              created_at, last_seen_at, revoked_at)
  on public.student_devices to authenticated;
revoke select on public.student_devices from anon;

revoke all on public.guardian_invites from authenticated, anon;

comment on table public.guardian_invites is
  'Enlace de alta de tutor. Token hasheado, un solo uso, siete dias. Solo service_role lo lee.';
comment on table public.student_devices is
  'Dispositivo casado con un alumno. La cookie tiene el secreto; aqui solo vive su SHA-256.';
