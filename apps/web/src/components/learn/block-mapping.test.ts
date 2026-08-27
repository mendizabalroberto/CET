/**
 * Mapeo `block_kind` -> componente, y la frontera de saneado (contrato C5).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";
import { blockKind } from "@cet/shared";

import { mapLessonBlock, mapLessonBlocks, type LessonBlockRow } from "./block-mapping";

const MEDIA = {
  src: "https://example.test/pic.png",
  alt: { en: "A pie chart", es: "Un diagrama de sectores" },
  captionsSrc: "https://example.test/pic.vtt",
};

/** Una fila válida por cada uno de los once `block_kind` del enum. */
const FIXTURES: Record<string, LessonBlockRow> = {
  rule: { id: "b1", ord: 1, kind: "rule", content: { html: { en: "Divide by the HCF." } } },
  example: { id: "b2", ord: 2, kind: "example", content: { html: { en: "6/8 = 3/4" } } },
  tip: { id: "b3", ord: 3, kind: "tip", content: { html: { en: "Halve twice." } } },
  warning: { id: "b4", ord: 4, kind: "warning", content: { html: { en: "Not 2/4." } } },
  steps: {
    id: "b5",
    ord: 5,
    kind: "steps",
    content: { steps: [{ en: "Find the HCF." }, { en: "Divide both." }] },
  },
  table: {
    id: "b6",
    ord: 6,
    kind: "table",
    content: {
      caption: { en: "Metric units" },
      headers: [{ en: "Unit" }, { en: "Metres" }],
      rows: [[{ en: "km" }, { en: "1000" }]],
    },
  },
  text: { id: "b7", ord: 7, kind: "text", content: { html: { en: "A fraction is a part." } } },
  image: { id: "b8", ord: 8, kind: "image", content: {}, media: MEDIA },
  video: { id: "b9", ord: 9, kind: "video", content: {}, media: MEDIA },
  interactive: {
    id: "b10",
    ord: 10,
    kind: "interactive",
    content: {
      component: "svg-figure",
      props: { svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>', alt: { en: "A square" } },
    },
  },
  formula: { id: "b11", ord: 11, kind: "formula", content: { html: { en: "A = w &times; h" } } },
};

describe("mapLessonBlock — cobertura del enum", () => {
  it("cubre los once miembros de block_kind sin dejar ninguno fuera", () => {
    // Si mañana se añade un miembro al enum y nadie escribe su fixture, este
    // test falla: es la única forma de que un `kind` nuevo no aparezca como un
    // hueco en blanco en mitad de una leccion.
    expect(Object.keys(FIXTURES).sort()).toEqual([...blockKind.options].sort());
  });

  for (const kind of blockKind.options) {
    it(`mapea kind="${kind}" a un contenido renderizable`, () => {
      const row = FIXTURES[kind];
      expect(row).toBeDefined();
      const mapped = mapLessonBlock(row as LessonBlockRow, "en");
      expect(mapped).not.toBeNull();
      expect(mapped?.kind).toBe(kind);
      expect(mapped?.content.kind).toBe(kind);
    });
  }

  it("descarta un kind que no existe en vez de reventar", () => {
    expect(
      mapLessonBlock({ id: "x", ord: 1, kind: "podcast", content: { html: { en: "hi" } } }, "en"),
    ).toBeNull();
  });

  it("descarta una imagen sin media: sin alt_text no hay accesibilidad", () => {
    expect(mapLessonBlock({ id: "x", ord: 1, kind: "image", content: {} }, "en")).toBeNull();
  });

  it("descarta un video sin subtitulos", () => {
    const row: LessonBlockRow = {
      id: "x",
      ord: 1,
      kind: "video",
      content: {},
      media: { src: MEDIA.src, alt: MEDIA.alt },
    };
    expect(mapLessonBlock(row, "en")).toBeNull();
  });

  it("respeta el idioma del alumno", () => {
    const row: LessonBlockRow = {
      id: "x",
      ord: 1,
      kind: "rule",
      content: { html: { en: "Divide", es: "Divide entre el MCD" } },
    };
    const mapped = mapLessonBlock(row, "es");
    expect(mapped?.content).toMatchObject({ html: "Divide entre el MCD" });
  });

  it("ordena por ord y omite lo irrenderizable sin romper el resto", () => {
    const blocks = mapLessonBlocks(
      [
        FIXTURES.formula as LessonBlockRow,
        { id: "bad", ord: 2, kind: "image", content: {} },
        FIXTURES.rule as LessonBlockRow,
      ],
      "en",
    );
    expect(blocks.map((b) => b.id)).toEqual(["b1", "b11"]);
  });
});

describe("mapLessonBlock — contrato C5: todo HTML de la DB se sanea", () => {
  const MALICIOUS =
    '<img src=x onerror="alert(1)"><script>fetch("/api/steal")</script><b>real content</b>' +
    '<a href="javascript:alert(2)">tap</a>';

  it("quita script, manejadores de eventos y URLs javascript: de un bloque de prosa", () => {
    const mapped = mapLessonBlock(
      { id: "x", ord: 1, kind: "rule", content: { html: { en: MALICIOUS } } },
      "en",
    );
    const html = (mapped?.content as unknown as { html: string }).html;

    expect(html).toContain("real content");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("sanea tambien los pasos y las celdas de tabla, no solo el html principal", () => {
    const steps = mapLessonBlock(
      { id: "x", ord: 1, kind: "steps", content: { steps: [{ en: MALICIOUS }] } },
      "en",
    );
    const stepHtml = (steps?.content as unknown as { steps: readonly string[] }).steps[0] ?? "";
    expect(stepHtml).not.toContain("<script");
    expect(stepHtml).not.toContain("onerror");

    const table = mapLessonBlock(
      {
        id: "y",
        ord: 1,
        kind: "table",
        content: { headers: [{ en: "H" }], rows: [[{ en: MALICIOUS }]] },
      },
      "en",
    );
    const cell =
      (table?.content as unknown as { rows: { cells: readonly string[] }[] }).rows[0]?.cells[0] ?? "";
    expect(cell).toContain("real content");
    expect(cell).not.toContain("<script");
  });

  it("sanea el SVG de un bloque interactivo", () => {
    const mapped = mapLessonBlock(
      {
        id: "x",
        ord: 1,
        kind: "interactive",
        content: {
          component: "svg-figure",
          props: {
            svg: '<svg onload="alert(1)"><script>alert(2)</script><rect width="4" height="4" /></svg>',
            alt: { en: "A square" },
          },
        },
      },
      "en",
    );
    const svg = (mapped?.content as unknown as { svg: string }).svg;
    expect(svg).not.toContain("onload");
    expect(svg).not.toContain("<script");
    expect(svg).toContain("rect");
  });

  it("descarta un bloque cuyo html es SOLO marcado malicioso", () => {
    expect(
      mapLessonBlock(
        { id: "x", ord: 1, kind: "tip", content: { html: { en: "<script>alert(1)</script>" } } },
        "en",
      ),
    ).toBeNull();
  });
});
