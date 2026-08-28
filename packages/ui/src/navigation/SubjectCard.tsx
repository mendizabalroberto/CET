"use client";

/**
 * @cet/ui — la tarjeta de una materia.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE ES UN <a> Y NO UNA TARJETA CON UN ENLACE DENTRO
 * ===========================================================================
 * La forma comoda de escribir esto es un `<div>` con el titulo dentro de un
 * `<a>`. En un raton de escritorio no se nota; en la tableta de un nino de once
 * anos si: el objetivo pulsable pasa a ser el renglon del titulo, unos 18 px de
 * alto, cuando la casa exige `--cet-touch-min` (44 px). El fallo aparece como
 * "la tablet no va bien", nunca como un bug. Aqui el enlace ENVUELVE la tarjeta
 * entera, asi que el area pulsable es la tarjeta y el nombre accesible del
 * enlace es su contenido: el nombre de la materia y su avance, nunca un "leer
 * mas" que en la lista de enlaces del lector suena identico seis veces.
 *
 * ===========================================================================
 * `null` NO ES CERO
 * ===========================================================================
 * `completed`/`started` valen `null` cuando la consulta de avance no ha podido
 * responder. Pintarlo como 0 % le dice al alumno que no ha hecho nada, y es
 * falso: es la diferencia entre "no has empezado" y "no lo sabemos". Por eso
 * hay cuatro estados explicitos en `data-state` y solo dos de ellos pintan
 * barra:
 *
 *   unknown      sin barra y SIN cifras, con el texto que lo explica
 *   not-started  sin barra (un 0 % se lee como un suspenso), texto "Sin empezar"
 *   in-progress  barra de dos capas + cifras
 *   done         idem, y el rotulo de terminada
 *
 * ===========================================================================
 * EL COLOR NO IDENTIFICA LA MATERIA
 * ===========================================================================
 * Los seis colores son el mismo color en deuteranopia y el mismo gris en escala
 * de grises. Aqui el color solo RELLENA (rail, medallon, barra) y quien dice
 * que materia es son el icono y el nombre, ambos siempre presentes. Sobre el
 * relleno saturado solo va el blanco del medallon, que esta medido a >= 4.5:1;
 * el cuerpo usa el token `-suave` y encima la tinta del sistema. Ningun
 * hexadecimal vive aqui: la paleta esta en `tokens.css` y llega por
 * `subjectIdentity()`.
 *
 * ===========================================================================
 * LOS TEXTOS (AD-7)
 * ===========================================================================
 * El diccionario del paquete (`lib/strings.ts`) no puede crecer desde este
 * contrato, asi que los cuatro rotulos que la tarjeta necesita entran por prop
 * como `I18nText` y se resuelven con `useI18n()`, igual que `ProgressBar`. La
 * aplicacion DEBE pasarlos; si falta uno, `t()` devuelve cadena vacia y la
 * tarjeta la omite en vez de escribir un literal:
 *
 *   ofText           el conector de "3 de 12"
 *   completedText    "terminadas"
 *   startedText      "en marcha"
 *   notStartedText   "Sin empezar"
 *   doneText         "Terminada"
 *   unavailableText  "Sin datos de avance"
 */

import type { CSSProperties, ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";

import { CARD_CHROME, MEDALLION_CHROME, cardSkin, medallionSkin } from "./card-chrome.js";
import { SubjectIcon } from "./SubjectIcon.js";
import { subjectIdentity } from "./subject-identity.js";

/** Los cuatro estados de avance. Viajan en `data-state` para que se puedan ver. */
export type SubjectCardState = "unknown" | "not-started" | "in-progress" | "done";

export interface SubjectCardProps {
  /** `subjects.code`; uno desconocido cae en la identidad neutra. */
  readonly code: string;
  /** Nombre de la materia, ya resuelto al idioma por la aplicacion. */
  readonly name: string;
  /** Destino, ya construido por la aplicacion. */
  readonly href: string;
  /** Lecciones publicadas de la materia. */
  readonly total: number;
  /** Terminadas. `null` = no hay dato de avance (consulta caida). */
  readonly completed: number | null;
  /** Empezadas y sin terminar. `null` = no hay dato de avance. */
  readonly started: number | null;
  /** Conector de la cifra: "de". */
  readonly ofText?: I18nText | undefined;
  /** "terminadas". */
  readonly completedText?: I18nText | undefined;
  /** "en marcha". */
  readonly startedText?: I18nText | undefined;
  /** "Sin empezar". */
  readonly notStartedText?: I18nText | undefined;
  /** "Terminada". */
  readonly doneText?: I18nText | undefined;
  /** "Sin datos de avance". */
  readonly unavailableText?: I18nText | undefined;
  readonly className?: string | undefined;
}

/** Numeros que llegan de una consulta: se sanean antes de dividir por ellos. */
interface Counts {
  readonly total: number;
  readonly completed: number;
  readonly started: number;
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), max);
}

/**
 * Estado y cifras a partir de las tres entradas.
 *
 * `total <= 0` (una materia dada de alta y aun sin lecciones publicadas) NO es
 * un fallo de la consulta: es una materia sin empezar. Se separa aqui para que
 * el porcentaje no divida nunca por cero.
 */
