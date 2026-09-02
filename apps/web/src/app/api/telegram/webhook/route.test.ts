/**
 * La puerta del webhook de Telegram, probada por lo que DEJA PASAR.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUE FAMILIA DE FALLOS CIERRA ESTE FICHERO
 * ===========================================================================
 * Esta ruta es publica y sin sesion. Lo unico que separa una actualizacion de
 * Telegram de una inventada por cualquiera que descubra la URL es la cabecera
 * `X-Telegram-Bot-Api-Secret-Token`. Quien consiga colar un cuerpo con el token
 * de vinculacion de un padre y SU propio `chat_id` se queda recibiendo las
 * notificaciones sobre el hijo de otro.
 *
 * Asi que las pruebas no comprueban «que funcione»: comprueban que el `update`
 * que escribe el `chat_id` NO SE LLAMA cuando no debe. Es la frontera donde
 * viviria el fallo, y es la unica linea que de verdad importa de cada caso.
 *
 * ===========================================================================
 * Y TODAS RESPONDEN 200
 * ===========================================================================
 * Telegram REINTENTA durante horas lo que no recibe un 2xx. Un 401 a una
 * actualizacion basura la convierte en una actualizacion basura que vuelve cada
 * pocos segundos, y ademas le confirma a quien sondea que la URL es la buena.
 * Por eso el 200 se afirma en TODOS los casos, incluido el del secreto malo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashToken } from "@/lib/tutor/tokens";

// `bot.ts` lo declara, y fuera de Next no resuelve.
vi.mock("server-only", () => ({}));

const SECRETO = "un-secreto-de-webhook-largo-y-tonto";
const TUTOR = "aaaaaaaa-0000-4000-8000-000000000001";
const CHAT_ID = 123456789012345;

/** 43 caracteres del alfabeto url-safe: lo que produce `generarToken()`. */
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

/** Lo que devuelve el `select` por `token_hash`. Cada prueba lo reescribe. */
let filaDelToken: Record<string, unknown> | null = null;
const update = vi.fn();
const eqDelUpdate = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_columna: string, _valor: string) => ({
          maybeSingle: () => Promise.resolve({ data: filaDelToken, error: null }),
        }),
      }),
      update: (fila: Record<string, unknown>) => {
        update(fila);
        return { eq: eqDelUpdate };
      },
    }),
  }),
}));

/** Lo que el bot le habria escrito al chat. No se afirma su texto, solo su uso. */
const enviado: string[] = [];
vi.mock("@/lib/telegram/bot", async (importarReal) => {
  const real = await importarReal<typeof import("@/lib/telegram/bot")>();
  return {
    ...real,
    enviarMensaje: (_chatId: number, texto: string) => {
      enviado.push(texto);
      return Promise.resolve(true);
    },
  };
});

function actualizacion(texto: string): Request {
  return new Request("https://cet.example/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: { chat: { id: CHAT_ID }, text: texto } }),
  });
}

/** La misma actualizacion, con la cabecera del secreto que se le indique. */
function conSecreto(secreto: string | null, texto = `/start ${TOKEN}`): Request {
  const peticion = actualizacion(texto);
  if (secreto !== null) peticion.headers.set("x-telegram-bot-api-secret-token", secreto);
  return peticion;
}

function dentroDeMediaHora(): string {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  enviado.length = 0;
  vi.stubEnv("TELEGRAM_TOKEN", "123:falso");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRETO);
  eqDelUpdate.mockResolvedValue({ error: null });
  filaDelToken = { guardian_id: TUTOR, token_expira_at: dentroDeMediaHora() };
});

