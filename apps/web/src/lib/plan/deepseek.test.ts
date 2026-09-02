import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlazoAgotadoError } from "../net/plazo";
import {
  DeepSeekError,
  MODELO_DEEPSEEK,
  PLAZO_DEEPSEEK_MS,
  llamarDeepSeek,
  urlDeepSeek,
  type Transporte,
} from "./deepseek";

describe("llamarDeepSeek", () => {
  let urlVista = "";
  let initVisto: RequestInit = {};
  let plazoVisto = 0;

  beforeEach(() => {
    vi.stubEnv("DEEP_SEEK_API", "clave-de-prueba");
    urlVista = "";
    initVisto = {};
    plazoVisto = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function transporteConCuerpo(cuerpo: unknown): Transporte {
    return async (url, init, plazoMs) => {
      urlVista = url;
      initVisto = init;
      plazoVisto = plazoMs ?? 0;
      return { ok: true, status: 200, cuerpo };
    };
  }

  async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
    try {
      await promesa;
    } catch (causa) {
      return causa;
    }
    return undefined;
  }

  it("manda la peticion correcta y parsea la respuesta feliz", async () => {
    const transporte = transporteConCuerpo({
      choices: [{ message: { content: '{"nota":7}' } }],
      model: "deepseek-chat",
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });
    const respuesta = await llamarDeepSeek({ system: "s", user: "u" }, transporte);

    expect(urlVista).toBe("https://api.deepseek.com/chat/completions");
    expect(plazoVisto).toBe(PLAZO_DEEPSEEK_MS);
    const cabeceras = initVisto.headers as Record<string, string>;
    expect(cabeceras.authorization).toBe("Bearer clave-de-prueba");
    const enviado = JSON.parse(initVisto.body as string) as {
      model: string;
      messages: { role: string; content: string }[];
      temperature: number;
      max_tokens: number;
      response_format: { type: string };
    };
    expect(enviado).toMatchObject({
      model: MODELO_DEEPSEEK,
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });
    expect(enviado.messages).toEqual([
      { role: "system", content: "s" },
      { role: "user", content: "u" },
    ]);
    expect(respuesta.json).toEqual({ nota: 7 });
    expect(respuesta.modelo).toBe("deepseek-chat");
    expect(respuesta.tokensIn).toBe(10);
    expect(respuesta.tokensOut).toBe(20);
  });

  it("HTTP 401 da DeepSeekError http sin filtrar la clave", async () => {
    const transporte: Transporte = async () => ({ ok: false, status: 401, cuerpo: null });
    const error = await errorDe(llamarDeepSeek({ system: "s", user: "u" }, transporte));
    expect(error).toBeInstanceOf(DeepSeekError);
    const e = error as DeepSeekError;
    expect(e.motivo).toBe("http");
    expect(e.message).toContain("401");
    expect(e.message).not.toContain("clave-de-prueba");
  });

  it("content que no es JSON da sin_json", async () => {
    const transporte = transporteConCuerpo({
      choices: [{ message: { content: "esto no es json" } }],
    });
    const error = await errorDe(llamarDeepSeek({ system: "s", user: "u" }, transporte));
    expect(error).toBeInstanceOf(DeepSeekError);
    expect((error as DeepSeekError).motivo).toBe("sin_json");
  });

  it("PlazoAgotadoError del transporte se convierte en plazo", async () => {
    const transporte: Transporte = async () => {
      throw new PlazoAgotadoError(60_000, "https://api.deepseek.com/chat/completions");
    };
    const error = await errorDe(llamarDeepSeek({ system: "s", user: "u" }, transporte));
    expect(error).toBeInstanceOf(DeepSeekError);
    expect((error as DeepSeekError).motivo).toBe("plazo");
  });

  it("urlDeepSeek usa la URL real por defecto, sin DEEP_SEEK_URL", () => {
    expect(urlDeepSeek({} as NodeJS.ProcessEnv)).toBe("https://api.deepseek.com/chat/completions");
  });

  it("DEEP_SEEK_URL sustituye la URL real: es el mock del e2e el que la fija", async () => {
    vi.stubEnv("DEEP_SEEK_URL", "http://127.0.0.1:9999/chat/completions");
    expect(urlDeepSeek()).toBe("http://127.0.0.1:9999/chat/completions");

    const transporte = transporteConCuerpo({
      choices: [{ message: { content: "{}" } }],
    });
    await llamarDeepSeek({ system: "s", user: "u" }, transporte);
    expect(urlVista).toBe("http://127.0.0.1:9999/chat/completions");
  });

  it("DEEP_SEEK_URL vacía o solo espacios no sustituye la URL real", () => {
    expect(urlDeepSeek({ DEEP_SEEK_URL: "" } as unknown as NodeJS.ProcessEnv)).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    expect(urlDeepSeek({ DEEP_SEEK_URL: "   " } as unknown as NodeJS.ProcessEnv)).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("sin DEEP_SEEK_API lanza sin_clave antes de usar el transporte", async () => {
    vi.stubEnv("DEEP_SEEK_API", "");
    let invocado = false;
    const transporte: Transporte = async () => {
      invocado = true;
      return { ok: true, status: 200, cuerpo: null };
    };
    const error = await errorDe(llamarDeepSeek({ system: "s", user: "u" }, transporte));
    expect(invocado).toBe(false);
    expect(error).toBeInstanceOf(DeepSeekError);
    const e = error as DeepSeekError;
    expect(e.motivo).toBe("sin_clave");
    expect(e.message).toContain("DEEP_SEEK_API");
  });
});
