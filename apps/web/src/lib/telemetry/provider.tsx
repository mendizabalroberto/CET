/**
 * TelemetryProvider — una sola cola por sesión de navegación.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Se monta en el layout de alumno, no en el layout raíz: la landing y las
 * páginas legales no emiten telemetría de aprendizaje, y montarlo allí
 * añadiría JavaScript a páginas que hoy son 100 % servidor.
 */
"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import { TelemetryQueue, type TrackInput, type UiInput } from "./client";

interface TelemetryContextValue {
  readonly track: (input: TrackInput) => void;
  /** Un acto sobre un control marcado con `data-cet-id`. */
  readonly trackUi: (entrada: UiInput) => void;
  /** Un cambio de pantalla, con lo que duró la anterior. */
  readonly trackNav: (desde: string, hacia: string) => void;
  readonly sessionId: string;
  readonly flush: () => void;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

export function TelemetryProvider({ children }: { children: ReactNode }) {
  // `useRef` y no `useState`: la cola es un objeto mutable con temporizadores;
  // recrearla en cada render duplicaría los intervalos y los listeners.
  const queueRef = useRef<TelemetryQueue | null>(null);
  queueRef.current ??= new TelemetryQueue();

  useEffect(() => {
    const queue = queueRef.current;
    if (!queue) return;
    queue.start();
    return () => {
      // Al desmontar se vacía la cola con beacon: si no, al navegar del examen
      // al resumen se perderían los últimos eventos del intento.
      queue.dispose();
    };
  }, []);

  const value = useMemo<TelemetryContextValue>(() => {
    const queue = queueRef.current;
    return {
      track: (input) => queue?.track(input),
      trackUi: (entrada) => queue?.trackUi(entrada),
      trackNav: (desde, hacia) => queue?.trackNav(desde, hacia),
      sessionId: queue?.getSessionId() ?? "",
      flush: () => void queue?.flush(),
    };
  }, []);

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}

/** Mensaje único: lo comparte el `throw` de desarrollo y el aviso de producción. */
const SIN_PROVIDER =
  "useTelemetry() se ha llamado fuera de <TelemetryProvider>. " +
  "Los eventos de este componente NO se registran: monta el provider por encima " +
  "(hoy vive en el layout de alumno) o deja de emitir telemetría aquí.";

/**
 * Devuelve `track`. **Sin provider, hace ruido.**
 *
 * Antes devolvía `{ track: () => {} }` en silencio, "porque perder un evento de
 * analítica nunca debe romper una lección". El razonamiento suena bien y costó
 * medio día: un consumidor montado fuera del provider se traga todos sus
 * eventos y no hay forma de notarlo — ni en la pantalla, ni en la consola, ni
 * en la base de datos. Es la regla R4 del proyecto: *ausente no es denegado, y
 * silencioso es peor que ruidoso*.
 *
 * El compromiso: en DESARROLLO lanza, para que el desajuste se arregle antes de
 * salir de la máquina de quien lo introdujo. En PRODUCCIÓN avisa por consola y
 * degrada a no-op, porque a un niño en mitad de un examen no se le tira la
 * pantalla por una métrica. Ruidoso en los dos lados; mortal solo en uno.
 */
export function useTelemetry(): TelemetryContextValue {
  const ctx = useContext(TelemetryContext);
  if (ctx) return ctx;

  if (process.env.NODE_ENV !== "production") throw new Error(SIN_PROVIDER);

  console.error(`[telemetry] ${SIN_PROVIDER}`);
  // Los cinco campos, no tres. Un no-op incompleto no degrada: revienta con
  // «trackUi is not a function» en el primer clic, y en producción, que es
  // exactamente el accidente que este no-op existe para impedir.
  return { track: () => {}, trackUi: () => {}, trackNav: () => {}, sessionId: "", flush: () => {} };
}
