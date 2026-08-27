"use client";

/**
 * Reconstrucción forense de un intento — DATA_MODEL §10, para humanos.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * CÓMO SE PRESENTA
 * ===========================================================================
 * El principio rector del MASTER_PLAN dice que hay que poder reconstruir "qué
 * vio el estudiante, en qué orden, qué versión, qué respondió, cuándo, cuántas
 * veces cambió de opinión y cómo se calificó". Esta pantalla contesta esas
 * siete preguntas EN ESE ORDEN, una pregunta del examen por tarjeta:
 *
 *   1. El enunciado literal (`rendered_body.stem`), por `MathStem` — que sanea
 *      y además convierte las fracciones apiladas en algo que un lector de
 *      pantalla lee bien. Nunca `dangerouslySetInnerHTML` a pelo.
 *   2. Las opciones EN EL ORDEN EN QUE LAS VIO, numeradas por posición, con la
 *      posición que ocupaban en el banco al lado. Y una frase en prosa que
 *      dice exactamente cuál eligió, porque una tabla de índices no es una
 *      respuesta a "¿qué marcó?".
 *   3. Qué versión de la pregunta era, con enlace al banco.
 *   4. Cada revisión de la respuesta, en una tabla cronológica con la vía
 *      (`typed`/`selected`/`autosave`/`restored`) y la hora del SERVIDOR.
 *   5. La cadena de calificación COMPLETA, de la más antigua a la vigente.
 *   6. La telemetría del item.
 *   7. La clave de respuesta: un botón, y nada más hasta que se pulse.
 * ===========================================================================
 */
import { useState, type ReactNode } from "react";
import type { Locale } from "@cet/shared";
import { Badge, Card, EmptyState, MathStem, SafeSvg, ScoreRing, StatTile, Table } from "@cet/ui";

import { revealAnswerKey, type AnswerKeyResult } from "./actions";
import {
  clockSkewMs,
  formatDurationMs,
  formatSchoolClock,
  formatSchoolTime,
  formatSignedDurationMs,
} from "./dates";
import { orderGradingChain, regradeCount } from "./grading-chain";
import { fill, fromDb, ui, type StaffDictionary } from "./i18n";
import { presentOptions, selectedIdsFromResponse } from "./option-order";
import type { AttemptReconstruction, ReconstructedItem, ResponseRow } from "./queries";

interface Props {
  readonly data: AttemptReconstruction;
  readonly locale: Locale;
  readonly t: StaffDictionary;
  readonly canGrade: boolean;
}

