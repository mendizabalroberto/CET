import { fetchConPlazo, PlazoAgotadoError } from "../net/plazo";

export const MODELO_DEEPSEEK = "deepseek-chat";
export const PLAZO_DEEPSEEK_MS = 60_000;
const URL_DEEPSEEK_POR_DEFECTO = "https://api.deepseek.com/chat/completions";

/**
 * La URL real por defecto; solo el e2e la sustituye, apuntando a un servidor
 * HTTP local que responde con la forma exacta de chat completions
 * (`apps/web/e2e/mock-deepseek.mjs`). En producción `DEEP_SEEK_URL` no se
 * define, así que esta función siempre devuelve la URL real — no hay bandera
 * que cambie el comportamiento por defecto.
 */
export function urlDeepSeek(env: NodeJS.ProcessEnv = process.env): string {
  const url = env["DEEP_SEEK_URL"]?.trim();
  return url === undefined || url === "" ? URL_DEEPSEEK_POR_DEFECTO : url;
}

export class DeepSeekError extends Error {
  readonly motivo: "sin_clave" | "http" | "sin_json" | "plazo";
  constructor(motivo: "sin_clave" | "http" | "sin_json" | "plazo", mensaje: string) {
    super(mensaje);
    this.motivo = motivo;
  }
}

export interface LlamadaDeepSeek {
  readonly system: string;
  readonly user: string;
  readonly maxTokens?: number;
}

export interface RespuestaDeepSeek {
  readonly json: unknown;
  readonly modelo: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

export type Transporte = typeof fetchConPlazo;

interface CuerpoDeepSeek {
  choices?: Array<{ message?: { content?: unknown } }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function claveDeepSeek(env: NodeJS.ProcessEnv = process.env): string {
  const clave = env["DEEP_SEEK_API"]?.trim() ?? "";
  if (clave === "") throw new DeepSeekError("sin_clave", "falta DEEP_SEEK_API");
  return clave;
}

export async function llamarDeepSeek(
  llamada: LlamadaDeepSeek,
  transporte: Transporte = fetchConPlazo,
): Promise<RespuestaDeepSeek> {
  const clave = claveDeepSeek();
  try {
    const r = await transporte(
      urlDeepSeek(),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${clave}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODELO_DEEPSEEK,
          messages: [
            { role: "system", content: llamada.system },
            { role: "user", content: llamada.user },
          ],
          temperature: 0,
          max_tokens: llamada.maxTokens ?? 4000,
          response_format: { type: "json_object" },
        }),
      },
      PLAZO_DEEPSEEK_MS,
    );

    if (!r.ok) throw new DeepSeekError("http", `DeepSeek respondio HTTP ${r.status}`);

    const cuerpo = r.cuerpo as CuerpoDeepSeek | null;
    const contenido = cuerpo?.choices?.[0]?.message?.content;
    if (typeof contenido !== "string")
      throw new DeepSeekError("sin_json", "la respuesta de DeepSeek no trae JSON valido");
    let json: unknown;
    try {
      json = JSON.parse(contenido) as unknown;
    } catch {
      throw new DeepSeekError("sin_json", "la respuesta de DeepSeek no trae JSON valido");
    }
    return {
      json,
      modelo: cuerpo?.model ?? MODELO_DEEPSEEK,
      tokensIn: cuerpo?.usage?.prompt_tokens ?? 0,
      tokensOut: cuerpo?.usage?.completion_tokens ?? 0,
    };
  } catch (causa) {
    if (causa instanceof PlazoAgotadoError)
      throw new DeepSeekError("plazo", "DeepSeek no respondio dentro del plazo");
    throw causa;
  }
}
