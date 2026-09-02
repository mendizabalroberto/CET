"use client";

/**
 * @cet/ui — SubjectBreakdown: el reparto del informe por materia.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * UNA LISTA, NO UN DIBUJO
 * ===========================================================================
 * A diferencia de `LessonTimeBreakdown`, aquí no hay una barra que comparar:
 * cada materia trae hasta tres cifras de naturaleza distinta —minutos,
 * acierto, lecciones— y una barra solo podría representar una de las tres sin
 * mentir sobre las otras dos. Es una fila con su identidad de materia (el
 * mismo medallón que usa el resto de la casa) y sus cifras escritas al lado,
 * como una tabla.
 *
 * ===========================================================================
 * EL ACIERTO Y LAS LECCIONES SON OPCIONALES POR FILA
 * ===========================================================================
 * Una materia puede tener minutos sin ninguna pregunta contestada todavía
 * («un cero que no significa cero no se pinta», la misma regla que en
 * `seguimiento.ts`). Sin acierto no se escribe esa cifra en la fila, en vez
 * de escribir «0 %».
 *
 * ===========================================================================
 * SIN NI UN MINUTO NO SE PINTA NADA
 * ===========================================================================
 * Misma regla que el resto de indicadores de esta carpeta.
 */

import type { ReactNode } from "react";

import { cn } from "../lib/cn.js";
import { MEDALLION_CHROME, medallionSkin } from "../navigation/card-chrome.js";
import { SubjectIcon } from "../navigation/SubjectIcon.js";
import { subjectIdentity } from "../navigation/subject-identity.js";

export interface SubjectBreakdownRow {
  /** `subjects.code`. Da el medallón y su color de identidad. */
  readonly subjectCode: string;
  /** Nombre de la materia, ya resuelto al idioma por la aplicación. */
  readonly name: string;
  readonly minutes: number;
  readonly minutesText: string;
  /** Solo si hubo alguna pregunta contestada en esta materia. */
  readonly accuracyText?: string | undefined;
  /** Solo si se terminó alguna lección de esta materia. */
  readonly lessonsText?: string | undefined;
}

export interface SubjectBreakdownProps {
  /** En cualquier orden: aquí se ordenan de más a menos tiempo. */
  readonly items: readonly SubjectBreakdownRow[];
  readonly className?: string | undefined;
}

function minutosDe(item: SubjectBreakdownRow): number {
  return Number.isFinite(item.minutes) && item.minutes > 0 ? item.minutes : 0;
}

/** ¿Hay algún minuto repartido? Una lista a cero no es un reparto. */
export function haySubjectBreakdown(items: readonly SubjectBreakdownRow[]): boolean {
  return items.some((i) => minutosDe(i) > 0);
}

export function SubjectBreakdown({ items, className }: SubjectBreakdownProps): ReactNode {
  if (!haySubjectBreakdown(items)) return null;

  const ordenadas = [...items].sort((a, b) => minutosDe(b) - minutosDe(a));

  return (
    <ul
      data-cet-lista="reparto-materias"
      className={cn("m-0 flex list-none flex-col gap-2 p-0", className)}
    >
      {ordenadas.map((fila, index) => {
        const identidad = subjectIdentity(fila.subjectCode);
        return (
          <li
            key={`${index}-${fila.subjectCode}`}
            data-cet-fila="materia"
            className="flex items-center gap-3 rounded-md py-1"
          >
            <span
              className={cn(MEDALLION_CHROME, "h-8 w-8")}
              style={medallionSkin(identidad)}
              aria-hidden="true"
            >
              <SubjectIcon code={fila.subjectCode} />
            </span>
            <span className="min-w-0 flex-1 text-body-sm font-semibold">{fila.name}</span>
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 tabular-nums text-body-sm">
              <span className="font-semibold">{fila.minutesText}</span>
              {fila.accuracyText !== undefined && fila.accuracyText.length > 0 ? (
                <span className="text-[var(--cet-ink-muted)]">{fila.accuracyText}</span>
              ) : null}
              {fila.lessonsText !== undefined && fila.lessonsText.length > 0 ? (
                <span className="text-[var(--cet-ink-muted)]">{fila.lessonsText}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
