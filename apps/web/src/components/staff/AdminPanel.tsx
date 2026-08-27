"use client";

/**
 * /admin — gestión de alumnos, cola de registro y visor de auditoría.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Reglas de UI que vienen de `modules/admin/CLAUDE.md` §5:
 *  · Nada de borrado real. Se desbloquea, se regenera, se rechaza. Nunca DELETE.
 *  · El PIN generado se muestra UNA vez, en un aviso que no desaparece solo.
 *  · Las tablas hacen scroll horizontal dentro de su contenedor (lo aporta
 *    `Table` de @cet/ui): el `body` de la página nunca hace scroll lateral.
 */
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { Locale } from "@cet/shared";
import { Badge, Card, EmptyState, Table } from "@cet/ui";

import {
  approveRegistration,
  createStudent,
  rejectRegistration,
  resetStudentPin,
  unlockStudent,
  type StaffActionState,
} from "./actions";
import { formatSchoolTime } from "./dates";
import { fill, ui, type StaffDictionary } from "./i18n";
import type { AdminData, AdminStudent, AuditEntry } from "./queries";

const INITIAL: StaffActionState = { ok: false };

interface Props {
  readonly data: AdminData;
  readonly locale: Locale;
  readonly t: StaffDictionary;
  readonly isSchoolAdmin: boolean;
}

export function AdminPanel({ data, locale, t, isSchoolAdmin }: Props): ReactNode {
  const tz = data.school.timezone;
  const when = (value: string | null): string => formatSchoolTime(value, tz, locale, "second");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">{t.admin.title}</h1>
        <p className="mt-1 max-w-prose text-muted">
          {fill(t.admin.subtitle, { school: data.school.name })}
        </p>
        <p className="mt-1 text-xs text-muted">{fill(t.common.timezoneNote, { timezone: tz })}</p>
      </header>

      <RegistrationQueue data={data} t={t} when={when} />
      <CreateStudentForm t={t} />
      <StudentTable data={data} t={t} when={when} />
      <AuditViewer entries={data.audit} available={data.auditAvailable && isSchoolAdmin} t={t} when={when} />
    </div>
  );
}

/* ========================================================================== */
/* Cola de registro                                                           */
/* ========================================================================== */

