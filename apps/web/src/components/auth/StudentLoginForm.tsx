/**
 * Login de alumno en 3 pasos: colegio → código → PIN (AD-3).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUÉ TRES PASOS Y NO UN FORMULARIO CON TRES CAMPOS
 * Un niño de 11 años delante de tres campos a la vez se equivoca de casilla. Un
 * paso, una decisión, un botón grande. Y el PIN aparece solo cuando ya se sabe
 * de qué colegio es, que es lo que determina cuántas casillas dibujar.
 *
 * Los tres pasos viven en UN SOLO <form>: los valores de los pasos anteriores
 * viajan en inputs ocultos, así que la Server Action recibe todo de golpe y no
 * hace falta guardar estado a medias en el servidor.
 */
"use client";

import { useActionState, useId, useMemo, useState } from "react";

import { authErrorMessage } from "@/components/auth/errorMessage";
import { PinInput } from "@/components/auth/PinInput";
import { signInStudent } from "@/lib/auth/actions";
import { IDLE_STATE } from "@/lib/auth/state";
import { useI18n } from "@/lib/i18n/provider";

/**
 * El alumno que este dispositivo ya recuerda. Solo el nombre de pila y cuantas
 * casillas dibujar: quien encuentre la tablet perdida no debe poder sacar de
 * aqui la ficha de un menor.
 */
export interface DispositivoRecordado {
  readonly nombreDePila: string;
  readonly longitudDePin: 4 | 6;
}

export interface SchoolOption {
  readonly id: string;
  readonly name: string;
  readonly pinLengthPrimary: number;
  readonly pinLengthSecondary: number;
}

const TOTAL_STEPS = 3;

