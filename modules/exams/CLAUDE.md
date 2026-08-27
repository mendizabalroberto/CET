# M08 — `exams`

> Blueprints de examen, secciones, asignación a clases y ventanas temporales.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> **Depende de:** M07 `questions`. **Alimenta a:** M09 `exam-engine`.

---

## 1. Objetivo

Definir **qué examen se pone, a quién y cuándo** — sin materializar todavía nada.

La distinción con M09 es la que sostiene todo el módulo:

| | M08 `exams` | M09 `exam-engine` |
|---|---|---|
| Objeto | La *plantilla* | El *intento* |
| Momento | Antes | Durante y después |
| Tablas | `exam_blueprints`, `exam_blueprint_sections`, `exam_assignments` | `exam_attempts`, `attempt_items`, `attempt_responses` |
| Mutabilidad | Editable mientras no haya intentos | Inmutable en cuanto arranca |

Un blueprint es una **receta**: "8 preguntas de fracciones de dificultad 2–3, 6 de
medida, 4 problemas". No es una lista de preguntas. Esa es la razón de que dos
alumnos reciban exámenes distintos y comparables a la vez.

El módulo es el equivalente estructurado del array `MPARTS` de los trainers Y6A,
que ya define secciones con recuento de ítems. Lo que se añade es persistencia,
versionado, propiedad por colegio y ventanas temporales.

---

## 2. Arquitectura

```
exam_blueprints ──< exam_blueprint_sections
        │
        └──< exam_assignments ──> sections (una clase)
                    │
                    └── (M09) exam_attempts
```

### Decisiones

**El blueprint se versiona; la asignación congela la versión.**
`exam_assignments.blueprint_version` guarda el número de versión vigente en el
momento de asignar. Si un profesor edita el blueprint el martes, el examen que
un alumno empezó el lunes sigue siendo el que era. Sin esto, "editar un examen"
reescribiría exámenes ya realizados.

**La selección de preguntas es declarativa, no imperativa.**
`exam_blueprint_sections.selection` es un jsonb
`{skill_ids:[], difficulty:{min,max}, question_kind, tags:[]}`. El motor lo
resuelve al arrancar el intento, con la semilla de ese intento. Guardar una lista
fija de `question_id` haría imposible que dos alumnos tuvieran exámenes distintos
y ataría el examen a preguntas que quizá se retiren.

**`source` decide de dónde salen los ítems:**
`bank` (preguntas publicadas), `generated` (generadores de `@cet/engine` con
`param_spec`), `mixed`. Una sección `generated` no consume el banco: produce
ítems nuevos y deterministas a partir de `(engine_key, params, seed)`.

**Las ventanas se evalúan en la zona horaria del colegio.**
`opens_at`/`closes_at` son `timestamptz`, pero la comparación de "¿está abierto?"
usa `schools.timezone`. Un colegio en Bogotá y otro en Madrid no comparten la
medianoche.

**Validación de coherencia antes de publicar.** Un blueprint cuyo `selection` no
puede satisfacerse (pide 8 preguntas de una skill que solo tiene 3 publicadas)
**no se puede publicar**. Descubrirlo cuando 30 alumnos pulsan "empezar" es
inaceptable. Se resuelve con una función `app.validate_blueprint(id)` que M08
expone y el panel llama antes de cambiar el `status` a `published`.

---

## 3. Tablas

Contrato completo en `DATA_MODEL.md` §5. Resumen y notas de implementación:

### `exam_blueprints`
`id`, `school_id` (nullable, AD-2), `course_id`, `title` I18nText,
`description` I18nText, `duration_seconds`, `shuffle_questions`,
`shuffle_options`, `allow_back`, `feedback_mode`, `pass_threshold`,
`max_attempts`, `status`, `version` int, `created_by`.

- `check (duration_seconds > 0)`, `check (pass_threshold between 0 and 100)`.
- Índice `(course_id, status)`: la consulta real es "blueprints publicados de
  este curso".
- **`version` se incrementa por trigger** en cada UPDATE de un blueprint
  publicado. Si se deja a la aplicación, alguien se lo salta.

### `exam_blueprint_sections`
`id`, `blueprint_id` **on delete cascade**, `ord`, `title` I18nText,
`item_count`, `selection` jsonb, `source`, `points_per_item`.

- `unique (blueprint_id, ord)`.
- `check (item_count > 0)` — una sección de 0 preguntas es un estado inválido,
  no un caso límite que gestionar en el motor.
- `selection` se valida con un esquema Zod de `@cet/shared` mediante trigger.

### `exam_assignments`
`id`, `blueprint_id`, `blueprint_version`, `school_id` **not null**,
`section_id`, `opens_at`, `closes_at`, `max_attempts`,
`time_limit_override_seconds`, `assigned_by`, `created_at`.

- `check (closes_at > opens_at)`.
- Índice `(school_id, section_id, opens_at desc)`: es la consulta del alumno al
  entrar ("¿qué exámenes tengo?").