function RegistrationQueue({
  data,
  t,
  when,
}: {
  readonly data: AdminData;
  readonly t: StaffDictionary;
  readonly when: (value: string | null) => string;
}): ReactNode {
  const [approveState, approveAction] = useActionState(approveRegistration, INITIAL);
  const [rejectState, rejectAction] = useActionState(rejectRegistration, INITIAL);

  return (
    <Card padding="md" title={ui(t.admin.registrations.title)}>
      <ActionFeedback state={approveState} t={t} scope="registrations" />
      <ActionFeedback state={rejectState} t={t} scope="registrations" />

      {data.registrations.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={ui(t.admin.registrations.empty)} body={ui(t.admin.registrations.emptyBody)} />
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-4">
          {data.registrations.map((request) => (
            <li key={request.id} className="rounded-md border border-line px-4 py-3">
              <p className="font-semibold text-ink">{request.fullName}</p>
              <p className="text-sm text-muted">
                {`${t.admin.registrations.requestedYear}: ${request.requestedYearLevel}`}
                {request.guardianEmail === null
                  ? ""
                  : ` · ${t.admin.registrations.guardianEmail}: ${request.guardianEmail}`}
                {` · ${t.admin.registrations.requestedAt}: ${when(request.createdAt)}`}
              </p>
              {request.note === null ? null : (
                <p className="mt-1 text-sm text-ink">{`${t.admin.registrations.note}: ${request.note}`}</p>
              )}

              <div className="mt-3 flex flex-wrap items-end gap-4">
                <form action={approveAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="requestId" value={request.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-ink">{t.admin.students.studentCode}</span>
                    <input
                      name="studentCode"
                      required
                      pattern="[A-Za-z0-9._\-]{2,32}"
                      className="w-48 rounded-lg border border-line bg-card px-3 py-2 text-ink"
                    />
                  </label>
                  <SubmitButton label={t.admin.registrations.approve} />
                </form>

                <form action={rejectAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="requestId" value={request.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-ink">{t.admin.registrations.rejectReason}</span>
                    <input
                      name="reason"
                      required
                      maxLength={500}
                      className="w-64 rounded-lg border border-line bg-card px-3 py-2 text-ink"
                    />
                  </label>
                  <SubmitButton label={t.admin.registrations.reject} />
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ========================================================================== */
/* Alta de alumno                                                             */
/* ========================================================================== */

function CreateStudentForm({ t }: { readonly t: StaffDictionary }): ReactNode {
  const [state, action] = useActionState(createStudent, INITIAL);

  return (
    <Card padding="md" title={ui(t.admin.students.addTitle)} lead={ui(t.admin.students.addSubtitle)}>
      <ActionFeedback state={state} t={t} scope="students" />

      <form action={action} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t.admin.students.fullName}>
          <input name="fullName" required maxLength={200} className={INPUT} />
        </Field>

        <Field label={t.admin.students.studentCode} hint={t.admin.students.studentCodeHint}>
          <input name="studentCode" required pattern="[A-Za-z0-9._\-]{2,32}" className={INPUT} />
        </Field>

        <Field label={t.admin.students.yearLevelLabel}>
          <input name="yearLevel" type="number" min={1} max={13} required className={INPUT} />
        </Field>

        <Field label={t.admin.students.stageLabel}>
          <select name="stage" required defaultValue="primary" className={INPUT}>
            <option value="primary">{t.admin.students.stagePrimary}</option>
            <option value="secondary">{t.admin.students.stageSecondary}</option>
          </select>
        </Field>

        <Field label={t.admin.students.sectionLabel}>
          <input name="section" maxLength={40} className={INPUT} />
        </Field>

        <Field label={t.admin.students.guardianEmailLabel}>
          <input name="guardianEmail" type="email" className={INPUT} />
        </Field>

        <div className="sm:col-span-2">
          <SubmitButton label={t.admin.students.add} busyLabel={t.admin.students.adding} />
        </div>
      </form>
    </Card>
  );
}

const INPUT = "rounded-lg border border-line bg-card px-3 py-2 text-ink";

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {hint === undefined ? null : <span className="text-xs text-muted">{hint}</span>}
      {children}
    </label>
  );
}

/* ========================================================================== */
/* Alumnos                                                                    */
/* ========================================================================== */

function StudentTable({
  data,
  t,
  when,
}: {
  readonly data: AdminData;
  readonly t: StaffDictionary;
  readonly when: (value: string | null) => string;
}): ReactNode {
  const [resetState, resetAction] = useActionState(resetStudentPin, INITIAL);
  const [unlockState, unlockAction] = useActionState(unlockStudent, INITIAL);

  return (
    <Card padding="md" title={ui(t.admin.students.title)}>
      <ActionFeedback state={resetState} t={t} scope="students" />
      <ActionFeedback state={unlockState} t={t} scope="students" />

      {data.students.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={ui(t.admin.students.empty)} body={ui(t.admin.students.emptyBody)} />
        </div>
      ) : (
        <div className="mt-3">
          <Table
            caption={ui(t.admin.students.caption)}
            hideCaption
            rowKey={(row) => row.profileId}
            rows={[...data.students]}
            columns={[
              { key: "name", header: ui(t.admin.students.name), rowHeader: true, cell: (r) => r.fullName },
              { key: "code", header: ui(t.admin.students.code), cell: (r) => r.studentCode },
              { key: "year", header: ui(t.admin.students.yearLevel), align: "end", cell: (r) => String(r.yearLevel) },
              { key: "section", header: ui(t.admin.students.section), cell: (r) => r.section ?? t.common.none },
              {
                key: "state",
                header: ui(t.admin.students.status),
                cell: (r) => <StudentState student={r} t={t} when={when} />,
              },
              {
                key: "failed",
                header: ui(t.admin.students.failedAttempts),
                align: "end",
                cell: (r) => String(r.failedPinAttempts),
              },
              {
                key: "actions",
                header: ui(t.admin.students.actions),
                cell: (r) => (
                  <div className="flex flex-wrap gap-2">
                    <form action={resetAction}>
                      <input type="hidden" name="studentProfileId" value={r.profileId} />
                      <ConfirmButton
                        label={t.admin.students.resetPin}
                        confirm={fill(t.admin.students.confirmResetPin, { name: r.fullName })}
                      />
                    </form>
                    <form action={unlockAction}>
                      <input type="hidden" name="studentProfileId" value={r.profileId} />
                      <ConfirmButton
                        label={t.admin.students.unlock}
                        confirm={fill(t.admin.students.confirmUnlock, { name: r.fullName })}
                      />
                    </form>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}
    </Card>
  );
}

function StudentState({
  student,
  t,
  when,
}: {
  readonly student: AdminStudent;
  readonly t: StaffDictionary;
  readonly when: (value: string | null) => string;
}): ReactNode {
  if (student.lockedUntil !== null) {
    return <Badge tone="danger">{fill(t.admin.students.lockedUntil, { when: when(student.lockedUntil) })}</Badge>;
  }
  if (student.pinMustChange) return <Badge tone="warning">{t.admin.students.pinMustChange}</Badge>;
  return <Badge tone="success">{t.admin.students.notLocked}</Badge>;
}

/* ========================================================================== */
/* Visor de auditoría                                                         */
/* ========================================================================== */

function AuditViewer({
  entries,
  available,
  t,
  when,
}: {
  readonly entries: readonly AuditEntry[];
  readonly available: boolean;
  readonly t: StaffDictionary;
  readonly when: (value: string | null) => string;
}): ReactNode {
  const [filter, setFilter] = useState("");
  const actions = [...new Set(entries.map((e) => e.action))].sort();
  const visible = filter === "" ? entries : entries.filter((e) => e.action === filter);

  return (
    <Card padding="md" title={ui(t.admin.audit.title)} lead={ui(t.admin.audit.subtitle)}>
      {!available ? (
        <div className="mt-3">
          <EmptyState title={ui(t.admin.audit.teacherDenied)} />
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={ui(t.admin.audit.empty)} body={ui(t.admin.audit.emptyBody)} />
        </div>
      ) : (
        <>
          <label className="mt-3 flex w-fit flex-col gap-1 text-sm">
            <span className="font-medium text-ink">{t.admin.audit.filterAction}</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className={INPUT}
            >
              <option value="">{t.admin.audit.filterAll}</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-3">
            <Table
              caption={ui(t.admin.audit.caption)}
              hideCaption
              rowKey={(row) => String(row.id)}
              rows={[...visible]}
              columns={[
                { key: "when", header: ui(t.admin.audit.when), rowHeader: true, cell: (r) => when(r.createdAt) },
                { key: "actor", header: ui(t.admin.audit.actor), cell: (r) => r.actorName ?? r.actorId ?? t.common.unknown },
                { key: "role", header: ui(t.admin.audit.actorRole), cell: (r) => r.actorRole ?? t.common.none },
                { key: "action", header: ui(t.admin.audit.action), cell: (r) => <Badge tone="neutral">{r.action}</Badge> },
                { key: "entity", header: ui(t.admin.audit.entity), cell: (r) => r.entityType },
                { key: "entityId", header: ui(t.admin.audit.entityId), cell: (r) => r.entityId ?? t.common.none },
                {
                  key: "details",
                  header: ui(t.admin.audit.details),
                  cell: (r) => <AuditDetails entry={r} t={t} />,
                },
              ]}
            />
          </div>
        </>
      )}
    </Card>
  );
}

function AuditDetails({
  entry,
  t,
}: {
  readonly entry: AuditEntry;
  readonly t: StaffDictionary;
}): ReactNode {
  if (entry.before === null && entry.after === null) return <span>{t.common.none}</span>;
  return (
    <details>
      <summary className="cursor-pointer text-sm underline underline-offset-2">
        {t.admin.audit.showDetails}
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-xs">
        {entry.before === null ? null : (
          <div>
            <p className="font-semibold">{t.admin.audit.before}</p>
            <pre className="overflow-x-auto rounded bg-[var(--cet-surface-3)] p-2">
              {JSON.stringify(entry.before, null, 2)}
            </pre>
          </div>
        )}
        {entry.after === null ? null : (
          <div>
            <p className="font-semibold">{t.admin.audit.after}</p>
            <pre className="overflow-x-auto rounded bg-[var(--cet-surface-3)] p-2">
              {JSON.stringify(entry.after, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}

/* ========================================================================== */
/* Piezas comunes                                                             */
/* ========================================================================== */

/**
 * Traduce la CLAVE que devuelve la Server Action.
 *
 * El PIN de un solo uso se pinta en un aviso persistente, no en un toast: un
 * mensaje que se va solo a los cinco segundos es exactamente cómo se pierde la
 * única copia de una credencial.
 */
function ActionFeedback({
  state,
  t,
  scope,
}: {
  readonly state: StaffActionState;
  readonly t: StaffDictionary;
  readonly scope: "students" | "registrations";
}): ReactNode {
  // Hallazgo P2-5: la búsqueda miraba SOLO el ámbito del formulario. Pero
  // `approveRegistration` delega en `createStudent`, así que devuelve claves del
  // ámbito `students` (`codeTaken`, `pinOnce`) desde un formulario de
  // `registrations`. El resultado era que el PIN de un alumno recién aprobado
  // se anunciaba con el texto crudo "pinOnce". Se buscan los dos ámbitos, con
  // el propio primero.
  const other = scope === "students" ? "registrations" : "students";
  const errors = {
    ...(t.admin[other].errors as Record<string, string | undefined>),
    ...(t.admin[scope].errors as Record<string, string | undefined>),
  };
  const messages = {
    ...(t.admin[other] as unknown as Record<string, string | undefined>),
    ...(t.admin[scope] as unknown as Record<string, string | undefined>),
  };

  if (state.errorKey !== undefined) {
    return (
      <p role="alert" className="mt-2 rounded-md bg-[var(--cet-no-bg)] px-3 py-2 text-sm text-[var(--cet-no-text)]">
        {fill(errors[state.errorKey] ?? errors["unexpected"] ?? state.errorKey, state.values ?? {})}
      </p>
    );
  }

  if (state.ok && state.successKey !== undefined) {
    const template = messages[state.successKey] ?? state.successKey;
    return (
      <p
        role="status"
        className={
          state.oneTimePin === undefined
            ? "mt-2 rounded-md bg-[var(--cet-ok-bg)] px-3 py-2 text-sm text-[var(--cet-ok-text)]"
            : "mt-2 rounded-md border-2 border-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)] px-3 py-2 text-sm font-semibold text-[var(--cet-hint-text)]"
        }
      >
        {fill(template, state.values ?? {})}
      </p>
    );
  }

  return null;
}

function SubmitButton({
  label,
  busyLabel,
}: {
  readonly label: string;
  readonly busyLabel?: string;
}): ReactNode {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
    >
      {pending && busyLabel !== undefined ? busyLabel : label}
    </button>
  );
}

/**
 * Confirmación explícita antes de una acción sobre la credencial de un menor.
 * `confirm()` es bloqueante y feo, pero es accesible por teclado y por lector
 * de pantalla sin JavaScript adicional, y esta acción no admite un "deshacer".
 */
function ConfirmButton({
  label,
  confirm,
}: {
  readonly label: string;
  readonly confirm: string;
}): ReactNode {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
      className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-60"
    >
      {label}
    </button>
  );
}
