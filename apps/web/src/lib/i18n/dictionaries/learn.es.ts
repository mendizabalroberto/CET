/**
 * Diccionario español del área LEARN + PRACTICE (Hito 2).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El tipo `LearnDictionary` lo impone `learn.en.ts`. Si falta una clave aquí,
 * el build falla: es preferible a que un niño de once años vea una cadena en
 * inglés en mitad de una lección.
 *
 * Registro: lenguaje directo y de tuteo, como en los trainers Y6A. Nada de
 * "usted" y nada de vocabulario técnico.
 */
import type { LearnDictionary } from "./learn.en";

export const learnEs: LearnDictionary = {
  index: {
    title: "Tus lecciones",
    subtitle: "Todo lo que tu colegio ha activado para ti.",
    emptyTitle: "Todavía no hay lecciones",
    emptyBody:
      "Tu profesor aún no ha activado ningún curso para tu clase. Aparecerá aquí en cuanto lo haga.",
    errorTitle: "No hemos podido cargar tus lecciones",
    errorBody: "No es culpa tuya y no has perdido nada. Prueba otra vez en un momento.",
    lessonCount: "{count} lecciones",
    lessonCountOne: "1 lección",
    minutes: "{count} min",
    moduleLabel: "Unidad {ord}",
    progressLabel: "Cómo lo llevas",
    progressValue: "{percent}% dominado",
    noProgressYet: "Aún sin practicar",
    practiceCta: "Practicar ahora",
    practiceCtaBody:
      "Preguntas infinitas con respuesta inmediata. No puntúa: es solo práctica.",
    openCourse: "Abrir",
  },
  lesson: {
    backToIndex: "Volver a tus lecciones",
    estimated: "Unos {count} min",
    emptyTitle: "Esta lección está vacía",
    emptyBody: "Aquí todavía no hay nada que leer. Díselo a tu profesor para que lo añada.",
    notFoundTitle: "No hemos encontrado esa lección",
    notFoundBody: "Puede que la hayan movido o que tu colegio la haya desactivado.",
    markComplete: "Ya he terminado esta lección",
    completed: "Terminada. ¡Muy bien!",
    practiceThis: "Practicar esto",
    tableCaption: "Tabla",
    unsupportedBlock: "Esta parte de la lección todavía no se puede ver en este dispositivo.",
  },
  practice: {
    title: "Práctica",
    subtitle: "Elige un tema. Cada pregunta es nueva y sabes al momento si la has acertado.",
    chooseTopic: "Elige un tema",
    topicLegend: "Temas",
    backToTopics: "Elegir otro tema",
    start: "Empezar",
    check: "Comprobar",
    nextQuestion: "Siguiente pregunta",
    skip: "Saltar",
    newQuestion: "Otra pregunta",
    typeAnswerFirst: "Escribe una respuesta primero: intentarlo es mejor que dejarlo en blanco.",
    answerLabel: "Tu respuesta",
    answerPlaceholder: "Escribe tu respuesta",
    asked: "Preguntas",
    right: "Aciertos",
    accuracy: "Acierto",
    streak: "Racha",
    best: "Mejor",
    inARow: "{count} seguidas",
    noneYet: "—",
    notMeasuredYet: "Aún sin medir",
    loadingQuestion: "Preparando una pregunta…",
    correctTitle: "¡Correcto!",
    incorrectTitle: "Casi.",
    theAnswerIs: "La respuesta es",
    offlineNotice:
      "Te has quedado sin conexión. Sigue practicando: lo guardamos todo y lo enviamos cuando vuelva.",
    engineErrorTitle: "No hemos podido crear una pregunta",
    engineErrorBody: "Prueba con otro tema o vuelve dentro de un momento.",
    liveCorrect: "Correcto. Racha de {streak}.",
    liveIncorrect: "Casi. La respuesta es {answer}.",
    liveQuestion: "Pregunta {ord}.",
    unknownTopicTitle: "No conocemos ese tema",
    unknownTopicBody: "Elige uno de la lista y empezamos enseguida.",
    topics: {
      simplify: "Simplificar",
      compare: "Comparar",
      fracop: "+ − × ÷ fracciones",
      mixed: "Impropias ↔ mixtas",
      decimal: "Decimales × ÷",
      powten: "× ÷ 10, 100, 1.000",
      metric: "Unidades métricas",
      shape: "Figuras compuestas",
      word: "Problemas de enunciado",
      mix: "🎲 Mezcla",
    },
    topicHints: {
      simplify: "Divide arriba y abajo por el mismo número.",
      compare: "¿Qué fracción es mayor?",
      fracop: "Las cuatro operaciones con fracciones.",
      mixed: "Pasa de fracción impropia a número mixto y al revés.",
      decimal: "Multiplicar y dividir decimales.",
      powten: "Se mueven las cifras, no la coma.",
      metric: "Cambia entre km, m, cm, kg, g, L y mL.",
      shape: "Área y perímetro de figuras hechas con rectángulos.",
      word: "Léelo dos veces y elige la operación.",
      mix: "Un poco de todo.",
    },
  },
};
