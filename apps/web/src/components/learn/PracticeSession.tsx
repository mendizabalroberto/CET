"use client";

/**
 * El bucle de práctica. Puerto directo del `PRACTICE ENGINE` de
 * `Y6A/Math/Grade 5 Maths Exam Trainer.html` (~línea 905).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ SE CONSERVA DE Y6A Y QUÉ CAMBIA
 * ===========================================================================
 * Se conserva el bucle, que es lo que enganchaba: chip de tema -> pregunta ->
 * escribir -> Comprobar -> saber al instante -> "Siguiente pregunta" en el mismo
 * botón, con la racha, los aciertos y la barra subiendo a la vista.
 *
 * Cambia lo que estaba roto por debajo:
 *  - `var P={...}` global pasa a ser una máquina pura y probada
 *    (`practice-machine.ts`).
 *  - `GEN[kind]()` con `Math.random` pasa a `@cet/engine` con SEMILLA explícita,
 *    así que cada pregunta es reproducible (principio rector del MASTER_PLAN).
 *  - `innerHTML=` en crudo pasa por los componentes de `@cet/ui`, que sanean.
 *  - Cero persistencia pasa a telemetría en lote, tolerante a red caída (AD-5).
 *
 * ===========================================================================
 * AD-5: TODO ESTO CORRE EN EL CLIENTE
 * ===========================================================================
 * No hay ni un `fetch` en el camino crítico. Generar, corregir y pintar el
 * feedback son llamadas síncronas: con la red caída el bucle sigue funcionando
 * exactamente igual y los eventos se acumulan en la cola hasta que vuelva.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { resolveI18n, type Locale } from "@cet/shared";
import {
  Button,
  CorrectFeedback,
  ErrorState,
  HintPanel,
  IncorrectFeedback,
  LiveRegion,
  MathStem,
  NumericInput,
  ProgressBar,
  SafeSvg,
  Skeleton,
  SolutionPanel,
  StatTile,
  StreakMeter,
} from "@cet/ui";

import { useTelemetry } from "@/lib/telemetry/provider";

import { getLearnDictionary, learnI18n, learnI18nWith } from "./dictionary";
import {
  accuracyPercent,
  initialPracticeState,
  practiceReducer,
  type PracticeAction,
  type PracticeState,
  type PracticeTally,
} from "./practice-machine";
import {
  generatePracticeItem,
  newPracticeSeed,
  practiceTopics,
  type PracticeTopic,
} from "./practice-topics";

/** Sin interacción durante este tiempo, el alumno se ha ido. */
const IDLE_AFTER_MS = 30_000;

/**
 * `answer_changed` NO se emite por pulsación. Un niño escribiendo "1 3/4" son
 * cinco eventos, y treinta tabletas a la vez saturarían la red del colegio con
 * ruido: el dato que importa (la respuesta final y cuántas veces la cambió) va
 * completo en `answer_submitted`.
 */
const ANSWER_CHANGE_EVENT_THROTTLE_MS = 750;

/** Dónde sobrevive el marcador al cambiar de tema. */
const TALLY_KEY = "cet:practice:tally";

