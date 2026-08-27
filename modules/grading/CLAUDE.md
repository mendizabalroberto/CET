# M10 · `grading` — Corrección

> Contrato del módulo. El código vive en `packages/engine/src/grading/`,
> `supabase/functions/` y `apps/web/`; aquí está lo que ese código tiene que cumplir.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.

**Depende de:** M09 `exam-engine`
**Le sirve a:** M11 `analytics`, M12 `admin`

---

## 1. Objetivo

Convertir respuestas en notas de forma **explicable, reproducible y recalificable**.

Tres reglas que mandan sobre el resto:

1. **Nadie corrige dos veces la misma respuesta de dos maneras distintas.** El corrector
   es una función pura de `@cet/engine` y es el mismo en la práctica del navegador y en
   la corrección autoritativa del servidor (AD-6).
2. **Toda nota lleva su porqué.** `attempt_gradings.rationale` guarda en texto por qué se
   dio esa puntuación. Un profesor tiene que poder responder a una reclamación sin leer
   código.
3. **Recalificar no borra.** Una recalificación es una fila nueva encadenada por
   `supersedes_id`. La nota anterior sigue existiendo.

---

## 2. Arquitectura

```
attempt_responses (is_final) ──┐
                               ├──▶ grade(response, answerKey, maxPoints) ──▶ GradingResult
attempt_items.answer_key ──────┘            (@cet/engine, puro)                    │
                                                                                   ▼
                                                                         attempt_gradings
                                                                                   │
                                            ┌──────────────────────────────────────┤
                                            ▼                                      ▼
                              requiresManualReview = true              score_raw / score_pct / passed
                                    (cola del profesor)                     en exam_attempts
```

`grade` es una función pura: `(StudentResponse, AnswerKey, maxPoints) → GradingResult`,
sin efectos, sin reloj, sin red. Eso es lo que la hace testeable y reproducible: corregir
el mismo intento un año después da el mismo resultado.

### Un corrector por variante de `AnswerKey`

| Variante | Regla | Crédito parcial |
|---|---|---|
| `choice` | Conjuntos: aciertos ∩ clave, fallos ∉ clave | `max(0, (aciertos − fallos) / total)`. Marcar todo con 2 correctas de 4 da **0** |
| `numeric` | `parseAnswerReadings` + tolerancia (mínimo 1e-9 para absorber la fuzz binaria) | No |
| `fraction` | Igualdad por productos cruzados. `requireSimplest` juzga la **forma escrita**, no el valor | No |
| `text` | Normaliza espacios, `caseSensitive`, `ignoreDiacritics` | No |
| `ordering` | Elementos en su posición absoluta correcta | `aciertos / total` |
| `matching` | Parejas correctas; una izquierda asignada dos veces solo cuenta la primera | `parejas correctas / total` |
| `manual` | No corrige: marca `requiresManualReview` y deja 0 hasta que un humano la toque | — |

### El caso crítico: equivalencia numérica

`7/4`, `1 3/4`, `1.75` y `1,75` son **la misma respuesta correcta**, igual que en
`parseAns` de los trainers Y6A. Se consigue parseando a fracción exacta y comparando
valores, nunca cadenas.

Y una vuelta de tuerca que el original no tenía: en un examen en español la clave se
**muestra** como `41.000 m`, y el alumno la teclea tal cual. Como la firma `Grader` del
contrato no recibe el idioma, el motor **no adivina**: `parseAnswerReadings` devuelve
todas las lecturas plausibles (`"41.000"` → `[41000, 41]`) y el corrector acepta si alguna
coincide con la clave. Los formatos completos (`1,234.5`, `1.234,5`) no son ambiguos.
Lo ilegible (`"1,2,3"`) se rechaza; no se inventa.

---

## 3. Tablas

`attempt_gradings` (`DATA_MODEL.md` §6):
`points_awarded`, `max_points`, `is_correct`, `partial_ratio`, `graded_by` (`auto`/`manual`),
`grader_id`, `rationale`, `rubric_snapshot`, `graded_at`, `supersedes_id`.

Reglas:
- `check (points_awarded >= 0 and points_awarded <= max_points)`. El estado inválido tiene
  que ser imposible, no improbable.
- `supersedes_id` self-FK: la cadena de recalificaciones. **Nunca `DELETE`.**
- La nota vigente de un item es la fila sin sucesor.
- `rubric_snapshot` congela la rúbrica usada: si mañana la cambian, esta nota se sigue
  entendiendo.
- Índice `(attempt_item_id, graded_at desc)`.

En `exam_attempts`: `score_raw`, `score_max`, `score_pct`, `passed`, `graded_at`. Se
recalculan enteros tras cada recalificación, nunca se ajustan a mano.

---

