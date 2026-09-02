"use client";

/**
 * @cet/ui — DailyRhythm: a que hora estudia, una hora por columna.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LA PREGUNTA QUE RESPONDE, Y POR QUE NO LA RESPONDIA NADA
 * ===========================================================================
 * `EffortTrend` dice CUANTO estudia cada dia. Esto dice CUANDO, que es una
 * pregunta distinta y la que un padre hace primero: si su hijo hace los deberes
 * al salir del colegio o a las once y media de la noche, y si son ratos seguidos
 * o picotazos repartidos por toda la tarde. Es lo unico del informe sobre lo que
 * un padre puede actuar esa misma noche.
 *
 * Antes de esto solo existia `hora_pico`: UN numero, la hora con mas eventos. De
 * un numero no sale una forma, y ademas mentia —una hora de trasteo por el menu
 * ganaba a una hora de leccion seguida—. La cabecera de la migracion 0085 lo
 * cuenta entero.
 *
 * ===========================================================================
 * LAS VEINTICUATRO HORAS SIEMPRE, Y EL CERO ES UN DATO
 * ===========================================================================
 * A diferencia de `EffortTrend`, aqui NO hay tres estados: la funcion de base
 * devuelve el reloj completo y las horas sin actividad vienen a cero. Un reloj
 * con huecos no se lee, porque el ojo no puede saber si falta la barra o falta
 * la hora, y una franja de madrugada dibujada como «sin dato» sugeriria que
 * quiza si estudio y no nos enteramos.
 *
 * Por eso las horas a cero llevan ZOCALO MACIZO pegado a la linea base, como los
 * dias a cero de la constancia: dicen «a esa hora no estudio», que es la mitad
 * de la respuesta. Sin ellos las columnas flotarian sueltas y el eje se perderia.
 *
 * ===========================================================================
 * VEINTICUATRO COLUMNAS Y CUATRO ROTULOS
 * ===========================================================================
 * El eje se ancla cada seis horas —medianoche, manana, mediodia, tarde— y los
 * rotulos los pone la aplicacion en las horas que quiera. Veinticuatro numeros
 * debajo de columnas de ocho pixeles no se leen: se emborronan en una franja
 * gris que ademas roba altura al dibujo, que es lo que hay que mirar. Con cuatro
 * anclas se cuenta de seis en seis, que es como se lee un reloj.
 *
 * ===========================================================================
 * UN SOLO COLOR, COMO TODO LO DEMAS DE ESTA CARPETA
 * ===========================================================================
 * `currentColor` en las columnas y la linea base al mismo tono muy atenuada. Una
 * sola serie no codifica identidad y no necesita leyenda; el contraste del
 * dibujo es por construccion el del texto que tiene al lado, ya medido sobre el
 * lavado del panel en claro y en oscuro.
 *
 * ===========================================================================
 * SIN NI UN MINUTO MEDIDO NO SE PINTA NADA
 * ===========================================================================
 * Y este caso ocurre de verdad, no es defensivo: las sesiones anteriores al
 * cronometro de 0080 tienen minutos en el resumen y ni un latido que atribuir a
 * una hora. Veinticuatro columnas planas al lado de una baldosa que dice «44
 * min» seria el informe contradiciendose dentro de la misma pantalla. La
 * condicion la decide `hayRitmoDiario`, que es la misma que consulta el
 * scorecard para saber si monta el panel.
 *
 * ===========================================================================
 * LO QUE OYE QUIEN NO VE EL DIBUJO
 * ===========================================================================
 * Tres cosas, y ninguna depende de contar columnas:
 *
 *   · el resumen, que es el nombre accesible del dibujo y ademas va escrito;
 *   · la LISTA de las horas en las que hubo estudio, oculta a la vista, con la
 *     frase de cada una ya redactada por la aplicacion;
 *   · el `<title>` de cada columna, para quien puede apuntar con el raton.
 *
 * La lista lleva SOLO las horas con estudio. Veinticuatro renglones de los que
 * veinte dicen «no estudio» no son la alternativa al dibujo: son el ruido que el
 * dibujo justamente evita, y quien usa lector de pantalla tendria que
 * atravesarlos uno a uno para llegar a la informacion. Y son frases, no una
 * tabla de dos columnas, porque la aplicacion ya las redacta enteras («De 21:00
 * a 22:00: 18 min») y una tabla obligaria a inventar aqui dos encabezados —texto
 * de cara al usuario dentro del paquete, que es justo lo que AD-7 prohibe.
 *
 * ===========================================================================
 * LOS TEXTOS (AD-7)
 * ===========================================================================
 * Ni una cadena de cara al usuario vive aqui. El resumen, la frase de cada hora
 * y los rotulos del eje llegan redactados: solo la aplicacion sabe de husos, de
 * formato de hora y de idioma.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";
import { hayRitmoDiario, minutosDeLaHora, type HourActivity } from "./scorecard-data.js";

/** Ancho de columna. Veinticuatro caben en un movil de 360 sin escalar. */
const ANCHO = 8;
/** Aire entre columnas. Es el separador; no se dibuja ningun borde. */
const HUECO = 2;
/** Alto util del area de dibujo, de la linea base al maximo del reloj. */
const ALTO = 64;
/** Suelo de una hora CON estudio. Debajo, seis minutos no se verian. */
const MIN_ACTIVO = 6;
/** Zocalo macizo de una hora a cero. Pequeno, pero un dato. */
const TICK_CERO = 2;
/** Franja de los rotulos del eje, debajo de la linea base. */
const BANDA_EJE = 13;

