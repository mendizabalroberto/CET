"use client";

/**
 * El examen. La pieza central del módulo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * PRINCIPIOS DE ESTA PANTALLA
 *
 * 1. **Sobria.** Nada se mueve, nada parpadea, nada compite con la pregunta.
 *    Un examen cronometrado no es el sitio de una animación bonita: cada
 *    elemento que llama la atención es atención que no está en el enunciado.
 *
 * 2. **El servidor manda (AD-5).** El cronómetro solo MUESTRA. Al llegar a cero
 *    pide al servidor que cierre el intento; no calcula nada, no decide nada, y
 *    si el reloj del alumno va adelantado el servidor dirá que no. Aquí no hay
 *    ni una respuesta correcta, ni una semilla, ni una nota.
 *
 * 3. **No se pierde nada.** Toda respuesta pasa por la cola de autoguardado,
 *    que persiste en disco y reintenta. Recargar, quedarse sin red dos minutos
 *    o cerrar la tableta devuelve al alumno exactamente donde estaba.
 *
 * 4. **Ningún camino acaba en pantalla blanca.** Cero preguntas, 500 del
 *    servidor, sesión caída, deadline pasado: los cuatro tienen su mensaje, en
 *    lenguaje de un niño de once años, y todos dicen lo mismo primero —
 *    no es culpa tuya y no has perdido nada.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Locale, StudentResponse } from "@cet/shared";
import {
  Alert,
  AutosaveIndicator,
  Button,
  ErrorState,
  ExamTimer,
  LocaleProvider,
  QuestionCard,
  QuestionNavigator,
  SubmitDialog,
  type AutosaveState,
  type NavigatorEntry,
} from "@cet/ui";

import { useTelemetry } from "@/lib/telemetry/provider";

import { AnswerInput } from "./AnswerInput";
import { AutosaveQueue, browserStorage, type PendingAnswer } from "./autosave";
import { clientClockSkewMs, NOTABLE_SKEW_MS } from "./clock";
import { fmt, getExamDictionary } from "./dictionary";
import { TabLeadership, type LeadershipRole } from "./leadership";
import { recoverResponses } from "./recovery";
import { isAnswered, responsesEqual, unansweredOrdinals } from "./responses";
import { saveAnswer, startAttempt, submitAttempt } from "./api";
import { SubmitGuard } from "./submit-guard";
import { ApiError, type AttemptItemStudent, type StartAttemptResponse, type SubmitReason } from "./types";

/** Sin interacción durante este tiempo, se cuenta como distraído. */
const IDLE_AFTER_MS = 60_000;
const SOUND_PREF_KEY = "cet.exam.sound";

type Phase = "loading" | "ready" | "empty" | "error" | "blocked" | "submitted";

export interface ExamRunnerProps {
  readonly assignmentId: string;
  readonly locale: Locale;
  /** A dónde ir tras entregar. Lo construye el server component. */
  readonly resultHref: string;
}

