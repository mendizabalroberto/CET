import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));

function cadenaQueResuelve(resultado: unknown) {
  const eq = vi.fn().mockResolvedValue(resultado);
  const select = vi.fn().mockReturnValue({ eq });
  return { select };
}

describe("GET /api/plan/parte-diario", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("sin CRON_SECRET responde 503 y no toca la base", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const respuesta = await GET(
      new Request("http://localhost/api/plan/parte-diario"),
    );

    expect(respuesta.status).toBe(503);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("con la cabecera incorrecta responde 401 y no toca la base", async () => {
    vi.stubEnv("CRON_SECRET", "secreto-del-cron");
    const respuesta = await GET(
      new Request("http://localhost/api/plan/parte-diario", {
        headers: { authorization: "Bearer secreto-incorrecto" },
      }),
    );

    expect(respuesta.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("con cero planes activos responde 200 y procesados 0", async () => {
    vi.stubEnv("CRON_SECRET", "secreto-del-cron");
    mocks.from.mockReturnValue(cadenaQueResuelve({ data: [], error: null }));

    const respuesta = await GET(
      new Request("http://localhost/api/plan/parte-diario", {
        headers: { authorization: "Bearer secreto-del-cron" },
      }),
    );

    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as {
      fecha: string;
      procesados: number;
      enviados: number;
      repetidos: number;
      errores: unknown[];
    };
    expect(cuerpo.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cuerpo.procesados).toBe(0);
    expect(cuerpo.enviados).toBe(0);
    expect(cuerpo.repetidos).toBe(0);
    expect(cuerpo.errores).toEqual([]);
    expect(mocks.from).toHaveBeenCalledWith("planes_de_estudio");
  });
});
