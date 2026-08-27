"use client";

/**
 * @cet/ui — ExamTimer.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";
import { LiveRegion } from "../a11y/LiveRegion.js";

/** Umbrales de aviso, en segundos. */
const WARN_AT = 300;
const URGENT_AT = 60;

export type TimerPhase = "normal" | "warn" | "urgent" | "expired";

export interface ExamTimerProps {
  /**
   * Fin del examen segun el SERVIDOR (AD-5). Es la unica verdad; el reloj del
   * navegador no participa en la decision.
   */
  readonly serverDeadlineAt: string | Date;
  /**
   * Hora del SERVIDOR en el instante en que se produjo esta respuesta.
   * Junto con `serverDeadlineAt` fija el tiempo restante inicial sin mirar el
   * reloj del cliente ni una sola vez.
   */
  readonly serverNowAt: string | Date;
  /**
   * Se invoca al cruzar 5 minutos y 1 minuto. NO cierra el examen.
   */
  readonly onWarning?: ((phase: "warn" | "urgent") => void) | undefined;
  /**
   * Se invoca cuando la cuenta llega a cero. El componente NO entrega el examen:
   * solo avisa para que la aplicacion pregunte al servidor. Si el reloj del
   * alumno esta adelantado, esto se dispara antes de tiempo y el servidor debe
   * ser quien diga que no.
   */
  readonly onExpired?: (() => void) | undefined;
  readonly label?: I18nText | undefined;
  readonly className?: string | undefined;
}

/** Reloj monotono: inmune a que el usuario cambie la hora del sistema. */
function monotonicNow(): number {
  const perf = globalThis.performance;
  // Mismo caso que en OrderingList: los tipos afirman que `performance` siempre
  // existe. El fallback a Date.now() cubre entornos donde no, a costa de perder
  // la monotonia — preferible a que el temporizador de un examen lance.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return typeof perf?.now === "function" ? perf.now() : Date.now();
}

