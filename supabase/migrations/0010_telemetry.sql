-- =============================================================================
-- 0010_telemetry.sql — learning_events (particionada) y skill_mastery
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §7 · packages/shared/src/events.ts
-- =============================================================================
-- learning_events es la tabla que más crece del sistema: cada alumno emite
-- decenas de eventos por minuto de práctica. Un colegio de 800 alumnos genera
-- del orden de 10^8 filas al año.
--
-- Por eso está particionada por RANGE mensual sobre `server_ts`:
--   · el borrado por retención es un DROP TABLE instantáneo, no un DELETE que
--     bloquea la tabla durante horas y deja bloat;
--   · las queries de analítica ("este trimestre") podan particiones enteras;
--   · cada índice es 12× más pequeño y cabe en caché.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- learning_events — append-only, particionada por mes
-- -----------------------------------------------------------------------------
-- DECISIÓN: `id` usa una SECUENCIA explícita y no `generated always as identity`.
-- Las columnas identity sobre tablas PARTICIONADAS solo existen a partir de
-- Postgres 17. MASTER_PLAN fija Postgres 17, pero una secuencia explícita se
-- comporta igual y funciona también en 15/16 — es decir, en cualquier rama de
-- Supabase o entorno de CI que aún no haya subido. El coste es cero.
create sequence public.learning_events_id_seq as bigint;

create table public.learning_events (
  id              bigint not null default nextval('public.learning_events_id_seq'),
  school_id       uuid not null references public.schools (id) on delete cascade,
  student_id      uuid not null references public.profiles (id) on delete cascade,
  -- Una sesión de uso. La agrupa el cliente; el servidor no la interpreta, solo
  -- la usa como eje de ordenación junto con `seq`.
  session_id      uuid not null,
  -- Orden dentro de la sesión. Resistente a relojes desordenados y a lotes que
  -- llegan fuera de orden (la ingesta es en lote cada 5 s / 20 eventos).
  seq             integer not null,
  event_type      public.learning_event_type not null,

  attempt_id      uuid,
  attempt_item_id uuid,
  lesson_id       uuid,
  question_id     uuid,
  skill_id        uuid,

  payload         jsonb not null default '{}'::jsonb,
  -- Lo que dijo el cliente. Se guarda para poder DETECTAR relojes manipulados.
  client_ts       timestamptz,
  -- La verdad. Es también la clave de partición.
  server_ts       timestamptz not null default now(),

  -- La PK de una tabla particionada DEBE incluir la clave de partición.
  constraint learning_events_pkey primary key (server_ts, id),
  constraint learning_events_seq_nonneg check (seq >= 0),
  constraint learning_events_payload_object check (app.is_jsonb_object(payload))
)
partition by range (server_ts);

comment on table public.learning_events is
  'Append-only, particionada por mes. El corazón del análisis adaptativo (DATA_MODEL §7).';
comment on column public.learning_events.seq is
  'Orden dentro de la sesión. Es lo que ordena de verdad: client_ts es manipulable.';

alter sequence public.learning_events_id_seq owned by public.learning_events.id;

-- SIN FOREIGN KEYS hacia attempts/lessons/questions/skills. Es deliberado y va
-- contra el instinto:
--   1. Una FK obligaría a un lookup por cada uno de los millones de inserts;
--      la ingesta es en lote y en caliente durante la clase.
--   2. Las FK desde tablas particionadas hacia otras tablas son costosas de
--      mantener partición a partición.
--   3. Un evento es un HECHO HISTÓRICO: "vio la pregunta X". Si mañana se borra
--      esa pregunta, el hecho siguió ocurriendo. Una FK con cascade borraría la
--      telemetría, y con restrict impediría limpiar el banco para siempre.
-- school_id y student_id SÍ llevan FK: son el eje de la RLS, y un evento con
-- tenant inexistente sería un evento invisible o, peor, mal atribuido.

-- --- Índices (DATA_MODEL §7 los enumera; aquí va el porqué de cada uno) -------
-- Se crean sobre la tabla PADRE: Postgres los propaga a cada partición, presente
-- y futura, sin que la función de creación tenga que acordarse de nada.

-- "La actividad reciente de este alumno" — el timeline del panel del profesor y
-- la entrada de todo cálculo de mastery.
create index learning_events_student_ts_idx
  on public.learning_events (student_id, server_ts desc);