export function AttemptView({ data, locale, t, canGrade }: Props): ReactNode {
  const { attempt, school } = data;
  const tz = school.timezone;
  const when = (value: string | null): string => formatSchoolTime(value, tz, locale, "second");

  const statusKey = attempt.status as keyof StaffDictionary["attemptStatus"];
  const statusLabel = t.attemptStatus[statusKey] ?? attempt.status;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-ink">{t.attempt.title}</h1>
        <p className="max-w-prose text-muted">{t.attempt.subtitle}</p>
        <p className="text-lg font-semibold text-ink">
          {fill(t.attempt.heading, {
            student: data.studentName,
            exam: fromDb(data.examTitle, locale, t.common.unknown),
          })}
        </p>
        <p className="text-xs text-muted">{fill(t.common.timezoneNote, { timezone: tz })}</p>
      </header>

      <AttemptWarning status={attempt.status} t={t} />

      {/* --- Resumen ------------------------------------------------------- */}
      <Card padding="md">
        <div className="flex flex-wrap items-center gap-4">
          {attempt.score_pct !== null ? (
            <ScoreRing
              value={attempt.score_raw ?? 0}
              max={attempt.score_max ?? 1}
              label={ui(t.attempt.summary.score)}
              size={110}
            />
          ) : null}
          <div className="flex flex-wrap gap-3">
            <StatTile value={statusLabel} label={ui(t.attempt.summary.status)} />
            <StatTile
              value={String(data.items.length)}
              label={ui(t.attempt.summary.questions)}
            />
            <StatTile
              value={String(attempt.attempt_number)}
              label={ui(t.attempt.summary.attemptNumber)}
            />
            <StatTile
              value={
                attempt.score_pct === null
                  ? t.common.none
                  : `${attempt.score_pct.toFixed(1)} %`
              }
              label={ui(t.attempt.summary.score)}
              hint={attempt.score_pct === null ? ui(t.attempt.summary.notGradedYet) : undefined}
            />
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Fact label={t.attempt.summary.student} value={data.studentName} />
          <Fact label={t.attempt.summary.studentCode} value={data.studentCode ?? t.common.none} />
          <Fact label={t.attempt.summary.section} value={data.sectionName ?? t.common.none} />
          <Fact label={t.attempt.summary.startedAt} value={when(attempt.started_at)} />
          <Fact label={t.attempt.summary.deadlineAt} value={when(attempt.server_deadline_at)} />
          <Fact
            label={t.attempt.summary.submittedAt}
            value={
              attempt.submitted_at === null
                ? t.common.none
                : `${when(attempt.submitted_at)}${submittedByNote(attempt.submitted_by, t)}`
            }
          />
          <Fact
            label={t.attempt.summary.gradedAt}
            value={attempt.graded_at === null ? t.attempt.summary.notGradedYet : when(attempt.graded_at)}
          />
          <Fact
            label={t.attempt.summary.passed}
            value={attempt.passed === null ? t.common.none : attempt.passed ? t.common.yes : t.common.no}
          />
        </dl>
      </Card>

      {/* --- Telemetría del intento ---------------------------------------- */}
      <Card padding="md" title={ui(t.attempt.telemetry.title)} lead={ui(t.attempt.telemetry.subtitle)}>
        {data.telemetryMissing ? (
          <EmptyState
            title={ui(t.attempt.telemetry.noEvents)}
            body={ui(t.attempt.telemetry.noEventsBody)}
          />
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            <StatTile
              value={formatDurationMs(data.telemetry.timeOnItemMs) || t.common.none}
              label={ui(t.attempt.telemetry.totalTime)}
            />
            <StatTile
              value={String(data.telemetry.hintsRequested)}
              label={ui(t.attempt.telemetry.hintsRequested)}
            />
            <StatTile
              value={formatDurationMs(data.telemetry.idleMs) || t.common.none}
              label={ui(t.attempt.telemetry.idleTime)}
            />
            <StatTile
              value={String(data.telemetry.focusLosses)}
              label={ui(t.attempt.telemetry.focusLosses)}
              hint={ui(t.attempt.telemetry.focusLossesHint)}
            />
            <StatTile
              value={String(data.telemetry.revisits)}
              label={ui(t.attempt.telemetry.revisits)}
            />
          </div>
        )}
      </Card>

      {/* --- Las preguntas, en el orden real ------------------------------- */}
      {data.items.length === 0 ? (
        <EmptyState title={ui(t.attempt.notFound)} />
      ) : (
        data.items.map((entry) => (
          <ItemCard
            key={entry.item.id}
            entry={entry}
            total={data.items.length}
            attemptId={attempt.id}
            timezone={tz}
            locale={locale}
            t={t}
            canGrade={canGrade}
          />
        ))
      )}
    </div>
  );
}

/* ========================================================================== */

function Fact({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 text-end font-medium text-ink">{value === "" ? "—" : value}</dd>
    </div>
  );
}

function submittedByNote(submittedBy: string | null, t: StaffDictionary): string {
  if (submittedBy === null) return "";
  const key = submittedBy as keyof StaffDictionary["submittedBy"];
  const label = t.submittedBy[key];
  return label === undefined ? "" : ` · ${label}`;
}

/**
 * Un intento `in_progress` no tiene notas y uno `voided` no cuenta. Decirlo
 * arriba, antes de que el profesor lea nada, evita que interprete "sin nota"
 * como "un cero".
 */
