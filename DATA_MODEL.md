# DATA MODEL — Cambridge Exam Trainer

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> **Contrato congelado.** Las 5 vías del Hito 1 dependen de este documento. Cambiarlo exige
> actualizar `MASTER_PLAN.md` y avisar a todas las vías.

---

## 0. Convenciones

- Toda tabla usa `id uuid primary key default gen_random_uuid()` salvo tablas de eventos (`bigint identity`).
- Toda tabla de negocio lleva `created_at timestamptz not null default now()` y `updated_at` con trigger.
- **Toda tabla lleva RLS habilitada.** Sin excepción. Una tabla sin política es una tabla inaccesible, que es el fallo seguro correcto.
- `school_id uuid` → **not null** en datos de alumno; **nullable** solo en tablas de contenido (AD-2), donde `NULL` significa "biblioteca global".
- Texto visible al usuario: `jsonb` con forma `{"es": "...", "en": "..."}`. Tipo `I18nText` en `@cet/shared`.
- Todo `foreign key` declara `on delete` explícitamente. Nunca se deja el default.
- Timestamps del cliente se guardan **aparte** de los del servidor. El servidor nunca confía en el reloj del cliente para nada que puntúe.

---

## 1. Tenancy e identidad

### `schools`
| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `name` | text not null | |
| `slug` | citext unique not null | usado en la URL de login |
| `country` | text | ISO-3166 |
| `timezone` | text not null default `'UTC'` | ventanas de examen se evalúan aquí |
| `default_locale` | text not null default `'en'` | |
| `pin_length_primary` | smallint not null default 4 | AD-4 |
| `pin_length_secondary` | smallint not null default 6 | AD-4 |
| `settings` | jsonb not null default `'{}'` | |
| `status` | `school_status` not null default `'active'` | active / suspended |
| `created_at` | timestamptz | |

`check (pin_length_primary between 4 and 8)`, idem secondary.

### `profiles`
Espejo de `auth.users`. **`id` = `auth.users.id`.**

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK → `auth.users(id)` on delete cascade | |
| `school_id` | uuid → `schools(id)` on delete restrict, **null solo para superadmin** | |
| `role` | `user_role` not null | superadmin / school_admin / teacher / student |
| `full_name` | text not null | |
| `email` | citext | null en alumnos con identidad sintética |
| `locale` | text not null default `'en'` | |
| `status` | `profile_status` not null default `'pending'` | pending / active / suspended |
| `last_seen_at` | timestamptz | |

`check ((role = 'superadmin') = (school_id is null))` — un superadmin no pertenece a colegio; todos los demás sí, obligatoriamente. Esta constraint es la que hace imposible el estado inválido.

### `students`
| Columna | Tipo | Nota |
|---|---|---|
| `profile_id` | uuid PK → `profiles(id)` on delete cascade | |
| `school_id` | uuid **nullable** → `schools(id)` on delete restrict | denormalizado a propósito: evita un join en cada política RLS. **`NULL` = el hijo de un tutor, que practica en casa.** Es una caché de la matrícula activa de `student_school_memberships`, no la fuente de verdad |
| `student_code` | citext not null | **unique (school_id, student_code)** — el código solo es único dentro del colegio. Sin colegio hace falta ADEMÁS un índice único parcial `where school_id is null`: en Postgres dos NULL son distintos entre sí, así que la constraint sola no impediría códigos repetidos |
| `year_level` | smallint not null | 1–13 |
| `stage` | `school_stage` not null | primary / secondary → determina longitud de PIN |
| `section` | text | "Y6A" |
| `pin_hash` | text not null | **Argon2id.** Nunca sale de la DB |
| `pin_must_change` | boolean not null default true | AD-4 |
| `pin_updated_at` | timestamptz | |
| `failed_pin_attempts` | smallint not null default 0 | |
| `locked_until` | timestamptz | |
| `guardian_email` | citext | minimización de datos: es el único dato de contacto |
| `enrolled_at` | timestamptz not null default now() | |

