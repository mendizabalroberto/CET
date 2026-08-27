/**
 * La ingesta de telemetría, probada por lo que ESCRIBE en la base.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * REGRESIÓN QUE ORIGINA ESTE FICHERO
 * ---------------------------------------------------------------------------
 * Durante una sesión entera de lecciones en producción, `learning_events` se
 * quedó en TRES filas. Los logs contaban el resto:
 *
 *   POST | 400 | /rest/v1/learning_events?on_conflict=session_id%2Cseq | node
 *   POST | 400 | ...  (una cada 2-5 segundos, en bucle)
 *
 * El handler hacía `upsert(..., { onConflict: "session_id,seq" })`. Esa
 * constraint NO existe: `learning_events` está particionada por rango sobre
 * `server_ts`, y en una tabla particionada un índice único DEBE incluir la
 * clave de partición. Postgres responde 42P10, PostgREST lo traduce a 400, el
 * handler devuelve 500 y la cola del cliente reintenta para siempre.
 *
 * Ningún test lo vio porque los que había prueban la COLA del cliente —que
 * reintentaba correctamente— y no lo que el servidor le pide a la base. El
 * `onConflict` era plausible: se apoyaba en un contrato escrito en
 * `modules/analytics/CLAUDE.md` que la tabla nunca llegó a cumplir.
 *
 * De ahí la forma de estos tests: no comprueban que la función "funcione",
 * comprueban la LLAMADA que le hace a la base de datos. Es la frontera donde
 * vivía el fallo.
 */
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const upsert = vi.fn();
const getUser = vi.fn();
const maybeSingle = vi.fn();
const skillsSelect = vi.fn();

const supabase = {
  auth: { getUser },
  from: vi.fn((table: string) => {
    if (table === "profiles") {
      return { select: () => ({ eq: () => ({ maybeSingle }) }) };
    }
    if (table === "skills") {
      return { select: () => ({ in: skillsSelect }) };
    }
    return { insert, upsert };
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(supabase),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  clientKeyFromHeaders: () => "test",
}));

const ALUMNO = "aaaaaaaa-0000-4000-8000-00000000003a";
const COLEGIO = "11111111-1111-4111-8111-111111111111";
const SESION = "0e0e0e0e-0000-4000-8000-0000000000ff";
const SKILL_ID = "22222222-2222-4222-8222-222222222222";
const SKILL_CODE = "math.fractions.simplify";

function lote(eventos: number): Request {
  const events = Array.from({ length: eventos }, (_, i) => ({
    sessionId: SESION,
    seq: i,
    eventType: "lesson_opened",
    lessonId: "c4f3bc7f-e465-5f62-a374-0b060f5ff05c",
    payload: {},
    clientTs: new Date().toISOString(),
  }));

  return new Request("https://cet.example/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ALUMNO } }, error: null });
  maybeSingle.mockResolvedValue({
    data: { school_id: COLEGIO, role: "student", status: "active" },
    error: null,
  });
  insert.mockResolvedValue({ error: null });
  upsert.mockResolvedValue({ error: null });
  skillsSelect.mockResolvedValue({ data: [], error: null });
});

