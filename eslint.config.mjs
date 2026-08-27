// @ts-check
/**
 * Configuración ESLint raíz — Cambridge Exam Trainer.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Filosofía: las reglas de estilo las resuelve Prettier. Lo que ESLint hace aquí
 * es hacer cumplir INVARIANTES DE SEGURIDAD Y CORRECCIÓN que, si se rompen,
 * producen bugs que los tests no atrapan.
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/*.smoke/**",
      "Y6A/**", // material fuente de terceros, read-only
      "packages/shared/src/database.types.ts", // generado por supabase gen types
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- Corrección ---------------------------------------------------
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],

      /**
       * Las promesas sin await son la fuente número uno de bugs silenciosos en
       * Server Actions: la acción "termina", la respuesta se envía, y la
       * escritura en base de datos ocurre (o no) después.
       */
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  /* ---------------------------------------------------------------------- */
  /* FRONTERA DE SEGURIDAD: renderizado de HTML                             */
  /* ---------------------------------------------------------------------- */
  /**
   * Todo el contenido de lección y todo `stem` de pregunta viene de la base de
   * datos como HTML portado de Y6A. Solo `@cet/ui/lib/safe-html.tsx` está
   * autorizado a renderizarlo, porque es el único punto que sanea con allowlist.
   *
   * Sin esta regla, la frontera es una convención — y las convenciones se
   * erosionan en cuanto alguien tiene prisa. Ver MODULES.md, contrato C5.
   */
  {
    files: ["**/*.tsx", "**/*.jsx"],
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      "react/no-danger": "error",
      ...reactHooks.configs.recommended.rules,
    },
    settings: { react: { version: "detect" } },
  },
  {
    // La ÚNICA excepción del repositorio. Si esta lista crece, es un fallo de
    // arquitectura, no una necesidad.
    files: ["packages/ui/src/lib/safe-html.tsx"],
    rules: { "react/no-danger": "off" },
  },

  /* ---------------------------------------------------------------------- */
  /* FRONTERA DE SEGURIDAD: clave de servicio                               */
  /* ---------------------------------------------------------------------- */
  /**
   * SUPABASE_SERVICE_ROLE_KEY salta RLS por completo. Solo `admin.ts` puede
   * leerla; cualquier otro acceso es una escalada de privilegios sin auditar.
   */
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["apps/web/src/lib/supabase/admin.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          // Se afina abajo con no-restricted-syntax; este mensaje es la guía.
          message:
            "Lee las variables de entorno desde `src/lib/supabase/env.ts`, que las valida con Zod al arrancar.",
        },
      ],
    },
  },

  /* ---------------------------------------------------------------------- */
  /* Tests: se relajan las reglas que solo tienen sentido en producción      */
  /* ---------------------------------------------------------------------- */
  {
    files: ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "no-restricted-properties": "off",
    },
  },

  /* ---------------------------------------------------------------------- */
  /* SQL y Edge Functions quedan fuera: los cubre pgTAP y el linter de Deno  */
  /* ---------------------------------------------------------------------- */
  {
    files: ["supabase/functions/**"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off", // Deno, otro tsconfig
    },
  },
);
