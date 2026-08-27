"use client";

/**
 * @cet/ui — AnswerKeypad: el teclado en pantalla de la respuesta.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * PARA QUE
 * ===========================================================================
 * El destino es una tableta de colegio compartida. Con el teclado del SISTEMA
 * el campo de respuesta queda tapado —hueco medido en el spec de tactil, y no
 * hay ni una linea de `visualViewport` en el repo—. Con teclado propio el del
 * sistema no llega a aparecer (`inputMode="none"` en el campo) y el problema
 * deja de existir sin escribir una sola linea de compensacion de viewport.
 *
 * ===========================================================================
 * LAS CUATRO DECISIONES QUE IMPORTAN
 * ===========================================================================
 *
 * 1. EL TABULADOR. Doce botones en el orden de tabulacion convierten en un
 *    suplicio llegar al boton "Comprobar", y eso castiga justo a quien navega
 *    con teclado. Se usa TABINDEX MOVIL (el patron de barra de herramientas de
 *    WAI-ARIA): el teclado entero es UN alto de tabulacion, y dentro se anda con
 *    las flechas. Se anuncia con un texto de ayuda enlazado por
 *    `aria-describedby`, igual que `orderingHelp` en `OrderingList`.
 *
 * 2. EL FOCO NO SE MUEVE AL PULSAR CON EL DEDO. `onMouseDown` con
 *    `preventDefault()` impide que el boton robe el foco del campo. Sin esto,
 *    cada pulsacion mata el cursor y la insercion siguiente ya no sabria donde
 *    escribir. Con esto, el campo conserva foco Y cursor, que es lo que hace
 *    que se pueda corregir el segundo digito de "1 3/4" sin borrarlo entero.
 *
 * 3. SE ESCRIBE DONDE ESTA EL CURSOR. `selectionStart/End` del campo, no un
 *    `value + tecla`. Un nino que toca en medio de su respuesta espera que la
 *    tecla caiga ahi.
 *
 * 4. NO SUSTITUYE AL TECLADO FISICO. Este componente no escucha ni un evento de
 *    teclado sobre el documento: en escritorio se sigue escribiendo con teclas y
 *    Enter sigue pasando de pregunta. Se ANADE.
 *
 * ===========================================================================
 * ESTADOS Y COLOR
 * ===========================================================================
 * `estados-no-solo-color.test.tsx` vigila cualquier mapa de estados que solo se
 * distinga por el token de color. Aqui NO hay mapa de estados: hay un solo
 * estilo de tecla. Lo deshabilitado se marca con `disabled` real (que el lector
 * anuncia), opacidad y cursor —canales no cromaticos—, y lo pulsado con
 * `active:` moviendo la tecla y su sombra, que se ve en blanco y negro.
 *
 * 44 px: cada tecla es `min-h-touch min-w-touch` (--cet-touch-min = 44px), el
 * minimo de WCAG 2.5.5. En la practica salen mas grandes porque la rejilla
 * estira.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";
import {
  KEYPAD_COLUMNS,
  keypadKeys,
  type KeypadKey,
  type KeypadLayout,
} from "./keypad-layout.js";

export interface AnswerKeypadProps {
  /** Lo que devuelve `keypadLayoutFor`. Si es `null`, no montes el componente. */
  readonly layout: KeypadLayout;
  readonly value: string;
  readonly onChange: (next: string) => void;
  /**
   * El campo al que escribe. Sirve para respetar el cursor y para devolverle el
   * foco. Sin el, las teclas escriben al final, que sigue siendo utilizable.
   */
  readonly targetRef?: RefObject<HTMLInputElement | null> | undefined;
  readonly disabled?: boolean | undefined;
  /** Nombre accesible del grupo. Por defecto "Teclado de respuesta". */
  readonly label?: I18nText | undefined;
  readonly className?: string | undefined;
}

/**
 * El glifo de la tecla de espacio, dibujado y no escrito.
 *
 * "␣" (U+2423) es el simbolo correcto, pero los tipos de letra del sistema lo
 * dibujan diminuto y pegado a la linea base: en la captura a 360 px parecia una
 * mota de polvo en mitad de la tecla. Y las alternativas de texto son peores en
 * un teclado de matematicas — un guion bajo se confunde con el hueco "___" del
 * enunciado de comparar, y una raya con el signo menos.
 *
 * Dibujado ocupa lo que tiene que ocupar, hereda la tinta con `currentColor`
 * (asi que no aporta un canal de color propio) y ademas le da al boton una
 * geometria distinta de la de los demas, que es justo lo que mide la firma no
 * cromatica de `estados-no-solo-color`.
 */
