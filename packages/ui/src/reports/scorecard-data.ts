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
