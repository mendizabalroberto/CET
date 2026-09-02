/**
 * @cet/ui — el vocabulario del scorecard del profesor: tipos y umbrales.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE ESTE FICHERO NO LLEVA "use client"
 * ===========================================================================
 * Mismo motivo que `data/mastery-level.ts` y `learning/block-kind.ts`: en un
 * modulo de cliente TODO lo exportado —tambien una constante y un tipo— queda
 * del lado del cliente. El umbral de cohorte lo tiene que poder leer tambien la
 * consulta que decide si merece la pena calcular la media, y esa consulta corre
 * en el servidor. Un umbral escrito dos veces es un umbral que diverge.
 *
 * ===========================================================================
 * EL UMBRAL DE COHORTE, Y POR QUE ES CINCO
 * ===========================================================================
 * La comparacion con la clase es la unica cifra del scorecard que habla de OTROS
 * ninos. Con una cohorte pequena falla de dos maneras a la vez, y las dos hacen
 * dano:
 *
 *  1. **La media deja de ser una media.** Con tres alumnos, uno solo mueve el
 *     valor un tercio. El profesor lee «Ana estudia la mitad que su clase» y lo
 *     que ha pasado es que un companero hizo un maraton el domingo. La cifra es
 *     verdadera y la conclusion es falsa, que es la peor combinacion posible.
 *  2. **Se puede despejar al individuo.** Con la media y el tamano se recupera
 *     la suma; si la cohorte es dos, el profesor —o cualquiera con la pantalla
 *     delante— tiene el dato del OTRO nino restando. Eso es publicar el dato de
 *     un menor sin haberlo decidido nunca.
 *
 * CINCO es el suelo que usan las estadisticas educativas para no publicar celdas
 * pequenas (la regla de supresion «n < 5» del Departamento for Education
 * britanico y la practica equivalente en informes escolares). No es un numero
 * bonito: es el punto donde un alumno deja de ser mas del 20 % de la media y
 * donde el despeje individual deja de ser aritmetica de cabeza. Por debajo, la
 * comparacion NO se pinta — ni atenuada, ni «aproximada», ni con un asterisco:
 * un dato dudoso en una pantalla se lee como un dato.
 *
 * El tamano de cohorte cuenta a TODOS los alumnos que aportan al promedio,
 * incluido el propio alumno del scorecard. Es lo que hace la consulta y es lo
 * que hay que comparar con el umbral: contarlo de otra forma moveria el suelo
 * real sin cambiar esta constante.
 */

import type { I18nText } from "@cet/shared";
import type { MasteryLevel } from "../data/mastery-level.js";

/**
 * Alumnos minimos para que la comparacion con la clase se pinte. Ver la
 * cabecera: no se baja sin cambiar la cabecera y las pruebas que la fijan.
 */
export const MIN_COHORTE = 5;

/**
 * Unico sitio donde se decide si hay cohorte suficiente.
 *
 * Un tamano que no es un entero finito y positivo NO es «pequeno»: es «no lo
 * sabemos», y tampoco se pinta. `NaN < 5` es `false`, asi que una comparacion
 * escrita a mano en la pantalla dejaria pasar justo el caso peor.
 */
export function hayCohorteSuficiente(cohortSize: number): boolean {
  return Number.isFinite(cohortSize) && Math.floor(cohortSize) >= MIN_COHORTE;
}

/**
 * Un dia de la serie de constancia.
 *
 * `minutes === 0` y `minutes === null` son cosas DISTINTAS y se dibujan
 * distinto (ver `EffortTrend`): cero es «ese dia no estudio», null es «de ese
 * dia no tenemos registro». Confundirlas le dice al profesor que un nino falto
 * cuando lo que fallo fue la sincronizacion del portatil.
 */
export interface EffortDay {
  /**
   * El dia y su cifra, ya redactados y formateados por la aplicacion: solo ella
   * conoce el calendario, el idioma y el huso. Entra en el `<title>` de la barra
   * (lo que sale al pasar el raton por encima).
   */
  readonly label: I18nText;
  /** Minutos del dia. `0` es un dato; `null` es la ausencia de dato. */
  readonly minutes: number | null;
  /**
   * Rotulo corto del eje horizontal, y SOLO en los dias que se anclan («1 sep»,
   * «8 sep»). Mismo trato que `HourActivity.tick` y por el mismo motivo: catorce
   * fechas debajo de columnas estrechas se emborronan en una franja gris, y dos
   * o tres anclas bastan para saber donde empieza y donde acaba la ventana.
   *
   * Sin ninguna ancla la serie sigue siendo legible —el resumen escrito dice el
   * periodo—, asi que es opcional de verdad y no un hueco que rellenar.
   */
  readonly tick?: string | undefined;
}

