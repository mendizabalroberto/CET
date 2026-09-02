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
 * EL LIENZO SE MIDE, NO SE ESCRIBE A MANO
 * ===========================================================================
 * Esto SUSTITUYE al reparto anterior, que fijaba a mano ocho pixeles de columna
 * y dos de hueco. Aquel reparto tenia una virtud —veinticuatro columnas cabian
 * en un movil de 360 sin escalar— y un defecto que se comia la virtud: daba un
 * dibujo de 238 px CLAVADOS. En el panel del portatil, que mide unos 560, el
 * reloj quedaba encogido en el borde izquierdo con la mitad del panel en blanco
 * al lado, que es exactamente el aspecto de «grafica de ejemplo» que un padre no
 * se cree. Y no se arreglaba escalando el SVG: al estirar el lienzo se estira
 * tambien la letra de los rotulos, asi que el mismo dibujo salia con el eje
 * gigante en el portatil e ilegible en el movil.
 *
 * La unica forma de llenar el sitio sin deformar la letra es MEDIR el sitio:
 * `useAnchoDeGrafico` (ver `chart-chrome`) devuelve el ancho real en pixeles y el
 * reloj se dibuja 1:1 sobre el —un pixel del `viewBox` es un pixel de pantalla,
 * sin `preserveAspectRatio` y sin trazos deformados—. Las veinticuatro horas se
 * reparten el ancho medido; el grueso de la columna sale de su carril, con
 * `GRUESO_MAXIMO` de tope (una columna no llena su carril nunca: el aire es lo
 * que separa una hora de la siguiente) y un suelo para que en un movil de 320 las
 * veinticuatro sigan leyendose como columnas y no como una trama.
 *
 * ===========================================================================
 * VEINTICUATRO COLUMNAS Y CUATRO ROTULOS
 * ===========================================================================
 * El eje se ancla cada seis horas —medianoche, manana, mediodia, tarde— y los
 * rotulos los pone la aplicacion en las horas que quiera. Veinticuatro numeros
 * debajo de columnas estrechas no se leen: se emborronan en una franja gris que
 * ademas roba altura al dibujo, que es lo que hay que mirar. Con cuatro anclas se
 * cuenta de seis en seis, que es como se lee un reloj.
 *
 * A cada ancla se le anade ahora una VERTICAL muy atenuada de la linea base
 * arriba. Sin ella, situar una columna en «las seis» obligaba a contar columnas
 * con el dedo desde el rotulo; con ella el ojo cae en el sitio. Es tinta de
 * rejilla —`TINTA_DE_REJILLA` y un pixel—, nunca tinta de dato: si una vertical
 * de referencia pesara como una columna, el dibujo tendria veintiocho barras.
 *
 * La franja de los rotulos va DENTRO del alto del `svg`. Sacarla fuera obligaria
 * al panel a crecer o a poner un scroll anidado, y un scroll dentro de un panel
 * de informe esconde justo la parte que explica el dibujo.
 *
 * ===========================================================================
 * LA ESCALA VERTICAL: OPCIONAL, PERO SI LLEGA, MANDA ELLA
 * ===========================================================================
 * Sin cortes rotulados, el reloj responde «cuando» pero no «cuanto»: la columna
 * mas alta es el maximo del propio reloj y no hay forma de saber si son diez
 * minutos o dos horas. `yTicks` arregla eso, y llega de la aplicacion —con su
 * valor Y su texto— porque el dibujo no sabe que la unidad son minutos ni sabe
 * decirlo en el idioma del tutor; fabricar aqui «30 min» seria el literal de cara
 * al usuario que AD-7 prohibe en este paquete.
 *
 * Cuando hay cortes, el TOPE del eje es el corte mas alto y NO el maximo de los
 * datos. Si mandara el maximo de los datos, la columna mas alta se saldria por
 * encima del ultimo rotulo cada vez que el pico no cayera justo en un corte
 * redondo, y un eje cuyo ultimo rotulo queda por debajo de la barra mas alta no
 * es una escala: es un adorno. Cuando NO hay cortes, todo se comporta como antes
 * —la escala sale del propio reloj— para no romper a quien ya llama sin ellos.
 *
 * Las lineas de la escala son CONTINUAS. El guion ya significa otra cosa en esta
 * casa («esto no es tuyo, es referencia» en `CohortComparison`; «de ese dia no
 * tenemos registro» en `EffortTrend`) y gastar ese canal en la rejilla borraria
 * la distincion justo donde importa.
 *
 * ===========================================================================
 * LA FORMA DE LA MARCA: ARRIBA REDONDA, ABAJO CUADRADA
 * ===========================================================================
 * Antes la columna llevaba `rx` en las cuatro esquinas y confiaba en que la linea
 * base se comiera las de abajo. No se las come: se ve el hueco, y la columna
 * queda FLOTANDO un pelo sobre su propio eje. Ahora la marca se alarga por debajo
 * de la linea base y se recorta contra ella, asi que solo sobrevive el extremo de
 * dato —redondeado `RADIO_DE_DATO`— y el pie apoya cuadrado. El zocalo de una
 * hora a cero apoya cuadrado tambien y sin redondeo ninguno: no es la punta de
 * una medida, es el suelo.
 *
 * ===========================================================================
 * UN SOLO COLOR, COMO TODO LO DEMAS DE ESTA CARPETA
 * ===========================================================================
 * `currentColor` en las columnas y la linea base al mismo tono muy atenuada. Una
 * sola serie no codifica identidad y no necesita leyenda; el contraste del
 * dibujo es por construccion el del texto que tiene al lado, ya medido sobre el
 * lavado del panel en claro y en oscuro. Tampoco la hora resaltada se dice con un
 * tono: se dice con un CARRIL que aparece detras de ella —una forma que antes no
 * estaba—, porque un cambio de color no lo ve quien no distingue colores.
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
 *   · el `<title>` de cada hora, para quien puede apuntar con el raton.
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
 * EL DETALLE NO PUEDE VIVIR SOLO EN EL RATON
 * ===========================================================================
 * El `<title>` del navegador tarda medio segundo, no se puede estilar y —lo que
 * de verdad importa— NO APARECE CON EL TECLADO: quien navega con tabulador se
 * quedaba sin la capa de detalle entera. Ahora cada hora lleva encima un blanco
 * transparente alcanzable con `tabIndex`, con la frase de esa hora como nombre
 * accesible, y el raton y el foco abren EL MISMO aviso (`useAviso`). El `<title>`
 * se queda: quitarlo no arregla nada y hay quien ya lo espera.
 *
 * El blanco mide al menos `ALCANCE` de ancho —el minimo de la casa para un dedo—
 * aunque el carril de la hora sea mas estrecho, que con veinticuatro columnas lo
 * es casi siempre. Los blancos se solapan, y en un solape gana el ultimo pintado:
 * cada hora conserva entero su carril y estira el alcance hacia la izquierda, que
 * es preferible a un blanco exacto de once pixeles que nadie acierta.
 *
 * Y sigue siendo una capa de MEJORA: el resumen escrito y la lista oculta no
 * dependen de ella. Un valor que solo existe al posar el raton es un valor que no
 * existe para media plantilla.
 *
 * ===========================================================================
 * UN SOLO NUMERO SOBRE EL DIBUJO, Y SOLO SI LO ESCRIBE LA APLICACION
 * ===========================================================================
 * `peakText` rotula la cifra de la hora PICO sobre su cap, y nada mas. Rotular
 * las veinticuatro convertiria el dibujo en una tabla mal maquetada —si hay que
 * leer los numeros, la forma sobra— y no rotular ninguna deja al lector
 * calculando contra la rejilla el unico dato que de verdad se lleva a casa. La
 * cifra la escribe la aplicacion (AD-7); si no llega, no se inventa.
 *
 * ===========================================================================
 * LOS TEXTOS (AD-7)
 * ===========================================================================
 * Ni una cadena de cara al usuario vive aqui. El resumen, la frase de cada hora,
 * los rotulos del eje, los de la escala y la cifra del pico llegan redactados:
 * solo la aplicacion sabe de husos, de formato de hora, de unidades y de idioma.
 */