## 4. APIs

### `grade-attempt` (Edge Function, `service_role`)
1. Lee items + `answer_key` + última respuesta `is_final`.
2. Para cada uno: `gradeUnknown(response, answerKey, maxPoints)` — la variante defensiva,
   que valida con Zod lo que viene de la DB. Una respuesta corrupta se trata como
   respuesta en blanco: **un dato roto no puede dejar sin corregir el intento entero**.
3. Inserta `attempt_gradings` en bloque.
4. Si algún item tiene `requiresManualReview`, el intento queda `grading`; si no, `graded`.
5. Recalcula los totales y `passed` con `pass_threshold`.

Idempotente: si el intento ya está `graded` no vuelve a insertar (a menos que sea una
recalificación explícita).

### `regrade(attemptItemId, points, rationale, graderId)`
Inserta una fila nueva con `supersedes_id` apuntando a la vigente y `graded_by = 'manual'`.
Recalcula el total. Escribe en el audit log **siempre**: cambiar una nota es un acto que
deja rastro.

### `regradeAll(assignmentId, reason)`
Recalifica un examen entero (típico: se descubre una clave mal puesta). Corre en lote,
encadena `supersedes_id` y notifica a los afectados. Solo `school_admin` y `superadmin`.

---

## 5. Frontend

- **Alumno:** ve la nota cuando `feedback_mode` lo permite y el intento está `graded`.
  Pregunta a pregunta: lo que respondió, si era correcta, la respuesta canónica y la
  solución paso a paso (el `sol:` de los trainers Y6A). Nunca antes de entregar.
- **Profesor — cola de corrección manual:** lista de items `requiresManualReview` con la
  rúbrica al lado, campo de puntuación y de comentario. Navegación con teclado entre
  items, porque se corrigen treinta seguidos.
- **Profesor — vista forense del intento:** la reconstrucción completa. Enunciado literal,
  orden de opciones, todas las revisiones de la respuesta con su hora de servidor, y la
  cadena de calificaciones. Es la pantalla que se enseña en una reclamación.
- **Recalificar:** exige motivo escrito. Se ve la nota anterior tachada, no desaparecida.
- El `rationale` que produce el motor está en castellano y es legible tal cual; la UI lo
  muestra sin traducirlo a "correcto/incorrecto".

---

## 6. Seguridad

- La corrección de examen ocurre **solo** en el servidor. El `grade` del navegador es para
  práctica; su resultado nunca se persiste como nota de examen.
- Un alumno no puede leer `answer_key` ni `attempt_gradings` de otro. RLS por `school_id`
  y por `student_id`.
- Solo `teacher`/`school_admin`/`superadmin` recalifican, y solo dentro de su colegio.
- Toda recalificación va al audit log con autor, momento, valor anterior y motivo.
- `maxPoints` inválido (0, `NaN`) **lanza**: es un bug de quien llama, no un cero para el
  alumno. Un cero silencioso por un bug es lo peor que puede pasar aquí.

---

## 7. Pruebas

**Unit (`packages/engine`, en verde):**
- Tabla exhaustiva de equivalencia: 14 escrituras de `7/4` aceptadas, 20 rechazadas.
- `requireSimplest`: `6/8` rechazado, `1 6/8` rechazado, `0.75` aceptado.
- Separadores en los dos idiomas: `41.000`, `41,000`, `1.234,5`, `1,234.5`.
- Crédito parcial real en `choice`, `ordering` y `matching`, incluidos los casos de
  "marcarlo todo" y "emparejar todo con todo".
- Respuesta del tipo equivocado → 0 con explicación, **sin lanzar**.
- `gradeUnknown` con clave corrupta lanza; con respuesta corrupta corrige como blanco.
- La nota nunca sale de `[0, maxPoints]`.
- 54.000 items de fuzz: escribir la respuesta canónica siempre se corrige como correcta.

**pgTAP:** el `check` de `points_awarded` · un alumno no lee calificaciones ajenas · la
cadena `supersedes_id` no admite ciclos.

**e2e:** entregar → nota automática → el profesor recalifica → el alumno ve la nota nueva
y el histórico queda.

---

## 8. Criterios de finalización

- [ ] Un corrector implementado y testeado por cada variante de `AnswerKey`
- [ ] `7/4` = `1 3/4` = `1.75` = `1,75` demostrado por tabla exhaustiva
- [ ] Crédito parcial real (no todo-o-nada) en `ordering`, `matching` y `mcq_multi`
- [ ] Toda nota lleva `rationale` legible
- [ ] Recalificación encadenada, sin borrado, con audit log
- [ ] Los totales del intento se recalculan enteros tras recalificar
- [ ] La corrección de examen es imposible desde el cliente (verificado por pgTAP y RLS)
