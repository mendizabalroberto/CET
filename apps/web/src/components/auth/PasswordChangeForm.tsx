"use client";

/**
 * Formulario de cambio de contraseña del personal.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Deliberadamente austero. Quien llega aquí es un adulto que acaba de entrar
 * por primera vez con una contraseña provisional y quiere terminar cuanto antes:
 * tres campos, un botón, y el mensaje de error pegado al campo que lo causó.
 */

import { useActionState } from "react";

import { Alert, Button, Input } from "@/components/ui";
import { changeStaffPassword } from "@/lib/auth/password-actions";
import {
  IDLE_PASSWORD_STATE,
  MIN_STAFF_PASSWORD_LENGTH,
  type PasswordErrorCode,
} from "@/lib/auth/password-state";

type Texto = { readonly es: string; readonly en: string };

const MESSAGES: Record<PasswordErrorCode, Texto> = {
  required: { es: "Escribe tu contraseña actual.", en: "Enter your current password." },
  too_short: {
    es: `La contraseña nueva necesita al menos ${MIN_STAFF_PASSWORD_LENGTH} caracteres.`,
    en: `The new password needs at least ${MIN_STAFF_PASSWORD_LENGTH} characters.`,
  },
  mismatch: { es: "Las dos contraseñas nuevas no coinciden.", en: "The two new passwords do not match." },
  bad_current: { es: "La contraseña actual no es correcta.", en: "That current password is not correct." },
  weak: {
    es: "Esa contraseña es demasiado fácil de adivinar. Elige otra.",
    en: "That password is too easy to guess. Choose another one.",
  },
  same: {
    es: "La contraseña nueva tiene que ser distinta de la actual.",
    en: "The new password must be different from the current one.",
  },
  unexpected: {
    es: "No hemos podido cambiarla. Inténtalo de nuevo en un momento.",
    en: "We couldn't change it. Please try again in a moment.",
  },
};

const LABELS = {
  current: { es: "Contraseña actual", en: "Current password" },
  next: { es: "Contraseña nueva", en: "New password" },
  repeat: { es: "Repite la contraseña nueva", en: "Repeat the new password" },
  hint: {
    es: `Al menos ${MIN_STAFF_PASSWORD_LENGTH} caracteres. Una frase que recuerdes vale más que un símbolo raro.`,
    en: `At least ${MIN_STAFF_PASSWORD_LENGTH} characters. A phrase you'll remember beats an odd symbol.`,
  },
} as const;

export function PasswordChangeForm() {
  const [state, formAction, isPending] = useActionState(changeStaffPassword, IDLE_PASSWORD_STATE);

  const mensaje = state.error === undefined ? null : MESSAGES[state.error];

  /**
   * El error se pasa por la prop `error` de `<Input>` y no con un
   * `aria-describedby` a mano: el componente ya asocia el mensaje al campo y
   * marca `aria-invalid`. Cablearlo por fuera duplicaria el trabajo y es
   * exactamente donde aparecen los `aria-describedby` que apuntan a un id
   * inexistente.
   */
  const errorDe = (field: string): Texto | undefined =>
    state.field === field && mensaje !== null ? mensaje : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {/* Resumen arriba ADEMAS del error en el campo: quien usa lector de
          pantalla no siempre esta sobre el campo cuando se envia el formulario. */}
      {mensaje !== null && state.field === undefined ? (
        <Alert tone="danger" live title={mensaje}>
          {""}
        </Alert>
      ) : null}

      <Input
        name="currentPassword"
        type="password"
        label={LABELS.current}
        autoComplete="current-password"
        required
        disabled={isPending}
        error={errorDe("currentPassword")}
      />

      <Input
        name="newPassword"
        type="password"
        label={LABELS.next}
        help={LABELS.hint}
        autoComplete="new-password"
        minLength={MIN_STAFF_PASSWORD_LENGTH}
        required
        disabled={isPending}
        error={errorDe("newPassword")}
      />

      <Input
        name="confirmPassword"
        type="password"
        label={LABELS.repeat}
        autoComplete="new-password"
        required
        disabled={isPending}
        error={errorDe("confirmPassword")}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando…" : "Guardar y continuar"}
      </Button>
    </form>
  );
}
