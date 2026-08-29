# Resultado - cierre-6-ingesta-no-resuelve-skill
- Contrato: `contracts/cierre-6-ingesta-no-resuelve-skill.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 3 de 4
- Rama: `deepseek/cierre-6-ingesta-no-resuelve-skill`
- Duracion: 401.2 s
## Diff

~~~diff
diff --git a/apps/web/src/app/api/events/resolucion-de-skill.test.ts b/apps/web/src/app/api/events/resolucion-de-skill.test.ts
new file mode 100644
index 0000000..0b908a7
--- /dev/null
+++ b/apps/web/src/app/api/events/resolucion-de-skill.test.ts
@@ -0,0 +1,209 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
+import { POST } from "./route";
+
+const mocks = vi.hoisted(() => ({
+  rateLimit: vi.fn(),
+  createClient: vi.fn(),
+}));
+
+vi.mock("@/lib/security/rate-limit", () => ({
+  rateLimit: mocks.rateLimit,
+}));
+
+vi.mock("@/lib/supabase/server", () => ({
+  createClient: mocks.createClient,
+}));
+
+type SkillsResult = {
+  data: Array<{ id: string; code: string }> | null;
+  error: { message: string; code?: string } | null;
+};
+
+function buildRequest(events: unknown[]): Request {
+  return new Request("http://localhost/api/events", {
+    method: "POST",
+    headers: { "content-type": "application/json" },
+    body: JSON.stringify({ events }),
+  });
+}
+
+function makeSupabase() {
+  let skillsResult: SkillsResult = { data: [], error: null };
+  let insertError: { message: string; code?: string } | null = null;
+  const inserted: Array<Record<string, unknown>> = [];
+  const fromMock = vi.fn((table: string) => {
+    if (table === "profiles") {
+      return {
+        select: vi.fn().mockReturnThis(),
+        eq: vi.fn().mockReturnThis(),
+        maybeSingle: vi.fn().mockResolvedValue({
+          data: { school_id: "school-1", role: "student", status: "active" },
+          error: null,
+        }),
+      };
+    }
+    if (table === "skills") {
+      return {
+        select: vi.fn().mockReturnThis(),
+        in: vi.fn().mockImplementation(() => Promise.resolve(skillsResult)),
+      };
+    }
+    if (table === "learning_events") {
+      return {
+        insert: vi.fn((rows: unknown[]) => {
+          inserted.push(...(rows as Array<Record<string, unknown>>));
+          return { error: insertError };
+        }),
+      };
+    }
+    throw new Error(`from(${table}) no esperado en el test`);
+  });
+
+  return {
+    supabase: {
+      auth: {
+        getUser: vi.fn().mockResolvedValue({
+          data: { user: { id: "student-1" } },
+          error: null,
+        }),
+      },
+      from: fromMock,
+    },
+    inserted,
+    fromMock,
+    setSkillsResult(result: SkillsResult) {
+      skillsResult = result;
+    },
+    setInsertError(error: { message: string; code?: string } | null) {
+      insertError = error;
+    },
+  };
+}
+
+describe("POST /api/events — resolución de skill_id desde payload.skillCode", () => {
+  beforeEach(() => {
+    mocks.rateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
+  });
+
+  afterEach(() => {
+    vi.clearAllMocks();
+    vi.restoreAllMocks();
+  });
+
+  it("guarda dos skill_id distintos y correctos para dos destrezas distintas", async () => {
+    const { supabase, inserted, setSkillsResult } = makeSupabase();
+    setSkillsResult({
+      data: [
+        { id: "11111111-1111-1111-1111-111111111111", code: "SKILL-A" },
+        { id: "22222222-2222-2222-2222-222222222222", code: "SKILL-B" },
+      ],
+      error: null,
+    });
+    mocks.createClient.mockResolvedValue(supabase);
+
+    const response = await POST(
+      buildRequest([
+        {
+          sessionId: "00000000-0000-0000-0000-000000000001",
+          seq: 1,
+          eventType: "question_shown",
+          payload: { skillCode: "SKILL-A" },
+          clientTs: "2026-08-29T10:00:00.000Z",
+        },
+        {
+          sessionId: "00000000-0000-0000-0000-000000000001",
+          seq: 2,
+          eventType: "question_shown",
+          payload: { skillCode: "SKILL-B" },
+          clientTs: "2026-08-29T10:00:01.000Z",
+        },
+      ]),
+    );
+
+    expect(response.status).toBe(204);
+    expect(inserted).toHaveLength(2);
+    expect(inserted[0].skill_id).toBe("11111111-1111-1111-1111-111111111111");
+    expect(inserted[1].skill_id).toBe("22222222-2222-2222-2222-222222222222");
+    expect(inserted[0].skill_id).not.toBe(inserted[1].skill_id);
+  });
+
+  it("guarda skill_id nulo y deja rastro si el skillCode no existe", async () => {
+    const { supabase, inserted, setSkillsResult } = makeSupabase();
+    setSkillsResult({ data: [], error: null });
+    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
+    mocks.createClient.mockResolvedValue(supabase);
+
+    const response = await POST(
+      buildRequest([
+        {
+          sessionId: "00000000-0000-0000-0000-000000000001",
+          seq: 1,
+          eventType: "practice_item_answered",
+          payload: { skillCode: "NO-EXISTE", isCorrect: true },
+          clientTs: "2026-08-29T10:00:00.000Z",
+        },
+      ]),
+    );
+
+    expect(response.status).toBe(204);
+    expect(inserted).toHaveLength(1);
+    expect(inserted[0].skill_id).toBeNull();
+    expect(errorSpy).toHaveBeenCalled();
+    expect(String(errorSpy.mock.calls[0][0])).toContain("NO-EXISTE");
+  });
+
+  it("si el select de skills falla, inserta igual y registra el fallo", async () => {
+    const { supabase, inserted, setSkillsResult } = makeSupabase();
+    setSkillsResult({
+      data: null,
+      error: { message: "connection refused", code: "PGRST001" },
+    });
+    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
+    mocks.createClient.mockResolvedValue(supabase);
+
+    const response = await POST(
+      buildRequest([
+        {
+          sessionId: "00000000-0000-0000-0000-000000000001",
+          seq: 1,
+          eventType: "question_shown",
+          payload: { skillCode: "SKILL-A" },
+          clientTs: "2026-08-29T10:00:00.000Z",
+        },
+      ]),
+    );
+
+    expect(response.status).toBe(204);
+    expect(inserted).toHaveLength(1);
+    expect(inserted[0].skill_id).toBeNull();
+    expect(errorSpy).toHaveBeenCalled();
+    expect(String(errorSpy.mock.calls[0][0])).toContain("ESCRITURA PERDIDA");
+  });
+
+  it("sin skillCode no consulta skills ni registra nada", async () => {
+    const { supabase, inserted, fromMock } = makeSupabase();
+    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
+    mocks.createClient.mockResolvedValue(supabase);
+
+    const response = await POST(
+      buildRequest([
+        {
+          sessionId: "00000000-0000-0000-0000-000000000001",
+          seq: 1,
+          eventType: "login_success",
+          payload: {},
+          clientTs: "2026-08-29T10:00:00.000Z",
+        },
+      ]),
+    );
+
+    expect(response.status).toBe(204);
+    expect(inserted).toHaveLength(1);
+    expect(inserted[0].skill_id).toBeNull();
+    const skillsCalls = fromMock.mock.calls.filter(
+      ([table]) => table === "skills",
+    );
+    expect(skillsCalls).toHaveLength(0);
+    expect(errorSpy).not.toHaveBeenCalled();
+  });
+});
diff --git a/apps/web/src/app/api/events/route.ts b/apps/web/src/app/api/events/route.ts
index 645c72f..39c3595 100644
--- a/apps/web/src/app/api/events/route.ts
+++ b/apps/web/src/app/api/events/route.ts
@@ -146,12 +146,40 @@ export async function POST(request: Request): Promise<NextResponse> {
 
   const skillIdByCode = new Map<string, string>();
   if (skillCodes.length > 0) {
-    const { data: skills } = await supabase
+    const { data: skills, error } = await supabase
       .from("skills")
       .select("id, code")
       .in("code", skillCodes);
-    for (const skill of skills ?? []) {
-      skillIdByCode.set(skill.code, skill.id);
+ 
+    // CAUSA DEL FALLO MEDIDO EL 2026-08-29: este resultado se consumía sin
+    // comprobar `error`. Un fallo del select (red, timeout, RLS, PostgREST)
+    // dejaba `data` en null, el mapa vacío y el lote entero con `skill_id`
+    // NULL sin una sola línea en los logs: se veía exactamente igual que un
+    // evento que legítimamente no tiene destreza. El arreglo no es «confiar
+    // en que el select funciona», es hacer que cualquier fallo deje rastro
+    // con el mismo patrón `ESCRITURA PERDIDA` que el resto de la ruta.
+    if (error) {
+      console.error(
+        `[events] ESCRITURA PERDIDA resolución de skill_id: code=${error.code ?? "sin-codigo"}`,
+        error.message,
+        { skillCodes },
+      );
+    } else {
+      const foundCodes = new Set<string>();
+      for (const skill of skills ?? []) {
+        foundCodes.add(skill.code);
+        skillIdByCode.set(skill.code, skill.id);
+      }
+      // Un skillCode presente en el payload y ausente en `skills` también es
+      // una escritura perdida: la fila se guarda con `skill_id` NULL y, sin
+      // este log, nadie puede distinguirla de una pregunta sin destreza.
+      for (const code of skillCodes) {
+        if (!foundCodes.has(code)) {
+          console.error(
+            `[events] ESCRITURA PERDIDA skillCode sin resolver: ${code}`,
+          );
+        }
+      }
     }
   }
 

~~~

## Salida final de `pnpm --filter @cet/web exec vitest run src/app/api/events/resolucion-de-skill.test.ts`

~~~

[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/cierre-6-ingesta-no-resuelve-skill/apps/web[39m

 [32m✓[39m src/app/api/events/resolucion-de-skill.test.ts [2m([22m[2m4 tests[22m[2m)[22m[90m 8[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m4 passed[39m[22m[90m (4)[39m
[2m   Start at [22m 11:33:40
[2m   Duration [22m 475ms[2m (transform 67ms, setup 152ms, collect 98ms, tests 8ms, environment 0ms, prepare 81ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.