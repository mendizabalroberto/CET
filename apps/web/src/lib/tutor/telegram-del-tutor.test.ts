/**
 * `vincularTelegram` y `desvincularTelegram`, probadas por lo que ESCRIBEN.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUE SE AFIRMA AQUI, Y POR QUE ESO Y NO OTRA COSA
 * ===========================================================================
 * El enlace de vinculacion es una CREDENCIAL: quien lo tenga conecta SU
 * Telegram a la cuenta de un padre y se queda recibiendo los avisos sobre un
 * menor ajeno. Asi que estas pruebas no comprueban que la accion «funcione»,
 * comprueban tres cosas que, si se rompen, no las ve nadie hasta que es tarde:
 *
 *   1. Que en la base entra el SHA-256 y JAMAS el token en claro.
 *   2. Que la URL sale UNA vez, en el estado, y no aparece en ningun log.
 *   3. Que sin bot configurado no se emite ninguna credencial, aunque se
 *      invoque la accion a mano — que es lo unico que la interfaz no puede
 *      impedir, porque una Server Action es un endpoint HTTP.
 *
 * Y del corte: que borra las TRES columnas. Dejar vivo un `token_hash`
 * pendiente convertiria «he desconectado» en una promesa a medias.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashToken } from "./tokens";

vi.mock("server-only", () => ({}));

const TUTOR = "aaaaaaaa-0000-4000-8000-000000000001";

const requireRole = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireRole: (...args: unknown[]) => requireRole(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers()) }));

/** Lo que la accion le pide al cliente de servicio. */
const upsert = vi.fn();
const update = vi.fn();
const eqDelUpdate = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (fila: Record<string, unknown>, opciones: Record<string, unknown>) => {
        upsert(fila, opciones);
        return Promise.resolve({ error: null });
      },
      update: (fila: Record<string, unknown>) => {
        update(fila);
        return { eq: eqDelUpdate };
      },
    }),
  }),
}));

/** La sesion del tutor: solo se usa para la RPC de auditoria. */
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ rpc, schema: () => ({ rpc }) }),
}));

/** Todo lo que se ha gritado por consola durante la prueba. */
let gritos: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("TELEGRAM_TOKEN", "123:falso");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "un-secreto-de-webhook");
  requireRole.mockResolvedValue({ id: TUTOR, role: "guardian" });
  eqDelUpdate.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ error: null });

  gritos = [];
  vi.spyOn(console, "error").mockImplementation((...partes: unknown[]) => {
    gritos.push(partes.map((p) => String(p)).join(" "));
  });
  vi.spyOn(console, "log").mockImplementation((...partes: unknown[]) => {
    gritos.push(partes.map((p) => String(p)).join(" "));
  });
});

/** El token que viaja dentro de la URL `https://t.me/<bot>?start=<token>`. */
function tokenDeLaUrl(url: string): string {
  return decodeURIComponent(url.split("?start=")[1] ?? "");
}

