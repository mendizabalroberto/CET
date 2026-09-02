/**
 * De lo que devuelve la base a lo que pide el scorecard.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ ESTO ES UN MÓDULO APARTE Y NO CÓDIGO DENTRO DE LA PÁGINA
 * ===========================================================================
 * Aquí no se pinta nada: se decide QUÉ se enseña y CÓMO se redacta. Son las dos
 * cosas del seguimiento que se pueden equivocar en silencio —un cero que se
 * cuela y miente, una cifra sin datos detrás— y las dos se prueban sin montar
 * React (`seguimiento.test.ts`). La página se queda con lo suyo: leer, decidir
 * si hay algo que contar y montar el componente.
 *
 * ===========================================================================
 * NO SE DIBUJA NADA NUEVO. NI UN SVG, NI UNA BARRA
 * ===========================================================================
 * `@cet/ui/reports` ya tiene resuelto el informe entero —las baldosas, la
 * silueta de constancia, la escalera de destrezas, el reparto por lección— y
 * ademas lleva dentro la regla de cuándo cada panel SE CALLA SOLO. Este fichero
 * solo prepara sus props. Si alguna vez aparece aquí una etiqueta `<svg>` o un
 * ancho en porcentaje, es que alguien se equivocó de camino.
 *
 * ===========================================================================
 * UN CERO QUE NO SIGNIFICA CERO NO SE PINTA
 * ===========================================================================
 * La regla que más trabajo hace en este fichero. `informe_alumno_resumen`
 * devuelve `porcentaje_acierto = 0` cuando NO HA HABIDO NI UNA PREGUNTA: es el
 * valor con el que se inicializa el cálculo, no una medida. Pintado como una
 * baldosa dice «0 % de acierto», que un padre lee como «lo falla todo». Por eso
 * el acierto solo entra si hay respuestas detrás, y por eso las cifras
 * accesorias (pistas, exámenes, rachas) solo entran cuando son mayores que
 * cero: una fila de ceros permanentes no es información, es ruido con el que
 * hay que aprender a convivir.
 *
 * Las dos que SÍ se pintan siempre son el tiempo y las veces que ha entrado:
 * ahí el cero es la respuesta a la pregunta que trae al tutor a esta pantalla.
 *
 * ===========================================================================
 * LOS TEXTOS SALEN DE LOS DOS DICCIONARIOS A LA VEZ (AD-7)
 * ===========================================================================
 * Los componentes de `@cet/ui` piden `I18nText` —`{ es, en }`— para todo lo que
 * lleva nombre accesible, así que las frases se redactan en los DOS idiomas
 * aunque la página se esté pintando en uno. No es desperdicio: el `<title>` de
 * una columna y el resumen del dibujo viajan al HTML, y un lector de pantalla
 * configurado en el otro idioma los encuentra ahí.
 *
 * Los valores de las baldosas sí son cadena suelta —así los pide `StatTile`— y
 * se resuelven con el idioma de la petición.
 */
import { resolveI18n, type I18nText, type Locale } from "@cet/shared";
import { masteryLevel, UNKNOWN_SUBJECT } from "@cet/ui";
import type {
  EffortDay,
  LessonTime,
  ScorecardStat,
  SkillEntry,
  StudyScorecardProps,
} from "@cet/ui";

import { getDictionary, interpolate, type Dictionary } from "@/lib/i18n";

import type { SeguimientoDeHijo } from "./queries";

/** El trozo del diccionario que redacta este informe. */
type TextosDeProgreso = Dictionary["tutor"]["child"]["progress"];

/**
 * Las etiquetas de día se formatean con estos dos `locale` de Intl y no con el
 * de la petición: la etiqueta viaja en los dos idiomas, así que hacen falta los
 * dos calendarios. `es-ES` y `en-GB` porque el producto es británico y el
 * castellano de referencia es el peninsular.
 */
const INTL: Readonly<Record<Locale, string>> = { es: "es-ES", en: "en-GB" };

/** Formato corto de día: «lun, 1 sept». Cabe debajo de una columna estrecha. */
const FORMATO_DE_DIA: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  // La fecha llega como `YYYY-MM-DD`, que se interpreta como medianoche UTC.
  // Sin fijar la zona aquí, un servidor al oeste de Greenwich restaría horas y
  // enseñaría el día ANTERIOR: la columna del lunes rotulada «domingo».
  timeZone: "UTC",
};

/** Redacta la misma frase en los dos idiomas. Nunca escribe un literal. */
function enDosIdiomas(
  elegir: (textos: TextosDeProgreso) => string,
  valores: Record<string, string | number> = {},
): I18nText {
  return {
    es: interpolate(elegir(getDictionary("es").tutor.child.progress), valores),
    en: interpolate(elegir(getDictionary("en").tutor.child.progress), valores),
  };
}

/**
 * Minutos escritos con sus unidades. Se redondea a minutos enteros a
 * propósito: la base mide con dos decimales —43,78— y esa precisión es cierta
 * pero no le sirve de nada a un padre, que lee «casi tres cuartos de hora».
 */
