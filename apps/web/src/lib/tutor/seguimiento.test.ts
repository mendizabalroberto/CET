/**
 * EL SEGUIMIENTO NO INVENTA CIFRAS NI PINTA HUECOS.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FAMILIA DE FALLOS CIERRA ESTE FICHERO
 * ===========================================================================
 * Un informe se rompe en silencio de dos maneras, y las dos se ven bien en
 * pantalla:
 *
 *   1. UN CERO QUE NO ES UN CERO. `informe_alumno_resumen` devuelve
 *      `porcentaje_acierto = 0` cuando no hubo NI UNA pregunta. Pintado, dice
 *      «0 %» y un padre lee «lo falla todo». Nada en el typecheck, en el lint
 *      ni en un test de «devuelve un número» ve la diferencia entre ese cero y
 *      el de un niño que de verdad falló todo.
 *
 *   2. UN PANEL VACÍO PINTADO COMO SI FUERA UN RESULTADO. La casa prefiere la
 *      ausencia al hueco, y los componentes de `@cet/ui` ya se callan solos;
 *      lo que este fichero vigila es el escalón de antes, el de la página: con
 *      todo a cero no se monta el informe, se explica qué falta.
 *
 * Se prueba la capa PURA a propósito: `propsDeSeguimiento` no toca la base ni
 * React, así que estas comprobaciones corren en milisegundos y no dependen de
 * que haya un alumno con datos.
 */
import { describe, expect, it } from "vitest";

import type { SeguimientoDeHijo } from "./queries";
import { hayAlgoQueContar, propsDeSeguimiento, textoDeMinutos } from "./seguimiento";

const VACIO: SeguimientoDeHijo = {
  dias: 7,
  resumen: null,
  serie: [],
  destrezas: [],
  lecciones: [],
};

/** El resumen de un niño que no ha entrado nunca: nueve ceros de verdad. */
const CEROS = {
  minutosEstudio: 0,
  sesiones: 0,
  leccionesAbiertas: 0,
  leccionesCompletadas: 0,
  itemsRespondidos: 0,
  porcentajeAcierto: 0,
  examenesEntregados: 0,
  pistasPedidas: 0,
  rachaMaxima: 0,
} as const;

/** Siete días, el último con los 43,78 minutos que mide hoy la base. */
const UNA_TARDE: SeguimientoDeHijo = {
  dias: 7,
  resumen: { ...CEROS, minutosEstudio: 43.78, sesiones: 11, leccionesAbiertas: 3 },
  serie: [
    { fecha: "2026-08-26", minutos: 0 },
    { fecha: "2026-08-27", minutos: 0 },
    { fecha: "2026-08-28", minutos: 0 },
    { fecha: "2026-08-29", minutos: 0 },
    { fecha: "2026-08-30", minutos: 0 },
    { fecha: "2026-08-31", minutos: 0 },
    { fecha: "2026-09-01", minutos: 43.78 },
  ],
  destrezas: [],
  lecciones: [],
};

describe("seguimiento — sin datos no se monta el informe", () => {
  it("un hijo sin ninguna señal de vida no tiene scorecard", () => {
    expect(hayAlgoQueContar(VACIO)).toBe(false);
    expect(propsDeSeguimiento(VACIO, "Leo", "es")).toBeNull();
  });

  it("un resumen de nueve ceros tampoco lo tiene", () => {
    const nunca: SeguimientoDeHijo = { ...VACIO, resumen: { ...CEROS } };
    expect(hayAlgoQueContar(nunca)).toBe(false);
    expect(propsDeSeguimiento(nunca, "Leo", "es")).toBeNull();
  });

  it("una serie de siete ceros NO es señal de vida por sí sola", () => {
    // La serie viene siempre completa de la base (los días sin actividad salen
    // como 0), así que su mera existencia no prueba que el niño haya entrado.
    const soloCalendario: SeguimientoDeHijo = { ...VACIO, serie: UNA_TARDE.serie.map((d) => ({ ...d, minutos: 0 })) };
    expect(hayAlgoQueContar(soloCalendario)).toBe(false);
  });

  it("basta una destreza medida, aunque la ventana esté a cero", () => {
    const conDestreza: SeguimientoDeHijo = {
      ...VACIO,
      resumen: { ...CEROS },
      destrezas: [{ id: "s1", nombre: { es: "Fracciones", en: "Fractions" }, mastery: 0.7 }],
    };
    expect(hayAlgoQueContar(conDestreza)).toBe(true);
    expect(propsDeSeguimiento(conDestreza, "Leo", "es")).not.toBeNull();
  });
});

describe("seguimiento — un cero que no significa cero no se pinta", () => {
  it("sin preguntas contestadas no hay baldosa de acierto", () => {
    const props = propsDeSeguimiento(UNA_TARDE, "Leo", "es");
    const etiquetas = (props?.stats ?? []).map((s) => s.label.es);
    expect(etiquetas).not.toContain("Acertadas");
  });

  it("con preguntas contestadas sí la hay, y con su signo de porcentaje", () => {
    const conRespuestas: SeguimientoDeHijo = {
      ...UNA_TARDE,
      resumen: { ...CEROS, minutosEstudio: 43.78, sesiones: 11, itemsRespondidos: 12, porcentajeAcierto: 75 },
    };
    const props = propsDeSeguimiento(conRespuestas, "Leo", "es");
    const acierto = (props?.stats ?? []).find((s) => s.label.es === "Acertadas");
    expect(acierto?.value).toBe("75 %");
  });

  it("las cifras accesorias a cero no ocupan sitio; el tiempo y las entradas sí", () => {
    const props = propsDeSeguimiento(UNA_TARDE, "Leo", "es");
    const etiquetas = (props?.stats ?? []).map((s) => s.label.es);
    // Los exámenes, las pistas y la racha están a cero: fuera.
    expect(etiquetas).not.toContain("Exámenes entregados");
    expect(etiquetas).not.toContain("Pistas pedidas");
    expect(etiquetas).not.toContain("Mejor racha");
    // El tiempo y las veces que ha entrado se pintan pase lo que pase.
    expect(etiquetas).toContain("Tiempo de estudio");
    expect(etiquetas).toContain("Veces que ha entrado");
  });
});

