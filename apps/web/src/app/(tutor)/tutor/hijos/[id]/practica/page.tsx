/**
 * /tutor/hijos/[id]/practica — qué practicó el hijo, pregunta a pregunta.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ NO BASTABA CON EL INFORME
 * ===========================================================================
 * La ficha ya dice «respondió 84 preguntas, acertó el 71 %». Con eso un padre
 * sabe que algo pasó y no sabe qué hacer al respecto. Lo accionable está un
 * nivel más abajo: EN QUÉ falla, si falla rápido —tanteo— o despacio —se
 * atasca—, y si llegó a la respuesta solo o pidiendo pista. Eso es lo que un
 * padre puede llevarse a la mesa de la cocina el sábado por la mañana.
 *
 * ===========================================================================
 * DOS TABLAS, Y NO UNA
 * ===========================================================================
 * «Por tema» responde dónde mirar; «Una a una» responde qué pasó exactamente.
 * Fundirlas daría una lista larguísima sin cabecera desde la que orientarse, y
 * quedarse solo con la primera devolvería el mismo porcentaje del que veníamos
 * huyendo.
 *
 * ===========================================================================
 * LO QUE ESTA PANTALLA NO HACE
 * ===========================================================================
 * NO JUZGA. Dice qué pasó y se calla: ni «va flojo», ni «necesita refuerzo», ni
 * un color rojo de alarma sobre un tema. Quien conoce al niño es su padre; aquí
 * solo están los datos. Por eso la columna de pistas lleva su propia nota al
 * pie: una columna de pistas sin explicar se lee como un contador de trampas, y
 * pedir ayuda al atascarse es exactamente lo que hay que hacer.
 *
 * Y no ofrece practicar. `/practice` es zona de `student`: la práctica es del
 * niño, y un padre no debe poder añadir respuestas a su historial.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState, ErrorState } from "@cet/ui";

import { getLearnDictionary } from "@/components/learn/dictionary";
import { findPracticeTopic } from "@/components/learn/practice-topics";
import { dictI18n, interpolate } from "@/lib/i18n";
import { getServerDictionary } from "@/lib/i18n/server";
import { DIAS_DE_ESTUDIO, practicaDeHijo } from "@/lib/tutor/estudio";
import { hayPractica, type TemaPracticado } from "@/lib/tutor/practica";
import { alcanceDeHijo } from "@/lib/tutor/queries";

/**
 * Cuántos intentos detallados se pintan.
 *
 * Cincuenta llenan varias pantallas de móvil y siguen siendo hojeables. Con el
 * histórico entero, la tabla dejaría de ser algo que se lee y pasaría a ser
 * algo que se recorre — y nadie recorre novecientas filas para encontrar el
 * fallo de ayer, que además estaría arriba del todo.
 */
const MAX_INTENTOS = 50;

/** «Leo Mendizabal García» -> «Leo». */
function nombreDePila(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.child.nav.practice };
}

