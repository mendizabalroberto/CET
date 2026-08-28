/**
 * @cet/ui — el registro de iconos.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * ESTE ES EL UNICO FICHERO DEL MONOREPO QUE IMPORTA `lucide-react`
 * ===========================================================================
 * No es una regla de estilo, es la razon de que este fichero exista. Sin el,
 * cada pantalla importaria del catalogo por su cuenta —unos cuarenta sitios—,
 * nadie controlaria que icono elige cada una, y retirar o cambiar la libreria
 * seria tocar los cuarenta. Con el, es tocar este.
 *
 * Hay un test que lo vigila: `iconos.test.tsx` falla si aparece un
 * `from "lucide-react"` en cualquier otro sitio.
 *
 * ===========================================================================
 * LOS NOMBRES SON DEL PRODUCTO, NO DEL CATALOGO
 * ===========================================================================
 * `pista`, no `Lightbulb`. El dia que la pista deje de ser una bombilla y pase
 * a ser una lupa, el cambio ocurre en esta linea y en ninguna pantalla. Un
 * componente que pide `icon="Lightbulb"` esta acoplado a una decision de
 * dibujo; uno que pide `icon="pista"` esta acoplado a una decision de producto,
 * que es la que de verdad se toma.
 *
 * ===========================================================================
 * POR QUE ESTOS Y NO OTROS
 * ===========================================================================
 * El publico son ninos de unos once anos, y un icono mal elegido a esa edad no
 * es un adorno feo: es un jeroglifico. Las tres reglas que decidieron la tabla:
 *
 *  1. **El icono nunca va solo.** Siempre acompana al texto del boton. Quien no
 *     reconozca el dibujo lee la palabra y no pierde nada; quien lo reconozca
 *     llega antes. Es la misma regla que ya imponen `color-unico-canal` y
 *     `estados-no-solo-color`: ninguna senal viaja sola.
 *  2. **Dos acciones hermanas no comparten dibujo.** «Comprobar» y «Siguiente
 *     pregunta» viven en el MISMO boton, que cambia de texto al responder: si
 *     los dos fuesen una marca de verificacion, el boton diria «he acertado»
 *     cuando solo quiere decir «sigue». Por eso uno es `Check` y el otro una
 *     flecha. Lo mismo con la pista y la solucion: bombilla frente a lista
 *     numerada, porque pedir una pista y rendirse no son lo mismo, y la
 *     analitica de dificultad los cuenta por separado.
 *  3. **Lo que ya sabian, se respeta.** Los tres del rail lateral son las
 *     mismas metaforas que `StudentNav` ya dibujaba a mano —libro abierto,
 *     circulos concentricos, documento con marca—. Cambia el trazo, no el
 *     significado: nadie tiene que reaprender por donde se va a Practicar.
 */
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronUp,
  CircleCheck,
  Delete,
  FileCheck,
  Flag,
  KeyRound,
  Lightbulb,
  ListOrdered,
  LogIn,
  LogOut,
  Play,
  RotateCcw,
  Send,
  SkipForward,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * Nombre de producto -> dibujo.
 *
 * `satisfies` y no una anotacion de tipo: asi `NombreDeIcono` sale de las
 * claves REALES de este objeto. Una anotacion `Record<string, LucideIcon>`
 * dejaria pasar `icon="pista-nueva"` sin que nadie la hubiera dado de alta.
 */
export const ICONOS = {
  /* --- el bucle de practica --------------------------------------------- */
  /** «Comprobar». El gesto de corregir de toda la vida. */
  comprobar: Check,
  /** «Siguiente pregunta». Avanzar NO es aprobar: por eso no es otra marca. */
  siguiente: ArrowRight,
  /** «Pregunta anterior». */
  anterior: ArrowLeft,
  /** «Saltar». El salto del reproductor, que ya conocen de sus pantallas. */
  saltar: SkipForward,
  /** «Ver una pista». Va en ambar: sustituye al punto ambar de obs001, y asi
   *  la senal tiene forma ademas de color. */
  pista: Lightbulb,
  /** «Ver como se hace». Pasos numerados, deliberadamente distinto de la
   *  bombilla: pedir una pista y ver la solucion no son lo mismo. */
  solucion: ListOrdered,
  /** «Ocultar». Se pliega hacia arriba. */
  ocultar: ChevronUp,
  /** «Volver a intentarlo». */
  reintentar: RotateCcw,

  /* --- la leccion -------------------------------------------------------- */
  /** «Ya he terminado esta leccion». Hermano de «Comprobar», no gemelo. */
  terminado: CircleCheck,
  /** «Practicar esto». La misma diana que la pestana Practicar. */
  practicar: Target,

  /* --- el examen --------------------------------------------------------- */
  /** «Empezar mi examen». */
  empezar: Play,
  /** «Entregar mi examen». Sale de tus manos y no vuelve. */
  entregar: Send,
  /** «Marcar para revisarla luego». */
  marcar: Flag,
  /** «Borrar la respuesta». El retroceso del teclado. */
  borrar: Delete,

  /* --- identidad y cuenta ------------------------------------------------ */
  /** «Entrar». */
  entrar: LogIn,
  /** «Salir». */
  salir: LogOut,
  /** «Cambiar mi PIN». */
  pin: KeyRound,

  /* --- generales --------------------------------------------------------- */
  /** «Cerrar» y «Cancelar»: el mismo gesto, y por eso el mismo dibujo. */
  cerrar: X,

  /* --- el rail de navegacion --------------------------------------------- */
  /** Pestana «Aprender». Libro abierto, como el SVG que sustituye. */
  navAprender: BookOpen,
  /** Pestana «Practicar». Circulos concentricos, como el SVG que sustituye. */
  navPracticar: Target,
  /** Pestana «Examenes». Documento con marca, como el SVG que sustituye. */
  navExamenes: FileCheck,
} satisfies Record<string, LucideIcon>;

/**
 * Los nombres dados de alta. Sale de las claves reales de `ICONOS`, no de una
 * lista escrita a mano: una lista aparte se desincroniza el primer dia.
 */
export type NombreDeIcono = keyof typeof ICONOS;

/** ¿Esta dado de alta este nombre? Util en tests y en fronteras con datos. */
export function esNombreDeIcono(valor: string): valor is NombreDeIcono {
  return Object.prototype.hasOwnProperty.call(ICONOS, valor);
}
