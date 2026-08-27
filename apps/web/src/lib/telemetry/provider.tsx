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

import { TelemetryQueue, type TrackInput } from "./client";

interface TelemetryContextValue {
  readonly track: (input: TrackInput) => void;
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
      sessionId: queue?.getSessionId() ?? "",
      flush: () => void queue?.flush(),
    };
  }, []);

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}

/**
 * Devuelve `track`. Si no hay provider, devuelve una función vacía en lugar de
 * lanzar: perder un evento de analítica nunca debe romper una lección a mitad
 * de un examen. Es la decisión contraria a la de `useI18n()`, donde faltar el
 * provider se vería en pantalla.
 */
export function useTelemetry(): TelemetryContextValue {
  const ctx = useContext(TelemetryContext);
  return ctx ?? { track: () => {}, sessionId: "", flush: () => {} };
}