`pin_hash` está en una tabla con RLS que **no concede SELECT a nadie** salvo `service_role`. La Edge Function de auth es la única que lo lee.

### `registration_requests`
Registro de alumno con aprobación de admin.

`id`, `school_id` not null, `full_name`, `requested_year_level`, `guardian_email`, `note`,
`status` (`pending`/`approved`/`rejected`), `reviewed_by` → profiles, `reviewed_at`, `rejection_reason`, `created_at`.

### La cadena de invitación

Tres eslabones, **un mismo mecanismo**: un token aleatorio de 32 bytes del que la base guarda
únicamente el `sha256` en hexadecimal, con caducidad, revocable, y consumido al primer canje.
La forma se repite a propósito: una sola idea que auditar y un solo modo de fallo que entender.

```
[contratación]  →  guardian_invites  →  tutor  →  student_access_links  →  alumno  →  student_devices
   (aún no)          un solo uso                    un solo uso                        recuerda el aparato
```

#### `guardian_invites`
`id`, `token_hash` **unique**, `email` (a quién va dirigida; la pantalla de alta lo muestra fijo),
`expires_at`, `revoked_at`, `used_at`, `used_by` → profiles, `created_by` → profiles,
`contrato_ref` (vacía hasta que exista la contratación), `created_at`.

RLS habilitada y **sin una sola política**: la lee únicamente `service_role`. El fallo seguro de la
tabla que guarda la credencial de un adulto es que nadie la lea. `revoke all … from authenticated,
anon`.

#### `student_devices`
`id`, `student_id` → profiles, `device_hash` **unique**, `etiqueta`, `agente_familia`,
`created_from_link` → student_access_links, `created_at`, `last_seen_at`, `revoked_at`.

El secreto vive **solo** en una cookie `HttpOnly` del aparato; aquí está su `sha256`. `device_hash`
se protege con **grant por columna**, igual que `students.pin_hash` en `0013`: una política se
reescribe mal, un grant retirado por columna lo impide el motor.

`agente_familia` guarda «Chrome en Android» y **no** el user-agent completo. Es minimización de
datos, no pereza: el tutor necesita reconocer qué tablet está anulando, y el user-agent entero de un
menor es una huella digital.

> **La cookie no abre sesión.** Lo único que compra es saltarse los pasos «colegio» y «código» del
> formulario de login. La sesión sigue naciendo de un Argon2id verificado dentro de `auth-pin`, y
> `auth.uid()` sigue siendo el único eje de la RLS.

### `sections` y `section_members`
Clases. `sections(id, school_id, name, year_level, academic_year)`.
`section_members(section_id, profile_id, role_in_section)` — alumnos y profesores de una clase.

---

## 2. Currículo

Todas estas tablas siguen AD-2: `school_id` **nullable** (`NULL` = global).

### `subjects`
`id`, `school_id` (null=global), `code` (`math`, `science`, `english`, `spanish`, `socials`, `ict`),
`name` I18nText, `icon`, `color`, `ord`.

### `courses`
`id`, `school_id` (null=global), `subject_id` → subjects, `name` I18nText, `year_level`,
`locale`, `status` (`content_status`: `draft`/`in_review`/`published`/`retired`), `version` int.

> Corrección: una versión anterior de este documento decía `archived`. El valor real es
> **`retired`**, que es el que declara `packages/shared/src/enums.ts`. El contrato tipado manda
> sobre la prosa, y `packages/shared/src/__tests__/enum-parity.test.ts` verifica que Postgres y
> TypeScript coincidan miembro a miembro.

### `school_courses`
Suscripción de un colegio a un curso global (o activación de uno propio).
`school_id`, `course_id`, `is_active`, `activated_at`, `activated_by`. PK compuesta.

> Un curso global es **visible** para todos, pero solo **aparece** al alumno si su colegio lo activó aquí. Separar visibilidad de activación evita que un colegio nuevo vea 200 cursos irrelevantes.

