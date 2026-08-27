/**
 * Cadena de recalificación de `attempt_gradings`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ EXTREMO DE LA CADENA ES LA NOTA VIGENTE
 * ===========================================================================
 * `attempt_gradings.supersedes_id` apunta a la fila que ESTA sustituye. Por
 * tanto:
 *
 *     raíz  (supersedes_id = NULL)      ← la PRIMERA nota, la más antigua
 *       ↑ supersedes_id
 *     recalificación 1
 *       ↑ supersedes_id
 *     recalificación 2                  ← la nota VIGENTE (nadie la sustituye)
 *
 * La migración 0009 declara
 * `create unique index attempt_gradings_current_uniq on attempt_gradings
 *  (attempt_item_id) where supersedes_id is null`, y su comentario la llama
 * "la calificación vigente". Ese comentario induce a error: lo que ese índice
 * garantiza es que hay UNA SOLA RAÍZ por item, es decir, un único punto de
 * partida de la cadena. Leer "vigente = supersedes_id is null" mostraría al
 * profesor la nota MÁS ANTIGUA justo después de una recalificación, que es el
 * peor momento posible para equivocarse.
 *
 * La nota vigente es la HOJA: la fila cuyo `id` no aparece como `supersedes_id`
 * de ninguna otra. Eso es lo que calcula este módulo.
 * ===========================================================================
 *
 * Módulo PURO. Defensivo por diseño: los datos vienen de una tabla histórica
 * que nunca se edita, así que una cadena rota no se puede "arreglar" — hay que
 * mostrarla tal cual sin colgar la página.
 */

export interface GradingRow {
  readonly id: string;
  readonly points_awarded: number;
  readonly max_points: number;
  readonly is_correct: boolean | null;
  readonly partial_ratio: number | null;
  readonly graded_by: "auto" | "manual";
  readonly grader_id: string | null;
  readonly rationale: string | null;
  readonly graded_at: string;
  readonly supersedes_id: string | null;
}

export interface GradingChainEntry<TRow extends GradingRow = GradingRow> {
  readonly row: TRow;
  /** Posición en la cadena, base 1, de la más antigua a la más nueva. */
  readonly step: number;
  /** Alguna fila posterior la sustituye. */
  readonly superseded: boolean;
  /** Es la hoja: la nota que cuenta. */
  readonly effective: boolean;
  /**
   * La fila no cuelga de la cadena principal (raíz duplicada, `supersedes_id`
   * apuntando a una fila ausente, o un ciclo). Se muestra igualmente: ocultar
   * una nota porque el enlace está roto es exactamente lo que un log forense
   * no debe hacer.
   */
  readonly detached: boolean;
}

function byGradedAtThenId(a: GradingRow, b: GradingRow): number {
  if (a.graded_at !== b.graded_at) return a.graded_at < b.graded_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Ordena las calificaciones de un item como una cadena: raíz primero, hoja al
 * final.
 *
 * @param rows Todas las filas de `attempt_gradings` de UN item.
 */
export function orderGradingChain<TRow extends GradingRow>(
  rows: readonly TRow[],
): readonly GradingChainEntry<TRow>[] {
  if (rows.length === 0) return [];

  const byId = new Map<string, TRow>();
  for (const row of rows) byId.set(row.id, row);

  // successor[X] = la fila que sustituye a X.
  const successor = new Map<string, TRow>();
  for (const row of rows) {
    if (row.supersedes_id !== null && byId.has(row.supersedes_id)) {
      // Si dos filas dicen sustituir a la misma, gana la más antigua y la otra
      // queda "detached". El unique index no lo impide (solo cubre la raíz).
      const existing = successor.get(row.supersedes_id);
      if (existing === undefined || byGradedAtThenId(row, existing) < 0) {
        successor.set(row.supersedes_id, row);
      }
    }
  }

  // Raíces: `supersedes_id` nulo, o apuntando a una fila que no está aquí.
  const roots = rows
    .filter((row) => row.supersedes_id === null || !byId.has(row.supersedes_id))
    .sort(byGradedAtThenId);

  const visited = new Set<string>();
  const ordered: TRow[] = [];

  for (const root of roots) {
    let current: TRow | undefined = root;
    while (current !== undefined && !visited.has(current.id)) {
      visited.add(current.id);
      ordered.push(current);
      current = successor.get(current.id);
    }
  }

  // Cualquier fila que un ciclo dejara fuera se añade al final por fecha. Nunca
  // se pierde una nota.
  const orphans = rows.filter((row) => !visited.has(row.id)).sort(byGradedAtThenId);
  ordered.push(...orphans);

  // La cadena principal es la que arranca en la raíz más antigua.
  const mainChain = new Set<string>();
  const firstRoot = roots[0];
  if (firstRoot !== undefined) {
    let current: TRow | undefined = firstRoot;
    const guard = new Set<string>();
    while (current !== undefined && !guard.has(current.id)) {
      guard.add(current.id);
      mainChain.add(current.id);
      current = successor.get(current.id);
    }
  }

  const lastOfMain = ordered.filter((row) => mainChain.has(row.id)).at(-1);

  return ordered.map((row, index) => ({
    row,
    step: index + 1,
    superseded: successor.has(row.id),
    effective: lastOfMain !== undefined && row.id === lastOfMain.id,
    detached: !mainChain.has(row.id),
  }));
}

/** La nota que cuenta: la hoja de la cadena principal. `null` si no hay ninguna. */
export function effectiveGrading<TRow extends GradingRow>(rows: readonly TRow[]): TRow | null {
  const chain = orderGradingChain(rows);
  const leaf = chain.find((entry) => entry.effective);
  return leaf === undefined ? null : leaf.row;
}

/** Cuántas veces se ha recalificado (0 = nota original sin tocar). */
export function regradeCount(rows: readonly GradingRow[]): number {
  const chain = orderGradingChain(rows);
  return Math.max(0, chain.filter((entry) => !entry.detached).length - 1);
}

/**
 * Suma de la nota vigente de cada item. Devuelve `null` si NINGÚN item tiene
 * nota: cero y "sin calificar" no son lo mismo, y presentarlos igual haría que
 * un intento en curso pareciera un cero.
 */
export function totalEffectivePoints(
  gradingsByItem: ReadonlyMap<string, readonly GradingRow[]>,
): { awarded: number; max: number; gradedItems: number } | null {
  let awarded = 0;
  let max = 0;
  let gradedItems = 0;

  for (const rows of gradingsByItem.values()) {
    const leaf = effectiveGrading(rows);
    if (leaf === null) continue;
    awarded += leaf.points_awarded;
    max += leaf.max_points;
    gradedItems += 1;
  }

  return gradedItems === 0 ? null : { awarded, max, gradedItems };
}
