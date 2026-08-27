# M07 · `questions` — Banco de preguntas

> Contrato del módulo. El código vive en `packages/engine/`, `supabase/migrations/` y
> `apps/web/`; aquí está lo que ese código tiene que cumplir.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.

**Depende de:** M05 `curriculum` (skills, cursos) · M01 `security` (RLS)
**Le sirve a:** M08 `exams`, M09 `exam-engine`, M10 `grading`, M11 `analytics`

---

## 1. Objetivo

Guardar preguntas de forma que **un intento de hace dos años siga siendo interpretable**
aunque la pregunta se haya editado seis veces desde entonces.

De ahí las dos reglas del módulo:

1. **La identidad y el contenido son tablas distintas.** `questions` es la identidad
   estable; `question_versions` es el snapshot inmutable.
2. **Hay dos clases de pregunta.** `static` (contenido fijo, autorado) y `generated`
   (paramétrica: `engine_key` + `param_spec` resueltos por `@cet/engine`). Una pregunta
   generada guarda la *receta*, no el resultado; el resultado concreto que vio un alumno
   se congela en `attempt_items.rendered_body`.

---

## 2. Arquitectura

```
questions (identidad)  ──1:N──▶  question_versions (snapshots inmutables)
    │                                   │
    │ current_version_id ───────────────┘
    │
    └─ skill_id ──▶ skills          (mastery, M11)
       course_id ──▶ courses
       school_id ──▶ schools | NULL  (AD-2: NULL = biblioteca global)
```

Para `kind = 'generated'`:

```
question_versions.body = { engine_key: "math.fracop", param_spec: { ops: ["add","sub"] } }
                                │
                                ▼
                    @cet/engine registry.generate(engine_key, params, item_seed)
                                │
                                ▼
                    { body: RenderedBody, answerKey: AnswerKey, hint, solution }
```

**El motor es la única fuente de verdad de qué produce un `engine_key`.** Ni la UI de
autoría ni la Edge Function reimplementan nada: llaman a `@cet/engine`.

### Generadores disponibles (Hito 1)

| `engine_key` | skill | Formato | Portado de |
|---|---|---|---|
| `math.simplify` | `math.fractions.simplify` | fraction | `GEN.simplify` |
| `math.compare` | `math.fractions.compare` | short_text | `GEN.compare` |
| `math.fracop` | `math.fractions.operations` | fraction | `GEN.fracop` |
| `math.mixed` | `math.fractions.mixed_numbers` | fraction | `GEN.mixed` |
| `math.decimal` | `math.decimals.multiply_divide` | numeric | `GEN.decimal` |
| `math.powten` | `math.decimals.powers_of_ten` | numeric | `GEN.powten` |
| `math.metric` | `math.measurement.metric_conversion` | numeric | `GEN.metric` |
| `math.shape` | `math.geometry.compound_shapes` | numeric | `GEN.shape` |
| `math.word` | `math.problem_solving.word_problems` | short_text | `GEN.word` |

`listEngineKeys()` los enumera en tiempo de ejecución; el panel de autoría **no** debe
llevar la lista hardcodeada.

---

## 3. Tablas

Definición completa en `DATA_MODEL.md` §4. Lo que este módulo exige:

| Tabla | Reglas duras |
|---|---|
| `questions` | `school_id` nullable (AD-2). `current_version_id` apunta a la versión publicada. Borrado en cascada hacia `question_versions` |
| `question_versions` | **Nunca UPDATE.** Trigger `question_versions_immutable` en `BEFORE UPDATE` → `RAISE EXCEPTION`. `unique (question_id, version)` |
| `question_versions.answer_spec` | La clave de corrección. `revoke select (answer_spec) … from authenticated`. Un alumno no puede leerla ni por accidente ni forzando un id |
| `question_versions.body` | `static`: `RenderedBody`. `generated`: `{engine_key, param_spec}`. Validado con Zod en la frontera **y** con un `check` en la DB |
| `question_versions.locale` | El idioma en que se autoró. Para `generated` es el que se le pasa al motor por defecto |

`on delete restrict` desde `attempt_items.question_version_id`: **nunca** se borra una
versión que algún intento usó. La integridad histórica gana sobre limpiar el banco.

---

## 4. APIs

