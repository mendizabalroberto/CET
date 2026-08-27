# M11 — `analytics`

> Telemetría de aprendizaje, mastery por destreza, cuadros de mando e informes.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> **Depende de:** M09 `exam-engine`, M10 `grading`. **Habilita:** el aprendizaje adaptativo.

---

## 1. Objetivo

Convertir lo que hace un alumno en **evidencia utilizable**: qué domina, qué no,
y con qué confianza lo sabemos.

La pregunta que este módulo tiene que poder responder no es "¿cuánto sacó?" —
eso ya lo responde M10 — sino:

> "Este alumno falla las fracciones. ¿Falla porque no sabe simplificar, porque no
> sabe encontrar el denominador común, o porque se queda sin tiempo?"

Esa distinción no se puede sacar de una nota. Se saca de la secuencia de
eventos: cuánto tardó, cuántas veces cambió de opinión, si pidió pista, si se
fue de la pestaña, en qué orden respondió.

**Regla de oro del módulo:** la analítica no puede alterar la experiencia de
aprendizaje. Si la telemetría se cae, la lección sigue funcionando. Nunca al
revés.

---

## 2. Arquitectura

```
navegador                       servidor                     base de datos
─────────                       ────────                     ─────────────
TelemetryQueue          POST /api/events              learning_events
 · seq monótono   ──▶    · Zod (@cet/shared)    ──▶    (particionada por mes)
 · lote 5 s / 20 ev.     · identidad de SESIÓN               │
 · sendBeacon al ocultar · insert masivo                     ▼
 · backoff exponencial                                  skill_mastery
                                                        (job / trigger)
                                                             │
                                                             ▼
                                                   dashboards e informes
```

### Decisiones

**Ingesta en lote, siempre.** Cada 5 segundos o cada 20 eventos. Treinta niños
practicando con un round-trip por evento saturan el wifi de un colegio y
destrozan el bucle de feedback de <50 ms que hace útil la práctica.

**`seq` monótono por sesión.** Es lo que permite ordenar los eventos aunque el
reloj del navegador esté mal y aunque los lotes lleguen desordenados. `client_ts`
se guarda, pero **nunca ordena ni puntúa**.

**La identidad la pone el servidor.** `school_id` y `student_id` salen de la
sesión autenticada. Nunca del cuerpo de la petición. Confiar en el cuerpo permite
a un alumno escribir eventos en nombre de otro: falsear las horas de práctica de
un compañero o contaminar su mastery. El esquema `clientEvent` de `@cet/shared`
ni siquiera admite esos campos.
Implementado en `apps/web/src/app/api/events/route.ts`.

**Append-only y particionada.** `learning_events` no se actualiza ni se borra
fila a fila: se `DETACH`/`DROP` la partición del mes cuando expira la retención.
Borrar millones de filas con `DELETE` en una tabla caliente es cómo se cae la
base de datos un lunes por la mañana.

**`skill_mastery` es una proyección, no la verdad.** Se puede recalcular entera
desde `learning_events` y `attempt_gradings`. Si la fórmula cambia, se
reconstruye; no hay que migrar nada.

**EWMA en vez de porcentaje acumulado.** `ewma_correct` da más peso a lo
reciente. Un alumno que falló 20 veces en septiembre y acierta 10 seguidas en
noviembre **ha aprendido**, y un porcentaje simple lo negaría durante meses.

**`confidence` separado de `mastery`.** Dos aciertos de dos no son dominio: son
dos aciertos. La confianza crece con el número de observaciones, y la UI no
muestra un diagnóstico por debajo de un umbral. Un cuadro de mando que afirma
cosas con dos datos hace que un profesor deje de creerse el producto.

---

## 3. Tablas

Contrato en `DATA_MODEL.md` §7.

### `learning_events`
`id` bigint identity, `school_id` **not null**, `student_id` **not null**,
`session_id` uuid, `seq` int, `event_type` enum, `attempt_id`,
`attempt_item_id`, `lesson_id`, `question_id`, `skill_id`, `payload` jsonb,
`client_ts`, `server_ts` **default now()**.

- Particionada `RANGE` sobre `server_ts`, una partición por mes, creadas por
  adelantado con `pg_cron`. Una partición que no existe cuando llega el evento
  es un error de inserción en hora punta.
