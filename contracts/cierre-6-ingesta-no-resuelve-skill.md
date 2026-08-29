---
id: cierre-6-ingesta-no-resuelve-skill
model: reasoner
territory: [apps/web/src/app/api/events/route.ts, apps/web/src/app/api/events/resolucion-de-skill.test.ts]
forbidden: [packages/shared/src/events.ts, packages/shared/src/index.ts, apps/web/src/components/learn/practice-machine.ts, supabase/migrations/0024_learning_events_ingest.sql]
context: [apps/web/src/app/api/events/route.ts, packages/shared/src/events.ts, apps/web/src/lib/supabase/server.ts, supabase/migrations/0010_telemetry.sql, supabase/migrations/0052_mastery_job.sql]
verify: pnpm --filter @cet/web exec vitest run src/app/api/events/resolucion-de-skill.test.ts
rounds: 4
deadline: 4 rondas o 30 minutos
---

# La ingesta recibe la destreza y no la guarda

Medido en producción el 29 de agosto de 2026. **Todas las filas son posteriores**
al arreglo `3.5-skill-id-null`, así que no es historia vieja:

| evento | filas | `skillCode` en el payload | `skill_id` resuelto |
|---|---|---|---|
| `question_shown` | 126 | **126** | 26 |
| `practice_item_answered` | 26 | **26** | **0** |

Los 26 `question_shown` que sí tienen `skill_id` son los del **examen**, que se
insertan en servidor con el uuid ya en la mano (`lib/exam/events.ts`). Es decir:
**ningún evento entrado por `/api/events` ha resuelto nunca su destreza.**

## Lo que ya está descartado — no vuelvas a comprobarlo

1. **El cliente sí lo manda.** 26 de 26 payloads llevan `skillCode`.
2. **Los códigos existen.** Los ocho `skillCode` distintos casan con exactamente
   una fila de `skills` cada uno. La unión funcionaría.
3. **Zod no lo estropea.** `payload: z.record(z.unknown())` conserva claves
   desconocidas; `skillCode` sobrevive al parseo.
4. **El alumno puede leer `skills`.** Comprobado con su sesión: 60 filas
   visibles, RLS y grant en orden.

## Dónde está, entonces

En el bloque «3 bis. Resolución de skill_id por código» de `route.ts`, unas
veinte líneas. El sospechoso principal está a la vista:

```ts
const { data: skills } = await supabase
  .from("skills")
  .select("id, code")
  .in("code", skillCodes);
```

**El error se descarta.** Si ese `select` falla, `skills` es `null`, el mapa
queda vacío, y todas las filas del lote se guardan con `skill_id` NULL **sin que
nada lo diga**. Es exactamente la forma de fallo que este proyecto lleva dos días
persiguiendo: código que se ejecuta, no revienta, y no hace lo que dice.

Pero **no des por hecho que es eso**. Puede ser el `.in()` con un lote grande, el
cliente equivocado, o el orden en que se construye la fila. Averigua la causa
REAL y déjala escrita; un arreglo que no la nombre es un parche.

## Qué hay que conseguir

1. Que un evento con `skillCode` válido se guarde con su `skill_id`.
2. Que **el fallo deje de ser mudo**. Si la resolución no puede hacerse, tiene
   que quedar registrado con el mismo formato que usa el resto de la ruta para
   sus escrituras perdidas (busca `ESCRITURA PERDIDA` en el repositorio). Un
   `skill_id` nulo por accidente y uno nulo porque la pregunta no tiene destreza
   son cosas distintas y hoy se ven igual.
3. Que **la ingesta no se caiga** si la resolución falla: los eventos se guardan
   igual, con `skill_id` nulo. Perder la telemetría entera por no poder resolver
   una destreza sería un remedio peor.

## Qué tiene que demostrar la prueba

- Un lote con dos eventos de destrezas **distintas** guarda dos `skill_id`
  distintos y correctos.
- Un `skillCode` que no existe en `skills` guarda `skill_id` nulo **y deja
  rastro**, sin tumbar el lote.
- Si el `select` de `skills` falla, los eventos **se guardan igual** y el fallo
  queda registrado. Éste es el assert que hoy sería rojo, y el que importa.
- Un evento sin `skillCode` no genera consulta ni rastro: no es un fallo.

Comprueba que la prueba sale **roja** contra el código actual antes de arreglar
nada. Y ojo con el verde por el motivo equivocado: si tu doble de Supabase
devuelve datos sin que la ruta los pida, todo pasa sin probar nada.

## Lo que este contrato NO arregla

Las 26 filas ya escritas. `learning_events` es append-only por diseño y su
`skill_id` no se recalcula: quedan nulas para siempre. La medida de «áreas
fortalecidas» empieza a existir el día que esto se despliegue, no antes.
