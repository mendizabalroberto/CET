"use client";

/**
 * Telemetría del lector de lección.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ SON TRES COMPONENTES DIMINUTOS Y NO UN `LessonReader`
 * ===========================================================================
 * El lector de lección es un Server Component: los bloques se pintan en el
 * servidor y no hay interacción que justifique enviar su HTML dos veces (una en
 * el HTML y otra en el payload de React). Lo único que necesita JavaScript es
 * MEDIR: cuándo se abrió, cuánto tiempo se miró cada bloque y cuándo se dio por
 * terminada.
 *
 * Por eso aquí hay tres islas de cliente sin contenido propio en lugar de un
 * componente cliente que envuelva la lección entera. `LessonBlockObserver`
 * recibe los bloques ya renderizados por el servidor como `children` y solo les
 * pone un envoltorio observado.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button, Icono, cn } from "@cet/ui";

import { useTelemetry } from "@/lib/telemetry/provider";

import { useCronometroDePantalla } from "./cronometro-de-pantalla";
import { ResumenDeTiempo } from "./TiempoEnPantalla";

/** Debajo de esto, el bloque pasó por delante de los ojos pero no se leyó. */
const MIN_DWELL_MS = 300;
/** Un bloque cuenta como "visto" cuando entra al menos este porcentaje. */
const VISIBILITY_THRESHOLD = 0.4;

/* -------------------------------------------------------------------------- */

export function LessonOpened({
  lessonId,
  blockCount,
}: {
  readonly lessonId: string;
  readonly blockCount: number;
}) {
  const { track } = useTelemetry();
  // `useRef` y no una dependencia del efecto: en desarrollo React monta dos
  // veces y `lesson_opened` se duplicaría en las métricas de cada lección.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track({ eventType: "lesson_opened", lessonId, payload: { blockCount } });
  }, [track, lessonId, blockCount]);

  return null;
}

/* -------------------------------------------------------------------------- */

/**
 * Mide el tiempo real que el bloque estuvo a la vista y emite UN
 * `lesson_block_viewed` con el acumulado.
 *
 * Se acumula en vez de emitir por cada entrada y salida: un alumno que hace
 * scroll arriba y abajo generaría veinte eventos por bloque y la media de
 * `dwellMs` dejaría de significar nada.
 */
export function LessonBlockObserver({
  lessonId,
  blockId,
  kind,
  children,
}: {
  readonly lessonId: string;
  readonly blockId: string;
  readonly kind: string;
  readonly children: ReactNode;
}) {
  const { track } = useTelemetry();
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const enteredAt = useRef<number | null>(null);
  const dwellMs = useRef(0);
  const sent = useRef(false);

  useEffect(() => {
    const node = nodeRef.current;
    // Sin IntersectionObserver (navegador antiguo, entorno de test) la lección
    // se lee igual: solo se pierde la métrica.
    if (!node || typeof IntersectionObserver === "undefined") return;

    const accumulate = (): void => {
      if (enteredAt.current === null) return;
      dwellMs.current += Math.max(0, Date.now() - enteredAt.current);
      enteredAt.current = null;
    };

    const flush = (): void => {
      accumulate();
      if (sent.current) return;
      const total = Math.round(dwellMs.current);
      if (total < MIN_DWELL_MS) return;
      sent.current = true;
      track({
        eventType: "lesson_block_viewed",
        lessonId,
        payload: { blockId, kind, dwellMs: total },
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            enteredAt.current ??= Date.now();
          } else {
            accumulate();
          }
        }
      },
      { threshold: VISIBILITY_THRESHOLD },
    );
    observer.observe(node);

    // La pestaña que se oculta es el caso normal en tablet: el alumno cambia de
    // app y el bloque sigue "visible" para el observer. Sin esto, el dwell de la
    // última lección de cada sesión sería siempre el recreo entero.
    const onHide = (): void => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [track, lessonId, blockId, kind]);

  return <div ref={nodeRef}>{children}</div>;
}

/* -------------------------------------------------------------------------- */

export function LessonCompleteButton({
  lessonId,
  label,
  doneLabel,
  className,
}: {
  readonly lessonId: string;
  readonly label: string;
  readonly doneLabel: string;
  readonly className?: string | undefined;
}) {
  const { track, flush } = useTelemetry();
  const cronometro = useCronometroDePantalla();
  const [done, setDone] = useState(false);
  /**
   * El tiempo se CONGELA en el clic, no se sigue leyendo después.
   *
   * Si el resumen leyera el cronómetro en cada pintado, un niño que se queda
   * mirando la pantalla vería su «has estado 7 minutos» convertirse en ocho y
   * luego en nueve sin haber hecho nada. El resumen habla de lo que duró la
   * lección, y la lección terminó al pulsar.
   */
  const [msAlTerminar, setMsAlTerminar] = useState<number | null>(null);

  const onClick = useCallback(() => {
    if (done) return;
    setDone(true);
    setMsAlTerminar(cronometro?.leerMsActivos() ?? null);
    track({ eventType: "lesson_completed", lessonId, payload: {} });
    // Vaciado inmediato: terminar una lección es justo el momento en que el
    // alumno cierra la pestaña o se va a practicar.
    flush();
  }, [done, track, flush, lessonId, cronometro]);

  if (done) {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <p role="status" className="inline-flex items-center gap-2">
          <Icono nombre="terminado" />
          {doneLabel}
        </p>
        {/* Sin cronómetro por encima no se inventa un número: se calla. */}
        {msAlTerminar === null ? null : <ResumenDeTiempo msActivos={msAlTerminar} />}
      </div>
    );
  }

  // Era un `<button>` a mano con `border-2` y `px-4`: exactamente el defecto
  // que obs001 cerro en los paneles de feedback, con la misma consecuencia —
  // medía distinto que cualquier otro boton de la pantalla. Ahora sale del
  // mismo `Button` que todos.
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick} icon="terminado">
      {label}
    </Button>
  );
}