export interface DailyRhythmProps {
  /**
   * Las horas del dia en orden, normalmente las veinticuatro. Se pintan las que
   * lleguen: la funcion de base ya garantiza el reloj completo, y recortarlo
   * aqui a mano seria inventar un eje que no es el de los datos.
   */
  readonly hours: readonly HourActivity[];
  /**
   * La frase que resume la forma del dia, ya contada por quien llama («Suele
   * estudiar de noche»). Este componente no sabe leer un reloj.
   */
  readonly summary: I18nText;
  readonly className?: string | undefined;
}

export function DailyRhythm({ hours, summary, className }: DailyRhythmProps): ReactNode {
  const t = useI18n();
  const id = useId();

  // Ni un minuto atribuido a ninguna hora: no hay reloj. Ver la cabecera.
  if (!hayRitmoDiario(hours)) return null;

  /* La escala sale del propio reloj. Un maximo fijo escondido haria que el
     dibujo se pintara igual pase lo que pase en cuanto todas las horas cayeran
     por debajo de el — que es como una grafica deja de ser una medida. */
  const maximo = Math.max(...hours.map(minutosDeLaHora), 1);

  const width = hours.length * ANCHO + (hours.length - 1) * HUECO;
  const alto = ALTO + BANDA_EJE;
  const texto = t(summary);
  const conEstudio = hours.filter((h) => minutosDeLaHora(h) > 0);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <svg
        width={width}
        height={alto}
        viewBox={`0 0 ${width} ${alto}`}
        role="img"
        aria-labelledby={`${id}-title`}
        // `overflow-visible` por lo mismo que en `EffortTrend`: media unidad de
        // trazo de la primera y la ultima columna cae fuera del viewBox.
        className="block max-w-full overflow-visible"
        preserveAspectRatio="xMinYMax meet"
      >
        <title id={`${id}-title`}>{texto}</title>

        {/* Linea base. Rejilla, no dato: mismo tono, muy atenuada, un pixel.
            Sin ella los zocalos de las horas vacias flotan y dejan de leerse
            como «a esa hora, cero». */}
        <line
          x1={0}
          y1={ALTO - 0.5}
          x2={width}
          y2={ALTO - 0.5}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.35}
        />

        {hours.map((hora, index) => {
          const minutos = minutosDeLaHora(hora);
          const x = index * (ANCHO + HUECO);
          const altura =
            minutos === 0
              ? TICK_CERO
              : // `ALTO - 1` y no `ALTO`: el trazo va centrado en el borde y la
                // columna mas alta perderia medio pixel contra el viewBox.
                Math.max(MIN_ACTIVO, Math.round((minutos / maximo) * (ALTO - 1)));
          const etiqueta = t(hora.label);
          const rotulo = hora.tick ?? "";

          return (
            <g key={hora.hour}>
              <rect
                data-cet-hora={minutos === 0 ? "cero" : "con-minutos"}
                x={x}
                y={ALTO - altura}
                width={ANCHO}
                height={altura}
                // Extremo redondeado arriba; abajo la esquina se come el radio
                // contra la linea base, que es donde tiene que apoyarse.
                rx={2}
                // Siempre MACIZO: aqui no existe el estado «sin dato», asi que
                // no hay nada que distinguir por forma. Ver la cabecera.
                fill="currentColor"
              >
                {etiqueta.length > 0 ? <title>{etiqueta}</title> : null}
              </rect>
              {rotulo.length > 0 ? (
                <text
                  data-cet-rotulo="hora"
                  x={x + ANCHO / 2}
                  y={ALTO + BANDA_EJE - 3}
                  textAnchor="middle"
                  fontSize={9}
                  fill="currentColor"
                  opacity={0.75}
                  // El eje ya se cuenta en el resumen y en la lista de abajo;
                  // deletrear «00 06 12 18» a un lector es ruido sin contexto.
                  aria-hidden="true"
                >
                  {rotulo}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* El resumen escrito. El dibujo ya lo lleva en su `<title>`, asi que para
          el lector iria dos veces; visualmente es el canal que no obliga a
          interpretar una silueta. Tinta heredada y nunca la atenuada: sobre el
          lavado del panel el gris no llega a 4.5:1. */}
      <p aria-hidden="true" className="m-0 text-body-sm font-semibold">
        {texto}
      </p>

      {/* La alternativa al dibujo. Solo las horas con estudio. Ver la cabecera. */}
      <VisuallyHidden as="div">
        <ul data-cet-lista="horas-con-estudio">
          {conEstudio.map((hora) => (
            <li key={hora.hour}>{t(hora.label)}</li>
          ))}
        </ul>
      </VisuallyHidden>
    </div>
  );
}
