/**
 * INVARIANTE: el avance por lección se alimenta de eventos que la aplicación
 * emite de verdad, y de nada más.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FALLO PARA ESTO, Y POR QUÉ NO LO PARA NINGÚN OTRO TEST
 * ===========================================================================
 * `/learn` ya tuvo un `MasteryMeter` colgado de `skill_mastery`: tabla real, con
 * RLS, con índices, con tipos, consultada correctamente. Todo verde, y cero
 * filas en producción porque NADIE la escribe. El resultado era un medidor que
 * no podía medir nada y que hacía indistinguible «este alumno no ha empezado»
 * de «esta tabla no la rellena nadie».
 *
 * Un test de reducción no ve ese fallo: la reducción de `lesson-progress.ts`
 * funciona igual de bien con eventos que no existirán jamás. Un test de
 * renderizado tampoco: el componente pinta obedientemente el cero que le dan.
 * Lo único que lo caza es comprobar, por código, que los dos tipos de evento de
 * los que este módulo depende (a) están en el enum de la base, (b) los emite
 * alguien del árbol, y (c) son EXACTAMENTE esos dos.
 *
 * Es la misma familia que `progreso-tiene-fuente-viva.test.ts` —léelo, lleva la
 * historia completa— aplicada a la vía de lecciones. Corre sin Postgres y sin
 * red, así que protege en cada `pnpm verify` y no el día que alguien se acuerde
 * de mirar producción.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { learningEventType } from "@cet/shared";

const RAIZ = process.cwd();
const MIGRACIONES = join(RAIZ, "..", "..", "supabase", "migrations");
const MODULO = join(RAIZ, "src", "components", "learn", "lesson-progress.ts");
const EMISOR = join(RAIZ, "src", "components", "learn", "LessonTracking.tsx");

/** Los dos tipos de evento de los que vive esta pantalla. Ni uno más. */
const TIPOS_ESPERADOS = ["lesson_completed", "lesson_opened"] as const;

const fuente = readFileSync(MODULO, "utf8");

/**
 * El fichero SIN comentarios, que es lo que de verdad se ejecuta.
 *
 * Hace falta porque la cabecera del módulo tiene que NOMBRAR `skill_mastery`
 * para explicar por qué no se lee —igual que hace `practice-progress.ts`—, y un
 * `not.toMatch` sobre el texto entero prohibiría justo la documentación que este
 * proyecto exige. Lo que no puede aparecer es una LECTURA de esa tabla, y eso
 * vive en el código. El mismo razonamiento vale para `throw`.
 *
 * El borrado es deliberadamente tosco (no entiende cadenas con `//` dentro).
 * Puede quitar de más, nunca de menos, y quitar de más sólo puede hacer que el
 * test perdone algo, no que invente un fallo; los casos que perdonaría los
 * cubren las comprobaciones positivas de abajo.
 */
const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

function sqlDeLasMigraciones(): string {
  return readdirSync(MIGRACIONES)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(join(MIGRACIONES, n), "utf8"))
    .join("\n")
    .toLowerCase();
}

/**
 * Los tipos de evento que el módulo menciona, sacados del texto y no de una
 * lista paralela: una lista paralela envejece justo cuando importa.
 *
 * Se busca contra el enum COMPLETO de `@cet/shared` para que añadir un tercer
 * tipo —el que sea— ponga esto en rojo y obligue a declararlo aquí.
 */
function tiposMencionados(texto: string): string[] {
  return learningEventType.options.filter((tipo) => texto.includes(tipo)).sort();
}

/* -------------------------------------------------------------------------- */

