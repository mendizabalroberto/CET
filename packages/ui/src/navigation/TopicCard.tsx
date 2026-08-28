"use client";

/**
 * @cet/ui — la tarjeta de un tema de practica.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * ES LA MISMA TARJETA QUE `SubjectCard`, CON OTRA COSA DENTRO
 * ===========================================================================
 * La caja —area pulsable, radio, borde, rail, sombra y elevacion— NO se escribe
 * aqui: se importa de `card-chrome.ts`, que es la unica definicion del producto.
 * Cuando cada pantalla llevaba su lista de clases a mano, `/learn` y `/practice`
 * divergieron sin que ningun test lo viera. Lo que cambia entre las dos tarjetas
 * es el CONTENIDO: alli lecciones terminadas, aqui nivel, evidencia y siguiente
 * paso.
 *
 * ===========================================================================
 * POR QUE EL ENLACE ENVUELVE LA TARJETA ENTERA
 * ===========================================================================
 * El motivo largo esta en la cabecera de `SubjectCard` y vale igual aqui: con un
 * `<div>` y un enlace en el titulo, el objetivo pulsable pasa a ser el renglon
 * del nombre —unos 18 px— donde la casa exige `--cet-touch-min` (44 px), y en la
 * tableta de un nino de once anos eso se reporta como "no va bien", nunca como
 * un bug. Envolviendo, el nombre accesible del enlace es su contenido: el tema y
 * como va, y no un "practicar" que suena identico diez veces en la lista de
 * enlaces del lector.
 *
 * ===========================================================================
 * LA SILUETA DICE EL TEMA; EL COLOR, LA MATERIA
 * ===========================================================================
 * Las diez tarjetas de `/practice` son de la misma materia, asi que comparten
 * rail, medallon y lavado: el color es refuerzo de "esto es Matematicas" y nunca
 * distintivo del tema. Lo unico que distingue "Simplificar" de "Comparar" sin
 * leer es la silueta de `TopicIcon`, y ademas el nombre va siempre escrito al
 * lado. Sobre el relleno del medallon solo va `--cet-ink-inverse` y sobre el
 * lavado solo va `--cet-ink`: son los dos unicos pares medidos.
 *
 * ===========================================================================
 * SOBRE EL LAVADO NO VA TEXTO ATENUADO
 * ===========================================================================
 * `--cet-ink-muted` sobre `--cet-materia-*-suave` mide de 4.45:1 a 4.51:1 y no
 * llega al 4.5 de WCAG 1.4.3 en tres de los siete tonos. Por eso la pista y la
 * evidencia van en la tinta normal, que es la que hereda la caja. Es la razon
 * por la que la parrilla de practica no tenia lavado hasta hoy: no era el lavado
 * lo que estorbaba, era el gris de encima.
 *
 * ===========================================================================
 * ARRIBA QUIEN ES; ABAJO COMO VA. EL NOMBRE NO COMPARTE FILA CON NADA
 * ===========================================================================
 * Esta tarjeta se rehizo el 28 de agosto de 2026 (obs003). La escalera vivia en
 * la cabecera, pegada al nombre con `ms-auto shrink-0`, y en produccion se leyo
 * asi: «Comparar» y «Lo llevas bien» pintados uno encima del otro; «Impropias
 * mixtas» partido en dos con el indicador incrustado en medio; «x / 10, 100,
 * 1.000» ocupando tres lineas con «Dominado» flotando al lado.
 *
 * No era falta de anchura: era que el titulo tenia un vecino que no cede sitio.
 * Un `min-w-0` mas o un `truncate` habrian escondido el sintoma hasta el
 * siguiente nombre largo. La cabecera es hoy medallon y nombre, y nada mas.
 *
 * El orden es el de `SubjectCard` en /learn, que es la pantalla hermana: quien
 * es el tema, la pista, y al pie el bloque que habla de progreso —escalera con
 * su palabra y la cifra que la sostiene— seguido de que hacer ahora.
 *
 * `mt-auto` en la primera fila del pie es lo que iguala el alto: la rejilla
 * estira las tarjetas a la mas alta de la fila, y sin el empujon el contenido se
 * queda arriba dejando el hueco colgando debajo del texto. Con el, el hueco cae
 * en medio y los pies se alinean.
 *
 * Y un lenguaje visual, no tres. Los circulos del `EffortMeter` se fueron: eran
 * un tercer dibujo —tras la escalera y las frases— para el dato que la frase de
 * al lado ya daba en palabras. `EffortMeter` sigue vivo y con sus pruebas en su
 * fichero; lo que se retiro es su uso aqui.
 *
 * `apps/web/.../densidad-de-indicadores.test.tsx` cuenta como indicador toda
 * fila cuya pinta cambia con el progreso, y el tope es tres. Aqui son dos —el
 * pie entero: nivel y siguiente paso—; cabecera y pista no cambian nunca. Una
 * fila mas que dependa del avance pone rojo aquel fichero, y la respuesta
 * correcta es quitar una, no subir el tope.
 *
 * ===========================================================================
 * LA TELEMETRIA VIVE CON EL COMPONENTE
 * ===========================================================================
 * El `data-cet-id` es fijo y lo declara la tarjeta, no la aplicacion por prop.
 * Es el patron de la casa —`QuestionNavigator`, `HintPanel`, `AnswerKeypad`
 * hacen lo mismo— y el motivo esta en la cabecera de `UiInteractionScope`: un
 * `data-cet-id` es la declaracion de "esto lo queremos medir, y se va a llamar
 * asi aunque cambie de sitio, de color y de idioma". Esa decision pertenece al
 * control que se pulsa, no a cada pantalla que lo monta; dejarla en una prop
 * seria admitir que la misma tarjeta se llame de dos maneras en dos sitios y
 * que la serie historica se parta sin que nadie lo vea.
 *
 * Va en el PROPIO `<a>` y no en un envoltorio: el recolector resuelve el
 * control con `closest("[data-cet-id]")`, asi que un identificador colgado del
 * `<li>` mediria tambien lo que caiga al lado del enlace.
 *
 * `trackedValue` sale aparte y NO se deriva de `topic` ni del `href`. Lo que la
 * analitica lleva guardando es la clave del GENERADOR (`math.compare`), y
 * `topic` es la clave de la SILUETA: hoy coinciden en casi todos, y el dia que
 * dejen de coincidir —un generador nuevo que cae en la silueta neutra— fundir
 * las dos falsearia hacia atras una serie que ya existe. Sin valor no se
 * escribe el atributo: mejor un evento sin `value` que uno con un valor que la
 * analitica no sabe interpretar.
 *
 * ===========================================================================
 * LOS TEXTOS (AD-7)
 * ===========================================================================
 * Ni un literal de cara al usuario vive en el paquete. `name` y `hint` llegan ya
 * resueltos por la aplicacion; el resto entra como `I18nText` y se resuelve con
 * `useI18n()`. Si la aplicacion no pasa uno, `t()` devuelve cadena vacia y la
 * fila NO se pinta: un hueco vacio es peor que la ausencia.
 */

