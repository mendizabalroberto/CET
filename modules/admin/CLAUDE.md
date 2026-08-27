# M12 — `admin` · Panel de administración

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Contrato del módulo. El código vive en `supabase/`, `packages/` y `apps/web/`; aquí está el acuerdo.
> Depende de: M03 `users` … M11 `analytics`. Es el último módulo del grafo por una razón: no
> inventa datos propios, gobierna los de todos los demás.

---

## 1. Objetivo

Dar a **superadmin** y a **school_admin** una superficie única para operar la plataforma sin
tocar la base de datos a mano, y dejar constancia auditable de cada cosa que hacen.

El panel cubre siete cosas:

1. **Colegios** — alta, configuración (etapa, longitud de PIN, idioma por defecto), suspensión.
2. **Usuarios y roles** — staff, invitaciones, cambio de rol, suspensión, reseteo de credenciales.
3. **Aprobación de registros** — la cola de `registration_requests`.
4. **Autoría de contenido** — currículo, lecciones, bloques, media.
5. **Autoría de preguntas** — banco, versionado inmutable, revisión y publicación.
6. **Exámenes** — blueprints, secciones, asignación a clases, ventanas temporales.
7. **Auditoría y forense** — visor de `audit_log` y reconstrucción de un intento pregunta a pregunta.

### Lo que este módulo NO hace

- **No corrige exámenes.** Eso es M10. El panel muestra y solicita recalificación; no calcula notas.
- **No genera preguntas.** Eso es `@cet/engine` (M07/AD-6). El panel configura parámetros y semillas.
- **No es un cliente de SQL.** Cada acción es una operación de dominio con nombre, validada y
  auditada. Si algo solo se puede hacer con SQL suelto, es que falta una operación de dominio.

### Principio rector aplicado a este módulo

El MASTER_PLAN exige poder reconstruir exactamente qué vio un estudiante. El corolario para el
panel es más duro: **toda acción de staff sobre datos de alumno deja rastro en `audit_log`, con
el `before` y el `after`**. Un administrador que no puede explicar por qué un intento cambió de
nota es un fallo del módulo, no del administrador.

---

## 2. Arquitectura

```
apps/web/app/(admin)/
├── layout.tsx                 guard de rol + navegación + <SkipLink>
├── schools/                   [superadmin]
├── users/                     staff, invitaciones, roles
├── registrations/             cola de aprobación
├── students/                  fichas, códigos, PIN, secciones
├── curriculum/                materias, cursos, módulos, lecciones, skills
├── content/                   editor de bloques de lección + media
├── questions/                 banco, editor, versiones, revisión
├── exams/                     blueprints, secciones, asignaciones
├── attempts/[id]/             reconstrucción forense de un intento
└── audit/                     visor de audit_log
```

**Reparto de capas.** Server Components por defecto para todo lo que es lectura; islas cliente
solo donde hay edición real. Las mutaciones son **Server Actions** que:

1. validan la entrada con el esquema Zod de `@cet/shared` (misma frontera que el cliente);
2. comprueban la autorización **en el servidor**, sin fiarse de que la UI ocultara el botón;
3. ejecutan la operación;
4. escriben en `audit_log` **dentro de la misma transacción** que la operación.

El punto 4 no es opcional ni se hace "después con un trigger de conveniencia": si el audit va
fuera de la transacción, existe un intervalo en el que la acción ocurrió y no consta.

**Dos niveles de alcance.** `superadmin` no pertenece a ningún colegio y ve la biblioteca global
(`school_id IS NULL`) más todos los colegios. `school_admin` ve exclusivamente su `school_id`.
Esa diferencia se resuelve en RLS (M01), y la UI **refleja** el alcance; nunca lo determina.

**Autoría de contenido y versionado.** El editor de preguntas nunca modifica una
`question_versions` publicada: crea una versión nueva. Un examen ya materializado apunta a la
versión que existía entonces, y así sigue siendo reconstruible. La UI debe hacer esto obvio: al
editar una pregunta publicada el botón dice "Crear versión 4", no "Guardar".

---

## 3. Tablas

Este módulo **lee y escribe casi todo el esquema**. No define tablas propias salvo una.

