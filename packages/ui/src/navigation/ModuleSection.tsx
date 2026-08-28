"use client";

/**
 * @cet/ui — ModuleSection.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE EXISTE
 * ===========================================================================
 * El interior de una materia era un `<ol>` de modulos con un `<ul>` de enlaces
 * dentro y nada mas: veinte titulos seguidos sin ninguna frontera visible. Un
 * alumno que busca por donde iba tiene que leerlos todos.
 *
 * Esta seccion pone la frontera y le da nombre. Tres decisiones que no son
 * cosmeticas:
 *
 *   1. `<section>` con `aria-labelledby` a su propio encabezado. Un modulo con
 *      nombre accesible es una region a la que el lector de pantalla salta de
 *      una; una caja anonima obliga a recorrer el contenido.
 *   2. El numero del modulo se pinta grande y se OCULTA al lector, porque
 *      `ordLabel` ya dice "Modulo 3" con todas sus letras y en su idioma. Sin
 *      esa reparticion el alumno oiria el numero dos veces seguidas.
 *   3. Un modulo sin lecciones NO se pinta como una lista vacia. Una lista de
 *      cero elementos es indistinguible de una que no ha cargado: el alumno se
 *      queda mirando un hueco sin saber si es que aun no hay nada o si algo se
 *      ha roto. Se dice con palabras.
 *
 * ===========================================================================
 * SIN TEXTOS PROPIOS (AD-7)
 * ===========================================================================
 * `emptyLabel` es obligatoria por el mismo motivo por el que lo es `stateLabel`
 * en `LessonTile`: el unico modo de que el caso vacio no pueda quedarse mudo es
 * que el tipo no permita construir la seccion sin ese texto. `strings.ts` no
 * es territorio de este componente y un literal en linea seria un texto de cara
 * al usuario escrito dentro del design system.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";
import { LessonTile, type LessonTileProps } from "./LessonTile.js";

export interface ModuleSectionProps {
  /** Ya resuelto al idioma. */
  readonly title: string;
  /** El numero del modulo. Se pinta como cifra; quien lo lee es `ordLabel`. */
  readonly ord: number;
  /** "Modulo 3": la app trae la plantilla ya interpolada. */
  readonly ordLabel: I18nText;
  /** Texto para el modulo que todavia no tiene lecciones. Obligatorio: ver cabecera. */
  readonly emptyLabel: I18nText;
  readonly lessons: readonly LessonTileProps[];
  readonly className?: string | undefined;
}

/**
 * Un modulo: encabezado propio y la lista de sus fichas.
 *
 * Presentacional puro. No sabe de Supabase, ni de Next, ni de rutas: recibe las
 * fichas ya resueltas. De cliente solo por `useI18n`.
 */
export function ModuleSection({
  title,
  ord,
  ordLabel,
  emptyLabel,
  lessons,
  className,
}: ModuleSectionProps): ReactNode {
  const t = useI18n();
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-lg border border-[var(--cet-line)] bg-[var(--cet-surface-2)] p-4",
        className,
      )}
    >
      <h3 id={headingId} className="mb-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex h-8 w-8 flex-none items-center justify-center rounded-pill",
            "bg-[var(--cet-surface-3)] text-body-sm font-bold tabular-nums text-[var(--cet-ink-muted)]",
          )}
        >
          {ord}
        </span>
        <span className="min-w-0 text-body-lg font-bold text-[var(--cet-ink)]">
          <VisuallyHidden>{t(ordLabel)}: </VisuallyHidden>
          {title}
        </span>
      </h3>

      {lessons.length > 0 ? (
        <ul className="flex list-none flex-col gap-2 p-0">
          {lessons.map((lesson) => (
            <li key={lesson.href}>
              <LessonTile {...lesson} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-body text-[var(--cet-ink-muted)]">{t(emptyLabel)}</p>
      )}
    </section>
  );
}
