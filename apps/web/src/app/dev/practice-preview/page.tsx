/**
 * Vista previa de desarrollo de los indicadores de progreso de práctica.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * PARA QUÉ EXISTE
 * ===========================================================================
 * Para poder MIRAR la pantalla sin teclear las credenciales de nadie. `/practice`
 * vive detrás de `requireStudent()`, y verificar un cambio visual entrando con
 * la cuenta de un alumno real es lo que este proyecto no hace.
 *
 * Renderiza el MISMO componente que la pantalla real (`PracticeTopicGrid`), con
 * los mismos tokens, la misma hoja de estilos y los mismos componentes de
 * `@cet/ui`. Lo único fabricado son las cifras, y están fabricadas a la vista:
 * cada tarjeta dice de qué recuento sale. Una captura de una maqueta parecida no
 * probaría nada.
 *
 * ===========================================================================
 * NO SALE A PRODUCCIÓN
 * ===========================================================================
 * `notFound()` en cuanto `NODE_ENV` no es `development`. Es una comprobación de
 * servidor, no una bandera de compilación: aunque alguien la despliegue por
 * error, la ruta devuelve 404. No lee nada de la base de datos, así que tampoco
 * puede filtrar el dato de un alumno.
 */
import { notFound } from "next/navigation";
import { EffortMeter, MasteryLadder, MasteryOverview, type MasteryLevel } from "@cet/ui";

import { getLearnDictionary } from "@/components/learn/dictionary";
import { practiceTopics } from "@/components/learn/practice-topics";
import { PracticeTopicGrid } from "@/components/learn/PracticeTopicGrid";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import {
  readAnsweredEvents,
  summarisePracticeEvents,
  type AnsweredEvent,
} from "@/components/learn/practice-progress";
import {
  nextStepI18n,
  nextStepTargets,
  overviewSummaryI18n,
} from "@/components/learn/practice-progress-text";
import { PracticeSession } from "@/components/learn/PracticeSession";
// El proveedor de telemetria es obligatorio: `useTelemetry()` LANZA en
// desarrollo si falta (arreglo de hoy — "silencioso es peor que ruidoso"), y la
// isla de practica lo usa. Aqui monta la cola de verdad, pero como la ruta no
// sale a produccion y no hay sesion, los eventos no llegan a ninguna parte.
import { TelemetryProvider } from "@/lib/telemetry/provider";

/**
 * Eventos de ejemplo con la MISMA forma que las filas reales de
 * `learning_events` (comprobada contra producción: `payload` lleva `engineKey`,
 * `topicId`, `skillCode`, `isCorrect`, `pointsAwarded`).
 *
 * Se pasan por `readAnsweredEvents` + `summarisePracticeEvents`, o sea por el
 * MISMO camino de derivación que usa la pantalla real. Si el cálculo estuviera
 * mal, la captura lo enseñaría mal.
 */
function eventosDeEjemplo(): unknown[] {
  const filas: unknown[] = [];
  const empujar = (engineKey: string, aciertos: number, fallos: number): void => {
    // Del más reciente al más antiguo, que es el orden que devuelve la consulta.
    for (let i = 0; i < aciertos; i += 1) {
      filas.push({ payload: { engineKey, topicId: engineKey, isCorrect: true } });
    }
    for (let i = 0; i < fallos; i += 1) {
      filas.push({ payload: { engineKey, topicId: engineKey, isCorrect: false } });
    }
  };

  empujar("math.compare", 10, 0); // dominado
  empujar("math.simplify", 7, 3); // lo llevas bien
  empujar("math.powten", 4, 6); // aprendiendo
  empujar("math.fracop", 1, 9); // empezando
  empujar("math.decimal", 2, 0); // sin evidencia suficiente
  // `metric`, `shape`, `word` y `mixed` se quedan sin ninguna fila: son el caso
  // "sin practicar todavía", que tiene que verse distinto de "va mal".
  return filas;
}

const NIVELES = ["starting", "learning", "solid", "mastered"] as const;

/**
 * La vista de conjunto en cuatro momentos del curso, con nueve temas — que son
 * los que hay en la parrilla real quitando `mix`.
 */
