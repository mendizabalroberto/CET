# M09 · `exam-engine` — Ciclo de vida del intento

> Contrato del módulo. El código vive en `packages/engine/`, `supabase/functions/` y
> `apps/web/`; aquí está lo que ese código tiene que cumplir.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.

**Depende de:** M08 `exams` (blueprints, asignaciones) · M01 `security`
**Le sirve a:** M10 `grading`, M11 `analytics`

---

## 1. Objetivo

Aquí vive el principio rector del `MASTER_PLAN`:

> Para cualquier examen terminado, el sistema debe poder reconstruir **exactamente** qué
> vio el estudiante, en qué orden, qué versión de cada pregunta, qué respondió, cuándo,
> cuántas veces cambió de opinión y cómo se calificó — sin depender de la honestidad del
> cliente.

Todo lo que sigue es consecuencia de esa frase. Si alguna decisión de este módulo parece
excesiva, la pregunta correcta es: *¿podría reconstruir este intento dentro de tres años,
en un claustro, delante de un padre que reclama?*

---

## 2. Arquitectura

**AD-5, híbrido por modo.** Práctica y juegos corren en el cliente (feedback < 50 ms,
tolerante a red caída). **Los exámenes corren en el servidor**: la clave nunca sale de la
base de datos y la corrección es autoritativa. **AD-6**: los dos caminos ejecutan el
**mismo** `@cet/engine`, para que no puedan divergir.

```
POST attempt-start                     (Edge Function, service role)
  1  valida asignación: ventana abierta, alumno matriculado, intentos disponibles
  2  ¿hay ya un intento in_progress?  ─── sí ──▶ devuelve ESE (recuperación, no uno nuevo)
  3  genera rootSeed (crypto, 53 bits)
  4  congela blueprint_snapshot
  5  materializeExam({ blueprint, pool, rootSeed })      ← @cet/engine
  6  INSERT exam_attempts + INSERT attempt_items (TODOS, en una transacción)
  7  devuelve los items SIN answer_key
        │
        ▼
  el alumno responde ──▶ POST attempt-answer (autosave)  ──▶ attempt_responses (fila NUEVA)
        │
        ▼
POST attempt-submit
  1  bloquea el intento (SELECT … FOR UPDATE)
  2  ¿status != 'in_progress'? ──▶ devuelve el resultado existente (idempotente)
  3  marca is_final en la última revisión de cada item
  4  status = 'grading' ──▶ M10 corrige con @cet/engine ──▶ status = 'graded'
```

### Materialización

`materializeExam` es determinista: dados `(blueprint_snapshot, pool, rootSeed)` devuelve
siempre los mismos items, byte a byte. Se escribe **el intento entero al arrancar**, no
pregunta a pregunta:

- Si el banco no llega, el examen **no arranca** (`InsufficientPoolError`, con el número
  que falta y los filtros aplicados). Un examen corto en silencio es peor que uno que no
  empieza: nadie se entera hasta que se corrige.
- Si el alumno pierde la red en la pregunta 7, las 20 preguntas ya existen en la DB.

Cada item guarda:

| Columna | Para qué |
|---|---|
| `ord` | El orden **real** de presentación |
| `item_seed` | `deriveItemSeed(attempt.seed, ord)` — regenerable |
| `rendered_body` | El enunciado **literal** que se mostró |
| `option_order` | La permutación aplicada. `shown[i] = original[option_order[i]]`. Sin esto, "eligió la B" no significa nada |
| `answer_key` | La clave congelada. Si mañana editan la pregunta, este intento se sigue corrigiendo con la clave de entonces |
| `question_version_id` | Qué versión exacta (`on delete restrict`) |

Con un único `bigint` (`exam_attempts.seed`) más el blueprint congelado se regenera el
examen completo. `rendered_body` es redundante **a propósito**: es la prueba, no la caché.

---

## 3. Tablas

