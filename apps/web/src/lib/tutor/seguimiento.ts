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
import { cortesDelEje, masteryLevel, MIN_DIAS_DISPERSION, UNKNOWN_SUBJECT } from "@cet/ui";
import type {
  AxisTick,
  EffortDay,
  EffortOutcomePoint,
  HourActivity,
  KpiTileProps,
  KpiTrend,
  LessonTime,
  PlanAdherenceProps,
  ScorecardStat,
  SkillEntry,
  StudyScorecardProps,
  SubjectBreakdownRow,
  TendenciaKpi,
} from "@cet/ui";

import { getDictionary, interpolate, type Dictionary } from "@/lib/i18n";

import type { DiaDeEstudio, SeguimientoDeHijo } from "./queries";

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

/**
 * Formato del ancla del eje horizontal: «1 sept». Sin el día de la semana, que
 * sí lleva la etiqueta larga de la columna: el ancla está para situar la
 * ventana —dónde empieza y dónde acaba— y «lun, 1 sept» repetido dos o tres
 * veces bajo el dibujo es una franja de texto que compite con las columnas.
 */
const FORMATO_DE_ANCLA: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  // Misma trampa que en `FORMATO_DE_DIA`: sin fijar UTC, un servidor al oeste
  // de Greenwich anclaría la columna del lunes con la fecha del domingo.
  timeZone: "UTC",
};

/**
 * Qué días del eje llevan ancla: el primero, el último y —si la ventana da para
 * ello— el de en medio.
 *
 * DOS O TRES, NUNCA UNA POR COLUMNA. Catorce fechas debajo de columnas
 * estrechas no se leen: se emborronan en una franja gris que además roba altura
 * al dibujo, que es lo que hay que mirar. Con los dos extremos se sabe qué
 * periodo se está viendo, que es la pregunta que el eje horizontal contesta; el
 * día concreto de cada columna ya lo da su etiqueta al posarse o al enfocarla.
 */
function anclasDeLaSerie(cuantos: number): ReadonlySet<number> {
  if (cuantos <= 0) return new Set();
  if (cuantos === 1) return new Set([0]);
  const anclas = new Set([0, cuantos - 1]);
  // Cinco es donde el hueco entre los dos extremos empieza a pedir una
  // referencia intermedia. Por debajo, la del medio queda pegada a las otras.
  if (cuantos >= 5) anclas.add(Math.floor((cuantos - 1) / 2));
  return anclas;
}

/**
 * La escala vertical de un eje medido en MINUTOS, ya redondeada y rotulada.
 *
 * El reparto en números redondos lo hace `cortesDelEje`, que vive en `@cet/ui`
 * junto al dibujo que los pinta; el texto lo escribe esta capa, porque el
 * paquete no sabe —ni puede saber, por AD-7— que la unidad son minutos ni cómo
 * se dice eso en el idioma del tutor. Cada corte viaja con su rótulo para que
 * la línea y su número no puedan separarse.
 *
 * Sin ningún minuto medido no hay escala: un eje rotulado sobre un dibujo vacío
 * es la ausencia de datos disfrazada de medición.
 */
function cortesDeMinutos(maximo: number, locale: Locale): readonly AxisTick[] {
  if (!Number.isFinite(maximo) || maximo <= 0) return [];
  return cortesDelEje(maximo, 3).map((value) => ({
    value,
    text: textoDeMinutos(value, locale),
  }));
}

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
 * Como `enDosIdiomas`, pero cuando los VALORES que se interpolan tambien
 * cambian de idioma: «de 21:00 a 22:00» frente a «21:00 to 22:00». Sin esto,
 * la frase inglesa saldria con la conjuncion castellana metida dentro.
 */