describe("invariante — el avance por lección tiene fuente viva", () => {
  it("el fichero se ha leído (si no, todo lo de abajo pasa por vacío)", () => {
    // Control positivo: sin esto un `readFileSync` que devolviera "" haría que
    // cada `not.toMatch` de abajo pasara sin probar absolutamente nada.
    expect(fuente).toMatch(/export function summariseLessonEvents/);
    expect(fuente.length).toBeGreaterThan(1_000);
  });

  it("NO lee `skill_mastery` en ningún camino, ni como respaldo", () => {
    // Ni siquiera «por si acaso»: un respaldo a una tabla vacía es una barra
    // creíble y eternamente a cero, que es peor que no pintar nada.
    expect(codigo).not.toMatch(/skill_mastery/i);
  });

  it("y deja escrito POR QUÉ no la lee, que es la mitad que se pierde", () => {
    // La prohibición sin la razón dura hasta el primer agente con prisa. La
    // cabecera de `practice-progress.ts` lleva la misma advertencia y por eso
    // nadie ha vuelto a enchufar aquel medidor.
    expect(fuente).toMatch(/skill_mastery/i);
  });

  it("usa EXACTAMENTE los dos tipos de evento de lección, y ningún otro", () => {
    expect(tiposMencionados(codigo)).toEqual([...TIPOS_ESPERADOS]);
  });

  it("esos dos tipos existen en el enum de telemetría de `@cet/shared`", () => {
    for (const tipo of TIPOS_ESPERADOS) {
      expect(learningEventType.options).toContain(tipo);
    }
  });

  it("esos dos tipos existen en el enum de la base de datos", () => {
    // El enum de Postgres es la frontera real: un tipo que no esté ahí hace que
    // el insert de telemetría falle, y el contador se quedaría a cero para
    // siempre sin que nadie viera un error en la pantalla.
    const sql = sqlDeLasMigraciones();
    expect(sql.length).toBeGreaterThan(10_000);
    for (const tipo of TIPOS_ESPERADOS) {
      expect(sql, `${tipo} no está en el enum public.learning_event_type`).toContain(`'${tipo}'`);
    }
  });

  it("alguien del árbol EMITE esos dos eventos hoy", () => {
    // Es la diferencia entre un evento declarado y un evento que ocurre. Los
    // dos salen de `LessonTracking.tsx`: `LessonOpened` al montar la lección y
    // `LessonCompleteButton` al pulsar «terminada».
    const emisor = readFileSync(EMISOR, "utf8");
    for (const tipo of TIPOS_ESPERADOS) {
      expect(emisor, `nadie emite ${tipo}: el contador nacería muerto`).toMatch(
        new RegExp(`eventType:\\s*["']${tipo}["']`),
      );
    }
  });

  it("`learning_events` tiene escritor en las migraciones", () => {
    // La otra mitad del fallo de `skill_mastery`: emitir no basta si la base no
    // deja escribir. Se comprueba igual que en `progreso-tiene-fuente-viva`.
    const sql = sqlDeLasMigraciones();
    const t = "(?:public\\.)?learning_events\\b";
    const escritores = [
      new RegExp(`insert\\s+into\\s+${t}`),
      new RegExp(`grant[^;]*\\b(?:insert|update)\\b[^;]*\\son\\s+${t}`),
      new RegExp(`create\\s+policy[^;]*\\son\\s+${t}[^;]*\\bfor\\s+(?:insert|update|all)\\b`),
    ].filter((re) => re.test(sql));
    expect(
      escritores.length,
      "nada en supabase/migrations/ puede poner una fila en public.learning_events: " +
        "el avance por lección estaría garantizado vacío para siempre.",
    ).toBeGreaterThan(0);
  });

  it("lee `lesson_id` de la columna y no del `payload`", () => {
    // Migración 0010: `lesson_id` es COLUMNA de `learning_events`. Buscarlo
    // dentro del `payload` compilaría igual y contaría cero para siempre — el
    // fallo silencioso más fácil de cometer en este fichero.
    expect(codigo).toMatch(/\blesson_id\b/);
    expect(codigo).not.toMatch(/payload/);
  });

  it("no redeclara la ventana de la práctica: la importa", () => {
    // Dos ventanas distintas para el mismo alumno en la misma pantalla es un
    // bug que sólo se ve cuando el alumno dice que su avance «se ha borrado».
    expect(codigo).toMatch(/from\s+["']\.\/practice-progress["']/);
    expect(codigo).not.toMatch(/const\s+(?:LOOKBACK_DAYS|MAX_EVENT_ROWS)\s*=/);
  });

  it("no hay ningún `throw`: esto se lee desde un Server Component", () => {
    // Una excepción aquí es la pantalla roja de `app/error.tsx` en el portátil
    // de un niño, por culpa de una fila vieja con otra forma.
    expect(codigo).not.toMatch(/\bthrow\b/);
  });
});
