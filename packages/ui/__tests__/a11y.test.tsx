/**
 * @cet/ui — accesibilidad automatizada y navegacion por teclado.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `jest-axe` no sustituye a probar con un lector de pantalla real, pero atrapa
 * la clase de fallo que mas se cuela: contenedores sin nombre accesible,
 * controles sin etiqueta, `aria-*` mal cableado.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState, type ReactNode } from "react";
import { LocaleProvider } from "../src/lib/i18n.js";
import { Button } from "../src/primitives/Button.js";
import { Input } from "../src/primitives/Input.js";
import { Checkbox } from "../src/primitives/Checkbox.js";
import { RadioGroup } from "../src/primitives/Radio.js";
import { Alert } from "../src/primitives/Alert.js";
import { Table } from "../src/primitives/Table.js";
import { Badge } from "../src/primitives/Badge.js";
import { Avatar } from "../src/primitives/Avatar.js";
import { ChoiceList } from "../src/exam/ChoiceList.js";
import { OrderingList } from "../src/exam/OrderingList.js";
import { MatchingGrid } from "../src/exam/MatchingGrid.js";
import { NumericInput } from "../src/exam/NumericInput.js";
import { FractionInput } from "../src/exam/FractionInput.js";
import { QuestionNavigator } from "../src/exam/QuestionNavigator.js";
import { AutosaveIndicator } from "../src/exam/AutosaveIndicator.js";
import { QuestionCard } from "../src/exam/QuestionCard.js";
import { CorrectFeedback } from "../src/feedback/CorrectFeedback.js";
import { IncorrectFeedback } from "../src/feedback/IncorrectFeedback.js";
import { HintPanel } from "../src/feedback/HintPanel.js";
import { StreakMeter } from "../src/feedback/StreakMeter.js";
import { StatTile } from "../src/data/StatTile.js";
import { ProgressBar } from "../src/data/ProgressBar.js";
import { MasteryMeter } from "../src/data/MasteryMeter.js";
import { ScoreRing } from "../src/data/ScoreRing.js";
import { EmptyState } from "../src/data/EmptyState.js";
import { ErrorState } from "../src/data/ErrorState.js";
import { RuleBox } from "../src/learning/RuleBox.js";
import { StepList } from "../src/learning/StepList.js";
import { SkipLink } from "../src/a11y/SkipLink.js";

function wrap(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="es">{node}</LocaleProvider>);
}

const CHOICES = [
  { id: "a", html: "Cuatro" },
  { id: "b", html: "Cinco" },
  { id: "c", html: "Seis" },
];

const T = (es: string, en: string): { es: string; en: string } => ({ es, en });

/** Fila del ejemplo de tabla. Las dos columnas comparten tipo. */
type UnitRow = { u: string; m: string };

