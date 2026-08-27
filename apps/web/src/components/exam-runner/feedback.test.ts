/**
 * Con `feedbackMode: "never"` no se enseña ni una solución.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Este fichero vigila el requisito de AD-5 que más fácil es romper por
 * descuido: la clave de respuesta no llega al alumno.
 */
import { describe, expect, it } from "vitest";
import type { AttemptStatus, FeedbackMode } from "@cet/shared";

import { reviewItemsFor, shouldShowReview, shouldShowScore } from "./feedback";

const ALL_STATUSES: readonly AttemptStatus[] = [
  "in_progress",
  "submitted",
  "grading",
  "graded",
  "abandoned",
  "voided",
];

describe('feedbackMode: "never"', () => {
  it("no muestra revisión en NINGÚN estado del intento", () => {
    for (const status of ALL_STATUSES) {
      expect(shouldShowReview("never", status)).toBe(false);
    }
  });

  it("filtra los items aunque el servidor los mande por error", () => {
    // Defensa en profundidad: la barrera de verdad está en el servidor, pero un
    // despiste suyo no puede convertirse en una fuga de respuestas correctas.
    const items = [{ correctAnswer: "7/4" }, { correctAnswer: "1.75" }];
    expect(reviewItemsFor("never", "graded", items)).toEqual([]);
  });

  it("sí muestra la nota: `feedback_mode` gobierna las soluciones, no la nota", () => {
    expect(shouldShowScore("graded")).toBe(true);
  });
});

describe('feedbackMode: "after_submit" e "immediate"', () => {
  const modes: readonly FeedbackMode[] = ["after_submit", "immediate"];

  it("solo enseña la revisión con el intento ya corregido", () => {
    for (const mode of modes) {
      expect(shouldShowReview(mode, "graded")).toBe(true);
      // `submitted` y `grading` todavía no tienen nota: enseñar media
      // corrección es peor que no enseñar ninguna.
      expect(shouldShowReview(mode, "submitted")).toBe(false);
      expect(shouldShowReview(mode, "grading")).toBe(false);
      expect(shouldShowReview(mode, "in_progress")).toBe(false);
    }
  });

  it("deja pasar los items solo cuando corresponde", () => {
    const items = [{ correctAnswer: "7/4" }];
    expect(reviewItemsFor("after_submit", "graded", items)).toEqual(items);
    expect(reviewItemsFor("after_submit", "grading", items)).toEqual([]);
  });

  it("un `items` nulo no rompe nada", () => {
    expect(reviewItemsFor("immediate", "graded", null)).toEqual([]);
  });
});

describe("modo desconocido", () => {
  it("un valor no reconocido se comporta como `never` en la normalización", async () => {
    const { normalizeFeedbackMode } = await import("./normalize");
    expect(normalizeFeedbackMode("todo_visible")).toBe("never");
    expect(normalizeFeedbackMode(undefined)).toBe("never");
    expect(normalizeFeedbackMode(null)).toBe("never");
  });
});