- Índices: `(student_id, server_ts desc)`, `(attempt_id)`,
  `(school_id, event_type, server_ts desc)`, `(skill_id, server_ts desc)`.
- `(session_id, seq)` es la **clave lógica** del evento y da su orden dentro de
  la sesión. **NO es una constraint, y no puede serlo.** Este contrato la
  declaró como `unique` durante meses y la tabla nunca la tuvo: está
  particionada por rango sobre `server_ts`, y en una tabla particionada todo
  índice único debe incluir la clave de partición. Un único sobre
  `(server_ts, session_id, seq)` sí sería legal, pero no deduplicaría nada — el
  mismo evento reinsertado un segundo después trae otro `server_ts`.

  El coste de la mentira: `/api/events` hacía `upsert(..., { onConflict:
  "session_id,seq" })` confiando en esta línea, Postgres devolvía 42P10,
  PostgREST un 400, y la cola del cliente reintentaba en bucle. Una sesión
  entera de lecciones en producción dejó **tres filas**.

  La idempotencia se resuelve al LEER: quien agregue horas de estudio o mastery
  deduplica por `(session_id, seq)`. Un duplicado tras un corte de wifi engorda
  la tabla y no falsea el informe; cero filas sí lo falsean.

### `skill_mastery`
PK `(student_id, skill_id)`. `school_id`, `mastery` 0–1, `confidence` 0–1,
`attempts_count`, `correct_count`, `ewma_correct`, `avg_time_ms`, `hints_used`,
`last_practiced_at`, `updated_at`.

- `check (mastery between 0 and 1)`, idem `confidence`.
- Índice `(school_id, skill_id, mastery)`: la consulta del profesor es "qué
  destrezas lleva peor mi clase".

---

## 4. APIs

| Superficie | Qué hace | Notas |
|---|---|---|
| `POST /api/events` | Ingesta en lote | Zod + identidad de sesión + insert masivo. 204 sin cuerpo. |
| `TelemetryQueue` (`@/lib/telemetry/client`) | Cola de cliente | `track()`, `flush()`, beacon en `visibilitychange` |
| `useTelemetry()` | Hook | Devuelve un no-op si falta el provider: la analítica jamás rompe una lección |
| RPC `app.recompute_skill_mastery(student_id)` | Reproyección | `security definer` con `search_path` fijado |
| Server Components de `/reports` | Cuadros de mando | Consultas agregadas, filtradas por RLS |

**Códigos de respuesta de `/api/events`** — deliberadamente escuetos:
`204` aceptado · `400` lote malformado (el cliente lo descarta, no reintenta) ·
`401` sin sesión (descarta) · `403` perfil no activo · `413` cuerpo excesivo ·
`429` rate limit · `500` fallo del servidor (el cliente **sí** reintenta con
backoff). Ninguno lleva detalle: un endpoint de telemetría no debe ser un mapa
del modelo de datos.

---

## 5. Frontend

**Alumno (`/learn`)**
- Progreso por destreza en lenguaje de niño: "Fracciones: casi lo tienes".
  Nunca un porcentaje crudo ni una comparación con compañeros. Un ranking en
  primaria es una máquina de generar ansiedad.
- Recomendación de qué practicar a continuación, derivada de `mastery` bajo con
  `confidence` suficiente.

**Profesor (`/reports`)**
- Mapa de calor clase × destreza.
- Ficha de alumno: evolución de mastery, tiempo medio por ítem, uso de pistas.
- Reconstrucción de un intento pregunta a pregunta (la consulta forense de
  `DATA_MODEL` §10) — es la prueba de que la nota es defendible ante una familia.
- Exportación CSV, que pasa por `audit_log`.

**Administrador (`/admin`)**
- Volumen de eventos, salud de la ingesta, particiones y retención.

**Rendimiento:** ningún cuadro de mando consulta `learning_events` en crudo en el
camino de renderizado. Se leen vistas materializadas o `skill_mastery`. Un
`select` sobre una tabla de eventos de decenas de millones de filas dentro de una
petición de página es cómo se cae el panel a las 8:30 de la mañana.

---

## 6. Seguridad