export function StudentLoginForm({
  schools,
  dispositivo,
}: {
  readonly schools: readonly SchoolOption[];
  /**
   * Presente solo si este navegador trae una cookie de dispositivo valida. Con
   * el, los pasos 1 y 2 sobran: el dispositivo ya identifico al nino y solo
   * queda demostrar que es el.
   *
   * Ojo con lo que ESTO NO ES: la cookie no abre sesion. Lo unico que compra es
   * saltarse dos pasos del formulario; el PIN sigue yendo a Argon2id.
   */
  readonly dispositivo?: DispositivoRecordado | undefined;
}) {
  const { t, fmt } = useI18n();
  const [state, formAction, isPending] = useActionState(signInStudent, IDLE_STATE);

  /**
   * «¿No eres tu?» devuelve al recorrido de tres pasos. Tiene que existir: un
   * nino que coge la tablet de su hermano no puede quedarse encerrado en una
   * pantalla que saluda a otro.
   */
  const [ignorarDispositivo, setIgnorarDispositivo] = useState(false);
  const recordado = ignorarDispositivo ? undefined : dispositivo;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [schoolId, setSchoolId] = useState<string>("");
  const [studentCode, setStudentCode] = useState<string>("");

  const errorId = useId();
  const codeFieldId = useId();
  const schoolFieldId = useId();

  const school = useMemo(() => schools.find((s) => s.id === schoolId), [schools, schoolId]);

  /**
   * Cuántas casillas dibujar. No sabemos si el alumno es de primaria o de
   * secundaria hasta que la Edge Function lo autentica — y no debemos saberlo
   * antes, porque revelarlo a partir del código sería filtrar información sobre
   * un menor. Se empieza por la longitud de primaria y, si el colegio usa dos
   * longitudes distintas, se ofrece cambiar.
   */
  const [useSecondaryLength, setUseSecondaryLength] = useState(false);
  const primaryLength = school?.pinLengthPrimary ?? 4;
  const secondaryLength = school?.pinLengthSecondary ?? 6;
  const pinLength = recordado ? recordado.longitudDePin : useSecondaryLength ? secondaryLength : primaryLength;
  const lengthsDiffer = primaryLength !== secondaryLength;

  const message = authErrorMessage(state.error, t, fmt, pinLength);
  const S = t.auth.student;

  /*
   * Identidad del intento actual. Cambia cada vez que la Server Action devuelve
   * un error, lo que remonta el <PinInput> y deja las casillas en blanco.
   * `useActionState` devuelve un objeto nuevo por cada ejecución, así que basta
   * con contar cuántas veces hemos visto uno en estado de error.
   */
  const attemptKey = state.status === "error" ? errorId + String(state.error) : "first";

  // Con dispositivo recordado hay UN paso y no tres, asi que el contador
  // desaparece: «paso 1 de 1» es ruido, no informacion.
  const pasoVisible = recordado ? 3 : step;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {recordado ? (
        <p className="text-sm font-semibold uppercase tracking-wider text-muted">
          {fmt(t.tutor.redeem.greeting, { name: recordado.nombreDePila })}
        </p>
      ) : (
        <p className="text-sm font-semibold uppercase tracking-wider text-muted">
          {fmt(S.stepOf, { current: step, total: TOTAL_STEPS })}
        </p>
      )}

      {/* El error se anuncia siempre, en cualquier paso. `role="alert"` hace que
          el lector de pantalla lo lea sin que el usuario tenga que ir a buscarlo. */}
      {message ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {message}
        </p>
      ) : null}

      {/* ---------------- Paso 1: colegio ---------------- */}
      {pasoVisible === 1 ? (
        <div className="space-y-3">
          <label htmlFor={schoolFieldId} className="block text-lg font-semibold text-ink">
            {S.schoolLabel}
          </label>
          <select
            id={schoolFieldId}
            value={schoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            className="w-full rounded-xl border-2 border-line bg-card px-4 py-3.5 text-lg text-ink focus:border-teal focus-visible:outline-none"
          >
            <option value="">{S.schoolPlaceholder}</option>
            {schools.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted">{S.schoolHelp}</p>

          <button
            type="button"
            disabled={!schoolId}
            onClick={() => setStep(2)}
            className="w-full rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-on-brand disabled:opacity-40"
          >
            {t.common.continue}
          </button>
        </div>
      ) : null}

      {/* ---------------- Paso 2: código ---------------- */}
      {pasoVisible === 2 ? (
        <div className="space-y-3">
          <label htmlFor={codeFieldId} className="block text-lg font-semibold text-ink">
            {S.codeLabel}
          </label>
          <input
            id={codeFieldId}
            value={studentCode}
            onChange={(event) => setStudentCode(event.target.value)}
            placeholder={S.codePlaceholder}
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            className="w-full rounded-xl border-2 border-line bg-card px-4 py-3.5 text-lg tracking-wide text-ink focus:border-teal focus-visible:outline-none"
          />
          <p className="text-sm text-muted">{S.codeHelp}</p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border-2 border-line px-5 py-4 text-lg font-semibold text-ink"
            >
              {t.common.back}
            </button>
            <button
              type="button"
              disabled={studentCode.trim().length === 0}
              onClick={() => setStep(3)}
              className="flex-1 rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-on-brand disabled:opacity-40"
            >
              {t.common.continue}
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------------- Paso 3: PIN ---------------- */}
      {pasoVisible === 3 ? (
        <div className="space-y-5">
          <PinInput
            /*
             * `key` fuerza a recrear el componente en dos casos:
             *  - cambia la longitud (si no, quedarían dígitos de la anterior);
             *  - vuelve un error nuevo, y entonces las casillas se vacían solas.
             * Dejar el PIN fallido escrito hace que el niño pulse "entrar" otra
             * vez con lo mismo y gaste un intento del lockout sin darse cuenta.
             */
            key={`${pinLength}:${attemptKey}`}
            length={pinLength}
            label={S.pinLabel}
            help={pinLength === 4 ? S.pinHelp4 : S.pinHelp6}
            {...(message ? { errorId } : {})}
            autoFocus
            disabled={isPending}
          />

          {lengthsDiffer && !recordado ? (
            <button
              type="button"
              onClick={() => setUseSecondaryLength((prev) => !prev)}
              className="text-sm font-semibold text-teal underline underline-offset-2"
            >
              {fmt(S.pinLengthToggle, {
                length: useSecondaryLength ? primaryLength : secondaryLength,
              })}
            </button>
          ) : null}

          <div className="flex gap-3">
            {recordado ? null : (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-xl border-2 border-line px-5 py-4 text-lg font-semibold text-ink"
              >
                {t.common.back}
              </button>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-xl bg-brand px-6 py-4 text-lg font-semibold text-on-brand disabled:opacity-60"
            >
              {isPending ? S.signingIn : S.signIn}
            </button>
          </div>

          <p className="text-center text-sm text-muted">
            {S.wrongPersonQuestion}{" "}
            <button
              type="button"
              onClick={() => {
                setIgnorarDispositivo(true);
                setStep(1);
                setStudentCode("");
              }}
              className="font-semibold text-teal underline underline-offset-2"
            >
              {S.startOver}
            </button>
          </p>
        </div>
      ) : null}

      {/* Valores de los pasos anteriores. Se envían siempre, se vea el paso o no. */}
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="studentCode" value={studentCode.trim()} />
      {/* El secreto NO viaja por aqui: vive en una cookie `HttpOnly` que este
          JavaScript no puede leer, y la Server Action la lee del lado servidor.
          Lo unico que dice este campo es POR QUE PUERTA se entra. */}
      {recordado ? <input type="hidden" name="porDispositivo" value="1" /> : null}
    </form>
  );
}