import type { CSSProperties, ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import type { MasteryLevel } from "../data/mastery-level.js";
import { MasteryLadder } from "../progress/MasteryLadder.js";

import { CARD_CHROME, MEDALLION_CHROME, cardSkin, medallionSkin } from "./card-chrome.js";
import { TopicIcon } from "./TopicIcon.js";
import { topicIdentity } from "./topic-identity.js";
import { subjectIdentity } from "./subject-identity.js";

export interface TopicCardProps {
  /** Clave de silueta: `simplify` ... `mix`. Una desconocida cae en la neutra. */
  readonly topic: string;
  /** Materia a la que pertenece el tema: da rail, medallon y lavado. */
  readonly subjectCode: string;
  /** Nombre del tema, ya resuelto al idioma por la aplicacion. */
  readonly name: string;
  /** La pista corta, ya resuelta. */
  readonly hint: string;
  /** Destino, ya construido por la aplicacion. */
  readonly href: string;
  /** Nivel derivado de datos reales. `null` = sin evidencia: no se pinta escalera. */
  readonly level: MasteryLevel | null;
  /** Nombre del grupo para el texto accesible de la escalera. */
  readonly groupLabel: I18nText;
  /** "10 preguntas respondidas" / "Sin practicar todavia". */
  readonly evidenceText?: I18nText | undefined;
  /** La frase del siguiente paso. */
  readonly nextStepText?: I18nText | undefined;
  /**
   * Valor del evento de telemetria: la clave del GENERADOR (`math.compare`),
   * que es la que la analitica ya guarda. No es `topic`, que es la clave de la
   * silueta. Ausente = no se escribe el atributo.
   */
  readonly trackedValue?: string | undefined;
  readonly className?: string | undefined;
}

/**
 * Tarjeta de tema: medallon con la silueta, nombre, escalera de nivel, pista,
 * evidencia y siguiente paso.
 *
 * Presentacional pura. No sabe de rutas ni de base de datos, no tiene estado ni
 * manejadores: quien navega es el navegador con un enlace, que ademas es lo
 * unico que se abre en otra pestana y se recorre con el tabulador.
 */
export function TopicCard({
  topic,
  subjectCode,
  name,
  hint,
  href,
  level,
  groupLabel,
  evidenceText,
  nextStepText,
  trackedValue,
  className,
}: TopicCardProps): ReactNode {
  const t = useI18n();
  const identity = subjectIdentity(subjectCode);

  /* Los dos colores del cuerpo salen de la identidad de la MATERIA; ninguno se
     escribe a mano y ningun hexadecimal vive en este fichero. */
  const skin: CSSProperties = cardSkin(identity);

  const evidence = t(evidenceText);
  const nextStep = t(nextStepText);

  /* Cual de las dos filas del pie lleva el `mt-auto`. Es la PRIMERA que se
     monte: si el empujon lo llevara siempre `nivel` y ese tema no tuviera ni
     nivel ni cifra —el caso de «Unidades metricas»—, la frase se quedaria
     pegada a la pista y esa tarjeta volveria a desalinearse con sus vecinas. */
  const alPie: "nivel" | "siguiente" | null =
    level !== null || evidence.length > 0 ? "nivel" : nextStep.length > 0 ? "siguiente" : null;

  return (
    <a
      href={href}
      data-cet-id="practica.elegir-tema"
      data-cet-value={trackedValue}
      data-topic={topicIdentity(topic)}
      data-subject={identity.code}
      className={cn(CARD_CHROME, className)}
      style={skin}
    >
      {/* Fila 1: QUIEN es el tema. Y solo eso: el nombre no comparte fila con
          nada. Ver la cabecera del fichero. */}
      <span data-cet-fila="cabecera" className="flex items-center gap-3">
        <span className={MEDALLION_CHROME} style={medallionSkin(identity)}>
          <TopicIcon code={topic} />
        </span>
        {/* `text-body-lg` y no un tamano a pelo: la escala vive en el preset,
            que es donde se cambia una vez para todo el producto. */}
        <span className="min-w-0 flex-1 text-body-lg font-bold leading-tight">{name}</span>
      </span>

      {/* Fila 2: la pista. No cambia con el progreso, y por eso no gasta cupo
          de indicador. Tinta normal: ver la cabecera. */}
      <span data-cet-fila="pista" className="text-body-sm">
        {hint}
      </span>

      {/* Fila 3: COMO va. La escalera con su palabra y la cifra de la que sale
          — el mismo sitio y el mismo orden que las cifras de `SubjectCard` en
          /learn, que es la pantalla hermana.

          `mt-auto` es lo que iguala el alto de las tarjetas de una misma fila:
          la rejilla las estira a la mas alta, y sin esto el contenido se queda
          arriba dejando el hueco colgando (se veia en «Unidades metricas»). Con
          el, el hueco cae en medio y el pie de todas las tarjetas se alinea.

          Sin nivel no hay escalera. No existe un "nivel cero": cuatro peldanos
          vacios le dirian a quien no ha empezado que va mal. */}
      {level !== null || evidence.length > 0 ? (
        <span
          data-cet-fila="nivel"
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm",
            alPie === "nivel" ? "mt-auto" : undefined,
          )}
        >
          {level === null ? null : (
            <MasteryLadder level={level} groupLabel={groupLabel} size="sm" showLabel />
          )}
          {/* SIN separador `·`, y a proposito, aunque /learn lo use.
              Alli separa dos cifras cortas que caben en un renglon. Aqui los dos
              trozos —«Dominado» y «10 preguntas respondidas»— no caben en el
              ancho de la tarjeta, asi que la fila envuelve y el punto se quedaba
              colgando al final de la primera linea separando el vacio. Un
              separador que no cae entre las dos cosas no separa: estorba.
              La envoltura ya hace el trabajo, y la escalera marca donde empieza
              el nivel. */}
          {evidence.length > 0 ? <span>{evidence}</span> : null}
        </span>
      ) : null}

      {/* Fila 4: que hacer ahora, escrito. Ya dominado tambien habla —«Pasate de
          vez en cuando»—: dejar muda la tarjeta haria que el unico tema que el
          alumno domina fuese el que menos le dice. */}
      {nextStep.length > 0 ? (
        <span
          data-cet-fila="siguiente"
          className={cn(
            "text-body-sm font-semibold",
            alPie === "siguiente" ? "mt-auto" : undefined,
          )}
        >
          {nextStep}
        </span>
      ) : null}
    </a>
  );
}