describe("seguimiento — los minutos se escriben para un padre, no para una hoja de cálculo", () => {
  it("por debajo de una hora, minutos enteros", () => {
    expect(textoDeMinutos(43.78, "es")).toBe("44 min");
    expect(textoDeMinutos(43.78, "en")).toBe("44 min");
    expect(textoDeMinutos(0, "es")).toBe("0 min");
  });

  it("por encima, horas y minutos con dos dígitos", () => {
    // «1 h 5 min» se lee como una hora y cincuenta; el cero de relleno lo evita.
    expect(textoDeMinutos(65, "es")).toBe("1 h 05 min");
    expect(textoDeMinutos(125, "en")).toBe("2 h 05 min");
  });
});

describe("seguimiento — la serie y su resumen dicen lo mismo", () => {
  it("cada día trae su etiqueta redactada en los dos idiomas", () => {
    const props = propsDeSeguimiento(UNA_TARDE, "Leo", "es");
    const ultimo = props?.effort?.series.at(-1);
    expect(ultimo?.minutes).toBe(43.78);
    expect(ultimo?.label.es).toContain("44 min");
    expect(ultimo?.label.en).toContain("44 min");
    // El día es el de la fecha, no el anterior: la fecha se lee en UTC.
    expect(ultimo?.label.es).toContain("1");
  });

  it("un día sin minutos se rotula «no estudió» y no «0 min»", () => {
    const props = propsDeSeguimiento(UNA_TARDE, "Leo", "es");
    const primero = props?.effort?.series[0];
    expect(primero?.minutes).toBe(0);
    expect(primero?.label.es).toContain("no estudió");
    expect(primero?.label.en).toContain("no study");
  });

  it("el resumen cuenta los días con estudio, no los de la ventana", () => {
    const props = propsDeSeguimiento(UNA_TARDE, "Leo", "es");
    expect(props?.effort?.summary.es).toBe("44 min en los últimos 7 días. Ha estudiado 1 día.");
    expect(props?.effort?.summary.en).toBe("44 min over the last 7 days. They studied on 1 day.");
  });

  it("la frase cuenta los días que trae la serie, no los que se pidieron", () => {
    // La base arma el calendario en la ZONA DEL NIÑO, así que un alumno al este
    // de Greenwich puede recibir un día más de los siete solicitados. Decir
    // «7 días» debajo de ocho columnas es contradecirse dentro del panel.
    const ocho: SeguimientoDeHijo = {
      ...UNA_TARDE,
      serie: [{ fecha: "2026-08-25", minutos: 0 }, ...UNA_TARDE.serie],
    };
    expect(propsDeSeguimiento(ocho, "Leo", "es")?.effort?.summary.es).toContain("8 días");
  });

  it("una semana entera sin estudiar lo dice, en vez de sumar cero", () => {
    const nada: SeguimientoDeHijo = {
      ...UNA_TARDE,
      resumen: { ...CEROS, sesiones: 4 },
      serie: UNA_TARDE.serie.map((d) => ({ ...d, minutos: 0 })),
    };
    expect(propsDeSeguimiento(nada, "Leo", "es")?.effort?.summary.es).toBe(
      "Sin estudio en los últimos 7 días.",
    );
  });
});

describe("seguimiento — lo que se le pasa al scorecard", () => {
  const rico: SeguimientoDeHijo = {
    ...UNA_TARDE,
    destrezas: [
      { id: "s1", nombre: { es: "Fracciones", en: "Fractions" }, mastery: 0.9 },
      { id: "s2", nombre: { es: "Comparar", en: "Compare" }, mastery: 0.1 },
      { id: "s3", nombre: { es: "Medir", en: "Measure" }, mastery: null },
    ],
    lecciones: [{ id: "l1", nombre: { es: "Sumar fracciones", en: "Adding fractions" }, minutos: 12 }],
  };

  it("la materia es la neutra: el informe suma todas, no es de ninguna", () => {
    expect(propsDeSeguimiento(rico, "Leo", "es")?.subjectCode).toBe("otra");
  });

  it("no se pasa cohorte: un hijo de tutor no tiene clase con la que compararse", () => {
    expect(propsDeSeguimiento(rico, "Leo", "es")?.cohort).toBeUndefined();
  });

  it("los niveles salen del mismo umbral que ve el niño en su pantalla", () => {
    const items = propsDeSeguimiento(rico, "Leo", "es")?.skills?.items ?? [];
    expect(items.map((s) => s.level)).toEqual(["mastered", "starting", null]);
  });

  it("el nombre de la lección se resuelve al idioma de la petición", () => {
    expect(propsDeSeguimiento(rico, "Leo", "es")?.lessons?.items[0]?.name).toBe("Sumar fracciones");
    expect(propsDeSeguimiento(rico, "Leo", "en")?.lessons?.items[0]?.name).toBe("Adding fractions");
    expect(propsDeSeguimiento(rico, "Leo", "es")?.lessons?.items[0]?.minutesText).toBe("12 min");
  });

  it("el informe lo encabeza el nombre que se le pase, sin adornos", () => {
    expect(propsDeSeguimiento(rico, "Leo", "es")?.studentName).toBe("Leo");
  });
});
