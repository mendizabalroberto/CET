/**
 * math.shape — GEN.shape de Y6A. Area y perimetro de una figura compuesta (forma de L).
 *
 * Cambios respecto del original:
 *   - La figura va en `renderedBody.figureSvg`, no incrustada en el enunciado con
 *     <div style="...">. El contrato tiene un campo para eso y la allowlist del
 *     stem no admite estilos inline.
 *   - El poligono se dibuja en COORDENADAS DEL MODELO dentro de un <g scale>, asi
 *     que la figura persistida es verificable: aplicar el area de Gauss a los
 *     puntos devuelve el area real. Los tests lo usan como comprobacion independiente.
 *   - `figureAlt` es obligatorio (lector de pantalla).
 *   - Las cotas van sobre su propia tarjeta opaca (`svgLabel` de `@cet/shared`),
 *     y el grosor del trazo se divide por la escala en vez de confiar en
 *     `vector-effect`. Las dos cosas salen de `obs/obs002.png`; el porque
 *     completo esta en la cabecera de `packages/shared/src/svg-label.ts`.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { z } from "zod";
import {
  svgLabel,
  svgLabelWidth,
  type LabelAnchor,
  type QuestionGenerator,
  type Seed,
} from "@cet/shared";
import { createRng, type Rng } from "../../rng.js";
import { nf } from "../../format.js";
import { baseParams, buildItem, resolveLocale, pickLocale } from "../common.js";

export const SHAPE_TARGETS = ["area", "perimeter", "either"] as const;

export const shapeParams = baseParams.extend({
  target: z.enum(SHAPE_TARGETS).optional(),
});
export type ShapeParams = z.infer<typeof shapeParams>;

export interface LShape {
  readonly w: number;
  readonly h: number;
  readonly cutW: number;
  readonly cutH: number;
  readonly unit: string;
  readonly area: number;
  readonly perimeter: number;
}

const PAD = 56;

function makeShape(rng: Rng): LShape {
  const w = rng.int(8, 16);
  const h = rng.int(6, 12);
  const cutW = rng.int(3, w - 4);
  const cutH = rng.int(2, h - 3);
  const unit = rng.weighted([
    { value: "cm", weight: 2 },
    { value: "mm", weight: 1 },
    { value: "m", weight: 1 },
  ]);
  return {
    w,
    h,
    cutW,
    cutH,
    unit,
    area: w * h - cutW * cutH,
    // Para un corte en esquina el perimetro coincide con el del rectangulo grande.
    perimeter: 2 * (w + h),
  };
}

/** Puntos del contorno, en unidades del modelo, recorridos en sentido horario. */
export function shapeOutline(shape: LShape): readonly (readonly [number, number])[] {
  const { w, h, cutW, cutH } = shape;
  return [
    [0, 0],
    [w, 0],
    [w, h],
    [cutW, h],
    [cutW, h - cutH],
    [0, h - cutH],
  ];
}

/** Grosor del contorno EN PIXELES de pantalla, no en unidades del modelo. */
const STROKE_PX = 2.2;

