"use client";

/**
 * El calendario semanal del plan, para el tutor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Lo que el alumno ve día a día en «Hoy», visto entero por su tutor: una
 * semana de lunes a domingo, cada día con sus lecciones y prácticas, los
 * minutos previstos y —si ya pasó— lo que el parte nocturno midió. Las
 * lecciones con `lesson_completed` llevan marca; las prácticas no se marcan
 * porque la plataforma no registra «práctica hecha» por tarea, solo minutos
 * y aciertos en el parte del día.
 *
 * Fechas civiles (`YYYY-MM-DD`) de principio a fin: la aritmética de semanas
 * se hace en UTC sobre la fecha civil, nunca con la hora local, por la misma
 * razón que `fechaLegible` (un plan que «empieza un día antes» al oeste de
 * UTC). La semana inicial es la que contiene `hoy` (que llega del servidor,
 * en la zona del plan), acotada al rango del plan.
 */

import { useState } from "react";

import type { DiaDelCalendario, ParteResumen } from "@/lib/plan/consultas";
import { fechaLegible } from "@/lib/plan/fecha-legible";

export interface CalendarioSemanalProps {
  readonly dias: readonly DiaDelCalendario[];
  readonly partes: readonly ParteResumen[];
  /** `YYYY-MM-DD` en la zona del plan, calculado en el servidor. */
  readonly hoy: string;
  readonly locale: string;
  readonly nombrePorCode: ReadonlyMap<string, string>;
  readonly textos: {
    readonly title: string;
    readonly previous: string;
    readonly next: string;
    readonly free: string;
    readonly outside: string;
    readonly lesson: string;
    readonly practice: string;
    readonly minutes: string;
    readonly studied: string;
    readonly done: string;
    readonly weekOf: string;
  };
  readonly fmt: (plantilla: string, valores: Record<string, string | number>) => string;
}

const DIA_MS = 86_400_000;

function aUtc(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function aIso(utc: number): string {
  return new Date(utc).toISOString().slice(0, 10);
}

/** El lunes de la semana de `fecha`. */
export function lunesDe(fecha: string): string {
  const utc = aUtc(fecha);
  const dia = new Date(utc).getUTCDay(); // 0 = domingo
  const desplazamiento = dia === 0 ? 6 : dia - 1;
  return aIso(utc - desplazamiento * DIA_MS);
}

export function sumarDiasIso(fecha: string, dias: number): string {
  return aIso(aUtc(fecha) + dias * DIA_MS);
}

function nombreDelDia(fecha: string, locale: string): string {
  return new Date(aUtc(fecha)).toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export function CalendarioSemanal({
  dias,
  partes,
  hoy,
  locale,
  nombrePorCode,
  textos,
  fmt,
}: CalendarioSemanalProps) {
  const primera = dias[0]?.fecha ?? hoy;
  const ultima = dias.at(-1)?.fecha ?? hoy;
  const lunesInicial = lunesDe(hoy < primera ? primera : hoy > ultima ? ultima : hoy);
  const [lunes, setLunes] = useState(lunesInicial);

  const porFecha = new Map(dias.map((dia) => [dia.fecha, dia]));
  const partePorFecha = new Map(partes.map((parte) => [parte.fecha, parte]));
  const semana = Array.from({ length: 7 }, (_, i) => sumarDiasIso(lunes, i));
  const domingo = semana[6] ?? lunes;

  const puedeIrAtras = lunes > lunesDe(primera);
  const puedeIrAdelante = domingo < ultima;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-ink font-semibold">{textos.title}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLunes(sumarDiasIso(lunes, -7))}
            disabled={!puedeIrAtras}
            className="border-line text-ink rounded-lg border-2 px-3 py-1 text-[14px] font-semibold disabled:opacity-40"
          >
            {textos.previous}
          </button>
          <span className="text-muted text-[14px]">
            {fmt(textos.weekOf, {
              from: fechaLegible(lunes, locale),
              to: fechaLegible(domingo, locale),
            })}
          </span>
          <button
            type="button"
            onClick={() => setLunes(sumarDiasIso(lunes, 7))}
            disabled={!puedeIrAdelante}
            className="border-line text-ink rounded-lg border-2 px-3 py-1 text-[14px] font-semibold disabled:opacity-40"
          >
            {textos.next}
          </button>
        </div>
      </div>
      <ol className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-7">
        {semana.map((fecha) => {
          const dia = porFecha.get(fecha);
          const parte = partePorFecha.get(fecha);
          const dentro = fecha >= primera && fecha <= ultima;
          const esHoy = fecha === hoy;
          return (
            <li
              key={fecha}
              className={`rounded-xl border-2 p-2 ${
                esHoy ? "border-brand" : "border-line"
              } ${dentro ? "bg-bg" : "bg-surface-alt"}`}
              aria-current={esHoy ? "date" : undefined}
            >
              <p className="text-ink text-[13px] font-semibold">
                <span className="capitalize">{nombreDelDia(fecha, locale)}</span>{" "}
                {fecha.slice(8, 10)}
              </p>
              {dia !== undefined ? (
                <>
                  <p className="text-muted text-[12px]">
                    {fmt(textos.minutes, { count: dia.minutos })}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {dia.tareas.map((tarea) => (
                      <li key={tarea.id} className="text-ink text-[12px] leading-snug">
                        <span className="text-muted">
                          {tarea.code !== null ? (nombrePorCode.get(tarea.code) ?? tarea.code) : "—"}
                          {" · "}
                          {tarea.tipo === "leccion" ? textos.lesson : textos.practice}
                          {" · "}
                          {tarea.minutos}′
                        </span>
                        <br />
                        {tarea.hecha ? <span aria-label={textos.done}>✓ </span> : null}
                        {tarea.titulo}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-muted text-[12px]">{dentro ? textos.free : textos.outside}</p>
              )}
              {parte !== undefined ? (
                <p className="text-teal mt-1 text-[12px] font-semibold">
                  {fmt(textos.studied, {
                    studied: parte.minutosMedidos,
                    planned: parte.minutosPrevistos,
                  })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