function GlifoEspacio(): ReactNode {
  return (
    <svg viewBox="0 0 32 16" aria-hidden="true" focusable="false" className="h-4 w-8" role="presentation">
      <path
        d="M3 4 v6 h26 v-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Inserta `text` sustituyendo la seleccion [start, end). Devuelve valor y cursor. */
function insertAt(
  value: string,
  text: string,
  start: number,
  end: number,
): { readonly next: string; readonly caret: number } {
  return { next: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}

/**
 * Borrado. Con seleccion, borra la seleccion; sin ella, el caracter anterior.
 * Es exactamente lo que hace la tecla de retroceso de verdad, y hacerlo distinto
 * sorprenderia a quien ya sabe usarla.
 */
function backspaceAt(
  value: string,
  start: number,
  end: number,
): { readonly next: string; readonly caret: number } {
  if (start !== end) return { next: value.slice(0, start) + value.slice(end), caret: start };
  if (start === 0) return { next: value, caret: 0 };
  return { next: value.slice(0, start - 1) + value.slice(start), caret: start - 1 };
}

export function AnswerKeypad({
  layout,
  value,
  onChange,
  targetRef,
  disabled = false,
  label,
  className,
}: AnswerKeypadProps): ReactNode {
  const t = useI18n();
  const helpId = `${useId()}-teclado-ayuda`;
  const keys = keypadKeys(layout);

  /**
   * El indice del unico boton con `tabindex=0`. Se guarda por ID y no por
   * posicion porque el teclado CAMBIA de forma al cambiar de pregunta: un indice
   * numerico se quedaria apuntando a una tecla que ya no esta.
   */
  const [activeId, setActiveId] = useState<string>(() => keys[0]?.id ?? "");
  useEffect(() => {
    if (keys.some((k) => k.id === activeId)) return;
    setActiveId(keys[0]?.id ?? "");
  }, [keys, activeId]);

  /** Cursor pendiente de aplicar: el valor aun no ha vuelto por props. */
  const caretPending = useRef<number | null>(null);
  useEffect(() => {
    const caret = caretPending.current;
    const input = targetRef?.current;
    if (caret === null || !input) return;
    caretPending.current = null;
    input.setSelectionRange(caret, caret);
  }, [value, targetRef]);

  const botones = useRef(new Map<string, HTMLButtonElement>());
  const enfocar = (id: string): void => {
    setActiveId(id);
    botones.current.get(id)?.focus();
  };

  const press = (key: KeypadKey): void => {
    if (disabled) return;
    const input = targetRef?.current ?? null;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const result =
      key.action === "backspace"
        ? backspaceAt(value, start, end)
        : insertAt(value, key.insert, start, end);
    if (result.next === value && result.caret === start) return;
    caretPending.current = result.caret;
    onChange(result.next);
  };

  /**
   * Flechas dentro del teclado. Se anda sobre la REJILLA, no sobre la lista de
   * teclas: izquierda/derecha avanzan una casilla y arriba/abajo una fila, y en
   * los dos casos se siguen saltando huecos hasta dar con una tecla. Asi el
   * recorrido con el teclado coincide con lo que se ve, que es la unica forma de
   * que no desoriente a quien no puede mirar la pantalla.
   */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const celdas = layout.cells;
    const actual = celdas.findIndex((c) => c !== null && c.id === activeId);
    if (actual < 0) return;

    /** Primera casilla ocupada a partir de `desde`, avanzando de `paso` en `paso`. */
    const buscar = (desde: number, paso: number, envolver: boolean): number | null => {
      for (let i = desde; i >= 0 && i < celdas.length; i += paso) {
        if (celdas[i]) return i;
      }
      if (!envolver) return null;
      const inicio = paso > 0 ? 0 : celdas.length - 1;
      for (let i = inicio; i >= 0 && i < celdas.length; i += paso) {
        if (celdas[i]) return i;
      }
      return null;
    };

    let destino: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        destino = buscar(actual + 1, 1, true);
        break;
      case "ArrowLeft":
        destino = buscar(actual - 1, -1, true);
        break;
      case "ArrowDown":
        destino = buscar(actual + KEYPAD_COLUMNS, KEYPAD_COLUMNS, false);
        break;
      case "ArrowUp":
        destino = buscar(actual - KEYPAD_COLUMNS, -KEYPAD_COLUMNS, false);
        break;
      case "Home":
        destino = buscar(0, 1, false);
        break;
      case "End":
        destino = buscar(celdas.length - 1, -1, false);
        break;
      default:
        return;
    }
    event.preventDefault();
    const key = destino === null ? null : celdas[destino];
    if (key) enfocar(key.id);
  };

  const tecla = (key: KeypadKey): ReactNode => (
    <button
      key={key.id}
      ref={(node) => {
        if (node) botones.current.set(key.id, node);
        else botones.current.delete(key.id);
      }}
      type="button"
      disabled={disabled}
      tabIndex={key.id === activeId ? 0 : -1}
      aria-label={t(key.label)}
      // Impide que el boton robe el foco del campo: sin esto cada pulsacion
      // pierde el cursor. Es la linea que hace que el teclado sea usable.
      onMouseDown={(event) => event.preventDefault()}
      onFocus={() => setActiveId(key.id)}
      onClick={() => press(key)}
      className={cn(
        "min-h-touch min-w-touch inline-flex items-center justify-center rounded-sm",
        "border border-[var(--cet-border-strong)] bg-[var(--cet-surface)] text-[var(--cet-ink)]",
        "text-[22px] font-semibold leading-none select-none",
        "shadow-sm hover:bg-[var(--cet-surface-2)]",
        // Pulsado: la tecla BAJA y pierde la sombra. Se ve sin color.
        "active:translate-y-px active:shadow-none",
        "transition-transform duration-fast ease-cet motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
      )}
    >
      {key.insert === " " ? <GlifoEspacio /> : <span aria-hidden="true">{key.glyph}</span>}
    </button>
  );

  return (
    <div
      role="group"
      aria-label={t(label, UI_STRINGS.keypadLabel)}
      aria-describedby={helpId}
      onKeyDown={onKeyDown}
      // `max-w-sm` para que en una tableta de 768 px el teclado no se estire de
      // lado a lado: una tecla de 180 px de ancho no es mas facil de dar, y
      // aleja el dedo del campo que esta escribiendo.
      className={cn("grid w-full max-w-sm grid-cols-4 gap-2", className)}
    >
      <p id={helpId} className="sr-only">
        {t(UI_STRINGS.keypadHelp)}
      </p>

      {layout.cells.map((key, i) =>
        key === null ? <span key={`hueco-${String(i)}`} aria-hidden="true" /> : tecla(key),
      )}
    </div>
  );
}
