/**
 * @cet/ui — ExamTimer con el reloj del cliente desfasado.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El escenario que hay que blindar (MASTER_PLAN, casos limite): un alumno con el
 * reloj del portatil adelantado media hora, o atrasado, o que lo cambia a mitad
 * del examen para ganar tiempo. La cuenta atras debe seguir siendo la del
 * servidor.
 *
 * Como se prueba: `performance.now` se controla a mano (es el reloj monotono que
 * usa el componente) y `Date` se mueve con `vi.setSystemTime`. Que uno avance y
 * el otro salte es exactamente el caso real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { LocaleProvider } from "../src/lib/i18n.js";
import { ExamTimer, formatRemaining, phaseFor } from "../src/exam/ExamTimer.js";

function renderTimer(node: ReactNode): ReturnType<typeof render> {
  return render(<LocaleProvider locale="es">{node}</LocaleProvider>);
}

describe("formatRemaining", () => {
  it("formatea mm:ss", () => {
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(59)).toBe("00:59");
    expect(formatRemaining(600)).toBe("10:00");
  });

  it("formatea h:mm:ss cuando pasa de una hora", () => {
    expect(formatRemaining(3661)).toBe("1:01:01");
  });

  it("nunca baja de cero", () => {
    expect(formatRemaining(-500)).toBe("00:00");
  });
});

describe("phaseFor", () => {
  it("marca los umbrales", () => {
    expect(phaseFor(1800)).toBe("normal");
    expect(phaseFor(301)).toBe("normal");
    expect(phaseFor(300)).toBe("warn");
    expect(phaseFor(61)).toBe("warn");
    expect(phaseFor(60)).toBe("urgent");
    expect(phaseFor(1)).toBe("urgent");
    expect(phaseFor(0)).toBe("expired");
  });
});

describe("ExamTimer", () => {
  /** Reloj monotono simulado, en milisegundos. */
  let monotonic = 0;

  /** Avanza el tiempo REAL: reloj monotono y temporizadores a la vez. */
  function advanceReal(ms: number): void {
    act(() => {
      monotonic += ms;
      vi.advanceTimersByTime(ms);
    });
  }

  beforeEach(() => {
    monotonic = 1000;
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => monotonic);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const serverNow = "2026-08-26T10:00:00.000Z";
  const deadlineIn30Min = "2026-08-26T10:30:00.000Z";

  it("muestra el tiempo restante que dice el servidor", () => {
    renderTimer(<ExamTimer serverDeadlineAt={deadlineIn30Min} serverNowAt={serverNow} />);
    expect(screen.getByRole("timer")).toHaveTextContent("30:00");
  });

  it("ignora un reloj de cliente ADELANTADO una hora", () => {
    vi.setSystemTime(new Date("2026-08-26T11:00:00.000Z"));
    renderTimer(<ExamTimer serverDeadlineAt={deadlineIn30Min} serverNowAt={serverNow} />);
    expect(screen.getByRole("timer")).toHaveTextContent("30:00");
    expect(screen.getByRole("timer")).toHaveAttribute("data-phase", "normal");
  });

  it("ignora un reloj de cliente ATRASADO un dia", () => {
    vi.setSystemTime(new Date("2026-08-25T10:00:00.000Z"));
    renderTimer(<ExamTimer serverDeadlineAt={deadlineIn30Min} serverNowAt={serverNow} />);
    expect(screen.getByRole("timer")).toHaveTextContent("30:00");
  });

  it("no salta si el alumno cambia la hora del sistema a mitad del examen", () => {
    renderTimer(<ExamTimer serverDeadlineAt={deadlineIn30Min} serverNowAt={serverNow} />);
    expect(screen.getByRole("timer")).toHaveTextContent("30:00");

    // Un minuto real de examen.
    advanceReal(60_000);
    expect(screen.getByRole("timer")).toHaveTextContent("29:00");

    // El alumno retrasa el reloj del sistema 20 minutos y pasa un segundo mas.
    act(() => {
      vi.setSystemTime(new Date("2026-08-26T09:41:00.000Z"));
    });
    advanceReal(1000);

    // Se ha descontado el tiempo transcurrido de verdad, no el del reloj movido.
    expect(screen.getByRole("timer")).toHaveTextContent("28:59");
  });

  it("tampoco gana tiempo adelantando el reloj del sistema", () => {
    renderTimer(<ExamTimer serverDeadlineAt={deadlineIn30Min} serverNowAt={serverNow} />);
    act(() => {
      vi.setSystemTime(new Date("2026-08-26T10:29:00.000Z"));
    });
    advanceReal(1000);
    expect(screen.getByRole("timer")).toHaveTextContent("29:59");
  });

  it("pasa a aviso al bajar de 5 minutos y avisa una sola vez", () => {
    const onWarning = vi.fn();
    renderTimer(
      <ExamTimer
        serverDeadlineAt="2026-08-26T10:05:10.000Z"
        serverNowAt={serverNow}
        onWarning={onWarning}
      />,
    );
    expect(screen.getByRole("timer")).toHaveAttribute("data-phase", "normal");

    advanceReal(11_000);

    expect(screen.getByRole("timer")).toHaveAttribute("data-phase", "warn");
    expect(onWarning).toHaveBeenCalledWith("warn");

    advanceReal(5000);
    expect(onWarning).toHaveBeenCalledTimes(1);
  });

  it("avisa al llegar a cero pero NO cierra el examen por su cuenta", () => {
    const onExpired = vi.fn();
    renderTimer(
      <ExamTimer
        serverDeadlineAt="2026-08-26T10:00:03.000Z"
        serverNowAt={serverNow}
        onExpired={onExpired}
      />,
    );

    advanceReal(4000);

    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
    expect(screen.getByRole("timer")).toHaveAttribute("data-phase", "expired");
    expect(onExpired).toHaveBeenCalledTimes(1);
    // El mensaje es tranquilo y dice que el trabajo esta guardado.
    expect(screen.getAllByText(/guardamos/i).length).toBeGreaterThan(0);
  });

  it("no inventa un tiempo si la referencia del servidor es invalida", () => {
    renderTimer(<ExamTimer serverDeadlineAt="no-es-una-fecha" serverNowAt={serverNow} />);
    expect(screen.getByRole("timer")).toHaveTextContent(/sincroniz/i);
  });

  it("se resincroniza cuando el servidor manda una referencia nueva", () => {
    const { rerender } = renderTimer(
      <ExamTimer serverDeadlineAt={deadlineIn30Min} serverNowAt={serverNow} />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent("30:00");

    act(() => {
      rerender(
        <LocaleProvider locale="es">
          <ExamTimer serverDeadlineAt={deadlineIn30Min} serverNowAt="2026-08-26T10:20:00.000Z" />
        </LocaleProvider>,
      );
    });

    expect(screen.getByRole("timer")).toHaveTextContent("10:00");
  });

  it("no anuncia el valor cada segundo", () => {
    renderTimer(<ExamTimer serverDeadlineAt={deadlineIn30Min} serverNowAt={serverNow} />);
    expect(screen.getByRole("timer")).toHaveAttribute("aria-live", "off");
  });
});