function toMillis(value: string | Date): number {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** `mm:ss`, o `h:mm:ss` si pasa de una hora. */
export function formatRemaining(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function phaseFor(secondsLeft: number): TimerPhase {
  if (secondsLeft <= 0) return "expired";
  if (secondsLeft <= URGENT_AT) return "urgent";
  if (secondsLeft <= WARN_AT) return "warn";
  return "normal";
}

const PHASE_STYLES: Readonly<Record<TimerPhase, string>> = {
  normal: "text-[var(--cet-timer-normal)] bg-[var(--cet-surface)] border-[var(--cet-line)]",
  warn: "text-[var(--cet-timer-warn)] bg-[var(--cet-timer-warn-bg)] border-[var(--cet-timer-warn)]",
  urgent:
    "text-[var(--cet-timer-urgent)] bg-[var(--cet-timer-urgent-bg)] border-[var(--cet-timer-urgent)]",
  expired:
    "text-[var(--cet-timer-urgent)] bg-[var(--cet-timer-urgent-bg)] border-[var(--cet-timer-urgent)]",
};

/**
 * Cuenta atras del examen.
 *
 * TRES DECISIONES QUE IMPORTAN:
 *
 * 1. **El servidor manda.** El tiempo restante se calcula UNA vez, como
 *    `serverDeadlineAt - serverNowAt`, y a partir de ahi se descuenta con un
 *    reloj monotono (`performance.now()`). El reloj de pared del cliente no se
 *    consulta nunca, asi que da igual que vaya adelantado, atrasado, que salte
 *    con el cambio de hora o que el alumno lo toque a proposito a mitad del
 *    examen.
 *
 * 2. **No decide nada.** Al llegar a cero solo llama a `onExpired` y muestra un
 *    mensaje tranquilo. Quien cierra el intento es el servidor.
 *
 * 3. **Urgencia sin panico.** Nada parpadea. Al bajar de 5 minutos el reloj pasa
 *    a ambar y al bajar de 1 minuto a rojo, con un texto que explica lo que pasa.
 *    Un rojo parpadeante sobre un nino de 11 anos que va justo de tiempo no le
 *    hace ir mas rapido: le hace bloquearse. Ademas el parpadeo por debajo de
 *    3 Hz choca con WCAG 2.3.1.
 */
export function ExamTimer({
  serverDeadlineAt,
  serverNowAt,
  onWarning,
  onExpired,
  label,
  className,
}: ExamTimerProps): ReactNode {
  const t = useI18n();

  const deadlineMs = toMillis(serverDeadlineAt);
  const serverNowMs = toMillis(serverNowAt);
  const initialRemainingMs =
    Number.isFinite(deadlineMs) && Number.isFinite(serverNowMs) ? deadlineMs - serverNowMs : Number.NaN;

  /** Instante monotono en que se recibio la referencia del servidor. */
  const baselineRef = useRef<number>(monotonicNow());
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Number.isFinite(initialRemainingMs) ? Math.max(0, Math.round(initialRemainingMs / 1000)) : Number.NaN,
  );

  // Si el servidor manda una referencia nueva (tras un reintento o al recuperar
  // el intento), se reajusta la linea base. Es el UNICO punto de resincronizado.
  useEffect(() => {
    baselineRef.current = monotonicNow();
    setSecondsLeft(
      Number.isFinite(initialRemainingMs) ? Math.max(0, Math.round(initialRemainingMs / 1000)) : Number.NaN,
    );
  }, [initialRemainingMs]);

  const recompute = useCallback((): number => {
    if (!Number.isFinite(initialRemainingMs)) return Number.NaN;
    const elapsedMs = monotonicNow() - baselineRef.current;
    return Math.max(0, Math.round((initialRemainingMs - elapsedMs) / 1000));
  }, [initialRemainingMs]);

  useEffect(() => {
    if (!Number.isFinite(initialRemainingMs)) return undefined;
    const id = globalThis.setInterval(() => {
      setSecondsLeft(recompute());
    }, 1000);
    return () => globalThis.clearInterval(id);
  }, [recompute, initialRemainingMs]);

  // El navegador congela los `setInterval` de una pestana en segundo plano.
  // Al volver hay que recalcular, no seguir contando desde donde se quedo.
  useEffect(() => {
    const resync = (): void => setSecondsLeft(recompute());
    // `visibilitychange` se dispara en `document`, NO en `window`. Registrarlo
    // en `window` compila, no falla en runtime y no se ejecuta nunca, que es
    // justo el peor tipo de bug para el caso que esto cubre.
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, [recompute]);

  const phase = Number.isFinite(secondsLeft) ? phaseFor(secondsLeft) : "normal";

  // Avisos: una sola vez por umbral.
  const warnedRef = useRef<{ warn: boolean; urgent: boolean; expired: boolean }>({
    warn: false,
    urgent: false,
    expired: false,
  });

  useEffect(() => {
    if (!Number.isFinite(secondsLeft)) return;
    const flags = warnedRef.current;
    if (phase === "warn" && !flags.warn) {
      flags.warn = true;
      onWarning?.("warn");
    }
    if (phase === "urgent" && !flags.urgent) {
      flags.warn = true;
      flags.urgent = true;
      onWarning?.("urgent");
    }
    if (phase === "expired" && !flags.expired) {
      flags.expired = true;
      onExpired?.();
    }
  }, [phase, secondsLeft, onWarning, onExpired]);

  const labelText = t(label, UI_STRINGS.timeLeft);

  if (!Number.isFinite(secondsLeft)) {
    // Referencia de servidor invalida o todavia no recibida. No se inventa un
    // tiempo: se dice que se esta sincronizando.
    return (
      <div
        role="timer"
        aria-label={labelText}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-3.5 py-2",
          PHASE_STYLES.normal,
          className,
        )}
      >
        <span className="text-body-sm text-[var(--cet-ink-muted)]">{t(UI_STRINGS.timerSyncing)}</span>
      </div>
    );
  }

  const display = formatRemaining(secondsLeft);
  const announcement =
    phase === "expired"
      ? t(UI_STRINGS.timeUp)
      : phase === "urgent"
        ? t(UI_STRINGS.timeLeftVeryLow)
        : phase === "warn"
          ? t(UI_STRINGS.timeLeftLow)
          : "";

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <div
        role="timer"
        aria-label={labelText}
        /* El valor se anuncia bajo demanda, no cada segundo: un reloj que habla
           cada segundo hace imposible leer el enunciado. */
        aria-live="off"
        data-phase={phase}
        className={cn(
          "inline-flex items-center gap-2.5 rounded-md border-2 px-3.5 py-2",
          "font-bold tabular-nums",
          PHASE_STYLES[phase],
        )}
      >
        <span className="text-[12px] font-semibold uppercase tracking-wide">{labelText}</span>
        <span className="text-[22px] leading-none">{display}</span>
      </div>

      {announcement === "" ? null : (
        <p
          className={cn(
            "text-body-sm font-medium",
            phase === "warn" ? "text-[var(--cet-timer-warn)]" : "text-[var(--cet-timer-urgent)]",
          )}
        >
          {announcement}
        </p>
      )}

      {/* Solo se anuncia al cruzar un umbral, y `assertive` unicamente cuando de
          verdad hay que interrumpir. */}
      <LiveRegion
        message={announcement}
        politeness={phase === "expired" || phase === "urgent" ? "assertive" : "polite"}
      />
    </div>
  );
}
