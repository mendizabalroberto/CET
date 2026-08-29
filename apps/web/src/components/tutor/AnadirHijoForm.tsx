/**
 * Añadir un hijo. Tres campos y ninguno de más.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * NO SE PREGUNTA POR LA ETAPA
 * ---------------------------------------------------------------------------
 * La etapa —y con ella cuántas casillas de PIN se dibujarán— sale del curso
 * (`etapaDeCurso` en `lib/tutor/schemas`). Un padre no tiene por qué saber qué
 * significa «primary» ni por qué eso cambia la longitud de un PIN.
 *
 * LA FECHA DE NACIMIENTO SE PIDE Y NO SE GUARDA
 * Sirve para sugerir el curso y ahí acaba su vida: `students` no tiene columna
 * para ella y no se le añade ninguna. Guardar la fecha de nacimiento de un
 * menor «por si acaso» es exactamente lo que la minimización de datos prohíbe,
 * y el texto de ayuda se lo dice al tutor en su cara.
 */
"use client";

import { useActionState, useId } from "react";

import { useI18n } from "@/lib/i18n/provider";
import { crearHijo } from "@/lib/tutor/actions";

const ESTADO_INICIAL = { ok: false } as const;

const CURSOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

export function AnadirHijoForm() {
  const { t } = useI18n();
  const [state, formAction, isPending] = useActionState(crearHijo, ESTADO_INICIAL);

  const nombreId = useId();
  const fechaId = useId();
  const cursoId = useId();

  const A = t.tutor.add;

  const mensaje =
    state.errorKey === undefined
      ? null
      : (t.tutor.errors[state.errorKey as keyof typeof t.tutor.errors] ?? t.tutor.errors.generic);

  return (
    <form action={formAction} className="space-y-5 rounded-2xl border-2 border-line bg-card p-5">
      <h2 className="text-lg font-bold text-ink">{A.title}</h2>

      {mensaje ? (
        <p
          role="alert"
          className="rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {mensaje}
        </p>
      ) : null}

      <div className="space-y-2">
        <label htmlFor={nombreId} className="block font-semibold text-ink">
          {A.fullNameLabel}
        </label>
        <input
          id={nombreId}
          name="fullName"
          required
          autoComplete="off"
          className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-ink focus:border-teal focus-visible:outline-none"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={fechaId} className="block font-semibold text-ink">
          {A.birthDateLabel}
        </label>
        <input
          id={fechaId}
          name="fechaNacimiento"
          type="date"
          required
          aria-describedby={`${fechaId}-help`}
          className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-ink focus:border-teal focus-visible:outline-none"
        />
        <p id={`${fechaId}-help`} className="text-sm text-muted">
          {A.birthDateHelp}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor={cursoId} className="block font-semibold text-ink">
          {A.yearLevelLabel}
        </label>
        <select
          id={cursoId}
          name="yearLevel"
          defaultValue="6"
          className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-ink focus:border-teal focus-visible:outline-none"
        >
          {CURSOS.map((curso) => (
            <option key={curso} value={curso}>
              {curso}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-on-brand disabled:opacity-60"
      >
        {isPending ? A.submitting : A.submit}
      </button>
    </form>
  );
}
