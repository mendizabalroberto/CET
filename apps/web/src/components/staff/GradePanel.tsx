"use client";

/**
 * /teach/attempts/[attemptId]/grade — corrección manual.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Cada envío INSERTA una fila nueva en `attempt_gradings`. La UI lo dice
 * explícitamente ("esto sustituirá a la nota actual; la anterior se conserva")
 * porque un profesor que cree estar editando una nota escribe una justificación
 * distinta de uno que sabe que está firmando una revisión.
 */
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { Locale } from "@cet/shared";
import { Badge, Card, EmptyState, MathStem } from "@cet/ui";

import { gradeItemManually, type StaffActionState } from "./actions";
import { formatSchoolTime } from "./dates";
import { orderGradingChain } from "./grading-chain";
import { fill, fromDb, ui, type StaffDictionary } from "./i18n";
import type { ManualGradingItem, ManualGradingView } from "./queries";

const INITIAL: StaffActionState = { ok: false };

interface Props {
  readonly data: ManualGradingView;
  readonly locale: Locale;
  readonly t: StaffDictionary;
}

export function GradePanel({ data, locale, t }: Props): ReactNode {
  const status = data.attempt.status;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm">
          <a className="underline underline-offset-2" href={`/teach/attempts/${data.attempt.id}`}>
            {t.nav.backToAttempt}
          </a>
        </p>
        <h1 className="mt-2 text-2xl font-bold text-ink">{t.grade.title}</h1>
        <p className="mt-1 max-w-prose text-muted">{t.grade.subtitle}</p>
        <p className="mt-2 text-lg font-semibold text-ink">
          {fill(t.grade.heading, {
            student: data.studentName,
            exam: fromDb(data.examTitle, locale, t.common.unknown),
          })}
        </p>
      </header>

      {status === "voided" ? (
        <EmptyState title={ui(t.grade.voided)} />
      ) : status === "in_progress" ? (
        <EmptyState title={ui(t.grade.notSubmitted)} body={ui(t.grade.notSubmittedBody)} />
      ) : data.items.length === 0 ? (
        <EmptyState title={ui(t.grade.noManualItems)} body={ui(t.grade.noManualItemsBody)} />
      ) : (
        data.items.map((item) => (
          <GradeForm
            key={item.itemId}
            attemptId={data.attempt.id}
            item={item}
            timezone={data.school.timezone}
            locale={locale}
            t={t}
          />
        ))
      )}
    </div>
  );
}

function GradeForm({
  attemptId,
  item,
  timezone,
  locale,
  t,
}: {
  readonly attemptId: string;
  readonly item: ManualGradingItem;
  readonly timezone: string;
  readonly locale: Locale;
  readonly t: StaffDictionary;
}): ReactNode {
  const [state, action] = useActionState(gradeItemManually, INITIAL);
  const chain = orderGradingChain(item.gradings);
  const current = item.currentGrading;

  const errorText =
    state.errorKey === undefined
      ? null
      : fill(
          t.grade.errors[state.errorKey as keyof StaffDictionary["grade"]["errors"]] ??
            t.grade.errors.unexpected,
          state.values ?? {},
        );

  return (
    <Card padding="md">
      <h2 className="text-lg font-bold text-ink">{fill(t.grade.itemHeading, { ord: item.ord })}</h2>

      <div className="mt-3 rounded-md border border-line bg-surface px-4 py-3">
        <MathStem html={item.stem} />
      </div>

      <p className="mt-3 text-sm">
        <span className="text-muted">{t.attempt.item.rawResponse}: </span>
        <code className="whitespace-pre-wrap break-words text-xs">
          {item.finalResponse === null ? "∅" : JSON.stringify(item.finalResponse)}
        </code>
      </p>

      <p className="mt-3 text-sm">
        <span className="text-muted">{t.grade.currentMark}: </span>
        {current === null ? (
          <span className="text-ink">{t.grade.noCurrentMark}</span>
        ) : (
          <span className="font-semibold text-ink">
            {`${current.points_awarded} / ${current.max_points}`}
            {` · ${t.gradedBy[current.graded_by]}`}
            {` · ${formatSchoolTime(current.graded_at, timezone, locale, "second")}`}
          </span>
        )}
        {chain.length > 1 ? (
          <>
            {" "}
            <Badge tone="warning">{fill(t.attempt.grading.chainNote, { count: chain.length - 1 })}</Badge>
          </>
        ) : null}
      </p>

      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="attemptId" value={attemptId} />
        <input type="hidden" name="attemptItemId" value={item.itemId} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">
            {fill(t.grade.pointsLabel, { max: item.maxPoints })}
          </span>
          <input
            name="points"
            type="number"
            inputMode="decimal"
            step="0.25"
            min={0}
            max={item.maxPoints}
            required
            defaultValue={current?.points_awarded ?? 0}
            className="w-32 rounded-lg border border-line bg-card px-3 py-2 text-ink"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">{t.grade.rationaleLabel}</span>
          <span className="text-xs text-muted">{t.grade.rationaleHint}</span>
          <textarea
            name="rationale"
            required
            rows={3}
            maxLength={2000}
            className="rounded-lg border border-line bg-card px-3 py-2 text-ink"
          />
        </label>

        {current === null ? null : (
          <p className="text-xs text-[var(--cet-hint-text)]">{t.grade.supersedesNote}</p>
        )}

        {errorText === null ? null : (
          <p role="alert" className="text-sm text-[var(--cet-no-text)]">
            {errorText}
          </p>
        )}
        {state.ok ? (
          <p role="status" className="text-sm text-[var(--cet-ok-text)]">
            {t.grade.success}
          </p>
        ) : null}

        <SubmitButton idle={t.grade.submit} busy={t.grade.saving} />
      </form>
    </Card>
  );
}

function SubmitButton({ idle, busy }: { readonly idle: string; readonly busy: string }): ReactNode {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-fit rounded-lg border border-line bg-card px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
    >
      {pending ? busy : idle}
    </button>
  );
}
