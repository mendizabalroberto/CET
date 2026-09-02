"use client";

/**
 * «Cuánto llevo». El único reloj que ve el alumno mientras aprende.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * SOLO EL TIEMPO TRANSCURRIDO. NUNCA UNO ESPERADO, NUNCA UNA BARRA
 * ===========================================================================
 * No hay porcentaje, no hay barra de progreso y no hay «de 20 min».
 * `lessons.estimated_minutes` vale 20 en las 33 lecciones —mínimo 20, máximo
 * 20—: no es una estimación, es un valor por defecto que nadie rellenó.
 * Pintarlo sería mentirle al niño con la precisión de un dato inventado, y una
 * barra que se llena hacia un número falso además le mete prisa. Lo que se
 * almacena hoy es lo que permitirá que algún día esa estimación sea la mediana
 * real; hasta entonces, el reloj acompaña y no presiona.
 *
 * ===========================================================================
 * ACCESIBILIDAD: POR QUÉ AQUÍ NO HAY `aria-live`
 * ===========================================================================
 * Un `aria-live="polite"` sobre unos dígitos que cambian cada segundo es
 * insufrible: el lector de pantalla cantaría «cuatro doce, cuatro trece, cuatro
 * catorce» encima del enunciado que el niño está intentando leer, y en la
 * práctica taparía el «correcto» de su propia respuesta. Una región viva que
 * hay que apagar mentalmente es peor que no tener el dato.
 *
 * La solución es separar las dos audiencias en vez de servir a las dos con el
 * mismo nodo:
 *
 *  · Los dígitos que corren son DECORATIVOS para la tecnología de apoyo
 *    (`aria-hidden`). Se ven, no se anuncian, y cambian cada segundo.
 *  · El elemento que sí queda en el árbol de accesibilidad lleva un
 *    `aria-label` con el tiempo en MINUTOS enteros («Llevas 4 minutos»), sin
 *    `aria-live`. Quien use lector lo oye cuando llega a él —es información que
 *    se consulta, como un reloj de pared— y no cuando el reloj decide hablar.
 *    Al ser de grano minuto, además, no cambia bajo el cursor virtual mientras
 *    se lee.
 *
 * El único sitio de esta función donde SÍ hay anuncio automático es el resumen
 * final (`<ResumenDeTiempo>`): ahí el mensaje ocurre una vez, es el resultado de
 * un acto del alumno y por tanto es exactamente lo que un `role="status"` está
 * para decir.
 */
import { useEffect, useState } from "react";
import { useLocale } from "@cet/ui";

import { formatearMmSs, minutosParaElResumen } from "./cronometro-activo";
import { useCronometroDePantalla } from "./cronometro-de-pantalla";
import { getLearnDictionary } from "./dictionary";

/** Un segundo. Es la unidad que se ve. */
const REFRESCO_MS = 1_000;

export interface TiempoEnPantallaProps {
  /**
   * Milisegundos activos, si quien monta el componente ya los tiene. Si se
   * omite, se leen del `<ProveedorDeCronometro>` de más arriba; sin proveedor y
   * sin prop no se pinta nada, que es lo correcto: un reloj a cero que no
   * avanza es peor que ningún reloj.
   */
  readonly msActivos?: number | undefined;
  readonly className?: string | undefined;
}

export function TiempoEnPantalla({ msActivos, className }: TiempoEnPantallaProps) {
  const cronometro = useCronometroDePantalla();
  const locale = useLocale();
  const t = getLearnDictionary(locale).time;

  // El estado que cambia cada segundo vive AQUÍ, en una hoja sin hijos. Si
  // viviera en la pantalla, la práctica entera —enunciado, teclado, paneles— se
  // volvería a pintar una vez por segundo mientras el niño teclea.
  const [ms, setMs] = useState(() => msActivos ?? cronometro?.leerMsActivos() ?? 0);

  useEffect(() => {
    if (msActivos !== undefined) {
      setMs(msActivos);
      return;
    }
    if (!cronometro) return;
    setMs(cronometro.leerMsActivos());
    const tic = setInterval(() => setMs(cronometro.leerMsActivos()), REFRESCO_MS);
    return () => clearInterval(tic);
  }, [cronometro, msActivos]);

  if (msActivos === undefined && !cronometro) return null;

  const minutos = Math.floor(ms / 60_000);
  const enPalabras = minutos === 1 ? t.minuteSoFar : fill(t.minutesSoFar, { count: minutos });

  return (
    <p
      className={["text-sm text-muted tabular-nums", className].filter(Boolean).join(" ")}
      // El nombre accesible dice minutos y no segundos: ver la cabecera.
      aria-label={`${t.label}: ${enPalabras}`}
    >
      <span aria-hidden="true">{formatearMmSs(ms)}</span>
    </p>
  );
}

/* -------------------------------------------------------------------------- */

export interface ResumenDeTiempoProps {
  readonly msActivos: number;
  readonly className?: string | undefined;
}

/**
 * «Has estado 7 minutos». Se enseña al TERMINAR, y solo entonces.
 *
 * Aquí sí hay `role="status"`: es un mensaje único, provocado por un acto del
 * alumno (dar la lección por terminada, entregar el examen), y es justo lo que
 * una región de estado existe para anunciar. Nada que ver con unos dígitos que
 * cambian solos sesenta veces por minuto.
 */
export function ResumenDeTiempo({ msActivos, className }: ResumenDeTiempoProps) {
  const locale = useLocale();
  const t = getLearnDictionary(locale).time;
  const minutos = minutosParaElResumen(msActivos);

  return (
    <p role="status" className={["text-sm text-muted", className].filter(Boolean).join(" ")}>
      {minutos === 1 ? t.summaryOne : fill(t.summary, { count: minutos })}
    </p>
  );
}

function fill(plantilla: string, valores: Record<string, string | number>): string {
  return plantilla.replace(/\{(\w+)\}/g, (coincidencia, clave: string) => {
    const valor = valores[clave];
    return valor === undefined ? coincidencia : String(valor);
  });
}