1. **RLS en `learning_events` y `skill_mastery`.**
   - Alumno: `student_id = app.current_profile_id() and school_id = app.current_school_id()`.
   - Staff: `school_id = app.current_school_id() and app.is_staff()`.
   - INSERT del alumno: `with check` sobre `student_id` **y** `school_id`. Sin
     el `with check`, un alumno podría insertar filas a nombre de otro aunque no
     pudiera leerlas.
2. **La ingesta usa el cliente de SESIÓN, no service role.** Aunque la Route
   Handler tuviera un fallo y compusiera una fila con el `student_id` de otro,
   RLS la rechazaría. Defensa en profundidad real.
3. **`payload` acotado.** Cuerpo máximo 256 KB, máximo 100 eventos por lote
   (`MAX_EVENT_BATCH`). `payload` es jsonb abierto por compatibilidad, pero cada
   `event_type` tiene su esquema en `@cet/shared`; lo que no valide se cuenta
   como malformado en vez de contaminar las métricas en silencio.
4. **Nada de PII en `payload`.** Ni nombres, ni texto libre escrito por el
   alumno, ni contenido de respuestas. Las respuestas viven en
   `attempt_responses`, con su propia RLS. Duplicarlas aquí crearía una segunda
   copia de datos de menores con otro régimen de acceso.
5. **Todo acceso de staff a datos de un alumno concreto va a `audit_log`.**
   Ver un mapa de calor agregado, no; abrir la ficha de un menor, sí.
6. **Retención:** eventos en bruto el curso actual + 1, luego se agregan y se
   elimina la partición. Publicado en `/privacy`.
7. **Rate limit por usuario** en `/api/events`: 60 lotes por minuto. La cola
   manda uno cada 5 s, así que sobra margen y se corta un bucle atascado.

---

## 7. Pruebas

**pgTAP**
- Un alumno no lee eventos de otro alumno, ni siquiera del mismo colegio.
- Un alumno **no puede insertar** un evento con `student_id` ajeno (`with check`).
- Un profesor del colegio A no ve `skill_mastery` del colegio B.
- Un lote reintentado entra dos veces y la AGREGACIÓN lo deduplica por
  `(session_id, seq)`: no hay constraint que lo impida al escribir (ver arriba).
- Las particiones del mes siguiente existen antes de que empiece el mes.

**Vitest (`TelemetryQueue`)**
- `seq` monótono desde 0 y sin huecos mientras no haya desbordamiento.
- Se envía a los 20 eventos y a los 5 segundos.
- Un 500 reencola el lote **al principio**, conservando el orden, y reintenta
  con backoff creciente.
- Un 400 descarta el lote y no entra en bucle.
- Un 401 descarta y no crece la cola.
- Al desbordar se pierden los eventos **antiguos**, no los recientes.
- `dispose()` deja de aceptar eventos.

**Route Handler**
- Un cuerpo con `schoolId`/`studentId` inyectados los ignora por completo: la
  fila insertada lleva los de la sesión. **Este es el test que importa.**
- 101 eventos → 400. Cuerpo de 300 KB → 413.
- Sesión de profesor → 204 sin insertar nada.

**Playwright**
- Una sesión de práctica genera eventos; al ocultar la pestaña se dispara el
  beacon y no se pierde el último tramo.

---

## 8. Criterios de finalización

- [ ] `learning_events` particionada por mes, con los cuatro índices y la
      constraint de idempotencia.
- [ ] `skill_mastery` con su proyección y una RPC de recálculo completo.
- [ ] RLS verificada por pgTAP en ambas tablas, incluido el `with check` de INSERT.
- [ ] `POST /api/events` valida con Zod, deriva la identidad de la sesión y hace
      insert masivo. Test que demuestra que ignora la identidad del cuerpo.
- [ ] `TelemetryQueue` con lote, beacon, `seq` y backoff, cubierta por Vitest.
- [ ] Mapa de calor clase × destreza y ficha de alumno en `/reports`.
- [ ] Reconstrucción forense de un intento visible en la UI.
- [ ] Política de retención implementada y documentada en `/privacy`.
- [ ] Ningún cuadro de mando consulta `learning_events` en crudo al renderizar.
