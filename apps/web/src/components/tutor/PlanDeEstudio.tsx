"use client";

import { useActionState, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n/provider";
import {
  cancelarPlan,
  descartarBoletin,
  editarPlan,
  generarPlan,
  regenerarPlan,
  type PlanState,
} from "@/lib/plan/acciones";
import type {
  BoletinResumen,
  DiaDelCalendario,
  EventoProximo,
  PlanResumen,
} from "@/lib/plan/consultas";
import {
  anadirExamen,
  borrarExamen,
  subirCalendarioDeExamenes,
  type ExamenResumen,
} from "@/lib/plan/examenes";
import { MATERIAS_CON_CONTENIDO } from "@/lib/plan/tipos";

import { fechaLegible } from "@/lib/plan/fecha-legible";

import { CalendarioSemanal } from "./CalendarioSemanal";
import { RobotLector } from "./RobotLector";

type TechoVisible = {
  readonly subjectId: string;
  readonly code: string;
  readonly minutosPedidos: number;
  readonly minutosDisponibles: number;
};

type Valores = Record<string, string | number>;
type AccionDeEscritura =
  | "generar"
  | "regenerar"
  | "editar"
  | "cancelar"
  | "descartar"
  | "anadirExamen"
  | "borrarExamen"
  | "subirExamenes";

interface Props {
  readonly studentId: string;
  readonly boletin: BoletinResumen | null;
  readonly boletines: readonly BoletinResumen[];
  readonly plan: PlanResumen | null;
  readonly nombre: string;
  readonly eventos: readonly EventoProximo[];
  readonly yearLevel: number | null;
  readonly examenes: readonly ExamenResumen[];
  /** Tareas del plan activo por día; vacío sin plan. */
  readonly calendario: readonly DiaDelCalendario[];
  /** `YYYY-MM-DD` en la zona del plan, del servidor. */
  readonly hoy: string;
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

export { fechaLegible };

export function PlanDeEstudio({
  studentId,
  boletin,
  boletines,
  plan,
  nombre,
  eventos,
  yearLevel,
  examenes,
  calendario,
  hoy,
}: Props) {
  const { t, fmt, locale } = useI18n();
  const P = t.tutor.child.plan;

  const [generacion, accionGenerar, generando] = useActionState(generarPlan, ESTADO_INICIAL);
  const [regeneracion, accionRegenerar, regenerando] = useActionState(
    regenerarPlan,
    ESTADO_INICIAL,
  );
  const [edicion, accionEditar, editando] = useActionState(editarPlan, ESTADO_INICIAL);
  const [cancelacion, accionCancelar, cancelando] = useActionState(cancelarPlan, ESTADO_INICIAL);
  const [descarte, accionDescartar, descartando] = useActionState(
    descartarBoletin,
    ESTADO_INICIAL,
  );
  const [altaExamen, accionAnadirExamen, anadiendoExamen] = useActionState(
    anadirExamen,
    ESTADO_INICIAL,
  );
  const [bajaExamen, accionBorrarExamen, borrandoExamen] = useActionState(
    borrarExamen,
    ESTADO_INICIAL,
  );
  const [subidaExamenes, accionSubirExamenes, subiendoExamenes] = useActionState(
    subirCalendarioDeExamenes,
    ESTADO_INICIAL,
  );
  const [mostrandoSubidaDeExamenes, setMostrandoSubidaDeExamenes] = useState(false);

  const [pidiendoConfirmacionDeBorrar, setPidiendoConfirmacionDeBorrar] = useState(false);
  const [mostrandoEdicion, setMostrandoEdicion] = useState(false);
  const [mostrandoSubida, setMostrandoSubida] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [pesosEdit, setPesosEdit] = useState<Record<string, number>>({});
  const [minutosEdit, setMinutosEdit] = useState(10);

  const ultimaAccion = useRef<AccionDeEscritura | null>(null);
  const marcar = (accion: AccionDeEscritura) => () => {
    ultimaAccion.current = accion;
  };

  const estados: Record<AccionDeEscritura, PlanState> = {
    generar: generacion,
    regenerar: regeneracion,
    editar: edicion,
    cancelar: cancelacion,
    descartar: descarte,
    anadirExamen: altaExamen,
    borrarExamen: bajaExamen,
    subirExamenes: subidaExamenes,
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
  const boletinIdParaReintentar = estadoActivo.ok ? null : textoDe(estadoActivo.values, "boletinId");

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

  // Un plan recién generado o regenerado se ve de inmediato con lo que trae
  // el `PlanState` (tareas, techos), sin esperar al `revalidatePath`.
  const valoresPlanNuevo =
    (generacion.ok && generacion.successKey === "planGenerado" ? generacion.values : undefined) ??
    (regeneracion.ok && regeneracion.successKey === "planGenerado"
      ? regeneracion.values
      : undefined) ??
    (edicion.ok && edicion.successKey === "planEditado" ? edicion.values : undefined);

  const hayPlan = plan !== null || valoresPlanNuevo !== undefined;
  const techosFijados = parsearTechos(valoresPlanNuevo);
  const tareasFijadas = numeroDe(valoresPlanNuevo, "tareas");
  const techosVisibles: readonly TechoVisible[] =
    plan !== null ? plan.reparto.techos : techosFijados;

  const planIdVisible = plan !== null ? plan.id : (textoDe(valoresPlanNuevo, "planId") ?? null);
  const boletinIdParaRegenerar = (plan !== null ? plan.boletinId : boletin?.id) ?? null;

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

  const puedeDescartarBoletin = boletin !== null && boletin.estado === "extraido" && !hayPlan;

  const sumaPesosEdit = Object.values(pesosEdit).reduce((total, valor) => total + valor, 0);
  const sumaPesosValida = sumaPesosEdit === 100;

  function abrirEdicion() {
    if (plan === null) return;
    const iniciales: Record<string, number> = {};
    for (const [code, peso] of Object.entries(plan.reparto.pesos)) {
      iniciales[code] = Math.round(peso * 100);
    }
    setPesosEdit(iniciales);
    setMinutosEdit(plan.minutosPorDia);
    setMostrandoEdicion(true);
  }

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
                <input
                  type="number"
                  min={0}
                  max={100}
                  name={`nota:${indice}`}
                  defaultValue={nota.nota}
                  className="border-line bg-bg text-ink w-20 rounded-lg border-2 px-2 py-1 text-right"
                />
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

  // El robot mientras el servidor trabaja. `pasoInicial` 1 cuando no hay PDF
  // que leer (regenerar desde un boletín guardado).
  const robot = (pasoInicial: number) => (
    <RobotLector
      titulo={P.analyzingTitle}
      pasos={P.analyzingSteps}
      ayuda={P.analyzingHelp}
      bocadillos={P.analyzingBubbles}
      etiquetaRobot={P.analyzingRobotLabel}
      pista={P.analyzingHint}
      pasoInicial={pasoInicial}
    />
  );

  const campoComentario = (
    <div>
      <label htmlFor="plan-comentario" className="text-ink block font-semibold">
        {P.commentLabel}
      </label>
      <textarea
        id="plan-comentario"
        name="comentario"
        rows={2}
        maxLength={300}
        placeholder={P.commentPlaceholder}
        className="border-line bg-bg text-ink mt-1 block w-full rounded-lg border-2 px-3 py-2 text-[15px]"
      />
      <p className="text-muted mt-1 text-[15px]">{P.commentHelp}</p>
    </div>
  );

  // El input de fichero nativo va oculto (sr-only: sigue siendo accesible y
  // el e2e lo encuentra por `name`); lo que se ve es un botón con etiqueta
  // clara y el nombre del PDF elegido.
  const formularioDeSubida = (
    <form action={accionGenerar} onSubmit={marcar("generar")} className="mt-4 space-y-4">
      <div>
        <p className="text-ink font-semibold">{P.uploadLabel}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label
            htmlFor="plan-archivo"
            className="border-brand text-ink cursor-pointer rounded-xl border-2 px-5 py-3 font-semibold focus-within:ring-4 focus-within:ring-[var(--ring)]"
          >
            {P.choosePdf}
            <input
              id="plan-archivo"
              type="file"
              accept="application/pdf"
              name="archivo"
              onChange={(e) => setNombreArchivo(e.currentTarget.files?.[0]?.name ?? null)}
              className="sr-only"
            />
          </label>
          <span className="text-muted text-[15px]" aria-live="polite">
            {nombreArchivo ?? P.noFileChosen}
          </span>
        </div>
        <p className="text-muted mt-2 text-[15px]">{P.uploadHelp}</p>
      </div>
      <input type="hidden" name="studentId" value={studentId} />
      {campoComentario}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
        >
          {P.uploadButton}
        </button>
        {boletin !== null ? (
          <button
            type="button"
            onClick={() => setMostrandoSubida(false)}
            className="text-ink px-5 py-3 font-semibold"
          >
            {P.editCancel}
          </button>
        ) : null}
      </div>
    </form>
  );

  // Con un boletín ya guardado, lo primero es él: cuál es, y «Generar nuevo
  // plan» con un comentario para el asistente. Subir otro PDF es la segunda
  // opción, con su propio botón, no un input suelto.
  const bloqueUltimoBoletin =
    boletin === null ? null : (
      <div className="mt-4 space-y-4">
        <p className="bg-surface-alt text-ink rounded-xl px-4 py-3 font-semibold">
          {fmt(P.lastReportLine, {
            term:
              boletin.trimestre === null
                ? fmt(P.termUnknown, { year: boletin.gestion })
                : fmt(P.term, { n: boletin.trimestre, year: boletin.gestion }),
            count: boletin.notas.length,
            date: fechaLegible(boletin.createdAt, locale),
          })}
        </p>
        <form action={accionRegenerar} onSubmit={marcar("regenerar")} className="space-y-3">
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="boletinId" value={boletin.id} />
          {campoComentario}
          <button
            type="submit"
            className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
          >
            {P.newPlanButton}
          </button>
        </form>
        <div className="border-line border-t pt-4">
          <button
            type="button"
            onClick={() => setMostrandoSubida(true)}
            className="border-line text-ink rounded-xl border-2 px-5 py-3 font-semibold"
          >
            {P.uploadNewButton}
          </button>
          <p className="text-muted mt-2 text-[15px]">{P.uploadNewHelp}</p>
        </div>
      </div>
    );

  const cuerpoDeLaTarjetaDelBoletin = generando
    ? robot(0)
    : regenerando
      ? robot(1)
      : boletin === null || mostrandoSubida
        ? formularioDeSubida
        : bloqueUltimoBoletin;

  return (
    <div className="space-y-6">
      <h2 className="text-ink text-xl font-bold">{fmt(P.title, { name: nombre })}</h2>

      {mensajeDeExito !== null ? (
        <p
          role="status"
          className="border-brand bg-brand/10 text-ink rounded-lg border-l-4 px-4 py-3 text-[15px]"
        >
          {mensajeDeExito}
        </p>
      ) : null}

      {mensajeDeError !== null ? (
        <div
          role="alert"
          className="border-danger bg-danger/10 text-ink space-y-3 rounded-lg border-l-4 px-4 py-3 text-[15px]"
        >
          <p>{mensajeDeError}</p>
          {boletinIdParaReintentar !== null ? (
            <form action={accionRegenerar} onSubmit={marcar("regenerar")}>
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="boletinId" value={boletinIdParaReintentar} />
              <button
                type="submit"
                disabled={regenerando}
                className="border-danger text-ink rounded-xl border-2 px-5 py-3 font-semibold disabled:opacity-60"
              >
                {regenerando ? P.regenerating : P.retryButton}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      <section className="border-line bg-card rounded-2xl border-2 p-5">
        <h2 className="text-ink text-lg font-bold">
          {boletin === null ? P.uploadTitle : P.lastReportTitle}
        </h2>
        {boletin === null ? <p className="text-muted mt-2">{P.intro}</p> : null}
        {cuerpoDeLaTarjetaDelBoletin}
      </section>

      {boletin !== null ? (
        <section className="border-line bg-card rounded-2xl border-2 p-5">
          <h2 className="text-ink text-lg font-bold">{P.extractedTitle}</h2>
          <p className="text-muted mt-2">
            {boletin.trimestre === null
              ? fmt(P.termUnknown, { year: boletin.gestion })
              : fmt(P.term, { n: boletin.trimestre, year: boletin.gestion })}
          </p>
          <form action={accionRegenerar} onSubmit={marcar("regenerar")} className="mt-4 space-y-3">
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="boletinId" value={boletin.id} />
            {tablaDeNotas}
            {fechaConfirmado !== null ? (
              <p className="text-muted text-[15px]">{fmt(P.confirmed, { date: fechaConfirmado })}</p>
            ) : null}
            <button
              type="submit"
              disabled={regenerando}
              className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
            >
              {regenerando ? P.regenerating : P.gradesSave}
            </button>
          </form>
          {puedeDescartarBoletin ? (
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
          ) : null}
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
          {plan !== null && plan.prioridades.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-ink font-semibold">{P.prioritiesTitle}</h3>
              <p className="text-muted text-[15px]">{P.prioritiesNote}</p>
              <ul className="mt-2 space-y-3">
                {plan.prioridades.map((prioridad) => (
                  <li key={prioridad.code} className="bg-surface-alt rounded-xl px-4 py-3">
                    <p className="text-ink font-semibold">
                      {nombrePorCode.get(prioridad.code) ?? prioridad.code}
                    </p>
                    {prioridad.porQue !== "" ? (
                      <p className="text-ink mt-1 text-[15px]">{prioridad.porQue}</p>
                    ) : null}
                    {prioridad.lecciones.length > 0 ? (
                      <p className="text-ink mt-2 text-[15px]">
                        <span className="text-muted">{P.prioritiesRead} </span>
                        {prioridad.lecciones.map((leccion) => leccion.titulo).join(" · ")}
                      </p>
                    ) : null}
                    {prioridad.skills.length > 0 ? (
                      <p className="text-ink mt-1 text-[15px]">
                        <span className="text-muted">{P.prioritiesPractice} </span>
                        {prioridad.skills.map((skill) => skill.nombre).join(" · ")}
                      </p>
                    ) : null}
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
          {plan !== null && calendario.length > 0 ? (
            <CalendarioSemanal
              dias={calendario}
              partes={plan.partes}
              hoy={hoy}
              locale={locale}
              nombrePorCode={nombrePorCode}
              fmt={fmt}
              textos={{
                title: P.weekTitle,
                previous: P.weekPrevious,
                next: P.weekNext,
                free: P.weekFree,
                outside: P.weekOutside,
                lesson: P.weekLesson,
                practice: P.weekPractice,
                minutes: P.activeMinutesShort,
                studied: P.weekStudied,
                done: P.weekDone,
                weekOf: P.weekOf,
              }}
            />
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
            <div className="mt-4 flex flex-wrap gap-3">
              {!mostrandoEdicion ? (
                <button
                  type="button"
                  onClick={abrirEdicion}
                  className="border-line text-ink rounded-xl border-2 px-5 py-3 font-semibold"
                >
                  {P.editButton}
                </button>
              ) : null}
              {boletinIdParaRegenerar !== null ? (
                <form action={accionRegenerar} onSubmit={marcar("regenerar")}>
                  <input type="hidden" name="studentId" value={studentId} />
                  <input type="hidden" name="boletinId" value={boletinIdParaRegenerar} />
                  <button
                    type="submit"
                    disabled={regenerando}
                    className="border-line text-ink rounded-xl border-2 px-5 py-3 font-semibold disabled:opacity-60"
                  >
                    {regenerando ? P.regenerating : P.regenerateButton}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {plan !== null && mostrandoEdicion ? (
            <form action={accionEditar} onSubmit={marcar("editar")} className="border-line mt-4 space-y-4 rounded-xl border-2 p-4">
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="planId" value={plan.id} />
              <input type="hidden" name="pesos" value={JSON.stringify(pesosEdit)} />
              <div>
                <label htmlFor="plan-minutos-edit" className="text-ink block font-semibold">
                  {P.minutesLabel}
                </label>
                <input
                  id="plan-minutos-edit"
                  type="number"
                  name="minutosPorDia"
                  min={10}
                  max={180}
                  value={minutosEdit}
                  onChange={(evento) => setMinutosEdit(Number(evento.target.value))}
                  className="border-line bg-bg text-ink w-32 rounded-lg border-2 px-3 py-2"
                />
              </div>
              <div>
                <h3 className="text-ink font-semibold">{P.weightsTitle}</h3>
                <ul className="mt-2 space-y-2">
                  {Object.keys(pesosEdit).map((code) => {
                    const nombreMateria = nombrePorCode.get(code) ?? code;
                    return (
                      <li key={code} className="flex items-center gap-3">
                        <label htmlFor={`plan-peso-${code}`} className="text-ink flex-1 text-[15px]">
                          {nombreMateria}
                        </label>
                        <input
                          id={`plan-peso-${code}`}
                          type="number"
                          min={0}
                          max={100}
                          value={pesosEdit[code]}
                          onChange={(evento) =>
                            setPesosEdit((anterior) => ({
                              ...anterior,
                              [code]: Number(evento.target.value),
                            }))
                          }
                          className="border-line bg-bg text-ink w-20 rounded-lg border-2 px-2 py-1 text-right"
                        />
                        <span className="text-muted text-[15px]">%</span>
                      </li>
                    );
                  })}
                </ul>
                {!sumaPesosValida ? (
                  <p className="text-danger mt-2 text-[15px]">{P.weightsSum}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={editando || !sumaPesosValida}
                  className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
                >
                  {editando ? P.regenerating : P.editSave}
                </button>
                <button
                  type="button"
                  onClick={() => setMostrandoEdicion(false)}
                  className="text-ink px-5 py-3 font-semibold"
                >
                  {P.editCancel}
                </button>
              </div>
            </form>
          ) : null}

          {planIdVisible !== null ? (
            <div className="border-line mt-4 rounded-xl border-2 p-4">
              <h3 className="text-ink font-semibold">{P.deleteTitle}</h3>
              <p className="text-muted mt-1 text-[15px]">{fmt(P.deleteBody, { name: nombre })}</p>
              {!pidiendoConfirmacionDeBorrar ? (
                <button
                  type="button"
                  onClick={() => setPidiendoConfirmacionDeBorrar(true)}
                  className="border-line text-ink mt-3 rounded-xl border-2 px-5 py-3 font-semibold"
                >
                  {P.deleteButton}
                </button>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <form action={accionCancelar} onSubmit={marcar("cancelar")}>
                    <input type="hidden" name="planId" value={planIdVisible} />
                    <input type="hidden" name="studentId" value={studentId} />
                    <button
                      type="submit"
                      disabled={cancelando}
                      className="border-danger text-ink rounded-xl border-2 px-5 py-3 font-semibold disabled:opacity-60"
                    >
                      {cancelando ? P.deleting : P.deleteConfirm}
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={() => setPidiendoConfirmacionDeBorrar(false)}
                    className="text-ink px-5 py-3 font-semibold"
                  >
                    {P.deleteKeep}
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
          <form action={accionRegenerar} onSubmit={marcar("regenerar")} className="mt-4">
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="boletinId" value={boletin.id} />
            <button
              type="submit"
              disabled={regenerando}
              className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
            >
              {regenerando ? P.regenerating : P.regenerateButton}
            </button>
          </form>
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
        <h2 className="text-ink text-lg font-bold">{fmt(P.examsTitle, { name: nombre })}</h2>
        <p className="text-muted mt-2">{P.examsIntro}</p>
        {examenes.length === 0 ? (
          <p className="text-muted mt-3 text-[15px]">{P.examsEmpty}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {examenes.map((examen) => (
              <li
                key={examen.id}
                className="border-line flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-[15px] last:border-0 last:pb-0"
              >
                <span className="text-ink">
                  <span className="font-semibold">{fechaLegible(examen.fecha, locale)}</span>
                  {" · "}
                  {examen.code !== null
                    ? (nombrePorCode.get(examen.code) ?? P.subjects[examen.code])
                    : P.examsGeneral}
                  {examen.titulo !== "" && examen.titulo !== examen.code ? ` · ${examen.titulo}` : ""}
                  {examen.origen === "documento" ? (
                    <span className="text-muted"> · {P.examsFromDocument}</span>
                  ) : null}
                </span>
                <form action={accionBorrarExamen} onSubmit={marcar("borrarExamen")}>
                  <input type="hidden" name="studentId" value={studentId} />
                  <input type="hidden" name="examenId" value={examen.id} />
                  <button
                    type="submit"
                    disabled={borrandoExamen}
                    className="text-ink px-3 py-1 text-[14px] font-semibold underline disabled:opacity-60"
                  >
                    {P.examsDelete}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form
          action={accionAnadirExamen}
          onSubmit={marcar("anadirExamen")}
          className="border-line mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2 sm:items-end"
        >
          <input type="hidden" name="studentId" value={studentId} />
          <div>
            <label htmlFor="examen-fecha" className="text-ink block text-[15px] font-semibold">
              {P.examsDate}
            </label>
            <input
              id="examen-fecha"
              type="date"
              name="fecha"
              required
              className="border-line bg-bg text-ink mt-1 rounded-lg border-2 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="examen-materia" className="text-ink block text-[15px] font-semibold">
              {P.examsSubject}
            </label>
            <select
              id="examen-materia"
              name="materia"
              defaultValue="general"
              className="border-line bg-bg text-ink mt-1 w-full rounded-lg border-2 px-3 py-2"
            >
              <option value="general">{P.examsGeneral}</option>
              {MATERIAS_CON_CONTENIDO.map((code) => (
                <option key={code} value={code}>
                  {nombrePorCode.get(code) ?? P.subjects[code]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="examen-titulo" className="text-ink block text-[15px] font-semibold">
              {P.examsNote}
            </label>
            <input
              id="examen-titulo"
              type="text"
              name="titulo"
              maxLength={120}
              placeholder={P.examsNotePlaceholder}
              className="border-line bg-bg text-ink mt-1 w-full rounded-lg border-2 px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={anadiendoExamen}
            className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
          >
            {anadiendoExamen ? P.examsAdding : P.examsAdd}
          </button>
        </form>
        <div className="border-line mt-4 border-t pt-4">
          {!mostrandoSubidaDeExamenes ? (
            <>
              <button
                type="button"
                onClick={() => setMostrandoSubidaDeExamenes(true)}
                className="border-line text-ink rounded-xl border-2 px-5 py-3 font-semibold"
              >
                {P.examsUploadButton}
              </button>
              <p className="text-muted mt-2 text-[15px]">{P.examsUploadHelp}</p>
            </>
          ) : subiendoExamenes ? (
            <RobotLector
              titulo={P.examsAnalyzing}
              pasos={P.examsAnalyzingSteps}
              ayuda={P.analyzingHelp}
              bocadillos={P.analyzingBubbles}
              etiquetaRobot={P.analyzingRobotLabel}
              pista={P.analyzingHint}
            />
          ) : (
            <form
              action={accionSubirExamenes}
              onSubmit={marcar("subirExamenes")}
              className="space-y-3"
            >
              <input type="hidden" name="studentId" value={studentId} />
              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="examenes-archivo"
                  className="border-brand text-ink cursor-pointer rounded-xl border-2 px-5 py-3 font-semibold focus-within:ring-4 focus-within:ring-[var(--ring)]"
                >
                  {P.choosePdf}
                  <input
                    id="examenes-archivo"
                    type="file"
                    accept="application/pdf"
                    name="archivo"
                    className="sr-only"
                  />
                </label>
                <button
                  type="submit"
                  className="bg-brand text-on-brand rounded-xl px-5 py-3 font-semibold"
                >
                  {P.examsUploadSubmit}
                </button>
                <button
                  type="button"
                  onClick={() => setMostrandoSubidaDeExamenes(false)}
                  className="text-ink px-5 py-3 font-semibold"
                >
                  {P.editCancel}
                </button>
              </div>
              <p className="text-muted text-[15px]">{P.uploadHelp}</p>
            </form>
          )}
        </div>
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
    </div>
  );
}
