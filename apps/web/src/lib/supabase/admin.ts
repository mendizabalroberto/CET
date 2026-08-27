/**
 * ===========================================================================
 * ██  CLIENTE SERVICE ROLE — SALTA RLS POR COMPLETO  ██
 * ===========================================================================
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ESTE CLIENTE IGNORA TODAS LAS POLÍTICAS RLS. Con él, una consulta mal escrita
 * devuelve datos de TODOS los colegios: fichas de menores, códigos de alumno,
 * intentos de examen y — lo más grave — las claves de corrección
 * (`attempt_items.answer_key`, `question_versions.answer_spec`).
 *
 * REGLAS DE USO — no negociables
 * ---------------------------------------------------------------------------
 *  1. SOLO en Route Handlers o Server Actions **auditadas**, nunca en un Server
 *     Component. Motivo: un Server Component se compone, se anida y se
 *     reutiliza; es cuestión de tiempo que alguien lo renderice bajo una ruta
 *     sin comprobación de permisos. Una Route Handler es un punto de entrada
 *     único y explícito, con su propia comprobación de sesión.
 *  2. NUNCA en un fichero que contenga "use client", ni importado desde uno,
 *     ni desde `middleware.ts` (que corre en Edge y se sirve al borde).
 *  3. Toda llamada filtra por `school_id` **a mano**. RLS ya no te cubre: el
 *     `where` es la única frontera que queda entre dos colegios.
 *  4. Toda escritura sobre datos de alumno deja fila en `audit_log`
 *     (DATA_MODEL §8). Sin auditoría no hay service role.
 *  5. Antes de usarlo, responde: "¿por qué no basta una política RLS?". Si no
 *     hay respuesta concreta, usa `./server`.
 *
 * CASOS LEGÍTIMOS (los únicos previstos hoy)
 *  - Ingesta de `learning_events` en lote cuando el volumen haga inviable RLS
 *    (hoy NO se usa: `/api/events` escribe con el cliente de sesión a propósito).
 *  - Aprobación de `registration_requests`, que crea un `auth.users`.
 *  - Rotación de PIN por parte de un profesor.
 *  - Tareas de mantenimiento invocadas desde un cron autenticado.
 *
 * POR QUÉ ESTA CLAVE NO PUEDE ACABAR EN UN BUNDLE
 *  - `SUPABASE_SERVICE_ROLE_KEY` no lleva prefijo `NEXT_PUBLIC_`: el compilador
 *    de Next.js sustituye por `undefined` cualquier `process.env.X` sin ese
 *    prefijo en código de cliente, así que la clave nunca se inlinea.
 *  - `import "server-only"` hace que el build **falle** si alguien importa este
 *    módulo desde un componente de cliente. Es la red de seguridad real.
 *  - El `assertServer()` de abajo es la tercera barrera, ya en runtime.
 * ===========================================================================
 */
import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseUrl } from "./env";

function assertServer(): void {
  // `window` solo existe en el navegador. Si esto se evalúa allí, algo ha
  // burlado a "server-only" y hay que abortar ruidosamente.
  if (typeof window !== "undefined") {
    throw new Error(
      "SEGURIDAD: se ha intentado construir el cliente service-role en el navegador. Abortando.",
    );
  }
}

/**
 * Construye un cliente con privilegios de service role.
 *
 * No se cachea en una variable de módulo a propósito: en un entorno de cómputo
 * fluido (Vercel Fluid) las instancias se reutilizan entre peticiones de
 * usuarios distintos, y un cliente global es exactamente el objeto que no
 * quieres compartir entre inquilinos.
 *
 * @param reason Motivo de la escalada de privilegios. Se exige como argumento
 *   para que quede escrito en el código de llamada por qué RLS no bastaba, y
 *   para que `grep "createAdminClient("` liste todas las escaladas del repo.
 */
export function createAdminClient(reason: string): SupabaseClient {
  assertServer();

  if (!reason || reason.trim().length < 10) {
    throw new Error(
      "createAdminClient() exige un motivo explícito y descriptivo de la escalada de privilegios.",
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY. Es un secreto de servidor: configúralo en el entorno, jamás en el repositorio.",
    );
  }

  return createSupabaseClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      // Un cliente de servicio no tiene usuario, no persiste nada y no refresca
      // nada. Si persistiera sesión, contaminaría la del usuario real.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        // Marca las peticiones en los logs de Postgres para poder auditar el
        // uso de service role después del hecho.
        "x-cet-admin-reason": reason.slice(0, 120),
      },
    },
  });
}
