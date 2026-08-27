/**
 * INVARIANTE DE FAMILIA — ningún generador se queda sin teclas para su respuesta.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FAMILIA CIERRA
 * ===========================================================================
 * El teclado en pantalla no es genérico: las teclas se derivan de lo que la
 * respuesta admite. Eso significa que existe una forma de romperlo que ninguna
 * revisión de código ve: registrar un generador cuya respuesta necesita un
 * carácter que el teclado no ofrece. La pantalla se pinta perfecta, el niño
 * toca las teclas, y no hay manera de escribir la respuesta correcta.
 *
 * Este test recorre el REGISTRO ENTERO de `@cet/engine` —no una lista escrita a
 * mano— y para cada generador exige dos cosas sobre la respuesta que el propio
 * generador declara correcta:
 *
 *   1. que todos sus caracteres se puedan teclear con el teclado que ese ítem
 *      recibiría, y
 *   2. que al teclearla, el CORRECTOR de verdad la dé por buena.
 *
 * La segunda es la que hace que esto no sea una comparación de cadenas. Un test
 * que solo mirase caracteres pasaría con un teclado que ofrece "1", "/" y "4"
 * pero cuyo `insert` mete un espacio duro en vez de un espacio: el corrector es
 * quien desmiente eso. (HANDOFF §3: «un test que pasa puede estar pasando por el
 * motivo equivocado».)
 *
 * ===========================================================================
 * POR QUÉ SE PRUEBA CONTRA LA CLAVE Y NO CONTRA `canonical`
 * ===========================================================================
 * `canonical` es lo que se MUESTRA: lleva la unidad ("60 cm²") y el separador de
 * miles del idioma ("619.000 kg"). El alumno no teclea ninguna de las dos cosas
 * —la unidad va pintada al lado del campo y el corrector la descarta, y 619000
 * se corrige igual—. Exigir teclas para eso obligaría a poner una "c", una "m"
 * y un "²" en el teclado de un niño de once años. Lo que se exige es la forma
 * que el alumno SÍ escribe, derivada de la clave.
 *
 * ===========================================================================
 * NO PUEDE PASAR EN VACÍO
 * ===========================================================================
 * Se exige un mínimo de generadores recorridos y un mínimo de respuestas
 * comprobadas. Un escáner que deja de encontrar nada pasa siempre (HANDOFF §3).
 */
import { describe, expect, it } from "vitest";
import { generate, grade, mixStr, registry } from "@cet/engine";
import { keypadCharacters, keypadLayoutFor } from "@cet/ui";
import type { AnswerKey, Locale } from "@cet/shared";

/** Semillas por generador y por idioma. Bastantes para ver las ramas raras. */
const SEMILLAS = 200;
const IDIOMAS: readonly Locale[] = ["es", "en"];

/** Mínimos que impiden que el invariante pase sin haber mirado nada. */
const MINIMO_GENERADORES = 9;
const MINIMO_RESPUESTAS = 500;

/**
 * Las formas en que un alumno escribiría la respuesta correcta de esta clave.
 * Se exige que TODAS sean tecleables: si `math.mixed` acepta "7/4" y "1 3/4",
 * el niño que escribe la segunda tiene el mismo derecho a poder hacerlo.
 */
function respuestasQueElAlumnoEscribiria(key: AnswerKey, locale: Locale): string[] {
  switch (key.type) {
    case "numeric": {
      const plano = String(key.value);
      // Notación científica sería impronunciable e inescribible; si algún día
      // sale, quiero enterarme aquí y no por un niño atascado.
      expect(plano, `valor no tecleable: ${plano}`).not.toMatch(/e/i);
      return [locale === "es" ? plano.replace(".", ",") : plano];
    }
    case "fraction": {
      const impropia = `${String(key.numerator)}/${String(key.denominator)}`;
      const mixta = mixStr({ n: key.numerator, d: key.denominator });
      return [...new Set([impropia, mixta])];
    }
    case "text":
      return [key.canonical];
    default:
      // choice, ordering, matching y manual no se teclean: no es asunto del
      // teclado. Si un generador de práctica pasara a usarlos, el chip de tema
      // dejaría de tener un campo de texto y esto habría que replanteárselo.
      return [];
  }
}

describe("invariante — el teclado cubre la respuesta de todos los generadores", () => {
  const generadores = registry.all();

  it("el registro no está vacío (si no, este invariante no prueba nada)", () => {
    expect(generadores.length).toBeGreaterThanOrEqual(MINIMO_GENERADORES);
  });

  it("toda respuesta esperada se puede teclear, y el corrector la da por buena", () => {
    const fallos: string[] = [];
    let comprobadas = 0;

    for (const generador of generadores) {
      for (const locale of IDIOMAS) {
        for (let i = 1; i <= SEMILLAS; i += 1) {
          const item = generate(generador.key, { locale }, i * 7919);
          const esperadas = respuestasQueElAlumnoEscribiria(item.answerKey, locale);
          if (esperadas.length === 0) continue;

          const layout = keypadLayoutFor(
            { answerType: item.answerKey.type, placeholder: item.body.placeholder },
            locale,
          );
          if (layout === null) {
            fallos.push(
              `${generador.key} (${locale}, semilla ${String(i * 7919)}): clave ` +
                `"${item.answerKey.type}" con placeholder ${JSON.stringify(item.body.placeholder)} ` +
                `no recibe ningún teclado, y su respuesta hay que escribirla.`,
            );
            continue;
          }

          const teclas = keypadCharacters(layout);
          for (const esperada of esperadas) {
            comprobadas += 1;
            const faltan = [...esperada].filter((c) => !teclas.has(c));
            if (faltan.length > 0) {
              fallos.push(
                `${generador.key} (${locale}): para escribir "${esperada}" faltan las teclas ` +
                  `${JSON.stringify(faltan.join(""))}. El teclado ofrece ` +
                  `${JSON.stringify([...teclas].sort().join(""))}.`,
              );
              continue;
            }
            const nota = grade({ type: "text", value: esperada }, item.answerKey, item.maxPoints);
            if (!nota.isCorrect) {
              fallos.push(
                `${generador.key} (${locale}): "${esperada}" se puede teclear pero el corrector ` +
                  `la da por MALA. ${nota.rationale ?? ""}`,
              );
            }
          }
        }
      }
    }

    expect(comprobadas).toBeGreaterThanOrEqual(MINIMO_RESPUESTAS);
    expect(
      [...new Set(fallos)].slice(0, 20),
      `Un generador cuya respuesta no se puede teclear deja al alumno sin poder contestar.\n` +
        `Arregla el teclado (packages/ui/src/input/keypad-layout.ts), no este test.`,
    ).toEqual([]);
  });

  it("ningún generador produce hoy una respuesta negativa (por eso no hay tecla de menos)", () => {
    // Es la premisa de `keypad-layout.ts`. Si deja de ser cierta, el teclado
    // necesita una tecla "−" y quiero que salte aquí, con el motivo escrito.
    const negativos: string[] = [];
    for (const generador of generadores) {
      for (let i = 1; i <= SEMILLAS; i += 1) {
        const key = generate(generador.key, { locale: "es" }, i * 7919).answerKey;
        if (key.type === "numeric" && key.value < 0) negativos.push(generador.key);
        if (key.type === "fraction" && key.numerator < 0) negativos.push(generador.key);
      }
    }
    expect([...new Set(negativos)]).toEqual([]);
  });
});
