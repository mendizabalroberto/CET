/**
 * @cet/ui — INVARIANTE DE FAMILIA: ningun mapa de estados se distingue solo por color.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `ChoiceList.REVIEW_STYLES` mapeaba `correct`/`incorrect`/`missed` a tres pares
 * de color y a nada mas. Bajo deuteranopia las tres filas eran identicas. Ese
 * fallo tiene hermanos: cualquier `const X: Record<Estado, string>` de clases
 * cuyos valores solo difieran en el token de color es el mismo fallo con otro
 * nombre, y ninguna revision de codigo lo ve, porque el mapa *parece* correcto.
 *
 * Este test no comprueba `ChoiceList`. Comprueba la FAMILIA:
 *
 *  1. Lee `src/**\/*.tsx` y localiza todos los mapas de clases por estado.
 *  2. Quita de cada valor las clases de color (`algo-[var(--cet-*)]`). Si a dos
 *     estados les queda el MISMO resto, esos dos estados se distinguen unicamente
 *     por color y el mapa entra en la lista de sospechosos.
 *  3. Todo sospechoso tiene que estar declarado abajo con su canal no cromatico,
 *     y ese canal se DEMUESTRA renderizando: se pintan los estados y se exige
 *     que su firma no cromatica (texto accesible + geometria de los glifos) sea
 *     distinta. Un mapa nuevo sin declarar hace fallar este test.
 *
 * Por que la declaracion no es una lista de excepciones: la unica salida sin
 * render es `decorativo`, que obliga a escribir por que ese color no informa de
 * nada. Un mapa que informa no puede colarse en silencio.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { LocaleProvider } from "../src/lib/i18n.js";
import { ChoiceList } from "../src/exam/ChoiceList.js";
import { QuestionNavigator } from "../src/exam/QuestionNavigator.js";
import { AutosaveIndicator } from "../src/exam/AutosaveIndicator.js";
import { ExamTimer } from "../src/exam/ExamTimer.js";
import { Alert } from "../src/primitives/Alert.js";
import { CalloutBox } from "../src/learning/CalloutBox.js";
import { MasteryMeter } from "../src/data/MasteryMeter.js";

/** `vitest.config.ts` vive en la raiz del paquete, asi que cwd es `packages/ui`. */
const SRC = join(process.cwd(), "src");

/* ------------------------------------------------------------------ *
 * 1 y 2. El escaner
 * ------------------------------------------------------------------ */

/** Una clase que pinta color: `bg-[var(--cet-ok-bg)]`, `text-[var(--cet-ink)]`. */
const CLASE_DE_COLOR = /^[a-z-]+-\[var\(--[a-z0-9-]+\)\]$/;

interface MapaSospechoso {
  readonly fichero: string;
  readonly nombre: string;
  /** Pares de estados que comparten resto no cromatico. */
  readonly paresIndistinguibles: readonly (readonly [string, string])[];
}

function ficherosTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules") continue;
      out.push(...ficherosTsx(p));
    } else if (entrada.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
  return out;
}

/** Cuerpo `{...}` que empieza en `desde` (indice de la llave), con anidamiento. */
function cuerpoDelObjeto(texto: string, desde: number): string | null {
  let nivel = 0;
  for (let i = desde; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === "{") nivel += 1;
    else if (c === "}") {
      nivel -= 1;
      if (nivel === 0) return texto.slice(desde + 1, i);
    }
  }
  return null;
}

/** Resto de un valor tras quitarle el color. Es lo que percibe quien no lo ve. */
function restoNoCromatico(valor: string): string {
  return valor
    .split(/\s+/)
    .filter((c) => c.length > 0 && !CLASE_DE_COLOR.test(c))
    .sort()
    .join(" ");
}

