"use client";

import { useActionState, useRef } from "react";

import { useI18n } from "@/lib/i18n/provider";
import {
  confirmarBoletin,
  fijarPlan,
  proponerPlan,
  subirBoletin,
} from "@/lib/plan/acciones";
import type { BoletinResumen, PlanResumen } from "@/lib/plan/consultas";

type TechoVisible = {
  readonly subjectId: string;
  readonly code: string;
  readonly minutosPedidos: number;
  readonly minutosDisponibles: number;
};

type Valores = Record<string, string | number>;
type AccionDeEscritura = "subir" | "confirmar" | "proponer" | "fijar";

interface Props {
  readonly studentId: string;
  readonly boletin: BoletinResumen | null;
  readonly plan: PlanResumen | null;
  readonly nombre: string;
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

function fechaLegible(iso: string, locale: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB");
}

export function PlanDeEstudio({ studentId, boletin, plan }: Props) {
  const { t, fmt, locale } = useI18n();
  const P = t.tutor.child.plan;

  const [subida, accionSubir, subiendo] = useActionState(subirBoletin, ESTADO_INICIAL);
  const [confirmacion, accionConfirmar, confirmando] = useActionState(
    confirmarBoletin,
    ESTADO_INICIAL,
  );
  const [propuesta, accionProponer, proponiendo] = useActionState(proponerPlan, ESTADO_INICIAL);
  const [fijacion, accionFijar, fijando] = useActionState(fijarPlan, ESTADO_INICIAL);

  const ultimaAccion = useRef<AccionDeEscritura | null>(null);
  const marcar = (accion: AccionDeEscritura) => () => {
    ultimaAccion.current = accion;
  };

  const errorKey =
    ultimaAccion.current === "subir"
      ? subida.errorKey
      : ultimaAccion.current === "confirmar"
        ? confirmacion.errorKey
        : ultimaAccion.current === "proponer"
          ? propuesta.errorKey
          : ultimaAccion.current === "fijar"
            ? fijacion.errorKey
            : (subida.errorKey ?? confirmacion.errorKey ?? propuesta.errorKey ?? fijacion.errorKey);

  const mensaje =
    errorKey === undefined
      ? null
      : (t.tutor.errors[errorKey as keyof typeof t.tutor.errors] ?? t.tutor.errors.generic);

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

  const tablaDeNotas = (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th scope="col" className="px-4 py-3 font-semibold">{P.colSubject}</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">{P.colGrade}</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">{P.colBand}</th>
          </tr>
        </thead>
        <tbody>
          {notas.map((nota, indice) => (
            <tr key={`${nota.materia}-${indice}`} className="border-b border-line last:border-0">
              <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                {nota.materia}
                {nota.code === null ? (
                  <p className="mt-1 text-[13px] text-muted">{P.notPlanned}</p>
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
                    className="w-20 rounded-lg border-2 border-line bg-bg px-2 py-1 text-right text-ink"
                  />
                ) : (
                  <span className="font-semibold text-ink">{nota.nota}</span>
                )}
              </td>
              <td className="px-4 py-3 font-medium text-ink">{P.bands[nota.banda]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const formularioDeSubida = (
    <form action={accionSubir} onSubmit={marcar("subir")} className="mt-4 space-y-3">
      <label htmlFor="plan-archivo" className="block font-semibold text-ink">
        {P.uploadLabel}
      </label>
      <input
        id="plan-archivo"
        type="file"
        accept="application/pdf"
        name="archivo"
        className="block w-full text-sm text-ink"
      />
      <input type="hidden" name="studentId" value={studentId} />
      <button
        type="submit"
        disabled={subiendo}
        className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
      >
        {subiendo ? P.uploading : P.uploadButton}
      </button>
      <p className="text-[15px] text-muted">{P.uploadHelp}</p>
    </form>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border-2 border-line bg-card p-5">
        <h2 className="text-lg font-bold text-ink">{P.uploadTitle}</h2>
        <p className="mt-2 text-muted">{P.intro}</p>
        {boletin === null ? formularioDeSubida : null}
      </section>

      {boletin !== null ? (
        <section className="rounded-2xl border-2 border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">{P.extractedTitle}</h2>
          <p className="mt-2 text-muted">
            {boletin.trimestre === null
              ? fmt(P.termUnknown, { year: boletin.gestion })
              : fmt(P.term, { n: boletin.trimestre, year: boletin.gestion })}
          </p>
          {boletin.estado === "extraido" ? (
            <form action={accionConfirmar} onSubmit={marcar("confirmar")} className="mt-4 space-y-3">
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="boletinId" value={boletin.id} />
              {tablaDeNotas}
              <button
                type="submit"
                disabled={confirmando}
                className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
              >
                {confirmando ? P.confirming : P.confirmButton}
              </button>
              <p className="text-[15px] text-muted">{P.extractedHelp}</p>
            </form>
          ) : (
            <div className="mt-4 space-y-3">
              {tablaDeNotas}
              {fechaConfirmado !== null ? (
                <p className="text-[15px] text-muted">
                  {fmt(P.confirmed, { date: fechaConfirmado })}
                </p>
              ) : null}
            </div>
          )}
          {formularioDeSubida}
        </section>
      ) : null}

      {boletin !== null && boletin.estado === "confirmado" ? (
        <section className="rounded-2xl border-2 border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">{P.proposalTitle}</h2>
          {!hayPropuesta ? (
            <form action={accionProponer} onSubmit={marcar("proponer")} className="mt-4">
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="boletinId" value={boletin.id} />
              <button
                type="submit"
                disabled={proponiendo}
                className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
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
              <input type="hidden" name="modelo" value={textoDe(valoresPropuesta, "modelo") ?? ""} />
              <input type="hidden" name="tokensIn" value={numeroDe(valoresPropuesta, "tokensIn") ?? 0} />
              <input
                type="hidden"
                name="tokensOut"
                value={numeroDe(valoresPropuesta, "tokensOut") ?? 0}
              />
              <input type="hidden" name="desde" value={desdePropuesta} />
              <input type="hidden" name="hasta" value={hastaPropuesta} />
              <p className="text-[15px] text-ink">
                {fmt(P.windowLine, {
                  from: fechaLegible(desdePropuesta, locale),
                  to: fechaLegible(hastaPropuesta, locale),
                  milestone: hitoPropuesta,
                })}
              </p>
              <div>
                <label htmlFor="plan-minutos" className="block font-semibold text-ink">
                  {P.minutesLabel}
                </label>
                <input
                  id="plan-minutos"
                  type="number"
                  name="minutosPorDia"
                  min={10}
                  max={180}
                  defaultValue={minutosPropuesta}
                  className="w-32 rounded-lg border-2 border-line bg-bg px-3 py-2 text-ink"
                />
                <p className="mt-1 text-[15px] text-muted">{P.minutesHelp}</p>
              </div>
              <div>
                <h3 className="font-semibold text-ink">{P.weightsTitle}</h3>
                <ul className="mt-1 list-inside list-disc text-[15px] text-ink">
                  {Object.entries(pesosPropuesta).map(([code, peso]) => {
                    const nombre = nombrePorCode.get(code) ?? code;
                    return <li key={code}>{nombre} → {Math.round(peso * 100)}%</li>;
                  })}
                </ul>
              </div>
              {recomendacionesPropuesta.length > 0 ? (
                <div>
                  <h3 className="font-semibold text-ink">{P.recommendationsTitle}</h3>
                  <p className="text-[15px] text-muted">{P.recommendationsNote}</p>
                  <ul className="mt-1 list-inside list-disc text-[15px] text-ink">
                    {recomendacionesPropuesta.map((recomendacion, indice) => (
                      <li key={`${indice}-${recomendacion}`}>{recomendacion}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {plan !== null ? (
                <p className="rounded-lg bg-bg px-4 py-3 text-[15px] text-ink">{P.replaceWarning}</p>
              ) : null}
              <button
                type="submit"
                disabled={fijando}
                className="rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-60"
              >
                {fijando ? P.creating : P.createButton}
              </button>
            </form>
          )}
        </section>
      ) : null}

      {hayPlan ? (
        <section className="rounded-2xl border-2 border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">{P.activeTitle}</h2>
          {plan !== null ? (
            <>
              <p className="mt-2 text-[15px] text-ink">
                {fmt(P.activeRange, {
                  from: fechaLegible(plan.desde, locale),
                  to: fechaLegible(plan.hasta, locale),
                })}
              </p>
              <p className="mt-1 text-[15px] text-ink">
                {fmt(P.activeMinutes, { count: plan.minutosPorDia })}
              </p>
              <p className="mt-1 text-[15px] text-ink">
                {fmt(P.activeTasks, { count: plan.tareas })}
              </p>
            </>
          ) : tareasFijadas !== null ? (
            <p className="mt-2 text-[15px] text-ink">
              {fmt(P.activeTasks, { count: tareasFijadas })}
            </p>
          ) : null}
          {techosVisibles.length > 0 ? (
            <div className="mt-4">
              <h3 className="font-semibold text-ink">{P.ceilingsTitle}</h3>
              <ul className="mt-1 space-y-1 text-[15px] text-ink">
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
              <h3 className="font-semibold text-ink">{P.recommendationsTitle}</h3>
              <ul className="mt-1 list-inside list-disc text-[15px] text-ink">
                {plan.recomendaciones.map((recomendacion, indice) => (
                  <li key={`${indice}-${recomendacion}`}>{recomendacion}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-4">
            <h3 className="font-semibold text-ink">{P.reportsTitle}</h3>
            {plan !== null && plan.partes.length > 0 ? (
              <ul className="mt-1 space-y-1 text-[15px] text-ink">
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
              <p className="mt-1 text-[15px] text-muted">{P.reportsEmpty}</p>
            )}
          </div>
        </section>
      ) : boletin === null ? (
        <section className="rounded-2xl border-2 border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">{P.noPlanTitle}</h2>
          <p className="mt-2 text-muted">{P.noReportCard}</p>
        </section>
      ) : (
        <section className="rounded-2xl border-2 border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">{P.noPlanTitle}</h2>
          <p className="mt-2 text-muted">{P.noPlanBody}</p>
        </section>
      )}

      {mensaje !== null ? (
        <p
          role="alert"
          className="rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}
