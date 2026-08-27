/**
 * @cet/ui — diccionario del design system.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * AD-7. Estos son los UNICOS textos que viven en el paquete, y existen porque
 * un componente no puede funcionar sin ellos (el nombre accesible del boton de
 * cerrar un dialogo, por ejemplo). Todos son `I18nText` y todos se pueden
 * sustituir por prop desde la aplicacion.
 *
 * Ningun componente puede escribir un literal de cara al usuario. Si hace falta
 * un texto nuevo, se anade aqui.
 *
 * TONO. El publico son ninos de 10 a 16 anos haciendo examenes que les importan.
 * Los textos de error no culpan ("no se ha podido cargar", nunca "has hecho algo
 * mal"), no muestran codigos tecnicos y siempre ofrecen una salida.
 */

import type { I18nText } from "@cet/shared";

export const UI_STRINGS = {
  /* --- acciones genericas --- */
  close: { es: "Cerrar", en: "Close" },
  cancel: { es: "Cancelar", en: "Cancel" },
  confirm: { es: "Confirmar", en: "Confirm" },
  retry: { es: "Volver a intentarlo", en: "Try again" },
  check: { es: "Comprobar", en: "Check" },
  next: { es: "Siguiente", en: "Next" },
  previous: { es: "Anterior", en: "Previous" },
  loading: { es: "Cargando", en: "Loading" },

  /* --- feedback de practica --- */
  correct: { es: "Correcto", en: "Correct" },
  incorrect: { es: "Casi", en: "Not quite" },
  correctAnswerIs: { es: "La respuesta es", en: "The answer is" },
  hint: { es: "Pista", en: "Hint" },
  showHint: { es: "Ver una pista", en: "Show a hint" },
  solution: { es: "Cómo se hace", en: "How to do it" },
  showSolution: { es: "Ver cómo se hace", en: "Show how to do it" },
  hideSolution: { es: "Ocultar", en: "Hide" },
  streak: { es: "Racha", en: "Streak" },
  bestStreak: { es: "Mejor racha", en: "Best streak" },

  /* --- bloques de leccion --- */
  blockRule: { es: "Regla", en: "Rule" },
  blockExample: { es: "Ejemplo", en: "Example" },
  blockTip: { es: "Truco", en: "Tip" },
  blockWarning: { es: "Cuidado con esto", en: "Watch out for this" },
  blockSteps: { es: "Paso a paso", en: "Step by step" },
  blockFormula: { es: "Fórmula", en: "Formula" },

  /* --- examen --- */
  question: { es: "Pregunta", en: "Question" },
  questionOf: { es: "de", en: "of" },
  points: { es: "puntos", en: "points" },
  answered: { es: "Respondida", en: "Answered" },
  unanswered: { es: "Sin responder", en: "Not answered" },
  flagged: { es: "Marcada para revisar", en: "Flagged for review" },
  flagForReview: { es: "Marcar para revisarla luego", en: "Flag to review later" },
  unflag: { es: "Quitar la marca", en: "Remove flag" },
  questionNavigator: { es: "Ir a una pregunta", en: "Go to a question" },
  yourAnswer: { es: "Tu respuesta", en: "Your answer" },
  clearAnswer: { es: "Borrar la respuesta", en: "Clear answer" },
  numerator: { es: "Numerador", en: "Numerator" },
  denominator: { es: "Denominador", en: "Denominator" },
  /* --- revision posterior al examen ---
     El color no puede llevar esto solo: bajo deuteranopia el verde de acierto y
     el rojo de error son el mismo color (1.10:1). Estos textos son el canal que
     llega al lector de pantalla; el glifo es el que llega al ojo. */
  reviewCorrect: { es: "Correcta", en: "Correct" },
  reviewIncorrect: { es: "Tu respuesta, incorrecta", en: "Your answer, incorrect" },
  reviewMissed: { es: "No marcada, era correcta", en: "Not selected, was correct" },

  chooseOne: { es: "Elige una opción", en: "Choose one answer" },
  chooseSeveral: { es: "Puedes elegir varias", en: "You can choose more than one" },
  orderingHelp: {
    es: "Usa las flechas arriba y abajo para cambiar el orden",
    en: "Use the up and down arrows to change the order",
  },
  moveUp: { es: "Subir", en: "Move up" },
  moveDown: { es: "Bajar", en: "Move down" },
  movedToPosition: { es: "Movido a la posición", en: "Moved to position" },
  matchingHelp: { es: "Une cada elemento con su pareja", en: "Match each item with its pair" },
  noMatch: { es: "Sin emparejar", en: "Not matched" },

  /* --- temporizador --- */
  timeLeft: { es: "Tiempo restante", en: "Time left" },
  timeLeftLow: { es: "Te quedan menos de 5 minutos", en: "Less than 5 minutes left" },
  timeLeftVeryLow: { es: "Te queda menos de 1 minuto", en: "Less than 1 minute left" },
  timeUp: {
    es: "Se acabó el tiempo. Guardamos lo que llevas hecho.",
    en: "Time is up. We saved everything you did.",
  },
  timerSyncing: { es: "Sincronizando el reloj", en: "Syncing the clock" },

  /* --- autoguardado --- */
  autosaveSaved: { es: "Guardado", en: "Saved" },
  autosaveSaving: { es: "Guardando", en: "Saving" },
  autosaveOffline: {
    es: "Sin conexión. Seguimos guardando en este dispositivo.",
    en: "No connection. We keep saving on this device.",
  },
  autosaveRetrying: { es: "Reintentando guardar", en: "Trying to save again" },
  autosaveNever: { es: "Todavía no hay nada que guardar", en: "Nothing to save yet" },

  /* --- entrega --- */
  submitExam: { es: "Entregar el examen", en: "Hand in the exam" },
  submitTitle: { es: "Entregar el examen", en: "Hand in the exam" },
  submitBody: {
    es: "Cuando lo entregues no podrás cambiar las respuestas.",
    en: "Once you hand it in you cannot change your answers.",
  },
  submitUnanswered: {
    es: "Preguntas que aún no has respondido",
    en: "Questions you have not answered yet",
  },
  submitReview: { es: "Volver y revisarlas", en: "Go back and check them" },
  submitConfirm: { es: "Sí, entregar", en: "Yes, hand it in" },
  submitting: { es: "Entregando", en: "Handing in" },

  /* --- datos --- */
  progress: { es: "Progreso", en: "Progress" },
  mastery: { es: "Dominio", en: "Mastery" },
  masteryStarting: { es: "Empezando", en: "Getting started" },
  masteryLearning: { es: "Aprendiendo", en: "Learning it" },
  masterySolid: { es: "Lo llevas bien", en: "Going well" },
  masteryMastered: { es: "Dominado", en: "Mastered" },
  score: { es: "Nota", en: "Score" },

  /* --- estados vacios y de error, en lenguaje de nino --- */
  emptyTitle: { es: "Aquí todavía no hay nada", en: "Nothing here yet" },
  emptyBody: {
    es: "Cuando haya contenido aparecerá en esta página.",
    en: "When there is something to show, it will appear on this page.",
  },
  errorTitle: { es: "No hemos podido cargar esto", en: "We could not load this" },
  errorBody: {
    es: "No es culpa tuya y no has perdido nada. Prueba otra vez en un momento.",
    en: "It is not your fault and you have not lost anything. Try again in a moment.",
  },
  errorReference: {
    es: "Si vuelve a pasar, enseña este código a tu profesor",
    en: "If it happens again, show this code to your teacher",
  },
  offlineTitle: { es: "Te has quedado sin conexión", en: "You are offline" },
  offlineBody: {
    es: "Sigue trabajando: guardamos todo y lo enviamos cuando vuelva la conexión.",
    en: "Keep working: we save everything and send it when you are back online.",
  },
} as const satisfies Record<string, I18nText>;

export type UiStringKey = keyof typeof UI_STRINGS;
