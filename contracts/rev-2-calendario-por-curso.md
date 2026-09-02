---
id: rev-2-calendario-por-curso
model: chat
territory: [apps/web/src/lib/plan/consultas.ts, apps/web/src/lib/plan/consultas.test.ts]
forbidden: [apps/web/src/lib/plan/acciones.ts, apps/web/src/lib/plan/estratega.ts, apps/web/src/lib/i18n/dictionaries/es.ts, apps/web/src/lib/i18n/dictionaries/en.ts, supabase/migrations, packages/ui/src/index.ts]
context: [apps/web/src/lib/plan/consultas.ts, apps/web/src/lib/plan/consultas.test.ts, apps/web/src/lib/plan/tipos.ts]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/lib/plan && pnpm --filter @cet/web exec vitest run src/lib/plan/consultas
rounds: 4
deadline: 4 rondas o 30 min
---

## 1 · El problema

`calendarioDelPlan(gestion)` (consultas.ts, ~línea 536) descarta TODO evento
`hito_cambridge` que tenga `year_levels` no vacío. El comentario dice «un hito
de OTRO curso no es el de este alumno», pero como no sabe el curso del alumno,
descarta también los suyos: ningún hito Cambridge llega jamás al motor. Además
no existe ninguna lectura de «próximos eventos» para enseñar al tutor.

## 2 · La evidencia que ya tenemos

- La tabla `calendario_eventos` tiene `gestion int`, `desde date`, `hasta date`,
  `tipo evento_escolar`, `year_levels int[]` (vacío = todos los cursos) y
  `school_id` (null = global). La RLS ya filtra lo visible.
- `eventoCalendarioSchema` (~línea 522) y el tipo `EventoCalendario` de
  `tipos.ts` NO llevan `year_levels`, a propósito: el motor solo necesita
  fechas y tipo. No cambies ese tipo.
- `consultas.test.ts` prueba esquemas y constructores puros
  (`notaGuardadaSchema`, `armarInventarioEstratega`, `armarEntradaReparto`):
  la lógica va a una función pura exportada y la función con Supabase solo la
  llama. Sigue ese patrón.
- `esFila()` y `columnaTexto()` ya existen en el fichero para leer filas sin
  `any`.

## 3 · El criterio de aceptación

El `verify` sale en 0. Además:

1. Nueva función pura exportada
   `filtrarCalendarioPorCurso(filas: readonly unknown[], yearLevel: number | null): EventoCalendario[]`:
   valida cada fila con `eventoCalendarioSchema`; un evento que no es
   `hito_cambridge` entra siempre; un `hito_cambridge` entra si `year_levels`
   está vacío o no es array, o si `yearLevel !== null` y `year_levels`
   contiene `yearLevel`. Orden de entrada preservado.
2. `calendarioDelPlan(gestion: number, yearLevel: number | null = null)`
   consulta igual que ahora y devuelve `filtrarCalendarioPorCurso(data, yearLevel)`.
   Con el valor por defecto el comportamiento actual no cambia (por eso el
   parámetro es opcional: quien llama hoy no se toca).
3. Nueva lectura exportada
   `eventosProximos(gestion: number, desde: string, dias: number = 60): Promise<EventoProximo[]>`
   con `export interface EventoProximo { desde: string; hasta: string; tipo:
   EventoCalendario["tipo"]; yearLevels: number[] }`. Devuelve los eventos de
   la gestión cuyo `hasta >= desde` y `desde <= desde + dias` (fechas civiles
   ISO `YYYY-MM-DD`; compara como texto, que en ISO ordena bien), ordenados
   por `desde`. `year_levels` null o no array → `[]`. Error → `[]` con
   `console.error("[cet] eventosProximos ...")`. Usa el mismo `createClient`
   con sesión que `calendarioDelPlan` (la RLS decide lo visible). La parte
   pura (`recortarVentana(filas, desde, hasta)`) exportada y probada.
4. Tests en `consultas.test.ts`: `filtrarCalendarioPorCurso` con (a) un
   feriado sin year_levels, (b) un hito con `[4]` y `yearLevel=6` (fuera), (c)
   un hito con `[6]` y `yearLevel=6` (dentro), (d) un hito con `[6]` y
   `yearLevel=null` (fuera), (e) un hito con `[]` (dentro siempre); y
   `recortarVentana` con un evento antes, uno dentro y uno después de la
   ventana.

## 4 · Qué NO cuenta como resuelto

- Cambiar la firma actual de `calendarioDelPlan` de forma que rompa a quien la
  llama con un solo argumento.
- Añadir `year_levels` a `EventoCalendario` o tocar `tipos.ts`.
- Tocar `acciones.ts`, `estratega.ts`, diccionarios o migraciones.
- Mockear Supabase para «probar» la consulta: se prueba la parte pura.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