- `on delete restrict` desde `exam_attempts`: **nunca** se borra una asignación
  con intentos.

---

## 4. APIs

Todo pasa por Server Actions y Route Handlers de `apps/web`; nada de estas
tablas se escribe desde el cliente con la clave anon.

| Operación | Superficie | Autorización |
|---|---|---|
| Listar blueprints del curso | Server Component | `app.can_read_content(school_id)` |
| Crear / editar blueprint | Server Action | `is_staff()` y `school_id = current_school_id()` |
| Validar blueprint | RPC `app.validate_blueprint(uuid)` | staff del colegio propietario |
| Publicar blueprint | Server Action | school_admin; exige validación verde |
| Asignar a una clase | Server Action | teacher de esa `section` o school_admin |
| Listar mis exámenes (alumno) | Server Component | RLS: su colegio, su sección, ventana abierta |

**Lo que NO expone este módulo:** ni `answer_spec`, ni la resolución del
`selection` a preguntas concretas. Resolver el `selection` es potestad exclusiva
de M09 al arrancar el intento, en el servidor. Si M08 devolviera la lista
resuelta, el alumno vería el examen antes de empezarlo.

---

## 5. Frontend

**Personal (`/teach`, `/admin`):**
- Editor de blueprint: metadatos + secciones arrastrables, con vista previa del
  reparto de puntos y del tiempo por pregunta.
- Panel de validación: por cada sección, cuántas preguntas cumplen el
  `selection` frente a cuántas pide. En rojo si no llega.
- Asignación: elegir clase, ventana temporal en la zona horaria del colegio (se
  muestra explícitamente cuál es), intentos permitidos.

**Alumno (`/exams`):**
- Lista de exámenes disponibles con estado: `próximo`, `abierto`, `cerrado`,
  `ya realizado`. La cuenta atrás se pinta con el reloj del **servidor** enviado
  como `deadline` absoluto, no con `Date.now()` del navegador.
- Un examen fuera de ventana ni siquiera muestra el botón de empezar; y si se
  fuerza la petición, M09 la rechaza. La UI es comodidad, no seguridad.

**i18n:** todo el texto de blueprints y secciones es `I18nText` y se resuelve
con `resolveI18n()` según el idioma del perfil (AD-7).

---

## 6. Seguridad

1. **RLS en las tres tablas.** Contenido híbrido para blueprints
   (`app.can_read_content(school_id)`); `school_id = current_school_id()` en
   `exam_assignments`, que no es contenido global sino dato del colegio.
2. **Escritura solo staff del colegio propietario.** Un blueprint global
   (`school_id is null`) solo lo edita un superadmin.
3. **Un profesor solo asigna a sus propias clases.** La política comprueba
   pertenencia en `section_members` con `role_in_section = 'teacher'`; no basta
   con ser profesor del colegio.
4. **La ventana temporal no es una comprobación de UI.** M09 la vuelve a evaluar
   contra `now()` de la base de datos al arrancar y al entregar.
5. **Auditoría:** publicar un blueprint y asignar un examen escriben en
   `audit_log`. Son las dos acciones que determinan la nota de un menor.
6. **Nada de `security definer` sin `set search_path = ''`** en
   `app.validate_blueprint`.

---

## 7. Pruebas

**pgTAP (`supabase/tests/exams_*.sql`)**
- Un profesor del colegio A no ve, no edita y no asigna blueprints del colegio B.
- Un profesor no puede asignar a una clase de la que no es profesor.
- `closes_at <= opens_at` es rechazado por la constraint.
- Borrar un blueprint con asignaciones falla (`on delete restrict`).
- `item_count = 0` es rechazado.
- Editar un blueprint publicado incrementa `version`.

**Vitest**
- `validate_blueprint`: casos de "preguntas insuficientes", "skill sin
  preguntas publicadas", "sección generated con `engine_key` inexistente".
- Cálculo de ventana en zona horaria: mismo instante UTC, distinto resultado en
  `America/Bogota` y `Europe/Madrid`.

**Playwright**
- Un profesor crea un blueprint, lo valida, lo publica y lo asigna.
- Un alumno ve el examen como `próximo` antes de la ventana y como `abierto`
  dentro de ella.

---

## 8. Criterios de finalización

- [ ] Las tres tablas creadas, con RLS y con todos los `check` del §3.
- [ ] pgTAP verde, incluido el aislamiento entre colegios.
- [ ] `app.validate_blueprint` implementada, con `search_path` fijado, y usada
      como puerta obligatoria antes de publicar.
- [ ] Editor de blueprint funcional en `/teach`, con validación visible.
- [ ] Asignación a una clase con ventana temporal, evaluada en la zona horaria
      del colegio.
- [ ] Lista de exámenes del alumno, con estado correcto en los cuatro casos.
- [ ] Un blueprint de Math Y6 con 3 secciones, publicado y asignado a Y6A,
      listo para que M09 lo materialice.
- [ ] Cero strings hardcodeados: todo el texto en `I18nText` o en diccionario.
