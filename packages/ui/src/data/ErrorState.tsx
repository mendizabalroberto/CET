"use client";

/**
 * @cet/ui — ErrorState.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { UI_STRINGS } from "../lib/strings.js";
import { Button } from "../primitives/Button.js";

export type ErrorKind = "generic" | "offline";

export interface ErrorStateProps {
  /** `offline` cambia el mensaje: sin conexion no es un fallo del sistema. */
  readonly kind?: ErrorKind | undefined;
  readonly title?: I18nText | undefined;
  readonly body?: I18nText | undefined;
  /**
   * Referencia corta del incidente para dar soporte. NUNCA un stack trace, un
   * codigo HTTP ni un mensaje del servidor: el alumno no debe leer nada tecnico
   * y el mensaje del servidor puede filtrar informacion.
   */
  readonly reference?: string | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly retryLabel?: I18nText | undefined;
  readonly className?: string | undefined;
}

/**
 * Algo ha fallado.
 *
 * REGLA DE TONO, y es la razon de que este componente exista en vez de un
 * `<Alert tone="danger">`:
 *
 *  - no aparece ningun codigo tecnico. "Error 500" hace que un nino de 11 anos
 *    cierre la pestana;
 *  - no se culpa al usuario. El texto por defecto dice literalmente que no es
 *    culpa suya y que no ha perdido nada, porque eso es lo primero que piensa
 *    alguien a quien se le cae la pantalla en mitad de un examen;
 *  - siempre hay una salida: reintentar, o un codigo corto que ensenar al
 *    profesor;
 *  - el color es el rojo de la marca, sin iconos de alarma ni signos de
 *    exclamacion grandes.
 *
 * Se anuncia con `role="alert"`: es un cambio de estado que hay que conocer de
 * inmediato.
 */
export function ErrorState({
  kind = "generic",
  title,
  body,
  reference,
  onRetry,
  retryLabel,
  className,
}: ErrorStateProps): ReactNode {
  const t = useI18n();
  const defaultTitle = kind === "offline" ? UI_STRINGS.offlineTitle : UI_STRINGS.errorTitle;
  const defaultBody = kind === "offline" ? UI_STRINGS.offlineBody : UI_STRINGS.errorBody;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-md border border-[var(--cet-line)]",
        "border-l-4 border-l-[var(--cet-no-accent)] bg-[var(--cet-surface)] px-6 py-8 text-center",
        className,
      )}
    >
      <p className="text-body-lg font-bold text-[var(--cet-ink)]">{t(title, defaultTitle)}</p>
      <p className="max-w-[46ch] text-body text-[var(--cet-ink)]">{t(body, defaultBody)}</p>

      {onRetry ? (
        <Button variant="primary" onClick={onRetry}>
          {t(retryLabel, UI_STRINGS.retry)}
        </Button>
      ) : null}

      {reference ? (
        <p className="text-body-sm text-[var(--cet-ink-muted)]">
          {t(UI_STRINGS.errorReference)}:{" "}
          <code className="rounded-sm bg-[var(--cet-surface-3)] px-1.5 py-0.5 font-mono">{reference}</code>
        </p>
      ) : null}
    </div>
  );
}
