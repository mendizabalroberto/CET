/**
 * Traducción de `attempt_items.option_order` a algo que un profesor entienda.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LA SEMÁNTICA, QUE ES DONDE ESTÁ EL BUG FÁCIL
 * ===========================================================================
 * `option_order` es una permutación de `0..n-1`. La dirección importa y es
 * fácil invertirla sin que nada falle ruidosamente. La fuente de verdad es
 * `packages/engine/src/blueprint.ts`:
 *
 *     const order = rng.permutation(options.length);
 *     const reordered = order.map((index) => options[index]);
 *     return { body: { ...body, options: reordered }, optionOrder: order };
 *
 * Es decir:
 *
 *     option_order[posiciónQueVioElAlumno] = índiceCanónicoEnElBanco
 *
 * y NO al revés. `supabase/tests/forensic_reconstruction.sql` lo confirma desde
 * el otro lado, con `option_order[1]` (SQL indexa desde 1) apuntando a la
 * opción del banco que el alumno vio la PRIMERA.
 *
 * Corolario que hay que tener muy presente al leer esta reconstrucción:
 * `attempt_items.rendered_body.options` YA ESTÁ BARAJADO. Es literalmente lo
 * que se pintó en pantalla. Por eso la posición vista es simplemente el índice
 * en ese array, y `option_order` solo sirve para volver al banco.
 *
 * La función inversa (`índiceCanónico -> posiciónVista`) es la que se necesita
 * para responder "¿en qué posición vio la opción correcta?", y por eso se
 * expone explícitamente: escribirla a mano en cada sitio es cómo se invierte
 * un índice.
 * ===========================================================================
 *
 * Módulo PURO: sin React, sin acceso a datos, sin `Date`. Es lo que lo hace
 * testeable con permutaciones no triviales.
 */

export interface RenderedOption {
  readonly id: string;
  readonly html: string;
}

/** Una opción tal como se presentó, con su trazabilidad al banco. */
export interface PresentedOption {
  readonly id: string;
  readonly html: string;
  /** Posición en pantalla, base 0. */
  readonly displayIndex: number;
  /** Posición en pantalla, base 1: lo que se le dice a un humano. */
  readonly displayPosition: number;
  /** Etiqueta que vio el alumno: A, B, C… */
  readonly displayLabel: string;
  /** Índice de esta opción en `question_versions.body.options`, o null si no se puede saber. */
  readonly bankIndex: number | null;
  /** Etiqueta de esa posición en el banco, o null. */
  readonly bankLabel: string | null;
  readonly chosen: boolean;
}

export type OptionOrderIntegrity =
  /** `option_order` es una permutación válida de la longitud correcta. */
  | "ok"
  /** No se guardó permutación pero hay opciones: no se puede volver al banco. */
  | "missing"
  /** Se guardó algo que no es una permutación válida para estas opciones. */
  | "invalid"
  /** La pregunta no tiene opciones (numérica, texto libre…). */
  | "not-applicable";

export interface OptionPresentation {
  readonly options: readonly PresentedOption[];
  readonly integrity: OptionOrderIntegrity;
  /** Las que eligió, en el orden en que las vio. */
  readonly chosen: readonly PresentedOption[];
  /** Ids guardados en la respuesta que no corresponden a ninguna opción mostrada. */
  readonly unmatchedSelectedIds: readonly string[];
}

/**
 * Etiqueta de posición: A, B, … Z, AA, AB…
 *
 * Se desborda a dos letras en vez de reciclar la A porque una pregunta con 27
 * opciones es rarísima pero no imposible, y dos "A" en la misma tabla harían
 * ilegible justo lo que esta pantalla existe para dejar claro.
 */
export function positionLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) return "?";
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** ¿Es `order` una permutación de `0..length-1`? */
export function isPermutationOf(order: readonly number[] | null | undefined, length: number): boolean {
  if (!Array.isArray(order)) return false;
  if (order.length !== length) return false;
  const seen = new Set<number>();
  for (const value of order) {
    if (!Number.isInteger(value)) return false;
    if (value < 0 || value >= length) return false;
    if (seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

/**
 * Invierte la permutación: `inverse[índiceCanónico] = posiciónVista`.
 *
 * Existe como función con nombre precisamente porque invertirla mentalmente es
 * el error de índice clásico de esta pantalla.
 */
export function invertPermutation(order: readonly number[]): number[] {
  const inverse = new Array<number>(order.length).fill(-1);
  for (let displayIndex = 0; displayIndex < order.length; displayIndex += 1) {
    const bankIndex = order[displayIndex];
    if (bankIndex === undefined || bankIndex < 0 || bankIndex >= order.length) continue;
    inverse[bankIndex] = displayIndex;
  }
  return inverse;
}

/**
 * Combina las opciones renderizadas (ya barajadas), la permutación y los ids
 * que el alumno seleccionó.
 *
 * @param options `attempt_items.rendered_body.options` — EN EL ORDEN EN QUE SE VIERON.
 * @param optionOrder `attempt_items.option_order`.
 * @param selectedIds ids de `attempt_responses.response.selectedIds`, si la respuesta es de tipo `choice`.
 */
export function presentOptions(
  options: readonly RenderedOption[] | null | undefined,
  optionOrder: readonly number[] | null | undefined,
  selectedIds: readonly string[] = [],
): OptionPresentation {
  if (!Array.isArray(options) || options.length === 0) {
    return {
      options: [],
      integrity: "not-applicable",
      chosen: [],
      unmatchedSelectedIds: [...selectedIds],
    };
  }

  const selected = new Set(selectedIds);
  const valid = isPermutationOf(optionOrder, options.length);
  const integrity: OptionOrderIntegrity = valid
    ? "ok"
    : optionOrder === null || optionOrder === undefined
      ? "missing"
      : "invalid";

  const presented: PresentedOption[] = options.map((option, displayIndex) => {
    const bankIndex = valid ? (optionOrder as readonly number[])[displayIndex] ?? null : null;
    return {
      id: option.id,
      html: option.html,
      displayIndex,
      displayPosition: displayIndex + 1,
      displayLabel: positionLabel(displayIndex),
      bankIndex,
      bankLabel: bankIndex === null ? null : positionLabel(bankIndex),
      chosen: selected.has(option.id),
    };
  });

  const shownIds = new Set(presented.map((o) => o.id));

  return {
    options: presented,
    integrity,
    chosen: presented.filter((o) => o.chosen),
    // Una respuesta que apunta a un id inexistente es un dato roto, y esta
    // pantalla tiene que decirlo en vez de pintar "no contestó": no contestar y
    // contestar algo ilegible son hechos distintos ante una reclamación.
    unmatchedSelectedIds: selectedIds.filter((id) => !shownIds.has(id)),
  };
}

/**
 * Extrae los ids seleccionados de un `attempt_responses.response` arbitrario.
 * Devuelve `null` si la respuesta no es de tipo `choice` (numérica, texto…),
 * que NO es lo mismo que una lista vacía.
 */
export function selectedIdsFromResponse(response: unknown): readonly string[] | null {
  if (response === null || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  if (record["type"] !== "choice") return null;
  const ids = record["selectedIds"];
  if (!Array.isArray(ids)) return [];
  return ids.filter((value): value is string => typeof value === "string");
}
