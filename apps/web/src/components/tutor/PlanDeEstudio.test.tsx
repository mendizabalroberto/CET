// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BoletinResumen, EventoProximo, PlanResumen } from "@/lib/plan/consultas";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanDeEstudio, fechaLegible } from "./PlanDeEstudio";

vi.mock("@/lib/plan/acciones", () => ({
  cancelarPlan: vi.fn(),
  confirmarBoletin: vi.fn(),
  descartarBoletin: vi.fn(),
  fijarPlan: vi.fn(),
  proponerPlan: vi.fn(),
  subirBoletin: vi.fn(),
}));

vi.mock("@/lib/i18n/provider", async () => {
  const { en } = await import("@/lib/i18n/dictionaries/en");
  return {
    useI18n: () => {
      const fmt = (plantilla: string, valores: Record<string, string | number>): string =>
        plantilla.replace(/\{(\w+)\}/g, (_, clave: string) => String(valores[clave] ?? ""));
      return { t: en, fmt, locale: "en" };
    },
  };
});

const boletinExtraido: BoletinResumen = {
  id: "b-extraido",
  gestion: 2026,
  trimestre: 1,
  estado: "extraido",
  notas: [
    { materia: "Mathematics", code: "math", subject_id: "s-math", nota: 85, banda: "well_done" },
    { materia: "Art", code: null, subject_id: null, nota: 90, banda: "outstanding" },
  ],
  createdAt: "2026-09-01T00:00:00.000Z",
  confirmadoAt: null,
};

const boletinConfirmado: BoletinResumen = {
  ...boletinExtraido,
  id: "b-confirmado",
  estado: "confirmado",
  confirmadoAt: "2026-09-02T00:00:00.000Z",
};

const boletinAnterior: BoletinResumen = {
  ...boletinExtraido,
  id: "b-anterior",
  trimestre: null,
  estado: "confirmado",
  createdAt: "2026-05-01T00:00:00.000Z",
  confirmadoAt: "2026-05-02T00:00:00.000Z",
};

const planConTecho: PlanResumen = {
  id: "p-activo",
  boletinId: boletinConfirmado.id,
  desde: "2026-09-03",
  hasta: "2026-10-01",
  minutosPorDia: 45,
  reparto: {
    pesos: { math: 0.5 },
    techos: [
      {
        subjectId: "s-math",
        code: "math",
        minutosPedidos: 900,
        minutosDisponibles: 450,
      },
    ],
  },
  recomendaciones: ["Keep a steady pace."],
  createdAt: "2026-09-03T00:00:00.000Z",
  tareas: 20,
  partes: [],
};

const eventoCambridge: EventoProximo = {
  desde: "2026-10-10",
  hasta: "2026-10-10",
  tipo: "hito_cambridge",
  yearLevels: [6],
};

