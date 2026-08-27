/**
 * audit-rpc.test.ts — el 406 que perdía toda la auditoría del personal.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Cada bloque de este fichero corresponde a una parte del fallo del 27/08/2026:
 * `.schema("app").rpc("audit")` devolvía HTTP 406 / PGRST106 («Invalid schema:
 * app»), el fallback solo miraba PGRST202/42883, y `audit()` se tragaba el
 * error. Los tres tienen su prueba aquí.
 *
 * Los dos últimos bloques son de PARIDAD, que es lo que este proyecto ha
 * aprendido a base de golpes (R3): comparan esta declaración de TypeScript con
 * la de la migración 0023 y con las acciones que `actions.ts` emite de verdad.
 * Un contrato entre dos ficheros que nadie compara está roto hasta que se
 * demuestre lo contrario.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ANSWER_KEY_RPC,
  AUDIT_ACTIONS,
  AUDIT_RPC,
  appRpc,
  auditStaffAction,
} from "./audit-rpc";

interface Respuesta {
  readonly data?: unknown;
  readonly error?: { message: string; code?: string } | null;
}

interface Llamada {
  readonly esquema: "public" | "app";
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

/**
 * Cliente falso que registra por dónde entró cada llamada. Lo que se prueba es
 * exactamente eso: POR QUÉ CAMINO se llama y en qué orden, que es donde vivía
 * el fallo.
 */
function fakeClient(respuestas: {
  publica?: Respuesta;
  app?: Respuesta;
}): { client: SupabaseClient; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const responder = (esquema: "public" | "app", fn: string, args: Record<string, unknown>) => {
    llamadas.push({ esquema, fn, args });
    const r = (esquema === "public" ? respuestas.publica : respuestas.app) ?? {
      data: null,
      error: { message: "no configurado" },
    };
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  };

  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => responder("public", fn, args),
    schema: (nombre: string) => ({
      rpc: (fn: string, args: Record<string, unknown>) =>
        responder(nombre === "app" ? "app" : "public", fn, args),
    }),
  } as unknown as SupabaseClient;

  return { client, llamadas };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("appRpc — por dónde entra la llamada", () => {
  it("va primero a `public`, que es el único esquema que PostgREST expone", async () => {
    const { client, llamadas } = fakeClient({ publica: { data: 42, error: null } });

    const res = await appRpc(client, AUDIT_RPC, { p_action: "student.created" });

    expect(res.error).toBeNull();
    expect(res.data).toBe(42);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ esquema: "public", fn: "audit_staff_action" });
  });

  it("cae a `app` cuando el envoltorio público todavía no existe (PGRST202)", async () => {
    const { client, llamadas } = fakeClient({
      publica: { error: { message: "no existe", code: "PGRST202" } },
      app: { data: 7, error: null },
    });

    const res = await appRpc(client, AUDIT_RPC, {});

    expect(res.data).toBe(7);
    expect(llamadas.map((l) => l.esquema)).toEqual(["public", "app"]);
    // El nombre cambia con el esquema: `public.audit_staff_action` envuelve a
    // `app.audit`. Si el par se desincroniza, este test lo dice.
    expect(llamadas[1]?.fn).toBe("audit");
  });

  it("EL FALLO: un 406/PGRST106 desde `app` ya no se da por bueno", async () => {
    // Reproduce la respuesta literal de producción del 27/08/2026.
    const pgrst106 = {
      message: "Invalid schema: app",
      code: "PGRST106",
    };
    const { client } = fakeClient({
      publica: { error: { message: "no existe", code: "PGRST202" } },
      app: { error: pgrst106 },
    });

    const res = await appRpc(client, AUDIT_RPC, {});

    expect(res.error).not.toBeNull();
    // Se devuelve el error de `public`, no el de `app`: lo accionable es que
    // FALTA EL ENVOLTORIO, no que el esquema privado siga siendo privado.
    expect(res.error?.code).toBe("PGRST202");
  });

  it("un error REAL no se reintenta: un 42501 no puede convertirse en «no existe»", async () => {
    const { client, llamadas } = fakeClient({
      publica: { error: { message: "insufficient_privilege", code: "42501" } },
    });

    const res = await appRpc(client, AUDIT_RPC, {});

    expect(res.error?.code).toBe("42501");
    expect(llamadas).toHaveLength(1);
  });

  it("la clave de respuesta usa el mismo camino y el mismo nombre en los dos esquemas", async () => {
    const { client, llamadas } = fakeClient({
      publica: { error: { message: "no existe", code: "PGRST202" } },
      app: { data: { type: "choice" }, error: null },
    });

    const res = await appRpc(client, ANSWER_KEY_RPC, { p_item_id: "abc" });

    expect(res.data).toEqual({ type: "choice" });
    expect(llamadas.map((l) => l.fn)).toEqual([
      "attempt_item_answer_key",
      "attempt_item_answer_key",
    ]);
  });
});

