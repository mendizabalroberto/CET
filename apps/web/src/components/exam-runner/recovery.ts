/**
 * Recuperación del intento: qué respuesta gana al volver.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * EL CASO QUE MÁS MIEDO DA A UN NIÑO. Se recarga la página, se cae el wifi, se
 * apaga la tableta. Al volver tiene que encontrarse exactamente lo que dejó, y
 * el cronómetro donde tocaba. Que esto funcione es la mitad del valor del
 * módulo; que falle una vez es suficiente para que no vuelva a fiarse.
 *
 * DOS FUENTES, UNA REGLA
 *  - El **servidor** devuelve la última revisión de cada ítem que llegó a
 *    `attempt_responses`. Es la verdad de lo que está grabado.
 *  - La **cola local** guarda lo que el alumno escribió y todavía no llegó
 *    (porque no había red cuando cerró la pestaña).
 *
 * Gana la cola local, siempre. No por optimismo: por definición, una entrada en
 * la cola es posterior al último envío confirmado — si hubiera llegado al
 * servidor ya no estaría en la cola. Sobrescribir con lo del servidor
 * significaría borrar lo último que el niño escribió, que es el único fallo
 * verdaderamente imperdonable de esta pantalla.
 *
 * Aun así se compara `clientTs` cuando el servidor manda uno más reciente: si un
 * mismo alumno respondió desde OTRA pestaña y aquello sí llegó, esa respuesta es
 * más nueva y debe ganar. Ese es el caso de las dos pestañas.
 *
 * Puro: sin red, sin DOM, sin relojes.
 */
import type { StudentResponse } from "@cet/shared";

import { emptyResponseFor } from "./responses";
import type { PendingAnswer } from "./autosave";
import type { AttemptItemStudent } from "./types";

export interface RecoveredState {
  /** `attemptItemId` -> respuesta con la que se pinta la pantalla. */
  readonly responses: Record<string, StudentResponse>;
  /** Ítems cuya respuesta viene de la cola local, es decir: nunca llegó al servidor. */
  readonly unsentItemIds: readonly string[];
  /** Cuántos ítems traían respuesta del servidor. Alimenta `attempt_resumed`. */
  readonly restoredFromServer: number;
}

/**
 * @param serverClientTs `attemptItemId` -> `client_ts` de la revisión que
 *   devuelve el servidor, si lo devuelve. Sin este dato, la cola local gana
 *   siempre, que es el fallo seguro.
 */
export function recoverResponses(
  items: readonly AttemptItemStudent[],
  queued: readonly PendingAnswer[],
  serverClientTs: Readonly<Record<string, string>> = {},
): RecoveredState {
  const responses: Record<string, StudentResponse> = {};
  const unsent: string[] = [];
  let restoredFromServer = 0;

  const byId = new Map(items.map((item) => [item.id, item]));

  for (const item of items) {
    if (item.savedResponse) {
      responses[item.id] = item.savedResponse;
      restoredFromServer += 1;
    } else {
      // Un ítem sin respuesta previa arranca con el valor vacío de SU formato,
      // no con `{type:'empty'}`: así `<ChoiceList>` recibe un array y no un
      // undefined, y React no salta de no-controlado a controlado a mitad de
      // un examen (que es el bug que borra lo que el alumno acaba de escribir).
      responses[item.id] = emptyResponseFor(item.format);
    }
  }

  for (const entry of queued) {
    // Una entrada de la cola que no corresponde a ningún ítem de ESTE intento
    // se ignora. Ocurre si el alumno tiene dos exámenes empezados; enviarla
    // sería escribir en el intento equivocado.
    if (!byId.has(entry.attemptItemId)) continue;

    const serverTs = serverClientTs[entry.attemptItemId];
    if (serverTs !== undefined) {
      const serverMs = Date.parse(serverTs);
      const localMs = Date.parse(entry.clientTs);
      // Solo cede si el servidor tiene algo ESTRICTAMENTE más nuevo y ambas
      // fechas son legibles. En el empate gana lo local, que es lo no enviado.
      if (Number.isFinite(serverMs) && Number.isFinite(localMs) && serverMs > localMs) continue;
    }

    responses[entry.attemptItemId] = entry.response;
    unsent.push(entry.attemptItemId);
  }

  return { responses, unsentItemIds: unsent, restoredFromServer };
}