| Tabla | Uso desde el panel |
|---|---|
| `schools` | CRUD (solo superadmin), configuración de etapa y longitud de PIN (AD-4) |
| `profiles` | alta de staff, cambio de rol, estado `pending`/`active`/`suspended` |
| `students` | ficha, código, regeneración de PIN, asignación a secciones |
| `registration_requests` | cola de aprobación: `pending` → `approved` \| `rejected` |
| `sections`, `section_members` | clases y matrícula |
| `subjects`, `courses`, `school_courses` | catálogo y activación por colegio |
| `course_modules`, `lessons` | estructura curricular |
| `skills`, `lesson_skills` | taxonomía de mastery y su vínculo con lecciones |
| `lesson_blocks` | editor de bloques (`rule`, `example`, `tip`, `warning`, `steps`, …) |
| `media_assets` | subida a Storage; `alt_text` es **NOT NULL** y el formulario lo exige |
| `questions`, `question_versions` | banco y versionado inmutable |
| `exam_blueprints`, `exam_blueprint_sections` | diseño de exámenes |
| `exam_assignments` | asignación a secciones y ventana temporal |
| `exam_attempts`, `attempt_items`, `attempt_responses`, `attempt_gradings` | **solo lectura** desde el panel, para el visor forense |
| `learning_events` | solo lectura, para la línea de tiempo del intento |
| `skill_mastery` | solo lectura |
| `audit_log` | escritura en cada mutación; lectura en el visor |
| `auth_attempts` | lectura: detección de fuerza bruta contra PINs |

### Única tabla propia

```
admin_saved_views
  id uuid pk
  school_id uuid null            -- null = vista global de superadmin
  owner_id uuid not null → profiles on delete cascade
  scope text not null            -- 'audit' | 'questions' | 'students' | 'attempts'
  name text not null
  filters jsonb not null default '{}'
  created_at timestamptz not null default now()
  unique (owner_id, scope, name)
```

Existe porque el visor de auditoría sin filtros guardados es inservible en un colegio con mil
alumnos. `filters` es jsonb **validado por Zod por `scope`**, igual que `lesson_blocks.content`.

### Índices que este módulo necesita

Se declaran en las migraciones de M01/M11, pero los pide el panel y por eso constan aquí:

- `audit_log (school_id, created_at desc)` — el visor por defecto.
- `audit_log (entity_type, entity_id, created_at desc)` — "qué le pasó a este alumno".
- `audit_log (actor_id, created_at desc)` — "qué hizo este profesor".
- `registration_requests (school_id, status, created_at)` — la cola.
- `question_versions (question_id, version desc)` — historial de una pregunta.
- `attempt_responses (attempt_item_id, revision)` — la query forense de DATA_MODEL §10.

---

## 4. APIs

Nomenclatura: `dominio.verboEnPasado` para el `action` de `audit_log`; el nombre de la Server
Action es el infinitivo.

### Colegios (superadmin)

| Operación | Entrada | Audita como |
|---|---|---|
| `createSchool` | nombre, slug, `stage`, `pin_length`, locale | `school.created` |
| `updateSchoolSettings` | id + campos | `school.updated` |
| `suspendSchool` | id, motivo | `school.suspended` |

> `suspendSchool` **no borra nada**. Suspender un colegio corta el acceso; los datos de alumno
> siguen ahí porque puede haber un requerimiento legal o una reclamación de nota abierta.

### Usuarios y registros

| Operación | Notas | Audita como |
|---|---|---|
| `inviteStaff` | email + rol; crea `profiles` en `pending` | `user.invited` |
| `approveRegistration` | crea perfil y, si es alumno, ficha + PIN inicial | `registration.approved` |
| `rejectRegistration` | motivo obligatorio | `registration.rejected` |
| `changeRole` | prohibido auto-elevarse (ver §6) | `user.role_changed` |
| `suspendUser` | corta sesión activa | `user.suspended` |
| `resetStudentPin` | genera PIN nuevo, fuerza cambio en el primer login | `student.pin_reset` |

> `resetStudentPin` devuelve el PIN en claro **una sola vez**, en la respuesta de la acción. No se
> guarda en claro, no se envía por email y no aparece en `audit_log`: en el log consta que se
> reseteó, nunca el valor.

### Contenido y preguntas

| Operación | Notas | Audita como |
|---|---|---|
| `upsertLessonBlock` | `content` validado por Zod según `kind` | `content.block_saved` |
| `reorderLessonBlocks` | lista de ids en orden | `content.blocks_reordered` |
| `uploadMedia` | exige `alt_text` en los dos idiomas activos | `media.uploaded` |
| `createQuestionVersion` | **nunca** modifica una versión publicada | `question.version_created` |
| `publishQuestionVersion` | `draft` → `in_review` → `published` | `question.published` |
| `retireQuestion` | no borra: las versiones siguen referenciadas por intentos | `question.retired` |

### Exámenes