/**
 * Un corte rotulado de un eje de valores.
 *
 * Existe para que la escala del eje vertical la ESCRIBA la aplicacion. El
 * dibujo sabe repartir cortes redondos (`cortesDelEje` en `chart-chrome`), pero
 * no sabe decir «30 min» en el idioma del tutor —ni siquiera sabe que la unidad
 * son minutos—, y fabricar aqui ese texto seria el literal de cara al usuario
 * que AD-7 prohibe en este paquete. Asi que el valor y su rotulo viajan juntos.
 *
 * El TOPE del eje es el `value` mas alto de la lista, no el maximo de los datos:
 * quien decide hasta donde llega la escala es quien la rotula, porque si no las
 * dos cosas divergen y el ultimo rotulo cae por debajo de la columna mas alta.
 */
export interface AxisTick {
  /** El valor en las unidades del dato (minutos, lecciones…). Mayor que cero. */
  readonly value: number;
  /** Ese valor ya formateado y con su unidad («30 min»), en el idioma activo. */
  readonly text: string;
}

/**
 * Los cortes utilizables de un eje: los que son numeros positivos y traen
 * rotulo, de menor a mayor. La basura se descarta en vez de pintar una linea
 * sin sitio o un rotulo vacio flotando en el margen.
 */
export function cortesUtiles(ticks: readonly AxisTick[] | undefined): readonly AxisTick[] {
  if (ticks === undefined) return [];
  return ticks
    .filter((c) => Number.isFinite(c.value) && c.value > 0 && c.text.length > 0)
    .slice()
    .sort((a, b) => a.value - b.value);
}

/**
 * Minutos utilizables de un dia: solo los de un registro real y no negativo.
 * `null` significa «sin registro», y cualquier basura (NaN, negativo) se trata
 * igual que la ausencia — inventar un cero ahi seria decir que no estudio.
 */
export function minutosDelDia(dia: EffortDay): number | null {
  const m = dia.minutes;
  if (m === null || !Number.isFinite(m) || m < 0) return null;
  return m;
}

/**
 * ¿Hay serie que pintar? Solo si algun dia tiene registro.
 *
 * Vive aqui, y no dentro del componente, porque quien COMPONE el scorecard
 * necesita la misma respuesta para decidir si monta el panel: si el panel se
 * pintara igual y el dibujo devolviera `null`, quedaria un titulo con un hueco
 * debajo, que es peor que la ausencia. Una sola definicion, dos usos.
 */
export function haySerieDeEsfuerzo(series: readonly EffortDay[]): boolean {
  return series.some((d) => minutosDelDia(d) !== null);
}

/** Una destreza y su nivel, para la lista de fortalezas y flojeras. */
export interface SkillEntry {
  /**
   * Nombre de la destreza. Es `I18nText` y no una cadena ya resuelta porque
   * alimenta ademas el nombre accesible de la escalera, que lo pide asi.
   */
  readonly name: I18nText;
  /** Nivel ya derivado de datos reales. `null` = sin evidencia suficiente. */
  readonly level: MasteryLevel | null;
  /** La evidencia detras del nivel («12 preguntas»), ya redactada. */
  readonly evidence?: I18nText | undefined;
}

/** Una leccion y el tiempo que se le ha dedicado. */
export interface LessonTime {
  /** Nombre de la leccion, ya resuelto al idioma por la aplicacion. */
  readonly name: string;
  /** Minutos dedicados. Nunca `null`: una leccion sin registro no entra en la lista. */
  readonly minutes: number;
  /** Los minutos escritos con sus unidades («1 h 05 min»), ya formateados. */
  readonly minutesText: string;
}

/** ¿Hay alguna destreza con nivel? Sin ninguna medida no hay informe. */
export function hayDestrezasMedidas(items: readonly SkillEntry[]): boolean {
  return items.some((s) => s.level !== null);
}

/** ¿Hay algun minuto repartido? Una lista a cero no es un reparto. */
export function hayTiempoPorLeccion(items: readonly LessonTime[]): boolean {
  return items.some((l) => Number.isFinite(l.minutes) && l.minutes > 0);
}

/**
 * =============================================================================
 * LA FORMA DEL DIA: UNA HORA POR COLUMNA
 * =============================================================================
 * `minutes === 0` aqui NO es «no lo sabemos»: la funcion de base devuelve
 * SIEMPRE las veinticuatro horas y pone a cero las que no tuvieron actividad,
 * asi que el cero es una medida. Por eso este tipo no admite `null` en los
 * minutos y no hay que distinguir dos estados como en `EffortDay`: un reloj con
 * huecos no se lee —el ojo no sabe si falta la barra o falta la hora—, y por eso
 * la consulta ya se encarga de que no los haya.
 */
export interface HourActivity {
  /** La hora local del alumno, 0..23. Es la posicion en el reloj, no un rotulo. */
  readonly hour: number;
  /** Minutos de estudio atribuidos a esa hora. Cero es un dato. */
  readonly minutes: number;
  /** «De 21:00 a 22:00: 18 min», ya redactado por la aplicacion. */
  readonly label: I18nText;
  /**
   * Rotulo corto del eje, y solo en las horas que se rotulan («00», «06»).
   * Cuatro anclas bastan para orientarse; veinticuatro numeros bajo columnas de
   * diez pixeles no se leen, se emborronan.
   */
  readonly tick?: string | undefined;
}