describe("POST /api/events · lo que le pide a la base", () => {
  it("NO usa onConflict: esa constraint no existe en una tabla particionada", async () => {
    const { POST } = await import("./route");

    const response = await POST(lote(3));

    expect(response.status).toBe(204);
    // El fallo entero cabe en esta línea: con `upsert` la petición se iba en 400.
    expect(upsert).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("inserta el lote entero en una sola sentencia", async () => {
    const { POST } = await import("./route");

    await POST(lote(30));

    const filas = insert.mock.calls[0]?.[0] as unknown[];
    expect(Array.isArray(filas)).toBe(true);
    expect(filas).toHaveLength(30);
  });

  it("deriva school_id y student_id de la SESIÓN, no del cuerpo", async () => {
    const { POST } = await import("./route");

    await POST(lote(1));

    const fila = (insert.mock.calls[0]?.[0] as Record<string, unknown>[])[0]!;
    expect(fila["student_id"]).toBe(ALUMNO);
    expect(fila["school_id"]).toBe(COLEGIO);
  });

  it("NUNCA envía server_ts: la hora la sella la base de datos", async () => {
    const { POST } = await import("./route");

    await POST(lote(1));

    const fila = (insert.mock.calls[0]?.[0] as Record<string, unknown>[])[0]!;
    expect(fila).not.toHaveProperty("server_ts");
    // `client_ts` sí viaja, pero como dato del cliente, no como verdad.
    expect(fila).toHaveProperty("client_ts");
  });

  it("un fallo real de la base sigue devolviendo 500 para que la cola reintente", async () => {
    insert.mockResolvedValue({ error: { message: "boom" } });
    const { POST } = await import("./route");

    const response = await POST(lote(1));

    expect(response.status).toBe(500);
  });

  it("EL FALLO DE PRODUCCIÓN: el 42501 de permisos queda en el log CON su código", async () => {
    // Línea literal de producción del 27/08/2026, repetida cada 2-3 segundos
    // durante meses: "[events] insert falló permission denied for table
    // learning_events". Faltaba el GRANT de INSERT y la política (migración
    // 0024). Sin el código en el mensaje, ese 500 era indistinguible de un
    // fallo de red y nadie miró la base de datos.
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    insert.mockResolvedValue({
      error: { message: "permission denied for table learning_events", code: "42501" },
    });
    const { POST } = await import("./route");

    const response = await POST(lote(1));

    expect(response.status).toBe(500);
    const mensaje = String(error.mock.calls[0]?.[0] ?? "");
    expect(mensaje).toContain("code=42501");
  });

  it("un profesor no genera telemetría de aprendizaje, y no es un error", async () => {
    maybeSingle.mockResolvedValue({
      data: { school_id: COLEGIO, role: "teacher", status: "active" },
      error: null,
    });
    const { POST } = await import("./route");

    const response = await POST(lote(1));

    expect(response.status).toBe(204);
    expect(insert).not.toHaveBeenCalled();
  });

  it("resuelve skill_id desde payload.skillCode cuando no llega skillId", async () => {
    // Si se borra la resolución, este test falla: `skill_id` quedaría NULL.
    skillsSelect.mockResolvedValue({
      data: [{ id: SKILL_ID, code: SKILL_CODE }],
      error: null,
    });
    const { POST } = await import("./route");
    const request = lote(1);
    const body = JSON.parse(await request.text());
    body.events[0].payload = { skillCode: SKILL_CODE };
    const modified = new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    await POST(modified);

    const fila = (insert.mock.calls[0]?.[0] as Record<string, unknown>[])[0]!;
    expect(fila["skill_id"]).toBe(SKILL_ID);
  });

  it("conserva un skillId explícito: la resolución por código no lo pisa", async () => {
    const { POST } = await import("./route");
    const request = lote(1);
    const body = JSON.parse(await request.text());
    body.events[0].skillId = SKILL_ID;
    body.events[0].payload = { skillCode: "math.other.code" };
    const modified = new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    await POST(modified);

    const fila = (insert.mock.calls[0]?.[0] as Record<string, unknown>[])[0]!;
    expect(fila["skill_id"]).toBe(SKILL_ID);
  });

  it("un skillCode desconocido deja skill_id NULL sin romper el lote", async () => {
    skillsSelect.mockResolvedValue({ data: [], error: null });
    const { POST } = await import("./route");
    const request = lote(1);
    const body = JSON.parse(await request.text());
    body.events[0].payload = { skillCode: "math.unknown.code" };
    const modified = new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await POST(modified);

    expect(response.status).toBe(204);
    const fila = (insert.mock.calls[0]?.[0] as Record<string, unknown>[])[0]!;
    expect(fila["skill_id"]).toBeNull();
  });

  it("resuelve todos los skillCodes del lote en una sola consulta", async () => {
    const { POST } = await import("./route");
    const request = lote(3);
    const body = JSON.parse(await request.text());
    body.events[0].payload = { skillCode: "math.fractions.simplify" };
    body.events[1].payload = { skillCode: "math.fractions.add" };
    body.events[2].payload = { skillCode: "math.fractions.simplify" };
    const modified = new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    await POST(modified);

    expect(skillsSelect).toHaveBeenCalledTimes(1);
    expect(skillsSelect.mock.calls[0]?.[1]).toEqual(["math.fractions.simplify", "math.fractions.add"]);
  });
});

describe("POST /api/events · superficie", () => {
  it("GET no existe y lo dice con Allow", async () => {
    const { GET } = await import("./route");
    const response: NextResponse = await GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});