function escanear(): MapaSospechoso[] {
  const sospechosos: MapaSospechoso[] = [];

  for (const fichero of ficherosTsx(SRC)) {
    const texto = readFileSync(fichero, "utf8");
    const decl = /^const ([A-Z][A-Z0-9_]*)\b[^=\n]*=\s*\{/gm;
    let m: RegExpExecArray | null;

    while ((m = decl.exec(texto)) !== null) {
      const nombre = m[1] as string;
      const cuerpo = cuerpoDelObjeto(texto, texto.indexOf("{", m.index));
      if (cuerpo === null) continue;

      // Solo interesan los mapas cuyos valores son, TODOS, cadenas de clases.
      const entradas = [...cuerpo.matchAll(/^\s{2}([A-Za-z_][\w]*):\s*(?:\r?\n\s+)?"([^"]*)",?$/gm)];
      const claves = [...cuerpo.matchAll(/^\s{2}([A-Za-z_][\w]*):/gm)];
      if (entradas.length < 2 || entradas.length !== claves.length) continue;

      const valores = entradas.map((e) => [e[1] as string, e[2] as string] as const);
      // Un mapa de clases lleva al menos un token de color; si no lo lleva no
      // puede estar comunicando nada con color y no es asunto de este test.
      if (!valores.some(([, v]) => v.split(/\s+/).some((c) => CLASE_DE_COLOR.test(c)))) continue;

      const pares: Array<readonly [string, string]> = [];
      for (let i = 0; i < valores.length; i += 1) {
        for (let j = i + 1; j < valores.length; j += 1) {
          const a = valores[i] as readonly [string, string];
          const b = valores[j] as readonly [string, string];
          if (restoNoCromatico(a[1]) === restoNoCromatico(b[1])) pares.push([a[0], b[0]]);
        }
      }
      if (pares.length > 0) {
        sospechosos.push({
          fichero: relative(SRC, fichero).replace(/\\/g, "/"),
          nombre,
          paresIndistinguibles: pares,
        });
      }
    }
  }
  return sospechosos;
}

/* ------------------------------------------------------------------ *
 * 3. La declaracion de canales, y su demostracion
 * ------------------------------------------------------------------ */

type Canal =
  /** Se demuestra pintando cada estado: las firmas no cromaticas deben diferir. */
  | { readonly tipo: "render"; readonly estados: Readonly<Record<string, ReactNode>> }
  /** El color no informa de nada: es adorno sobre un texto que ya lo dice todo. */
  | { readonly tipo: "decorativo"; readonly razon: string };

const AHORA = new Date("2026-05-04T10:00:00.000Z");
const dentroDe = (segundos: number): Date => new Date(AHORA.getTime() + segundos * 1000);
const T = (es: string, en: string): { es: string; en: string } => ({ es, en });
const OPCION = [{ id: "a", html: "Cuatro" }];

/**
 * Clave: `fichero#NOMBRE_DEL_MAPA`. Anadir una entrada aqui es una decision
 * consciente, y por eso el test obliga a tomarla.
 */
const CANALES: Readonly<Record<string, Canal>> = {
  "exam/ChoiceList.tsx#REVIEW_STYLES": {
    tipo: "render",
    estados: {
      correct: <ChoiceList choices={OPCION} value={[]} onChange={() => {}} review={{ a: "correct" }} disabled />,
      incorrect: <ChoiceList choices={OPCION} value={["a"]} onChange={() => {}} review={{ a: "incorrect" }} disabled />,
      missed: <ChoiceList choices={OPCION} value={[]} onChange={() => {}} review={{ a: "missed" }} disabled />,
    },
  },
  "exam/ChoiceList.tsx#REVIEW_INK": {
    tipo: "decorativo",
    razon: "Es la tinta del glifo de REVIEW_STYLES, no un mapa de estados aparte: el estado ya lo llevan la forma y el texto.",
  },
  "exam/QuestionNavigator.tsx#STATE_STYLES": {
    tipo: "render",
    estados: {
      answered: <QuestionNavigator entries={[{ ordinal: 1, state: "answered" }]} current={2} onNavigate={() => {}} />,
      unanswered: <QuestionNavigator entries={[{ ordinal: 1, state: "unanswered" }]} current={2} onNavigate={() => {}} />,
      flagged: <QuestionNavigator entries={[{ ordinal: 1, state: "flagged" }]} current={2} onNavigate={() => {}} />,
    },
  },
  "exam/AutosaveIndicator.tsx#STATE_STYLES": {
    tipo: "render",
    estados: {
      idle: <AutosaveIndicator state="idle" />,
      saving: <AutosaveIndicator state="saving" />,
      saved: <AutosaveIndicator state="saved" />,
      offline: <AutosaveIndicator state="offline" />,
      retrying: <AutosaveIndicator state="retrying" />,
    },
  },
  "exam/ExamTimer.tsx#PHASE_STYLES": {
    tipo: "render",
    estados: {
      normal: <ExamTimer serverNowAt={AHORA} serverDeadlineAt={dentroDe(1800)} />,
      warn: <ExamTimer serverNowAt={AHORA} serverDeadlineAt={dentroDe(200)} />,
      urgent: <ExamTimer serverNowAt={AHORA} serverDeadlineAt={dentroDe(30)} />,
      expired: <ExamTimer serverNowAt={AHORA} serverDeadlineAt={AHORA} />,
    },
  },
  "primitives/Alert.tsx#TONES": {
    tipo: "render",
    estados: {
      info: <Alert tone="info" toneLabel={T("Informacion", "Info")} title={T("Ojo", "Careful")} />,
      success: <Alert tone="success" toneLabel={T("Hecho", "Done")} title={T("Ojo", "Careful")} />,
      warning: <Alert tone="warning" toneLabel={T("Aviso", "Warning")} title={T("Ojo", "Careful")} />,
      danger: <Alert tone="danger" toneLabel={T("Problema", "Problem")} title={T("Ojo", "Careful")} />,
    },
  },
  "learning/CalloutBox.tsx#TONE_STYLES": {
    tipo: "render",
    estados: {
      rule: <CalloutBox tone="rule" label={T("Regla", "Rule")} html="<p>x</p>" />,
      tip: <CalloutBox tone="tip" label={T("Truco", "Tip")} html="<p>x</p>" />,
      warning: <CalloutBox tone="warning" label={T("Cuidado con esto", "Watch out")} html="<p>x</p>" />,
    },
  },
  "data/MasteryMeter.tsx#LEVEL_FILL": {
    tipo: "render",
    estados: {
      // Misma destreza en los cuatro: la diferencia tiene que venir del nivel,
      // no de la etiqueta que le pasa quien llama.
      starting: <MasteryMeter mastery={0.1} skillLabel={T("Fracciones", "Fractions")} />,
      learning: <MasteryMeter mastery={0.4} skillLabel={T("Fracciones", "Fractions")} />,
      solid: <MasteryMeter mastery={0.7} skillLabel={T("Fracciones", "Fractions")} />,
      mastered: <MasteryMeter mastery={0.95} skillLabel={T("Fracciones", "Fractions")} />,
    },
  },
  "primitives/Badge.tsx#TONES": {
    tipo: "decorativo",
    razon: "El texto del badge es el que informa; el tono acompana a una palabra que ya esta escrita y no anade estado propio.",
  },
  "primitives/Button.tsx#VARIANTS": {
    tipo: "decorativo",
    razon:
      "`accent` y `danger` solo se diferencian en el color, pero la variante de un boton es enfasis, no estado: " +
      "lo que la accion hace lo dice siempre su etiqueta, que es obligatoria y esta traducida. " +
      "Si algun dia una variante pasa a significar algo por si misma, esta entrada tiene que cambiar a \"render\".",
  },
  "primitives/Toast.tsx#TONES": {
    tipo: "decorativo",
    razon: "El aviso lleva siempre titulo y, si procede, accion. El borde de color acompana a un texto obligatorio.",
  },
  "reports/KpiTile.tsx#TINTA_DE_TENDENCIA": {
    tipo: "decorativo",
    razon:
      "El color solo reeforza: `trend.text` ya llega de la aplicacion con la flecha y el signo distintos por estado " +
      "(▲/▼/=), y `trend.srText` da ademas la frase completa para quien no ve ninguno de los dos. El mapa " +
      "de tinta nunca es el unico canal que dice si la cifra mejoro, empeoro o siguio igual.",
  },
};

/**
 * Lo que percibe quien no distingue colores: texto accesible mas geometria de
 * los glifos. NO incluye `class`: una clase de color es justo lo que no cuenta.
 */
function firmaNoCromatica(el: HTMLElement): string {
  const formas = Array.from(el.querySelectorAll("path,circle,polygon,rect,line"))
    .map((n) => `${n.tagName}:${n.getAttribute("d") ?? ""}:${n.getAttribute("points") ?? ""}`)
    .join("|");
  const etiquetas = Array.from(el.querySelectorAll("[aria-label]"))
    .map((n) => n.getAttribute("aria-label"))
    .join("|");
  return `${(el.textContent ?? "").trim()}##${etiquetas}##${formas}`;
}

describe("invariante — ningun mapa de estados distingue solo por color", () => {
  const sospechosos = escanear();

  it("el escaner encuentra mapas de estados (si no, no esta probando nada)", () => {
    expect(sospechosos.length).toBeGreaterThan(0);
  });

  it("todo mapa de color-solo tiene declarado su canal no cromatico", () => {
    const sinDeclarar = sospechosos
      .map((s) => `${s.fichero}#${s.nombre}`)
      .filter((clave) => !(clave in CANALES));

    expect(
      sinDeclarar,
      `Estos mapas distinguen dos o mas estados unicamente por el token de color.\n` +
        `Anade a CANALES (en este fichero) o bien un canal "render" que demuestre\n` +
        `que los estados se distinguen sin color, o bien "decorativo" con la razon\n` +
        `por la que ese color no informa de nada:\n  ${sinDeclarar.join("\n  ")}`,
    ).toEqual([]);
  });

  it("no sobra ninguna declaracion (un canal declarado de mas oculta el escaner)", () => {
    const encontrados = new Set(sospechosos.map((s) => `${s.fichero}#${s.nombre}`));
    expect(Object.keys(CANALES).filter((c) => !encontrados.has(c))).toEqual([]);
  });

  describe.each(
    Object.entries(CANALES)
      .filter((e): e is [string, Extract<Canal, { tipo: "render" }>] => e[1].tipo === "render")
      .map(([clave, canal]) => ({ clave, canal })),
  )("$clave", ({ canal }) => {
    it("cada estado se distingue de los demas sin mirar el color", () => {
      const firmas = new Map<string, string>();
      for (const [estado, nodo] of Object.entries(canal.estados)) {
        const { container, unmount } = render(<LocaleProvider locale="es">{nodo}</LocaleProvider>);
        firmas.set(estado, firmaNoCromatica(container));
        unmount();
      }
      const distintas = new Set(firmas.values());
      expect(distintas.size, `Estados con firma no cromatica repetida: ${JSON.stringify([...firmas])}`).toBe(
        firmas.size,
      );
    });
  });
});