function AttemptWarning({
  status,
  t,
}: {
  readonly status: string;
  readonly t: StaffDictionary;
}): ReactNode {
  const map: Record<string, { title: string; body: string; tone: string }> = {
    in_progress: {
      title: t.attempt.warnings.inProgressTitle,
      body: t.attempt.warnings.inProgressBody,
      tone: "border-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)] text-[var(--cet-hint-text)]",
    },
    voided: {
      title: t.attempt.warnings.voidedTitle,
      body: t.attempt.warnings.voidedBody,
      tone: "border-[var(--cet-no-accent)] bg-[var(--cet-no-bg)] text-[var(--cet-no-text)]",
    },
    abandoned: {
      title: t.attempt.warnings.abandonedTitle,
      body: t.attempt.warnings.abandonedBody,
      tone: "border-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)] text-[var(--cet-hint-text)]",
    },
    grading: {
      title: t.attempt.warnings.gradingTitle,
      body: t.attempt.warnings.gradingBody,
      tone: "border-[var(--cet-line)] bg-[var(--cet-surface-3)] text-[var(--cet-ink)]",
    },
  };

  const notice = map[status];
  if (notice === undefined) return null;

  return (
    <div role="status" className={`rounded-md border-s-4 px-4 py-3 ${notice.tone}`}>
      <p className="font-semibold">{notice.title}</p>
      <p className="mt-1 max-w-prose text-sm">{notice.body}</p>
    </div>
  );
}

/* ========================================================================== */
/* Una pregunta                                                               */
/* ========================================================================== */

interface ItemProps {
  readonly entry: ReconstructedItem;
  readonly total: number;
  readonly attemptId: string;
  readonly timezone: string;
  readonly locale: Locale;
  readonly t: StaffDictionary;
  readonly canGrade: boolean;
}

