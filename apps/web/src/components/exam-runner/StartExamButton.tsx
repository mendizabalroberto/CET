"use client";

/**
 * El botón que arranca el cronómetro.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ES UN BOTÓN, NO UN ENLACE, y la diferencia importa: pulsarlo tiene un efecto
 * irreversible en el servidor — se crea el intento y `server_deadline_at` queda
 * escrito. Un enlace se pulsa por accidente, se abre en otra pestaña con el
 * botón central y lo precarga el navegador. Nada de eso puede arrancar el reloj
 * de un examen.
 *
 * El texto cambia según haya intento en curso ("Empezar" / "Seguir") porque un
 * niño que vuelve tras una caída de red necesita saber, ANTES de pulsar, que no
 * está empezando de cero.
 *
 * Si `/start` falla, el mensaje dice lo primero que hay que decir: no se ha
 * gastado un intento. Es exactamente lo que el niño teme.
 */
import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@cet/shared";
import { Alert, Button, LocaleProvider } from "@cet/ui";

import { useTelemetry } from "@/lib/telemetry/provider";

import { startAttempt } from "./api";
import { getExamDictionary } from "./dictionary";
import { ApiError } from "./types";

export interface StartExamButtonProps {
  readonly assignmentId: string;
  readonly locale: Locale;
  readonly runHref: string;
  readonly resultHref: string;
  /** Ya hay un intento `in_progress`: el botón dice "seguir", no "empezar". */
  readonly resuming: boolean;
}

export function StartExamButton({
  assignmentId,
  locale,
  runHref,
  resultHref,
  resuming,
}: StartExamButtonProps): ReactNode {
  const t = getExamDictionary(locale);
  const router = useRouter();
  const { track, flush } = useTelemetry();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const onStart = useCallback(async () => {
    // Un doble clic aquí no puede crear dos intentos: `/start` es idempotente
    // por contrato. El guardia local es cortesía, no la garantía.
    if (busy) return;
    setBusy(true);
    setFailed(false);

    try {
      const started = await startAttempt(assignmentId);
      track({
        eventType: started.resumed ? "attempt_resumed" : "attempt_started",
        attemptId: started.attemptId,
        payload: { from: "lobby", itemCount: started.items.length },
      });
      // El evento se manda ANTES de navegar: al desmontar el provider la cola
      // se vacía con beacon, pero forzarlo aquí evita depender de ese camino.
      flush();
      router.push(runHref);
    } catch (error) {
      if (error instanceof ApiError && error.kind === "already_submitted") {
        router.push(resultHref);
        return;
      }
      setBusy(false);
      setFailed(true);
    }
  }, [assignmentId, busy, flush, resultHref, router, runHref, track]);

  return (
    <LocaleProvider locale={locale}>
      <div className="flex flex-col gap-4">
        {failed ? (
          <Alert tone="danger" title={{ en: t.lobby.startError, es: t.lobby.startError }} toneLabel={{ en: "Error", es: "Error" }}>
            {t.lobby.startErrorBody}
          </Alert>
        ) : null}
        <Button size="lg" variant="primary" onClick={() => void onStart()} loading={busy} icon="empezar">
          {busy ? t.lobby.starting : resuming ? t.lobby.resume : t.lobby.start}
        </Button>
      </div>
    </LocaleProvider>
  );
}