export function ExamRunner({ assignmentId, locale, resultHref }: ExamRunnerProps): ReactNode {
  const t = getExamDictionary(locale);
  const router = useRouter();
  const { track } = useTelemetry();

  const [phase, setPhase] = useState<Phase>("loading");
  const [attempt, setAttempt] = useState<StartAttemptResponse | null>(null);
  const [responses, setResponses] = useState<Record<string, StudentResponse>>({});
  const [current, setCurrent] = useState(1);
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(new Set());
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [role, setRole] = useState<LeadershipRole>("leader");
  const [warning, setWarning] = useState<"warn" | "urgent" | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /**
   * Cómo falló la entrega, no solo si falló. `timeout` (la red aceptó y no
   * contestó) y `error` piden mensajes distintos: en el primero **no sabemos**
   * si la entrega llegó, y decirle a un niño «no hemos podido entregar» sería
   * afirmar algo que no consta.
   */
  const [submitFailed, setSubmitFailed] = useState<"timeout" | "error" | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [blockedKind, setBlockedKind] = useState<"unavailable" | "not_found" | "not_ready" | null>(null);

  const queueRef = useRef<AutosaveQueue | null>(null);
  const leadershipRef = useRef<TabLeadership | null>(null);
  /**
   * El id del intento y la función de entrega viven en refs porque los usan
   * closures creadas en el efecto de arranque, que solo corre UNA vez. Sin
   * esto, la cola de autoguardado llamaría eternamente a la versión de
   * `doSubmit` del primer render — la que todavía no conocía el intento — y un
   * 409 por deadline vencido no entregaría nada.
   */
  const attemptIdRef = useRef<string | null>(null);
  const doSubmitRef = useRef<((reason: SubmitReason) => Promise<void>) | null>(null);
  const noteActivityRef = useRef<(() => void) | null>(null);
  /**
   * Cerrojo del doble submit (ver `submit-guard.ts`). La capa que de verdad
   * cuenta es el `FOR UPDATE` del servidor; esta evita mandar dos peticiones.
   */
  const guardRef = useRef<SubmitGuard>(new SubmitGuard());
  const itemEnteredAtRef = useRef<number>(Date.now());
  const changeCountRef = useRef<Record<string, number>>({});
  const visitedRef = useRef<ReadonlySet<number>>(new Set([1]));
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleSinceRef = useRef<number | null>(null);
  const blurredAtRef = useRef<number | null>(null);
  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  // `useMemo` y no `attempt?.items ?? []` a secas: el `[]` del fallback es un
  // array NUEVO en cada render, asi que todo hook que dependa de `items` se
  // reejecutaba en cada pintado. En la pantalla del examen eso significa
  // recrear el autosave y recalcular la navegacion mientras el alumno teclea,
  // con el cronometro corriendo.
  const items = useMemo<readonly AttemptItemStudent[]>(() => attempt?.items ?? [], [attempt]);
  const total = items.length;
  const currentItem: AttemptItemStudent | undefined = items[current - 1];
  const allowBack = attempt?.allowBack ?? true;
  const readOnly = role === "follower" || timeUp || submitting || phase === "submitted";

  /* ------------------------------------------------------------------ */
  /* Arranque y recuperación                                            */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const started = await startAttempt(assignmentId, { signal: controller.signal });
        if (cancelled) return;

        if (started.items.length === 0) {
          // Fallo del servidor al materializar. No se enseña una pantalla vacía
          // ni un spinner eterno: se dice lo que pasa y que no cuenta en contra.
          setAttempt(started);
          setPhase("empty");
          return;
        }

        const storage = browserStorage();
        const queue = new AutosaveQueue(started.attemptId, {
          send: async (pending: PendingAnswer) => {
            const accepted = await saveAnswer(started.attemptId, {
              attemptItemId: pending.attemptItemId,
              response: pending.response,
              clientTs: pending.clientTs,
              timeOnItemMs: pending.timeOnItemMs,
            });
            // Cada autoguardado trae el reloj del SERVIDOR. Es el heartbeat que
            // pide el contrato del módulo: reajustar aquí corrige cualquier
            // deriva acumulada a lo largo de veinticinco minutos, y lo hace con
            // datos del servidor, nunca con el reloj del alumno.
            const clock = accepted.clock;
            if (clock) {
              setAttempt((prev) =>
                prev === null ||
                (prev.serverNow === clock.serverNow && prev.serverDeadlineAt === clock.serverDeadlineAt)
                  ? prev
                  : { ...prev, serverNow: clock.serverNow, serverDeadlineAt: clock.serverDeadlineAt },
              );
            }
            track({
              eventType: "attempt_autosaved",
              attemptId: started.attemptId,
              attemptItemId: pending.attemptItemId,
              payload: { revision: accepted.revision },
            });
            return { revision: accepted.revision };
          },
          onStateChange: (next, saved) => {
            setAutosaveState(next);
            setLastSavedAt(saved);
          },
          onDeadlinePassed: () => {
            // El servidor ha rechazado la respuesta por tardía. Es él quien
            // manda: se cierra el examen y se entrega lo que haya.
            setTimeUp(true);
            void doSubmitRef.current?.("timer");
          },
          storage,
        });

        // La cola local puede traer respuestas de una sesión anterior que nunca
        // llegaron al servidor. El merge las devuelve a la pantalla.
        const recovered = recoverResponses(started.items, queue.snapshot());

        queueRef.current = queue;
        queue.start();

        const leadership = new TabLeadership(started.attemptId, newTabId(), {
          onRoleChange: setRole,
        });
        leadershipRef.current = leadership;
        leadership.start();

        attemptIdRef.current = started.attemptId;
        setAttempt(started);
        setResponses(recovered.responses);
        setPhase("ready");

        // Se retoma en la primera pregunta sin responder: volver siempre a la 1
        // después de una caída obliga a un niño a recorrer diez preguntas ya
        // hechas con el reloj corriendo.
        const firstPending = started.items.find((item) => !isAnswered(recovered.responses[item.id]));
        const startOrd = firstPending?.ord ?? 1;
        setCurrent(startOrd);
        visitedRef.current = new Set([startOrd]);
        itemEnteredAtRef.current = Date.now();

        track({
          eventType: started.resumed || recovered.restoredFromServer > 0 ? "attempt_resumed" : "attempt_started",
          attemptId: started.attemptId,
          payload: {
            itemCount: started.items.length,
            restoredFromServer: recovered.restoredFromServer,
            unsentRecovered: recovered.unsentItemIds.length,
            allowBack: started.allowBack,
          },
        });

        // El desfase del reloj del alumno es un DATO, no una decisión. No se usa
        // para nada que puntúe; se registra porque explica después por qué un
        // `client_ts` parece del futuro, y porque un desfase enorme es señal.
        const skew = clientClockSkewMs(started.serverNow, Date.now());
        if (Math.abs(skew) > NOTABLE_SKEW_MS) {
          track({ eventType: "attempt_started", attemptId: started.attemptId, payload: { clockSkewMs: skew } });
        }

        const shown = started.items.find((item) => item.ord === startOrd);
        if (shown) {
          track({
            eventType: "question_shown",
            attemptId: started.attemptId,
            attemptItemId: shown.id,
            payload: { ord: shown.ord },
          });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError) {
          // Ya entregado: no hay examen que abrir, hay un resultado que enseñar.
          if (error.kind === "already_submitted") {
            router.replace(resultHref);
            return;
          }
          // Ventana cerrada, sin intentos, o el examen no se pudo preparar:
          // son estados del examen, no averías. La antesala ya sabe explicarlos
          // con su propio texto, así que se vuelve allí en vez de enseñar aquí
          // un error genérico que no dice nada.
          if (error.kind === "unavailable" || error.kind === "not_found" || error.kind === "not_ready") {
            setBlockedKind(error.kind);
            setPhase("blocked");
            return;
          }
        }
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      // `dispose` y no `stop`: si el alumno navega fuera con una respuesta sin
      // enviar, se manda ahora (con `keepalive`) en vez de dejarla esperando en
      // disco hasta que vuelva a entrar.
      queueRef.current?.dispose();
      leadershipRef.current?.dispose();
    };
    // Se monta una sola vez por intento. `doSubmit` y `track` son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  /* ------------------------------------------------------------------ */
  /* Preferencia de sonido                                              */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    try {
      setSoundOn(window.localStorage.getItem(SOUND_PREF_KEY) === "1");
    } catch {
      // Almacenamiento bloqueado: se queda en silencio, que es el defecto.
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      try {
        window.localStorage.setItem(SOUND_PREF_KEY, next ? "1" : "0");
      } catch {
        /* sin persistencia; la sesión actual respeta la elección igualmente */
      }
      return next;
    });
  }, []);

  /* ------------------------------------------------------------------ */
  /* Entrega                                                            */
  /* ------------------------------------------------------------------ */

  const doSubmit = useCallback(
    async (reason: SubmitReason): Promise<void> => {
      const id = attemptIdRef.current;
      if (!id) return;
      if (guardRef.current.busy) return;

      setSubmitting(true);
      setSubmitFailed(null);

      try {
        await guardRef.current.run(async () => {
          // Primero se vacía la cola: entregar con una respuesta sin enviar la
          // perdería para siempre, y sería justo la última que escribió —
          // `clearPersisted()`, unas líneas más abajo, la borra del disco.
          // `hastaVaciar` es obligatorio aquí: un `flush()` a secas manda solo
          // la foto que había al empezar el ciclo en curso.
          await queueRef.current?.flush({ hastaVaciar: true });
          await submitAttempt(id, reason);
        });

        queueRef.current?.clearPersisted();
        queueRef.current?.stop();
        track({ eventType: "attempt_submitted", attemptId: id, payload: { reason } });
        setPhase("submitted");
        router.replace(resultHref);
      } catch (error) {
        if (error instanceof ApiError && error.kind === "already_submitted") {
          // Segundo clic, o la otra pestaña se adelantó. No es un error: es lo
          // que devuelve un submit idempotente, y el resultado ya existe.
          guardRef.current.markCompleted();
          queueRef.current?.clearPersisted();
          setPhase("submitted");
          router.replace(resultHref);
          return;
        }
        // Falló de verdad. El cerrojo ya se ha reabierto solo para que pueda
        // reintentar: un botón muerto con el examen sin entregar es el peor
        // final posible de esta pantalla.
        //
        // SE CIERRA EL DIÁLOGO. El aviso se pinta en la página, y detrás de un
        // diálogo modal el alumno no lo ve: se quedaría mirando dos botones
        // vivos que no explican nada. El `SubmitDialog` no admite un mensaje
        // dentro (vive en `@cet/ui` y es de otra vía), así que se le devuelve
        // al examen, donde el aviso y el botón de reintentar están juntos.
        setSubmitOpen(false);
        setSubmitting(false);
        setSubmitFailed(error instanceof ApiError && error.kind === "timeout" ? "timeout" : "error");
        return;
      }
    },
    [resultHref, router, track],
  );
  doSubmitRef.current = doSubmit;

  /* ------------------------------------------------------------------ */
  /* Respuestas                                                         */
  /* ------------------------------------------------------------------ */

  const handleChange = useCallback(
    (item: AttemptItemStudent, next: StudentResponse) => {
      if (readOnly) return;
      const previous = responsesRef.current[item.id];
      // Un cambio que no cambia nada NO se envía: si no, cada clic en un radio
      // ya marcado crearía una revisión y el forense contaría cambios de
      // opinión que nunca ocurrieron.
      if (responsesEqual(previous, next)) return;

      const count = (changeCountRef.current[item.id] ?? 0) + 1;
      changeCountRef.current[item.id] = count;
      const timeOnItemMs = Math.max(0, Date.now() - itemEnteredAtRef.current);

      setResponses((prev) => ({ ...prev, [item.id]: next }));
      noteActivityRef.current?.();

      queueRef.current?.queue({
        attemptItemId: item.id,
        response: next,
        clientTs: new Date().toISOString(),
        timeOnItemMs,
      });

      track({
        eventType: "answer_changed",
        attemptId: attemptIdRef.current ?? "",
        attemptItemId: item.id,
        // `revision: 0` porque el número REAL lo asigna el servidor y el cliente
        // no lo sabe todavía. `attempt_autosaved` lleva el bueno.
        payload: { changeCount: count, timeOnItemMs, revision: 0 },
      });
    },
    [readOnly, track],
  );

  const goTo = useCallback(
    (ordinal: number) => {
      if (ordinal === current || ordinal < 1 || ordinal > total) return;
      if (!allowBack && ordinal < current) return;

      const leaving = items[current - 1];
      const arriving = items[ordinal - 1];
      const dwell = Math.max(0, Date.now() - itemEnteredAtRef.current);

      if (leaving && !isAnswered(responsesRef.current[leaving.id])) {
        track({
          eventType: "question_skipped",
          attemptId: attemptIdRef.current ?? "",
          attemptItemId: leaving.id,
          payload: { ord: leaving.ord, timeOnItemMs: dwell },
        });
      }

      // Cambiar de pregunta fuerza el envío: es el momento natural en que el
      // alumno ha terminado de pensar, y esperar 800 ms más no aporta nada.
      void queueRef.current?.flush();

      if (arriving) {
        const revisited = visitedRef.current.has(ordinal);
        visitedRef.current = new Set([...visitedRef.current, ordinal]);
        track({
          eventType: revisited ? "question_revisited" : "question_shown",
          attemptId: attemptIdRef.current ?? "",
          attemptItemId: arriving.id,
          payload: { ord: arriving.ord, ...(arriving.difficulty !== null ? { difficulty: arriving.difficulty } : {}) },
        });
      }

      itemEnteredAtRef.current = Date.now();
      setCurrent(ordinal);
      noteActivityRef.current?.();
    },
    [allowBack, current, items, total, track],
  );

  const toggleFlag = useCallback((itemId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  /* ------------------------------------------------------------------ */
  /* Atención: foco e inactividad                                       */
  /* ------------------------------------------------------------------ */

  const noteActivity = useCallback(() => {
    if (idleSinceRef.current !== null) {
      track({
        eventType: "idle_end",
        attemptId: attemptIdRef.current ?? "",
        payload: { idleMs: Math.max(0, Date.now() - idleSinceRef.current) },
      });
      idleSinceRef.current = null;
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleSinceRef.current = Date.now();
      track({ eventType: "idle_start", attemptId: attemptIdRef.current ?? "", payload: {} });
    }, IDLE_AFTER_MS);
  }, [track]);
  noteActivityRef.current = noteActivity;

  useEffect(() => {
    if (phase !== "ready") return;
    noteActivity();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [phase, noteActivity]);

  useEffect(() => {
    if (phase !== "ready" || !attempt) return;

    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        blurredAtRef.current = Date.now();
        track({ eventType: "focus_lost", attemptId: attempt.attemptId, payload: {} });
        // Al ocultarse la pestaña se fuerza el envío: en una tableta, "oculta"
        // es a menudo el paso previo a "descartada por el sistema".
        void queueRef.current?.flush();
        return;
      }
      const away = blurredAtRef.current === null ? 0 : Math.max(0, Date.now() - blurredAtRef.current);
      blurredAtRef.current = null;
      track({ eventType: "focus_gained", attemptId: attempt.attemptId, payload: { awayMs: away } });
      // Al volver también se intenta: puede que la red haya vuelto con nosotros.
      void queueRef.current?.flush();
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase, attempt, track]);

  /* ------------------------------------------------------------------ */
  /* Aviso al salir con respuestas sin guardar                          */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (phase !== "ready") return;

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      // Solo se avisa si de verdad hay algo sin enviar. Un aviso que salta
      // siempre se ignora siempre, y entonces no avisa de nada.
      if (!queueRef.current?.hasPending) return;
      event.preventDefault();
      // Los navegadores modernos ignoran el texto y enseñan el suyo; se asigna
      // igualmente por los que aún lo respetan.
      event.returnValue = t.run.leaveWarning;
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [phase, t.run.leaveWarning]);

  /* ------------------------------------------------------------------ */
  /* Avisos de tiempo                                                   */
  /* ------------------------------------------------------------------ */

  const onWarning = useCallback(
    (which: "warn" | "urgent") => {
      setWarning(which);
      if (soundOn) playChime(which);
    },
    [soundOn],
  );

  const onExpired = useCallback(() => {
    // El cronómetro NO entrega el examen: pide al servidor que lo cierre. Si el
    // reloj del alumno iba adelantado, el servidor dirá que todavía no toca.
    setTimeUp(true);
    void doSubmit("timer");
  }, [doSubmit]);

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  const navigatorEntries = useMemo<NavigatorEntry[]>(
    () =>
      items.map((item) => ({
        ordinal: item.ord,
        state: flagged.has(item.id) ? "flagged" : isAnswered(responses[item.id]) ? "answered" : "unanswered",
      })),
    [items, responses, flagged],
  );

  const unanswered = useMemo(() => unansweredOrdinals(items, responses), [items, responses]);
  const answeredCount = total - unanswered.length;

  if (phase === "loading") {
    return (
      <p className="py-16 text-center text-muted" role="status" aria-live="polite">
        {t.lobby.starting}
      </p>
    );
  }

  if (phase === "blocked") {
    return (
      <ErrorState
        title={{
          en: blockedKind === "not_ready" ? t.run.emptyItemsTitle : t.lobby.closedTitle,
          es: blockedKind === "not_ready" ? t.run.emptyItemsTitle : t.lobby.closedTitle,
        }}
        body={{
          en: blockedKind === "not_ready" ? t.run.emptyItemsBody : t.lobby.closedBody,
          es: blockedKind === "not_ready" ? t.run.emptyItemsBody : t.lobby.closedBody,
        }}
      />
    );
  }

  if (phase === "error") {
    return (
      <ErrorState
        title={{ en: t.run.loadErrorTitle, es: t.run.loadErrorTitle }}
        body={{ en: t.run.loadErrorBody, es: t.run.loadErrorBody }}
        onRetry={() => router.refresh()}
        retryLabel={{ en: t.list.retry, es: t.list.retry }}
      />
    );
  }

  if (phase === "empty") {
    return (
      <ErrorState
        title={{ en: t.run.emptyItemsTitle, es: t.run.emptyItemsTitle }}
        body={{ en: t.run.emptyItemsBody, es: t.run.emptyItemsBody }}
      />
    );
  }

  if (!attempt || !currentItem) {
    return (
      <ErrorState
        title={{ en: t.run.loadErrorTitle, es: t.run.loadErrorTitle }}
        body={{ en: t.run.loadErrorBody, es: t.run.loadErrorBody }}
        onRetry={() => router.refresh()}
        retryLabel={{ en: t.list.retry, es: t.list.retry }}
      />
    );
  }

  return (
    <LocaleProvider locale={locale}>
      <div className="flex flex-col gap-5">
        {/* Barra de estado. Sin animación: solo el reloj cambia, y cambia despacio. */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
          <ExamTimer
            serverDeadlineAt={attempt.serverDeadlineAt}
            serverNowAt={attempt.serverNow}
            onWarning={onWarning}
            onExpired={onExpired}
            label={{ en: t.a11y.timerLabel, es: t.a11y.timerLabel }}
          />
          <span className="text-sm text-muted">
            {fmt(t.run.progress, { answered: answeredCount, total })}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <AutosaveIndicator state={autosaveState} lastSavedAt={lastSavedAt ?? undefined} />
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={soundOn}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink"
            >
              {soundOn ? t.run.soundOn : t.run.soundOff}
            </button>
          </div>
        </div>

        {role === "follower" ? (
          <Alert tone="info" title={{ en: t.run.lockedTitle, es: t.run.lockedTitle }}>
            <p>{t.run.lockedBody}</p>
            <p className="mt-3">
              <Button variant="secondary" onClick={() => leadershipRef.current?.claim()}>
                {t.run.takeOver}
              </Button>
            </p>
          </Alert>
        ) : null}

        {timeUp && submitFailed !== null ? (
          /* Se acabó el tiempo Y la entrega no ha llegado. El mensaje normal de
             «estamos entregando tu examen» aquí sería mentira: no consta que se
             entregara. Se dice lo que sí sabemos y se deja el botón vivo. */
          <Alert
            tone="warning"
            title={{ en: t.run.expiredPendingTitle, es: t.run.expiredPendingTitle }}
            toneLabel={{ en: t.run.expiredPendingTitle, es: t.run.expiredPendingTitle }}
          >
            {t.run.expiredPendingBody}
          </Alert>
        ) : timeUp ? (
          <Alert
            tone="warning"
            title={{ en: t.run.expiredTitle, es: t.run.expiredTitle }}
            toneLabel={{ en: t.run.expiredTitle, es: t.run.expiredTitle }}
          >
            {t.run.expiredBody}
          </Alert>
        ) : warning !== null ? (
          /* Tono `info`, no `warning`. Que queden cinco minutos no es un aviso
             de peligro: es información. El rojo, el ámbar y los iconos de alarma
             sobre un niño de once años que va justo de tiempo no le hacen ir más
             rápido, le hacen bloquearse. */
          <Alert tone="info">{warning === "urgent" ? t.run.warn1 : t.run.warn5}</Alert>
        ) : null}

        {autosaveState === "timeout" ? (
          /* La red contesta que sí y luego no contesta. Distinto de no tener
             red, y por eso distinto mensaje: no se afirma lo que no consta. */
          <Alert tone="info" title={{ en: t.run.saveTimeoutTitle, es: t.run.saveTimeoutTitle }}>
            {t.run.saveTimeoutBody}
          </Alert>
        ) : autosaveState === "offline" || autosaveState === "retrying" ? (
          /* Sin conexión NO es un error, y por eso no es `danger`: el trabajo
             del alumno está a salvo y lo único que hace falta es que siga
             respondiendo. */
          <Alert tone="info" title={{ en: t.run.saveErrorTitle, es: t.run.saveErrorTitle }}>
            {t.run.saveErrorBody}
          </Alert>
        ) : null}

        {submitFailed !== null && !timeUp ? (
          /* `timeout` no es `error`: la petición pudo llegar al servidor y estar
             procesándose. Se le cuenta lo que sabemos —que sus respuestas están
             en el aparato— y no lo que no sabemos. */
          submitFailed === "timeout" ? (
            <Alert
              tone="warning"
              title={{ en: t.run.submitTimeoutTitle, es: t.run.submitTimeoutTitle }}
              toneLabel={{ en: t.run.submitTimeoutTitle, es: t.run.submitTimeoutTitle }}
            >
              {t.run.submitTimeoutBody}
            </Alert>
          ) : (
            <Alert
              tone="danger"
              title={{ en: t.run.submitErrorTitle, es: t.run.submitErrorTitle }}
              toneLabel={{ en: t.run.submitErrorTitle, es: t.run.submitErrorTitle }}
            >
              {t.run.submitErrorBody}
            </Alert>
          )
        ) : null}

        {allowBack ? (
          <QuestionNavigator
            entries={navigatorEntries}
            current={current}
            onNavigate={goTo}
            label={{ en: t.a11y.navigatorLabel, es: t.a11y.navigatorLabel }}
          />
        ) : (
          <p className="text-sm text-muted">{t.run.noBackNotice}</p>
        )}

        <QuestionCard
          body={currentItem.renderedBody}
          ordinal={current}
          total={total}
          maxPoints={currentItem.maxPoints}
          flagged={flagged.has(currentItem.id)}
          onToggleFlag={() => toggleFlag(currentItem.id)}
          mode="exam"
        >
          <AnswerInput
            item={currentItem}
            value={responses[currentItem.id] ?? { type: "empty" }}
            onChange={(next) => handleChange(currentItem, next)}
            disabled={readOnly}
            answerLabel={t.run.yourAnswer}
          />
        </QuestionCard>

        <div className="flex flex-wrap items-center gap-3" data-cet-surface="exam">
          {allowBack ? (
            <Button
              variant="secondary"
              onClick={() => goTo(current - 1)}
              disabled={current <= 1}
              icon="anterior"
              data-cet-id="examen.anterior"
            >
              {t.run.previous}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => goTo(current + 1)}
            disabled={current >= total}
            icon="siguiente"
            data-cet-id="examen.siguiente"
          >
            {t.run.next}
          </Button>
          <Button
            variant="primary"
            className="ml-auto"
            /* Con el tiempo agotado y la entrega sin llegar, el diálogo de
               confirmación sobra: ya confirmó, y volver a preguntarle «¿seguro?»
               a un niño cuyo reloj ya está en cero es cruel y no aporta nada. */
            onClick={() => (timeUp && submitFailed !== null ? void doSubmit("timer") : setSubmitOpen(true))}
            /* NUNCA deshabilitado sin salida. `timeUp` lo apagaba para siempre
               en cuanto el cronómetro llegaba a cero, y si la entrega se había
               colgado el alumno se quedaba sin ninguna forma de entregar. Ahora
               solo se apaga mientras hay una entrega de verdad en vuelo. */
            disabled={submitting || (timeUp && submitFailed === null)}
            /* El icono sigue al texto: entregar es un envio, reintentar es una
               vuelta atras. Un mismo dibujo para los dos le diria al alumno que
               no ha pasado nada cuando si ha pasado. */
            icon={timeUp && submitFailed !== null ? "reintentar" : "entregar"}
            // Entregar y reintentar-la-entrega son dos actos con significados
            // opuestos para el analisis: el segundo solo existe cuando algo ha
            // fallado. Bajo un mismo id, las entregas fallidas quedarian
            // contadas como entregas normales.
            data-cet-id={timeUp && submitFailed !== null ? "examen.reintentar" : "examen.entregar"}
          >
            {submitting
              ? t.run.submitting
              : timeUp && submitFailed !== null
                ? t.run.submitRetry
                : t.run.submit}
          </Button>
        </div>

        <SubmitDialog
          open={submitOpen}
          onOpenChange={setSubmitOpen}
          unanswered={unanswered}
          submitting={submitting}
          onSubmit={() => void doSubmit("student")}
          onReview={(ordinal) => {
            setSubmitOpen(false);
            if (ordinal !== undefined) goTo(ordinal);
          }}
        />
      </div>
    </LocaleProvider>
  );
}

/**
 * Identificador de esta pestaña.
 *
 * `crypto.randomUUID` no existe en contextos NO seguros (un `http://` de la red
 * del colegio), y ahí una excepción impediría entrar al examen. El respaldo no
 * necesita ser un UUID: solo tiene que ser distinto del de la otra pestaña.
 */
function newTabId(): string {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Aviso sonoro, opcional y apagado por defecto.
 *
 * Una onda sinusoidal corta y suave generada con WebAudio: sin fichero externo
 * (la CSP no lo permitiría), sin sobresalto. A 660 Hz y 180 ms es un "ding" de
 * ascensor, no una alarma. Si WebAudio no está disponible, no pasa nada: el
 * aviso visual ya está en pantalla y era el importante.
 */
function playChime(which: "warn" | "urgent"): void {
  try {
    const Ctor = window.AudioContext;
    if (typeof Ctor !== "function") return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = which === "urgent" ? 560 : 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => void ctx.close();
  } catch {
    // Sin audio. El aviso visual ya está en pantalla.
  }
}
