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
    ignores: [
      "src/app/api/**",
      "src/lib/supabase/**",
      /**
       * EXCEPCION TASADA. Dar de alta a un alumno exige crear su fila en
       * `auth.users`, y eso NINGUNA politica RLS se lo permite a un
       * administrador de colegio: solo `service_role` puede.
       *
       * Es seguro aqui porque una Server Action es codigo de SERVIDOR (nunca
       * llega al navegador), el rol del actor se comprueba contra la base de
       * datos antes de escalar, el `school_id` se toma de la sesion y no del
       * formulario, la llamada declara su motivo, y la operacion queda en el
       * `audit_log`.
       *
       * Si esta lista crece, es un fallo de arquitectura y no una necesidad:
       * `grep createAdminClient` debe seguir cabiendo en una pantalla.
       */
      "src/components/staff/actions.ts",
      /**
       * SEGUNDA EXCEPCION TASADA — `submitRegistration`, el alta publica.
       *
       * Aqui NO hay actor cuyo rol comprobar: el tutor no tiene cuenta todavia,
       * ese es el sentido del formulario. Escribe igualmente con service_role
       * porque `0012_rls_policies.sql` le niega el INSERT a `anon` A PROPOSITO
       * ("dar INSERT a `anon` sobre esta tabla seria un formulario de spam
       * abierto a internet") y esa decision se respeta: se arregla el codigo,
       * no la politica.
       *
       * POR QUE NO UNA ROUTE HANDLER, que es lo que dice el comentario de 0012
       * y lo que esta lista preferiria: seria un SEGUNDO endpoint publico con
       * exactamente la misma exposicion —cualquiera puede hacerle POST igual
       * que a la Server Action— y una llamada HTTP de la app a si misma. Dos
       * puertas en vez de una, sin ninguna comprobacion de mas. La frontera que
       * importa no es "route handler o server action": es que el codigo sea de
       * servidor y que lo que la RLS ya no cubre este cubierto por otra cosa.
       *
       * Lo que lo cubre, y esta enumerado en la propia accion: validacion Zod
       * endurecida, colegio comprobado contra `list_active_schools()`,
       * deduplicacion y tope por correo del tutor. Y un hueco DECLARADO: no hay
       * captcha, que es lo unico que para a un bot distribuido.
       */
      "src/lib/auth/actions.ts",
    ],
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
