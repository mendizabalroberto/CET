"use client";

/**
 * De `QuestionFormat` al control del design system que le corresponde.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Este componente NO pinta nada por su cuenta: todos los controles vienen de
 * `@cet/ui`, que ya resuelve accesibilidad, tamaño táctil, contraste AA y
 * saneado del HTML del enunciado. Reimplementar aquí un radio "más sencillo"
 * significaría volver a equivocarse en las mismas cinco cosas.
 *
 * REGLA DE ORO: ningún camino de este fichero deja al alumno sin manera de
 * responder. Un formato desconocido, un `matching` sin columnas o unas opciones
 * que no llegaron caen a un campo de texto. Escribir la respuesta a mano es
 * incómodo; una pregunta que no acepta ninguna entrada es un cero injusto.
 */
import { useMemo, type ReactNode } from "react";
import type { QuestionFormat, RenderedBody, StudentResponse } from "@cet/shared";
import {
  ChoiceList,
  FractionInput,
  MatchingGrid,
  NumericInput,
  OrderingList,
  type FractionValue,
} from "@cet/ui";

import type { AttemptItemStudent } from "./types";

export interface AnswerInputProps {
  readonly item: AttemptItemStudent;
  readonly value: StudentResponse;
  readonly onChange: (next: StudentResponse) => void;
  /** Solo lectura: otra pestaña tiene el mando, o el tiempo ya terminó. */
  readonly disabled: boolean;
  readonly answerLabel: string;
}

const CHOICE_FORMATS: readonly QuestionFormat[] = ["mcq_single", "mcq_multi", "true_false"];

/** `"3/4"` -> `{ numerator: "3", denominator: "4" }`. Tolera lo que escriba un niño. */
export function parseFraction(text: string): FractionValue {
  const [numerator = "", denominator = ""] = text.split("/", 2);
  return { numerator: numerator.trim(), denominator: denominator.trim() };
}

/**
 * `{ "3", "4" }` -> `"3/4"`. Con el denominador vacío devuelve solo el
 * numerador: un alumno que ha escrito el 3 y todavía no el 4 tiene una
 * respuesta a medias, no una respuesta `"3/"` que el corrector no entendería.
 */
export function formatFraction(value: FractionValue): string {
  const n = value.numerator.trim();
  const d = value.denominator.trim();
  if (n === "" && d === "") return "";
  if (d === "") return n;
  return `${n}/${d}`;
}

function textValue(response: StudentResponse): string {
  return response.type === "text" ? response.value : "";
}

function choiceValue(response: StudentResponse): readonly string[] {
  return response.type === "choice" ? response.selectedIds : [];
}

function optionsOf(body: RenderedBody): readonly { id: string; html: string }[] {
  return body.options ?? [];
}

export function AnswerInput({ item, value, onChange, disabled, answerLabel }: AnswerInputProps): ReactNode {
  const body = item.renderedBody;
  const options = optionsOf(body);

  const orderingItems = useMemo(() => options.map((o) => ({ id: o.id, html: o.html })), [options]);

  const label = useMemo(() => ({ en: answerLabel, es: answerLabel }), [answerLabel]);

  if (CHOICE_FORMATS.includes(item.format) && options.length > 0) {
    return (
      <ChoiceList
        choices={options}
        value={choiceValue(value)}
        onChange={(ids) => onChange({ type: "choice", selectedIds: [...ids] })}
        mode={item.format === "mcq_multi" ? "multi" : "single"}
        // Sin `labelledBy`: `QuestionCard` ya envuelve estos controles en un
        // `role="group"` atado al enunciado. Repetirlo aquí haría que el lector
        // de pantalla leyera la pregunta dos veces antes de cada opción.
        disabled={disabled}
      />
    );
  }

  if (item.format === "ordering" && orderingItems.length > 0) {
    // El valor inicial de un `ordering` es el orden EN QUE SE LE MOSTRÓ. Si se
    // arrancara vacío, `OrderingList` no tendría nada que reordenar y la
    // pregunta sería incontestable.
    const current = value.type === "ordering" && value.order.length > 0
      ? value.order
      : orderingItems.map((o) => o.id);
    return (
      <OrderingList
        items={orderingItems}
        value={current}
        onChange={(order) => onChange({ type: "ordering", order: [...order] })}
        label={label}
        disabled={disabled}
      />
    );
  }

  if (item.format === "matching" && item.matchLeft && item.matchRight) {
    const pairs = value.type === "matching" ? value.pairs : [];
    return (
      <MatchingGrid
        left={item.matchLeft}
        right={item.matchRight}
        value={pairs}
        onChange={(next) => onChange({ type: "matching", pairs: next.map(([l, r]) => [l, r]) })}
        label={label}
        disabled={disabled}
      />
    );
  }

  if (item.format === "fraction") {
    return (
      <FractionInput
        value={parseFraction(textValue(value))}
        onChange={(next) => onChange({ type: "text", value: formatFraction(next) })}
        label={label}
        disabled={disabled}
      />
    );
  }

  // Numérico y todo lo demás. `NumericInput` acepta texto libre a propósito:
  // los trainers Y6A dan por buenas `7/4`, `1 3/4` y `1.75` para la misma
  // pregunta, y quien decide cuál vale es el corrector del servidor, no el
  // teclado del alumno.
  return (
    <NumericInput
      value={textValue(value)}
      onChange={(next) => onChange({ type: "text", value: next })}
      label={label}
      disabled={disabled}
      {...(body.unit !== undefined ? { unit: body.unit } : {})}
      {...(body.placeholder !== undefined ? { placeholder: body.placeholder } : {})}
    />
  );
}
