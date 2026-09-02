---
id: plan-7-consultas
model: reasoner
territory: [apps/web/src/lib/plan/consultas*]
forbidden: [apps/web/src/lib/plan/tipos.ts, apps/web/src/lib/plan/fecha.ts, apps/web/src/lib/plan/estratega.ts, apps/web/src/lib/tutor/queries.ts, apps/web/src/lib/supabase/admin.ts, packages/engine/src/plan/tipos.ts]
context: [apps/web/src/lib/plan/tipos.ts, apps/web/src/lib/plan/fecha.ts, apps/web/src/lib/plan/estratega.ts, packages/engine/src/plan/tipos.ts, apps/web/src/lib/supabase/admin.ts, apps/web/src/lib/supabase/server.ts, apps/web/src/lib/tutor/queries.ts]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/lib/plan && pnpm --filter @cet/web exec vitest run src/lib/plan/consultas
rounds: 4
deadline: 4 rondas o 40 min
---

## 1 · El problema

El plan de estudio necesita leer de la base: los boletines de un hijo, su plan
activo, el inventario real de contenido por materia, qué lecciones ya terminó,
su mastery, el calendario y cuántos minutos al día estudia de verdad. Y
convertir todo eso en la entrada que esperan el estratega
(`EntradaEstratega`) y el repartidor (`EntradaReparto` de `@cet/engine`). Te
toca **`apps/web/src/lib/plan/consultas.ts`** (lecturas) y
**`consultas.test.ts`** (las funciones puras que arman las entradas). Las
acciones de servidor que escriben las escribe otro agente después, sobre tus
interfaces: cúmplelas al pie de la letra.

## 2 · La evidencia que ya tenemos

- Tipos: `apps/web/src/lib/plan/tipos.ts` (web) y
  `packages/engine/src/plan/tipos.ts` (motor), te los doy. El motor los exporta
  desde `@cet/engine` (`import type { EntradaReparto, MateriaDelPlan, … } from
  "@cet/engine"`). `EntradaEstratega` e `InventarioDeMateria` están en
  `apps/web/src/lib/plan/estratega.ts` (te lo doy).
- `apps/web/src/lib/tutor/queries.ts` (te lo doy recortado) es la forma de la
  casa para leer: `createClient()` de `@/lib/supabase/server` con la sesión
  (la RLS decide), `.from(...).select(...)`, `.rpc(...)`, **nunca lanzar**:
  una lectura que falla devuelve vacío/`null` y la página decide qué enseñar.
  `createAdminClient(motivo)` (`@/lib/supabase/admin`) escala a `service_role`
  y exige un motivo en texto; se usa solo cuando la sesión no alcanza.
- Tablas nuevas (migración 0091, ya aplicada en el árbol):
  - `boletines(id, school_id, student_id, subido_por, gestion, trimestre,
    storage_path, checksum, notas jsonb, estado 'extraido'|'confirmado',
    modelo, tokens_in, tokens_out, created_at, confirmado_at)`. RLS: el tutor
    vinculado lee. `notas` es una lista de objetos
    `{ materia, code, subject_id, nota, banda }` (`code` y `subject_id` nulos
    cuando la app no cubre la materia).
  - `planes_de_estudio(id, school_id, student_id, boletin_id, desde, hasta,
    minutos_por_dia, reparto jsonb, recomendaciones text[], activo, modelo,
    tokens_in, tokens_out, creado_por, created_at)`. `reparto` guarda
    `{ pesos: Record<CodigoMateria, number>, techos: TechoDeMateria[] }`.
  - `plan_tareas(id, plan_id, student_id, fecha, ord, subject_id, tipo,
    lesson_id, skill_id, minutos)`; `plan_partes(id, plan_id, student_id,
    fecha, minutos_previstos, minutos_medidos, items_respondidos, aciertos,
    enviado_at, created_at)`.
  - `calendario_eventos(id, school_id, gestion, desde, hasta, tipo, titulo,
    year_levels)`; `school_id null` = global; RLS deja leer a cualquier
    sesión.
- Catálogo (existente): `subjects(id, code, name jsonb, school_id)`;
  `courses(id, subject_id, year_level, status, school_id)`;
  `course_modules(id, course_id, ord)`; `lessons(id, module_id, ord, title,
  estimated_minutes, status)`; `skills(id, course_id, code, ord)`;
  `questions(id, skill_id, status)`; `skill_mastery(student_id, skill_id,
  mastery)`. Todo el contenido de hoy es GLOBAL (`school_id null`), un curso
  publicado por materia, `year_level = 6`. Las lecciones publicadas ya tienen
  `estimated_minutes` no nulo.
- Lección terminada = fila de `learning_events` con `event_type =
  'lesson_completed'` y la lección en la COLUMNA `lesson_id` (no en el
  payload). La RLS de `learning_events` no está pensada para el tutor: léelo
  con `createAdminClient`.
- Minutos observados: `rpc("informe_alumno_serie_diaria", { p_student_id,
  p_desde, p_hasta })` devuelve `{ fecha, minutos_estudio, sesiones }[]` por
  día; con la sesión del tutor funciona (la función comprueba el vínculo).
  Mira `ventanaDeInforme` en `tutor/queries.ts` para el tratamiento de la
  ventana semiabierta.
- `hoyEnZona()` y `sumarDias()` están en `apps/web/src/lib/plan/fecha.ts`.

## 3 · El criterio de aceptación

`pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/lib/plan && pnpm --filter @cet/web exec vitest run src/lib/plan/consultas` sale en 0.

`consultas.ts` exporta exactamente esto (los tipos, con `readonly`):

```ts
export const notaGuardadaSchema: z.ZodType<NotaGuardada>;   // { materia, code: CodigoMateria|null, subject_id: string|null, nota: number, banda: Banda }
export interface NotaGuardada { … }
export const repartoGuardadoSchema: z.ZodType<RepartoGuardado>; // { pesos: Partial<Record<CodigoMateria, number>>, techos: TechoDeMateria[] }
export interface RepartoGuardado { … }

export interface BoletinResumen { id: string; gestion: number; trimestre: number | null; estado: "extraido" | "confirmado"; notas: NotaGuardada[]; createdAt: string; confirmadoAt: string | null }
export interface PlanResumen { id: string; boletinId: string; desde: string; hasta: string; minutosPorDia: number; reparto: RepartoGuardado; recomendaciones: string[]; createdAt: string; tareas: number; partes: ParteResumen[] }
export interface ParteResumen { fecha: string; minutosPrevistos: number; minutosMedidos: number; itemsRespondidos: number; aciertos: number; enviadoAt: string | null }

export interface MateriaInventario { subjectId: string; code: CodigoMateria; lecciones: { lessonId: string; moduloOrd: number; ord: number; minutos: number }[]; skills: { skillId: string; code: string; ord: number; preguntas: number }[] }

export async function boletinesDeHijo(studentId: string): Promise<BoletinResumen[]>;        // sesión; más reciente primero
export async function planActivoDeHijo(studentId: string): Promise<PlanResumen | null>;     // sesión; partes de los últimos 14 días, más reciente primero
export async function inventarioDeContenido(): Promise<MateriaInventario[]>;               // admin; solo cursos/lecciones/preguntas 'published', globales; ordenado por subjects.ord
export async function leccionesCompletadas(studentId: string): Promise<ReadonlySet<string>>; // admin
export async function masteryDeAlumno(studentId: string): Promise<ReadonlyMap<string, number>>; // admin; skill_mastery
export async function calendarioDelPlan(gestion: number): Promise<EventoCalendario[]>;      // sesión; globales + del colegio
export async function minutosObservados(studentId: string): Promise<number | null>;         // sesión; media de los últimos 28 días, redondeada; null si no hay filas o todo es 0

// Puras, probadas:
export function armarInventarioEstratega(inventario: readonly MateriaInventario[], completadas: ReadonlySet<string>): InventarioDeMateria[];
export function armarEntradaReparto(p: { desde: string; hasta: string; minutosPorDia: number; pesos: Partial<Record<CodigoMateria, number>>; inventario: readonly MateriaInventario[]; completadas: ReadonlySet<string>; mastery: ReadonlyMap<string, number>; calendario: readonly EventoCalendario[] }): EntradaReparto;
```

Reglas de las puras:

- `armarInventarioEstratega`: una entrada por materia del inventario;
  `leccionesPublicadas` = nº de lecciones, `leccionesCompletadas` = las que
  están en `completadas`, `minutosEstimados` = suma de `minutos`,
  `preguntasPublicadas` = suma de `preguntas` de sus skills.
- `armarEntradaReparto`: solo entran materias con peso > 0 en `pesos`;
  `peso` es el del mapa; `lecciones[].completada` sale de `completadas`;
  `skills[].mastery` sale de `mastery` o `null`; `calendario` se pasa tal cual.
  Si ninguna materia tiene peso, devuelve `materias: []` (no lanza).

Las lecturas usan Zod (o comprobaciones de tipo explícitas) sobre las filas:
una fila con forma rara se descarta, no revienta. `notas` y `reparto` se
validan con los esquemas exportados; un boletín cuyas `notas` no validan se
devuelve con `notas: []`.

Pruebas mínimas en `consultas.test.ts` (sin base, sin red: solo las puras y
los esquemas):

- `notaGuardadaSchema` acepta una fila válida y rechaza `nota: 101` y
  `banda: "otra"`.
- `repartoGuardadoSchema` acepta `{ pesos: { english: 1 }, techos: [] }` y
  rechaza `pesos: { art: 1 }`.
- `armarInventarioEstratega` cuenta bien completadas y minutos con un
  inventario de dos materias.
- `armarEntradaReparto` marca `completada`, cruza `mastery`, deja fuera la
  materia con peso 0 y conserva el calendario.

## 4 · Qué NO cuenta como resuelto

- **Un test de relleno.** El intento anterior entregó `consultas.test.ts` con
  UN solo `it` que no importaba nada del módulo; el motor revirtió el código,
  el test siguió verde, y el contrato se dio por FALSO VERDE. Cada una de las
  cuatro puras/esquemas de §3 tiene que estar importada y ejercida con
  asserts sobre su salida real; como mínimo 8 `it`. Si al revertir
  `consultas.ts` el test no se pone rojo, no vale.
- Lanzar desde una lectura. Vacío o `null`, y a seguir.
- `createAdminClient` sin motivo, o usarlo donde la sesión del tutor ya llega
  (boletines, planes, partes, calendario, la RPC).
- Un `select("*")`: nombra las columnas.
- `fetch` directo, o tocar cualquier fichero fuera de `consultas*`.
- Filtrar `plan_tareas` o `planes_de_estudio` por colegio: el boletín es de la
  familia y `school_id` puede ser nulo.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
