---
id: ref-01-clasificar-politicas
model: chat
territory: [scripts/clasificar-politicas.mjs, supabase/POLITICAS.md]
forbidden: [packages/ui/src/index.ts, supabase/migrations/]
context: [supabase/migrations/0012_rls_policies.sql, docs/superpowers/plans/2026-08-28-refundacion-tenencia.md]
verify: node scripts/clasificar-politicas.mjs
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

La refundación de la tenencia obliga a reescribir las políticas de RLS que
gobiernan datos de alumno. Antes de tocarlas hay que saber cuáles son. Hoy
`supabase/migrations/0012_rls_policies.sql` contiene 105 políticas y ninguna
clasificación programática: una tarea sin borde.

## 2 · La evidencia que ya tenemos

El plan `docs/superpowers/plans/2026-08-28-refundacion-tenencia.md` define tres
montones:

- **`reescrita`** si la política gobierna una tabla de **datos de alumno**:
  `profiles`, `students`, `learning_events`, `skill_mastery`, `exam_attempts`,
  `attempt_items`, `attempt_responses`, `attempt_gradings`, `audit_log`,
  `registration_requests`, `section_members`.
- **`intacta`** si gobierna contenido o currículo: `subjects`, `courses`,
  `school_courses`, `course_modules`, `lessons`, `lesson_blocks`, `skills`,
  `lesson_skills`, `media_assets`, `questions`, `question_versions`,
  `exam_blueprints`, `exam_blueprint_sections`, `exam_assignments`, `schools`,
  `sections`.
- **`nueva`** no aparece aquí: se reserva para las tablas nuevas de la tarea 4.

El script debe leer `0012_rls_policies.sql`, extraer los nombres de las
políticas con `create policy`, leer `supabase/POLITICAS.md` y exigir que cada
política esté clasificada en una de las tres columnas.

## 3 · El criterio de aceptación

`node scripts/clasificar-politicas.mjs` sale con exit 0 e imprime:

```
105 politicas, todas clasificadas.
```

Para llegar ahí:

1. `scripts/clasificar-politicas.mjs` existe, no tiene dependencias nuevas y se
ejecuta con Node 20.
2. `supabase/POLITICAS.md` existe, tiene una fila por política y una columna
`montón` con valor `intacta`, `reescrita` o `nueva`.
3. El script falla con la lista de políticas sin clasificar si falta alguna.
4. El formato de fila que el script parsea es:
   ```markdown
   | `nombre_de_politica` | tabla | intacta | breve descripción |
   ```
5. Todas las políticas de datos de alumno están en `reescrita`; todas las de
contenido/currículo en `intacta`; ninguna en `nueva` (esa columna se usa en la
tarea 4).

## 4 · Qué NO cuenta como resuelto

- Un script que pase en vacío (sin encontrar políticas) y diga "0 políticas".
- Una clasificación manual sin script que la valide: el script es el contrato.
- Modificar `0012_rls_policies.sql`: solo se lee.
- Dejar políticas en `nueva` aquí: esa columna es para tablas que aún no existen.
- Un formato de tabla que el script no pueda verificar.
