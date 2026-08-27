/**
 * Tailwind CSS v4 — configuración de la app web.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La paleta, la escala tipográfica y los tokens de tema NO viven aquí: viven en
 * el preset de @cet/ui, para que la app y cualquier futura superficie (panel de
 * administración, informes PDF, storybook) compartan un único design system.
 * Aquí solo se declara QUÉ ficheros se escanean.
 *
 * ASUNCIÓN DE CONTRATO (@cet/ui, aún no implementado):
 *   `@cet/ui/tailwind-preset` exporta por defecto un `Config` parcial de Tailwind
 *   con los tokens navy / teal / amber de los trainers Y6A.
 */
import type { Config } from "tailwindcss";
import cetPreset from "@cet/ui/tailwind-preset";

const config: Config = {
  presets: [cetPreset],
  // `class` y no `media`: el usuario puede forzar claro/oscuro y la elección
  // persiste. El tema del sistema sigue siendo el valor inicial.
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/**/*.{ts,tsx}",
    // El design system trae sus propias clases; si no se escanea, se purgan.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
