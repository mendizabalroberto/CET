"use client";

/**
 * @cet/ui — ScorecardPanel: la caja de una seccion del scorecard.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * ES LA MISMA CAJA QUE LAS TARJETAS, CON OTRA COSA DENTRO
 * ===========================================================================
 * Ni una clase de caja se escribe aqui: `CARD_CHROME`, `MEDALLION_CHROME`,
 * `cardSkin()` y `medallionSkin()` se importan de `navigation/card-chrome.ts`,
 * que es la unica definicion del producto. Cuando cada pantalla llevaba su lista
 * a mano, /learn y /practice divergieron sin que ningun test lo viera; el
 * scorecard es la tercera pantalla y no va a abrir la tercera copia.
 *
 * LA UNICA CLASE QUE ESTE FICHERO ANADE ES PARA QUITAR ALGO. `CARD_CHROME` trae
 * `hover:shadow-pop` porque las tarjetas son enlaces y se pulsan; un panel de
 * informe no se pulsa, y una caja que se levanta al pasar el raton promete un
 * clic que no existe. Se neutraliza con `hover:shadow-card` —`cn()` resuelve el
 * conflicto y gana la ultima— en vez de recortando la constante: asi el panel
 * sigue heredando radio, borde, rail, padding y sombra de la misma fuente.
 *
 * ===========================================================================
 * EL TITULO NO COMPARTE FILA CON NINGUN INDICADOR
 * ===========================================================================
 * La cabecera es medallon y titulo, y nada mas. Es la leccion de obs003, que
 * costo ver en produccion «Comparar» y «Lo llevas bien» pintados uno encima del
 * otro: un titulo con un vecino que no cede sitio se rompe con el primer nombre
 * largo, y ni `min-w-0` ni `truncate` arreglan eso, solo esconden el sintoma.
 * Lo que mide va DEBAJO, en su propia franja.
 *
 * ===========================================================================
 * SOBRE EL LAVADO NO VA TINTA ATENUADA
 * ===========================================================================
 * El cuerpo del panel es `--cet-materia-*-suave`, y `--cet-ink-muted` sobre esos
 * lavados mide 4.45:1 — por debajo del 4.5 de WCAG 1.4.3. Por eso aqui no hay
 * ni un `text-[var(--cet-ink-muted)]`: el panel hereda `--cet-ink` de la caja y
 * lo que va dentro lo hereda de el. Los `StatTile` que se le metan traen su
 * propio fondo `--cet-surface`, que es donde el gris SI esta medido.
 *
 * ===========================================================================
 * LOS TEXTOS (AD-7)
 * ===========================================================================
 * `title` entra como `I18nText` y se resuelve con `useI18n()`. Si la aplicacion
 * no lo pasa, la cabecera NO se pinta: un medallon con un renglon vacio al lado
 * es peor que un panel que empieza por su contenido.
 */

import type { CSSProperties, ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import {
  CARD_CHROME,
  MEDALLION_CHROME,
  cardSkin,
  medallionSkin,
} from "../navigation/card-chrome.js";
import { SubjectIcon } from "../navigation/SubjectIcon.js";
import { subjectIdentity } from "../navigation/subject-identity.js";

export interface ScorecardPanelProps {
  /** `subjects.code`. Da rail, medallon y lavado; uno desconocido cae en el neutro. */
  readonly subjectCode: string;
  /** Titulo de la seccion. Sin el, no hay cabecera. */
  readonly title?: I18nText | undefined;
  /**
   * Nivel del encabezado. El scorecard entero cuelga de un `h2` con el nombre
   * del alumno, asi que sus secciones son `h3`; se deja abrir por si el panel se
   * monta suelto en otra pantalla con otra jerarquia. El orden de los
   * encabezados es una regla de axe y se rompe sin que se note en pantalla.
   */
  readonly headingLevel?: 2 | 3 | 4 | undefined;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

export function ScorecardPanel({
  subjectCode,
  title,
  headingLevel = 3,
  children,
  className,
}: ScorecardPanelProps): ReactNode {
  const t = useI18n();
  const identity = subjectIdentity(subjectCode);
  const skin: CSSProperties = cardSkin(identity);
  const heading = t(title);
  const Heading = headingLevel === 2 ? "h2" : headingLevel === 4 ? "h4" : "h3";

  return (
    <section
      data-cet-panel="scorecard"
      data-subject={identity.code}
      // Ver la cabecera: la caja se importa entera y lo unico que se anade es la
      // retirada de la elevacion al pasar por encima, que aqui mentiria.
      className={cn(CARD_CHROME, "hover:shadow-card", className)}
      style={skin}
    >
      {heading.length > 0 ? (
        <span data-cet-fila="cabecera" className="flex items-center gap-3">
          <span className={MEDALLION_CHROME} style={medallionSkin(identity)}>
            <SubjectIcon code={subjectCode} />
          </span>
          <Heading className="m-0 text-body-lg font-bold leading-tight">{heading}</Heading>
        </span>
      ) : null}
      {children}
    </section>
  );
}