export default async function PracticaDelHijoPage({ params }: PageProps) {
  const { id } = await params;
  const { locale, t } = await getServerDictionary();

  const hijo = await alcanceDeHijo(id);
  if (hijo === null) notFound();

  const P = t.tutor.child.practice;
  const practica = await practicaDeHijo(hijo.id, MAX_INTENTOS);

  /**
   * El nombre legible de un tema.
   *
   * Sale del MISMO catálogo que ve el niño (`practice-topics.ts` deriva los
   * temas del registro de `@cet/engine`), así que padre e hijo llaman igual a
   * lo mismo. Un generador retirado deja eventos huérfanos en el histórico: se
   * nombran de forma neutra en vez de enseñarle `math.simplify` a un padre.
   */
  const d = getLearnDictionary(locale);
  const nombreDeTema = (engineKey: string): string => {
    const topic = findPracticeTopic(engineKey, d);
    return topic === undefined ? P.unknownTopic : d.practice.topics[topic.slug];
  };

  const cuando = new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  });

  const porcentaje = (valor: number): string =>
    interpolate(t.tutor.child.progress.percentValue, { value: Math.round(valor * 100) });

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-bold text-ink">
          {interpolate(P.title, { name: nombreDePila(hijo.nombre) })}
        </h2>
        <p className="mt-2 text-muted">{P.subtitle}</p>
        <p className="mt-1 text-sm text-muted">
          {interpolate(P.window, { days: DIAS_DE_ESTUDIO })}
        </p>
      </header>

      {practica === null ? (
        <ErrorState
          title={dictI18n((x) => x.tutor.child.practice.errorTitle)}
          body={dictI18n((x) => x.tutor.child.practice.errorBody)}
        />
      ) : !hayPractica(practica) ? (
        <EmptyState
          title={dictI18n((x) => x.tutor.child.practice.emptyTitle)}
          body={dictI18n((x) => x.tutor.child.practice.emptyBody)}
        />
      ) : (
        <>
          {/* El aviso de truncado va ARRIBA del todo. Abajo, después de
              cincuenta filas, ya no lo lee nadie — y es justo el dato que
              cambia cómo se interpretan las cifras de encima. */}
          {practica.truncado ? (
            <p role="status" className="rounded-lg border border-line bg-card px-4 py-3 text-sm text-muted">
              {P.truncated}
            </p>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-lg font-bold text-ink">{P.byTopicTitle}</h3>
            {/* `overflow-x-auto`: siete columnas no caben en 360 px, y una tabla
                que desborda el `body` rompe el desplazamiento de toda la
                página. Que se mueva la tabla, no la pantalla. */}
            <div className="overflow-x-auto rounded-2xl border-2 border-line bg-card">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th scope="col" className="px-4 py-3 font-semibold">{P.topic}</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">{P.answered}</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">{P.right}</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">{P.wrong}</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">{P.accuracy}</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">{P.hints}</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">{P.solutions}</th>
                  </tr>
                </thead>
                <tbody>
                  {practica.temas.map((tema: TemaPracticado) => (
                    <tr key={tema.engineKey} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                        {nombreDeTema(tema.engineKey)}
                      </th>
                      <td className="px-4 py-3 text-right text-ink">{tema.respondidas}</td>
                      <td className="px-4 py-3 text-right text-ink">{tema.aciertos}</td>
                      <td className="px-4 py-3 text-right text-ink">{tema.fallos}</td>
                      {/* Sin porcentaje cuando no contestó ninguna: dividir por
                          cero daría un `NaN%`, y un `0 %` sería peor todavía
                          porque es una nota que nadie sacó. */}
                      <td className="px-4 py-3 text-right text-ink">
                        {tema.precision === null ? "—" : porcentaje(tema.precision)}
                      </td>
                      <td className="px-4 py-3 text-right text-ink">{tema.pistas}</td>
                      <td className="px-4 py-3 text-right text-ink">{tema.soluciones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted">{P.hintNote}</p>
          </section>

          {practica.intentos.length === 0 ? null : (
            <section className="space-y-3">
              <h3 className="text-lg font-bold text-ink">{P.oneByOneTitle}</h3>
              <p className="text-sm text-muted">{P.oneByOneBody}</p>

              {/* UNA LISTA Y NO UNA TABLA. Cada intento tiene seis datos de
                  longitud muy distinta —la respuesta del niño puede ser «1/2» o
                  una frase— y en 360 px una tabla de seis columnas obliga a
                  desplazarse en horizontal para leer CADA fila. La lista pone
                  cada intento en su propia tarjeta y se lee de arriba abajo. */}
              <ul className="space-y-2">
                {practica.intentos.map((intento, indice) => (
                  <li
                    key={`${intento.cuando}-${indice}`}
                    className="rounded-2xl border-2 border-line bg-card p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {nombreDeTema(intento.engineKey)}
                      </span>
                      {/* EL RESULTADO SE DICE CON PALABRAS Y NO SOLO CON COLOR.
                          Un padre daltónico —y cualquiera en una pantalla al
                          sol— tiene que poder distinguir acierto de fallo sin
                          depender del verde y el rojo. El símbolo va
                          `aria-hidden` porque el texto de al lado ya lo dice. */}
                      <span
                        className={[
                          "text-sm font-semibold",
                          intento.acerto ? "text-teal" : "text-ink",
                        ].join(" ")}
                      >
                        <span aria-hidden="true">{intento.acerto ? "✓ " : "✗ "}</span>
                        {intento.acerto ? P.outcomeRight : P.outcomeWrong}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-muted">
                      {P.theirAnswer}:{" "}
                      <span className="font-semibold text-ink">
                        {intento.respuesta ?? P.noAnswer}
                      </span>
                    </p>

                    <p className="mt-1 text-sm text-muted">
                      {cuando.format(new Date(intento.cuando))}
                      {intento.segundos === null
                        ? ""
                        : ` · ${interpolate(P.seconds, { count: intento.segundos })}`}
                      {" · "}
                      {intento.pistas === 0
                        ? P.noHelp
                        : interpolate(P.hintsOnItem, { count: intento.pistas })}
                      {intento.cambios === 0
                        ? ""
                        : ` · ${interpolate(P.changesOnItem, { count: intento.cambios })}`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