### `course_modules`
`id`, `course_id` on delete cascade, `ord`, `title` I18nText, `description` I18nText.
`unique (course_id, ord)`.

### `lessons`
`id`, `module_id` on delete cascade, `ord`, `title` I18nText, `estimated_minutes`,
`status`, `school_id` (heredado, denormalizado para RLS).

### `skills` — taxonomía de mastery
El eje de todo el aprendizaje adaptativo.

`id`, `school_id` (null=global), `course_id`, `parent_skill_id` (self-FK, jerarquía),
`code` (`math.fractions.simplify`), `name` I18nText, `description` I18nText, `ord`.

`unique (course_id, code)`.

### `lesson_skills`
`lesson_id`, `skill_id`, `weight`. PK compuesta. Qué enseña cada lección.

---

## 3. Contenido

### `lesson_blocks`
Traducción directa de los bloques `.rule` `.eg` `.tip` `.warn` `.steps` de los trainers Y6A.

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `lesson_id` | uuid → lessons on delete cascade |
| `ord` | int not null |
| `kind` | `block_kind`: `rule`, `example`, `tip`, `warning`, `steps`, `table`, `text`, `image`, `video`, `interactive`, `formula` |
| `content` | jsonb not null — forma validada por Zod **según `kind`** (unión discriminada) |
| `media_id` | uuid → media_assets, nullable |

> `content` es jsonb pero **no** es libre: `@cet/shared` define un esquema Zod por cada `kind`, y un trigger valida contra JSON Schema en la DB. jsonb sin validación es una tabla de basura.

### `media_assets`
`id`, `school_id` (null=global), `storage_path` (bucket de Supabase Storage), `mime`, `bytes`,
`width`, `height`, `duration_seconds`, `alt_text` I18nText (**not null** — accesibilidad no es opcional),
`checksum` (sha256, deduplicación), `uploaded_by`, `created_at`.

---

## 4. Preguntas — versionado inmutable

Aquí vive el principio rector. **La identidad de la pregunta y su contenido son tablas distintas.**

### `questions` — identidad estable
| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | referencia estable para siempre |
| `school_id` | uuid nullable | AD-2 |
| `course_id` | uuid → courses | |
| `skill_id` | uuid → skills | para mastery |
| `kind` | `question_kind` | `static` \| `generated` |
| `current_version_id` | uuid → question_versions, nullable | la publicada ahora |
| `status` | `draft`/`in_review`/`published`/`retired` | |
| `created_by`, `created_at` | | |

### `question_versions` — snapshot inmutable
**Nunca se hace UPDATE en esta tabla.** Editar una pregunta crea una versión nueva.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `question_id` | uuid → questions on delete cascade | |
| `version` | int not null | `unique (question_id, version)` |
| `format` | `question_format` | `mcq_single`, `mcq_multi`, `numeric`, `fraction`, `short_text`, `cloze`, `ordering`, `matching`, `drag_drop`, `hotspot`, `true_false`, `long_text` |
| `body` | jsonb not null | estático: `{stem, options[], ...}`. Generado: `{engine_key, param_spec}` |
| `answer_spec` | jsonb not null | **clave de corrección. Nunca se envía al cliente.** |
| `hint` | I18nText | |
| `solution` | I18nText | el `sol:` de los generadores Y6A |
| `difficulty` | smallint 1–5 | |
| `max_points` | numeric not null default 1 | |
| `grading_mode` | `auto`/`partial`/`manual` | |
| `locale` | text | |
| `published_at`, `created_by` | | |

Trigger `question_versions_immutable`: `BEFORE UPDATE` → `RAISE EXCEPTION`. La inmutabilidad se garantiza en la DB, no por convención.

