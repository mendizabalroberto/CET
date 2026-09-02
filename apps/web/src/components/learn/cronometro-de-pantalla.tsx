"use client";

/**
 * El cronómetro activo, cableado a la pantalla y a la telemetría.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ HACE ESTE FICHERO Y QUÉ NO
 * ===========================================================================
 * La aritmética entera vive en `cronometro-activo.ts`, que es puro y se prueba
 * sin navegador. Aquí solo está lo que NO se puede probar sin navegador: qué
 * sucesos paran el reloj, cada cuánto se pinta y cuándo se emite el evento.
 *
 * ===========================================================================
 * QUÉ PARA EL RELOJ, Y POR QUÉ ESOS TRES
 * ===========================================================================
 * Pestaña oculta, ventana sin foco e inactividad prolongada. Son los tres
 * criterios con los que `supabase/migrations/0064_tiempo_de_estudio.sql` deja
 * de pagar el silencio en el informe del tutor. Contar aquí con otros criterios
 * produciría dos cifras distintas para la misma tarde, y el niño se creería la
 * de la pantalla.
 *
 * La inactividad se declara igual que en el resto de la aplicación: el reloj se
 * para en el instante en que VENCE el temporizador, no retroactivamente. Es lo
 * mismo que hacen `idle_start`/`idle_end` en la práctica y en el examen, y lo
 * mismo que descuenta `app.ms_descontables`. Cambiarlo aquí —descontar también
 * el minuto de gracia— separaría otra vez las dos cifras.
 *
 * ===========================================================================
 * POR QUÉ EL VALOR SE LEE CON UNA FUNCIÓN Y NO ES ESTADO
 * ===========================================================================
 * Si el cronómetro fuese estado de React, la pantalla ENTERA se volvería a
 * pintar una vez por segundo: en la práctica eso es regenerar el enunciado, el
 * teclado en pantalla y los paneles mientras el niño teclea. El estado que
 * cambia cada segundo vive en la hoja que lo pinta (`<TiempoEnPantalla>`), que
 * no tiene hijos; el resto del árbol solo recibe una función para leerlo.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { useTelemetry } from "@/lib/telemetry/provider";

import {
  ahoraMonotono,
  arrancar,
  debeLatir,
  marcarLatido,
  msActivos,
  msBrutos,
  pausar,
  reanudar,
  type Cronometro,
} from "./cronometro-activo";

/** Las tres pantallas que miden tiempo. Coincide con el enum de `@cet/shared`. */
export type PantallaCronometrada = "leccion" | "practica" | "examen";

/**
 * Sin actividad durante este tiempo, el alumno se ha ido de la pantalla.
 *
 * Un minuto, no los treinta segundos de la práctica: aquí se mide LEER, y un
 * niño de once años puede pasar cuarenta segundos con un enunciado delante sin
 * tocar nada, que es justo el tiempo que queremos contar. En la práctica el
 * umbral corto tiene otro fin —detectar que dejó de responder— y no mide lo
 * mismo. Sesenta segundos es también el umbral del corredor de examen.
 */
const INACTIVO_TRAS_MS = 60_000;

/** Cada cuánto se refresca lo que se pinta. Un segundo: es lo que se ve. */
const REFRESCO_MS = 1_000;

/** Sucesos que cuentan como «sigue ahí». `scroll` incluido: leer es hacer scroll. */
const SENALES_DE_VIDA = ["pointerdown", "keydown", "scroll", "wheel"] as const;

export interface OpcionesDeCronometro {
  readonly pantalla: PantallaCronometrada;
  /**
   * Qué se está midiendo: la lección, el tema de práctica o el intento.
   * `null` significa «todavía no hay nada que medir» —el examen no conoce su
   * `attemptId` hasta que el servidor contesta— y con `null` el cronómetro no
   * arranca. Cuando cambia, la visita anterior se cierra con su total y empieza
   * una nueva: cambiar de tema de práctica son dos visitas, no una larga.
   */
  readonly id: string | null;
  /** Se rellena para que el informe agrupe por lección sin abrir el payload. */
  readonly lessonId?: string | undefined;
  readonly attemptId?: string | undefined;
}

export interface LecturaDeCronometro {
  /** Milisegundos activos AHORA. Función y no valor: ver la cabecera. */
  readonly leerMsActivos: () => number;
  readonly leerMsBrutos: () => number;
}

/**
 * El cronómetro, sin nada que pintar.
 *
 * Lo usan directamente las pantallas que ya son cliente y necesitan el total en
 * su propio código —el corredor de examen, que no enseña un segundo reloj pero
 * sí guarda el tiempo—. Las que solo quieren pintarlo montan
 * `<ProveedorDeCronometro>`, que es este mismo hook con un contexto encima.
 */