function readTally(): PracticeTally | null {
  try {
    const raw = sessionStorage.getItem(TALLY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const t = parsed as Record<string, unknown>;
    const nums = [t.asked, t.correct, t.streak, t.bestStreak];
    if (!nums.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
    return {
      asked: t.asked as number,
      correct: t.correct as number,
      streak: t.streak as number,
      bestStreak: t.bestStreak as number,
    };
  } catch {
    // sessionStorage bloqueado (modo privado, política del colegio). El bucle
    // funciona igual: solo se pierde el marcador al cambiar de tema.
    return null;
  }
}

function writeTally(tally: PracticeTally): void {
  try {
    sessionStorage.setItem(TALLY_KEY, JSON.stringify(tally));
  } catch {
    /* ver readTally */
  }
}

export interface PracticeSessionProps {
  readonly topicId: string;
  readonly locale: Locale;
}

export function PracticeSession({ topicId, locale }: PracticeSessionProps) {
  const dictionary = getLearnDictionary(locale);
  const t = dictionary.practice;
  const { track } = useTelemetry();

  const topics = useMemo(() => practiceTopics(dictionary), [dictionary]);
  const topic = useMemo<PracticeTopic | undefined>(
    () => topics.find((candidate) => candidate.id === topicId),
    [topics, topicId],
  );

  const [state, setState] = useState<PracticeState>(() => initialPracticeState(topicId));
  const [engineFailed, setEngineFailed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [live, setLive] = useState("");

  // El estado se lleva también en una ref porque `dispatch` se llama desde
  // manejadores y temporizadores que capturarían una versión vieja del closure.
  const stateRef = useRef(state);
  const ordRef = useRef(0);
  const answerRef = useRef<HTMLInputElement | null>(null);
  const actionRef = useRef<HTMLButtonElement | null>(null);
  // Ata los controles de respuesta al enunciado para el lector de pantalla.
  const stemId = `${useId()}-stem`;

  const lastChangeEventAt = useRef(0);

  const dispatch = useCallback(
    (action: PracticeAction) => {
      const { state: next, effects } = practiceReducer(stateRef.current, action);
      stateRef.current = next;
      setState(next);
      for (const effect of effects) {
        if (effect.eventType === "answer_changed") {
          const now = Date.now();
          if (now - lastChangeEventAt.current < ANSWER_CHANGE_EVENT_THROTTLE_MS) continue;
          lastChangeEventAt.current = now;
        }
        track({ eventType: effect.eventType, payload: effect.payload });
      }
    },
    [track],
  );

  /* ---------------------------------------------------------------------- */
  /* Generación                                                              */
  /* ---------------------------------------------------------------------- */

  const nextQuestion = useCallback(() => {
    if (!topic) return;
    const seed = newPracticeSeed();
    try {
      const { engineKey, item } = generatePracticeItem(topic, seed, locale);
      ordRef.current += 1;
      setEngineFailed(false);
      dispatch({
        type: "question_shown",
        question: { ord: ordRef.current, seed, engineKey, item },
        now: Date.now(),
      });
      setLive(fill(t.liveQuestion, { ord: ordRef.current }));
    } catch {
      // Un generador que revienta no puede dejar al alumno mirando una pantalla
      // muerta. Se le ofrece cambiar de tema; el detalle técnico no se le enseña.
      setEngineFailed(true);
    }
  }, [topic, locale, dispatch, t.liveQuestion]);

  const started = useRef(false);
  useEffect(() => {
    if (!topic || started.current) return;
    started.current = true;
    // Se restaura ANTES de la primera pregunta para que la racha ya esté en
    // pantalla cuando aparezca el enunciado, sin un parpadeo de "0".
    const tally = readTally();
    if (tally) dispatch({ type: "restore", tally });
    dispatch({ type: "start", now: Date.now() });
    nextQuestion();
  }, [topic, dispatch, nextQuestion]);

  useEffect(() => {
    if (state.asked === 0 && state.streak === 0) return;
    writeTally({
      asked: state.asked,
      correct: state.correct,
      streak: state.streak,
      bestStreak: state.bestStreak,
    });
  }, [state.asked, state.correct, state.streak, state.bestStreak]);

  /* ---------------------------------------------------------------------- */
  /* Atención: idle y foco                                                   */
  /* ---------------------------------------------------------------------- */

  const idleSince = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const noteActivity = useCallback(() => {
    if (idleSince.current !== null) {
      const idleMs = Math.max(0, Date.now() - idleSince.current);
      idleSince.current = null;
      track({ eventType: "idle_end", payload: { idleMs, topicId } });
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      idleSince.current = Date.now();
      track({ eventType: "idle_start", payload: { topicId } });
    }, IDLE_AFTER_MS);
  }, [track, topicId]);

  useEffect(() => {
    noteActivity();
    let awaySince: number | null = null;

    const onBlur = (): void => {
      if (awaySince !== null) return;
      awaySince = Date.now();
      track({ eventType: "focus_lost", payload: { topicId } });
    };
    const onFocus = (): void => {
      if (awaySince === null) return;
      const awayMs = Math.max(0, Date.now() - awaySince);
      awaySince = null;
      track({ eventType: "focus_gained", payload: { awayMs, topicId } });
    };

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [track, topicId, noteActivity]);

  /* ---------------------------------------------------------------------- */
  /* Red                                                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const sync = (): void => setOffline(navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Acciones                                                                */
  /* ---------------------------------------------------------------------- */

  const submit = useCallback(() => {
    noteActivity();
    const before = stateRef.current;
    if (before.phase === "answered") {
      nextQuestion();
      return;
    }
    dispatch({ type: "submit", now: Date.now() });
    const after = stateRef.current;
    if (after.result) {
      setLive(
        after.result.isCorrect
          ? fill(t.liveCorrect, { streak: after.streak })
          : fill(t.liveIncorrect, { answer: after.result.canonical }),
      );
    }
  }, [dispatch, nextQuestion, noteActivity, t.liveCorrect, t.liveIncorrect]);

  const skip = useCallback(() => {
    noteActivity();
    dispatch({ type: "skip", now: Date.now() });
    nextQuestion();
  }, [dispatch, nextQuestion, noteActivity]);

  // Enter en cualquier parte de la tarjeta, igual que en Y6A: cuando ya se ha
  // respondido, Enter pasa a la siguiente sin tener que buscar el botón.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Enter") return;
      if (stateRef.current.phase !== "answered") return;
      const target = event.target as HTMLElement | null;
      // No se secuestra el Enter de un botón: pulsar "Ver la pista" con el
      // teclado dispararía a la vez la siguiente pregunta.
      if (target && (target.tagName === "BUTTON" || target.tagName === "A")) return;
      event.preventDefault();
      nextQuestion();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nextQuestion]);

  // Foco al campo de respuesta en cada pregunta nueva, y al botón de acción en
  // cuanto se responde. Lo segundo no es un detalle: al responder, el campo se
  // deshabilita, y un campo deshabilitado PIERDE el foco. Sin esto, quien usa
  // teclado o lector de pantalla se queda huérfano en mitad del bucle y tiene
  // que tabular desde el principio de la página en cada pregunta.
  useEffect(() => {
    if (state.phase === "answering") answerRef.current?.focus();
    else if (state.phase === "answered") actionRef.current?.focus();
  }, [state.phase, state.question?.seed]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  if (!topic) {
    return (
      <ErrorState
        title={learnI18n((d) => d.practice.unknownTopicTitle)}
        body={learnI18n((d) => d.practice.unknownTopicBody)}
      />
    );
  }

  const item = state.question?.item ?? null;
  const accuracy = accuracyPercent(state);
  const answered = state.phase === "answered";

  return (
    <div className="flex flex-col gap-6">
      <TopicChips topics={topics} activeId={topic.id} locale={locale} />

      {offline ? (
        <p role="status" className="rounded-lg border border-line bg-card px-4 py-3 text-sm text-muted">
          {t.offlineNotice}
        </p>
      ) : null}

      <section aria-label={t.title} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={String(state.asked)} label={learnI18n((d) => d.practice.asked)} />
          <StatTile value={String(state.correct)} label={learnI18n((d) => d.practice.right)} />
          <StatTile
            value={accuracy === null ? t.noneYet : `${accuracy}%`}
            // "—" no se puede leer en voz alta. Sin este texto, un lector de
            // pantalla anuncia "Acierto, raya".
            valueText={accuracy === null ? t.notMeasuredYet : undefined}
            label={learnI18n((d) => d.practice.accuracy)}
          />
          <StatTile value={String(state.bestStreak)} label={learnI18n((d) => d.practice.best)} />
        </div>

        <ProgressBar
          value={accuracy ?? 0}
          max={100}
          label={learnI18n((d) => d.practice.accuracy)}
          valueText={
            accuracy === null
              ? t.notMeasuredYet
              : resolveI18n(
                  learnI18nWith((d) => d.index.progressValue, { percent: accuracy }),
                  locale,
                )
          }
        />

        <StreakMeter current={state.streak} best={state.bestStreak} />
      </section>

      {/* Tres estados distintos, y confundirlos se ve en pantalla: ANTES de la
          primera pregunta no hay error, hay espera. Pintar aquí el estado de
          error mientras el efecto de arranque aún no ha corrido le enseñaba al
          alumno un "no hemos podido crear una pregunta" que duraba un fotograma
          y no era verdad. */}
      {engineFailed ? (
        <ErrorState
          title={learnI18n((d) => d.practice.engineErrorTitle)}
          body={learnI18n((d) => d.practice.engineErrorBody)}
          onRetry={nextQuestion}
        />
      ) : item === null || state.question === null ? (
        <Skeleton lines={3} label={learnI18n((d) => d.practice.loadingQuestion)} />
      ) : (
        <article
          aria-label={fill(t.liveQuestion, { ord: state.question.ord })}
          className="rounded-2xl border border-line bg-card p-5 shadow-sm"
        >
          <MathStem id={stemId} html={item.body.stem} size="large" className="mb-4" />

          {item.body.figureSvg ? (
            <SafeSvg
              svg={item.body.figureSvg}
              {...(item.body.figureAlt
                ? { label: resolveI18n(item.body.figureAlt, locale) }
                : { decorative: true })}
              className="mb-4 rounded-lg border border-line p-3 text-center [&_svg]:h-auto [&_svg]:max-w-full"
            />
          ) : null}

          <div role="group" aria-labelledby={stemId} className="flex flex-col gap-4">
            <NumericInput
              ref={answerRef}
              value={state.answer}
              onChange={(value) => {
                noteActivity();
                dispatch({ type: "answer_changed", value, now: Date.now() });
              }}
              onSubmit={submit}
              disabled={answered}
              label={learnI18n((d) => d.practice.answerLabel)}
              placeholder={item.body.placeholder ?? t.answerPlaceholder}
              unit={item.body.unit}
            />

            {state.notice === "blank-answer" ? (
              <p role="alert" className="text-sm font-semibold text-ink">
                {t.typeAnswerFirst}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="button" ref={actionRef} onClick={submit}>
                {answered ? t.nextQuestion : t.check}
              </Button>
              <Button type="button" variant="secondary" onClick={skip} disabled={answered}>
                {t.skip}
              </Button>
            </div>

            {/* El HTML de la pista y el de la solución SOLO se montan cuando
                están abiertos. `hidden` no basta: dejaría la respuesta correcta
                en el DOM antes de que el alumno conteste, y basta con abrir el
                inspector para verla. */}
            {item.hint ? (
              <HintPanel
                html={state.hintOpen ? resolveI18n(item.hint, locale) : ""}
                open={state.hintOpen}
                onOpenChange={(open) => {
                  noteActivity();
                  dispatch({ type: "hint_toggled", open, now: Date.now() });
                }}
              />
            ) : null}

            {item.solution ? (
              <SolutionPanel
                html={state.solutionOpen ? resolveI18n(item.solution, locale) : undefined}
                open={state.solutionOpen}
                onOpenChange={(open) => {
                  noteActivity();
                  dispatch({ type: "solution_toggled", open, now: Date.now() });
                }}
              />
            ) : null}
          </div>

          {answered && state.result ? (
            <div className="mt-4">
              {state.result.isCorrect ? (
                <CorrectFeedback
                  title={learnI18n((d) => d.practice.correctTitle)}
                  streak={state.streak}
                  // La LiveRegion de abajo ya anuncia el resultado, y con más
                  // detalle. Con los dos, el lector lo diría dos veces.
                  announce={false}
                />
              ) : (
                <IncorrectFeedback
                  title={learnI18n((d) => d.practice.incorrectTitle)}
                  correctAnswerHtml={state.result.canonical}
                  announce={false}
                />
              )}
            </div>
          ) : null}
        </article>
      )}

      <LiveRegion message={live} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Los chips de tema de Y6A. Son ENLACES y no botones: cambiar de tema cambia la
 * URL, así que se puede compartir, volver atrás y recargar sin perder el sitio.
 * Un `<button>` que navega rompe el botón "atrás" y el clic con el botón central.
 */
function TopicChips({
  topics,
  activeId,
  locale,
}: {
  readonly topics: readonly PracticeTopic[];
  readonly activeId: string | null;
  readonly locale: Locale;
}) {
  const dictionary = getLearnDictionary(locale);
  return (
    <nav aria-label={dictionary.practice.topicLegend}>
      <ul className="flex flex-wrap gap-2">
        {topics.map((topic) => {
          const active = topic.id === activeId;
          return (
            <li key={topic.id}>
              <Link
                href={`/practice/${encodeURIComponent(topic.id)}`}
                aria-current={active ? "page" : undefined}
                className={[
                  "inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-semibold",
                  "focus-visible:outline-2 focus-visible:outline-offset-2",
                  active
                    ? "border-ink bg-ink text-card"
                    : "border-line bg-card text-ink hover:border-ink",
                ].join(" ")}
              >
                {dictionary.practice.topics[topic.slug]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