**Para `kind = 'generated'`:** `body.engine_key` apunta a un generador de `@cet/engine`
(`math.fracop`, `math.simplify`, `math.metric`…) y `body.param_spec` acota los rangos. El
generador es **determinista dado (engine_key, params, seed)** — requisito duro del paquete, con
test de propiedad que lo verifica.

### `question_options` (desnormalizado opcional)
No se usa tabla aparte: las opciones viven en `body.options` del snapshot. Motivo: la versión
debe ser un objeto autocontenido; una tabla hija rompería la inmutabilidad del snapshot.

---

## 5. Exámenes

### `exam_blueprints`
`id`, `school_id` (nullable), `course_id`, `title` I18nText, `description` I18nText,
`duration_seconds`, `shuffle_questions` bool, `shuffle_options` bool, `allow_back` bool,
`feedback_mode` (`never`/`after_submit`/`immediate`), `pass_threshold` numeric,
`max_attempts`, `status`, `version` int, `created_by`.

### `exam_blueprint_sections`
El equivalente de `MPARTS` en los trainers Y6A.

`id`, `blueprint_id` on delete cascade, `ord`, `title` I18nText, `item_count` int not null,
`selection` jsonb (`{skill_ids:[], difficulty:{min,max}, question_kind, tags:[]}`),
`source` (`bank`/`generated`/`mixed`), `points_per_item` numeric.

`unique (blueprint_id, ord)`.

### `exam_assignments`
`id`, `blueprint_id`, `blueprint_version` int, `school_id` not null, `section_id`,
`opens_at`, `closes_at`, `max_attempts`, `time_limit_override_seconds`,
`assigned_by`, `created_at`.

`check (closes_at > opens_at)`.

---

## 6. Intentos — el núcleo forense

### `exam_attempts`
| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `assignment_id` | uuid → exam_assignments on delete restrict | |
| `student_id` | uuid → students(profile_id) on delete cascade | |
| `school_id` | uuid not null | denormalizado para RLS sin joins |
| `attempt_number` | smallint not null | `unique (assignment_id, student_id, attempt_number)` |
| `blueprint_snapshot` | jsonb not null | **copia del blueprint tal cual estaba.** Si mañana lo editan, este intento sigue siendo interpretable |
| `seed` | bigint not null | semilla raíz. Toda aleatoriedad del intento deriva de aquí |
| `status` | `attempt_status` | `in_progress`/`submitted`/`grading`/`graded`/`abandoned`/`voided` |
| `started_at` | timestamptz not null | reloj del **servidor** |
| `server_deadline_at` | timestamptz not null | `started_at + límite`. **La única fuente de verdad del tiempo** |
| `submitted_at`, `graded_at` | timestamptz | |
| `submitted_by` | `student`/`timer`/`teacher` | quién cerró el intento |
| `score_raw`, `score_max`, `score_pct` | numeric | |
| `passed` | boolean | |
| `user_agent`, `ip_hash` | text | `ip_hash` = sha256(ip + salt). Nunca la IP en claro |
| `last_heartbeat_at` | timestamptz | para recuperación de sesión |

### `attempt_items` — qué vio exactamente el alumno
La tabla que hace posible la reconstrucción. Se escribe **entera al arrancar el intento**.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `attempt_id` | uuid → exam_attempts on delete cascade | |
| `ord` | int not null | orden real en que se le presentó. `unique (attempt_id, ord)` |
| `section_ord` | int | de qué sección del blueprint salió |
| `question_id` | uuid → questions on delete restrict | |
| `question_version_id` | uuid → question_versions on delete restrict | **qué versión exacta** |
| `item_seed` | bigint not null | derivada de `attempt.seed` + `ord` |
| `rendered_body` | jsonb not null | **el enunciado literal que se le mostró**, ya resuelto el generador |
| `option_order` | int[] | permutación aplicada a las opciones. Sin esto, "eligió la B" no significa nada |
| `answer_key` | jsonb not null | clave congelada. **Excluida de todo SELECT del alumno por RLS a nivel de columna** |
| `skill_id`, `difficulty`, `max_points` | | copiados al momento |

