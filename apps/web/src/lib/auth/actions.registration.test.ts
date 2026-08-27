/**
 * El alta pública, probada por CON QUÉ CLIENTE escribe y por qué hace cuando no
 * puede escribir.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * REGRESIÓN QUE ORIGINA ESTE FICHERO
 * ---------------------------------------------------------------------------
 * `submitRegistration` insertaba en `registration_requests` con el cliente
 * ANÓNIMO, y un comentario justo encima afirmaba que existía una política de
 * RLS que le concedía INSERT a `anon`. No existía, ni la política ni el GRANT.
 * Reproducido contra producción el 27/08/2026 en una transacción revertida:
 *
 *   [ANON alta] 42501 :: permission denied for table registration_requests
 *
 * O sea: el formulario de `/register` llevaba desde siempre sin escribir una
 * sola fila, y nadie lo sabía. Es la tercera vez que aparece el mismo patrón en
 * este repo (la telemetría y el envoltorio de auditoría fueron las otras dos):
 * dos piezas escritas por separado, cada una declarando lo contrario de la
 * otra, y la frontera rota hasta que alguien la ejecuta.
 *
 * De ahí la forma de estos tests. No comprueban que la acción "funcione":
 * comprueban QUÉ CLIENTE hace la escritura, porque el cliente era el fallo, y
 * comprueban que un fallo de escritura NO acabe en la pantalla de "solicitud
 * enviada" — que es la otra mitad del problema (R4: silencioso es peor que
 * ruidoso, y aquí lo que se pierde es la matrícula de un niño).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/* -------------------------------------------------------------------------- */
/* Dobles                                                                      */
/* -------------------------------------------------------------------------- */

const insert = vi.fn();
const gte = vi.fn();
const createAdminClient = vi.fn();
const listActiveSchools = vi.fn();
const rateLimit = vi.fn();
/** El cliente de SESIÓN. Que este `from` no se llame nunca es medio test. */
const sessionFrom = vi.fn();

const adminClient = {
  from: vi.fn(() => ({
    select: () => ({ eq: () => ({ gte }) }),
    insert,
  })),
};

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ "x-forwarded-for": "203.0.113.7" })),
}));

// `redirect()` de Next lanza para cortar el flujo. Se reproduce igual: si un
// test espera un redirect y la acción devuelve un estado, se ve la diferencia.
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: (r: string) => createAdminClient(r) }));
vi.mock("@/lib/data/schools", () => ({ listActiveSchools: () => listActiveSchools() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ from: sessionFrom, auth: {} }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => rateLimit(...args),
  clientKeyFromHeaders: () => "203.0.113.7",
}));

const COLEGIO = "11111111-1111-4111-8111-111111111111";
const IDLE = { status: "idle" } as const;

function formulario(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const campos: Record<string, string> = {
    schoolId: COLEGIO,
    fullName: "Ana García",
    requestedYearLevel: "6",
    guardianEmail: "Tutor@Example.Com",
    note: "",
    consent: "on",
    ...overrides,
  };
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

async function enviar(fd: FormData) {
  const { submitRegistration } = await import("./actions");
  try {
    const state = await submitRegistration(IDLE, fd);
    return { state, redirectedTo: null as string | null };
  } catch (error) {
    if (error instanceof RedirectSignal) return { state: null, redirectedTo: error.url };
    throw error;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  listActiveSchools.mockResolvedValue([{ id: COLEGIO, name: "Colegio Alfa" }]);
  createAdminClient.mockReturnValue(adminClient);
  gte.mockResolvedValue({ data: [], error: null });
  insert.mockResolvedValue({ error: null });
});

/* -------------------------------------------------------------------------- */

describe("submitRegistration · con qué cliente escribe", () => {
  it("escribe con SERVICE_ROLE, que es lo que arregla el 42501", async () => {
    const { redirectedTo } = await enviar(formulario());

    expect(createAdminClient).toHaveBeenCalledTimes(1);
    expect(adminClient.from).toHaveBeenCalledWith("registration_requests");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(redirectedTo).toBe("/register/sent");
  });

  it("NO usa el cliente de sesión para escribir: era el fallo entero", async () => {
    await enviar(formulario());
    // El cliente de sesión (anon, sin login) no toca ninguna tabla. La única
    // lectura que sigue yendo por ahí es el RPC `list_active_schools`, que está
    // detrás de `listActiveSchools()` y no pasa por `.from()`.
    expect(sessionFrom).not.toHaveBeenCalled();
  });

  it("exige un motivo de escalada al construir el cliente de servicio", async () => {
    await enviar(formulario());
    const [motivo] = createAdminClient.mock.calls[0] as [string];
    expect(motivo.length).toBeGreaterThanOrEqual(10);
    expect(motivo).toMatch(/registration_requests/);
  });

  it("fija status 'pending' en el servidor y normaliza el correo", async () => {
    await enviar(formulario());
    const fila = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(fila["status"]).toBe("pending");
    expect(fila["guardian_email"]).toBe("tutor@example.com");
    expect(fila["school_id"]).toBe(COLEGIO);
    // Una nota vacía se guarda como NULL, no como cadena vacía: la columna es
    // opcional y "" no es una nota.
    expect(fila["note"]).toBeNull();
  });
});

describe("submitRegistration · el fallo NO puede ser silencioso (R4)", () => {
  it("un insert rechazado no redirige a «solicitud enviada»", async () => {
    insert.mockResolvedValue({
      error: { code: "42501", message: "permission denied for table registration_requests" },
    });

    const { state, redirectedTo } = await enviar(formulario());

    expect(redirectedTo).toBeNull();
    expect(state).toEqual({ status: "error", error: "unexpected" });
  });

  it("y deja en el log del servidor el CÓDIGO, no solo el mensaje", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    insert.mockResolvedValue({
      error: { code: "42501", message: "permission denied for table registration_requests" },
    });

    await enviar(formulario());

    const registrado = spy.mock.calls.flat().join(" ");
    expect(registrado).toMatch(/42501/);
    expect(registrado).toMatch(/ESCRITURA PERDIDA/);
    spy.mockRestore();
  });

  it("si la lectura de deduplicación falla, falla CERRADO y no inserta", async () => {
    gte.mockResolvedValue({ data: null, error: { code: "08006", message: "connection failure" } });

    const { state } = await enviar(formulario());

    // Seguir adelante insertaría sin ninguna de las dos defensas antispam que
    // dependen de esa lectura, que es justo el formulario abierto que se evita.
    expect(insert).not.toHaveBeenCalled();
    expect(state).toEqual({ status: "error", error: "unexpected" });
  });
});