describe("vincularTelegram", () => {
  it("devuelve la URL del bot con un token de 43 caracteres", async () => {
    const { vincularTelegram } = await import("./actions");

    const estado = await vincularTelegram({ ok: false }, new FormData());

    expect(estado.ok).toBe(true);
    const url = estado.values?.["url"];
    expect(typeof url).toBe("string");
    expect(url as string).toContain("https://t.me/CambridgeExamTrainerbot?start=");

    // 43 exactos: es lo que produce `generarToken()` y lo que el webhook exige
    // con `/^[A-Za-z0-9_-]{43}$/`. Un token de otra forma no vincularia nunca,
    // y el padre veria un chat mudo sin saber por que.
    expect(tokenDeLaUrl(url as string)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("guarda el SHA-256 del token y NUNCA el token en claro", async () => {
    const { vincularTelegram } = await import("./actions");

    const estado = await vincularTelegram({ ok: false }, new FormData());
    const token = tokenDeLaUrl(estado.values?.["url"] as string);

    const fila = upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(fila["guardian_id"]).toBe(TUTOR);
    expect(fila["token_hash"]).toBe(hashToken(token));

    // La afirmacion de verdad: el token en claro no aparece en NINGUN valor de
    // la fila. Si algun dia alguien anade una columna de conveniencia con el
    // token dentro, esta linea se pone roja.
    expect(JSON.stringify(fila)).not.toContain(token);
  });

  it("el enlace caduca en 30 minutos y no en siete dias", async () => {
    const { vincularTelegram } = await import("./actions");

    // `antes` se toma UN MILISEGUNDO ANTES de la llamada, a proposito. Con
    // `Date.now()` justo antes, la caducidad se calcula unos microsegundos
    // DESPUES y la ventana medida sale en 30,000016 minutos: la prueba fallaba
    // por el propio tiempo que tarda en ejecutarse, no por la conducta.
    //
    // La alternativa —aflojar el tope a 31— habria dejado pasar un cambio real
    // de 30 a 31 minutos. Se corrige el punto de partida, no el margen.
    const antes = Date.now() - 1;
    await vincularTelegram({ ok: false }, new FormData());

    const fila = upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    const caduca = new Date(fila["token_expira_at"] as string).getTime();
    const minutos = (caduca - antes) / 60000;

    // El del alumno viaja por WhatsApp y dura una semana; este lo pulsa el
    // mismo tutor en la misma pantalla. Todo lo que dure de mas es una
    // credencial viva que nadie necesita.
    expect(minutos).toBeGreaterThan(29);
    expect(minutos).toBeLessThanOrEqual(30.1);
  });

  it("hace UPSERT por guardian_id: pedir otro enlace reemplaza, no acumula", async () => {
    const { vincularTelegram } = await import("./actions");

    await vincularTelegram({ ok: false }, new FormData());

    expect(upsert.mock.calls[0]?.[1]).toEqual({ onConflict: "guardian_id" });
  });

  it("no toca `chat_id` ni `vinculado_at`: generar otro enlace no desconecta", async () => {
    const { vincularTelegram } = await import("./actions");

    await vincularTelegram({ ok: false }, new FormData());

    const fila = upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(fila)).not.toContain("chat_id");
    expect(Object.keys(fila)).not.toContain("vinculado_at");
  });

  it("NI el token NI la URL aparecen en ningun log", async () => {
    const { vincularTelegram } = await import("./actions");

    const estado = await vincularTelegram({ ok: false }, new FormData());
    const url = estado.values?.["url"] as string;
    const token = tokenDeLaUrl(url);

    const todo = gritos.join("\n");
    expect(todo).not.toContain(token);
    expect(todo).not.toContain(url);
  });

  it("audita con un verbo del vocabulario del rol `guardian`", async () => {
    const { vincularTelegram } = await import("./actions");

    await vincularTelegram({ ok: false }, new FormData());

    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    // `0068_auditoria_de_la_cadena.sql` solo admite tres verbos para el tutor.
    // Cualquier otro devuelve `invalid_parameter_value` y la auditoria SE
    // PIERDE, sin que la accion falle: nadie se enteraria.
    expect([
      "tutor.hijo_creado",
      "tutor.enlace_generado",
      "tutor.dispositivo_olvidado",
    ]).toContain(args["p_action"]);
    expect(args["p_entity_type"]).toBe("telegram_de_tutor");
    // `app.audit()` (0074) solo deja al tutor auditar sobre si mismo o sobre un
    // hijo suyo. Aqui el sujeto es el.
    expect(args["p_entity_id"]).toBe(TUTOR);
  });

  it("la auditoria no lleva el token dentro", async () => {
    const { vincularTelegram } = await import("./actions");

    const estado = await vincularTelegram({ ok: false }, new FormData());
    const token = tokenDeLaUrl(estado.values?.["url"] as string);

    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(JSON.stringify(args)).not.toContain(token);
  });

  it("SIN bot configurado no emite ninguna credencial", async () => {
    vi.stubEnv("TELEGRAM_TOKEN", "");
    const { vincularTelegram } = await import("./actions");

    const estado = await vincularTelegram({ ok: false }, new FormData());

    // Que la interfaz oculte la seccion es cosmetica: una Server Action es un
    // endpoint HTTP. Sin esta guarda quedaria en la base un token vivo que
    // nadie puede canjear hoy y que sigue siendo valido el dia que se configure
    // el bot.
    expect(estado.ok).toBe(false);
    expect(estado.errorKey).toBe("notFound");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("exige el rol de tutor ANTES de escalar a service_role", async () => {
    const { vincularTelegram } = await import("./actions");

    await vincularTelegram({ ok: false }, new FormData());

    expect(requireRole).toHaveBeenCalledWith(["guardian"], { onDeny: "not-found" });
    // `not-found` y no 403: un 403 le confirmaria a quien sondea que esta
    // accion existe.
  });
});

describe("desvincularTelegram", () => {
  it("borra el chat, el token pendiente y la fecha, todo a la vez", async () => {
    const { desvincularTelegram } = await import("./actions");

    const estado = await desvincularTelegram({ ok: false }, new FormData());

    expect(estado.ok).toBe(true);
    const fila = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(fila["chat_id"]).toBeNull();
    expect(fila["vinculado_at"]).toBeNull();
    // Si el token pendiente sobreviviera, quien tuviera aquel enlace todavia
    // sin pulsar podria reconectar DESPUES de que el padre creyera haberlo
    // cortado.
    expect(fila["token_hash"]).toBeNull();
    expect(fila["token_expira_at"]).toBeNull();
  });

  it("acota la escritura por el tutor de la SESION, jamas por el formulario", async () => {
    const { desvincularTelegram } = await import("./actions");

    const fd = new FormData();
    fd.set("guardianId", "bbbbbbbb-0000-4000-8000-000000000002");
    await desvincularTelegram({ ok: false }, fd);

    // Con `service_role` no hay RLS que acote nada: el `where` es la frontera
    // entera, y sale de `requireRole()`.
    expect(eqDelUpdate).toHaveBeenCalledWith("guardian_id", TUTOR);
  });

  it("un fallo de la base se devuelve como estado, no se lanza", async () => {
    eqDelUpdate.mockResolvedValue({ error: { code: "42501", message: "denegado" } });
    const { desvincularTelegram } = await import("./actions");

    const estado = await desvincularTelegram({ ok: false }, new FormData());

    expect(estado.ok).toBe(false);
    expect(estado.errorKey).toBe("unexpected");
  });
});