describe("axe — componentes interactivos", () => {
  const cases: ReadonlyArray<readonly [string, ReactNode]> = [
    ["Button", <Button key="b">Comprobar</Button>],
    ["Input", <Input key="i" label={T("Codigo", "Code")} />],
    ["Input con error", <Input key="ie" label={T("PIN", "PIN")} error={T("Prueba otra vez", "Try again")} />],
    ["Checkbox", <Checkbox key="c" label={T("Acepto", "I agree")} />],
    [
      "RadioGroup",
      <RadioGroup
        key="r"
        legend={T("Elige", "Choose")}
        options={[
          { value: "1", label: T("Uno", "One") },
          { value: "2", label: T("Dos", "Two") },
        ]}
      />,
    ],
    ["Alert", <Alert key="a" tone="warning" toneLabel={T("Aviso", "Warning")} title={T("Ojo", "Careful")} />],
    ["Badge", <Badge key="bd">Fracciones</Badge>],
    ["Avatar", <Avatar key="av" name="Ana Perez" />],
    [
      "Table",
      <Table
        key="t"
        caption={T("Unidades", "Units")}
        columns={[
          { key: "u", header: T("Unidad", "Unit"), rowHeader: true, cell: (r: UnitRow) => r.u },
          { key: "m", header: T("Metros", "Metres"), cell: (r: UnitRow) => r.m },
        ]}
        rows={[{ u: "km", m: "1000" }]}
        rowKey={(r) => r.u}
      />,
    ],
    ["NumericInput", <NumericInput key="n" value="" onChange={() => {}} />],
    ["FractionInput", <FractionInput key="f" value={{ numerator: "", denominator: "" }} onChange={() => {}} />],
    ["StatTile", <StatTile key="s" value="12" label={T("Aciertos", "Correct")} />],
    ["ProgressBar", <ProgressBar key="p" value={40} label={T("Progreso", "Progress")} />],
    ["MasteryMeter", <MasteryMeter key="mm" mastery={0.7} skillLabel={T("Fracciones", "Fractions")} />],
    ["ScoreRing", <ScoreRing key="sr" value={18} max={20} />],
    ["StreakMeter", <StreakMeter key="st" current={3} best={5} />],
    ["EmptyState", <EmptyState key="e" />],
    ["ErrorState", <ErrorState key="er" onRetry={() => {}} reference="A1B2" />],
    ["CorrectFeedback", <CorrectFeedback key="cf" />],
    ["IncorrectFeedback", <IncorrectFeedback key="if" correctAnswerHtml="<b>3/4</b>" />],
    ["RuleBox", <RuleBox key="rb" html="<p>Regla</p>" />],
    ["StepList", <StepList key="sl" steps={[{ html: "Uno" }, { html: "Dos" }]} />],
    ["SkipLink", <SkipLink key="sk" label={T("Ir al contenido", "Skip to content")} />],
    [
      "QuestionNavigator",
      <QuestionNavigator
        key="qn"
        entries={[
          { ordinal: 1, state: "answered" },
          { ordinal: 2, state: "unanswered" },
          { ordinal: 3, state: "flagged" },
        ]}
        current={2}
        onNavigate={() => {}}
      />,
    ],
    ["AutosaveIndicator", <AutosaveIndicator key="ai" state="saved" lastSavedAt={new Date(0)} />],
    [
      "ChoiceList",
      <ChoiceList key="cl" choices={CHOICES} value={["a"]} onChange={() => {}} />,
    ],
    [
      "OrderingList",
      <OrderingList
        key="ol"
        items={CHOICES}
        value={["a", "b", "c"]}
        onChange={() => {}}
        label={T("Ordena", "Order these")}
      />,
    ],
    [
      "MatchingGrid",
      <MatchingGrid
        key="mg"
        left={[{ id: "l1", html: "km" }]}
        right={[{ id: "r1", html: "1000 m" }]}
        value={[]}
        onChange={() => {}}
        label={T("Une", "Match")}
      />,
    ],
  ];

  for (const [name, node] of cases) {
    it(`${name} no tiene violaciones`, async () => {
      const { container } = wrap(node);
      expect(await axe(container)).toHaveNoViolations();
    });
  }

  it("QuestionCard no tiene violaciones", async () => {
    const { container } = wrap(
      <QuestionCard body={{ stem: "Cuanto es 2 + 2?" }} ordinal={1} total={10} maxPoints={2}>
        <ChoiceList choices={CHOICES} value={[]} onChange={() => {}} />
      </QuestionCard>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Button", () => {
  it("es type=button por defecto, no submit", () => {
    wrap(<Button>Pista</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("se activa con Enter y con Espacio", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    wrap(<Button onClick={onClick}>Comprobar</Button>);
    const button = screen.getByRole("button");
    button.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("marca aria-busy mientras carga", () => {
    wrap(<Button loading>Entregando</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("Input", () => {
  it("asocia la etiqueta, la ayuda y el error", () => {
    wrap(
      <Input
        label={T("Codigo de alumno", "Student code")}
        help={T("Te lo da tu profesor", "Your teacher gives it to you")}
        error={T("Revisa el codigo", "Check the code")}
      />,
    );
    const input = screen.getByLabelText("Codigo de alumno");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Revisa el codigo");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
  });
});

describe("ChoiceList — teclado", () => {
  function Harness({ mode = "single" }: { mode?: "single" | "multi" }): ReactNode {
    const [value, setValue] = useState<readonly string[]>([]);
    return <ChoiceList choices={CHOICES} value={value} onChange={setValue} mode={mode} />;
  }

  it("expone un radiogroup con una sola parada de tabulacion", async () => {
    const user = userEvent.setup();
    wrap(<Harness />);
    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(3);

    await user.tab();
    expect(options[0]).toHaveFocus();
    await user.tab();
    expect(options[1]).not.toHaveFocus();
  });

  it("las flechas mueven la seleccion", async () => {
    const user = userEvent.setup();
    wrap(<Harness />);
    const options = screen.getAllByRole("radio");
    await user.tab();
    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowDown}");
    expect(options[2]).toHaveAttribute("aria-checked", "true");
    // Circular: de la ultima vuelve a la primera.
    await user.keyboard("{ArrowDown}");
    expect(options[0]).toHaveAttribute("aria-checked", "true");
  });

  it("Home y End van a los extremos", async () => {
    const user = userEvent.setup();
    wrap(<Harness />);
    const options = screen.getAllByRole("radio");
    await user.tab();
    await user.keyboard("{End}");
    expect(options[2]).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{Home}");
    expect(options[0]).toHaveAttribute("aria-checked", "true");
  });

  it("Espacio selecciona la opcion enfocada", async () => {
    const user = userEvent.setup();
    wrap(<Harness />);
    const options = screen.getAllByRole("radio");
    await user.tab();
    await user.keyboard(" ");
    expect(options[0]).toHaveAttribute("aria-checked", "true");
  });

  it("en modo multi acumula y quita selecciones", async () => {
    const user = userEvent.setup();
    wrap(<Harness mode="multi" />);
    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[0] as HTMLElement);
    await user.click(boxes[2] as HTMLElement);
    expect(boxes[0]).toHaveAttribute("aria-checked", "true");
    expect(boxes[2]).toHaveAttribute("aria-checked", "true");
    await user.click(boxes[0] as HTMLElement);
    expect(boxes[0]).toHaveAttribute("aria-checked", "false");
  });

  it("sanea el HTML de las opciones", () => {
    const { container } = wrap(
      <ChoiceList
        choices={[{ id: "x", html: '<img src=x onerror="alert(1)">Cuatro' }]}
        value={[]}
        onChange={() => {}}
      />,
    );
    expect(container.innerHTML).not.toContain("onerror");
  });
});

describe("OrderingList — teclado", () => {
  function Harness(): ReactNode {
    const [order, setOrder] = useState<readonly string[]>(["a", "b", "c"]);
    return (
      <OrderingList items={CHOICES} value={order} onChange={setOrder} label={T("Ordena", "Order")} />
    );
  }

  it("se reordena con los botones, sin arrastrar", async () => {
    const user = userEvent.setup();
    wrap(<Harness />);
    const items = screen.getAllByRole("listitem");
    const down = within(items[0] as HTMLElement).getByRole("button", { name: /bajar/i });
    await user.click(down);
    const after = screen.getAllByRole("listitem");
    expect(after[0]).toHaveTextContent("Cinco");
    expect(after[1]).toHaveTextContent("Cuatro");
  });

  it("el primero no puede subir y el ultimo no puede bajar", () => {
    wrap(<Harness />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0] as HTMLElement).getByRole("button", { name: /subir/i })).toBeDisabled();
    expect(within(items[2] as HTMLElement).getByRole("button", { name: /bajar/i })).toBeDisabled();
  });
});

describe("HintPanel", () => {
  function Harness(): ReactNode {
    const [open, setOpen] = useState(false);
    return <HintPanel html="<p>Busca el denominador comun</p>" open={open} onOpenChange={setOpen} />;
  }

  it("cablea aria-expanded y aria-controls", async () => {
    const user = userEvent.setup();
    wrap(<Harness />);
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/denominador comun/i)).toBeVisible();
  });
});

describe("QuestionNavigator", () => {
  it("dice el estado con palabras, no solo con color", () => {
    wrap(
      <QuestionNavigator
        entries={[
          { ordinal: 1, state: "answered" },
          { ordinal: 2, state: "unanswered" },
          { ordinal: 3, state: "flagged" },
        ]}
        current={1}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /1, Respondida/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2, Sin responder/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3, Marcada/i })).toBeInTheDocument();
  });
});

describe("ErrorState — tono", () => {
  it("no ensena codigos tecnicos y dice que no es culpa del alumno", () => {
    wrap(<ErrorState />);
    expect(screen.getByRole("alert")).toHaveTextContent(/no es culpa tuya/i);
    expect(screen.getByRole("alert").textContent ?? "").not.toMatch(/\b(500|404|error \d)/i);
  });

  it("sin conexion no se presenta como fallo", () => {
    wrap(<ErrorState kind="offline" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/guardamos todo/i);
  });
});

describe("AutosaveIndicator — tono", () => {
  it("sin conexion tranquiliza en vez de alarmar", () => {
    wrap(<AutosaveIndicator state="offline" />);
    expect(screen.getAllByText(/seguimos guardando/i).length).toBeGreaterThan(0);
  });
});
