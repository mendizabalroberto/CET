/**
 * El cronómetro sobrevive a una recarga de página.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * EL FALLO
 * ===========================================================================
 * El cronómetro vivía en una `ref` de React, o sea en memoria. Recargar la
 * página lo ponía a cero. El niño que lleva doce minutos en una lección, pulsa
 * F5 y ve «0:00» no está viendo un contador: está viendo una mentira, y encima
 * una que le quita el mérito de lo que ya ha hecho.
 *
 * ===========================================================================
 * LA CLAVE ES LA ACTIVIDAD, NO LA SESIÓN
 * ===========================================================================
 * Se guarda por `(pantalla, id)` y NO por sesión, y esa es la decisión de
 * fondo: lo que el niño lee como «llevas 12 min» es el tiempo que lleva EN ESTA
 * LECCIÓN, no el tiempo que lleva en esta pestaña. Si la clave incluyera la
 * sesión, cerrar el navegador y volver por la tarde volvería a empezar de cero
 * y el contador seguiría mintiendo, solo que más despacio.
 *
 * Consecuencia que hay que aceptar con los ojos abiertos: volver tres días
 * después a la misma lección continúa desde donde se dejó. Es lo correcto para
 * la pregunta que el número responde —cuánto le ha costado esta lección— y es
 * además lo que hará util la mediana el día que sustituya al `estimated_minutes`
 * inventado. El contador se borra cuando la actividad TERMINA, que es el unico
 * momento en que empezar de cero significa algo.
 *
 * ===========================================================================
 * QUÉ SIGNIFICA ESTO PARA QUIEN AGREGA
 * ===========================================================================
 * `tiempo_en_pantalla` ya llevaba acumulados, con la regla «quedarse con el
 * MÁXIMO por visita, nunca sumar». Con la persistencia el acumulado cruza
 * sesiones, así que el máximo se toma por `(alumno, pantalla, id)` y no por
 * sesión. Sumar los máximos de cada sesión contaría el mismo rato tantas veces
 * como recargas hiciera el niño.
 */

/** Prefijo propio: no comparte espacio con el depósito de la cola de telemetría. */
export const PREFIJO_CRONOMETRO = "cet.crono.v1.";

export interface TiempoGuardado {
  readonly msActivos: number;
  readonly msBrutos: number;
}

interface Guardado extends TiempoGuardado {
  readonly v: 1;
  /** Marca de pared del último volcado. No se usa para contar: solo para depurar. */
  readonly ts: number;
}

function almacen(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Acceder ya lanza con el almacenamiento de sitio bloqueado por política.
    return null;
  }
}

function clave(pantalla: string, id: string): string {
  return `${PREFIJO_CRONOMETRO}${pantalla}.${id}`;
}

/**
 * Lo que esta actividad llevaba acumulado, o `null` si es la primera vez.
 *
 * Devuelve `null` —y no ceros— ante cualquier duda: un depósito ilegible, de
 * otra versión, o con números que no son números. Arrancar de cero es correcto;
 * arrancar de un número inventado, no.
 */
export function leerTiempo(pantalla: string, id: string): TiempoGuardado | null {
  const s = almacen();
  if (s === null) return null;

  try {
    const crudo = s.getItem(clave(pantalla, id));
    if (crudo === null) return null;

    const leido = JSON.parse(crudo) as Partial<Guardado>;
    if (leido.v !== 1) return null;
    if (typeof leido.msActivos !== "number" || typeof leido.msBrutos !== "number") return null;
    if (!Number.isFinite(leido.msActivos) || !Number.isFinite(leido.msBrutos)) return null;
    if (leido.msActivos < 0 || leido.msBrutos < 0) return null;

    return { msActivos: leido.msActivos, msBrutos: leido.msBrutos };
  } catch {
    return null;
  }
}

/** Vuelca el acumulado de esta actividad. Nunca lanza. */
export function guardarTiempo(pantalla: string, id: string, tiempo: TiempoGuardado): void {
  const s = almacen();
  if (s === null) return;

  try {
    const dato: Guardado = { v: 1, ...tiempo, ts: Date.now() };
    s.setItem(clave(pantalla, id), JSON.stringify(dato));
  } catch {
    // Cuota llena o almacenamiento bloqueado: se sigue contando en memoria.
  }
}

/**
 * Se acabó la actividad: el contador de ESTA actividad deja de existir.
 *
 * Es el único momento en que empezar de cero significa algo. Si no se borrara,
 * el niño que repite una lección la vería arrancar con el tiempo de la vez
 * anterior y no sabría si va rápido o lento.
 */
export function olvidarTiempo(pantalla: string, id: string): void {
  const s = almacen();
  if (s === null) return;
  try {
    s.removeItem(clave(pantalla, id));
  } catch {
    /* nada que hacer */
  }
}