function ItemCard({ entry, total, attemptId, timezone, locale, t, canGrade }: ItemProps): ReactNode {
  const { item, version } = entry;

  // La respuesta FINAL manda para "qué eligió". Si no hay `is_final` (intento
  // aún abierto, o entrega interrumpida), se usa la última revisión guardada:
  // es lo último que el alumno llegó a dejar escrito.
  const finalResponse = entry.responses.find((r) => r.is_final) ?? entry.responses.at(-1) ?? null;
  const selectedIds = finalResponse === null ? null : selectedIdsFromResponse(finalResponse.response);
  const presentation = presentOptions(entry.options, item.option_order, selectedIds ?? []);

  return (
    <Card padding="md" className="scroll-mt-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold text-ink">
          {fill(t.attempt.item.heading, { ord: item.ord, total })}
        </h2>
        {version === null ? (
          <Badge tone="warning">{t.attempt.item.versionUnknown}</Badge>
        ) : (
          <>
            <Badge tone="info">{fill(t.attempt.item.version, { version: version.version })}</Badge>
            <Badge tone="neutral">{version.format}</Badge>
            <Badge tone={version.grading_mode === "manual" ? "warning" : "neutral"}>
              {`${t.attempt.item.gradingModeLabel}: ${t.gradingMode[version.grading_mode]}`}
            </Badge>
          </>
        )}
        <Badge tone="neutral">{`${t.attempt.item.maxPoints} ${item.max_points} ${t.common.points}`}</Badge>
        {item.difficulty === null ? null : (
          <Badge tone="neutral">{`${t.attempt.item.difficulty} ${item.difficulty}/5`}</Badge>
        )}
        {entry.skill === null ? null : (
          <Badge tone="neutral">{`${t.attempt.item.skill}: ${fromDb(entry.skill.name, locale, entry.skill.code)}`}</Badge>
        )}
      </header>

      {/* 1. El enunciado literal ------------------------------------------- */}
      <section className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t.attempt.item.stemLabel}
        </h3>
        <div className="mt-2 rounded-md border border-line bg-surface px-4 py-3">
          <MathStem html={entry.stem} />
          {/* Hallazgo P2-7: la figura de `rendered_body.figureSvg` se leía en la
              consulta y no se pintaba. En los "labs" de Y6A (formas compuestas,
              circuitos, mapas) la figura ES la pregunta: sin ella, esta pantalla
              no reconstruye lo que el alumno vio, solo su pie de foto.
              `SafeSvg` es la única vía autorizada para SVG de la base de datos. */}
          {entry.figureSvg === null ? null : (
            <div className="mt-3">
              <SafeSvg svg={entry.figureSvg} label={figureLabel(entry, locale, t)} />
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          {version === null ? (
            t.attempt.item.versionUnknown
          ) : (
            <a
              className="underline underline-offset-2"
              href={`/admin/questions/${item.question_id}?version=${version.id}`}
            >
              {t.attempt.item.versionLink}
            </a>
          )}
        </p>
      </section>

      {/* 2. El orden en que vio las opciones -------------------------------- */}
      {presentation.integrity === "not-applicable" ? null : (
        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t.attempt.item.optionsLabel}
          </h3>

          <SelectionSentence
            presentation={presentation}
            selectedIds={selectedIds}
            finalResponse={finalResponse}
            t={t}
          />

          {presentation.integrity === "missing" ? (
            <p className="mt-2 text-sm text-[var(--cet-hint-text)]">{t.attempt.item.orderMissing}</p>
          ) : null}
          {presentation.integrity === "invalid" ? (
            <p className="mt-2 text-sm text-[var(--cet-no-text)]">{t.attempt.item.orderInvalid}</p>
          ) : null}

          <div className="mt-3">
            <Table
              caption={ui(t.attempt.item.optionsCaption)}
              hideCaption
              rowKey={(row) => row.id}
              rows={[...presentation.options]}
              columns={[
                {
                  key: "position",
                  header: ui(t.attempt.item.positionColumn),
                  rowHeader: true,
                  cell: (row) => `${row.displayPosition}. ${row.displayLabel}`,
                },
                {
                  key: "option",
                  header: ui(t.attempt.item.optionColumn),
                  cell: (row) => <MathStem html={row.html} />,
                },
                {
                  key: "bank",
                  header: ui(t.attempt.item.bankColumn),
                  cell: (row) =>
                    row.bankIndex === null
                      ? t.attempt.item.bankPositionUnknown
                      : fill(t.attempt.item.bankPosition, { position: row.bankIndex + 1 }),
                },
                {
                  key: "chosen",
                  header: ui(t.attempt.item.chosenColumn),
                  align: "center",
                  cell: (row) =>
                    row.chosen ? (
                      <Badge tone="success">{t.attempt.item.chosen}</Badge>
                    ) : (
                      <span className="text-muted">{t.common.none}</span>
                    ),
                },
              ]}
            />
          </div>
        </section>
      )}

      {/* 3. Cada revisión de su respuesta ----------------------------------- */}
      <ResponseTimeline entry={entry} timezone={timezone} locale={locale} t={t} />

      {/* 4. La calificación, con la cadena completa ------------------------- */}
      <GradingChain
        entry={entry}
        attemptId={attemptId}
        timezone={timezone}
        locale={locale}
        t={t}
        canGrade={canGrade}
      />

      {/* 5. Telemetría del item -------------------------------------------- */}
      <section className="mt-5 flex flex-wrap gap-3">
        <StatTile
          value={formatDurationMs(entry.telemetry.timeOnItemMs) || t.common.none}
          label={ui(t.attempt.telemetry.totalTime)}
        />
        <StatTile
          value={String(entry.telemetry.hintsRequested)}
          label={ui(t.attempt.telemetry.hintsRequested)}
        />
        <StatTile
          value={formatDurationMs(entry.telemetry.idleMs) || t.common.none}
          label={ui(t.attempt.telemetry.idleTime)}
        />
        <StatTile
          value={String(entry.telemetry.focusLosses)}
          label={ui(t.attempt.telemetry.focusLosses)}
        />
        <StatTile value={String(entry.telemetry.revisits)} label={ui(t.attempt.telemetry.revisits)} />
      </section>

      {/* 6. La clave, solo bajo demanda ------------------------------------- */}
      <AnswerKeyDisclosure attemptId={attemptId} itemId={item.id} ord={item.ord} t={t} />
    </Card>
  );
}

/**
 * Texto alternativo de la figura. `engine-contract` lo declara obligatorio
 * cuando hay `figureSvg`, pero esto lee datos históricos: un item materializado
 * antes de esa regla puede no tenerlo, y una figura sin etiqueta es peor que
 * una etiqueta genérica.
 */