describe("auditStaffAction — ruidoso, y sin identidad del cliente", () => {
  it("no envía actor, colegio ni rol: los deriva el servidor de la sesión", async () => {
    const { client, llamadas } = fakeClient({ publica: { data: 1, error: null } });

    await auditStaffAction(client, "student.unlocked", "students", "id-1", null, { a: 1 });

    const args = llamadas[0]?.args ?? {};
    expect(Object.keys(args).sort()).toEqual([
      "p_action",
      "p_after",
      "p_before",
      "p_entity_id",
      "p_entity_type",
    ]);
    expect(JSON.stringify(args)).not.toMatch(/actor|school|role/i);
  });

  it("devuelve ok:false Y grita en los logs cuando la auditoría falla (R4)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // El escenario exacto de producción ANTES de 0023: no hay envoltorio en
    // `public` (PGRST202) y el esquema `app` no está expuesto (PGRST106/406).
    const { client } = fakeClient({
      publica: { error: { message: "Could not find the function", code: "PGRST202" } },
      app: { error: { message: "Invalid schema: app", code: "PGRST106" } },
    });

    const res = await auditStaffAction(
      client,
      "attempt.answer_key_viewed",
      "attempt_items",
      "item-1",
      null,
      null,
    );

    // Lo que antes NO pasaba: quien llama se entera.
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("PGRST202");
    expect(error).toHaveBeenCalledTimes(1);
    const mensaje = String(error.mock.calls[0]?.[0] ?? "");
    expect(mensaje).toContain("AUDITORIA FALLIDA");
    // El código en el mensaje es lo que convierte una línea de log en un
    // diagnóstico: sin él, el 406 era indistinguible de un fallo de red.
    expect(mensaje).toContain("PGRST202");
  });

  it("no lanza: una acción ya ejecutada no se reporta como fallida por el log", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = fakeClient({ publica: { error: { message: "boom", code: "XX000" } } });

    await expect(
      auditStaffAction(client, "student.created", "students", null, null, null),
    ).resolves.toMatchObject({ ok: false });
  });
});

/* ========================================================================== */
/* Paridad — los tres sitios donde vive el vocabulario del audit_log          */
/* ========================================================================== */

function leerRepo(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../../${ruta}`, import.meta.url)), "utf8");
}

describe("paridad del vocabulario de auditoría", () => {
  it("AUDIT_ACTIONS coincide EXACTAMENTE con la lista blanca de la migración 0023", () => {
    const sql = leerRepo("supabase/migrations/0023_public_audit_wrapper.sql");
    const bloque = sql.slice(sql.indexOf("p_action not in ("), sql.indexOf("audit_staff_action: acción"));
    const enSql = [...bloque.matchAll(/'([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)'/g)].map((m) => m[1]);

    // Una acción declarada aquí y no allí se rechaza con 22023 en producción;
    // una declarada allí y no aquí es código muerto. Las dos son fallos.
    expect(enSql.slice().sort()).toEqual([...AUDIT_ACTIONS].slice().sort());
  });

  it("toda acción que `actions.ts` emite está declarada en AUDIT_ACTIONS", () => {
    const ts = leerRepo("apps/web/src/components/staff/actions.ts");
    const emitidas = new Set(
      [...ts.matchAll(/"([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)"/g)].map((m) => m[1] as string),
    );

    expect(emitidas.size).toBeGreaterThan(0);
    for (const accion of emitidas) {
      expect(AUDIT_ACTIONS as readonly string[]).toContain(accion);
    }
  });
});
