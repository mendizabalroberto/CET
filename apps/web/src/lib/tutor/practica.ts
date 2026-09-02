/**
 * Qué hizo el hijo practicando, leído desde `learning_events`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * MÓDULO PURO: no toca la base ni la red. Recibe filas y devuelve el resumen.
 * Es la misma disciplina que `practice-progress.ts` del alumno y por el mismo
 * motivo: la regla de qué cuenta como acierto, como pista o como intento es lo
 * que hay que poder probar en milisegundos y sin Postgres delante.
 *
 * ===========================================================================
 * TRES EVENTOS, Y CADA UNO CONTESTA UNA PREGUNTA DISTINTA
 * ===========================================================================
 * El padre pregunta tres cosas —«¿qué practicó?», «¿en qué se equivocó?» y
 * «¿dónde tuvo que pedir ayuda?»— y no hay un solo evento que las conteste.
 *
 *   `practice_item_answered`  cuántas hizo y cuántas acertó, POR TEMA.
 *   `answer_submitted`        qué respondió, cuánto tardó, cuántas veces cambió
 *                             de opinión y cuántas pistas llevaba encima.
 *   `hint_requested` / `solution_viewed`   cuándo dejó de intentarlo solo.
 *
 * LOS RECUENTOS SALEN DE `practice_item_answered` Y NO DE `answer_submitted`,
 * aunque este último también traiga `isCorrect`. Es a propósito: el primero es
 * la fuente con la que el propio niño ve su avance en `/practice`
 * (`practice-progress.ts`), y si el padre contase por otro lado, dos pantallas
 * del mismo sistema dirían números distintos del mismo día. La lista detallada
 * sí sale de `answer_submitted` porque es el ÚNICO que lleva la respuesta y el
 * tiempo; para eso no hay alternativa que pudiera divergir.
 *
 * ===========================================================================
 * CÓMO SE SEPARA LA PRÁCTICA DEL EXAMEN
 * ===========================================================================
 * Por la presencia de `payload.engineKey`. `answer_submitted` lo emiten las dos
 * superficies —la práctica desde `practice-machine.ts` y el motor de examen
 * desde el servidor— y solo la práctica trabaja con generadores, así que solo
 * ella lleva esa clave. Filtrar por ahí es más fiable que filtrar por ausencia
 * de `attempt_id`, que un día podría rellenarse.
 *
 * Y el examen NO debe colarse aquí: tiene su propia pantalla, sus propias
 * reglas de corrección (el servidor, AD-5) y un intento entregado no es «una
 * práctica en la que se equivocó».
 *
 * ===========================================================================
 * NADA DE ESTO LANZA
 * ===========================================================================
 * `payload` es `jsonb` y la base no puede garantizar su forma: un evento
 * emitido por una versión anterior de la aplicación tiene otro esquema y no
 * puede tumbar la pantalla de un padre ni, peor, contaminar un contador. Lo que
 * no valide se descarta en silencio y no cuenta ni como acierto ni como fallo.
 */

/** Los tipos de evento que esta pantalla necesita leer. */
export const TIPOS_DE_PRACTICA = [
  "practice_item_answered",
  "answer_submitted",
  "hint_requested",
  "solution_viewed",
] as const;

/** Una fila de `learning_events` tal y como llega de PostgREST. */
export interface FilaDeEvento {
  readonly event_type?: unknown;
  readonly server_ts?: unknown;
  readonly payload?: unknown;
}

/** Un intento concreto: una pregunta que el niño contestó. */
export interface IntentoDePractica {
  /** ISO. Lo pone la base (`server_ts`), nunca el navegador. */
  readonly cuando: string;
  readonly engineKey: string;
  readonly acerto: boolean;
  /**
   * Lo que escribió. `null` cuando el evento no lo trae.
   *
   * Es dato de su propio hijo y por eso puede verlo: es la diferencia entre
   * «falló tres de fracciones» y «puso 3/6 donde iba 1/2», que es lo único con
   * lo que un padre puede ayudar de verdad.
   */
  readonly respuesta: string | null;
  /** Segundos sobre esa pregunta. `null` si el evento no los trae. */
  readonly segundos: number | null;
  /** Pistas que llevaba pedidas en esa pregunta al responder. */
  readonly pistas: number;
  /** Veces que cambió la respuesta antes de enviarla. */
  readonly cambios: number;
}

/** El acumulado de un tema de práctica. */
export interface TemaPracticado {
  /** `math.simplify`. La identidad del generador. */
  readonly engineKey: string;
  readonly respondidas: number;
  readonly aciertos: number;
  readonly fallos: number;
  /** 0..1. `null` cuando no respondió ninguna (no se divide por cero). */
  readonly precision: number | null;
  readonly pistas: number;
  readonly soluciones: number;
}

export interface PracticaDeHijo {
  readonly temas: readonly TemaPracticado[];
  readonly intentos: readonly IntentoDePractica[];
  /**
   * `true` cuando la consulta llegó al tope de filas y por tanto lo de arriba
   * es un trozo del periodo y no el periodo entero.
   *
   * Se declara y se pinta. Un recuento truncado que se presenta como total es
   * la clase de mentira que nadie descubre: el padre ve «12 preguntas» de una
   * tarde en la que hubo cuarenta y concluye que su hijo apenas practicó.
   */
  readonly truncado: boolean;
}