| Operación | Notas | Audita como |
|---|---|---|
| `saveBlueprint` | secciones, pesos, `source` (`bank`/`generated`/`mixed`) | `exam.blueprint_saved` |
| `assignExam` | sección + ventana temporal + duración | `exam.assigned` |
| `unassignExam` | rechazado si ya hay intentos empezados | `exam.unassigned` |
| `extendExamWindow` | motivo obligatorio | `exam.window_extended` |
| `voidAttempt` | `attempt_status` → `voided`, motivo obligatorio | `attempt.voided` |
| `requestRegrade` | delega en M10; el panel no calcula notas | `attempt.regrade_requested` |

### Auditoría

| Operación | Notas |
|---|---|
| `listAuditEvents` | filtros: colegio, actor, tipo de entidad, entidad, rango de fechas; paginación por cursor (`created_at`, `id`), nunca `OFFSET` |
| `reconstructAttempt` | la query de DATA_MODEL §10, servida como línea de tiempo |
| `exportAuditCsv` | la exportación se audita a su vez: `audit.exported` |

---

## 5. Frontend

Construido **íntegramente** sobre `@cet/ui`. El panel no define componentes visuales propios;
si necesita uno nuevo, va a `packages/ui`.

| Necesidad | Componente |
|---|---|
| Tablas de usuarios, preguntas, auditoría | `Table` (scroll horizontal con `tabIndex`) |
| Formularios | `Input`, `Select`, `Checkbox`, `RadioGroup` |
| Confirmaciones destructivas | `Dialog` con confirmación explícita |
| Estados de carga y vacíos | `Skeleton`, `EmptyState` |
| Fallos | `ErrorState` (aquí **sí** con referencia técnica: el público es staff) |
| Previsualización de lección | `LessonBlock`, `RuleBox`, `TipBox`, `WarningBox`, `StepList` |
| Previsualización de pregunta | `QuestionCard` + `ChoiceList` / `NumericInput` / `FractionInput` |
| Métricas | `StatTile`, `ProgressBar`, `MasteryMeter`, `ScoreRing` |
| Avisos | `Alert`, `Toast` |

### Reglas de UI del panel

1. **El público es staff adulto, no niños.** Aquí sí caben densidad de información, atajos de
   teclado y mensajes de error con detalle técnico. Es la única parte del producto donde el tono
   cambia — y `ErrorState` acepta `reference` justamente para esto.
2. **Previsualización obligatoria.** Ningún bloque de lección ni ninguna pregunta se publica sin
   verse antes exactamente como la verá el alumno, en los dos idiomas y en los dos temas.
3. **El HTML del editor pasa por `sanitizeHtml` de `@cet/ui` en el servidor antes de guardarse,
   y otra vez al renderizarse.** Sanear solo al guardar deja expuesto todo lo que ya está en la
   base de datos; sanear solo al pintar deja basura persistida. Se hace en los dos sitios.
4. **Cero strings hardcodeados** (AD-7). El panel se usa en es y en en.
5. **WCAG 2.1 AA también aquí.** Un profesor con baja visión es tan usuario como un alumno.
6. **Nada de borrado real desde la UI.** Suspender, retirar, anular. El borrado en cascada existe
   (y está verificado en M01) pero se ejecuta fuera de banda, no con un botón rojo.

---

## 6. Seguridad

Este es el módulo con más superficie de la plataforma. Reglas, en orden de importancia:

1. **RLS es la última palabra, no la UI.** Toda Server Action se ejecuta con la sesión del usuario.
   Nada de `service_role` en las rutas del panel. Si una operación *necesita* privilegio elevado
   (crear un colegio), va en una Edge Function con `security definer` y `search_path` fijado, con
   la comprobación de rol dentro de la función.

2. **MFA obligatoria para `superadmin` y `school_admin`** (AD-3). Sin segundo factor no se entra
   al panel, aunque la contraseña sea correcta.

3. **Escalada de privilegios.** `changeRole` rechaza:
   - que un usuario se cambie el rol a sí mismo;
   - que un `school_admin` conceda `superadmin`;
   - que un `school_admin` toque un perfil de otro `school_id`.
   Las tres comprobaciones van **en la base de datos** (constraint o función), no solo en la
   Server Action: la acción es la primera barrera, no la única.

4. **La clave de respuesta.** `attempt_items.answer_key` y `question_versions.answer_spec` están
   revocadas por columna para `authenticated` (DATA_MODEL §9). El visor forense las muestra a
   staff autorizado a través de una vista propia con `security definer`, y **cada consulta a esa
   vista se audita**. Ver la clave de un examen en curso es un evento, no una lectura más.

