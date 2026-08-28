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
 * TRES FILAS QUE HABLAN DE PROGRESO, Y NI UNA MAS
 * ===========================================================================
 * `apps/web/.../densidad-de-indicadores.test.tsx` cuenta como indicador toda
 * fila de la tarjeta cuya pinta cambia con el progreso, y el tope es tres. Aqui
 * son exactamente esas tres —cabecera con la escalera, evidencia y siguiente
 * paso—; la pista no cambia nunca y por eso no gasta cupo. Una cuarta fila que
 * dependa del avance pone rojo aquel fichero, y la respuesta correcta es quitar
 * una, no subir el tope.
 *
 * Y el numero de filas no puede bailar entre estados de progreso: el siguiente
 * paso es SIEMPRE una fila, se dibuje con los circulos del `EffortMeter`
 * mientras queda objetivo o se escriba como frase cuando ya no queda.
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
 * fila NO se pinta: un hueco vacio es peor que la ausencia, y un medidor de
 * esfuerzo sin su frase seria justo el dibujo decorativo que este repositorio
 * persigue.
 */

import type { CSSProperties, ReactNode } from "react";
import type { I18nText } from "@cet/shared";

import { cn } from "../lib/cn.js";
import { useI18n } from "../lib/i18n.js";
import type { MasteryLevel } from "../data/mastery-level.js";
import { EffortMeter } from "../progress/EffortMeter.js";
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
  /** Circulos del `EffortMeter`. 0 o ausente = ninguno. */
  readonly targets?: number | undefined;
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
  targets,
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

  /* `targets` llega de un calculo de la aplicacion: se sanea antes de decidir
     con el. Un decimal o un negativo no pueden convertirse en una fila. */
  const pending = Number.isFinite(targets) ? Math.trunc(targets ?? 0) : 0;

  /* El medidor solo se monta si ADEMAS hay frase: `EffortMeter` escribe el
     mensaje al lado de los circulos y lo usa como su texto accesible, asi que
     sin el serian un dibujo que no dice nada. */
  const showMeter = pending > 0 && nextStepText !== undefined && nextStep.length > 0;

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
      {/* Fila 1: quien es el tema y como va. El orden importa porque es el
          nombre accesible del enlace. */}
      <span data-cet-fila="cabecera" className="flex items-center gap-3">
        <span className={MEDALLION_CHROME} style={medallionSkin(identity)}>
          <TopicIcon code={topic} />
        </span>
        {/* `text-body-lg` y no un tamano a pelo: la escala vive en el preset,
            que es donde se cambia una vez para todo el producto. */}
        <span className="min-w-0 flex-1 text-body-lg font-bold leading-tight">{name}</span>
        {/* Sin nivel no hay escalera. No existe un "nivel cero": cuatro peldanos
            vacios le dirian a quien no ha empezado que va mal. */}
        {level === null ? null : (
          <MasteryLadder
            level={level}
            groupLabel={groupLabel}
            size="sm"
            showLabel
            className="ms-auto shrink-0"
          />
        )}
      </span>

      {/* Fila 2: la pista. No cambia con el progreso, y por eso no gasta cupo
          de indicador. Tinta normal: ver la cabecera. */}
      <span data-cet-fila="pista" className="text-body-sm">
        {hint}
      </span>

      {/* Fila 3: la cifra de la que sale todo lo demas. Sin ella el nivel es un
          oraculo; con ella el alumno puede comprobarlo. */}
      {evidence.length > 0 ? (
        <span data-cet-fila="evidencia" className="text-body-sm">
          {evidence}
        </span>
      ) : null}

      {/* Fila 4: el siguiente paso, dibujado o escrito, pero siempre UNA fila.
          Ya dominado, `EffortMeter` no pinta cero circulos —cero no es
          ausencia— y dejar muda la tarjeta haria que el unico tema que el
          alumno domina fuese el que menos le dice. */}
      {/* `EffortMeter` no acepta atributos sueltos, asi que esta fila se
          reconoce por su dibujo y no por un `data-`; el rotulo va en la otra
          rama, que si es marcado de esta tarjeta. */}
      {showMeter ? (
        <EffortMeter targets={pending} message={nextStepText} />
      ) : nextStep.length > 0 ? (
        <span data-cet-fila="siguiente" className="text-body-sm font-semibold">
          {nextStep}
        </span>
      ) : null}
    </a>
  );
}