const MUESTRAS_DE_CONJUNTO: readonly (readonly [string, readonly (MasteryLevel | null)[]])[] = [
  ["recién empezado", ["starting", "learning", null, null, null, null, null, null, null]],
  [
    "a mitad de curso",
    ["mastered", "solid", "solid", "learning", "starting", null, null, null, null],
  ],
  [
    "casi todo medido",
    ["mastered", "mastered", "mastered", "solid", "solid", "learning", "learning", "starting", null],
  ],
  ["sin practicar nada", [null, null, null, null, null, null, null, null, null]],
];

export default async function PracticePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const locale = "es" as const;
  const dictionary = getLearnDictionary(locale);
  const topics = practiceTopics(dictionary);
  const eventos: readonly AnsweredEvent[] = readAnsweredEvents(eventosDeEjemplo());
  const progress = summarisePracticeEvents(eventos);

  return (
    <UiLocaleProvider locale={locale}>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
        <header>
          <h1 className="text-2xl font-bold text-ink">{dictionary.practice.title}</h1>
          <p className="mt-2 max-w-prose text-muted">{dictionary.practice.subtitle}</p>
        </header>

        <PracticeTopicGrid
          topics={topics}
          dictionary={dictionary}
          progress={progress}
        />

        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">La vista de conjunto, en sus cuatro estados</h2>
          <p className="text-sm text-muted">
            Una columna por tema, ordenadas de menos a más nivel: la silueta ES la respuesta a
            «cómo voy». Los temas sin medir se dibujan como tocones huecos, muy por debajo del primer
            nivel —si se omitieran, tres columnas altas se leerían igual con cuatro temas que con
            doce—. Con
            NINGÚN tema medido no se pinta nada: una fila de tocones sería una medida de cero, y
            cero no es ausencia.
          </p>
          <ul className="flex flex-col gap-3">
            {MUESTRAS_DE_CONJUNTO.map(([titulo, niveles]) => (
              <li key={titulo} className="flex flex-wrap items-center gap-3">
                <code className="w-40 shrink-0 text-xs text-muted">{titulo}</code>
                <MasteryOverview levels={niveles} summary={overviewSummaryI18n(niveles)} />
                {niveles.every((n) => n === null) ? (
                  <em className="text-sm text-muted">(no se pinta nada)</em>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">Los cuatro peldaños, uno al lado del otro</h2>
          <p className="text-sm text-muted">
            El nivel se codifica con CUÁNTOS peldaños están llenos y con su altura, no con el tono:
            los cuatro usan el mismo color, y los pendientes van con el contorno discontinuo. En
            blanco y negro se sigue leyendo.
          </p>
          <ul className="flex flex-wrap gap-6">
            {NIVELES.map((nivel) => (
              <li key={nivel} className="flex items-center gap-2">
                <MasteryLadder level={nivel} groupLabel={{ es: "Ejemplo", en: "Example" }} size="md" showLabel />
              </li>
            ))}
            <li className="flex items-center gap-2 text-sm text-muted">
              sin evidencia →{" "}
              <MasteryLadder level={null} groupLabel={{ es: "Ejemplo", en: "Example" }} size="md" showLabel />
              <em>(no se pinta nada)</em>
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">«Cuánto esfuerzo más»</h2>
          <p className="text-sm text-muted">
            Nunca un porcentaje y nunca un total: siempre el peldaño siguiente, en aciertos, acotado
            a una sentada.
          </p>
          <ul className="flex flex-col gap-2">
            {[...progress.values()].map((p) => (
              <li key={p.engineKey} className="flex flex-wrap items-center gap-3">
                <code className="text-xs text-muted">{p.engineKey}</code>
                <span className="text-xs text-muted">
                  {p.windowCorrect}/{p.windowAnswered} en la ventana reciente
                </span>
                <EffortMeter targets={nextStepTargets(p.nextStep)} message={nextStepI18n(p.nextStep)} />
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">
            Los chips dentro del bucle, que es donde se decidió la forma
          </h2>
          <p className="text-sm text-muted">
            Diez chips en una fila que hace wrap. La escalera va dentro del chip, a la derecha del
            rótulo: cuesta 25 px de ancho y cero de alto. Los chips sin evidencia no llevan escalera.
          </p>
          <TelemetryProvider>
            <PracticeSession
              topicId="math.simplify"
              locale={locale}
              levels={Object.fromEntries([...progress].map(([k, v]) => [k, v.level] as const))}
            />
          </TelemetryProvider>
        </section>
      </div>
    </UiLocaleProvider>
  );
}