5. **Acceso a datos de alumno.** Toda lectura de staff sobre datos identificables de un menor
   —ficha, intento, respuestas— escribe en `audit_log`. Es una exigencia del tratamiento de datos
   de menores del MASTER_PLAN §9, no una preferencia.

6. **Sanitización.** El editor de contenido es la fuente de todo el HTML que acaba en la pantalla
   de un alumno. `@cet/ui/sanitize` es la única frontera autorizada, y `packages/ui/REVIEW.md`
   documenta la regla y la batería de XSS que la respalda. Un autor malicioso o descuidado no
   puede inyectar script en una lección.

7. **Rate limiting** en aprobación de registros, reseteo de PIN y exportación de auditoría. Un
   script con una sesión de admin robada no debe poder vaciar el colegio en un minuto.

8. **Exportaciones.** Todo CSV lleva marca de agua con el actor y la fecha, y la exportación se
   audita. Sin esto, una filtración es imposible de atribuir.

9. **Sesiones de staff** más cortas que las de alumno, y revocables desde el propio panel.

---

## 7. Pruebas

| Capa | Herramienta | Qué se prueba |
|---|---|---|
| RLS | pgTAP | un `school_admin` de A **no** ve, edita ni audita nada de B — para cada una de las tablas del §3 |
| RLS | pgTAP | `authenticated` no puede leer `answer_key` ni `answer_spec` por ninguna vía |
| Escalada | pgTAP | los tres casos de `changeRole` del §6 fallan a nivel de base de datos |
| Auditoría | pgTAP | cada mutación del §4 deja exactamente una fila en `audit_log`, con `before` y `after` |
| Auditoría | pgTAP | si la operación revierte, **no** queda fila de audit (misma transacción) |
| Forense | pgTAP | `supabase/tests/forensic_reconstruction.sql` reconstruye un intento completo |
| Versionado | Vitest | editar una pregunta publicada crea versión nueva; los intentos previos siguen apuntando a la vieja |
| Validación | Vitest | cada `content.kind` rechaza un payload que no encaja con su esquema Zod |
| Sanitización | Vitest | el HTML del editor pasa por `sanitizeHtml` al guardar **y** al pintar (test de doble barrera) |
| e2e | Playwright | aprobar un registro → el alumno entra con su PIN |
| e2e | Playwright | crear pregunta → publicar → aparece en un blueprint → sale en un intento |
| e2e | Playwright | anular un intento → cambia de estado y consta en auditoría |
| a11y | Playwright + axe | cero violaciones en las 10 pantallas del panel, en los dos temas |
| Casos límite | Vitest | doble aprobación del mismo registro, desasignar un examen ya empezado, reset de PIN concurrente |

**Regla de cobertura:** cada operación del §4 necesita al menos un test del camino de fallo, no
solo del feliz. El camino feliz de un panel de administración casi nunca es donde está el daño.

---

## 8. Criterios de finalización

El módulo está terminado cuando **todo** esto es cierto y está demostrado ejecutando, no
afirmado:

- [ ] Superadmin **Roberto Mendizabal** entra con MFA y opera los siete dominios del §1.
- [ ] Un `school_admin` de un colegio demo **no puede** ver ni un solo registro de otro colegio,
      y hay pgTAP que lo prueba tabla por tabla.
- [ ] Los tres casos de escalada de privilegios del §6 fallan **en la base de datos**.
- [ ] Toda mutación del §4 escribe en `audit_log` con `before` y `after`; una operación revertida
      no deja rastro huérfano.
- [ ] El visor forense reconstruye un intento completo desde la interfaz: qué vio, en qué orden,
      qué versión, qué respondió, cuántas veces cambió de opinión y cómo se calificó.
- [ ] Toda lectura de staff sobre datos de alumno queda auditada.
- [ ] El editor de contenido no puede publicar HTML con script: batería de XSS del panel en verde.
- [ ] Editar una pregunta publicada crea versión nueva, con test que verifica que un intento
      anterior sigue reconstruyéndose igual.
- [ ] `alt_text` es obligatorio en la subida de media y el formulario no deja saltárselo.
- [ ] Panel completo en es y en, sin un solo string hardcodeado.
- [ ] axe sin violaciones en las 10 pantallas, en tema claro y oscuro.
- [ ] Todo el panel operable solo con teclado, incluido el visor forense.
- [ ] Exportación de auditoría con marca de agua, auditada y limitada por rate limit.
- [ ] `pnpm verify` en verde y CI pasando.