export function textoDeMinutos(minutos: number, locale: Locale): string {
  const textos = getDictionary(locale).tutor.child.progress;
  const total = Math.max(0, Math.round(minutos));
  if (total < 60) return interpolate(textos.minutesUnit, { count: total });
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return interpolate(textos.hoursUnit, {
    hours: horas,
    // Dos dígitos: «1 h 05 min» y no «1 h 5 min», que se lee como 1 h 50.
    minutes: String(resto).padStart(2, "0"),
  });
}

/** «1 día» / «5 días», en el idioma que se pida. Sin pluralización mágica. */
function textoDeDias(cuantos: number, textos: TextosDeProgreso): string {
  return cuantos === 1 ? textos.dayOne : interpolate(textos.dayMany, { count: cuantos });
}

/** La misma cuenta de días, en los dos idiomas. */
function diasEnDosIdiomas(cuantos: number): { es: string; en: string } {
  return {
    es: textoDeDias(cuantos, getDictionary("es").tutor.child.progress),
    en: textoDeDias(cuantos, getDictionary("en").tutor.child.progress),
  };
}

/**
 * ¿Hay algo que contar?
 *
 * Se pregunta ANTES de montar el scorecard, y no dentro: con todo a cero el
 * componente pintaría igualmente su encabezado y una fila de baldosas a cero,
 * y eso —para el tutor que acaba de dar de alta a su hijo y todavía no le ha
 * mandado el enlace— es un informe de un niño que nunca ha entrado. La página
 * enseña en ese caso una frase que explica qué falta, que es más útil que
 * nueve ceros.
 *
 * Basta con UNA señal de vida: minutos, una sesión, una lección abierta, una
 * pregunta contestada, una destreza medida o un minuto atribuido a una lección.
 */
export function hayAlgoQueContar(seguimiento: SeguimientoDeHijo): boolean {
  const r = seguimiento.resumen;
  if (
    r !== null &&
    (r.minutosEstudio > 0 ||
      r.sesiones > 0 ||
      r.leccionesAbiertas > 0 ||
      r.itemsRespondidos > 0)
  ) {
    return true;
  }
  if (seguimiento.destrezas.some((d) => d.mastery !== null)) return true;
  return seguimiento.lecciones.some((l) => l.minutos > 0);
}

/** Las baldosas de cabecera. Ver «un cero que no significa cero» arriba. */
function cifras(seguimiento: SeguimientoDeHijo, locale: Locale): readonly ScorecardStat[] {
  const r = seguimiento.resumen;
  if (r === null) return [];

  const salida: ScorecardStat[] = [
    {
      value: textoDeMinutos(r.minutosEstudio, locale),
      label: enDosIdiomas((x) => x.minutes),
    },
    {
      value: String(r.sesiones),
      label: enDosIdiomas((x) => x.sessions),
    },
  ];

  /** Añade una cifra solo si de verdad ha ocurrido. */
  const siHay = (valor: number, etiqueta: (x: TextosDeProgreso) => string): void => {
    if (valor > 0) salida.push({ value: String(valor), label: enDosIdiomas(etiqueta) });
  };

  siHay(r.leccionesAbiertas, (x) => x.lessonsOpened);
  siHay(r.leccionesCompletadas, (x) => x.lessonsCompleted);
  siHay(r.itemsRespondidos, (x) => x.answered);

  // El acierto solo existe si hubo preguntas. Ver la cabecera.
  if (r.itemsRespondidos > 0) {
    salida.push({
      value: interpolate(getDictionary(locale).tutor.child.progress.percentValue, {
        value: Math.round(r.porcentajeAcierto),
      }),
      label: enDosIdiomas((x) => x.accuracy),
    });
  }

  siHay(r.rachaMaxima, (x) => x.streak);
  siHay(r.pistasPedidas, (x) => x.hints);
  siHay(r.examenesEntregados, (x) => x.exams);

  return salida;
}

/** La serie de constancia, con la etiqueta de cada columna ya redactada. */
function constancia(seguimiento: SeguimientoDeHijo): readonly EffortDay[] {
  return seguimiento.serie.map((dia): EffortDay => {
    const fecha = new Date(`${dia.fecha}T00:00:00Z`);
    const nombreDelDia: Record<Locale, string> = {
      es: new Intl.DateTimeFormat(INTL.es, FORMATO_DE_DIA).format(fecha),
      en: new Intl.DateTimeFormat(INTL.en, FORMATO_DE_DIA).format(fecha),
    };

    // Un día sin minutos se rotula «no estudió» y NO «0 min»: la columna ya
    // dice cero con su forma, y la etiqueta está para leerse, no para repetir.
    const minutos = dia.minutos;
    const label: I18nText =
      minutos === null || minutos <= 0
        ? { es: interpolateDia("es", nombreDelDia.es, null), en: interpolateDia("en", nombreDelDia.en, null) }
        : {
            es: interpolateDia("es", nombreDelDia.es, textoDeMinutos(minutos, "es")),
            en: interpolateDia("en", nombreDelDia.en, textoDeMinutos(minutos, "en")),
          };

    return { label, minutes: minutos };
  });
}

