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
import {
  cifrasDelPeriodo,
  hayAlgoQueContar,
  propsDeSeguimiento,
  textoDeMinutos,
} from "./seguimiento";

const VACIO: SeguimientoDeHijo = {
  dias: 7,
  resumen: null,
  serie: [],
  destrezas: [],
  lecciones: [],
  horas: [],
  logro: [],
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
  horas: [],
  logro: [],
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

/**
 * ===========================================================================
 * EL RELOJ DEL DÍA, LA NUBE Y LAS CIFRAS DEL PERIODO
 * ===========================================================================
 * Las tres cosas que se añadieron al informe del tutor comparten la misma
 * manera de romperse que el resto: no fallan, mienten. Un reloj plano dibujado
 * como si fuera una medida, una nube de dos puntos que enseña una tendencia
 * perfecta que no existe, y una mediana calculada sobre la ventana entera que
 * le dice a todo padre de un niño que estudia tres tardes que su hijo estudia
 * cero minutos al día.
 */

/** Las veinticuatro horas a cero: lo que devuelve la base sin medición. */
const RELOJ_VACIO = Array.from({ length: 24 }, (_, hora) => ({
  hora,
  minutos: 0,
  eventos: 0,
}));

/** El mismo reloj con minutos en las horas que se le pasen. */
function relojCon(minutosPorHora: Readonly<Record<number, number>>) {
  return RELOJ_VACIO.map((h) => {
    const minutos = minutosPorHora[h.hora];
    return minutos === undefined ? h : { ...h, minutos, eventos: 3 };
  });
}

describe("seguimiento — el reloj del día", () => {
  it("cada hora trae su frase redactada en los dos idiomas", () => {
    const conReloj: SeguimientoDeHijo = { ...UNA_TARDE, horas: relojCon({ 22: 30 }) };
    const horas = propsDeSeguimiento(conReloj, "Leo", "es")?.rhythm?.hours ?? [];
    expect(horas).toHaveLength(24);
    const pico = horas.find((h) => h.hour === 22);
    expect(pico?.label.es).toBe("De 22:00 a 23:00: 30 min");
    expect(pico?.label.en).toBe("22:00 to 23:00: 30 min");
  });

  it("una hora sin estudio se rotula «no estudió» y no «0 min»", () => {
    const conReloj: SeguimientoDeHijo = { ...UNA_TARDE, horas: relojCon({ 22: 30 }) };
    const horas = propsDeSeguimiento(conReloj, "Leo", "es")?.rhythm?.hours ?? [];
    expect(horas.find((h) => h.hour === 3)?.label.es).toBe("De 03:00 a 04:00: no estudió");
  });

  it("solo cuatro horas llevan rótulo de eje, y son las anclas de seis en seis", () => {
    const conReloj: SeguimientoDeHijo = { ...UNA_TARDE, horas: relojCon({ 22: 30 }) };
    const horas = propsDeSeguimiento(conReloj, "Leo", "es")?.rhythm?.hours ?? [];
    expect(horas.filter((h) => h.tick !== undefined).map((h) => h.tick)).toEqual([
      "00",
      "06",
      "12",
      "18",
    ]);
  });

  it("el resumen dice la franja y la hora más fuerte", () => {
    const conReloj: SeguimientoDeHijo = { ...UNA_TARDE, horas: relojCon({ 21: 10, 22: 30 }) };
    const resumen = propsDeSeguimiento(conReloj, "Leo", "es")?.rhythm?.summary;
    expect(resumen?.es).toBe("Estudia entre las 21:00 y las 23:00, sobre todo de 22:00 a 23:00 (30 min).");
    expect(resumen?.en).toBe("They study between 21:00 and 23:00, mostly 22:00 to 23:00 (30 min).");
  });

  it("una sola hora con estudio no dice «entre las X y las Y»", () => {
    // «Entre las 22:00 y las 23:00, sobre todo de 22:00 a 23:00» se repite dos
    // veces la misma información y suena a plantilla mal rellenada.
    const conReloj: SeguimientoDeHijo = { ...UNA_TARDE, horas: relojCon({ 22: 30 }) };
    expect(propsDeSeguimiento(conReloj, "Leo", "es")?.rhythm?.summary.es).toBe(
      "Todo su tiempo cae de 22:00 a 23:00 (30 min).",
    );
  });

  it("la última franja del día no dice «24:00»", () => {
    const conReloj: SeguimientoDeHijo = { ...UNA_TARDE, horas: relojCon({ 23: 15 }) };
    const horas = propsDeSeguimiento(conReloj, "Leo", "es")?.rhythm?.hours ?? [];
    expect(horas.find((h) => h.hour === 23)?.label.es).toBe("De 23:00 a 00:00: 15 min");
  });
});

describe("seguimiento — esfuerzo contra resultado", () => {
  /** Cuatro días con estudio y su logro, que es lo que pide el umbral. */
  const CUATRO_DIAS: SeguimientoDeHijo = {
    ...UNA_TARDE,
    serie: [
      { fecha: "2026-08-29", minutos: 20 },
      { fecha: "2026-08-30", minutos: 0 },
      { fecha: "2026-08-31", minutos: 35 },
      { fecha: "2026-09-01", minutos: 43.78 },
      { fecha: "2026-09-02", minutos: 12 },
    ],
    logro: [
      { fecha: "2026-08-29", leccionesCompletadas: 1, itemsRespondidos: 4, aciertos: 3 },
      { fecha: "2026-08-30", leccionesCompletadas: 0, itemsRespondidos: 0, aciertos: 0 },
      { fecha: "2026-08-31", leccionesCompletadas: 2, itemsRespondidos: 6, aciertos: 5 },
      { fecha: "2026-09-01", leccionesCompletadas: 5, itemsRespondidos: 3, aciertos: 2 },
      { fecha: "2026-09-02", leccionesCompletadas: 0, itemsRespondidos: 2, aciertos: 1 },
    ],
  };

  it("sin ninguna fila de logro no hay panel: la ausencia no es un cero", () => {
    // Si la consulta no devuelve nada, todos los días saldrían con y = 0 y la
    // nube diría «echa horas y no termina nada» — una acusación construida con
    // la ausencia de una consulta.
    expect(propsDeSeguimiento({ ...UNA_TARDE, logro: [] }, "Leo", "es")?.outcome).toBeUndefined();
  });

  it("un punto por día CON estudio; los días a cero no entran", () => {
    const puntos = propsDeSeguimiento(CUATRO_DIAS, "Leo", "es")?.outcome?.points ?? [];
    expect(puntos).toHaveLength(4);
    expect(puntos.map((p) => p.x)).toEqual([20, 35, 43.78, 12]);
  });

  it("los minutos y el logro se cruzan POR LA FECHA, no por la posición", () => {
    const puntos = propsDeSeguimiento(CUATRO_DIAS, "Leo", "es")?.outcome?.points ?? [];
    // El día de 35 min terminó 2 lecciones; el de 43,78 terminó 5. Cruzados por
    // posición —saltándose el día a cero de en medio— saldrían corridos.
    expect(puntos.map((p) => p.y)).toEqual([1, 2, 5, 0]);
  });

  it("cada punto se lee entero sin ver el dibujo, en los dos idiomas", () => {
    const punto = propsDeSeguimiento(CUATRO_DIAS, "Leo", "es")?.outcome?.points[1];
    expect(punto?.label.es).toBe("lun, 31 ago: 35 min, 2 lecciones");
    expect(punto?.label.en).toBe("Mon 31 Aug: 35 min, 2 lessons");
  });

  it("sin ninguna lección terminada, el eje pasa a las preguntas acertadas", () => {
    // Un niño que practica sin cerrar lecciones tendría la nube pegada al suelo
    // diciendo «cero», cuando de su tiempo sí salió algo.
    const soloPractica: SeguimientoDeHijo = {
      ...CUATRO_DIAS,
      logro: CUATRO_DIAS.logro.map((l) => ({ ...l, leccionesCompletadas: 0 })),
    };
    const nube = propsDeSeguimiento(soloPractica, "Leo", "es")?.outcome;
    expect(nube?.yAxisLabel.es).toBe("Preguntas acertadas");
    expect(nube?.points.map((p) => p.y)).toEqual([3, 5, 2, 1]);
  });

  it("los topes de los dos ejes van escritos con sus unidades", () => {
    const nube = propsDeSeguimiento(CUATRO_DIAS, "Leo", "es")?.outcome;
    expect(nube?.xMaxText).toBe("44 min");
    expect(nube?.yMaxText).toBe("5 lecciones");
  });

  it("con pocos días viaja la frase que explica por qué no hay nube", () => {
    // Es el caso REAL de hoy: un solo día con estudio. Sin esta frase el panel
    // no se monta y el tutor no sabe que esto existe ni qué le falta para verlo.
    const unDia: SeguimientoDeHijo = {
      ...UNA_TARDE,
      logro: [{ fecha: "2026-09-01", leccionesCompletadas: 5, itemsRespondidos: 3, aciertos: 2 }],
    };
    const nube = propsDeSeguimiento(unDia, "Leo", "es")?.outcome;
    expect(nube?.points).toHaveLength(1);
    expect(nube?.tooFewText?.es).toContain("4 días");
    expect(nube?.tooFewText?.es).toContain("1 día");
    expect(nube?.tooFewText?.en).toContain("4 days");
  });
});

describe("seguimiento — las cifras del periodo salen de la serie que ya se consulta", () => {
  const TRES_TARDES: SeguimientoDeHijo = {
    ...UNA_TARDE,
    serie: [
      { fecha: "2026-08-26", minutos: 0 },
      { fecha: "2026-08-27", minutos: 10 },
      { fecha: "2026-08-28", minutos: 40 },
      { fecha: "2026-08-29", minutos: 30 },
      { fecha: "2026-08-30", minutos: 0 },
      { fecha: "2026-08-31", minutos: 0 },
      { fecha: "2026-09-01", minutos: 0 },
    ],
  };

  it("la mediana va sobre los días CON estudio, no sobre la ventana", () => {
    // Sobre la ventana entera la mediana de este niño sería 0 min, igual que la
    // del que no ha entrado nunca: esa cifra mide el calendario, no al niño.
    expect(cifrasDelPeriodo(TRES_TARDES).mediana).toBe(30);
  });

  it("con un número par de días de estudio, la mediana es la media de los dos centrales", () => {
    const cuatro: SeguimientoDeHijo = {
      ...TRES_TARDES,
      serie: [
        { fecha: "2026-08-27", minutos: 10 },
        { fecha: "2026-08-28", minutos: 20 },
        { fecha: "2026-08-29", minutos: 40 },
        { fecha: "2026-08-30", minutos: 50 },
      ],
    };
    expect(cifrasDelPeriodo(cuatro).mediana).toBe(30);
  });

  it("el mejor día, los días activos y la ventana salen de la propia serie", () => {
    const cifras = cifrasDelPeriodo(TRES_TARDES);
    expect(cifras.mejorDia).toBe(40);
    expect(cifras.diasActivos).toBe(3);
    expect(cifras.diasDeVentana).toBe(7);
  });

  it("la racha cuenta días SEGUIDOS, y se corta con un día a cero", () => {
    expect(cifrasDelPeriodo(TRES_TARDES).rachaDeDias).toBe(3);
    const partida: SeguimientoDeHijo = {
      ...TRES_TARDES,
      serie: [
        { fecha: "2026-08-27", minutos: 10 },
        { fecha: "2026-08-28", minutos: 0 },
        { fecha: "2026-08-29", minutos: 30 },
      ],
    };
    expect(cifrasDelPeriodo(partida).rachaDeDias).toBe(1);
  });

  it("sin ningún día de estudio no hay mediana ni mejor día: no son ceros", () => {
    const nada: SeguimientoDeHijo = {
      ...TRES_TARDES,
      serie: TRES_TARDES.serie.map((d) => ({ ...d, minutos: 0 })),
    };
    const cifras = cifrasDelPeriodo(nada);
    expect(cifras.mediana).toBeNull();
    expect(cifras.mejorDia).toBeNull();
    expect(cifras.rachaDeDias).toBe(0);
  });

  it("las baldosas del periodo no se pintan sin un día de estudio detrás", () => {
    const nada: SeguimientoDeHijo = {
      ...UNA_TARDE,
      resumen: { ...CEROS, sesiones: 4 },
      serie: UNA_TARDE.serie.map((d) => ({ ...d, minutos: 0 })),
    };
    const etiquetas = (propsDeSeguimiento(nada, "Leo", "es")?.stats ?? []).map((s) => s.label.es);
    expect(etiquetas).not.toContain("Un día normal");
    expect(etiquetas).not.toContain("Su mejor día");
    expect(etiquetas).not.toContain("Días seguidos");
  });

  it("con un día de estudio sí se pintan, y dicen lo mismo que la gráfica", () => {
    const stats = propsDeSeguimiento(UNA_TARDE, "Leo", "es")?.stats ?? [];
    const valor = (etiqueta: string): string | undefined =>
      stats.find((s) => s.label.es === etiqueta)?.value;
    expect(valor("Un día normal")).toBe("44 min");
    expect(valor("Su mejor día")).toBe("44 min");
    expect(valor("Días con estudio")).toBe("1 de 7");
    expect(valor("Días seguidos")).toBe("1");
  });
});