function readCounts(
  total: number,
  completed: number | null,
  started: number | null,
): { readonly state: SubjectCardState; readonly counts: Counts } {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;

  if (completed === null || started === null) {
    return { state: "unknown", counts: { total: safeTotal, completed: 0, started: 0 } };
  }

  const done = clamp(completed, safeTotal);
  const open = clamp(started, safeTotal - done);
  const counts: Counts = { total: safeTotal, completed: done, started: open };

  if (safeTotal > 0 && done >= safeTotal) return { state: "done", counts };
  if (done === 0 && open === 0) return { state: "not-started", counts };
  return { state: "in-progress", counts };
}

/** Une los trozos de la cifra saltandose los rotulos que la app no paso. */
function sentence(parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join(" ");
}

/**
 * Tarjeta de materia: medallon, nombre, cifra de avance y barra de dos capas.
 *
 * Presentacional pura. No sabe de rutas ni de base de datos, no tiene estado ni
 * manejadores: la navegacion la hace el navegador con un enlace, que ademas es
 * lo unico que se puede abrir en otra pestana y recorrer con el tabulador.
 */
export function SubjectCard({
  code,
  name,
  href,
  total,
  completed,
  started,
  ofText,
  completedText,
  startedText,
  notStartedText,
  doneText,
  unavailableText,
  className,
}: SubjectCardProps): ReactNode {
  const t = useI18n();
  const identity = subjectIdentity(code);
  const { state, counts } = readCounts(total, completed, started);
  const hasNumbers = state === "in-progress" || state === "done";

  const pctDone = counts.total > 0 ? (counts.completed / counts.total) * 100 : 0;
  const pctOpen = counts.total > 0 ? ((counts.completed + counts.started) / counts.total) * 100 : 0;

  /* El rail y el cuerpo. Los dos colores salen de la identidad; ninguno se
     escribe a mano. La caja tampoco: vive en `card-chrome.ts`, que es la unica
     definicion, y por eso la tarjeta de tema de /practice se ve como esta y no
     como algo parecido. */
  const skin: CSSProperties = cardSkin(identity);

  return (
    <a
      href={href}
      data-state={state}
      data-subject={identity.code}
      className={cn(CARD_CHROME, className)}
      style={skin}
    >
      <span className="flex items-center gap-3">
        {/* Medallon: relleno saturado con el icono en blanco, la unica
            combinacion medida sobre el relleno. */}
        <span className={MEDALLION_CHROME} style={medallionSkin(identity)}>
          <SubjectIcon code={code} />
        </span>
        {/* `text-body-lg` y no un `text-[19px]` a pelo: el tamano sale de la
            escala del preset, que es donde se cambia una vez para todo el
            producto. Un pixel suelto aqui seria una segunda escala. */}
        <span className="text-body-lg font-bold leading-tight">{name}</span>
      </span>

      {state === "unknown" ? (
        <span data-cet-avance="sin-datos" className="text-body-sm text-[var(--cet-ink-muted)]">
          {t(unavailableText)}
        </span>
      ) : null}

      {state === "not-started" ? (
        <span data-cet-avance="sin-empezar" className="text-body-sm text-[var(--cet-ink-muted)]">
          {t(notStartedText)}
        </span>
      ) : null}

      {hasNumbers ? (
        <span data-cet-avance="cifras" className="flex flex-col gap-2">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-sm">
            <span className="tabular-nums font-semibold">
              {sentence([String(counts.completed), t(ofText), String(counts.total), t(completedText)])}
            </span>
            {counts.started > 0 ? (
              <>
                <span aria-hidden="true" className="text-[var(--cet-ink-muted)]">
                  ·
                </span>
                <span className="tabular-nums text-[var(--cet-ink-muted)]">
                  {sentence([String(counts.started), t(startedText)])}
                </span>
              </>
            ) : null}
            {/* El separador tambien aqui, y no solo antes de "en marcha": sin el,
                la materia terminada leia "9 de 9 terminadas Todas terminadas",
                dos frases pegadas sin nada entre medias. La cifra se queda
                —quitarla dejaria una barra llena sin numero, que es justo lo
                que esta tarjeta no hace— y el elogio va detras, separado. */}
            {state === "done" ? (
              <>
                <span aria-hidden="true" className="text-[var(--cet-ink-muted)]">
                  ·
                </span>
                <span className="font-semibold text-[var(--cet-ink)]">{t(doneText)}</span>
              </>
            ) : null}
          </span>

          {/* La barra es DECORATIVA a proposito: la cifra de al lado ya lleva el
              dato, y anunciarla otra vez como progressbar la diria dos veces.
              Dos capas: lo terminado en relleno pleno, lo empezado detras en
              el mismo color a media tinta — nunca un segundo color. */}
          <span
            aria-hidden="true"
            data-cet-barra="avance"
            className="relative block h-2.5 w-full overflow-hidden rounded-pill bg-[var(--cet-surface-3)]"
          >
            <span
              className="absolute inset-y-0 start-0 rounded-pill opacity-40"
              style={{ width: `${pctOpen}%`, backgroundColor: identity.fill }}
            />
            <span
              className="absolute inset-y-0 start-0 rounded-pill"
              style={{ width: `${pctDone}%`, backgroundColor: identity.fill }}
            />
          </span>
        </span>
      ) : null}
    </a>
  );
}
