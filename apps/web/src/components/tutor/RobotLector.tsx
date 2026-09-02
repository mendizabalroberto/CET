"use client";

/**
 * El robot que «lee» el boletín mientras el servidor trabaja.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `generarPlan` es UNA Server Action de hasta dos minutos (PDF, dos llamadas
 * a DeepSeek, reparto) y no emite progreso: el navegador solo sabe que está
 * pendiente. Este bloque hace visible esa espera con algo que se entiende de
 * un vistazo —un robot con una hoja, ojos que recorren líneas, un escáner
 * bajando por el papel— y con los cuatro pasos marcándose por TIEMPO
 * ESTIMADO, no por señal del servidor. Por eso el último paso nunca se da por
 * hecho aquí: se cierra cuando la acción devuelve y el bloque desaparece. Una
 * barra que llegara al 100 % sola sería una mentira; esta se frena en el 92 %.
 *
 * Interactivo a propósito: el robot es un botón. Al tocarlo asiente y cambia
 * el bocadillo por una frase de las suyas; con teclado funciona igual (es un
 * `<button>`, con su nombre accesible). No hace nada más: es un guiño para
 * quien espera, no un control.
 *
 * Movimiento: todo son animaciones CSS (`globals.css`, prefijo `cet-robot-`),
 * y el bloque global de `prefers-reduced-motion` las apaga. Sin movimiento,
 * el estado sigue siendo legible: los pasos hechos llevan marca y el activo
 * va en negrita.
 */

import { useEffect, useState } from "react";

/** Segundos estimados de cada paso. El último es abierto (ver cabecera). */
const DURACION_ESTIMADA_S: readonly number[] = [3, 22, 22];

/** Cuántas líneas «lee» en la hoja. */
const LINEAS_DE_LA_HOJA = 6;

/** Cuántas veces por segundo se recalcula el estado. Con 4 basta: los cambios visibles son de segundos. */
const TICS_POR_SEGUNDO = 4;

export interface RobotLectorProps {
  readonly titulo: string;
  readonly pasos: readonly string[];
  readonly ayuda: string;
  /** Frases que suelta el robot al tocarlo. Si está vacío, repite el paso actual. */
  readonly bocadillos: readonly string[];
  /** Nombre accesible del botón-robot («Robot leyendo el boletín; tócalo»). */
  readonly etiquetaRobot: string;
  /** Pista visible bajo el robot («Toca al robot»). */
  readonly pista: string;
  /**
   * Paso por el que se empieza. `1` cuando no hay PDF que leer (regenerar
   * desde un boletín ya guardado): el primer paso sale hecho desde el inicio.
   */
  readonly pasoInicial?: number;
}

/** Con `segundos` transcurridos y el paso inicial, qué paso toca. Puro, para el test. */
export function pasoActual(segundos: number, pasoInicial: number, totalPasos: number): number {
  let acumulado = 0;
  for (let i = pasoInicial; i < totalPasos - 1; i += 1) {
    acumulado += DURACION_ESTIMADA_S[i] ?? 20;
    if (segundos < acumulado) return i;
  }
  return totalPasos - 1;
}

/** Fracción 0..0.92 para la barra: rápida al principio, frenando después. Nunca llega al 100 %. */
export function progresoEstimado(segundos: number, pasoInicial: number): number {
  const estimadoTotal = DURACION_ESTIMADA_S.slice(pasoInicial).reduce((a, b) => a + b, 0) + 25;
  const lineal = Math.min(1, segundos / estimadoTotal);
  // Curva suave: 1 - (1 - x)^2 sube deprisa y se aplana.
  const curva = 1 - (1 - lineal) * (1 - lineal);
  return Math.min(0.92, curva * 0.92);
}

