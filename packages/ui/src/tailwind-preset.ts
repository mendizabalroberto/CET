/**
 * @cet/ui — preset de Tailwind compartido.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Todos los colores apuntan a las custom properties de `tokens.css`. Ninguna
 * clase de Tailwind lleva un valor hexadecimal: cambiar el tema es cambiar las
 * variables, no reconstruir el CSS. Eso es lo que hace posible el tema oscuro
 * real (`prefers-color-scheme` + `[data-theme]`) sin duplicar utilidades.
 *
 * Uso en apps/web:
 *   // tailwind.config.ts
 *   import { cetPreset } from "@cet/ui/tailwind-preset";
 *   export default { presets: [cetPreset], content: [...] };
 *
 * Con Tailwind v4 (CSS-first) se importa en su lugar `@cet/ui/tokens.css` y se
 * declara el bloque `@theme` que exporta `cetThemeLayer` mas abajo.
 */

/** Forma minima de un preset. Se declara aqui para no depender de los tipos de tailwind. */
import type { Config } from "tailwindcss";

/**
 * El preset se tipa con el `Config` REAL de Tailwind, no con una forma propia.
 *
 * Tenerlo desacoplado parecia mas limpio, pero producia
 * `theme.extend: Record<string, unknown>`, y `unknown` no es asignable a
 * `ThemeValue`: el consumidor no podia usar el preset sin un cast. Un cast en la
 * frontera habria escondido cualquier error real dentro del propio preset.
 *
 * `tailwindcss` ya es devDependency de este paquete, asi que el tipo no cuesta
 * nada en runtime: `import type` desaparece al compilar.
 */
export type TailwindPreset = Partial<Config>;

const color = (token: string): string => `var(--cet-${token})`;

export const cetPreset: TailwindPreset = {
  /**
   * `class` con el selector `[data-theme="dark"]`: la eleccion explicita del
   * usuario debe poder ganar sobre la preferencia del sistema (tokens.css cubre
   * el caso automatico).
   */
  darkMode: ["variant", '&:where([data-theme="dark"], [data-theme="dark"] *)'],
  theme: {
    extend: {
      colors: {
        bg: color("bg"),
        surface: {
          DEFAULT: color("surface"),
          2: color("surface-2"),
          3: color("surface-3"),
        },
        ink: {
          DEFAULT: color("ink"),
          muted: color("ink-muted"),
          inverse: color("ink-inverse"),
        },
        line: color("line"),
        "border-strong": color("border-strong"),
        navy: { DEFAULT: color("navy"), 2: color("navy-2") },
        primary: { DEFAULT: color("primary"), hover: color("primary-hover"), on: color("on-primary") },
        teal: { DEFAULT: color("teal"), text: color("teal-text") },
        amber: { DEFAULT: color("amber"), text: color("amber-text"), on: color("on-amber") },
        success: color("success"),
        danger: color("danger"),
        rule: { bg: color("rule-bg"), accent: color("rule-accent") },
        example: { bg: color("example-bg"), border: color("example-border") },
        tip: { bg: color("tip-bg"), accent: color("tip-accent") },
        warning: { bg: color("warning-bg"), accent: color("warning-accent") },
        ok: { bg: color("ok-bg"), text: color("ok-text"), accent: color("ok-accent") },
        no: { bg: color("no-bg"), text: color("no-text"), accent: color("no-accent") },
        hint: { bg: color("hint-bg"), text: color("hint-text"), accent: color("hint-accent") },
        timer: {
          normal: color("timer-normal"),
          warn: color("timer-warn"),
          "warn-bg": color("timer-warn-bg"),
          urgent: color("timer-urgent"),
          "urgent-bg": color("timer-urgent-bg"),
        },
        focus: color("focus"),
      },
      borderRadius: {
        sm: "var(--cet-radius-sm)",
        md: "var(--cet-radius-md)",
        lg: "var(--cet-radius-lg)",
        pill: "var(--cet-radius-pill)",
      },
      boxShadow: {
        card: "var(--cet-shadow-sm)",
        pop: "var(--cet-shadow-md)",
      },
      spacing: {
        touch: "var(--cet-touch-min)",
        "touch-comfy": "var(--cet-touch-comfy)",
      },
      minHeight: {
        touch: "var(--cet-touch-min)",
        "touch-comfy": "var(--cet-touch-comfy)",
      },
      minWidth: {
        touch: "var(--cet-touch-min)",
      },
      transitionDuration: {
        fast: "var(--cet-motion-fast)",
        base: "var(--cet-motion-base)",
        slow: "var(--cet-motion-slow)",
      },
      transitionTimingFunction: {
        cet: "var(--cet-ease)",
      },
      fontFamily: {
        // La misma pila que los trainers Y6A: se ve igual en los portatiles del
        // colegio, que es donde los alumnos lo van a usar.
        sans: ["Segoe UI", "system-ui", "-apple-system", "Arial", "sans-serif"],
        mono: ["Consolas", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Escala de los trainers. El cuerpo no baja de 15px: es material para
        // ninos, no un panel de control.
        "body-sm": ["14.5px", { lineHeight: "1.55" }],
        body: ["15.5px", { lineHeight: "1.6" }],
        "body-lg": ["17px", { lineHeight: "1.6" }],
        stem: ["20px", { lineHeight: "1.5" }],
        "stem-lg": ["26px", { lineHeight: "1.35" }],
      },
    },
  },
};

/**
 * Bloque `@theme` equivalente para Tailwind v4 (CSS-first).
 * Se pega en el CSS global de la app, justo despues de
 * `@import "@cet/ui/tokens.css";`.
 */
export const cetThemeLayer = `@theme {
  --color-bg: var(--cet-bg);
  --color-surface: var(--cet-surface);
  --color-surface-2: var(--cet-surface-2);
  --color-surface-3: var(--cet-surface-3);
  --color-ink: var(--cet-ink);
  --color-ink-muted: var(--cet-ink-muted);
  --color-ink-inverse: var(--cet-ink-inverse);
  --color-line: var(--cet-line);
  --color-border-strong: var(--cet-border-strong);
  --color-primary: var(--cet-primary);
  --color-primary-hover: var(--cet-primary-hover);
  --color-primary-on: var(--cet-on-primary);
  --color-teal: var(--cet-teal);
  --color-teal-text: var(--cet-teal-text);
  --color-amber: var(--cet-amber);
  --color-amber-text: var(--cet-amber-text);
  --color-success: var(--cet-success);
  --color-danger: var(--cet-danger);
  --color-focus: var(--cet-focus);
  --radius-sm: var(--cet-radius-sm);
  --radius-md: var(--cet-radius-md);
  --radius-lg: var(--cet-radius-lg);
  --spacing-touch: var(--cet-touch-min);
}`;

export default cetPreset;
