"use client";

/**
 * Resultado del intento.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ESTE ES EL ÚNICO COMPONENTE DE TODA LA APLICACIÓN QUE PUEDE LEER
 * `correctAnswer`, y solo lo hace después de pasar por `shouldShowReview()`.
 * Con `feedbackMode: "never"` la lista de revisión ni siquiera se construye:
 * no es que se oculte con CSS, es que esos datos nunca entran en el árbol de
 * React y por tanto nunca llegan al HTML.
 *
 * Tono: la nota se da entera y sin adornos. No hay confeti al aprobar ni rojo
 * agresivo al suspender. `ScoreRing` ya toma esa decisión por nosotros y es la
 * correcta: el arco no codifica aprobado ni suspenso.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Locale } from "@cet/shared";
import { Badge, Card, ErrorState, LocaleProvider, ScoreRing } from "@cet/ui";

import { ResumenDeTiempo } from "@/components/learn/TiempoEnPantalla";

import { fetchResult } from "./api";
import { ApiError } from "./types";
import { fmt, getExamDictionary } from "./dictionary";
import { reviewItemsFor, shouldShowReview, shouldShowScore } from "./feedback";
import { describeResponse } from "./responses";
import { leerTiempoDelIntento } from "./tiempo-del-intento";
import type { AttemptResult } from "./types";

export interface ResultViewProps {
  readonly attemptId: string;
  readonly locale: Locale;
  /** Resultado ya cargado en el servidor, si lo hubo. Evita un parpadeo. */
  readonly initial?: AttemptResult | null | undefined;
}

export function ResultView({ attemptId, locale, initial }: ResultViewProps): ReactNode {
  const t = getExamDictionary(locale);
  const [result, setResult] = useState<AttemptResult | null>(initial ?? null);
  const [failed, setFailed] = useState(false);
  const [notSubmitted, setNotSubmitted] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      setNotSubmitted(false);
      setResult(await fetchResult(attemptId));
    } catch (error) {
      // "Todavía no lo has entregado" NO es una avería: el servidor responde
      // 409 `attempt_not_submitted`, igual que responde 409 a media docena de
      // cosas más. Enseñar aquí "no hemos podido cargar tu nota" a un niño que
      // simplemente aún no ha terminado sería mentirle.
      if (error instanceof ApiError && error.kind === "not_submitted") {
        setNotSubmitted(true);
        return;
      }
      setFailed(true);
    }
  }, [attemptId]);

  useEffect(() => {
    if (initial) return;
    void load();
  }, [initial, load]);

  // `grading` es un estado transitorio: el intento está entregado y M10 lo está
  // corrigiendo. Se reintenta solo, sin obligar al alumno a recargar ni dejarle
  // creyendo que se ha perdido su examen.
  useEffect(() => {
    if (result?.status !== "grading" && result?.status !== "submitted") return;
    const timer = setTimeout(() => void load(), 4_000);
    return () => clearTimeout(timer);
  }, [result?.status, load]);

  if (notSubmitted) {
    return (
      <Card>
        <h2 className="text-lg font-bold text-ink">{t.result.pending}</h2>
        <p className="mt-2 text-muted">{t.result.pendingBody}</p>
      </Card>
    );
  }

  if (failed) {
    return (
      <ErrorState
        title={{ en: t.result.errorTitle, es: t.result.errorTitle }}
        body={{ en: t.result.errorBody, es: t.result.errorBody }}
        onRetry={() => void load()}
        retryLabel={{ en: t.list.retry, es: t.list.retry }}
      />
    );
  }

  if (!result) {
    return (
      <p className="py-16 text-center text-muted" role="status" aria-live="polite">
        {t.result.pending}
      </p>
    );
  }

  if (!shouldShowScore(result.status)) {
    return (
      <Card>
        <h2 className="text-lg font-bold text-ink">{t.result.pending}</h2>
        <p className="mt-2 text-muted">{t.result.pendingBody}</p>
      </Card>
    );
  }

  /**
   * Cuanto estuvo de verdad en el examen, medido por el cronometro activo del
   * corredor y traido de la mano por `sessionStorage`. NO se calcula aqui a
   * partir de las fechas del intento: eso seria una SEGUNDA definicion de
   * «tiempo» —incluiria la pestana oculta— y este producto tiene una sola.
   *
   * `null` es lo normal si se llega al resultado por un enlace o al dia
   * siguiente. Entonces no se pinta nada: un cero seria mentir sobre el trabajo
   * de un nino. El dato de verdad esta en `learning_events`, no aqui.
   */
  const msEnPantalla = leerTiempoDelIntento(attemptId);

  const scoreRaw = result.scoreRaw ?? 0;
  const scoreMax = result.scoreMax ?? 0;
  const pct = result.scorePct ?? (scoreMax > 0 ? Math.round((scoreRaw / scoreMax) * 100) : 0);

  // El filtro de verdad. Con `never` esto es SIEMPRE un array vacío.
  const reviewItems = reviewItemsFor(result.feedbackMode, result.status, result.items);
  const showReview = shouldShowReview(result.feedbackMode, result.status);

  return (
    <LocaleProvider locale={locale}>
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col items-center gap-4 text-center">
          <ScoreRing value={scoreRaw} max={scoreMax} />
          <p className="text-lg font-bold text-ink">{fmt(t.result.percent, { pct })}</p>
          {result.passed === null ? null : (
            <Badge tone={result.passed ? "success" : "neutral"}>
              {result.passed ? t.result.passed : t.result.notPassed}
            </Badge>
          )}
          {/* La frase sale del mismo componente que la de la leccion y la
              practica, a proposito: el nino oye la misma frase en las tres
              pantallas porque detras hay una sola forma de contar el tiempo. */}
          {msEnPantalla === null ? null : <ResumenDeTiempo msActivos={msEnPantalla} />}
        </Card>

        {showReview ? (
          <section aria-labelledby="cet-review-heading" className="flex flex-col gap-3">
            <h2 id="cet-review-heading" className="text-lg font-bold text-ink">
              {t.result.reviewTitle}
            </h2>
            {reviewItems.map((item) => {
              const answered = describeResponse(item.response, (id) => id);
              return (
                <Card key={item.attemptItemId}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-bold text-ink">{item.ord}</span>
                    <Badge tone={item.isCorrect ? "success" : "danger"}>
                      {item.isCorrect ? t.result.correct : t.result.incorrect}
                    </Badge>
                    <span className="ml-auto text-sm text-muted">
                      {fmt(t.result.points, { points: item.pointsAwarded, max: item.maxPoints })}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="font-semibold text-muted">{t.result.yourAnswer}:</dt>
                      <dd className="text-ink">{answered === "" ? t.result.noAnswer : answered}</dd>
                    </div>
                    {item.correctAnswer === null ? null : (
                      <div className="flex gap-2">
                        <dt className="font-semibold text-muted">{t.result.correctAnswer}:</dt>
                        <dd className="text-ink">{item.correctAnswer}</dd>
                      </div>
                    )}
                    {item.rationale === null ? null : (
                      <div className="flex gap-2">
                        <dd className="text-muted">{item.rationale}</dd>
                      </div>
                    )}
                  </dl>
                </Card>
              );
            })}
          </section>
        ) : (
          // Con `never` no se deja al alumno sin explicación: se le dice quién
          // le va a dar la corrección. Un silencio sin motivo parece un fallo.
          <p className="text-muted">{t.result.reviewHidden}</p>
        )}
      </div>
    </LocaleProvider>
  );
}