function renderSvg(shape: LShape, hidden: ReadonlySet<string>): string {
  const { w, h, cutW, cutH, unit } = shape;
  const s = Math.min(26, Math.floor(360 / Math.max(w, h)));
  const points = shapeOutline(shape)
    .map(([x, y]) => `${x},${y}`)
    .join(" ");

  const texto = (key: string, value: number): string =>
    hidden.has(key) ? "?" : `${value} ${unit}`;

  // El margen lateral se CALCULA a partir de las cotas que van a los lados, no
  // se fija a ojo. Con un margen constante, "12 cm" en el lado derecho se salia
  // dos pixeles del `viewBox` y el navegador le cortaba el filo a la tarjeta:
  // un SVG en linea recorta a su vista por defecto. Preguntarle su ancho a la
  // misma funcion que las dibuja es lo unico que no se desincroniza.
  const padX = Math.max(
    PAD,
    Math.ceil(
      0.3 * s + Math.max(svgLabelWidth(texto("right", h)), svgLabelWidth(texto("left", h - cutH))) + 4,
    ),
  );
  const width = w * s + 2 * padX;
  const height = h * s + 2 * PAD + 8;

  // Las cotas van con `svgLabel`, es decir CADA UNA SOBRE SU PROPIA TARJETA
  // OPACA. Antes eran `<text>` pelados sin `fill`: heredaban el negro del
  // navegador y quedaban sobre el dibujo, que es el fallo de `obs/obs002.png`.
  // Ahora el contraste no depende de por donde pase la cota.
  const label = (x: number, y: number, key: string, value: number, anchor: LabelAnchor): string =>
    svgLabel({
      x: x * s + padX,
      y: y * s + PAD,
      text: texto(key, value),
      anchor,
      tone: hidden.has(key) ? "unknown" : "neutral",
    });

  const labels =
    label(w / 2, -0.45, "top", w, "middle") +
    label(w + 0.3, h / 2, "right", h, "start") +
    label((cutW + w) / 2, h + 0.95, "bottom", w - cutW, "middle") +
    label(cutW - 0.3, h - cutH / 2, "innerV", cutH, "end") +
    label(cutW / 2, h - cutH - 0.4, "innerH", cutW, "middle") +
    label(-0.3, (h - cutH) / 2, "left", h - cutH, "end");

  return (
    `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">` +
    `<g transform="translate(${padX} ${PAD}) scale(${s})">` +
    // El poligono se dibuja en unidades del modelo dentro de un `scale(s)`, asi
    // que el `scale` multiplica TAMBIEN el grosor del trazo. La version
    // anterior lo compensaba con `vector-effect="non-scaling-stroke"`, y ese
    // atributo no estaba en la allowlist de `@cet/ui`: al pintar se caia, el
    // trazo de 2,2 se volvia de 2,2 x 26 = 57 px y la figura se convertia en un
    // marco azul marino que se tragaba las cotas (`obs/obs002.png`).
    //
    // Dividir aqui por la escala da el mismo grosor en pantalla SIN depender de
    // ningun atributo que un sanitizador pueda quitar. Un dibujo no debe
    // apoyarse en que dos allowlists de dos paquetes sigan de acuerdo.
    `<polygon points="${points}" fill="#eef4fb" stroke="#173a63" stroke-width="${
      Math.round((STROKE_PX / s) * 1000) / 1000
    }"/>` +
    `</g>` +
    `<g>${labels}</g>` +
    `</svg>`
  );
}