> `on delete restrict` en `question_version_id` es deliberado: **nunca** se puede borrar una versión de pregunta que algún intento usó. La integridad histórica gana sobre la comodidad de limpiar.

### `attempt_responses` — todas las revisiones
No se sobrescribe. Cada cambio de respuesta es una fila nueva. Así se responde "¿cuántas veces cambió de opinión?".

`id`, `attempt_id`, `attempt_item_id` on delete cascade, `revision` int not null,
`response` jsonb, `is_final` boolean not null default false,
`client_ts` timestamptz, `server_ts` timestamptz not null default now(),
`time_on_item_ms` int, `source` (`typed`/`selected`/`autosave`/`restored`).

`unique (attempt_item_id, revision)`. Índice parcial `where is_final` para la corrección.

### `attempt_gradings`
`id`, `attempt_item_id` on delete cascade, `points_awarded` numeric not null,
`max_points` numeric not null, `is_correct` boolean, `partial_ratio` numeric,
`graded_by` (`auto`/`manual`), `grader_id` → profiles nullable, `rationale` text,
`rubric_snapshot` jsonb, `graded_at`, `supersedes_id` (recalificación encadenada).

---

## 7. Telemetría — `learning_events`

Append-only. Particionada por mes (`RANGE` sobre `server_ts`). El corazón del análisis con IA.

| Columna | Tipo |
|---|---|
| `id` | bigint generated always as identity |
| `school_id` | uuid not null |
| `student_id` | uuid not null |
| `session_id` | uuid not null — una sesión de uso |
| `seq` | int not null — orden dentro de la sesión, resistente a relojes desordenados |
| `event_type` | `learning_event_type` |
| `attempt_id`, `attempt_item_id`, `lesson_id`, `question_id`, `skill_id` | uuid nullable |
| `payload` | jsonb not null default `'{}'` |
| `client_ts` | timestamptz — lo que dijo el cliente |
| `server_ts` | timestamptz not null default now() — **la verdad** |

`event_type` cubre exactamente lo que pediste:

```
attempt_started, attempt_resumed, attempt_paused, attempt_submitted, attempt_autosaved,
question_shown, question_skipped, question_revisited,
answer_changed, answer_submitted, answer_cleared,
hint_requested, solution_viewed,
idle_start, idle_end, focus_lost, focus_gained,
lesson_opened, lesson_block_viewed, lesson_completed,
video_started, video_progress, video_completed,
practice_started, practice_item_answered, practice_streak,
game_started, game_completed,
login_success, login_failed, pin_changed
```

**Ingesta:** el cliente encola eventos y los manda **en lote** (cada 5 s o 20 eventos) a una
Route Handler que valida con Zod y hace un `insert` masivo. Nunca un round-trip por evento.

**Índices:** `(student_id, server_ts desc)`, `(attempt_id)`, `(school_id, event_type, server_ts desc)`, `(skill_id, server_ts desc)`.

### `skill_mastery`
Estado agregado, actualizado por trigger/job desde los eventos.

`student_id`, `skill_id`, `school_id`, `mastery` numeric 0–1, `confidence` numeric,
`attempts_count`, `correct_count`, `ewma_correct`, `avg_time_ms`, `hints_used`,
`last_practiced_at`, `updated_at`. PK `(student_id, skill_id)`.

---

## 8. Seguridad y auditoría

### `audit_log`
Append-only. Toda acción de staff sobre datos de alumno.

`id` bigint, `school_id`, `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`,
`before` jsonb, `after` jsonb, `ip_hash`, `user_agent`, `created_at`.

### `auth_attempts`
Rate limiting y detección de fuerza bruta contra PINs.

`id` bigint, `school_id`, `student_code` citext, `success` boolean, `ip_hash`, `created_at`.
Índice `(school_id, student_code, created_at desc)`.

---

## 9. Helpers RLS (esquema `app`)

