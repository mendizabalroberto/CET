---
id: plan-6-deepseek
model: reasoner
territory: [apps/web/src/lib/plan/deepseek*]
forbidden: [apps/web/src/lib/net/plazo.ts, apps/web/src/lib/telegram/bot.ts, apps/web/src/lib/peticion-sin-plazo.test.ts]
context: [apps/web/src/lib/net/plazo.ts, apps/web/src/lib/telegram/bot.ts]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec vitest run src/lib/plan/deepseek src/lib/peticion-sin-plazo
rounds: 4
deadline: 4 rondas o 25 min
---

## 1 · El problema

Dos pasos del plan de estudio (extraer el boletín y proponer el reparto) llaman
a `deepseek-chat` pidiendo un objeto JSON. Hace falta **un único cliente**,
pequeño, con plazo, que devuelva el JSON parseado y los tokens consumidos —
las tablas `boletines` y `planes_de_estudio` guardan `modelo`, `tokens_in`,
`tokens_out`. Te toca `apps/web/src/lib/plan/deepseek.ts` y
`apps/web/src/lib/plan/deepseek.test.ts`. Los prompts los escriben otros
agentes; tú no sabes qué dicen.

## 2 · La evidencia que ya tenemos

- **La única llamada a `fetch` permitida en `apps/web/src` es
  `fetchConPlazo` de `apps/web/src/lib/net/plazo.ts`** (te lo doy). Hay un test
  de invariante, `peticion-sin-plazo.test.ts`, que recorre todos los ficheros
  y pone rojo cualquier `fetch(` fuera de ese portero; por eso está en tu
  `verify`. `fetchConPlazo(url, init, plazoMs)` devuelve
  `{ ok, status, cuerpo }` con el cuerpo ya parseado como JSON (`null` si no
  era JSON) y lanza `PlazoAgotadoError` al vencer.
- `apps/web/src/lib/telegram/bot.ts` (te lo doy) es un cliente HTTP de la casa
  que usa `fetchConPlazo`: cópiale la forma (constante de plazo documentada,
  errores por `message`, nunca registrar secretos).
- La API: `POST https://api.deepseek.com/chat/completions`, compatible con
  OpenAI. Cabeceras `Authorization: Bearer <clave>`, `Content-Type:
  application/json`. Cuerpo:
  `{ model, messages: [{role:"system",content},{role:"user",content}], temperature: 0, max_tokens, response_format: { type: "json_object" } }`.
  Respuesta: `choices[0].message.content` es una cadena con el JSON;
  `usage.prompt_tokens` y `usage.completion_tokens` son los tokens.
- La clave vive en la variable de entorno **`DEEP_SEEK_API`** (con guion bajo
  entre DEEP y SEEK; no `DEEPSEEK_API_KEY`). En Vercel se declara con ese
  mismo nombre.

## 3 · El criterio de aceptación

`pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec vitest run src/lib/plan/deepseek src/lib/peticion-sin-plazo` sale en 0.

`deepseek.ts` exporta exactamente esto:

```ts
export const MODELO_DEEPSEEK = "deepseek-chat";
export const PLAZO_DEEPSEEK_MS = 60_000;
export class DeepSeekError extends Error { readonly motivo: "sin_clave" | "http" | "sin_json" | "plazo"; }
export interface LlamadaDeepSeek { readonly system: string; readonly user: string; readonly maxTokens?: number; }
export interface RespuestaDeepSeek { readonly json: unknown; readonly modelo: string; readonly tokensIn: number; readonly tokensOut: number; }
export type Transporte = typeof fetchConPlazo;
export function claveDeepSeek(env?: NodeJS.ProcessEnv): string;
export async function llamarDeepSeek(llamada: LlamadaDeepSeek, transporte?: Transporte): Promise<RespuestaDeepSeek>;
```

- `claveDeepSeek(env = process.env)`: devuelve `DEEP_SEEK_API` recortado;
  si falta o está vacía, `DeepSeekError` con `motivo: "sin_clave"` y un mensaje
  que diga el nombre exacto de la variable. **La clave no aparece nunca en un
  mensaje de error ni en un `console.*`.**
- `llamarDeepSeek`: usa `transporte` (por defecto `fetchConPlazo`) con
  `PLAZO_DEEPSEEK_MS`; `maxTokens` por defecto 4000; `temperature: 0`;
  `response_format: { type: "json_object" }`. Si `ok` es falso →
  `DeepSeekError("http")` con el `status` en el mensaje. Si el cuerpo no trae
  `choices[0].message.content` como cadena, o esa cadena no es JSON parseable →
  `DeepSeekError("sin_json")`. Si el transporte lanza `PlazoAgotadoError` →
  `DeepSeekError("plazo")`. Devuelve `{ json, modelo: cuerpo.model ??
  MODELO_DEEPSEEK, tokensIn: usage.prompt_tokens ?? 0, tokensOut:
  usage.completion_tokens ?? 0 }`.
- Ningún `console.log` del prompt ni de la respuesta: el prompt contiene el
  boletín de un menor.

Pruebas en `deepseek.test.ts`, con un `transporte` falso (una función que
registra `url`, `init` y devuelve lo que el test quiera):

- Manda a la URL correcta, con `Authorization: Bearer <clave>`, `temperature`
  0, `response_format` json_object y los dos mensajes en orden system, user.
- Respuesta feliz: `json` es el objeto parseado, `tokensIn`/`tokensOut` salen
  de `usage`, `modelo` del cuerpo.
- `ok: false, status: 401` → `DeepSeekError` con `motivo: "http"` y `401` en el
  mensaje; el mensaje no contiene la clave.
- `content` que no es JSON → `sin_json`.
- Transporte que lanza `PlazoAgotadoError` → `plazo`.
- Sin `DEEP_SEEK_API` → `sin_clave` **antes** de llamar al transporte (el
  transporte falso no se invoca). Fija la clave en los otros tests con
  `vi.stubEnv("DEEP_SEEK_API", "clave-de-prueba")` y restáurala.

## 4 · Qué NO cuenta como resuelto

- **Un diff cortado.** Un intento anterior agotó el tope de salida y los dos
  ficheros llegaron truncados (`error TS1005: '}' expected` en la última
  línea). Escribe código compacto: comentarios de una línea, sin cabeceras
  largas. Los dos ficheros juntos no deberían pasar de 220 líneas.
- Un `fetch(` directo. El test de invariante lo caza.
- Tocar `plazo.ts` o `bot.ts`.
- Un plazo distinto de `PLAZO_DEEPSEEK_MS` o ausente.
- La clave, el prompt o la respuesta en un `console.*` o en un `Error.message`.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.