function renderizar(props: Partial<ComponentProps<typeof PlanDeEstudio>> = {}) {
  return render(
    <PlanDeEstudio
      studentId="student-1"
      boletin={null}
      boletines={[]}
      plan={null}
      nombre="Leo"
      eventos={[]}
      yearLevel={null}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("PlanDeEstudio", () => {
  it("pinta el nombre del hijo en el título", () => {
    renderizar({ nombre: "Leo" });
    expect(screen.getByRole("heading", { level: 2, name: /Leo/ })).toBeTruthy();
  });

  it("sin boletín muestra el aviso y el formulario de subida", () => {
    renderizar();
    expect(screen.getByText(/Start by uploading the report card/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Read the report card/ })).toBeTruthy();
  });

  it("con boletín extraído edita las notas y permite confirmarlas", () => {
    renderizar({ boletin: boletinExtraido, boletines: [boletinExtraido] });
    const input0 = screen.getByDisplayValue("85");
    const input1 = screen.getByDisplayValue("90");
    expect(input0.getAttribute("name")).toBe("nota:0");
    expect(input1.getAttribute("name")).toBe("nota:1");
    expect(screen.getAllByText(/Not planned/)).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Confirm the grades/ })).toBeTruthy();
  });

  it("con boletín extraído ofrece descartarlo, y con uno confirmado no", () => {
    const { rerender } = renderizar({ boletin: boletinExtraido, boletines: [boletinExtraido] });
    expect(screen.getByRole("button", { name: /Discard this report card/ })).toBeTruthy();
    rerender(
      <PlanDeEstudio
        studentId="student-1"
        boletin={boletinConfirmado}
        boletines={[boletinConfirmado]}
        plan={null}
        nombre="Leo"
        eventos={[]}
        yearLevel={null}
      />,
    );
    expect(screen.queryByRole("button", { name: /Discard this report card/ })).toBeNull();
  });

  it("con boletín confirmado no edita notas y ofrece proponer un plan", () => {
    renderizar({ boletin: boletinConfirmado, boletines: [boletinConfirmado] });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("button", { name: /Propose a plan/ })).toBeTruthy();
  });

  it("con plan activo muestra los techos de contenido", () => {
    renderizar({
      boletin: boletinConfirmado,
      boletines: [boletinConfirmado],
      plan: planConTecho,
    });
    expect(screen.getByText("Where the content runs out")).toBeTruthy();
  });

  it("con plan activo, cancelar pide confirmación antes de enviar el formulario", () => {
    renderizar({
      boletin: boletinConfirmado,
      boletines: [boletinConfirmado],
      plan: planConTecho,
    });
    expect(screen.queryByRole("button", { name: /^Yes, cancel$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^No, keep it$/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Cancel the plan$/ }));

    expect(screen.getByRole("button", { name: /^Yes, cancel$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^No, keep it$/ })).toBeTruthy();
  });

  it("con dos boletines el histórico enseña una fila", () => {
    renderizar({
      boletin: boletinConfirmado,
      boletines: [boletinConfirmado, boletinAnterior],
    });
    expect(screen.getByText(/Previous report cards/)).toBeTruthy();
    expect(screen.getAllByRole("group")).toHaveLength(1);
  });

  it("sin boletines anteriores el histórico está vacío", () => {
    renderizar({ boletin: boletinConfirmado, boletines: [boletinConfirmado] });
    expect(screen.getByText(/no previous report cards yet/)).toBeTruthy();
  });

  it("con un evento el calendario pinta su tipo, y sin eventos pinta el vacío", () => {
    const { rerender } = renderizar({ eventos: [eventoCambridge] });
    expect(screen.getByText("Cambridge exam")).toBeTruthy();

    rerender(
      <PlanDeEstudio
        studentId="student-1"
        boletin={null}
        boletines={[]}
        plan={null}
        nombre="Leo"
        eventos={[]}
        yearLevel={null}
      />,
    );
    expect(screen.getByText(/No marked dates in the next two months/)).toBeTruthy();
  });

  it("un successKey devuelto por una acción mockeada aparece en el acuse", async () => {
    const { subirBoletin } = await import("@/lib/plan/acciones");
    vi.mocked(subirBoletin).mockResolvedValue({ ok: true, successKey: "planBoletinExtraido" });

    renderizar();
    fireEvent.click(screen.getByRole("button", { name: /Read the report card/ }));

    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      expect.stringContaining("We've read"),
    );
  });
});

describe("fechaLegible", () => {
  it("una fecha civil no retrocede un dia en zonas al oeste de UTC", () => {
    // El proceso de test corre en la zona de la maquina; la fecha civil debe
    // salir igual en todas.
    expect(fechaLegible("2026-08-24", "es")).toBe("24/8/2026");
    expect(fechaLegible("2026-09-24", "en")).toBe("24/09/2026");
  });

  it("un texto que no es fecha se devuelve tal cual", () => {
    expect(fechaLegible("ayer", "es")).toBe("ayer");
  });
});