describe("POST /api/telegram/webhook · la cabecera del secreto", () => {
  it("con el secreto correcto, vincula el chat y quema el token", async () => {
    const { POST } = await import("./route");

    const respuesta = await POST(conSecreto(SECRETO));

    expect(respuesta.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);

    const escrito = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(escrito["chat_id"]).toBe(CHAT_ID);
    // De un solo uso. Si sobreviviera, quien lo hubiera visto podria reapuntar
    // los avisos a otro chat mas tarde.
    expect(escrito["token_hash"]).toBeNull();
    expect(escrito["token_expira_at"]).toBeNull();
    expect(typeof escrito["vinculado_at"]).toBe("string");

    // La escritura se acota por el tutor del token, jamas por el cuerpo.
    expect(eqDelUpdate).toHaveBeenCalledWith("guardian_id", TUTOR);
  });

  it("con el secreto INCORRECTO no vincula nada, y aun asi responde 200", async () => {
    const { POST } = await import("./route");

    const respuesta = await POST(conSecreto("otro-secreto-cualquiera-de-igual-largo"));

    expect(respuesta.status).toBe(200);
    // La linea entera del fallo cabe aqui: si esto se llamara, cualquiera que
    // descubriera la URL desviaria los avisos de un menor a su propio Telegram.
    expect(update).not.toHaveBeenCalled();
    // Ni una palabra de vuelta: quien sondea no distingue este caso de un token
    // que nunca existio, y eso es lo que hace inutil sondear.
    expect(enviado).toHaveLength(0);
  });

  it("SIN la cabecera no vincula nada, y responde 200", async () => {
    const { POST } = await import("./route");

    const respuesta = await POST(conSecreto(null));

    expect(respuesta.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });

  it("sin TELEGRAM_WEBHOOK_SECRET configurado se rechaza TODO", async () => {
    // Una variable de entorno que alguien olvida configurar no puede convertir
    // la puerta en abierta: es exactamente asi como se abren.
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    const { POST } = await import("./route");

    const respuesta = await POST(conSecreto(SECRETO));

    expect(respuesta.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("POST /api/telegram/webhook · el token de vinculacion", () => {
  it("un token CADUCADO no vincula", async () => {
    filaDelToken = {
      guardian_id: TUTOR,
      token_expira_at: new Date(Date.now() - 1000).toISOString(),
    };
    const { POST } = await import("./route");

    const respuesta = await POST(conSecreto(SECRETO));

    expect(respuesta.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    // Aqui si se contesta: quien ha llegado hasta el chat es un padre real que
    // se ha demorado, y merece saber que tiene que generar otro.
    expect(enviado).toHaveLength(1);
  });

  it("un token que no existe responde LO MISMO que uno caducado", async () => {
    filaDelToken = null;
    const { POST } = await import("./route");

    await POST(conSecreto(SECRETO));

    expect(update).not.toHaveBeenCalled();
    expect(enviado[0]).toContain("ya no vale");
  });

  it("busca por el HASH del token, nunca por el token en claro", async () => {
    const { POST } = await import("./route");

    await POST(conSecreto(SECRETO));

    // La base guarda el SHA-256. Si la consulta usara el token en claro, no
    // encontraria nada — o, peor, significaria que ahi vive en claro.
    expect(hashToken(TOKEN)).toHaveLength(64);
    expect(hashToken(TOKEN)).not.toBe(TOKEN);
  });

  it("un `/start` sin token no vincula, pero contesta al padre", async () => {
    const { POST } = await import("./route");

    const respuesta = await POST(conSecreto(SECRETO, "/start"));

    expect(respuesta.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(enviado).toHaveLength(1);
  });

  it("un token con la forma equivocada ni siquiera llega a la base", async () => {
    const { POST } = await import("./route");

    // Mas corto de 43: no es lo que produce `generarToken()`, asi que se
    // descarta antes de convertirse en el parametro de una consulta.
    const respuesta = await POST(conSecreto(SECRETO, "/start abc"));

    expect(respuesta.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });

  it("un cuerpo que no es JSON no tumba la ruta", async () => {
    const { POST } = await import("./route");

    const peticion = new Request("https://cet.example/api/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": SECRETO,
      },
      body: "esto no es json",
    });

    const respuesta = await POST(peticion);

    expect(respuesta.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("GET /api/telegram/webhook", () => {
  it("Telegram solo hace POST: un GET es alguien mirando", async () => {
    const { GET } = await import("./route");

    const respuesta = GET();

    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.get("allow")).toBe("POST");
  });
});
