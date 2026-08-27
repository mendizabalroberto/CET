/**
 * Vista previa de desarrollo del teclado en pantalla de la práctica.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * PARA QUÉ EXISTE
 * ===========================================================================
 * Para poder TOCAR el teclado sin teclear las credenciales de nadie. `/practice`
 * vive detrás de `requireStudent()`, y verificar un cambio táctil entrando con
 * la cuenta de un alumno real es lo que este proyecto no hace.
 *
 * Monta el MISMO componente que la pantalla real (`PracticeSession`), con los
 * mismos tokens y la misma hoja de estilos. Lo único que se elige aquí es el
 * tema, y se eligen los tres que producen teclados distintos: una fracción, un
 * número y una comparación. Nada está fabricado.
 *
 * Es una ruta hermana de `/dev/practice-preview` (progreso) y deliberadamente
 * aparte: así dos personas pueden mirar dos cosas sin pisarse el fichero.
 *
 * ===========================================================================
 * NO SALE A PRODUCCIÓN
 * ===========================================================================
 * `notFound()` en cuanto `NODE_ENV` no es `development`. Es una comprobación de
 * servidor, no una bandera de compilación: aunque alguien la despliegue por
 * error, la ruta devuelve 404. No lee nada de la base de datos.
 */
import { notFound } from "next/navigation";

import { getLearnDictionary } from "@/components/learn/dictionary";
import { PracticeSession } from "@/components/learn/PracticeSession";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
// `useTelemetry()` LANZA en desarrollo si falta el proveedor, y la isla de
// práctica lo usa. Aquí monta la cola de verdad, pero como la ruta no sale a
// producción y no hay sesión, los eventos no llegan a ninguna parte.
import { TelemetryProvider } from "@/lib/telemetry/provider";

/**
 * Un caso por CLASE de teclado, no uno por generador: lo que cambia el teclado
 * es el tipo de la clave de respuesta, y estos tres cubren los tres tipos que
 * hoy existen. Que no falte ninguno lo vigila
 * `teclado-cubre-generadores.test.ts`, que recorre el registro entero.
 */
const CASOS = [
  {
    topicId: "math.simplify",
    titulo: "Fracción — dígitos, barra y espacio",
    porQue:
      "El corrector trata 7/4 y 1 3/4 como la misma respuesta, y math.fracop produce " +
      "canónicas mixtas de verdad («1 3/10»), así que sin la tecla de espacio un niño " +
      "no puede escribir la respuesta que el enunciado le acaba de enseñar. No lleva " +
      "separador decimal: la pregunta pide una fracción.",
  },
  {
    topicId: "math.decimal",
    titulo: "Número — dígitos y separador decimal del idioma",
    porQue:
      "En español la tecla es la COMA, que es lo que el alumno ve escrito en el " +
      "enunciado. parseAnswer tolera el punto, pero la tolerancia del corrector no es " +
      "excusa para una tecla incoherente con lo que se lee.",
  },
  {
    topicId: "math.compare",
    titulo: "Comparación — tres símbolos y nada más",
    porQue:
      "Ni un dígito: la respuesta es un símbolo. Las teclas salen del placeholder del " +
      "ítem («> < =»), que es donde el generador declara qué admite.",
  },
] as const;

export default async function KeyboardPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const locale = "es" as const;
  const dictionary = getLearnDictionary(locale);

  return (
    <UiLocaleProvider locale={locale}>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
        <header>
          <h1 className="text-2xl font-bold text-ink">Teclado en pantalla — {dictionary.practice.title}</h1>
          <p className="mt-2 max-w-prose text-muted">
            Estrecha la ventana a 360 px y prueba a contestar solo con el dedo. Después hazlo solo
            con el tabulador y las flechas: el teclado entero es UN alto de tabulación, y de ahí se
            sale a «Comprobar» con una sola pulsación más.
          </p>
        </header>

        {CASOS.map((caso) => (
          <section key={caso.topicId} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
            <h2 className="text-lg font-bold text-ink">{caso.titulo}</h2>
            <p className="max-w-prose text-sm text-muted">{caso.porQue}</p>
            <TelemetryProvider>
              <PracticeSession topicId={caso.topicId} locale={locale} />
            </TelemetryProvider>
          </section>
        ))}
      </div>
    </UiLocaleProvider>
  );
}