### Server (Next.js Server Actions / Edge Functions)

| Operación | Regla |
|---|---|
| `createQuestion(input)` | Crea identidad + versión 1 en `draft`. `school_id` = el del autor salvo superadmin |
| `publishVersion(questionId, versionId)` | Mueve `current_version_id`. No toca la versión |
| `editQuestion(questionId, input)` | **Crea una versión nueva.** Nunca hace UPDATE sobre una existente |
| `previewGenerated(engineKey, paramSpec, seed)` | Llama a `@cet/engine`. Con semilla explícita para que el autor vea siempre lo mismo, y con un botón "otra semilla" |
| `retireQuestion(id)` | `status = 'retired'`. No borra: los intentos históricos la siguen referenciando |

### Contrato con `@cet/engine`

```ts
import { generate, listEngineKeys, registry } from "@cet/engine";

const item = generate(engineKey, paramSpec, seed);   // valida clave, params y semilla
registry.get(engineKey).paramsSchema;                // esquema Zod para pintar el formulario
```

Errores que hay que tratar, no tragarse:
`UnknownEngineKeyError` (clave inexistente) · `InvalidParamsError` (`param_spec` que no
cumple el esquema del generador) · `InvalidGeneratedItemError` (bug del generador).

---

## 5. Frontend

- **Listado del banco:** filtros por curso, skill, dificultad, estado, tipo y colegio.
  Server Component; la paginación va por keyset, no por `OFFSET`.
- **Editor de pregunta estática:** enunciado con marcado restringido (negrita, cursiva,
  subíndice, superíndice, fracción apilada). El editor ofrece **solo** esa allowlist; no
  hay campo de HTML libre.
- **Editor de pregunta generada:** se elige `engine_key`, el formulario se pinta a partir
  de `paramsSchema`, y al lado hay una **vista previa en vivo** con tres semillas fijas y
  un botón de resortear. El autor ve lo mismo que verá el alumno, incluida la figura.
- **Historial de versiones:** diff entre versiones, quién y cuándo. Nada es editable.
- **Accesibilidad:** el editor obliga a rellenar `figureAlt` si hay figura. Sin alt no se
  publica. El alt debe describir **lo que se ve, ni un dato más** (ver H-04 del REVIEW).

---

## 6. Seguridad

- RLS en `questions` y `question_versions` con el patrón híbrido AD-2:
  `school_id is null or school_id = app.current_school_id()`.
- Escritura solo para `teacher`, `school_admin` y `superadmin`; `student` **no lee nunca**
  estas tablas: lo que ve el alumno sale de `attempt_items` / `lesson_blocks`.
- `answer_spec` revocada por columna para `authenticated`. Defensa en profundidad: aunque
  una política falle, el `GRANT` sigue bloqueando.
- Todo el HTML autorado pasa por `sanitizeStem` de `@cet/engine` al guardar **y** por el
  sanitizador de `@cet/ui` al pintar. Dos muros, no uno.
- Audit log de creación, publicación y retirada.

---

## 7. Pruebas

**Unit (`packages/engine`, ya en verde):** determinismo de los 9 generadores sobre 100
semillas · variedad sobre 200 semillas · corrección matemática comprobada de forma
independiente · 54.000 items en fuzz.

**pgTAP:**
- Un `UPDATE` sobre `question_versions` lanza excepción.
- Un profesor del colegio A no ve preguntas privadas del colegio B.
- Un `student` recibe 0 filas de `question_versions`.
- `select answer_spec` como `authenticated` falla por permisos.
- No se puede borrar una versión referenciada por un `attempt_item`.

**e2e:** crear pregunta generada → previsualizar → publicar → aparece en un blueprint →
sale en un examen.

---

## 8. Criterios de finalización

- [ ] `questions` y `question_versions` migradas, con RLS y con el trigger de inmutabilidad
- [ ] `answer_spec` inaccesible para `authenticated` (verificado por pgTAP)
- [ ] Los 9 `engine_key` de Math registrados y con vista previa en el panel
- [ ] Editar una pregunta crea versión nueva; la anterior sigue intacta
- [ ] `figureAlt` obligatorio cuando hay figura
- [ ] Banco sembrado con Math Y6 suficiente para llenar el blueprint del Hito 2
