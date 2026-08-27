"use client";

/**
 * @cet/ui — LessonBlock.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Una variante por cada miembro de `blockKind` de @cet/shared. El `switch` es
 * exhaustivo y lo comprueba el compilador: si manana se anade un `kind` nuevo al
 * enum, este fichero deja de compilar en lugar de renderizar un hueco en blanco
 * en mitad de una leccion.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { parseSafeHtml } from "../lib/html-to-react.js";
import { SafeSvg } from "../lib/safe-html.js";
import { UI_STRINGS } from "../lib/strings.js";
import { RuleBox } from "./RuleBox.js";
import { ExampleBox } from "./ExampleBox.js";
import { TipBox } from "./TipBox.js";
import { WarningBox } from "./WarningBox.js";
import { StepList } from "./StepList.js";
import { Table, type TableColumn } from "../primitives/Table.js";

/** Fila de una tabla de leccion: celdas en HTML restringido. */
export interface LessonTableRow {
  readonly cells: readonly string[];
}

/**
 * Contenido de un bloque de leccion.
 *
 * Es el equivalente en la UI de `lesson_blocks.content`. La validacion real la
 * hace Zod en @cet/shared antes de que esto llegue aqui; este tipo solo describe
 * lo que el componente sabe pintar.
 */
export type LessonBlockContent =
  | { readonly kind: "rule"; readonly html: string; readonly label?: I18nText }
  | { readonly kind: "example"; readonly html: string; readonly label?: I18nText }
  | { readonly kind: "tip"; readonly html: string; readonly label?: I18nText }
  | { readonly kind: "warning"; readonly html: string; readonly label?: I18nText }
  | { readonly kind: "steps"; readonly steps: readonly string[]; readonly label?: I18nText }
  | { readonly kind: "text"; readonly html: string }
  | { readonly kind: "formula"; readonly html: string; readonly label?: I18nText }
  | {
      readonly kind: "table";
      readonly caption: I18nText;
      readonly headers: readonly I18nText[];
      readonly rows: readonly LessonTableRow[];
    }
  | {
      readonly kind: "image";
      readonly src: string;
      /** Texto alternativo. No es opcional: `media_assets.alt_text` es NOT NULL. */
      readonly alt: I18nText;
      readonly caption?: I18nText | undefined;
    }
  | {
      readonly kind: "video";
      readonly src: string;
      readonly title: I18nText;
      /** Pista de subtitulos. Sin subtitulos el video no se publica. */
      readonly captionsSrc: string;
    }
  | {
      readonly kind: "interactive";
      /** SVG inline de la figura (los "labs" de Y6A). Se sanea con `sanitizeSvg`. */
      readonly svg: string;
      readonly alt: I18nText;
      /** Controles del lab, montados por la aplicacion. */
      readonly controls?: ReactNode | undefined;
    };

export interface LessonBlockProps {
  readonly content: LessonBlockContent;
  readonly className?: string | undefined;
}

/** Comprueba en tiempo de compilacion que el `switch` cubre todos los `kind`. */
function assertNever(value: never): never {
  throw new Error(`LessonBlock: kind sin variante: ${JSON.stringify(value)}`);
}

/** Renderiza un bloque de leccion segun su `kind`. */
export function LessonBlock({ content, className }: LessonBlockProps): ReactNode {
  const t = useI18n();

  switch (content.kind) {
    case "rule":
      return <RuleBox html={content.html} label={content.label} className={className} />;

    case "example":
      return <ExampleBox html={content.html} label={content.label} className={className} />;

    case "tip":
      return <TipBox html={content.html} label={content.label} className={className} />;

    case "warning":
      return <WarningBox html={content.html} label={content.label} className={className} />;

    case "steps":
      return (
        <StepList
          steps={content.steps.map((html) => ({ html }))}
          label={content.label}
          className={className}
        />
      );

    case "text":
      return (
        <div className={cn("cet-prose my-3 text-body text-[var(--cet-ink)]", className)}>
          {parseSafeHtml(content.html)}
        </div>
      );

    case "formula":
      return (
        <figure
          aria-label={t(content.label, UI_STRINGS.blockFormula)}
          className={cn(
            "my-3 rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface-2)] px-4 py-4 text-center",
            className,
          )}
        >
          <div className="cet-prose text-stem text-[var(--cet-ink)]">
            {parseSafeHtml(content.html)}
          </div>
        </figure>
      );

    case "table": {
      const columns: ReadonlyArray<TableColumn<LessonTableRow>> = content.headers.map(
        (header, index) => ({
          key: String(index),
          header,
          rowHeader: index === 0,
          align: index === 0 ? "start" : "center",
          cell: (row: LessonTableRow) => (
            <span className="cet-prose">{parseSafeHtml(row.cells[index] ?? "")}</span>
          ),
        }),
      );
      return (
        <div className={cn("my-3", className)}>
          <Table
            caption={content.caption}
            columns={columns}
            rows={content.rows}
            rowKey={(_row, index) => String(index)}
          />
        </div>
      );
    }

    case "image":
      return (
        <figure className={cn("my-3", className)}>
          {/* <img> y no <Image> de Next: @cet/ui es agnostico de framework y no
              puede depender de next. La app que lo consuma decide su estrategia
              de optimizacion de imagenes. */}
          <img
            src={content.src}
            alt={t(content.alt)}
            loading="lazy"
            decoding="async"
            className="mx-auto h-auto max-w-full rounded-md border border-[var(--cet-line)]"
          />
          {content.caption ? (
            <figcaption className="mt-2 text-center text-body-sm text-[var(--cet-ink-muted)]">
              {t(content.caption)}
            </figcaption>
          ) : null}
        </figure>
      );

    case "video":
      return (
        <figure className={cn("my-3", className)}>
          {/* Controles nativos: el reproductor del navegador ya es accesible por
              teclado y respeta las preferencias del sistema. */}
          <video
            controls
            preload="metadata"
            title={t(content.title)}
            className="mx-auto w-full max-w-full rounded-md border border-[var(--cet-line)]"
          >
            <source src={content.src} />
            <track kind="captions" src={content.captionsSrc} default />
          </video>
        </figure>
      );

    case "interactive":
      return (
        <div className={cn("my-3 flex flex-col gap-3", className)}>
          <SafeSvg
            svg={content.svg}
            label={t(content.alt)}
            className="rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface)] p-3 text-center [&_svg]:h-auto [&_svg]:max-w-full"
          />
          {content.controls}
        </div>
      );

    default:
      return assertNever(content);
  }
}

/**
 * `isRenderableBlockKind` VIVIA AQUI y no puede volver.
 *
 * Este fichero es `"use client"`. Lo que se exporta desde un modulo con esa
 * directiva no es una funcion para el servidor, es una referencia de cliente:
 * el mapeo de bloques —que corre en el servidor a proposito— reventaba con
 * "Attempted to call isRenderableBlockKind() from the server". Ahora vive en
 * `./block-kind.ts`, sin directiva, y lo importan los dos lados.
 */