/** Minutos utilizables de una hora. La basura cuenta como cero, no como hueco. */
export function minutosDeLaHora(hora: HourActivity): number {
  return Number.isFinite(hora.minutes) && hora.minutes > 0 ? hora.minutes : 0;
}

/**
 * ¿Hay reloj que pintar? Solo si alguna hora tiene minutos.
 *
 * Veinticuatro columnas a cero no son «estudia a ninguna hora»: son una ventana
 * sin medicion. Ocurre de verdad —las sesiones anteriores al cronometro de 0080
 * cuentan minutos en el resumen y no tienen latidos que atribuir a una hora—, y
 * pintar el reloj plano al lado de una baldosa que dice «44 min» es contradecirse
 * dentro de la misma pantalla. Misma regla que `haySerieDeEsfuerzo`, y vive aqui
 * por lo mismo: quien compone el scorecard necesita la misma respuesta.
 */
export function hayRitmoDiario(horas: readonly HourActivity[]): boolean {
  return horas.some((h) => minutosDeLaHora(h) > 0);
}

/**
 * =============================================================================
 * ESFUERZO CONTRA RESULTADO: UN PUNTO POR DIA
 * =============================================================================
 * `x` son los minutos de ese dia y `y` lo que salio de ellos. Las dos magnitudes
 * llegan en BRUTO y no normalizadas —al reves que en `CohortComparison`— porque
 * aqui los dos ejes son independientes: cada uno tiene su propia escala y su
 * propio maximo, y no hay ninguna comparacion entre ellos que un eje comun
 * pudiera falsear.
 */
export interface EffortOutcomePoint {
  /** Minutos estudiados ese dia. Eje horizontal. */
  readonly x: number;
  /** Lo logrado ese dia (lecciones terminadas, aciertos…). Eje vertical. */
  readonly y: number;
  /** «lun, 1 sept: 44 min, 2 lecciones», ya redactado por la aplicacion. */
  readonly label: I18nText;
}

/**
 * DIAS MINIMOS PARA QUE LA DISPERSION SE PINTE, Y POR QUE SON CUATRO
 *
 * Una nube de puntos se lee buscando una TENDENCIA: «cuanto mas tiempo, mas
 * cunde» o «da igual el tiempo que le eche». Esa lectura es la unica razon de
 * ser del dibujo, y con dos o tres puntos es siempre falsa:
 *
 *  1. **Por dos puntos pasa exactamente una recta.** Con dos dias, la nube
 *     dibuja SIEMPRE una tendencia perfecta, suba o baje. No es que se vea una
 *     relacion: es que es geometricamente imposible no verla. Un padre leeria
 *     «a mi hijo le cunde mas cuanto mas estudia» de dos tardes cualesquiera.
 *  2. **Con tres, un dia raro manda.** Una tarde de examen o una de resfriado
 *     mueve la nube entera, y la conclusion se invierte con un solo punto.
 *
 * CUATRO es el suelo donde una nube empieza a poder desmentirse a si misma: hace
 * falta que tres de los cuatro digan lo mismo para que se lea una direccion, y
 * eso ya no lo consigue una tarde suelta. No es un numero de manual de
 * estadistica —para eso harian falta decenas— sino el punto por debajo del cual
 * el dibujo MIENTE SIEMPRE en vez de mentir a veces. Por debajo no se pinta ni
 * atenuado ni con un aviso al pie, por el mismo motivo que `MIN_COHORTE`: una
 * nube dudosa en una pantalla se lee como una nube.
 *
 * Se cuentan los dias CON ESFUERZO, no los dias de la ventana: un dia a cero
 * minutos no aporta ninguna informacion sobre si el tiempo cunde, y cuatro
 * puntos amontonados en el origen darian por bueno el dibujo sin darle un solo
 * dato. Ver `hayDispersionSuficiente`.
 */
export const MIN_DIAS_DISPERSION = 4;

/** Un punto utilizable: los dos ejes son numeros finitos y no negativos. */
function puntoUtilizable(p: EffortOutcomePoint): boolean {
  return Number.isFinite(p.x) && p.x > 0 && Number.isFinite(p.y) && p.y >= 0;
}

/**
 * ¿Hay nube que pintar? Solo con `MIN_DIAS_DISPERSION` dias de estudio real.
 *
 * Unico sitio donde se decide, por lo mismo que `hayCohorteSuficiente`: el
 * componente se calla con la misma condicion con la que el scorecard decide no
 * montar el panel, y no hay dos umbrales que mantener a la vez.
 */
export function hayDispersionSuficiente(points: readonly EffortOutcomePoint[]): boolean {
  return points.filter(puntoUtilizable).length >= MIN_DIAS_DISPERSION;
}

/** Los puntos que de verdad entran en el dibujo. Los demas no existen. */
export function puntosDeDispersion(
  points: readonly EffortOutcomePoint[],
): readonly EffortOutcomePoint[] {
  return points.filter(puntoUtilizable);
}