export const shapeGenerator: QuestionGenerator<ShapeParams> = {
  key: "math.shape",
  paramsSchema: shapeParams,
  skillCode: "math.geometry.compound_shapes",
  format: "numeric",

  generate(params: ShapeParams, seedValue: Seed) {
    const rng = createRng(seedValue);
    const loc = resolveLocale(params);

    const shape = makeShape(rng);
    const requested = params.target ?? "either";
    const target = requested === "either" ? (rng.chance(0.5) ? "area" : "perimeter") : requested;
    const value = target === "area" ? shape.area : shape.perimeter;
    const unit = target === "area" ? `${shape.unit}²` : shape.unit;
    const hidden = new Set(["innerH", "left"]);

    const wantEn = target === "area" ? "area" : "perimeter";
    const wantEs = target === "area" ? "el área" : "el perímetro";

    return buildItem({
      key: "math.shape",
      params,
      seed: seedValue,
      format: "numeric",
      skillCode: "math.geometry.compound_shapes",
      difficulty: params.difficulty ?? 4,
      maxPoints: params.maxPoints ?? 1,
      body: {
        stem: pickLocale({
            en: `Find the <b>${wantEn}</b> of this shape. The two sides marked ? are for you to work out.`,
            es: `Calcula <b>${wantEs}</b> de esta figura. Los dos lados marcados con ? los tienes que deducir.`,
          },
          loc,
        ),
        figureSvg: renderSvg(shape, hidden),
        figureAlt: {
          // OJO: el texto alternativo describe EXACTAMENTE lo que se ve, ni un
          // dato mas. Si aqui se contase cuanto mide la esquina recortada, el
          // alumno que usa lector de pantalla recibiria resuelto justo el paso
          // que los demas tienen que deducir. Accesibilidad no es dar ventaja.
          en:
            `L-shaped figure with six sides. Going clockwise from the top left corner: ` +
            `top side ${shape.w} ${shape.unit}, right side ${shape.h} ${shape.unit}, ` +
            `bottom side ${shape.w - shape.cutW} ${shape.unit}, then a step up of ` +
            `${shape.cutH} ${shape.unit}, then an unlabelled horizontal side marked with a ` +
            `question mark, and finally an unlabelled left side marked with a question mark.`,
          es:
            `Figura en forma de L con seis lados. En el sentido de las agujas del reloj desde ` +
            `la esquina superior izquierda: lado superior ${shape.w} ${shape.unit}, lado derecho ` +
            `${shape.h} ${shape.unit}, lado inferior ${shape.w - shape.cutW} ${shape.unit}, ` +
            `un escalón hacia arriba de ${shape.cutH} ${shape.unit}, después un lado horizontal ` +
            `sin rotular marcado con un signo de interrogación y, por último, un lado izquierdo ` +
            `sin rotular marcado con un signo de interrogación.`,
        },
        unit,
        placeholder: pickLocale({ en: "number only", es: "solo el número" }, loc),
      },
      answerKey: {
        type: "numeric",
        value,
        tolerance: 0,
        canonical: `${nf(value, loc)} ${unit}`,
      },
      hint: {
        en:
          target === "area"
            ? `Big rectangle ${shape.w} × ${shape.h}, then subtract the cut-out corner.`
            : `Missing sides: ${shape.w} − ${shape.w - shape.cutW} = ${shape.cutW} and ` +
              `${shape.h} − ${shape.cutH} = ${shape.h - shape.cutH}. Now add all six.`,
        es:
          target === "area"
            ? `Rectángulo grande ${shape.w} × ${shape.h} y después resta la esquina que falta.`
            : `Lados que faltan: ${shape.w} − ${shape.w - shape.cutW} = ${shape.cutW} y ` +
              `${shape.h} − ${shape.cutH} = ${shape.h - shape.cutH}. Ahora suma los seis.`,
      },
      solution: {
        en:
          target === "area"
            ? `Missing sides: ${shape.cutW} ${shape.unit} and ${shape.h - shape.cutH} ${shape.unit}<br>` +
              `${shape.w} × ${shape.h} = ${shape.w * shape.h}; cut-out ${shape.cutW} × ${shape.cutH} = ` +
              `${shape.cutW * shape.cutH}<br>${shape.w * shape.h} − ${shape.cutW * shape.cutH} = ` +
              `<b>${shape.area} ${shape.unit}²</b>`
            : `Missing sides: ${shape.cutW} ${shape.unit} and ${shape.h - shape.cutH} ${shape.unit}<br>` +
              `P = ${shape.w} + ${shape.h} + ${shape.w - shape.cutW} + ${shape.cutH} + ${shape.cutW} + ` +
              `${shape.h - shape.cutH} = <b>${shape.perimeter} ${shape.unit}</b>`,
        es:
          target === "area"
            ? `Lados que faltan: ${shape.cutW} ${shape.unit} y ${shape.h - shape.cutH} ${shape.unit}<br>` +
              `${shape.w} × ${shape.h} = ${shape.w * shape.h}; esquina ${shape.cutW} × ${shape.cutH} = ` +
              `${shape.cutW * shape.cutH}<br>${shape.w * shape.h} − ${shape.cutW * shape.cutH} = ` +
              `<b>${shape.area} ${shape.unit}²</b>`
            : `Lados que faltan: ${shape.cutW} ${shape.unit} y ${shape.h - shape.cutH} ${shape.unit}<br>` +
              `P = ${shape.w} + ${shape.h} + ${shape.w - shape.cutW} + ${shape.cutH} + ${shape.cutW} + ` +
              `${shape.h - shape.cutH} = <b>${shape.perimeter} ${shape.unit}</b>`,
      },
    });
  },
};
