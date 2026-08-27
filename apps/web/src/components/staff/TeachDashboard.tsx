"use client";

/**
 * /teach — panel del profesor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Las cifras de arriba están elegidas para responder en dos segundos a la única
 * pregunta que un profesor se hace al abrir esto un lunes: ¿quién ha entregado,
 * quién va por detrás y qué está costando a la clase? El resto de la pantalla
 * es el detalle de esas tres respuestas.
 */
import type { ReactNode } from "react";
import type { Locale } from "@cet/shared";
import { Badge, Card, EmptyState, MasteryMeter, StatTile, Table } from "@cet/ui";

import { formatSchoolTime } from "./dates";
import { fill, fromDb, ui, type StaffDictionary } from "./i18n";
import { MIN_MASTERY_OBSERVATIONS } from "./constants";
import type { TeachDashboardData } from "./queries";

interface Props {
  readonly data: TeachDashboardData;
  readonly locale: Locale;
  readonly t: StaffDictionary;
}

export function TeachDashboard({ data, locale, t }: Props): ReactNode {
  const tz = data.school.timezone;
  const when = (value: string | null): string => formatSchoolTime(value, tz, locale);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">{t.teach.title}</h1>
        <p className="mt-1 max-w-prose text-muted">{t.teach.subtitle}</p>
        <p className="mt-1 text-xs text-muted">{fill(t.common.timezoneNote, { timezone: tz })}</p>
      </header>

      {/* --- De un vistazo -------------------------------------------------- */}
      <section aria-label={t.teach.statsCaption} className="flex flex-wrap gap-3">
        <StatTile value={String(data.totals.submitted)} label={ui(t.teach.stats.submitted)} />
        <StatTile value={String(data.totals.inProgress)} label={ui(t.teach.stats.inProgress)} />
        <StatTile
          value={String(data.totals.notStarted)}
          label={ui(t.teach.stats.notStarted)}
          hint={ui(t.teach.stats.notStartedHint)}
        />
        <StatTile
          value={data.totals.averagePct === null ? t.common.none : `${data.totals.averagePct.toFixed(1)} %`}
          label={ui(t.teach.stats.averageScore)}
          hint={ui(t.teach.stats.averageScoreHint)}
        />
      </section>

      {/* --- Las destrezas más flojas --------------------------------------- */}
      <Card padding="md" title={ui(t.teach.weakSkills.title)}>
        <p className="mt-1 max-w-prose text-sm text-muted">
          {fill(t.teach.weakSkills.subtitle, { minObservations: MIN_MASTERY_OBSERVATIONS })}
        </p>

        {data.weakSkills.length === 0 ? (
          <div className="mt-3">
            <EmptyState title={ui(t.teach.weakSkills.empty)} body={ui(t.teach.weakSkills.emptyBody)} />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {data.weakSkills.map((skill) => (
              <li key={skill.skillId}>
                <MasteryMeter
                  mastery={skill.averageMastery}
                  skillLabel={ui(fromDb(skill.name, locale, skill.code))}
                  confidence={skill.averageConfidence}
                  lowConfidenceLabel={ui(t.teach.weakSkills.lowConfidence)}
                />
                <p className="mt-1 text-xs text-muted">
                  {`${t.teach.weakSkills.studentsTracked}: ${skill.studentsTracked} · ${t.teach.weakSkills.observations}: ${skill.observations}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --- Clases --------------------------------------------------------- */}
      <Card padding="md" title={ui(t.teach.classes.title)}>
        {data.classes.length === 0 ? (
          <div className="mt-3">
            <EmptyState title={ui(t.teach.classes.empty)} body={ui(t.teach.classes.emptyBody)} />
          </div>
        ) : (
          <div className="mt-3">
            <Table
              caption={ui(t.teach.classes.caption)}
              hideCaption
              rowKey={(row) => row.id}
              rows={[...data.classes]}
              columns={[
                { key: "name", header: ui(t.teach.classes.name), rowHeader: true, cell: (r) => r.name },
                { key: "year", header: ui(t.teach.classes.yearLevel), align: "end", cell: (r) => String(r.yearLevel) },
                { key: "ay", header: ui(t.teach.classes.academicYear), cell: (r) => r.academicYear },
                {
                  key: "students",
                  header: ui(t.teach.classes.studentCount),
                  align: "end",
                  cell: (r) => String(r.studentCount),
                },
                {
                  key: "assignments",
                  header: ui(t.teach.classes.assignmentCount),
                  align: "end",
                  cell: (r) => String(r.assignmentCount),
                },
              ]}
            />
          </div>
        )}
      </Card>

      {/* --- Exámenes asignados --------------------------------------------- */}
      <Card padding="md" title={ui(t.teach.assignments.title)}>
        {data.assignments.length === 0 ? (
          <div className="mt-3">
            <EmptyState title={ui(t.teach.assignments.empty)} body={ui(t.teach.assignments.emptyBody)} />
          </div>
        ) : (
          <div className="mt-3">
            <Table
              caption={ui(t.teach.assignments.caption)}
              hideCaption
              rowKey={(row) => row.id}
              rows={[...data.assignments]}
              columns={[
                {
                  key: "exam",
                  header: ui(t.teach.assignments.exam),
                  rowHeader: true,
                  cell: (r) => fromDb(r.examTitle, locale, t.common.unknown),
                },
                {
                  key: "section",
                  header: ui(t.teach.assignments.section),
                  cell: (r) => r.sectionName ?? t.common.none,
                },
                {
                  key: "window",
                  header: ui(t.teach.assignments.window),
                  cell: (r) => `${when(r.opensAt)} → ${when(r.closesAt)}`,
                },
                {
                  key: "submitted",
                  header: ui(t.teach.assignments.submitted),
                  align: "end",
                  cell: (r) => String(r.submitted),
                },
                {
                  key: "inProgress",
                  header: ui(t.teach.assignments.inProgress),
                  align: "end",
                  cell: (r) => String(r.inProgress),
                },
                {
                  key: "notStarted",
                  header: ui(t.teach.assignments.notStarted),
                  align: "end",
                  cell: (r) => String(r.notStarted),
                },
                {
                  key: "avg",
                  header: ui(t.teach.assignments.averageScore),
                  align: "end",
                  cell: (r) => (r.averagePct === null ? t.common.none : `${r.averagePct.toFixed(1)} %`),
                },
              ]}
            />
          </div>
        )}
      </Card>

      {/* --- Intentos recientes --------------------------------------------- */}
      <Card padding="md" title={ui(t.teach.attempts.title)}>
        {data.recentAttempts.length === 0 ? (
          <div className="mt-3">
            <EmptyState title={ui(t.teach.attempts.empty)} body={ui(t.teach.attempts.emptyBody)} />
          </div>
        ) : (
          <div className="mt-3">
            <Table
              caption={ui(t.teach.attempts.caption)}
              hideCaption
              rowKey={(row) => row.id}
              rows={[...data.recentAttempts]}
              columns={[
                {
                  key: "student",
                  header: ui(t.common.student),
                  rowHeader: true,
                  cell: (r) => r.studentName,
                },
                {
                  key: "exam",
                  header: ui(t.common.exam),
                  cell: (r) => fromDb(r.examTitle, locale, t.common.unknown),
                },
                {
                  key: "status",
                  header: ui(t.common.status),
                  cell: (r) => (
                    <Badge tone={statusTone(r.status)}>
                      {t.attemptStatus[r.status as keyof StaffDictionary["attemptStatus"]] ?? r.status}
                    </Badge>
                  ),
                },
                { key: "started", header: ui(t.teach.attempts.started), cell: (r) => when(r.startedAt) },
                {
                  key: "submitted",
                  header: ui(t.teach.attempts.submitted),
                  cell: (r) => (r.submittedAt === null ? t.common.none : when(r.submittedAt)),
                },
                {
                  key: "score",
                  header: ui(t.common.score),
                  align: "end",
                  cell: (r) => (r.scorePct === null ? t.common.none : `${r.scorePct.toFixed(1)} %`),
                },
                {
                  key: "open",
                  header: ui(t.common.view),
                  cell: (r) => (
                    <a className="underline underline-offset-2" href={`/teach/attempts/${r.id}`}>
                      {t.teach.attempts.openLabel}
                    </a>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function statusTone(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "graded":
      return "success";
    case "in_progress":
      return "info";
    case "submitted":
    case "grading":
      return "neutral";
    case "voided":
      return "danger";
    default:
      return "warning";
  }
}