Todas `stable`, `security definer`, con **`set search_path = ''`** (sin esto, una tabla `public`
maliciosa secuestra la función — es el fallo clásico de Supabase).

```sql
app.current_profile_id()  -> uuid    -- auth.uid()
app.current_school_id()   -> uuid    -- school del perfil
app.current_role()        -> user_role
app.is_superadmin()       -> boolean
app.is_staff()            -> boolean -- school_admin | teacher
app.can_read_content(content_school_id uuid) -> boolean
    -- content_school_id IS NULL  OR  content_school_id = app.current_school_id()
```

### Patrón de política — datos de alumno
```sql
create policy student_reads_own on exam_attempts for select
  using (school_id = app.current_school_id() and student_id = app.current_profile_id());

create policy staff_reads_school on exam_attempts for select
  using (school_id = app.current_school_id() and app.is_staff());
```

### Patrón de política — contenido híbrido (AD-2)
```sql
create policy read_global_or_own on questions for select
  using (app.can_read_content(school_id));

create policy write_own_only on questions for all
  using (school_id = app.current_school_id() and app.is_staff())
  with check (school_id = app.current_school_id() and app.is_staff());
```

### La clave de respuesta
`attempt_items.answer_key` y `question_versions.answer_spec` **no se exponen jamás al rol
`authenticated` de un alumno**.

> ⚠️ **Corrección de un error de este documento.** Una versión anterior decía:
> `revoke select (answer_key) on attempt_items from authenticated;`
> **Eso no retira nada.** En Postgres, un `REVOKE` por columna es inútil si el rol conserva el
> `SELECT` a nivel de tabla: el permiso de tabla lo cubre todo, columnas incluidas. Y Supabase
> concede `SELECT` de tabla a `authenticated` por defecto sobre `public`. La clave de respuesta
> habría sido legible por cualquier alumno autenticado, y la "defensa en profundidad" era
> decorativa. Detectado en la revisión de la vía A (hallazgo C-1).

La implementación correcta invierte el orden — primero se quita todo, después se concede lo justo:

```sql
-- 1. Retirar el permiso de TABLA, que es el que realmente cubre las columnas.
revoke select on public.attempt_items from authenticated;

-- 2. Conceder solo las columnas seguras. `answer_key` sencillamente no está.
grant select (id, attempt_id, ord, section_ord, question_id, question_version_id,
              rendered_body, option_order, skill_id, difficulty, max_points)
  on public.attempt_items to authenticated;
```

3. Además, la vista `attempt_items_student` (declarada `security_invoker = true`,
   `security_barrier = true`) es lo único que el cliente consulta. Sin `security_invoker`, una
   vista se ejecuta con los permisos de su propietario y **saltaría la RLS por completo**.

Defensa en profundidad real: aunque una política RLS falle, el `GRANT` por columna sigue
bloqueando, y a la inversa. `supabase/tests/rls_answer_key_hidden.sql` lo verifica por las dos vías.

---

## 10. Reconstrucción forense — la query que lo demuestra

```sql
select
  ai.ord,
  ai.rendered_body,            -- lo que vio, literal
  ai.option_order,             -- en qué orden vio las opciones
  qv.version,                  -- qué versión de la pregunta
  ai.answer_key,               -- la clave vigente entonces
  r.response, r.revision, r.server_ts,   -- cada cambio de opinión
  g.points_awarded, g.graded_by, g.graded_at
from attempt_items ai
join question_versions qv on qv.id = ai.question_version_id
left join attempt_responses r on r.attempt_item_id = ai.id
left join attempt_gradings  g on g.attempt_item_id = ai.id
where ai.attempt_id = $1
order by ai.ord, r.revision;
```

Debe existir un test automatizado (`supabase/tests/forensic_reconstruction.sql`) que simule un
intento completo y verifique que esta query devuelve el 100 % de lo ocurrido. **Ese test es el
criterio de aceptación del módulo M09.**
