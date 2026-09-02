// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import type { BoletinResumen, PlanResumen } from "@/lib/plan/consultas";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanDeEstudio } from "./PlanDeEstudio";

vi.mock("@/lib/plan/acciones", () => ({
  confirmarBoletin: vi.fn(),
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

function renderizar(props: Partial<ComponentProps<typeof PlanDeEstudio>> = {}) {
  return render(
    <PlanDeEstudio studentId="student-1" boletin={null} plan={null} nombre="Leo" {...props} />,
  );
}

afterEach(cleanup);

describe("PlanDeEstudio", () => {
  it("sin boletín muestra el aviso y el formulario de subida", () => {
    renderizar();
    expect(screen.getByText(/Start by uploading the report card/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Read the report card/ })).toBeTruthy();
  });

  it("con boletín extraído edita las notas y permite confirmarlas", () => {
    renderizar({ boletin: boletinExtraido });
    const input0 = screen.getByDisplayValue("85");
    const input1 = screen.getByDisplayValue("90");
    expect(input0.getAttribute("name")).toBe("nota:0");
    expect(input1.getAttribute("name")).toBe("nota:1");
    expect(screen.getAllByText(/Not planned/)).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Confirm the grades/ })).toBeTruthy();
  });

  it("con boletín confirmado no edita notas y ofrece proponer un plan", () => {
    renderizar({ boletin: boletinConfirmado });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("button", { name: /Propose a plan/ })).toBeTruthy();
  });

  it("con plan activo muestra los techos de contenido", () => {
    renderizar({ boletin: boletinConfirmado, plan: planConTecho });
    expect(screen.getByText("Where the content runs out")).toBeTruthy();
  });
});