/** «lun, 1 sept: 44 min» o «lun, 1 sept: no estudió». */
function interpolateDia(locale: Locale, dia: string, minutos: string | null): string {
  const textos = getDictionary(locale).tutor.child.progress;
  return minutos === null
    ? interpolate(textos.dayNone, { day: dia })
    : interpolate(textos.dayStudied, { day: dia, minutes: minutos });
}

/** La frase que resume la silueta. Se cuenta aquí; el dibujo no sabe contar. */
function resumenDeConstancia(seguimiento: SeguimientoDeHijo): I18nText {
  const conEstudio = seguimiento.serie.filter((d) => d.minutos !== null && d.minutos > 0);
  // La ventana que se ANUNCIA es la que trae la serie, no la que se pidió. La
  // base construye el calendario en la zona horaria del niño, así que un alumno
  // al este de Greenwich puede recibir un día más de los siete solicitados;
  // decir «7 días» debajo de ocho columnas es contradecirse dentro del panel.
  const ventana = diasEnDosIdiomas(
    seguimiento.serie.length > 0 ? seguimiento.serie.length : seguimiento.dias,
  );

  if (conEstudio.length === 0) {
    return {
      es: interpolate(getDictionary("es").tutor.child.progress.effortSummaryNone, {
        window: ventana.es,
      }),
      en: interpolate(getDictionary("en").tutor.child.progress.effortSummaryNone, {
        window: ventana.en,
      }),
    };
  }

  // El total sale de la propia serie y no del resumen: es lo que el dibujo
  // enseña, y una frase que dijera otro número que el de las columnas sería
  // una contradicción dentro del mismo panel.
  const total = conEstudio.reduce((suma, d) => suma + (d.minutos ?? 0), 0);
  const activos = diasEnDosIdiomas(conEstudio.length);

  return {
    es: interpolate(getDictionary("es").tutor.child.progress.effortSummary, {
      total: textoDeMinutos(total, "es"),
      window: ventana.es,
      active: activos.es,
    }),
    en: interpolate(getDictionary("en").tutor.child.progress.effortSummary, {
      total: textoDeMinutos(total, "en"),
      window: ventana.en,
      active: activos.en,
    }),
  };
}

/** Las destrezas, con el nivel derivado con el MISMO umbral que ve el niño. */
function destrezas(seguimiento: SeguimientoDeHijo): readonly SkillEntry[] {
  return seguimiento.destrezas.map(
    (d): SkillEntry => ({
      name: d.nombre,
      // `masteryLevel` es la única definición de los cuatro tramos del producto.
      // Un umbral escrito aquí haría que «Lo llevas bien» significara una cosa
      // en la pantalla del niño y otra en la de su padre.
      level: d.mastery === null ? null : masteryLevel(d.mastery),
    }),
  );
}

/** El reparto del tiempo por lección, con el nombre ya resuelto al idioma. */
function lecciones(seguimiento: SeguimientoDeHijo, locale: Locale): readonly LessonTime[] {
  return seguimiento.lecciones.map(
    (l): LessonTime => ({
      name: resolveI18n(l.nombre, locale),
      minutes: l.minutos,
      minutesText: textoDeMinutos(l.minutos, locale),
    }),
  );
}

/**
 * Las props del scorecard, o `null` cuando no hay nada que contar.
 *
 * LA MATERIA ES LA NEUTRA, y es una decisión. `ScorecardPanel` tiñe el rail y
 * el medallón con la identidad de una materia, pero este informe NO es de una
 * materia: suma los minutos de todo lo que el niño haya tocado. Pintarlo de
 * azul matemático diría que estos 44 minutos son de mates, que es falso en
 * cuanto abra una lección de inglés. `UNKNOWN_SUBJECT` tiene sus tokens
 * medidos como los demás y su propio icono, así que no es un hueco: es la
 * identidad de «varias materias».
 */
export function propsDeSeguimiento(
  seguimiento: SeguimientoDeHijo,
  nombreDelAlumno: string,
  locale: Locale,
): StudyScorecardProps | null {
  if (!hayAlgoQueContar(seguimiento)) return null;

  return {
    subjectCode: UNKNOWN_SUBJECT,
    studentName: nombreDelAlumno,
    statsTitle: enDosIdiomas((x) => x.statsTitle),
    stats: cifras(seguimiento, locale),
    effort: {
      title: enDosIdiomas((x) => x.effortTitle),
      series: constancia(seguimiento),
      summary: resumenDeConstancia(seguimiento),
    },
    skills: {
      title: enDosIdiomas((x) => x.skillsTitle),
      items: destrezas(seguimiento),
    },
    // `cohort` NO se pasa, y no es un olvido: el hijo de un tutor no tiene
    // colegio ni clase, así que no hay cohorte que promediar. Pasarlo con
    // `cohortSize: 0` haría que `CohortComparison` se callara igual, pero
    // dejaría en el código la promesa de una comparación que aquí no puede
    // existir. Cuando la haya, se pasará con datos de verdad.
    lessons: {
      title: enDosIdiomas((x) => x.lessonsTitle),
      items: lecciones(seguimiento, locale),
    },
  };
}