import { useId, type ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import { VisuallyHidden } from "../a11y/VisuallyHidden.js";
import {
  ALCANCE,
  Aviso,
  GRUESO_MAXIMO,
  RADIO_DE_DATO,
  TINTA_DE_REJILLA,
  useAnchoDeGrafico,
  useAviso,
} from "./chart-chrome.js";
import {
  cortesUtiles,
  hayRitmoDiario,
  minutosDeLaHora,
  type AxisTick,
  type HourActivity,
} from "./scorecard-data.js";

/**
 * Alto util del area de dibujo, de la linea base al tope de la escala.
 *
 * ES UNA PROPORCION Y NO UN NUMERO, por lo mismo que en `EffortTrend`: con el
 * alto clavado en 72 px, el reloj llenaba el ancho del panel y seguia teniendo
 * la proporcion de una linea de firma —ocho a uno—, y en esa franja aplastada la
 * tarde larga y el picotazo de las once dibujan casi la misma silueta, que es
 * justo la distincion que este dibujo existe para enseñar.
 *
 * Un poco mas bajo que la constancia (0.26 contra 0.30) a proposito: el reloj
 * tiene veinticuatro columnas contra siete o catorce, asi que a igual alto se
 * lee mas denso, y ademas los dos dibujos van uno encima del otro en el mismo
 * panel —dos rectangulos identicos seguidos se leen como el mismo dibujo
 * repetido—. Los topes, los mismos: 96 para que tenga forma en un movil, 200
 * para que la frase de debajo no se caiga fuera de la pantalla.
 */
function altoDelPlano(ancho: number): number {
  return Math.round(Math.max(96, Math.min(200, ancho * 0.26)));
}
/** Suelo de una hora CON estudio. Debajo, seis minutos no se verian. */
const MIN_ACTIVO = 6;
/** Zocalo macizo de una hora a cero. Pequeno, pero un dato. */
const TICK_CERO = 2;
/** Franja de los rotulos del eje horizontal, debajo de la linea base. */
const BANDA_EJE = 16;
/** Aire sobre la columna mas alta. Sin el, el cap redondeado se recorta. */
const AIRE_ARRIBA = 6;
/** Aire de arriba cuando hay cifra de pico: la letra tiene que caber entera. */
const AIRE_CON_PICO = 18;
/**
 * Grueso minimo de una columna. Por debajo de cuatro pixeles veinticuatro
 * columnas dejan de leerse como columnas y se leen como una trama de rayas.
 */
const GRUESO_MINIMO = 4;
/**
 * Canal izquierdo para los rotulos de la escala, y solo si hay escala. Cabe
 * «120 min» a nueve pixeles de cuerpo; mas ancho le quitaria sitio al reloj, que
 * es el dibujo. Sin `yTicks` el canal es cero y el reloj usa todo el ancho.
 */
const CANAL_DE_ESCALA = 40;
/**
 * Tinta de las verticales de ancla. Aun mas atenuada que la rejilla horizontal:
 * cruzan el area de las columnas de arriba abajo y a la tinta de rejilla plena
 * competirian con las propias barras.
 */
const TINTA_DE_ANCLA = 0.16;

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
  /**
   * Los cortes rotulados del eje vertical, de la aplicacion (ver `AxisTick`).
   * Si llegan, el TOPE de la escala es el corte mas alto —no el maximo de los
   * datos— y cada corte pinta su linea continua y su rotulo en el canal
   * izquierdo. Si no llegan, la escala sale del propio reloj y no se rotula
   * nada: es lo que hacia este dibujo antes de tenerlos, y lo que siguen viendo
   * quienes llaman sin ellos.
   */
  readonly yTicks?: readonly AxisTick[] | undefined;
  /**
   * La cifra de la hora pico, ya escrita con su unidad («30 min»). Se rotula
   * sobre esa unica columna. Si no llega, no se rotula ninguna: el dibujo no
   * fabrica texto de cara al usuario (AD-7).
   */
  readonly peakText?: string | undefined;
  readonly className?: string | undefined;
}