export function useCronometroActivo(opciones: OpcionesDeCronometro): LecturaDeCronometro {
  const { pantalla, id, lessonId, attemptId } = opciones;
  const { track, flush } = useTelemetry();

  const cronoRef = useRef<Cronometro | null>(null);

  // `track` y `flush` en refs: el efecto de abajo se monta UNA vez por visita y
  // no debe volver a montarse porque el provider haya devuelto otra identidad
  // de función. Remontarlo cerraría la visita y abriría otra, partiendo en dos
  // el tiempo de un niño que no ha hecho nada.
  const trackRef = useRef(track);
  trackRef.current = track;
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (id === null || typeof window === "undefined") return;

    const crono = arrancar(ahoraMonotono());
    cronoRef.current = crono;
    let inactivo: ReturnType<typeof setTimeout> | null = null;

    const emitir = (motivo: "latido" | "salida"): void => {
      const actual = cronoRef.current;
      if (!actual) return;
      const ahora = ahoraMonotono();
      trackRef.current({
        eventType: "tiempo_en_pantalla",
        ...(lessonId ? { lessonId } : {}),
        ...(attemptId ? { attemptId } : {}),
        payload: {
          pantalla,
          id,
          // Se redondean aquí y no en el esquema: el contrato los declara
          // enteros y un decimal de `performance.now()` haría que el servidor
          // rechazara el lote ENTERO con un 400, llevándose por delante los
          // eventos buenos que viajaban con él.
          msActivos: Math.round(msActivos(actual, ahora)),
          msBrutos: Math.round(msBrutos(actual, ahora)),
          motivo,
        },
      });
    };

    const parar = (): void => {
      cronoRef.current = pausar(cronoRef.current ?? crono, ahoraMonotono());
      if (inactivo) clearTimeout(inactivo);
      inactivo = null;
    };

    const armarInactividad = (): void => {
      if (inactivo) clearTimeout(inactivo);
      inactivo = setTimeout(parar, INACTIVO_TRAS_MS);
    };

    const seguir = (): void => {
      // Con la pestaña oculta o la ventana sin foco no se reanuda aunque llegue
      // una señal: un `scroll` sintético o el `keydown` de un atajo del sistema
      // no significan que el niño esté delante.
      if (document.visibilityState === "hidden") return;
      cronoRef.current = reanudar(cronoRef.current ?? crono, ahoraMonotono());
      armarInactividad();
    };

    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === "hidden") {
        parar();
        // La pestaña que se oculta es, en tableta, el paso previo a que el
        // sistema la descarte. Se emite el total AHORA y se fuerza el envío: lo
        // que no salga de aquí puede no salir nunca. El evento es ACUMULADO, así
        // que si la pestaña vuelve y luego se cierra de verdad, el segundo
        // `salida` no duplica nada — quien agrega se queda con el máximo.
        emitir("salida");
        flushRef.current();
        return;
      }
      seguir();
    };

    const alLatir = (): void => {
      const actual = cronoRef.current;
      if (!actual) return;
      const ahora = ahoraMonotono();
      if (!debeLatir(actual, ahora)) return;
      cronoRef.current = marcarLatido(actual, ahora);
      emitir("latido");
    };

    // El latido se comprueba con el reloj de pared pero se DECIDE con el activo:
    // este intervalo solo pregunta «¿ya toca?», y con la pestaña quieta la
    // respuesta es siempre que no. Ver `debeLatir`.
    const tic = setInterval(alLatir, REFRESCO_MS);

    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("focus", seguir);
    window.addEventListener("blur", parar);
    for (const senal of SENALES_DE_VIDA) {
      // En captura y pasivos: la práctica y el examen ya escuchan estos mismos
      // sucesos para su propia inactividad, y esto no debe estorbarles.
      window.addEventListener(senal, seguir, { capture: true, passive: true });
    }

    armarInactividad();

    return () => {
      clearInterval(tic);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("focus", seguir);
      window.removeEventListener("blur", parar);
      for (const senal of SENALES_DE_VIDA) {
        window.removeEventListener(senal, seguir, { capture: true });
      }
      if (inactivo) clearTimeout(inactivo);
      // Cierra la visita: se para primero para no incluir en el activo el rato
      // que la pantalla lleve ya desmontándose.
      cronoRef.current = pausar(cronoRef.current ?? crono, ahoraMonotono());
      emitir("salida");
      cronoRef.current = null;
    };
    // `track` y `flush` NO son dependencias a propósito: viajan por ref. Ver
    // arriba.

  }, [pantalla, id, lessonId, attemptId]);

  const leerMsActivos = useCallback(
    () => (cronoRef.current ? msActivos(cronoRef.current, ahoraMonotono()) : 0),
    [],
  );
  const leerMsBrutos = useCallback(
    () => (cronoRef.current ? msBrutos(cronoRef.current, ahoraMonotono()) : 0),
    [],
  );

  return useMemo(() => ({ leerMsActivos, leerMsBrutos }), [leerMsActivos, leerMsBrutos]);
}

/* -------------------------------------------------------------------------- */

const CronometroContext = createContext<LecturaDeCronometro | null>(null);

/**
 * Mide la pantalla y deja el valor a mano de sus hijos.
 *
 * Existe para el lector de lección, que es un Server Component: los bloques se
 * pintan en el servidor y lo único que necesita JavaScript es medir. El
 * proveedor recibe ese HTML ya renderizado como `children` y no lo toca.
 */
export function ProveedorDeCronometro({
  pantalla,
  id,
  lessonId,
  attemptId,
  children,
}: OpcionesDeCronometro & { readonly children: ReactNode }) {
  const lectura = useCronometroActivo({ pantalla, id, lessonId, attemptId });
  return <CronometroContext.Provider value={lectura}>{children}</CronometroContext.Provider>;
}

/**
 * El cronómetro de la pantalla, o `null` si no hay ninguno por encima.
 *
 * Devuelve `null` en vez de lanzar, y esta vez SÍ en silencio: al contrario que
 * la telemetría, aquí no se pierde ningún dato por no haber proveedor —el
 * evento lo emite el proveedor, no el consumidor—. Lo único que ocurre es que
 * no se pinta un reloj, y quien consulta ya decide si eso significa no pintar
 * nada. Un `throw` aquí tiraría una lección entera por un adorno.
 */
export function useCronometroDePantalla(): LecturaDeCronometro | null {
  return useContext(CronometroContext);
}