/* -------------------------------------------------------------------------- */
/* Lectura defensiva del payload                                              */
/* -------------------------------------------------------------------------- */

function objeto(valor: unknown): Record<string, unknown> | null {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return null;
  return valor as Record<string, unknown>;
}

function textoNoVacio(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

/** Un entero >= 0, o `0`. Un contador nunca debe salir negativo ni NaN. */
function contador(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0
    ? Math.floor(valor)
    : 0;
}

/* -------------------------------------------------------------------------- */
/* El resumen                                                                 */
/* -------------------------------------------------------------------------- */

export interface OpcionesDeResumen {
  /** Cuántos intentos detallados devolver como mucho. */
  readonly maxIntentos: number;
  /** `true` si la consulta que trajo estas filas llegó a su tope. */
  readonly truncado: boolean;
}

/**
 * Agrega las filas en el resumen que pinta la pantalla.
 *
 * `filas` debe venir DEL MÁS RECIENTE AL MÁS ANTIGUO: los `maxIntentos`
 * primeros intentos que encuentre son los que se enseñan, y «los últimos» es
 * justo lo que un padre quiere ver primero.
 *
 * Los temas salen ordenados por número de respuestas, de más a menos. No por
 * porcentaje de acierto: un tema con una sola pregunta acertada encabezaría la
 * lista con un 100 % y empujaría abajo aquel en el que el niño lleva media
 * hora, que es el que importa.
 */
export function resumirPractica(
  filas: readonly FilaDeEvento[],
  opciones: OpcionesDeResumen,
): PracticaDeHijo {
  const acumulado = new Map<
    string,
    { respondidas: number; aciertos: number; pistas: number; soluciones: number }
  >();

  const dameTema = (engineKey: string) => {
    const actual = acumulado.get(engineKey) ?? {
      respondidas: 0,
      aciertos: 0,
      pistas: 0,
      soluciones: 0,
    };
    acumulado.set(engineKey, actual);
    return actual;
  };

  const intentos: IntentoDePractica[] = [];

  for (const fila of filas) {
    const tipo = textoNoVacio(fila.event_type);
    const payload = objeto(fila.payload);
    if (tipo === null || payload === null) continue;

    // SIN `engineKey` NO ES PRÁCTICA. Ver la cabecera: es lo que separa esto
    // del motor de examen, que emite `answer_submitted` con otro payload.
    const engineKey = textoNoVacio(payload["engineKey"]);
    if (engineKey === null) continue;

    switch (tipo) {
      case "practice_item_answered": {
        const acerto = payload["isCorrect"];
        // Un evento sin veredicto booleano no es media respuesta: se descarta
        // entero. Contarlo como fallo inventaría un error que nadie cometió.
        if (typeof acerto !== "boolean") continue;
        const tema = dameTema(engineKey);
        tema.respondidas += 1;
        if (acerto) tema.aciertos += 1;
        break;
      }

      case "hint_requested": {
        dameTema(engineKey).pistas += 1;
        break;
      }

      case "solution_viewed": {
        dameTema(engineKey).soluciones += 1;
        break;
      }

      case "answer_submitted": {
        // El tema se registra aunque el intento no entre en la lista: así un
        // tema que solo aparece al final del periodo no se pierde de la tabla.
        dameTema(engineKey);
        if (intentos.length >= opciones.maxIntentos) break;
        const acerto = payload["isCorrect"];
        if (typeof acerto !== "boolean") break;
        const cuando = textoNoVacio(fila.server_ts);
        if (cuando === null) break;

        const ms = payload["timeOnItemMs"];
        intentos.push({
          cuando,
          engineKey,
          acerto,
          respuesta: textoNoVacio(payload["response"]),
          segundos:
            typeof ms === "number" && Number.isFinite(ms) && ms >= 0
              ? Math.round(ms / 1000)
              : null,
          pistas: contador(payload["hintsUsed"]),
          cambios: contador(payload["changeCount"]),
        });
        break;
      }

      default:
        break;
    }
  }

  const temas: TemaPracticado[] = [...acumulado.entries()]
    .map(([engineKey, c]) => ({
      engineKey,
      respondidas: c.respondidas,
      aciertos: c.aciertos,
      fallos: c.respondidas - c.aciertos,
      precision: c.respondidas === 0 ? null : c.aciertos / c.respondidas,
      pistas: c.pistas,
      soluciones: c.soluciones,
    }))
    // Por volumen, no por acierto. Ver la cabecera de esta función.
    .sort((a, b) => b.respondidas - a.respondidas || a.engineKey.localeCompare(b.engineKey));

  return { temas, intentos, truncado: opciones.truncado };
}

/**
 * ¿Hay algo que enseñar?
 *
 * Un tema con cero de todo no es «practicó y sacó cero»: es un evento suelto de
 * un tema que se abrió y se cerró. La pantalla prefiere decir «todavía no ha
 * practicado» a pintar una tabla de ceros, que a un padre le parece un producto
 * roto y no un hijo que aún no ha empezado.
 */
export function hayPractica(practica: PracticaDeHijo): boolean {
  return practica.intentos.length > 0 || practica.temas.some((t) => t.respondidas > 0);
}
