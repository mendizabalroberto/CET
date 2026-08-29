---
id: cierre-2-skill-id-practica
model: reasoner
territory: [apps/web/src/components/learn/practice-machine.ts, apps/web/src/components/learn/skill-id-de-practica.test.ts]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, packages/shared/src/events.ts]
context: [apps/web/src/components/learn/practice-machine.ts, packages/shared/src/events.ts, apps/web/src/components/learn/practice-topics.ts, supabase/migrations/0010_telemetry.sql, supabase/migrations/0024_learning_events_ingest.sql]
verify: pnpm --filter @cet/web exec vitest run src/components/learn/skill-id-de-practica.test.ts
rounds: 4
deadline: 4 rondas o 30 minutos
---

# El evento que sostiene el análisis por destreza no dice de qué destreza habla

Recuento real de `learning_events` en producción, 29 de agosto de 2026:

```
event_type                filas   con skill_id
practice_item_answered      26        0
question_shown             126       26
```

**Cero de veintiséis.** `practice_item_answered` es el evento del que cuelga
cualquier medida de dominio por destreza: hoy se sabe *que* el alumno respondió,
no *de qué*. Por eso la sección «áreas fortalecidas» del scorecard sale vacía
aunque el alumno lleve semanas practicando.

Esto ya se dio por arreglado una vez. El traspaso lo registró como observación
3.5 («`learning_events.skill_id` NULL al 100 %») y hubo un contrato que lo cerró
—`3.5-skill-id-null`— pero sólo alcanzó a `question_shown`, y ni siquiera del
todo: 26 de 126. El resto de la familia se quedó fuera.

## Qué hay que conseguir

Que todo evento de práctica que se refiera a una pregunta concreta viaje con su
`skill_id` resuelto. Como mínimo `practice_item_answered`; mira si sus hermanos
—`question_shown`, `hint_requested`, `solution_viewed`, `question_skipped`,
`practice_streak`— tienen el mismo agujero y ciérralo en la misma pasada si caen
dentro de tu territorio.

El dato existe: el generador conoce su destreza. Lo que falta es que llegue al
evento. Antes de escribir nada, **averigua por qué no llega hoy** —si es que no
se resuelve, o se resuelve y se pierde al serializar— y dilo en un comentario.
Un arreglo que no nombre la causa es un parche.

## La distinción que no puedes fundir

`topic` / `engineKey` es la clave del **generador** (`math.compare`). `skill_id`
es el identificador de la **destreza** en la base. Hoy casi coinciden y el día
que dejen de hacerlo, fundirlos falsearía hacia atrás una serie que ya existe.
Está escrito en la cabecera de `TopicCard.tsx` y vale igual aquí.

## Qué tiene que demostrar la prueba

1. Un `practice_item_answered` emitido por el flujo real lleva `skill_id`, y es
   **el de su pregunta**, no uno cualquiera ni el del tema.
2. Una pregunta cuyo generador **no** tiene destreza conocida no inventa un
   `skill_id`: lo deja nulo. Un identificador inventado es peor que ausente,
   porque la analítica no puede distinguirlo de uno correcto.
3. El caso que hace fallar los arreglos ingenuos: **dos preguntas seguidas de
   destrezas distintas** en la misma sesión no comparten `skill_id`. Si el valor
   se resuelve una vez y se reutiliza, este caso lo caza y ningún otro lo hace.

Comprueba que la prueba sale **roja** contra el código actual antes de arreglar
nada. Si pasa en verde de entrada, está mirando otra cosa.
