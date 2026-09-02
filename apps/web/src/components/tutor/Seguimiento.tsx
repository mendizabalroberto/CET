/**
 * Frontera de cliente del seguimiento de un hijo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ HACE FALTA ESTE ENVOLTORIO DE TRES LÍNEAS
 * ===========================================================================
 * `StudyScorecard` y todos sus paneles resuelven sus textos con `useI18n()`,
 * que es el hook del `LocaleProvider` de `@cet/ui` — un contexto DISTINTO del
 * `LocaleProvider` de `@/lib/i18n/provider` que ya monta el layout del tutor.
 * Sin este, los títulos de sección, los resúmenes y las etiquetas de las
 * columnas saldrían todos en blanco: no fallaría nada, simplemente no habría
 * texto. Es exactamente lo que `StaffChrome` hace para el área de personal, y
 * la cabecera de aquel documenta el mismo par de contextos.
 *
 * Se monta AQUÍ y no en el layout del tutor a propósito: esta es la única
 * pantalla de la zona que usa primitivos de `@cet/ui`, y meter el proveedor en
 * el layout hidrataría la lista de hijos y el alta, que hoy son puro servidor.
 *
 * Este fichero no decide NADA. Las props llegan calculadas y redactadas desde
 * `lib/tutor/seguimiento.ts`, que corre en el servidor y se prueba sin React.
 */
"use client";

import type { ReactNode } from "react";
import type { Locale } from "@cet/shared";
import { LocaleProvider as UiLocaleProvider, StudyScorecard, type StudyScorecardProps } from "@cet/ui";

export function Seguimiento({
  locale,
  scorecard,
}: {
  readonly locale: Locale;
  readonly scorecard: StudyScorecardProps;
}): ReactNode {
  return (
    <UiLocaleProvider locale={locale}>
      <StudyScorecard {...scorecard} />
    </UiLocaleProvider>
  );
}
