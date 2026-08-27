/**
 * Input segmentado de PIN.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Pensado para un niño de 11 años en una tableta:
 *  - Casillas de 56×64 px como mínimo: muy por encima del objetivo táctil de
 *    44 px de WCAG 2.5.5, porque los dedos pequeños y las prisas no perdonan.
 *  - `inputMode="numeric"` abre el teclado numérico en móvil. Sin esto, aparece
 *    el teclado completo y el niño busca los números entre las letras.
 *  - Avance y retroceso automáticos: escribir un dígito salta a la casilla
 *    siguiente; borrar en una casilla vacía vuelve a la anterior.
 *  - Pegar el PIN completo lo reparte por las casillas.
 *  - Un `type="password"` real, no `text` con puntos pintados: el gestor de
 *    contraseñas y el lector de pantalla saben lo que es.
 *
 * El valor completo viaja en un <input type="hidden"> llamado `pin`, así que el
 * formulario funciona igual con una Server Action que con un POST clásico.
 */
"use client";

import { useCallback, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import { useI18n } from "@/lib/i18n/provider";

interface PinInputProps {
  readonly length: number;
  readonly name?: string;
  readonly label: string;
  readonly help?: string;
  readonly errorId?: string;
  readonly autoFocus?: boolean;
  readonly disabled?: boolean;
  /** Se invoca cuando el PIN está completo, para poder enviar sin pulsar nada. */
  readonly onComplete?: (value: string) => void;
}

export function PinInput({
  length,
  name = "pin",
  label,
  help,
  errorId,
  autoFocus = false,
  disabled = false,
  onComplete,
}: PinInputProps) {
  const { t, fmt } = useI18n();
  const groupId = useId();
  const helpId = `${groupId}-help`;

  const [digits, setDigits] = useState<string[]>(() => Array.from({ length }, () => ""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const value = useMemo(() => digits.join(""), [digits]);

  const focusAt = useCallback((index: number) => {
    const target = refs.current[index];
    if (target) {
      target.focus();
      target.select();
    }
  }, []);

  const commit = useCallback(
    (next: string[]) => {
      setDigits(next);
      const joined = next.join("");
      if (joined.length === length && !next.includes("")) onComplete?.(joined);
    },
    [length, onComplete],
  );

  const handleChange = useCallback(
    (index: number, raw: string) => {
      // Se queda con el ÚLTIMO dígito tecleado: si la casilla ya tenía un
      // número y el niño escribe otro encima, gana el nuevo en vez de ignorarse.
      const cleaned = raw.replace(/\D/g, "");
      if (cleaned === "") {
        const next = [...digits];
        next[index] = "";
        commit(next);
        return;
      }

      const next = [...digits];
      if (cleaned.length > 1) {
        // Un teclado de móvil puede entregar varios caracteres de golpe.
        for (let i = 0; i < cleaned.length && index + i < length; i += 1) {
          next[index + i] = cleaned[i] ?? "";
        }
        commit(next);
        focusAt(Math.min(index + cleaned.length, length - 1));
        return;
      }

      next[index] = cleaned;
      commit(next);
      if (index < length - 1) focusAt(index + 1);
    },
    [commit, digits, focusAt, length],
  );

  const handleKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace") {
        if (digits[index]) return; // el onChange se encarga de vaciarla
        event.preventDefault();
        if (index > 0) {
          const next = [...digits];
          next[index - 1] = "";
          setDigits(next);
          focusAt(index - 1);
        }
        return;
      }
      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        focusAt(index - 1);
      }
      if (event.key === "ArrowRight" && index < length - 1) {
        event.preventDefault();
        focusAt(index + 1);
      }
    },
    [digits, focusAt, length],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
      if (!pasted) return;
      event.preventDefault();
      const next = Array.from({ length }, (_, i) => pasted[i] ?? "");
      commit(next);
      focusAt(Math.min(pasted.length, length - 1));
    },
    [commit, focusAt, length],
  );

  const describedBy = [help ? helpId : null, errorId ?? null].filter(Boolean).join(" ");

  return (
    /*
     * `aria-describedby` va en el <fieldset>, no en un <div> intermedio: un div
     * sin rol no se anuncia, así que ahí el atributo no llegaría a ningún
     * lector de pantalla. En el fieldset, la ayuda y el mensaje de error se leen
     * junto al grupo de casillas, que es lo que hace falta.
     */
    <fieldset
      disabled={disabled}
      className="border-0 p-0"
      {...(describedBy ? { "aria-describedby": describedBy } : {})}
    >
      <legend className="mb-2 block text-base font-semibold text-ink">{label}</legend>

      <div className="flex flex-wrap gap-2.5">
        {digits.map((digit, index) => (
          <input
            key={`${groupId}-${index}`}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="password"
            inputMode="numeric"
            // `one-time-code` desalienta a los gestores de contraseñas de
            // ofrecerse a guardar el PIN, cosa que en una tableta compartida del
            // aula sería un desastre. No es una garantía —ningún atributo HTML
            // lo es—, pero es la señal correcta y la que entienden los
            // navegadores móviles.
            autoComplete="one-time-code"
            maxLength={1}
             
            autoFocus={autoFocus && index === 0}
            value={digit}
            aria-label={fmt(t.auth.student.pinDigitLabel, { index: index + 1 })}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            onFocus={(event) => event.target.select()}
            className="h-16 w-14 rounded-xl border-2 border-line bg-card text-center text-2xl font-bold text-ink transition-colors focus:border-teal focus-visible:outline-none"
          />
        ))}
      </div>

      {help ? (
        <p id={helpId} className="mt-2.5 text-sm text-muted">
          {help}
        </p>
      ) : null}

      {/* El valor real que se envía. */}
      <input type="hidden" name={name} value={value} />
    </fieldset>
  );
}
