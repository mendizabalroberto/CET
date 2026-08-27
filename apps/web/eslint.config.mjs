/**
 * ESLint 9 (flat config) para apps/web.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/**
 * Se nombra la configuracion en vez de exportar el array anonimo: con un default
 * anonimo, los mensajes de error de ESLint no dicen de que fichero salio la regla.
 */
const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      // Lo regenera Next en cada build: corregirlo aqui no sirve de nada.
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // `console` fuera de log deliberado es ruido que acaba en el navegador de
      // un alumno. Se permite `warn`/`error`, que es lo que usan los enganches
      // de observabilidad.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    /**
     * REGLA DE SEGURIDAD DEL REPOSITORIO
     * Nadie importa el cliente service-role fuera de una Route Handler o de
     * `lib/supabase/`. `import "server-only"` ya rompe el build si se cuela en
     * un componente de cliente; esto lo detecta antes, en el editor.
     */
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**", "src/lib/supabase/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/supabase/admin", "@/lib/supabase/admin"],
              message:
                "El cliente service-role salta RLS. Solo se usa en Route Handlers auditadas (src/app/api/**).",
            },
          ],
        },
      ],
    },
  },
];

export default config;