-- "Todo lo ocurrido durante este intento" — es la telemetría que acompaña a la
-- reconstrucción forense de §10 (idle, focus_lost, hint_requested...).
create index learning_events_attempt_idx
  on public.learning_events (attempt_id)
  where attempt_id is not null;   -- la mayoría de eventos no son de examen

-- "Cuántos login_failed ha habido en este colegio esta semana" — dashboards de
-- colegio y detección de anomalías.
create index learning_events_school_type_ts_idx
  on public.learning_events (school_id, event_type, server_ts desc);

-- "Evolución de esta skill" — el eje del aprendizaje adaptativo (Hito 5).
create index learning_events_skill_ts_idx
  on public.learning_events (skill_id, server_ts desc)
  where skill_id is not null;

-- Deduplicación de la ingesta. El cliente reintenta un lote si la red se cae, y
-- (session_id, seq) identifica un evento de forma única.
--
-- NO se puede expresar como UNIQUE: en una tabla particionada todo índice único
-- debe incluir la clave de partición, y `unique (session_id, seq, server_ts)`
-- NO deduplica nada — el reintento trae un server_ts distinto y pasa el UNIQUE
-- tan campante. Escribir ese índice creyendo que protege es peor que no tenerlo,
-- porque da una falsa sensación de garantía.
--
-- Solución real: la deduplicación es responsabilidad del ingestor, que inserta
-- con `... where not exists (select 1 from learning_events where session_id = $1
-- and seq = $2 and server_ts > now() - interval '1 day')`. Este índice hace que
-- esa comprobación sea un lookup y no un scan. Ver modules/analytics.
create index learning_events_session_seq_idx
  on public.learning_events (session_id, seq);

alter table public.learning_events enable row level security;

-- Append-only en la dimensión que importa: NADIE reescribe un evento, ni el
-- backend. Un evento es un hecho histórico.
--
-- El DELETE NO se bloquea con trigger, y es una decisión razonada:
--   · learning_events.student_id -> profiles ON DELETE CASCADE. Un trigger que
--     bloqueara DELETE haría IMPOSIBLE borrar a un alumno, es decir, imposible
--     atender un derecho de supresión (RGPD / datos de menores, MASTER_PLAN §9).
--     "Append-only" no puede significar "los datos de un menor son eternos".
--   · La retención ordinaria no borra filas: hace DROP de la partición del mes,
--     que no pasa por triggers de fila de todas formas.
--   · `authenticated` no tiene GRANT de DELETE (0013) ni política: desde el
--     cliente el borrado sigue siendo imposible.
create trigger learning_events_append_only
  before update on public.learning_events
  for each row execute function app.block_mutation();


-- -----------------------------------------------------------------------------
-- Gestión de particiones
-- -----------------------------------------------------------------------------
-- Crea la partición de un mes concreto si no existe. Idempotente: se puede
-- llamar cien veces al día desde un cron sin efecto ninguno.
create or replace function app.create_learning_events_partition(p_month date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'learning_events_' || to_char(v_start, 'YYYY_MM');
begin
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_name
  ) then
    return v_name || ' (ya existía)';
  end if;

  execute format(
    'create table public.%I partition of public.learning_events for values from (%L) to (%L)',
    v_name, v_start, v_end);

  -- RLS en la partición además de en el padre. Al consultar por el padre manda
  -- la política del padre, pero un `select from learning_events_2026_08` directo
  -- se rige por la RLS de la PARTICIÓN. Sin esta línea, ese camino quedaría
  -- abierto y sería la fuga de datos más silenciosa posible.
  execute format('alter table public.%I enable row level security', v_name);

  -- Los índices del padre se propagan solos; los privilegios no. Se retira todo
  -- a los roles de aplicación y NO se les concede nada: consultar por la tabla
  -- padre comprueba los privilegios del PADRE, así que un GRANT aquí no aporta
  -- acceso legítimo y sí abriría el acceso directo a la partición.
  execute format('revoke all on public.%I from anon, authenticated', v_name);
  execute format('grant all on public.%I to service_role', v_name);

  return v_name || ' (creada)';
end;
$$;

comment on function app.create_learning_events_partition(date) is
  'Crea (idempotente) la partición mensual de learning_events, con RLS y GRANTs correctos.';