function figureLabel(
  entry: ReconstructedItem,
  locale: Locale,
  t: StaffDictionary,
): string {
  return fromDb(entry.figureAlt, locale, t.attempt.item.figureAlt);
}

/* ========================================================================== */
/* "Eligió la 2.ª de las que vio, que era «2/3»"                              */
/* ========================================================================== */

function SelectionSentence({
  presentation,
  selectedIds,
  finalResponse,
  t,
}: {
  readonly presentation: ReturnType<typeof presentOptions>;
  readonly selectedIds: readonly string[] | null;
  readonly finalResponse: ResponseRow | null;
  readonly t: StaffDictionary;
}): ReactNode {
  // `selectedIds === null` significa que la respuesta NO era de opciones
  // (numérica, texto). No es lo mismo que "no eligió nada", y decir "lo dejó en
  // blanco" sería falso.
  if (finalResponse === null || (selectedIds !== null && selectedIds.length === 0)) {
    return <p className="mt-2 text-sm text-ink">{t.attempt.item.selectionEmpty}</p>;
  }
  if (selectedIds === null) return null;

  if (presentation.chosen.length === 0) {
    return <p className="mt-2 text-sm text-[var(--cet-no-text)]">{t.attempt.item.selectionUnreadable}</p>;
  }

  const total = presentation.options.length;

  if (presentation.chosen.length === 1) {
    const chosen = presentation.chosen[0];
    if (chosen === undefined) return null;
    return (
      <p className="mt-2 text-sm text-ink">
        {fill(t.attempt.item.selectionSentence, {
          position: chosen.displayPosition,
          total,
          // `htmlToPlainText` no está disponible en esta capa sin arrastrar el
          // saneador; el HTML de una opción es texto restringido, así que basta
          // con retirar las etiquetas para la frase en prosa. La versión
          // renderizada, con fracciones apiladas, está en la tabla de abajo.
          text: stripTags(chosen.html),
        })}
      </p>
    );
  }

  return (
    <div className="mt-2 text-sm text-ink">
      <p>{fill(t.attempt.item.selectionSentenceMulti, { count: presentation.chosen.length, total })}</p>
      <ul className="mt-1 list-disc ps-5">
        {presentation.chosen.map((option) => (
          <li key={option.id}>
            {fill(t.attempt.item.selectionSentence, {
              position: option.displayPosition,
              total,
              text: stripTags(option.html),
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Retira etiquetas para incrustar el texto de una opción en una frase.
 *
 * El resultado se inserta como TEXTO en React (nunca como HTML), así que no hay
 * riesgo de inyección aunque el saneador no haya intervenido: React escapa
 * todo lo que no pase por `dangerouslySetInnerHTML`. Esta función es de
 * legibilidad, no de seguridad, y por eso no se disfraza de saneador.
 */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ========================================================================== */
/* Línea de tiempo de revisiones                                              */
/* ========================================================================== */

function ResponseTimeline({
  entry,
  timezone,
  locale,
  t,
}: {
  readonly entry: ReconstructedItem;
  readonly timezone: string;
  readonly locale: Locale;
  readonly t: StaffDictionary;
}): ReactNode {
  const rows = entry.responses;

  return (
    <section className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t.attempt.timeline.title}
      </h3>
      <p className="mt-1 text-xs text-muted">{t.attempt.timeline.subtitle}</p>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t.attempt.timeline.empty}</p>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium text-ink">
            {rows.length === 1
              ? t.attempt.timeline.changedMindOnce
              : fill(t.attempt.timeline.changedMind, { count: rows.length - 1 })}
          </p>
          <div className="mt-3">
            <Table
              caption={ui(t.attempt.timeline.caption)}
              hideCaption
              rowKey={(row) => row.id}
              rows={[...rows]}
              columns={[
                {
                  key: "revision",
                  header: ui(t.attempt.timeline.revision),
                  rowHeader: true,
                  cell: (row) => String(row.revision),
                },
                {
                  key: "value",
                  header: ui(t.attempt.timeline.whatTheyWrote),
                  cell: (row) => (
                    <code className="whitespace-pre-wrap break-words text-xs">
                      {describeResponse(row.response)}
                    </code>
                  ),
                },
                {
                  key: "server",
                  header: ui(t.attempt.timeline.when),
                  cell: (row) => formatSchoolTime(row.server_ts, timezone, locale, "second"),
                },
                {
                  key: "client",
                  header: ui(t.attempt.timeline.clientWhen),
                  // Hallazgo P2-4: esta columna se titulaba "reloj del
                  // navegador" pero solo mostraba el DESFASE. Un profesor
                  // leería "+2 min 10 s" como si fuera una hora. Ahora se
                  // muestra la hora que dijo el navegador y, debajo, cuánto se
                  // separaba del servidor — que es la información que explica
                  // por qué a veces el reloj del alumno dice cosas imposibles.
                  cell: (row) => {
                    if (row.client_ts === null) return t.common.none;
                    const skew = clockSkewMs(row.client_ts, row.server_ts);
                    const signed = formatSignedDurationMs(skew);
                    return (
                      <span className="whitespace-nowrap">
                        {formatSchoolClock(row.client_ts, timezone, locale)}
                        {signed === "" ? null : (
                          <span className="block text-xs text-muted">
                            {fill(t.attempt.timeline.clockSkew, { skew: signed })}
                          </span>
                        )}
                      </span>
                    );
                  },
                },
                {
                  key: "source",
                  header: ui(t.attempt.timeline.via),
                  cell: (row) => <Badge tone="neutral">{t.responseSource[row.source]}</Badge>,
                },
                {
                  key: "time",
                  header: ui(t.attempt.timeline.timeOnItem),
                  align: "end",
                  cell: (row) => formatDurationMs(row.time_on_item_ms) || t.common.none,
                },
                {
                  key: "final",
                  header: ui(t.attempt.timeline.isFinal),
                  align: "center",
                  cell: (row) =>
                    row.is_final ? <Badge tone="success">{t.common.yes}</Badge> : <span>{t.common.none}</span>,
                },
              ]}
            />
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Vuelca `attempt_responses.response` a texto legible.
 *
 * Se muestra el valor CRUDO además de la frase en prosa: la prosa interpreta,
 * y en una reclamación de nota hay que poder ver el dato tal cual se guardó.
 */
function describeResponse(response: unknown): string {
  if (response === null || response === undefined) return "∅";
  if (typeof response !== "object") return String(response);

  const record = response as Record<string, unknown>;
  const type = record["type"];

  if (type === "empty") return "∅";
  if (type === "text" && typeof record["value"] === "string") return record["value"];
  if (type === "choice" && Array.isArray(record["selectedIds"])) {
    return record["selectedIds"].join(", ");
  }
  return JSON.stringify(response);
}

/* ========================================================================== */
/* Cadena de calificación                                                     */
/* ========================================================================== */

function GradingChain({
  entry,
  attemptId,
  timezone,
  locale,
  t,
  canGrade,
}: {
  readonly entry: ReconstructedItem;
  readonly attemptId: string;
  readonly timezone: string;
  readonly locale: Locale;
  readonly t: StaffDictionary;
  readonly canGrade: boolean;
}): ReactNode {
  const chain = orderGradingChain(entry.gradings);
  const regrades = regradeCount(entry.gradings);
  const isManual = entry.version?.grading_mode === "manual";

  return (
    <section className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t.attempt.grading.title}
      </h3>

      {chain.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {isManual ? t.attempt.grading.emptyManual : t.attempt.grading.empty}
          {canGrade && isManual ? (
            <>
              {" "}
              <a className="underline underline-offset-2" href={`/teach/attempts/${attemptId}/grade`}>
                {t.attempt.grading.gradeLink}
              </a>
            </>
          ) : null}
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">{t.attempt.grading.subtitle}</p>
          {regrades > 0 ? (
            <p className="mt-2 text-sm font-medium text-[var(--cet-hint-text)]">
              {fill(t.attempt.grading.chainNote, { count: regrades })}
            </p>
          ) : null}
          <div className="mt-3">
            <Table
              caption={ui(t.attempt.grading.caption)}
              hideCaption
              rowKey={(row) => row.row.id}
              rows={[...chain]}
              columns={[
                {
                  key: "step",
                  header: ui("#"),
                  rowHeader: true,
                  cell: (row) => String(row.step),
                },
                {
                  key: "points",
                  header: ui(t.attempt.grading.points),
                  align: "end",
                  cell: (row) => `${row.row.points_awarded} / ${row.row.max_points}`,
                },
                {
                  key: "by",
                  header: ui(t.attempt.grading.by),
                  cell: (row) => t.gradedBy[row.row.graded_by],
                },
                {
                  key: "when",
                  header: ui(t.attempt.grading.when),
                  cell: (row) => formatSchoolTime(row.row.graded_at, timezone, locale, "second"),
                },
                {
                  key: "rationale",
                  header: ui(t.attempt.grading.rationale),
                  cell: (row) =>
                    row.row.rationale === null || row.row.rationale === "" ? (
                      <span className="text-muted">{t.attempt.grading.noRationale}</span>
                    ) : (
                      row.row.rationale
                    ),
                },
                {
                  key: "state",
                  header: ui(t.common.status),
                  align: "center",
                  cell: (row) =>
                    row.effective ? (
                      <Badge tone="success">{t.attempt.grading.effective}</Badge>
                    ) : (
                      <Badge tone="neutral">{t.attempt.grading.superseded}</Badge>
                    ),
                },
              ]}
            />
          </div>
          {canGrade && isManual ? (
            <p className="mt-2 text-sm">
              <a className="underline underline-offset-2" href={`/teach/attempts/${attemptId}/grade`}>
                {t.attempt.grading.gradeLink}
              </a>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ========================================================================== */
/* Clave de respuesta — gesto deliberado                                      */
/* ========================================================================== */

function AnswerKeyDisclosure({
  attemptId,
  itemId,
  ord,
  t,
}: {
  readonly attemptId: string;
  readonly itemId: string;
  readonly ord: number;
  readonly t: StaffDictionary;
}): ReactNode {
  const [state, setState] = useState<AnswerKeyResult | null>(null);
  const [pending, setPending] = useState(false);

  // Nada de `answer_key` llega a este componente en el HTML inicial. Solo
  // existe en el estado del cliente DESPUÉS de una llamada explícita que ya ha
  // quedado registrada en el audit_log.
  async function onReveal(): Promise<void> {
    setPending(true);
    try {
      setState(await revealAnswerKey(attemptId, itemId));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-5 rounded-md border border-dashed border-line px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t.attempt.answerKey.title}
      </h3>

      {state === null ? (
        <>
          <p className="mt-1 max-w-prose text-sm text-muted">{t.attempt.answerKey.warning}</p>
          <p className="mt-1 text-xs text-muted">{t.attempt.answerKey.notRequested}</p>
          <button
            type="button"
            onClick={() => void onReveal()}
            disabled={pending}
            className="mt-3 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-60"
          >
            {pending ? t.attempt.answerKey.revealing : t.attempt.answerKey.reveal}
          </button>
        </>
      ) : state.ok ? (
        <>
          <p className="mt-1 text-sm font-medium text-ink">
            {fill(t.attempt.answerKey.shown, { ord })}
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-[var(--cet-surface-3)] p-3 text-xs">
            {state.json}
          </pre>
          <p className="mt-1 text-xs text-muted">{t.attempt.answerKey.auditNote}</p>
          <button
            type="button"
            onClick={() => setState(null)}
            className="mt-2 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink"
          >
            {t.attempt.answerKey.hide}
          </button>
        </>
      ) : (
        <>
          <p role="alert" className="mt-1 text-sm text-[var(--cet-no-text)]">
            {state.errorKey === "denied" ? t.attempt.answerKey.denied : t.attempt.answerKey.failed}
          </p>
          <p className="mt-1 text-xs text-muted">{t.attempt.answerKey.auditNote}</p>
        </>
      )}
    </section>
  );
}
