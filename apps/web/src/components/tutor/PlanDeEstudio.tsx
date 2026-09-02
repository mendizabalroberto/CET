"use client";

import { useActionState, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n/provider";
import {
  cancelarPlan,
  confirmarBoletin,
  descartarBoletin,
  fijarPlan,
  proponerPlan,
  subirBoletin,
  type PlanState,
} from "@/lib/plan/acciones";
import type { BoletinResumen, EventoProximo, PlanResumen } from "@/lib/plan/consultas";

type TechoVisible = {
  readonly subjectId: string;
  readonly code: string;
  readonly minutosPedidos: number;
  readonly minutosDisponibles: number;
};

type Valores = Record<string, string | number>;
type AccionDeEscritura =
  | "subir"
  | "confirmar"
  | "proponer"
  | "fijar"
  | "cancelar"
  | "descartar";

interface Props {
  readonly studentId: string;
  readonly boletin: BoletinResumen | null;
  readonly boletines: readonly BoletinResumen[];
  readonly plan: PlanResumen | null;
  readonly nombre: string;
  readonly eventos: readonly EventoProximo[];
  readonly yearLevel: number | null;
}

const ESTADO_INICIAL = { ok: false } as const;

function textoDe(valores: Valores | undefined, clave: string): string | null {
  const valor = valores?.[clave];
  return typeof valor === "string" ? valor : null;
}

function numeroDe(valores: Valores | undefined, clave: string): number | null {
  const valor = valores?.[clave];
  return typeof valor === "number" ? valor : null;
}

function parsearPesos(valores: Valores | undefined): Record<string, number> {
  const crudo = textoDe(valores, "pesos");
  if (crudo === null) return {};
  try {
    const resultado = JSON.parse(crudo) as Partial<Record<string, number>> | null;
    if (resultado === null) return {};
    return Object.fromEntries(
      Object.entries(resultado).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function parsearRecomendaciones(valores: Valores | undefined): string[] {
  const crudo = textoDe(valores, "recomendaciones");
  if (crudo === null) return [];
  try {
    const resultado: unknown = JSON.parse(crudo);
    return Array.isArray(resultado)
      ? resultado.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function parsearTechos(valores: Valores | undefined): TechoVisible[] {
  const crudo = textoDe(valores, "techos");
  if (crudo === null) return [];
  try {
    const resultado: unknown = JSON.parse(crudo);
    return Array.isArray(resultado) ? (resultado as TechoVisible[]) : [];
  } catch {
    return [];
  }
}

/**
 * Una fecha civil («2026-08-24», sin hora) se pinta tal cual es, en cualquier
 * zona horaria. `new Date("2026-08-24")` es la medianoche UTC, y en La Paz
 * (UTC-4) `toLocaleDateString` la enseñaba como el 23: el plan «empezaba» un
 * día antes y el feriado del 24 caía en 23. Medido en `/dev/plan-preview` el
 * 02/09/2026. Un instante con hora (`createdAt`, `confirmadoAt`) sí se
 * convierte a la hora local, que es lo que se espera de un instante.
 */
export function fechaLegible(iso: string, locale: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  const idioma = locale === "es" ? "es-ES" : "en-GB";
  const esFechaCivil = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return esFechaCivil
    ? fecha.toLocaleDateString(idioma, { timeZone: "UTC" })
    : fecha.toLocaleDateString(idioma);
}

export function PlanDeEstudio({
  studentId,
  boletin,
  boletines,
  plan,
  nombre,
  eventos,
  yearLevel,
}: Props) {
  const { t, fmt, locale } = useI18n();
  const P = t.tutor.child.plan;

  const [subida, accionSubir, subiendo] = useActionState(subirBoletin, ESTADO_INICIAL);
  const [confirmacion, accionConfirmar, confirmando] = useActionState(
    confirmarBoletin,
    ESTADO_INICIAL,
  );
  const [propuesta, accionProponer, proponiendo] = useActionState(proponerPlan, ESTADO_INICIAL);
  const [fijacion, accionFijar, fijando] = useActionState(fijarPlan, ESTADO_INICIAL);
  const [cancelacion, accionCancelar, cancelando] = useActionState(cancelarPlan, ESTADO_INICIAL);
  const [descarte, accionDescartar, descartando] = useActionState(
    descartarBoletin,
    ESTADO_INICIAL,
  );

  const [pidiendoConfirmacionDeCancelar, setPidiendoConfirmacionDeCancelar] = useState(false);

  const ultimaAccion = useRef<AccionDeEscritura | null>(null);
  const marcar = (accion: AccionDeEscritura) => () => {
    ultimaAccion.current = accion;
  };

  const estados: Record<AccionDeEscritura, PlanState> = {
    subir: subida,
    confirmar: confirmacion,
    proponer: propuesta,
    fijar: fijacion,
    cancelar: cancelacion,
    descartar: descarte,
  };

  // El estado que manda para el acuse (éxito o error): el de la última acción
  // que se envió, o —antes de que se envíe nada— el primero que ya traiga
  // algo que contar, en el mismo orden en que aparecen en la pantalla.
  const estadoActivo =
    ultimaAccion.current !== null
      ? estados[ultimaAccion.current]
      : (Object.values(estados).find((estado) => estado.errorKey !== undefined || estado.ok) ??
        (ESTADO_INICIAL as PlanState));

  const errorKey = estadoActivo.ok ? undefined : estadoActivo.errorKey;
  const successKey = estadoActivo.ok ? estadoActivo.successKey : undefined;

  const mensajeDeError =
    errorKey === undefined
      ? null
      : fmt(t.tutor.errors[errorKey as keyof typeof t.tutor.errors] ?? t.tutor.errors.generic, {
          name: nombre,
        });

  const mensajeDeExito =
    successKey === undefined
      ? null
      : fmt(P.success[successKey as keyof typeof P.success], { name: nombre });

  const valoresPropuesta = propuesta.ok ? propuesta.values : undefined;
  const hayPropuesta = valoresPropuesta !== undefined;
  const pesosPropuesta = parsearPesos(valoresPropuesta);
  const recomendacionesPropuesta = parsearRecomendaciones(valoresPropuesta);
  const minutosPropuesta = numeroDe(valoresPropuesta, "minutosPorDia") ?? 10;
  const desdePropuesta = textoDe(valoresPropuesta, "desde") ?? "";
  const hastaPropuesta = textoDe(valoresPropuesta, "hasta") ?? "";
  const hitoPropuesta = textoDe(valoresPropuesta, "hito") ?? "";

  const techosFijados = parsearTechos(fijacion.ok ? fijacion.values : undefined);
  const tareasFijadas = numeroDe(fijacion.ok ? fijacion.values : undefined, "tareas");
  const hayPlan = plan !== null || fijacion.ok;
  const techosVisibles: readonly TechoVisible[] =
    plan !== null ? plan.reparto.techos : techosFijados;

  const nombrePorCode = new Map<string, string>();
  const notas = boletin?.notas ?? [];
  if (boletin !== null) {
    for (const nota of boletin.notas) {
      if (nota.code !== null) nombrePorCode.set(nota.code, nota.materia);
    }
  }

  const fechaConfirmado =
    boletin !== null && boletin.estado === "confirmado" && boletin.confirmadoAt !== null
      ? new Date(boletin.confirmadoAt).toLocaleDateString(locale === "es" ? "es-ES" : "en-GB")
      : null;

  const historial = boletin === null ? boletines : boletines.slice(1);

  const tablaDeNotas = (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-line text-muted border-b text-left">
            <th scope="col" className="px-4 py-3 font-semibold">
              {P.colSubject}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              {P.colGrade}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              {P.colBand}
            </th>
          </tr>
        </thead>
        <tbody>
          {notas.map((nota, indice) => (
            <tr key={`${nota.materia}-${indice}`} className="border-line border-b last:border-0">
              <th scope="row" className="text-ink px-4 py-3 text-left font-semibold">
                {nota.materia}
                {nota.code === null ? (
                  <p className="text-muted mt-1 text-[13px]">{P.notPlanned}</p>
                ) : null}
              </th>
              <td className="px-4 py-3 text-right">
                {boletin?.estado === "extraido" ? (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    name={`nota:${indice}`}
                    defaultValue={nota.nota}
                    className="border-line bg-bg text-ink w-20 rounded-lg border-2 px-2 py-1 text-right"
                  />
                ) : (
                  <span className="text-ink font-semibold">{nota.nota}</span>
                )}
              </td>
              <td className="text-ink px-4 py-3 font-medium">{P.bands[nota.banda]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  function tablaHistorica(fila: BoletinResumen) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-line text-muted border-b text-left">
              <th scope="col" className="px-4 py-3 font-semibold">
                {P.colSubject}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                {P.colGrade}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                {P.colBand}
              </th>
            </tr>
          </thead>
          <tbody>
            {fila.notas.map((nota, indice) => (
              <tr key={`${nota.materia}-${indice}`} className="border-line border-b last:border-0">
                <th scope="row" className="text-ink px-4 py-3 text-left font-semibold">
                  {nota.materia}
                </th>
                <td className="text-ink px-4 py-3 text-right font-semibold">{nota.nota}</td>
                <td className="text-ink px-4 py-3 font-medium">{P.bands[nota.banda]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const formularioDeSubida = (
    <form action={accionSubir} onSubmit={marcar("subir")} className="mt-4 space-y-3">
      <label htmlFor="plan-archivo" className="text-ink block font-semibold">
        {P.uploadLabel}
      </label>
      <input
        id="plan-archivo"
        type="file"
        accept="application/pdf"
        name="archivo"
        className="text-ink block w-full text-sm"
      />
      <input type="hidden" name="studentId" value={studentId} />
      <button
        type="submit"
        disabled={subiendo}
        className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
      >
        {subiendo ? P.uploading : P.uploadButton}
      </button>
      <p className="text-muted text-[15px]">{P.uploadHelp}</p>
    </form>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-ink text-xl font-bold">{fmt(P.title, { name: nombre })}</h2>

      <section className="border-line bg-card rounded-2xl border-2 p-5">
        <h2 className="text-ink text-lg font-bold">{P.uploadTitle}</h2>
        <p className="text-muted mt-2">{P.intro}</p>
        {boletin === null ? formularioDeSubida : null}
      </section>

      {boletin !== null ? (
        <section className="border-line bg-card rounded-2xl border-2 p-5">
          <h2 className="text-ink text-lg font-bold">{P.extractedTitle}</h2>
          <p className="text-muted mt-2">
            {boletin.trimestre === null
              ? fmt(P.termUnknown, { year: boletin.gestion })
              : fmt(P.term, { n: boletin.trimestre, year: boletin.gestion })}
          </p>
          {boletin.estado === "extraido" ? (
            <>
              <form
                action={accionConfirmar}
                onSubmit={marcar("confirmar")}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="studentId" value={studentId} />
                <input type="hidden" name="boletinId" value={boletin.id} />
                {tablaDeNotas}
                <button
                  type="submit"
                  disabled={confirmando}
                  className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
                >
                  {confirmando ? P.confirming : P.confirmButton}
                </button>
                <p className="text-muted text-[15px]">{P.extractedHelp}</p>
              </form>
              <form
                action={accionDescartar}
                onSubmit={marcar("descartar")}
                className="mt-4 space-y-2"
              >
                <input type="hidden" name="studentId" value={studentId} />
                <input type="hidden" name="boletinId" value={boletin.id} />
                <button
                  type="submit"
                  disabled={descartando}
                  className="border-line text-ink rounded-xl border-2 px-5 py-3 font-semibold disabled:opacity-60"
                >
                  {descartando ? P.discarding : P.discardButton}
                </button>
                <p className="text-muted text-[15px]">{P.discardHelp}</p>
              </form>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              {tablaDeNotas}
              {fechaConfirmado !== null ? (
                <p className="text-muted text-[15px]">
                  {fmt(P.confirmed, { date: fechaConfirmado })}
                </p>
              ) : null}
            </div>
          )}
          {formularioDeSubida}
        </section>
      ) : null}

      {boletin !== null && boletin.estado === "confirmado" ? (
        <section className="border-line bg-card rounded-2xl border-2 p-5">
          <h2 className="text-ink text-lg font-bold">{P.proposalTitle}</h2>
          {!hayPropuesta ? (
            <form action={accionProponer} onSubmit={marcar("proponer")} className="mt-4">
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="boletinId" value={boletin.id} />
              <button
                type="submit"
                disabled={proponiendo}
                className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
              >
                {proponiendo ? P.proposing : P.proposeButton}
              </button>
            </form>
          ) : (
            <form action={accionFijar} onSubmit={marcar("fijar")} className="mt-4 space-y-4">
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="boletinId" value={boletin.id} />
              <input type="hidden" name="pesos" value={textoDe(valoresPropuesta, "pesos") ?? ""} />
              <input
                type="hidden"
                name="recomendaciones"
                value={textoDe(valoresPropuesta, "recomendaciones") ?? ""}
              />
              <input
                type="hidden"
                name="modelo"
                value={textoDe(valoresPropuesta, "modelo") ?? ""}
              />
              <input
                type="hidden"
                name="tokensIn"
                value={numeroDe(valoresPropuesta, "tokensIn") ?? 0}
              />
              <input
                type="hidden"
                name="tokensOut"
                value={numeroDe(valoresPropuesta, "tokensOut") ?? 0}
              />
              <input type="hidden" name="desde" value={desdePropuesta} />
              <input type="hidden" name="hasta" value={hastaPropuesta} />
              <p className="text-ink text-[15px]">
                {fmt(P.windowLine, {
                  from: fechaLegible(desdePropuesta, locale),
                  to: fechaLegible(hastaPropuesta, locale),
                  milestone: hitoPropuesta,
                })}
              </p>
              <div>
                <label htmlFor="plan-minutos" className="text-ink block font-semibold">
                  {P.minutesLabel}
                </label>
                <input
                  id="plan-minutos"
                  type="number"
                  name="minutosPorDia"
                  min={10}
                  max={180}
                  defaultValue={minutosPropuesta}
                  className="border-line bg-bg text-ink w-32 rounded-lg border-2 px-3 py-2"
                />
                <p className="text-muted mt-1 text-[15px]">{P.minutesHelp}</p>
              </div>
              <div>
                <h3 className="text-ink font-semibold">{P.weightsTitle}</h3>
                <ul className="text-ink mt-1 list-inside list-disc text-[15px]">
                  {Object.entries(pesosPropuesta).map(([code, peso]) => {
                    const nombreMateria = nombrePorCode.get(code) ?? code;
                    return (
                      <li key={code}>
                        {nombreMateria} → {Math.round(peso * 100)}%
                      </li>
                    );
                  })}
                </ul>
              </div>
              {recomendacionesPropuesta.length > 0 ? (
                <div>
                  <h3 className="text-ink font-semibold">{P.recommendationsTitle}</h3>
                  <p className="text-muted text-[15px]">{P.recommendationsNote}</p>
                  <ul className="text-ink mt-1 list-inside list-disc text-[15px]">
                    {recomendacionesPropuesta.map((recomendacion, indice) => (
                      <li key={`${indice}-${recomendacion}`}>{recomendacion}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {plan !== null ? (
                <p className="bg-bg text-ink rounded-lg px-4 py-3 text-[15px]">
                  {P.replaceWarning}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={fijando}
                className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
              >
                {fijando ? P.creating : P.createButton}
              </button>
            </form>
          )}
        </section>
      ) : null}

      {hayPlan ? (
        <section className="border-line bg-card rounded-2xl border-2 p-5">
          <h2 className="text-ink text-lg font-bold">{P.activeTitle}</h2>
          {plan !== null ? (
            <>
              <p className="text-ink mt-2 text-[15px]">
                {fmt(P.activeRange, {
                  from: fechaLegible(plan.desde, locale),
                  to: fechaLegible(plan.hasta, locale),
                })}
              </p>
              <p className="text-ink mt-1 text-[15px]">
                {fmt(P.activeMinutes, { count: plan.minutosPorDia })}
              </p>
              <p className="text-ink mt-1 text-[15px]">
                {fmt(P.activeTasks, { count: plan.tareas })}
              </p>
            </>
          ) : tareasFijadas !== null ? (
            <p className="text-ink mt-2 text-[15px]">
              {fmt(P.activeTasks, { count: tareasFijadas })}
            </p>
          ) : null}
          {techosVisibles.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-ink font-semibold">{P.ceilingsTitle}</h3>
              <ul className="text-ink mt-1 space-y-1 text-[15px]">
                {techosVisibles.map((techo) => (
                  <li key={techo.subjectId}>
                    {fmt(P.ceilingLine, {
                      subject: techo.code,
                      available: techo.minutosDisponibles,
                      requested: techo.minutosPedidos,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan !== null && plan.recomendaciones.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-ink font-semibold">{P.recommendationsTitle}</h3>
              <ul className="text-ink mt-1 list-inside list-disc text-[15px]">
                {plan.recomendaciones.map((recomendacion, indice) => (
                  <li key={`${indice}-${recomendacion}`}>{recomendacion}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-4">
            <h3 className="text-ink font-semibold">{P.reportsTitle}</h3>
            {plan !== null && plan.partes.length > 0 ? (
              <ul className="text-ink mt-1 space-y-1 text-[15px]">
                {plan.partes.map((parte, indice) => (
                  <li key={`${parte.fecha}-${indice}`}>
                    {fmt(P.reportLine, {
                      date: fechaLegible(parte.fecha, locale),
                      planned: parte.minutosPrevistos,
                      studied: parte.minutosMedidos,
                      items: parte.itemsRespondidos,
                      correct: parte.aciertos,
                    })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mt-1 text-[15px]">{P.reportsEmpty}</p>
            )}
          </div>
          {plan !== null ? (
            <div className="border-line mt-4 rounded-xl border-2 p-4">
              <h3 className="text-ink font-semibold">{P.cancelTitle}</h3>
              <p className="text-muted mt-1 text-[15px]">
                {fmt(P.cancelBody, { name: nombre })}
              </p>
              {!pidiendoConfirmacionDeCancelar ? (
                <button
                  type="button"
                  onClick={() => setPidiendoConfirmacionDeCancelar(true)}
                  className="border-line text-ink mt-3 rounded-xl border-2 px-5 py-3 font-semibold"
                >
                  {P.cancelButton}
                </button>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <form action={accionCancelar} onSubmit={marcar("cancelar")}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="studentId" value={studentId} />
                    <button
                      type="submit"
                      disabled={cancelando}
                      className="border-danger text-ink rounded-xl border-2 px-5 py-3 font-semibold disabled:opacity-60"
                    >
                      {cancelando ? P.cancelling : P.cancelConfirm}
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={() => setPidiendoConfirmacionDeCancelar(false)}
                    className="text-ink px-5 py-3 font-semibold"
                  >
                    {P.cancelKeep}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : boletin === null ? (
        <section className="border-line bg-card rounded-2xl border-2 p-5">
          <h2 className="text-ink text-lg font-bold">{P.noPlanTitle}</h2>
          <p className="text-muted mt-2">{P.noReportCard}</p>
        </section>
      ) : (
        <section className="border-line bg-card rounded-2xl border-2 p-5">
          <h2 className="text-ink text-lg font-bold">{P.noPlanTitle}</h2>
          <p className="text-muted mt-2">{P.noPlanBody}</p>
        </section>
      )}

      <section className="border-line bg-card rounded-2xl border-2 p-5">
        <h2 className="text-ink text-lg font-bold">{P.historyTitle}</h2>
        {historial.length === 0 ? (
          <p className="text-muted mt-2 text-[15px]">{P.historyEmpty}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {historial.map((fila) => {
              const term =
                fila.trimestre === null
                  ? P.historyTermUnknown
                  : fmt(P.term, { n: fila.trimestre, year: fila.gestion });
              return (
                <li key={fila.id} className="border-line border-b pb-2 last:border-0 last:pb-0">
                  <details>
                    <summary className="text-ink cursor-pointer text-[15px] font-medium">
                      {fmt(P.historyLine, {
                        term,
                        count: fila.notas.length,
                        date: fechaLegible(fila.createdAt, locale),
                      })}
                    </summary>
                    <div className="mt-2">{tablaHistorica(fila)}</div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="border-line bg-card rounded-2xl border-2 p-5">
        <h2 className="text-ink text-lg font-bold">{P.calendarTitle}</h2>
        {eventos.length === 0 ? (
          <p className="text-muted mt-2 text-[15px]">{P.calendarEmpty}</p>
        ) : (
          <ul className="mt-3 space-y-2 text-[15px]">
            {eventos.map((evento, indice) => {
              const esDeOtroCurso =
                evento.tipo === "hito_cambridge" &&
                evento.yearLevels.length > 0 &&
                (yearLevel === null || !evento.yearLevels.includes(yearLevel));
              const rango =
                evento.desde === evento.hasta
                  ? fmt(P.calendarDay, { date: fechaLegible(evento.desde, locale) })
                  : fmt(P.calendarRange, {
                      from: fechaLegible(evento.desde, locale),
                      to: fechaLegible(evento.hasta, locale),
                    });
              return (
                <li
                  key={`${evento.tipo}-${evento.desde}-${indice}`}
                  className={esDeOtroCurso ? "text-muted" : "text-ink"}
                >
                  <span className="font-semibold">{P.calendarTypes[evento.tipo]}</span>
                  {" — "}
                  {rango}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {mensajeDeExito !== null ? (
        <p
          role="status"
          className="border-brand bg-brand/10 text-ink rounded-lg border-l-4 px-4 py-3 text-[15px]"
        >
          {mensajeDeExito}
        </p>
      ) : null}

      {mensajeDeError !== null ? (
        <p
          role="alert"
          className="border-danger bg-danger/10 text-ink rounded-lg border-l-4 px-4 py-3 text-[15px]"
        >
          {mensajeDeError}
        </p>
      ) : null}
    </div>
  );
}
