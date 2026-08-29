// Vitest para las piezas puras de las Edge Functions.
// © 2026 Roberto Mendizabal. Todos los derechos reservados.
//
// POR QUÉ HACE FALTA UNA CONFIGURACIÓN PROPIA
// ---------------------------------------------------------------------------
// `supabase/functions/` no es un paquete del workspace, así que `turbo run test`
// no lo recoge — igual que pasaba con `scripts/`. Y hay una segunda razón, más
// dura: estas funciones corren en Deno e importan por URL
// (`https://esm.sh/zod@3.23.8`), que Node y Vitest no saben resolver. Sin el
// alias de abajo, importar cualquier módulo de estas funciones desde una prueba
// muere en el primer `import`.
//
// El alias apunta a la MISMA librería que ya está en el workspace. Es un puente
// para las pruebas y no cambia lo que se despliega: en producción sigue
// corriendo el import por URL, que es lo que Deno entiende.
//
// CONSECUENCIA PARA QUIEN ESCRIBA PRUEBAS AQUÍ
// Solo se puede probar código que importe zod y nada más. `hash-wasm` y
// `@supabase/supabase-js` no tienen alias a propósito: pertenecen al camino con
// efectos (hashear, hablar con la base), y ese no se prueba con un test unitario
// sino con el pgTAP y el e2e. Las piezas que sí se prueban aquí —esquemas de
// entrada, derivaciones, hashes de token— van a `_shared/`, sin esas
// dependencias.
import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export default defineConfig({
  test: {
    include: ["supabase/functions/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: [
      {
        find: "https://esm.sh/zod@3.23.8",
        replacement: resolve(raiz, "apps/web/node_modules/zod"),
      },
    ],
  },
});