export function RobotLector({
  titulo,
  pasos,
  ayuda,
  bocadillos,
  etiquetaRobot,
  pista,
  pasoInicial = 0,
}: RobotLectorProps) {
  const [tics, setTics] = useState(0);
  const [bocadilloElegido, setBocadilloElegido] = useState<number | null>(null);
  const [asintiendo, setAsintiendo] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTics((t) => t + 1), 1000 / TICS_POR_SEGUNDO);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!asintiendo) return;
    const id = window.setTimeout(() => setAsintiendo(false), 700);
    return () => window.clearTimeout(id);
  }, [asintiendo]);

  const segundos = tics / TICS_POR_SEGUNDO;
  const paso = pasoActual(segundos, pasoInicial, pasos.length);
  const progreso = progresoEstimado(segundos, pasoInicial);
  const lineaLeida = Math.floor(segundos * 1.5) % (LINEAS_DE_LA_HOJA + 1);

  const textoBocadillo =
    bocadilloElegido !== null && bocadillos.length > 0
      ? (bocadillos[bocadilloElegido % bocadillos.length] ?? pasos[paso])
      : pasos[paso];

  function tocarRobot() {
    setAsintiendo(true);
    setBocadilloElegido((previo) => (previo === null ? 0 : previo + 1));
  }

  return (
    <div aria-live="polite" className="mt-4 space-y-4" data-testid="robot-lector">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={tocarRobot}
          aria-label={etiquetaRobot}
          className="focus-visible:ring-[var(--ring)] flex shrink-0 flex-col items-center gap-1 rounded-2xl outline-none focus-visible:ring-4"
        >
          <span
            className="border-line bg-card text-ink relative max-w-[260px] rounded-xl border-2 px-3 py-2 text-center text-[14px] leading-snug shadow-sm after:absolute after:-bottom-2 after:left-1/2 after:h-3 after:w-3 after:-translate-x-1/2 after:rotate-45 after:border-r-2 after:border-b-2 after:border-[var(--line)] after:bg-[var(--card)]"
          >
            {textoBocadillo}
          </span>
          <svg
            width="160"
            height="150"
            viewBox="0 0 132 124"
            aria-hidden="true"
            className={`select-none ${
              asintiendo
                ? "animate-[cet-robot-asentir_0.7s_ease-in-out_1]"
                : "animate-[cet-robot-flotar_3.2s_ease-in-out_infinite]"
            }`}
          >
            {/* Antena */}
            <line x1="66" y1="6" x2="66" y2="20" stroke="var(--brand)" strokeWidth="4" strokeLinecap="round" />
            <circle
              cx="66"
              cy="6"
              r="5"
              fill="var(--amber)"
              className="animate-[cet-robot-antena_1.4s_ease-in-out_infinite]"
            />
            {/* Cabeza */}
            <rect x="30" y="18" width="72" height="50" rx="14" fill="var(--brand)" />
            <rect x="38" y="26" width="56" height="34" rx="10" fill="var(--card)" />
            {/* Ojos: el blanco fijo, la pupila recorre la línea. */}
            <circle cx="54" cy="43" r="8" fill="var(--surface-alt)" />
            <circle cx="78" cy="43" r="8" fill="var(--surface-alt)" />
            <g className="animate-[cet-robot-ojos_2.4s_ease-in-out_infinite]">
              <circle cx="54" cy="43" r="3.6" fill="var(--ink)" />
              <circle cx="78" cy="43" r="3.6" fill="var(--ink)" />
            </g>
            {/* Boca */}
            <rect x="58" y="53" width="16" height="3" rx="1.5" fill="var(--muted)" />
            {/* Cuello y cuerpo */}
            <rect x="60" y="68" width="12" height="8" fill="var(--brand-deep)" />
            <rect x="24" y="76" width="84" height="40" rx="12" fill="var(--brand-deep)" />
            {/* Brazos que sujetan la hoja */}
            <rect x="12" y="84" width="14" height="8" rx="4" fill="var(--brand-deep)" />
            <rect x="106" y="84" width="14" height="8" rx="4" fill="var(--brand-deep)" />
            {/* La hoja del boletín, con sus líneas y el escáner. */}
            <g transform="translate(40 80)">
              <rect x="0" y="0" width="52" height="40" rx="4" fill="var(--card)" stroke="var(--line)" strokeWidth="2" />
              {Array.from({ length: LINEAS_DE_LA_HOJA }, (_, i) => (
                <rect
                  key={i}
                  x="6"
                  y={6 + i * 5.4}
                  width={i % 3 === 2 ? 26 : 40}
                  height="2.6"
                  rx="1.3"
                  fill={i < lineaLeida ? "var(--teal)" : "var(--line)"}
                  className="transition-colors duration-300"
                />
              ))}
              <rect
                x="2"
                y="0"
                width="48"
                height="3"
                rx="1.5"
                fill="var(--amber)"
                opacity="0.9"
                className="animate-[cet-robot-escaner_2s_linear_infinite]"
              />
            </g>
          </svg>
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-ink text-lg font-bold">{titulo}</p>
          <ol className="text-ink space-y-1.5 text-[15px]">
            {pasos.map((texto, i) => {
              const hecho = i < paso;
              const activo = i === paso;
              return (
                <li key={`${i}-${texto}`} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      hecho
                        ? "bg-teal text-on-brand"
                        : activo
                          ? "bg-brand text-on-brand animate-[cet-robot-antena_1.4s_ease-in-out_infinite]"
                          : "border-line text-muted border-2"
                    }`}
                  >
                    {hecho ? "✓" : i + 1}
                  </span>
                  <span className={activo ? "font-semibold" : hecho ? "text-muted" : "text-muted"}>
                    {texto}
                    {hecho ? <span className="sr-only"> ✓</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
          <div
            className="bg-surface-alt h-2 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progreso * 100)}
            aria-label={titulo}
          >
            <div
              className="bg-brand h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${Math.round(progreso * 100)}%` }}
            />
          </div>
          <p className="text-muted text-[15px]">{ayuda}</p>
          <p className="text-muted text-[13px]">{pista}</p>
        </div>
      </div>
    </div>
  );
}
