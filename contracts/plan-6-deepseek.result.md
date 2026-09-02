# Resultado - plan-6-deepseek
- Contrato: `contracts/plan-6-deepseek.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 2 de 4
- Rama: `deepseek/plan-6-deepseek`
- Duracion: 294.1 s
## Diff

~~~diff
diff --git a/apps/web/src/lib/plan/deepseek.test.ts b/apps/web/src/lib/plan/deepseek.test.ts
new file mode 100644
index 0000000..4fad211
--- /dev/null
+++ b/apps/web/src/lib/plan/deepseek.test.ts
@@ -0,0 +1,116 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
+import { PlazoAgotadoError } from "../net/plazo";
+import { DeepSeekError, MODELO_DEEPSEEK, PLAZO_DEEPSEEK_MS, llamarDeepSeek, type Transporte } from "./deepseek";
+
+describe("llamarDeepSeek", () => {
+  let urlVista = "";
+  let initVisto: RequestInit = {};
+  let plazoVisto = 0;
+
+  beforeEach(() => {
+    vi.stubEnv("DEEP_SEEK_API", "clave-de-prueba");
+    urlVista = "";
+    initVisto = {};
+    plazoVisto = 0;
+  });
+
+  afterEach(() => {
+    vi.unstubAllEnvs();
+  });
+
+  function transporteConCuerpo(cuerpo: unknown): Transporte {
+    return async (url, init, plazoMs) => {
+      urlVista = url;
+      initVisto = init;
+      plazoVisto = plazoMs ?? 0;
+      return { ok: true, status: 200, cuerpo };
+    };
+  }
+
+  async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
+    try {
+      await promesa;
+    } catch (causa) {
+      return causa;
+    }
+    return undefined;
+  }
+
+  it("manda la peticion correcta y parsea la respuesta feliz", async () => {
+    const transporte = transporteConCuerpo({
+      choices: [{ message: { content: '{"nota":7}' } }],
+      model: "deepseek-chat",
+      usage: { prompt_tokens: 10, completion_tokens: 20 },
+    });
+    const respuesta = await llamarDeepSeek({ system: "s", user: "u" }, transporte);
+
+    expect(urlVista).toBe("https://api.deepseek.com/chat/completions");
+    expect(plazoVisto).toBe(PLAZO_DEEPSEEK_MS);
+    const cabeceras = initVisto.headers as Record<string, string>;
+    expect(cabeceras.authorization).toBe("Bearer clave-de-prueba");
+    const enviado = JSON.parse(initVisto.body as string) as {
+      model: string;
+      messages: { role: string; content: string }[];
+      temperature: number;
+      max_tokens: number;
+      response_format: { type: string };
+    };
+    expect(enviado).toMatchObject({
+      model: MODELO_DEEPSEEK,
+      temperature: 0,
+      max_tokens: 4000,
+      response_format: { type: "json_object" },
+    });
+    expect(enviado.messages).toEqual([
+      { role: "system", content: "s" },
+      { role: "user", content: "u" },
+    ]);
+    expect(respuesta.json).toEqual({ nota: 7 });
+    expect(respuesta.modelo).toBe("deepseek-chat");
+    expect(respuesta.tokensIn).toBe(10);
+    expect(respuesta.tokensOut).toBe(20);
+  });
+
+  it("HTTP 401 da DeepSeekError http sin filtrar la clave", async () => {
+    const transporte: Transporte = async () => ({ ok: false, status: 401, cuerpo: null });
+    const error = await errorDe(llamarDeepSeek({ system: "s", user: "u" }, transporte));
+    expect(error).toBeInstanceOf(DeepSeekError);
+    const e = error as DeepSeekError;
+    expect(e.motivo).toBe("http");
+    expect(e.message).toContain("401");
+    expect(e.message).not.toContain("clave-de-prueba");
+  });
+
+  it("content que no es JSON da sin_json", async () => {
+    const transporte = transporteConCuerpo({
+      choices: [{ message: { content: "esto no es json" } }],
+    });
+    const error = await errorDe(llamarDeepSeek({ system: "s", user: "u" }, transporte));
+    expect(error).toBeInstanceOf(DeepSeekError);
+    expect((error as DeepSeekError).motivo).toBe("sin_json");
+  });
+
+  it("PlazoAgotadoError del transporte se convierte en plazo", async () => {
+    const transporte: Transporte = async () => {
+      throw new PlazoAgotadoError(60_000, "https://api.deepseek.com/chat/completions");
+    };
+    const error = await errorDe(llamarDeepSeek({ system: "s", user: "u" }, transporte));
+    expect(error).toBeInstanceOf(DeepSeekError);
+    expect((error as DeepSeekError).motivo).toBe("plazo");
+  });
+
+  it("sin DEEP_SEEK_API lanza sin_clave antes de usar el transporte", async () => {
+    vi.stubEnv("DEEP_SEEK_API", "");
+    let invocado = false;
+    const transporte: Transporte = async () => {
+      invocado = true;
+      return { ok: true, status: 200, cuerpo: null };
+    };
+    const error = await errorDe(llamarDeepSeek({ system: "s", user: "u" }, transporte));
+    expect(invocado).toBe(false);
+    expect(error).toBeInstanceOf(DeepSeekError);
+    const e = error as DeepSeekError;
+    expect(e.motivo).toBe("sin_clave");
+    expect(e.message).toContain("DEEP_SEEK_API");
+  });
+});
diff --git a/apps/web/src/lib/plan/deepseek.ts b/apps/web/src/lib/plan/deepseek.ts
new file mode 100644
index 0000000..ee045f5
--- /dev/null
+++ b/apps/web/src/lib/plan/deepseek.ts
@@ -0,0 +1,93 @@
+import { fetchConPlazo, PlazoAgotadoError } from "../net/plazo";
+
+export const MODELO_DEEPSEEK = "deepseek-chat";
+export const PLAZO_DEEPSEEK_MS = 60_000;
+const URL_DEEPSEEK = "https://api.deepseek.com/chat/completions";
+
+export class DeepSeekError extends Error {
+  readonly motivo: "sin_clave" | "http" | "sin_json" | "plazo";
+  constructor(motivo: "sin_clave" | "http" | "sin_json" | "plazo", mensaje: string) {
+    super(mensaje);
+    this.motivo = motivo;
+  }
+}
+
+export interface LlamadaDeepSeek {
+  readonly system: string;
+  readonly user: string;
+  readonly maxTokens?: number;
+}
+
+export interface RespuestaDeepSeek {
+  readonly json: unknown;
+  readonly modelo: string;
+  readonly tokensIn: number;
+  readonly tokensOut: number;
+}
+
+export type Transporte = typeof fetchConPlazo;
+
+interface CuerpoDeepSeek {
+  choices?: Array<{ message?: { content?: unknown } }>;
+  model?: string;
+  usage?: { prompt_tokens?: number; completion_tokens?: number };
+}
+
+export function claveDeepSeek(env: NodeJS.ProcessEnv = process.env): string {
+  const clave = env["DEEP_SEEK_API"]?.trim() ?? "";
+  if (clave === "") throw new DeepSeekError("sin_clave", "falta DEEP_SEEK_API");
+  return clave;
+}
+
+export async function llamarDeepSeek(
+  llamada: LlamadaDeepSeek,
+  transporte: Transporte = fetchConPlazo,
+): Promise<RespuestaDeepSeek> {
+  const clave = claveDeepSeek();
+  try {
+    const r = await transporte(
+      URL_DEEPSEEK,
+      {
+        method: "POST",
+        headers: {
+          authorization: `Bearer ${clave}`,
+          "content-type": "application/json",
+        },
+        body: JSON.stringify({
+          model: MODELO_DEEPSEEK,
+          messages: [
+            { role: "system", content: llamada.system },
+            { role: "user", content: llamada.user },
+          ],
+          temperature: 0,
+          max_tokens: llamada.maxTokens ?? 4000,
+          response_format: { type: "json_object" },
+        }),
+      },
+      PLAZO_DEEPSEEK_MS,
+    );
+
+    if (!r.ok) throw new DeepSeekError("http", `DeepSeek respondio HTTP ${r.status}`);
+
+    const cuerpo = r.cuerpo as CuerpoDeepSeek | null;
+    const contenido = cuerpo?.choices?.[0]?.message?.content;
+    if (typeof contenido !== "string")
+      throw new DeepSeekError("sin_json", "la respuesta de DeepSeek no trae JSON valido");
+    let json: unknown;
+    try {
+      json = JSON.parse(contenido) as unknown;
+    } catch {
+      throw new DeepSeekError("sin_json", "la respuesta de DeepSeek no trae JSON valido");
+    }
+    return {
+      json,
+      modelo: cuerpo?.model ?? MODELO_DEEPSEEK,
+      tokensIn: cuerpo?.usage?.prompt_tokens ?? 0,
+      tokensOut: cuerpo?.usage?.completion_tokens ?? 0,
+    };
+  } catch (causa) {
+    if (causa instanceof PlazoAgotadoError)
+      throw new DeepSeekError("plazo", "DeepSeek no respondio dentro del plazo");
+    throw causa;
+  }
+}

~~~

## Salida final de `pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec vitest run src/lib/plan/deepseek src/lib/peticion-sin-plazo`

~~~

> @cet/web@0.1.0 typecheck D:\.cet-worktrees\plan-6-deepseek\apps\web
> tsc --noEmit


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/plan-6-deepseek/apps/web[39m

 [32m✓[39m src/lib/plan/deepseek.test.ts [2m([22m[2m5 tests[22m[2m)[22m[90m 3[2mms[22m[39m
 [32m✓[39m src/lib/peticion-sin-plazo.test.ts [2m([22m[2m4 tests[22m[2m)[22m[90m 2[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m9 passed[39m[22m[90m (9)[39m
[2m   Start at [22m 12:50:24
[2m   Duration [22m 612ms[2m (transform 41ms, setup 330ms, collect 230ms, tests 5ms, environment 0ms, prepare 126ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.