`exam_attempts` · `attempt_items` · `attempt_responses` · `attempt_gradings`
(definición completa en `DATA_MODEL.md` §6).

Invariantes que la DB debe hacer imposibles de violar:

- `unique (attempt_id, ord)` en `attempt_items`.
- `unique (attempt_item_id, revision)` en `attempt_responses`. **Nunca se hace UPDATE:**
  cada cambio de opinión es una fila nueva. Así se responde "¿cuántas veces cambió?".
- Índice parcial `where is_final` para que la corrección no escanee el histórico.
- `unique (assignment_id, student_id, attempt_number)`.
- `check (server_deadline_at > started_at)`.
- `ip_hash = sha256(ip + salt)`. Nunca la IP en claro: son datos de menores.

---

## 4. APIs

Las tres son Edge Functions con `service_role`, porque tocan `answer_key` y porque el
cliente no puede ser el que decide.

### `attempt-start`
- Verifica: ventana abierta (`opens_at ≤ now < closes_at`), alumno en la sección,
  `attempt_number ≤ max_attempts`.
- **Si ya existe un intento `in_progress`, lo devuelve.** No crea uno nuevo. Esto es la
  recuperación tras caída de red y la defensa contra el doble arranque.
- `server_deadline_at = now() + duración`. Reloj del **servidor**, siempre.
- Devuelve los items **sin `answer_key`** (lee de la vista `attempt_items_student`).

### `attempt-answer` (autosave)
- Cuerpo: `{ attemptId, attemptItemId, response, clientTs, timeOnItemMs }`.
- Rechaza si `status != 'in_progress'` o si `now() > server_deadline_at + gracia`.
- Inserta `attempt_responses` con `revision = max(revision) + 1` **dentro** de la misma
  transacción que calcula el máximo, o con un `unique` que haga imposible el duplicado.
- `server_ts = now()` es la verdad; `client_ts` se guarda solo como dato forense (el reloj
  del alumno puede ir adelantado, y eso también es información).

### `attempt-submit`
- **Idempotente.** Con `SELECT … FOR UPDATE`: si el intento ya está `submitted`/`graded`,
  devuelve el resultado existente en vez de corregir dos veces.
- `submitted_by`: `student` | `timer` | `teacher` | `system`.
- Marca `is_final` y encola la corrección (M10).

---

## 5. Frontend

### El deadline del servidor es la única verdad temporal
El cronómetro del cliente es **decoración**. Se calcula como
`server_deadline_at − server_now`, con el desfase medido en el arranque, y se vuelve a
sincronizar en cada heartbeat. Adelantar el reloj del sistema no regala un segundo:
`attempt-answer` y `attempt-submit` comparan contra `now()` de Postgres.

Cuando el tiempo llega a 0 el cliente llama a `attempt-submit`. Si no lo hace (pestaña
cerrada, portátil apagado), un **job de barrido** cierra los intentos vencidos con
`submitted_by = 'timer'`. La nota no puede depender de que el navegador colabore.

### Autosave
- Se dispara al cambiar de respuesta (debounce ~800 ms), al cambiar de pregunta y cada
  20 s si hay cambios pendientes.
- **Cola local persistente** (IndexedDB). Si el POST falla, la respuesta se queda en la
  cola y se reintenta con backoff exponencial. El alumno ve un indicador de tres estados:
  *guardado* · *guardando* · *sin conexión, tus respuestas están a salvo*.
- El `revision` lo asigna el servidor, no el cliente.

### Recuperación tras caída de red
Al recargar, `attempt-start` devuelve el intento en curso con sus items ya materializados.
El cliente hidrata con la última revisión de cada item (`source = 'restored'`) y fusiona
la cola local pendiente por `client_ts`. **El alumno no pierde nada y no ve preguntas
distintas**: los items ya estaban escritos.

### Doble submit
Tres capas: botón deshabilitado + token de idempotencia en la petición + `FOR UPDATE` en
el servidor. La única que cuenta es la tercera; las otras dos son cortesía.