function enCadaIdioma(
  elegir: (textos: TextosDeProgreso) => string,
  valores: (locale: Locale) => Record<string, string | number>,
): I18nText {
  return {
    es: interpolate(elegir(getDictionary("es").tutor.child.progress), valores("es")),
    en: interpolate(elegir(getDictionary("en").tutor.child.progress), valores("en")),
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

/**
 * Las baldosas SECUNDARIAS. Ver «un cero que no significa cero» arriba.
 *
 * El tiempo, las sesiones, los días activos, las lecciones terminadas y el
 * acierto —las cinco que el padre lee primero— viven ahora en
 * `kpisPrincipales`, con su variación contra la semana anterior. Esta función
 * se queda con el resto: lo que completa la respuesta, no lo que la abre.
 */
function cifras(seguimiento: SeguimientoDeHijo, locale: Locale): readonly ScorecardStat[] {
  const r = seguimiento.resumen;
  if (r === null) return [];

  const salida: ScorecardStat[] = [];

  /** Añade una cifra solo si de verdad ha ocurrido. */
  const siHay = (valor: number, etiqueta: (x: TextosDeProgreso) => string): void => {
    if (valor > 0) salida.push({ value: String(valor), label: enDosIdiomas(etiqueta) });
  };

  /* La mediana y el mejor día completan la fila de tiempo con el detalle de un
     día normal; ninguna se pinta sin un día de estudio detrás: «un día
     normal: 0 min» es el valor de inicialización disfrazado de medida. */
  const periodo = cifrasDelPeriodo(seguimiento);
  if (periodo.mediana !== null && periodo.mejorDia !== null) {
    salida.push(
      { value: textoDeMinutos(periodo.mediana, locale), label: enDosIdiomas((x) => x.medianLabel) },
      { value: textoDeMinutos(periodo.mejorDia, locale), label: enDosIdiomas((x) => x.bestDayLabel) },
    );
  }
  // La racha de DÍAS no es la `rachaMaxima` del resumen, que cuenta aciertos
  // seguidos dentro de una práctica. Son dos cosas distintas con el mismo
  // nombre corriente, y por eso se rotulan diferente.
  siHay(periodo.rachaDeDias, (x) => x.daysRowLabel);

  siHay(r.leccionesAbiertas, (x) => x.lessonsOpened);
  siHay(r.itemsRespondidos, (x) => x.answered);
  siHay(r.rachaMaxima, (x) => x.streak);
  siHay(r.pistasPedidas, (x) => x.hints);
  siHay(r.examenesEntregados, (x) => x.exams);

  return salida;
}

/**
 * ===========================================================================
 * LA FILA DE KPI PRINCIPAL, Y SU VARIACIÓN CONTRA LA SEMANA ANTERIOR
 * ===========================================================================
 * Cinco cifras, siempre en el mismo orden: tiempo, sesiones, días activos,
 * lecciones terminadas y —solo con preguntas contestadas— el acierto. Las
 * cuatro primeras se pintan SIEMPRE, cero incluido: a diferencia de las
 * accesorias de `cifras()`, aquí cero es una respuesta real («no ha terminado
 * ninguna lección esta semana»), no el valor con el que se inicializa un
 * cálculo. El acierto sigue la regla del cero que no es cero: sin preguntas
 * no hay porcentaje que enseñar.
 *
 * LA VARIACIÓN SOLO EXISTE CON PERIODO ANTERIOR. `resumenAnterior` es `null`
 * cuando la RPC no devolvió fila —niño dado de alta hace menos de una
 * semana—, y entonces la baldosa se pinta sin flecha: no hay «0 min la semana
 * pasada» que inventar. Los DÍAS ACTIVOS son la única excepción sin variación
 * NUNCA: solo se sabe el recuento de un periodo mirando su serie día a día, y
 * esta ronda solo pide el RESUMEN agregado de la semana anterior.
 */
function kpisPrincipales(seguimiento: SeguimientoDeHijo, locale: Locale): readonly KpiTileProps[] {
  const r = seguimiento.resumen;
  if (r === null) return [];
  const anterior = seguimiento.resumenAnterior;
  const periodo = cifrasDelPeriodo(seguimiento);
  const textos = getDictionary(locale).tutor.child.progress;

  const salida: KpiTileProps[] = [];

  const semanas = semanasDeMinutos(seguimiento.serie28);
  salida.push({
    value: textoDeMinutos(r.minutosEstudio, locale),
    label: enDosIdiomas((x) => x.minutes),
    trend: calcularTendencia(r.minutosEstudio, anterior?.minutosEstudio ?? null, textoDeMinutos, locale),
    ...(semanas.length > 0
      ? {
          sparkline: {
            weeks: semanas,
            summary: enDosIdiomas((x) => x.weeklyTrendSummary, { count: semanas.length }),
          },
        }
      : {}),
  });

  salida.push({
    value: String(r.sesiones),
    label: enDosIdiomas((x) => x.sessions),
    trend: calcularTendencia(r.sesiones, anterior?.sesiones ?? null, contador, locale),
  });

  if (periodo.diasDeVentana > 0) {
    salida.push({
      value: interpolate(textos.activeDaysValue, {
        active: periodo.diasActivos,
        total: periodo.diasDeVentana,
      }),
      label: enDosIdiomas((x) => x.activeDaysLabel),
    });
  }

  salida.push({
    value: String(r.leccionesCompletadas),
    label: enDosIdiomas((x) => x.lessonsCompleted),
    trend: calcularTendencia(
      r.leccionesCompletadas,
      anterior?.leccionesCompletadas ?? null,
      contador,
      locale,
    ),
  });

  if (r.itemsRespondidos > 0) {
    salida.push({
      value: textoDePorcentaje(r.porcentajeAcierto, locale),
      label: enDosIdiomas((x) => x.accuracy),
      trend:
        anterior !== null && anterior.itemsRespondidos > 0
          ? calcularTendencia(r.porcentajeAcierto, anterior.porcentajeAcierto, textoDePorcentaje, locale)
          : undefined,
    });
  }

  return salida;
}

/** Un número entero escrito sin unidad. Sirve para sesiones y lecciones. */
function contador(valor: number): string {
  return String(Math.round(valor));
}

/** Un porcentaje ya formateado, en el idioma que se pida. */
function textoDePorcentaje(valor: number, locale: Locale): string {
  return interpolate(getDictionary(locale).tutor.child.progress.percentValue, {
    value: Math.round(valor),
  });
}

/**
 * La variación de una cifra contra su periodo anterior, o `undefined` si no
 * hay con qué comparar. El texto visible (flecha + signo + magnitud) sale
 * SIEMPRE en el idioma de la petición; la frase accesible (`srText`) viaja en
 * los dos, porque es lo que entra en el árbol de accesibilidad sea cual sea
 * el idioma del lector de pantalla.
 */
function calcularTendencia(
  actual: number,
  anterior: number | null,
  formatear: (valor: number, locale: Locale) => string,
  locale: Locale,
): KpiTrend | undefined {
  if (anterior === null) return undefined;
  const delta = actual - anterior;

  if (delta === 0) {
    return {
      direction: "igual",
      text: `= ${getDictionary(locale).tutor.child.progress.trendSameText}`,
      srText: enDosIdiomas((x) => x.trendSameSr),
    };
  }

  const direction: TendenciaKpi = delta > 0 ? "mejora" : "empeora";
  const flecha = direction === "mejora" ? "▲" : "▼";
  // Signo menos matemático (U+2212), no el guion del teclado: es el mismo que
  // ya usa `EffortOutcomeScatter` en sus rótulos negativos de esta casa.
  const signo = direction === "mejora" ? "+" : "−";

  return {
    direction,
    text: `${flecha} ${signo}${formatear(Math.abs(delta), locale)}`,
    srText: enCadaIdioma(
      (x) => (direction === "mejora" ? x.trendMoreSr : x.trendLessSr),
      (l) => ({ value: formatear(Math.abs(delta), l) }),
    ),
  };
}

/**
 * Los minutos de las últimas cuatro semanas, en bloques de siete días, de la
 * más antigua a la más reciente. Sale de `serie28` (ventana de 28 días, ver
 * `queries.ts`); un día sin registro (`null`) cuenta como cero para la
 * tendencia semanal — aquí no se distingue «no estudió» de «no hay dato»,
 * porque el bloque es de siete días y una ausencia suelta no cambia la altura
 * de la barra de forma perceptible.
 *
 * Con menos de 28 días disponibles (un niño recién dado de alta) se devuelven
 * los bloques que sí caben, nunca menos de cero ni un bloque inventado.
 */
function semanasDeMinutos(serie28: readonly DiaDeEstudio[]): readonly number[] {
  if (serie28.length === 0) return [];
  const semanas: number[] = [];
  let fin = serie28.length;
  while (fin > 0 && semanas.length < 4) {
    const inicio = Math.max(0, fin - 7);
    const bloque = serie28.slice(inicio, fin);
    semanas.push(bloque.reduce((suma, dia) => suma + (dia.minutos ?? 0), 0));
    fin = inicio;
  }
  return semanas.reverse();
}

/**
 * ===========================================================================
 * LA ADHERENCIA AL PLAN
 * ===========================================================================
 * Lo justo de `PlanResumen` (`lib/plan/consultas.ts`) para calcular cuánto de
 * lo planificado se ha hecho en la MISMA ventana que el resto del informe: las
 * fechas de `partes` se filtran contra las fechas que trae `seguimiento.serie`
 * —no se recalcula «hoy» aquí ni se abre una tercera definición de ventana—,
 * así que la adherencia habla siempre de la semana que el padre está mirando.
 *
 * SIN PLAN, NINGÚN CÁLCULO: la función se llama con `undefined` y no hay
 * baldosa. Con objetivo cero (`minutosPorDia` inválido, aunque
 * `planActivoDeHijo` ya lo descarta) tampoco: dividir por cero no es un 0 %,
 * es una comparación sin sentido.
 */
export interface PlanDeHijo {
  readonly minutosPorDia: number;
  readonly partes: readonly { readonly fecha: string; readonly minutosMedidos: number }[];
}

function adherenciaAlPlan(
  plan: PlanDeHijo | undefined,
  seguimiento: SeguimientoDeHijo,
  locale: Locale,
): PlanAdherenceProps | undefined {
  if (plan === undefined) return undefined;

  const fechasDeLaVentana = new Set(seguimiento.serie.map((d) => d.fecha));
  const diasDeVentana = fechasDeLaVentana.size > 0 ? fechasDeLaVentana.size : seguimiento.dias;
  const objetivo = plan.minutosPorDia * diasDeVentana;
  if (!(objetivo > 0)) return undefined;

  const hecho = plan.partes
    .filter((p) => fechasDeLaVentana.has(p.fecha))
    .reduce((suma, p) => suma + p.minutosMedidos, 0);

  const ratioReal = hecho / objetivo;
  const ratioCapado = Math.min(1, Math.max(0, ratioReal));
  const porcentajeCapado = Math.round(ratioCapado * 100);
  const porcentajeReal = Math.round(Math.max(0, ratioReal) * 100);
  // Por encima del 100 % se cala la barra y la cifra real viaja aparte. Ver
  // `PlanAdherence` en @cet/ui.
  const conExceso = porcentajeReal > porcentajeCapado;

  return {
    label: enDosIdiomas((x) => x.adherenceLabel),
    percentText: textoDePorcentaje(porcentajeCapado, locale),
    ratio: ratioReal,
    ...(conExceso ? { overText: textoDePorcentaje(porcentajeReal, locale) } : {}),
    progressText: interpolate(getDictionary(locale).tutor.child.progress.adherenceProgressText, {
      done: textoDeMinutos(hecho, locale),
      target: textoDeMinutos(objetivo, locale),
    }),
    summary: enCadaIdioma(
      (x) => (conExceso ? x.adherenceSummaryOver : x.adherenceSummary),
      (l) => ({ percent: textoDePorcentaje(conExceso ? porcentajeReal : porcentajeCapado, l) }),
    ),
  };
}

/** «1 lección» / «5 lecciones», en el idioma que se pida. Misma forma que `textoDeDias`. */
function textoDeLecciones(cuantas: number, locale: Locale): string {
  const textos = getDictionary(locale).tutor.child.progress;
  return cuantas === 1 ? textos.lessonOne : interpolate(textos.lessonMany, { count: cuantas });
}

/**
 * El reparto por materia, listo para `SubjectBreakdown`. Ver `MateriaDeHijo`.
 *
 * ACIERTO Y LECCIONES, LA MISMA REGLA DEL CERO QUE NO ES CERO. `accuracyText`
 * solo se rellena con `itemsRespondidos > 0` — `porcentajeAcierto` puede venir
 * `null` de la base (sin items) o, en teoría, `0` de verdad (todo fallado);
 * comprobar los items y no el porcentaje es lo que distingue «no hubo
 * preguntas» de «las falló todas», que son dos frases distintas y la segunda
 * sí hay que poder escribirla. `lessonsText` solo con lecciones completadas:
 * una materia con cero lecciones terminadas no se rotula «0 lecciones», que
 * leído junto a los minutos parece un reproche.
 */
function desgloseDeMaterias(
  seguimiento: SeguimientoDeHijo,
  locale: Locale,
): readonly SubjectBreakdownRow[] {
  return seguimiento.materias.map((m): SubjectBreakdownRow => ({
    subjectCode: m.code,
    name: resolveI18n(m.nombre, locale),
    minutes: m.minutos,
    minutesText: textoDeMinutos(m.minutos, locale),
    ...(m.itemsRespondidos > 0 && m.porcentajeAcierto !== null
      ? { accuracyText: textoDePorcentaje(m.porcentajeAcierto, locale) }
      : {}),
    ...(m.leccionesCompletadas > 0
      ? { lessonsText: textoDeLecciones(m.leccionesCompletadas, locale) }
      : {}),
  }));
}

/**
 * «lun, 1 sept» en los dos calendarios. Lo usan la constancia y la dispersion,
 * que rotulan el MISMO dia: dos formatos distintos para la misma fecha, dentro
 * del mismo informe, se leen como dos fechas distintas.
 */
function nombreDelDia(fecha: string): Record<Locale, string> {
  const d = new Date(`${fecha}T00:00:00Z`);
  return {
    es: new Intl.DateTimeFormat(INTL.es, FORMATO_DE_DIA).format(d),
    en: new Intl.DateTimeFormat(INTL.en, FORMATO_DE_DIA).format(d),
  };
}

/**
 * La serie de constancia, con la etiqueta de cada columna ya redactada y el
 * ancla del eje horizontal en los dos o tres días que la llevan.
 *
 * El ancla necesita el `locale` de la petición y la etiqueta no: la etiqueta
 * viaja en los dos idiomas porque la resuelve el dibujo, mientras que el ancla
 * es una cadena ya resuelta —igual que el «06» del reloj—, y aquí sí hay que
 * elegir calendario. Es la misma asimetría que ya tiene `lecciones()`.
 */
function constancia(seguimiento: SeguimientoDeHijo, locale: Locale): readonly EffortDay[] {
  const anclas = anclasDeLaSerie(seguimiento.serie.length);

  return seguimiento.serie.map((dia, indice): EffortDay => {
    const nombre = nombreDelDia(dia.fecha);

    // Un día sin minutos se rotula «no estudió» y NO «0 min»: la columna ya
    // dice cero con su forma, y la etiqueta está para leerse, no para repetir.
    const minutos = dia.minutos;
    const label: I18nText =
      minutos === null || minutos <= 0
        ? { es: interpolateDia("es", nombre.es, null), en: interpolateDia("en", nombre.en, null) }
        : {
            es: interpolateDia("es", nombre.es, textoDeMinutos(minutos, "es")),
            en: interpolateDia("en", nombre.en, textoDeMinutos(minutos, "en")),
          };

    return {
      label,
      minutes: minutos,
      // El ancla solo en los días elegidos; en los demás no va la clave, igual
      // que el rótulo del reloj. Ver `anclasDeLaSerie`.
      ...(anclas.has(indice)
        ? {
            tick: new Intl.DateTimeFormat(INTL[locale], FORMATO_DE_ANCLA).format(
              new Date(`${dia.fecha}T00:00:00Z`),
            ),
          }
        : {}),
    };
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


/**
 * ===========================================================================
 * EL RELOJ DEL DÍA: A QUÉ HORA ESTUDIA
 * ===========================================================================
 * La hora se escribe en reloj de 24 h («21:00») y NO con `Intl` en formato de
 * 12 h. Dos motivos, y ninguno es la pereza: la franja de la noche —que es
 * justo la que un padre quiere ver— se lee de un tirón en 24 h y con «9 p. m.»
 * hay que traducirla, y además el rótulo del eje tiene que caber debajo de una
 * columna de ocho píxeles, donde «12 a. m.» no entra. La misma cifra vale para
 * los dos idiomas, así que el eje no cambia de ancho entre ellos.
 */
function horaDeReloj(hora: number): string {
  // El módulo hace falta de verdad: el fin de la última franja es «23 + 1», y
  // «24:00» no es una hora que nadie lea en un reloj.
  return `${String(((hora % 24) + 24) % 24).padStart(2, "0")}:00`;
}

/** La franja de una hora, redactada en cada idioma: «21:00 a 22:00». */
function franja(desde: number, hasta: number): Record<Locale, string> {
  const valores = { from: horaDeReloj(desde), to: horaDeReloj(hasta) };
  return {
    es: interpolate(getDictionary("es").tutor.child.progress.hourRange, valores),
    en: interpolate(getDictionary("en").tutor.child.progress.hourRange, valores),
  };
}

/**
 * Las horas que se rotulan en el eje. Cuatro anclas, de seis en seis.
 * Veinticuatro números debajo de columnas de ocho píxeles se emborronan; con
 * medianoche, mañana, mediodía y tarde se cuenta de seis en seis, que es como
 * se lee un reloj. Ver la cabecera de `DailyRhythm`.
 */
const HORAS_ROTULADAS: ReadonlySet<number> = new Set([0, 6, 12, 18]);

/** El reloj del día, con la frase de cada hora ya redactada. */
function ritmo(seguimiento: SeguimientoDeHijo): readonly HourActivity[] {
  return seguimiento.horas.map((h): HourActivity => {
    const rango = franja(h.hora, h.hora + 1);
    const conMinutos = h.minutos > 0;
    return {
      hour: h.hora,
      minutes: h.minutos,
      label: enCadaIdioma(
        (x) => (conMinutos ? x.hourStudied : x.hourNone),
        (locale) => ({
          range: rango[locale],
          ...(conMinutos ? { minutes: textoDeMinutos(h.minutos, locale) } : {}),
        }),
      ),
      // El rótulo solo en las cuatro anclas; en las demás no va la clave.
      ...(HORAS_ROTULADAS.has(h.hora) ? { tick: String(h.hora).padStart(2, "0") } : {}),
    };
  });
}

/**
 * La frase que resume la forma del día.
 *
 * Dice DOS cosas y no una: entre qué horas cae todo su estudio, y cuál es la
 * hora más fuerte. La franja sola no distingue al niño que estudia repartido de
 * seis a once del que se mete una hora a las diez y media; la hora pico sola
 * —que es lo único que había antes de la migración 0085— no dice si esa hora
 * es la única o el pico de una tarde larga.
 *
 * Se cuenta AQUÍ y no en el dibujo: `DailyRhythm` no sabe leer un reloj, igual
 * que `EffortTrend` no sabe contar días.
 */
function resumenDelRitmo(horas: readonly HourActivity[]): I18nText {
  const conEstudio = horas.filter((h) => h.minutes > 0);
  const primera = conEstudio[0];
  const ultima = conEstudio.at(-1);
  // El llamante ya comprobó que hay ritmo; esto es para que el tipo lo sepa.
  if (primera === undefined || ultima === undefined) return { es: "", en: "" };

  const pico = conEstudio.reduce((mejor, h) => (h.minutes > mejor.minutes ? h : mejor), primera);
  const rangoPico = franja(pico.hour, pico.hour + 1);

  // Una sola hora con estudio no tiene «entre las X y las Y»: decir «entre las
  // 22:00 y las 23:00, sobre todo de 22:00 a 23:00» es repetirse dos veces.
  if (primera.hour === ultima.hour) {
    return enCadaIdioma(
      (x) => x.rhythmSummaryOne,
      (locale) => ({ peak: rangoPico[locale], minutes: textoDeMinutos(pico.minutes, locale) }),
    );
  }

  return enCadaIdioma(
    (x) => x.rhythmSummary,
    (locale) => ({
      from: horaDeReloj(primera.hour),
      to: horaDeReloj(ultima.hour + 1),
      peak: rangoPico[locale],
      minutes: textoDeMinutos(pico.minutes, locale),
    }),
  );
}

/**
 * ===========================================================================
 * ESFUERZO CONTRA RESULTADO
 * ===========================================================================
 * Un punto por día: los minutos de `serie` contra lo que salió de ese día en
 * `logro`. Las dos series se cruzan POR LA FECHA, que es la misma clave y el
 * mismo calendario local del alumno (ver la migración 0086); cruzarlas por
 * posición se rompería en silencio el día que una de las dos trajera un día de
 * más, y los puntos llevarían el tiempo de un día y las lecciones de otro.
 *
 * SIN NINGUNA FILA DE LOGRO NO HAY NUBE, y esta es la regla del cero que no es
 * un cero aplicada aquí. Si la consulta no devuelve nada —porque falló, o
 * porque su función todavía no está en la base— todos los días saldrían con
 * `y = 0` y la nube diría «echa horas y no termina nada», que es una acusación
 * construida con la ausencia de una consulta. Con cero filas, el panel entero
 * no se monta.
 *
 * QUÉ SE PINTA EN EL EJE VERTICAL. Lecciones terminadas si alguna se terminó;
 * si no, preguntas acertadas si hubo alguna. Un niño que practica sin cerrar
 * lecciones tendría una nube pegada al suelo que solo dice «cero», cuando de
 * su tiempo sí salió algo. Si ninguna de las dos cosas ocurrió NUNCA, se
 * quedan las lecciones a cero: ahí el cero está medido y es la respuesta —dura,
 * pero cierta— a «¿le cunde?».
 */
interface Nube {
  readonly points: readonly EffortOutcomePoint[];
  readonly yAxisLabel: I18nText;
  readonly yMaxText: string;
  /** La escala horizontal (minutos), ya redondeada y rotulada. */
  readonly xTicks: readonly AxisTick[];
  /**
   * La escala vertical, en cuentas ENTERAS.
   *
   * Media lección terminada no existe, así que un eje rotulado «0,4 · 0,8 ·
   * 1,2» no es un eje más fino: es un eje donde ningún punto podrá caer nunca
   * sobre una línea. Por eso `cortesDelEje` recibe aquí la bandera de enteros y
   * en el eje de minutos no.
   */
  readonly yTicks: readonly AxisTick[];
}

function dispersion(seguimiento: SeguimientoDeHijo, locale: Locale): Nube | null {
  if (seguimiento.logro.length === 0) return null;

  const porFecha = new Map(seguimiento.logro.map((l) => [l.fecha, l]));
  const dias = seguimiento.serie.filter((d) => d.minutos !== null && d.minutos > 0);
  if (dias.length === 0) return null;

  const leccionesDe = (fecha: string): number => porFecha.get(fecha)?.leccionesCompletadas ?? 0;
  const aciertosDe = (fecha: string): number => porFecha.get(fecha)?.aciertos ?? 0;

  const huboLecciones = dias.some((d) => leccionesDe(d.fecha) > 0);
  const huboAciertos = dias.some((d) => aciertosDe(d.fecha) > 0);
  const porLecciones = huboLecciones || !huboAciertos;

  const valorDe = porLecciones ? leccionesDe : aciertosDe;
  const unidad = (cuantos: number, l: Locale): string => {
    const textos = getDictionary(l).tutor.child.progress;
    if (porLecciones) {
      return cuantos === 1 ? textos.lessonOne : interpolate(textos.lessonMany, { count: cuantos });
    }
    return cuantos === 1 ? textos.rightOne : interpolate(textos.rightMany, { count: cuantos });
  };

  const points = dias.map((dia): EffortOutcomePoint => {
    const minutos = dia.minutos ?? 0;
    const logrado = valorDe(dia.fecha);
    const nombre = nombreDelDia(dia.fecha);
    return {
      x: minutos,
      y: logrado,
      label: enCadaIdioma(
        (x) => x.outcomePoint,
        (l) => ({
          day: nombre[l],
          minutes: textoDeMinutos(minutos, l),
          lessons: unidad(logrado, l),
        }),
      ),
    };
  });

  const maximo = points.reduce((mayor, p) => Math.max(mayor, p.y), 0);
  const maximoDeMinutos = points.reduce((mayor, p) => Math.max(mayor, p.x), 0);

  return {
    points,
    yAxisLabel: enDosIdiomas((x) => (porLecciones ? x.outcomeYAxis : x.outcomeYAxisRight)),
    yMaxText: unidad(maximo, locale),
    xTicks: cortesDeMinutos(maximoDeMinutos, locale),
    // Dos cortes y no tres: el eje vertical de la nube cuenta lecciones o
    // aciertos de UN día, y ahí los números son pequeños. Tres líneas sobre un
    // recorrido de dos o tres lecciones son más rejilla que dato.
    yTicks:
      maximo > 0
        ? cortesDelEje(maximo, 2, true).map((value) => ({ value, text: unidad(value, locale) }))
        : [],
  };
}

/**
 * ===========================================================================
 * LAS CIFRAS DEL PERIODO SALEN DE LA SERIE QUE YA SE CONSULTA
 * ===========================================================================
 * Ni una consulta más: mediana, mejor día, constancia y racha se derivan de los
 * mismos días que pinta la gráfica. Es lo que garantiza que la baldosa y el
 * dibujo no puedan contradecirse — un total sacado del resumen encima de una
 * silueta sacada de la serie es la contradicción que ya se corrigió en
 * `resumenDeConstancia`.
 *
 * LA MEDIANA VA SOBRE LOS DÍAS CON ESTUDIO, NO SOBRE LA VENTANA. Un niño que
 * estudia tres tardes a la semana tiene cuatro ceros en siete días, así que la
 * mediana de la ventana es CERO para él y para el que no ha entrado nunca. Esa
 * cifra mide el calendario, no al niño. La mediana de sus días de estudio dice
 * cuánto dura una tarde suya, que es lo que la baldosa promete.
 *
 * Y ES LA MEDIANA Y NO LA MEDIA porque una tarde de tres horas antes de un
 * examen levanta la media de toda la semana y deja al padre creyendo que su
 * hijo estudia una hora diaria. La mediana no se mueve por un día suelto, que
 * es justo la propiedad que aquí hace falta.
 */
interface CifrasDelPeriodo {
  /** Minutos de un día de estudio normal. `null` si no estudió ningún día. */
  readonly mediana: number | null;
  /** Minutos del mejor día. `null` si no estudió ningún día. */
  readonly mejorDia: number | null;
  readonly diasActivos: number;
  readonly diasDeVentana: number;
  /** Días de estudio seguidos, el tramo más largo. */
  readonly rachaDeDias: number;
}

export function cifrasDelPeriodo(seguimiento: SeguimientoDeHijo): CifrasDelPeriodo {
  const minutosPorDia = seguimiento.serie.map((d) => (d.minutos === null ? 0 : d.minutos));
  const conEstudio = minutosPorDia.filter((m) => m > 0);

  const ordenados = [...conEstudio].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  const mediana =
    ordenados.length === 0
      ? null
      : ordenados.length % 2 === 1
        ? (ordenados[medio] ?? null)
        : // Par: la media de los dos centrales, que es la definición y no un
          // atajo. Coger el de la izquierda haría que dos días de 10 y 40 min
          // dieran «10 min» como día normal.
          ((ordenados[medio - 1] ?? 0) + (ordenados[medio] ?? 0)) / 2;

  let racha = 0;
  let corriente = 0;
  for (const minutos of minutosPorDia) {
    corriente = minutos > 0 ? corriente + 1 : 0;
    if (corriente > racha) racha = corriente;
  }

  return {
    mediana,
    mejorDia: conEstudio.length === 0 ? null : Math.max(...conEstudio),
    diasActivos: conEstudio.length,
    // Los días que TRAE la serie, no los que se pidieron: la base arma el
    // calendario en la zona del niño y puede devolver uno más. Es la misma
    // razón que en `resumenDeConstancia`.
    diasDeVentana: seguimiento.serie.length,
    rachaDeDias: racha,
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
  /** El plan activo del hijo, si tiene uno. Sin él no hay baldosa de adherencia. */
  plan?: PlanDeHijo,
): StudyScorecardProps | null {
  if (!hayAlgoQueContar(seguimiento)) return null;

  const horas = ritmo(seguimiento);
  const nube = dispersion(seguimiento, locale);
  const diasConEstudio = nube === null ? 0 : nube.points.length;

  /* Las dos escalas verticales. El pico de cada dibujo sale de SUS datos —los
     minutos de un día en la constancia, los de una hora en el reloj— y no de
     una escala común: son dos ventanas de tiempo distintas, y un eje compartido
     haría que el reloj de un niño que estudia una hora seguida se pintara
     aplastado contra el suelo por culpa de la altura del otro dibujo. */
  const picoDelDia = seguimiento.serie.reduce(
    (mayor, d) => Math.max(mayor, d.minutos ?? 0),
    0,
  );
  const picoDeLaHora = horas.reduce((mayor, h) => Math.max(mayor, h.minutes), 0);

  const adherencia = adherenciaAlPlan(plan, seguimiento, locale);
  const materias = desgloseDeMaterias(seguimiento, locale);

  return {
    subjectCode: UNKNOWN_SUBJECT,
    studentName: nombreDelAlumno,
    kpis: { items: kpisPrincipales(seguimiento, locale) },
    ...(adherencia === undefined ? {} : { planAdherence: adherencia }),
    ...(materias.length > 0
      ? { subjects: { title: enDosIdiomas((x) => x.subjectsTitle), items: materias } }
      : {}),
    statsTitle: enDosIdiomas((x) => x.statsTitle),
    stats: cifras(seguimiento, locale),
    effort: {
      title: enDosIdiomas((x) => x.effortTitle),
      series: constancia(seguimiento, locale),
      summary: resumenDeConstancia(seguimiento),
      yTicks: cortesDeMinutos(picoDelDia, locale),
      // El único rótulo directo del dibujo, y solo si hubo algún día con
      // estudio: la cifra del día más alto, escrita en su cabeza. Un número
      // sobre cada columna sería ruido —nadie lee catorce— y ninguno dejaría
      // el dibujo sin magnitud, que es lo que la escala ya no permite.
      ...(picoDelDia > 0 ? { peakText: textoDeMinutos(picoDelDia, locale) } : {}),
    },
    // El reloj se pasa siempre: `DailyRhythm` se calla solo si no hay ni un
    // minuto atribuido a una hora, que es la misma condición con la que el
    // scorecard decide no montar el panel. Una sola definición, como el resto.
    rhythm: {
      title: enDosIdiomas((x) => x.rhythmTitle),
      hours: horas,
      summary: resumenDelRitmo(horas),
      yTicks: cortesDeMinutos(picoDeLaHora, locale),
      ...(picoDeLaHora > 0 ? { peakText: textoDeMinutos(picoDeLaHora, locale) } : {}),
    },
    // La nube, en cambio, puede no existir: sin filas de logro no sabemos qué
    // salió de esos minutos y el panel entero desaparece. Ver `dispersion`.
    ...(nube === null
      ? {}
      : {
          outcome: {
            title: enDosIdiomas((x) => x.outcomeTitle),
            points: nube.points,
            xAxisLabel: enDosIdiomas((x) => x.outcomeXAxis),
            yAxisLabel: nube.yAxisLabel,
            xMaxText: textoDeMinutos(
              nube.points.reduce((mayor, punto) => Math.max(mayor, punto.x), 0),
              locale,
            ),
            yMaxText: nube.yMaxText,
            // Con escala rotulada el dibujo deja de escribir los dos topes al
            // lado de los rótulos: serían el mismo número dos veces, uno en la
            // rejilla y otro en la frase. El componente los suprime solo.
            xTicks: nube.xTicks,
            yTicks: nube.yTicks,
            summary: enCadaIdioma(
              (x) => x.outcomeSummary,
              (l) => ({ days: diasEnDosIdiomas(diasConEstudio)[l] }),
            ),
            // La frase que se pinta EN LUGAR de la nube cuando hay pocos días.
            // Sin ella el panel no se montaría y el tutor no sabría que esto
            // existe ni qué le falta para verlo. Ver `EffortOutcomeScatter`.
            tooFewText: enCadaIdioma(
              (x) => x.outcomeTooFew,
              (l) => ({
                min: diasEnDosIdiomas(MIN_DIAS_DISPERSION)[l],
                days: diasEnDosIdiomas(diasConEstudio)[l],
              }),
            ),
          },
        }),
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