export function DailyRhythm({
  hours,
  summary,
  yTicks,
  peakText,
  className,
}: DailyRhythmProps): ReactNode {
  const t = useI18n();
  const id = useId();
  // React devuelve identificadores con dos puntos (":r1:"). Sirven de sobra para
  // `aria-labelledby`, pero un `url(#...)` con dos puntos es un campo de minas
  // entre navegadores, asi que la referencia del recorte va sin ellos.
  const idDeRecorte = `recorte-${id.replace(/:/g, "")}`;
  const [contenedor, ancho] = useAnchoDeGrafico();
  const { aviso, mostrar, ocultar } = useAviso();

  // Ni un minuto atribuido a ninguna hora: no hay reloj. Ver la cabecera.
  if (!hayRitmoDiario(hours)) return null;

  const cortes = cortesUtiles(yTicks);
  const maximoDelReloj = Math.max(...hours.map(minutosDeLaHora), 1);
  const ultimoCorte = cortes[cortes.length - 1];
  /* Con escala rotulada manda el corte mas alto; sin ella, el propio reloj. Un
     maximo fijo escondido haria que el dibujo se pintara igual pase lo que pase
     en cuanto todas las horas cayeran por debajo de el — que es como una grafica
     deja de ser una medida. */
  const tope =
    ultimoCorte === undefined ? maximoDelReloj : Math.max(ultimoCorte.value, maximoDelReloj);

  // El alto sale del ancho medido, igual que todo lo demas. Ver `altoDelPlano`.
  const ALTO = altoDelPlano(ancho);

  const canal = cortes.length > 0 ? CANAL_DE_ESCALA : 0;
  const arriba = peakText === undefined ? AIRE_ARRIBA : AIRE_CON_PICO;
  const base = arriba + ALTO;
  const alto = base + BANDA_EJE;

  // El reparto del ancho medido. `banda` es el carril de una hora; la columna
  // vive dentro de el con aire a los lados, nunca pegada a la vecina.
  const banda = Math.max(1, (ancho - canal) / hours.length);
  const hueco = Math.min(6, Math.max(1, banda * 0.22));
  const grueso = Math.max(GRUESO_MINIMO, Math.min(GRUESO_MAXIMO, banda - hueco));
  const anchoDelBlanco = Math.max(banda, ALCANCE);
  const centroDe = (indice: number): number => canal + banda * (indice + 0.5);

  // `ALTO - 1` y no `ALTO`: el trazo de la linea base va centrado en el borde y
  // la columna mas alta perderia medio pixel contra el.
  const alturaDe = (minutos: number): number =>
    minutos === 0
      ? TICK_CERO
      : Math.min(ALTO - 1, Math.max(MIN_ACTIVO, Math.round((minutos / tope) * (ALTO - 1))));

  const texto = t(summary);
  const conEstudio = hours.filter((h) => minutosDeLaHora(h) > 0);
  // El pico es el primero de los maximos: con dos horas empatadas, rotular las
  // dos duplicaria la cifra y rotular la segunda no tendria ninguna razon.
  const indicePico = hours.reduce(
    (mejor, hora, i) => (minutosDeLaHora(hora) > minutosDeLaHora(hours[mejor]!) ? i : mejor),
    0,
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div ref={contenedor} className="relative w-full">
        <svg
          width={ancho}
          height={alto}
          viewBox={`0 0 ${ancho} ${alto}`}
          role="img"
          aria-labelledby={`${id}-title`}
          // `overflow-visible` por lo mismo que en `EffortTrend`: medio trazo de
          // la linea base y del foco cae fuera del viewBox.
          className="block overflow-visible"
        >
          <title id={`${id}-title`}>{texto}</title>

          {/* El area de columnas. Recorta el pie de las marcas contra la linea
              base para que el extremo de dato quede redondo y el pie cuadrado
              sin tener que dibujar un `path` por columna. */}
          <clipPath id={idDeRecorte}>
            <rect x={0} y={0} width={Math.max(ancho, 1)} height={base} />
          </clipPath>

          {/* La escala. Lineas CONTINUAS y rotulo en el canal: ver la cabecera. */}
          {cortes.map((corte) => {
            const y = base - (corte.value / tope) * (ALTO - 1);
            return (
              <g key={corte.value}>
                <line
                  data-cet-rejilla="valor"
                  x1={canal}
                  y1={y}
                  x2={ancho}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={1}
                  opacity={TINTA_DE_REJILLA}
                />
                <text
                  data-cet-rotulo="valor"
                  x={canal - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={9}
                  fill="currentColor"
                  opacity={0.75}
                  // La escala ya se cuenta en el resumen escrito y en la frase de
                  // cada hora; deletrearla a un lector es ruido sin contexto.
                  aria-hidden="true"
                >
                  {corte.text}
                </text>
              </g>
            );
          })}

          {/* Linea base. Rejilla, no dato: mismo tono, un pixel, continua.
              Sin ella los zocalos de las horas vacias flotan y dejan de leerse
              como «a esa hora, cero».

              VA MAS MARCADA QUE LA REJILLA HORIZONTAL (0.5 contra
              `TINTA_DE_REJILLA`) y NO es una preferencia: a 0.35 no se veia
              entre los zocalos, y veinticuatro zocalos macizos separados por sus
              huecos dibujan exactamente el patron de una LINEA DISCONTINUA. En
              esta casa el guion significa «de esto no tenemos registro»
              (`EffortTrend`) y «esto es la referencia, no es tuyo»
              (`CohortComparison`), asi que un eje que parece discontinuo le dice
              al padre que las horas vacias son huecos de medicion cuando son
              ceros medidos — justo la confusion que este dibujo existe para no
              tener—. Con la base continua y visible, los zocalos dejan de ser
              guiones y pasan a ser lo que son: engrosamientos apoyados en el eje. */}
          <line
            x1={canal}
            y1={base - 0.5}
            x2={ancho}
            y2={base - 0.5}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.5}
          />

          {/* El carril de la hora senalada. Es una FORMA que aparece, no un tono
              que cambia: quien no distingue colores tambien la ve. */}
          {hours.map((hora, index) =>
            // Se compara la POSICION y no la frase: dos horas pueden traer el
            // mismo texto («no estudio») y se encenderian las dos a la vez.
            aviso !== null && aviso.x === centroDe(index) ? (
              <rect
                key={`carril-${hora.hour}`}
                data-cet-carril="hora"
                x={centroDe(index) - banda / 2}
                y={arriba}
                width={banda}
                height={ALTO}
                fill="currentColor"
                opacity={0.1}
              />
            ) : null,
          )}

          <g clipPath={`url(#${idDeRecorte})`}>
            {hours.map((hora, index) => {
              const minutos = minutosDeLaHora(hora);
              const altura = alturaDe(minutos);
              return (
                <rect
                  key={hora.hour}
                  data-cet-hora={minutos === 0 ? "cero" : "con-minutos"}
                  // EL ZOCALO DEL CERO OCUPA SU CARRIL ENTERO, la columna con
                  // minutos no. No es un capricho de milimetro: con el zocalo
                  // estrechado al grueso de columna, veinticuatro ceros
                  // separados por sus huecos dibujan el patron exacto de una
                  // LINEA DISCONTINUA a lo largo del eje, y en esta casa el
                  // guion ya significa «de esto no tenemos registro»
                  // (`EffortTrend`) y «esto es referencia, no es tuyo»
                  // (`CohortComparison`). Un eje que parece discontinuo le dice
                  // al padre que las horas vacias son huecos de medicion cuando
                  // son ceros MEDIDOS — justo la confusion que la cabecera de
                  // este fichero existe para no tener. Ocupando el carril, los
                  // ceros contiguos se tocan y forman una regla continua: se
                  // sigue leyendo «a esa hora, cero», y ya no se lee «falta».
                  x={centroDe(index) - (minutos === 0 ? banda : grueso) / 2}
                  y={base - altura}
                  width={minutos === 0 ? banda : grueso}
                  // La marca se alarga por debajo de la linea base y el recorte
                  // se come el pie: arriba queda el cap redondo, abajo el apoyo
                  // cuadrado. El zocalo del cero no se alarga porque no lleva
                  // redondeo ninguno.
                  height={minutos === 0 ? altura : altura + RADIO_DE_DATO}
                  rx={minutos === 0 ? 0 : RADIO_DE_DATO}
                  // Siempre MACIZO: aqui no existe el estado «sin dato», asi que
                  // no hay nada que distinguir por forma. Ver la cabecera.
                  fill="currentColor"
                >
                  {t(hora.label).length > 0 ? <title>{t(hora.label)}</title> : null}
                </rect>
              );
            })}
          </g>

          {/* La cifra del pico, si la escribe la aplicacion. Una sola. */}
          {peakText === undefined ? null : (
            <text
              data-cet-pico="valor"
              x={centroDe(indicePico)}
              y={base - alturaDe(minutosDeLaHora(hours[indicePico]!)) - 6}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="currentColor"
              // La cifra ya viaja dentro de la frase de esa hora, que es el
              // nombre accesible de su blanco. Decirla aqui la diria dos veces.
              aria-hidden="true"
            >
              {peakText}
            </text>
          )}

          {hours.map((hora, index) => {
            const rotulo = hora.tick ?? "";
            if (rotulo.length === 0) return null;
            const x = centroDe(index);
            return (
              <g key={`ancla-${hora.hour}`}>
                {/* La vertical del ancla: rejilla, jamas dato. Ver la cabecera. */}
                <line
                  data-cet-ancla="hora"
                  x1={x}
                  y1={arriba}
                  x2={x}
                  y2={base}
                  stroke="currentColor"
                  strokeWidth={1}
                  opacity={TINTA_DE_ANCLA}
                />
                <text
                  data-cet-rotulo="hora"
                  x={x}
                  y={base + BANDA_EJE - 4}
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
              </g>
            );
          })}

          {/* Los blancos. Van los ultimos para quedar por encima de todo lo
              demas, y son transparentes: se apunta a la HORA, no a la columna. */}
          {hours.map((hora, index) => {
            const etiqueta = t(hora.label);
            const dato = {
              x: centroDe(index),
              y: base - alturaDe(minutosDeLaHora(hora)),
              texto: etiqueta,
            };
            return (
              <rect
                key={`blanco-${hora.hour}`}
                data-cet-blanco="hora"
                x={centroDe(index) - anchoDelBlanco / 2}
                y={0}
                width={anchoDelBlanco}
                height={alto}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={etiqueta}
                onPointerEnter={() => mostrar(dato)}
                onPointerLeave={ocultar}
                onFocus={() => mostrar(dato)}
                onBlur={ocultar}
              />
            );
          })}
        </svg>

        <Aviso dato={aviso} ancho={ancho} />
      </div>

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