-- Crea la partición del mes actual y las de los N meses siguientes.
-- Pensada para un pg_cron diario. Adelantarse varios meses es lo que evita el
-- fallo clásico: a las 00:00 del día 1 llegan inserts para un mes sin partición.
create or replace function app.ensure_learning_events_partitions(p_months_ahead integer default 3)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  i integer;
begin
  if p_months_ahead < 0 or p_months_ahead > 60 then
    raise exception 'p_months_ahead fuera de rango (0..60): %', p_months_ahead
      using errcode = 'invalid_parameter_value';
  end if;

  for i in 0 .. p_months_ahead loop
    return next app.create_learning_events_partition(
      (date_trunc('month', now()) + (i || ' months')::interval)::date);
  end loop;
end;
$$;

-- Estas dos funciones crean TABLAS con los privilegios del owner. Ningún rol de
-- aplicación debe poder invocarlas.
revoke all on function app.create_learning_events_partition(date) from public;
revoke all on function app.ensure_learning_events_partitions(integer) from public;
grant execute on function app.ensure_learning_events_partitions(integer) to service_role;


-- Partición DEFAULT — la red de seguridad.
-- Compromiso explícito: si un insert cae fuera de todas las particiones, sin
-- DEFAULT el insert FALLA y se pierde telemetría (y, peor, puede tumbar la
-- Route Handler de ingesta a mitad de una clase). Con DEFAULT, la fila se
-- guarda. El coste es que crear después la partición de ese mes exige mover las
-- filas del default primero. Perder datos es peor que una migración manual.
-- `ensure_learning_events_partitions` corriendo a diario mantiene el default
-- vacío en régimen normal.
create table public.learning_events_default
  partition of public.learning_events default;

alter table public.learning_events_default enable row level security;

-- Particiones iniciales: el mes en curso y los 12 siguientes.
select app.ensure_learning_events_partitions(12);


-- -----------------------------------------------------------------------------
-- skill_mastery — estado agregado por (alumno, skill)
-- -----------------------------------------------------------------------------
-- Derivado de learning_events y de attempt_gradings por job. Es una CACHÉ
-- reconstruible: si se corrompe, se recalcula desde los eventos, que son la
-- fuente de verdad.
create table public.skill_mastery (
  student_id        uuid not null references public.profiles (id) on delete cascade,
  skill_id          uuid not null references public.skills (id) on delete cascade,
  school_id         uuid not null references public.schools (id) on delete cascade,
  mastery           numeric(4,3) not null default 0,   -- 0..1
  confidence        numeric(4,3) not null default 0,   -- 0..1
  attempts_count    integer not null default 0,
  correct_count     integer not null default 0,
  -- Media móvil exponencial de aciertos: pondera lo reciente, que es lo que
  -- indica si el alumno ACABA de entenderlo.
  ewma_correct      numeric(4,3) not null default 0,
  avg_time_ms       integer,
  hints_used        integer not null default 0,
  last_practiced_at timestamptz,
  updated_at        timestamptz not null default now(),

  primary key (student_id, skill_id),

  constraint skill_mastery_mastery_range check (mastery >= 0 and mastery <= 1),
  constraint skill_mastery_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint skill_mastery_ewma_range check (ewma_correct >= 0 and ewma_correct <= 1),
  constraint skill_mastery_counts_nonneg
    check (attempts_count >= 0 and correct_count >= 0 and hints_used >= 0),
  -- Acertar más veces de las que se ha intentado es aritméticamente imposible;
  -- si ocurre, el job de agregación tiene un bug y hay que enterarse enseguida.
  constraint skill_mastery_correct_lte_attempts check (correct_count <= attempts_count),
  constraint skill_mastery_time_sane check (avg_time_ms is null or avg_time_ms >= 0)
);

-- Query caliente: "las skills más flojas de este alumno" — la recomendación
-- adaptativa y el plan de estudio.
create index skill_mastery_weakest_idx
  on public.skill_mastery (student_id, mastery asc);

-- Query caliente del profesor: "qué skill lleva peor MI CLASE" — agrega por
-- skill dentro del colegio.
create index skill_mastery_school_skill_idx
  on public.skill_mastery (school_id, skill_id, mastery);

create trigger skill_mastery_set_updated_at
  before update on public.skill_mastery
  for each row execute function app.set_updated_at();

alter table public.skill_mastery enable row level security;
