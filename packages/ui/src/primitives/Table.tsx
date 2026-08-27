/**
 * @cet/ui — Table.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";

export interface TableColumn<TRow> {
  readonly key: string;
  readonly header: I18nText;
  /** Contenido de la celda. Devuelve nodos, nunca HTML crudo. */
  readonly cell: (row: TRow, index: number) => ReactNode;
  readonly align?: "start" | "center" | "end" | undefined;
  /** Marca la columna como cabecera de fila (`<th scope="row">`). */
  readonly rowHeader?: boolean | undefined;
}

export interface TableProps<TRow> {
  /** Resumen de la tabla. Obligatorio: una tabla de datos sin `<caption>` deja a ciegas al lector de pantalla. */
  readonly caption: I18nText;
  readonly columns: ReadonlyArray<TableColumn<TRow>>;
  readonly rows: readonly TRow[];
  readonly rowKey: (row: TRow, index: number) => string;
  /** Oculta el caption visualmente, manteniendolo accesible. @default false */
  readonly hideCaption?: boolean | undefined;
  readonly className?: string | undefined;
}

const ALIGN = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
} as const;

/**
 * Tabla de datos. Portada de `table.t` de los trainers Y6A.
 *
 * Envuelta en un contenedor con `overflow-x-auto` y `tabIndex={0}`: una region
 * que hace scroll debe poder recorrerse con teclado (WCAG 2.1.1), y en el movil
 * del colegio las tablas de conversion de unidades no caben.
 */
export function Table<TRow>({
  caption,
  columns,
  rows,
  rowKey,
  hideCaption = false,
  className,
}: TableProps<TRow>): ReactNode {
  const t = useI18n();
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={t(caption)}
      className="overflow-x-auto rounded-md border border-[var(--cet-line)]"
    >
      <table className={cn("w-full border-collapse text-body-sm", className)}>
        <caption
          className={cn(
            "px-3 py-2 text-start text-body-sm text-[var(--cet-ink-muted)]",
            hideCaption && "absolute h-px w-px overflow-hidden [clip-path:inset(50%)]",
          )}
        >
          {t(caption)}
        </caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "border border-[var(--cet-line)] bg-[var(--cet-surface-3)] px-3 py-2 font-bold text-[var(--cet-ink)]",
                  ALIGN[col.align ?? "start"],
                )}
              >
                {t(col.header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="odd:bg-[var(--cet-surface)] even:bg-[var(--cet-surface-2)]">
              {columns.map((col) =>
                col.rowHeader ? (
                  <th
                    key={col.key}
                    scope="row"
                    className={cn(
                      "border border-[var(--cet-line)] px-3 py-2 font-semibold text-[var(--cet-ink)]",
                      ALIGN[col.align ?? "start"],
                    )}
                  >
                    {col.cell(row, index)}
                  </th>
                ) : (
                  <td
                    key={col.key}
                    className={cn(
                      "border border-[var(--cet-line)] px-3 py-2 text-[var(--cet-ink)]",
                      ALIGN[col.align ?? "start"],
                    )}
                  >
                    {col.cell(row, index)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
