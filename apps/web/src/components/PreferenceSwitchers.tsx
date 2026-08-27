/**
 * Selectores de tema e idioma — Server Components, sin JavaScript de cliente.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Cada opción es un <button type="submit"> dentro de un formulario que invoca
 * una Server Action. Accesible por teclado y por lector de pantalla de forma
 * nativa, sin `role`, sin `onClick` y sin hidratación.
 */
import type { Dictionary, Locale } from "@/lib/i18n";
import { setLocalePreference, setThemePreference } from "@/lib/preferences-actions";
import type { Theme } from "@/lib/preferences";

const OPTION_BASE =
  "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors focus-visible:outline-none";

function optionClass(active: boolean): string {
  return active
    ? `${OPTION_BASE} bg-brand text-on-brand`
    : `${OPTION_BASE} text-muted hover:text-ink hover:bg-surface-alt`;
}

export function ThemeSwitcher({ current, t }: { current: Theme; t: Dictionary }) {
  const options: ReadonlyArray<{ value: Theme; label: string }> = [
    { value: "light", label: t.common.themeLight },
    { value: "dark", label: t.common.themeDark },
    { value: "system", label: t.common.themeSystem },
  ];

  return (
    <form action={setThemePreference}>
      <fieldset className="flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5">
        <legend className="sr-only">{t.common.themeLabel}</legend>
        {options.map((option) => (
          <button
            key={option.value}
            type="submit"
            name="theme"
            value={option.value}
            className={optionClass(current === option.value)}
            aria-pressed={current === option.value}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
    </form>
  );
}

export function LocaleSwitcher({ current, t }: { current: Locale; t: Dictionary }) {
  const options: ReadonlyArray<{ value: Locale; label: string }> = [
    { value: "es", label: t.common.languageSpanish },
    { value: "en", label: t.common.languageEnglish },
  ];

  return (
    <form action={setLocalePreference}>
      <fieldset className="flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5">
        <legend className="sr-only">{t.common.languageLabel}</legend>
        {options.map((option) => (
          <button
            key={option.value}
            type="submit"
            name="locale"
            value={option.value}
            className={optionClass(current === option.value)}
            aria-pressed={current === option.value}
            lang={option.value}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
    </form>
  );
}