### Dos pestañas abiertas
Es el caso real: el alumno abre el examen, cambia de pestaña, vuelve a entrar por el
enlace.

1. `attempt-start` devuelve **el mismo** intento, así que las dos pestañas trabajan sobre
   los mismos items. No hay dos exámenes.
2. Un `BroadcastChannel` (o un lock en `localStorage` con heartbeat) elige una pestaña
   **líder**. Las demás pasan a modo solo lectura con un aviso claro: *"Este examen está
   abierto en otra pestaña"*, y un botón para tomar el control (que revoca el liderazgo de
   la otra).
3. Aunque las dos escribieran, el modelo aguanta: `attempt_responses` es append-only y
   gana la última revisión. Nada se pierde y el forense ve las dos escrituras.
4. `attempt-submit` es idempotente, así que dos entregas simultáneas producen una.

### Accesibilidad
Navegación completa por teclado, foco visible, `aria-live` para el estado del autosave,
tiempo restante anunciado a los 10, 5 y 1 minutos, `figureAlt` leído por el lector de
pantalla. Un aviso de error tiene que ser comprensible para un niño de 11 años: *"No hemos
podido guardar. Sigue respondiendo, lo intentamos otra vez solos."*

---

## 6. Seguridad

- **La `answer_key` nunca cruza al cliente durante el examen.** El cliente consulta la
  vista `attempt_items_student`, que no tiene esa columna, y además está revocada por
  columna. Solo tras `graded` — y si `feedback_mode` lo permite — se expone la solución.
- Toda respuesta se valida con Zod en la Edge Function. `gradeUnknown()` de `@cet/engine`
  trata una respuesta ilegible como respuesta en blanco: **un dato corrupto no puede
  tumbar la corrección del intento entero**.
- RLS: un alumno solo ve sus intentos; un profesor, los de su colegio; nadie cruza
  `school_id`.
- Rate limiting en `attempt-answer` por intento.
- Audit log de cada acceso de staff a un intento ajeno.

---

## 7. Pruebas

**Unit (`packages/engine`, en verde):** determinismo de `materializeExam` · el orden del
pool no altera el examen · semillas distintas dan exámenes distintos · `option_order`
reconstruye lo que vio el alumno · pool insuficiente falla explícito · `item_count = 0` ·
`engine_key` inexistente · `param_spec` inválido.

**pgTAP:**
- `forensic_reconstruction.sql` — **criterio de aceptación del módulo**: simula un intento
  completo y verifica que la query de `DATA_MODEL.md` §10 devuelve el 100 % de lo ocurrido.
- `UPDATE` sobre `attempt_responses` prohibido.
- Un alumno no lee `answer_key` de sus propios items.
- No se borra una `question_version` usada por un intento.

**e2e (Playwright):**
- Examen completo: arrancar → responder → autosave → entregar → nota.
- Red caída a mitad: `offline` → responder → `online` → las respuestas llegan.
- Recarga en la pregunta 7: mismas preguntas, mismas respuestas.
- Reloj del cliente adelantado 30 min: el servidor no acepta la respuesta tardía.
- Doble clic en Entregar: un solo intento entregado.
- Dos pestañas: la segunda queda en solo lectura y no duplica el intento.

---

## 8. Criterios de finalización

- [ ] `attempt-start` idempotente: dos llamadas seguidas devuelven el mismo intento
- [ ] `attempt_items` completo escrito en la transacción de arranque
- [ ] `answer_key` inaccesible para el alumno (pgTAP)
- [ ] Autosave sobrevive a 30 s sin red sin perder una sola respuesta
- [ ] El deadline lo impone el servidor; el barrido cierra intentos abandonados
- [ ] Doble submit → una entrega
- [ ] Dos pestañas → un intento
- [ ] `forensic_reconstruction.sql` en verde
- [ ] Regenerar el examen desde `seed` + `blueprint_snapshot` reproduce `rendered_body`
      exactamente igual (test automatizado)
