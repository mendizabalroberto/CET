"use client";

/**
 * @cet/ui — WarningBox (Error frecuente).
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import type { ReactNode } from "react";
import type { I18nText } from "@cet/shared";
import { CalloutBox } from "./CalloutBox.js";
import { UI_STRINGS } from "../lib/strings.js";

export interface WarningBoxProps {
  /** Contenido HTML de la base de datos. Se sanea antes de pintarse. */
  readonly html?: string | undefined;
  /** Alternativa a `html` cuando el contenido ya son nodos de React. */
  readonly children?: ReactNode | undefined;
  /** Sustituye el titulo por defecto del diccionario del paquete. */
  readonly label?: I18nText | undefined;
  readonly hideLabel?: boolean | undefined;
  readonly className?: string | undefined;
}

/**
 * Error frecuente. Portado de `.warning` de los trainers Y6A.
 *
 * El HTML pasa por el sanitizador y las fracciones apiladas se sustituyen por
 * `<FractionText>` accesible.
 */
export function WarningBox({ html, children, label, hideLabel, className }: WarningBoxProps): ReactNode {
  return (
    <CalloutBox
      tone="warning"
      label={label ?? UI_STRINGS.blockWarning}
      html={html}
      hideLabel={hideLabel ?? false}
      className={className}
    >
      {children}
    </CalloutBox>
  );
}
