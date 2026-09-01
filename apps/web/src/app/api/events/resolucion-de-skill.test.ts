import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

type SkillsResult = {
  data: Array<{ id: string; code: string }> | null;
  error: { message: string; code?: string } | null;
};

function buildRequest(events: unknown[]): Request {
  return new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events }),
  });
}

function makeSupabase() {
  let skillsResult: SkillsResult = { data: [], error: null };
  let insertError: { message: string; code?: string } | null = null;
  const inserted: Array<Record<string, unknown>> = [];
  const fromMock = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        // Sin `school_id`: desde 0066 la columna es NULL para todo alumno y el
        // colegio del evento lo da `colegio_del_evento()` (0077), no el perfil.
        maybeSingle: vi.fn().mockResolvedValue({
          data: { role: "student", status: "active" },
          error: null,
        }),
      };
    }
    if (table === "skills") {
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockImplementation(() => Promise.resolve(skillsResult)),
      };
    }
    if (table === "learning_events") {
      return {
        insert: vi.fn((rows: unknown[]) => {
          inserted.push(...(rows as Array<Record<string, unknown>>));
          return { error: insertError };
        }),
      };
    }
    throw new Error(`from(${table}) no esperado en el test`);
  });

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "student-1" } },
          error: null,
        }),
      },
      from: fromMock,
      rpc: vi.fn().mockResolvedValue({ data: "school-1", error: null }),
    },
    inserted,
    fromMock,
    setSkillsResult(result: SkillsResult) {
      skillsResult = result;
    },
    setInsertError(error: { message: string; code?: string } | null) {
      insertError = error;
    },
  };
}

describe("POST /api/events — resolución de skill_id desde payload.skillCode", () => {
  beforeEach(() => {
    mocks.rateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("guarda dos skill_id distintos y correctos para dos destrezas distintas", async () => {
    const { supabase, inserted, setSkillsResult } = makeSupabase();
    setSkillsResult({
      data: [
        { id: "11111111-1111-1111-1111-111111111111", code: "SKILL-A" },
        { id: "22222222-2222-2222-2222-222222222222", code: "SKILL-B" },
      ],
      error: null,
    });
    mocks.createClient.mockResolvedValue(supabase);

    const response = await POST(
      buildRequest([
        {
          sessionId: "00000000-0000-0000-0000-000000000001",
          seq: 1,
          eventType: "question_shown",
          payload: { skillCode: "SKILL-A" },
          clientTs: "2026-08-29T10:00:00.000Z",
        },
        {
          sessionId: "00000000-0000-0000-0000-000000000001",
          seq: 2,
          eventType: "question_shown",
          payload: { skillCode: "SKILL-B" },
          clientTs: "2026-08-29T10:00:01.000Z",
        },
      ]),
    );

    expect(response.status).toBe(204);
    expect(inserted).toHaveLength(2);
    expect(inserted[0]?.skill_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(inserted[1]?.skill_id).toBe("22222222-2222-2222-2222-222222222222");
    expect(inserted[0]?.skill_id).not.toBe(inserted[1]?.skill_id);
  });

  it("guarda skill_id nulo y deja rastro si el skillCode no existe", async () => {
    const { supabase, inserted, setSkillsResult } = makeSupabase();
    setSkillsResult({ data: [], error: null });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createClient.mockResolvedValue(supabase);

    const response = await POST(
      buildRequest([
        {
          sessionId: "00000000-0000-0000-0000-000000000001",
          seq: 1,
          eventType: "practice_item_answered",
          payload: { skillCode: "NO-EXISTE", isCorrect: true },
          clientTs: "2026-08-29T10:00:00.000Z",
        },
      ]),
    );

    expect(response.status).toBe(204);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.skill_id).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("NO-EXISTE");
  });

  it("si el select de skills falla, inserta igual y registra el fallo", async () => {
    const { supabase, inserted, setSkillsResult } = makeSupabase();
    setSkillsResult({
      data: null,
      error: { message: "connection refused", code: "PGRST001" },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createClient.mockResolvedValue(supabase);

    const response = await POST(
      buildRequest([
        {
          sessionId: "00000000-0000-0000-0000-000000000001",
          seq: 1,
          eventType: "question_shown",
          payload: { skillCode: "SKILL-A" },
          clientTs: "2026-08-29T10:00:00.000Z",
        },
      ]),
    );

    expect(response.status).toBe(204);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.skill_id).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("ESCRITURA PERDIDA");
  });

  it("sin skillCode no consulta skills ni registra nada", async () => {
    const { supabase, inserted, fromMock } = makeSupabase();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createClient.mockResolvedValue(supabase);

    const response = await POST(
      buildRequest([
        {
          sessionId: "00000000-0000-0000-0000-000000000001",
          seq: 1,
          eventType: "login_success",
          payload: {},
          clientTs: "2026-08-29T10:00:00.000Z",
        },
      ]),
    );

    expect(response.status).toBe(204);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.skill_id).toBeNull();
    const skillsCalls = fromMock.mock.calls.filter(
      ([table]) => table === "skills",
    );
    expect(skillsCalls).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
