"use client";

/**
 * @cet/ui — SubmitDialog.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";
import { Dialog } from "../primitives/Dialog.js";
import { Button } from "../primitives/Button.js";

export interface SubmitDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Ordinales (base 1) sin responder. */
  readonly unanswered: readonly number[];
  /** Entregar. La entrega real la hace el servidor. */
  readonly onSubmit: () => void;
  /** Volver al examen, opcionalmente saltando a una pregunta. */
  readonly onReview: (ordinal?: number) => void;
  /** Entrega en curso: deshabilita para evitar el doble envio. */
  readonly submitting?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Confirmacion de entrega del examen.
 *
 * Decisiones:
 *  - Lista las preguntas sin responder Y deja saltar a cada una con un clic.
 *    Decirle a un nino "te faltan 3" sin decirle cuales es una crueldad
 *    innecesaria cuando quedan dos minutos.
 *  - El boton de confirmar NO es de tono peligro. Entregar el examen es lo que
 *    toca hacer, no una accion destructiva; pintarlo de rojo genera una duda que
 *    no corresponde.
 *  - `submitting` deshabilita el boton: el doble submit es uno de los casos
 *    limite del MASTER_PLAN, y aqui se corta en la primera capa (el servidor lo
 *    corta en la ultima).
 *  - No hay X de cerrar: hay que elegir entre revisar o entregar. Escape sigue
 *    funcionando y equivale a revisar, para no atrapar a nadie.
 */
export function SubmitDialog({
  open,
  onOpenChange,
  unanswered,
  onSubmit,
  onReview,
  submitting = false,
  className,
}: SubmitDialogProps): ReactNode {
  const t = useI18n();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        if (!next) onReview();
        onOpenChange(next);
      }}
      title={UI_STRINGS.submitTitle}
      description={UI_STRINGS.submitBody}
      hideCloseButton
      className={className}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onReview()}
            disabled={submitting}
            data-cet-id="examen.dialogo.revisar"
          >
            {t(UI_STRINGS.submitReview)}
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={submitting} data-cet-id="examen.dialogo.entregar">
            {t(submitting ? UI_STRINGS.submitting : UI_STRINGS.submitConfirm)}
          </Button>
        </>
      }
    >
      {unanswered.length === 0 ? null : (
        <div className="rounded-md border-l-4 border-l-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)] px-4 py-3">
          <p className="mb-2 font-bold text-[var(--cet-ink)]">
            {t(UI_STRINGS.submitUnanswered)} ({unanswered.length})
          </p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {unanswered.map((ordinal) => (
              <li key={ordinal}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => onReview(ordinal)}
                  aria-label={`${t(UI_STRINGS.question)} ${ordinal}, ${t(UI_STRINGS.unanswered)}`}
                  className={cn(
                    "flex h-touch w-touch items-center justify-center rounded-sm border-2",
                    "border-[var(--cet-hint-accent)] bg-[var(--cet-surface)] font-bold text-[var(--cet-ink)]",
                    "hover:bg-[var(--cet-surface-2)] disabled:opacity-50",
                  )}
                >
                  <span aria-hidden="true">{ordinal}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