describe("submitRegistration · defensa antispam sin RLS detrás", () => {
  it("una solicitud idéntica ya pendiente no escribe una segunda fila", async () => {
    gte.mockResolvedValue({
      data: [{ id: "x", school_id: COLEGIO, full_name: "Ana García", status: "pending" }],
      error: null,
    });

    const { redirectedTo } = await enviar(formulario());

    expect(insert).not.toHaveBeenCalled();
    // Y aun así se le enseña la pantalla de enviada: al tutor que pulsa dos
    // veces no se le puede decir que ha hecho algo mal, y un "ya existe" sería
    // un oráculo de qué alumnos están apuntados en qué colegio.
    expect(redirectedTo).toBe("/register/sent");
  });

  it("un hermano distinto con el mismo correo SÍ se guarda", async () => {
    gte.mockResolvedValue({
      data: [{ id: "x", school_id: COLEGIO, full_name: "Ana García", status: "pending" }],
      error: null,
    });

    await enviar(formulario({ fullName: "Luis García" }));

    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("corta a la sexta solicitud del mismo correo en 24 h", async () => {
    gte.mockResolvedValue({
      data: Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        school_id: COLEGIO,
        full_name: `Hermano ${i}`,
        status: "pending",
      })),
      error: null,
    });

    const { state } = await enviar(formulario({ fullName: "Hermano 6" }));

    // Por CORREO, no por IP: el limitador en memoria se rinde ante un atacante
    // que rote de dirección, y este no.
    expect(insert).not.toHaveBeenCalled();
    expect(state).toEqual({ status: "error", error: "rate_limited" });
  });

  it("el limitador por dispositivo sigue siendo la primera línea", async () => {
    rateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 600 });

    const { state } = await enviar(formulario());

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(state).toEqual({ status: "error", error: "rate_limited" });
  });
});

describe("submitRegistration · la validación es ahora la única frontera", () => {
  it("un colegio que no está activo no llega a la base", async () => {
    listActiveSchools.mockResolvedValue([{ id: COLEGIO, name: "Colegio Alfa" }]);

    const { state } = await enviar(
      formulario({ schoolId: "99999999-9999-4999-8999-999999999999" }),
    );

    expect(createAdminClient).not.toHaveBeenCalled();
    // Mismo código que un fallo de base: distinguirlos permitiría enumerar los
    // colegios dados de alta.
    expect(state).toEqual({ status: "error", error: "unexpected" });
  });

  it("un nombre con caracteres de control se rechaza", async () => {
    // Un NUL en mitad del nombre: partiria la linea del log del servidor y la
    // celda de la tabla de la cola del administrador.
    const { state } = await enviar(formulario({ fullName: "Ana\u0000Garcia" }));

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(state?.status).toBe("error");
  });

  it("un nombre que empieza por '=' se rechaza (CSV injection en el panel)", async () => {
    const { state } = await enviar(formulario({ fullName: "=1+1" }));

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(state?.status).toBe("error");
  });

  it("sin consentimiento no hay solicitud", async () => {
    const fd = formulario();
    fd.delete("consent");

    const { state } = await enviar(fd);

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(state).toEqual({ status: "error", error: "consent_required", field: "consent" });
  });

  it("un correo mal formado se señala en su campo", async () => {
    const { state } = await enviar(formulario({ guardianEmail: "no-es-un-correo" }));

    expect(state).toEqual({ status: "error", error: "invalid_email", field: "guardianEmail" });
  });
});
