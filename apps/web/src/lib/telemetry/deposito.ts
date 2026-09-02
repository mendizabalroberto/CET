/**
 * El depósito local de la cola de telemetría.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ FALTABA
 * ===========================================================================
 * `TelemetryQueue` ya enviaba en lote cada 5 s o 20 eventos, ya reintentaba con
 * backoff exponencial y jitter, ya devolvía el lote fallido a la CABEZA de la
 * cola en su orden, y ya hacía `sendBeacon` al ocultarse la pestaña.
 *
 * Todo eso vivía EN MEMORIA. Con lo cual:
 *
 *   - se corta el wifi, el niño sigue practicando y llena la cola;
 *   - cierra la pestaña, o el navegador la mata en segundo plano, o recarga;
 *   - `sendBeacon` tampoco sale, porque no hay red;
 *   - y todo lo encolado desaparece sin dejar rastro de que existió.
 *
 * Este módulo es lo único que faltaba: que la cola sobreviva al cierre de la
 * pestaña. No cambia cuándo se envía —eso ya estaba bien— sino qué pasa con lo
 * que aún no se ha enviado cuando el navegador se va.
 *
 * ===========================================================================
 * POR QUÉ UNA CLAVE POR SESIÓN Y NO UNA SOLA
 * ===========================================================================
 * `localStorage` es del ORIGEN, no de la pestaña. Con una única clave, dos
 * pestañas abiertas —que un niño tiene sin darse cuenta— se pisarían la cola la
 * una a la otra: la última en escribir borraría los eventos de la otra, y el
 * agujero sería invisible.
 *
 * Con una clave por `sessionId` cada pestaña escribe la suya y nadie pisa a
 * nadie. Al arrancar se leen TODAS las claves del prefijo, así que una sesión
 * anterior que murió sin enviar se recupera en el siguiente arranque, que es
 * justo el caso que motiva este fichero.
 *
 * Los eventos rescatados se reenvían CON SU `sessionId` Y SU `seq` ORIGINALES.
 * No se renumeran: `seq` es lo que permite ordenar una sesión y detectar sus
 * huecos, y reetiquetarlos con la sesión nueva mezclaría dos ratos distintos
 * del niño en una sola línea temporal.
 *
 * ===========================================================================
 * POR QUÉ TODO VA EN try/catch
 * ===========================================================================
 * `localStorage` LANZA, y por más motivos de los que parece: modo privado de
 * Safari, cuota llena, y navegadores con el almacenamiento de sitio bloqueado
 * por política. Una excepción aquí no puede tumbar la telemetría —y mucho menos
 * la pantalla del niño—, así que todo fallo degrada a «esta sesión no persiste»
 * y la cola sigue funcionando en memoria como hasta ahora.
 */
import type { ClientEvent } from "@cet/shared";

/** Prefijo de toda clave nuestra. La versión permite cambiar el formato sin leer basura vieja. */
export const PREFIJO = "cet.telemetria.v1.";

/**
 * Tope de bytes por sesión. `localStorage` da unos 5 MB por origen y es
 * COMPARTIDO con todo lo demás que guarde la aplicación: comerse la cuota con
 * telemetría rompería cosas que sí le importan al niño. 256 KB son de sobra
 * para varios miles de eventos.
 */
export const MAX_BYTES = 256 * 1024;

/** Lo que se guarda. `v` permite migrar el formato sin adivinar. */
interface Deposito {
  readonly v: 1;
  readonly eventos: ClientEvent[];
}

function almacen(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Acceder a `localStorage` ya lanza si el sitio tiene el almacenamiento
    // bloqueado: no basta con envolver las escrituras.
    return null;
  }
}

/**
 * Guarda lo que aún no se ha enviado de ESTA sesión.
 *
 * Si no cabe se recortan los eventos MÁS ANTIGUOS, la misma política que la
 * cola en memoria: en una sesión larga sin red, lo reciente describe mejor lo
 * que está pasando, y la pérdida no es muda porque `seq` deja un hueco que el
 * análisis puede contar.
 */
export function guardar(sessionId: string, eventos: ClientEvent[]): void {
  const s = almacen();
  if (s === null) return;

  const clave = PREFIJO + sessionId;

  try {
    if (eventos.length === 0) {
      s.removeItem(clave);
      return;
    }

    let recorte = eventos;
    let texto = JSON.stringify({ v: 1, eventos: recorte } satisfies Deposito);

    // Recorte por BYTES y no por número de eventos: un payload de examen y un
    // `focus_lost` no pesan lo mismo, y contar eventos dejaría la cuota a merced
    // de qué estuviera haciendo el niño.
    while (texto.length > MAX_BYTES && recorte.length > 1) {
      recorte = recorte.slice(Math.ceil(recorte.length / 10));
      texto = JSON.stringify({ v: 1, eventos: recorte } satisfies Deposito);
    }

    s.setItem(clave, texto);
  } catch {
    // Cuota llena o almacenamiento bloqueado. Se intenta dejar limpio para no
    // ocupar sitio con algo a medio escribir, y se sigue sin persistencia.
    try {
      s.removeItem(clave);
    } catch {
      /* no hay nada más que hacer */
    }
  }
}

/**
 * Rescata TODO lo pendiente de sesiones anteriores y lo borra del depósito.
 *
 * Se borra al leer a propósito: si el envío vuelve a fallar, la cola lo tiene
 * otra vez en memoria y lo volverá a persistir con `guardar()` bajo la sesión
 * ACTUAL. Dejarlo también en la clave vieja duplicaría cada evento en cada
 * arranque, y una tabla de telemetría que se duplica sola miente más que una
 * vacía.
 *
 * `excluir` es la sesión en curso: su clave la gestiona la cola viva y no se
 * toca aquí.
 */
export function rescatar(excluir: string): ClientEvent[] {
  const s = almacen();
  if (s === null) return [];

  const claves: string[] = [];
  try {
    for (let i = 0; i < s.length; i += 1) {
      const clave = s.key(i);
      if (clave !== null && clave.startsWith(PREFIJO) && clave !== PREFIJO + excluir) {
        claves.push(clave);
      }
    }
  } catch {
    return [];
  }

  const rescatados: ClientEvent[] = [];
  for (const clave of claves) {
    try {
      const crudo = s.getItem(clave);
      s.removeItem(clave);
      if (crudo === null) continue;

      const leido = JSON.parse(crudo) as Partial<Deposito>;
      if (leido.v !== 1 || !Array.isArray(leido.eventos)) continue;

      for (const evento of leido.eventos) {
        // Comprobación mínima de forma: una clave manipulada a mano desde la
        // consola no puede meter basura en un lote y provocar un 400 que tire
        // TAMBIÉN los eventos buenos que viajaban con ella.
        if (
          typeof evento?.sessionId === "string" &&
          typeof evento?.seq === "number" &&
          typeof evento?.eventType === "string"
        ) {
          rescatados.push(evento);
        }
      }
    } catch {
      // Una clave ilegible no puede impedir rescatar las demás.
      continue;
    }
  }

  // Por sesión y por `seq`: se reenvían en el orden en que ocurrieron, que es
  // lo que hace legible una reconstrucción forense.
  rescatados.sort((a, b) =>
    a.sessionId === b.sessionId ? a.seq - b.seq : a.sessionId < b.sessionId ? -1 : 1,
  );

  return rescatados;
}
