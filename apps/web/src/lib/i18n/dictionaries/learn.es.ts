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
  /**
   * La rejilla de materias y la pantalla de una materia.
   *
   * `progressUnavailable` NO es un estado vacío y no puede sonar como tal: es
   * lo que ve el alumno cuando la consulta que alimenta las cifras ha fallado.
   * Decirle "0 de 12" cuando sencillamente no lo sabemos sería mentirle sobre
   * su propio trabajo, así que el texto dice que no podemos enseñarlo, no que
   * no haya nada. Y añade que las lecciones siguen funcionando, para que no
   * cierre la pestaña.
   */
  subject: {
    openSubject: "Abrir {subject}",
    /*
     * La tarjeta compone su línea con piezas —«3 de 12 terminadas · 2 en
     * marcha»— porque las cifras las pone el componente, no este diccionario.
     * Una frase entera con marcadores obligaría a interpolar dentro de
     * `@cet/ui`, que es donde mejor se esconde un fallo de idioma.
     */
    of: "de",
    finished: "terminadas",
    onTheGo: "en marcha",
    notStarted: "Aún sin empezar",
    allDone: "Todas terminadas",
    progressUnknown: "No podemos enseñarte tu avance",
    progressLabel: "Lecciones terminadas",
    progressUnavailable:
      "Ahora mismo no podemos enseñarte cómo lo llevas. Tus lecciones siguen funcionando.",
    emptyModule: "Esta unidad todavía no tiene lecciones.",
    notFoundTitle: "No hemos encontrado esa materia",
    notFoundBody: "Puede que tu colegio la haya desactivado.",
    stateNotStarted: "Sin empezar",
    stateStarted: "Empezada",
    stateCompleted: "Terminada",
  },
  lesson: {
    backToIndex: "Volver a tus lecciones",
    /** Nombre accesible de las migas de pan, y raiz de la ruta. */
    trailLabel: "Ruta",
    trailRoot: "Aprender",
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
    trailLabel: "Ruta",
    trailRoot: "Practicar",
    start: "Empezar",
    /** Nombre accesible de la zona de acciones. Un `role="group"` sin nombre
     *  no se anuncia como grupo: el lector lee cuatro botones sueltos. */
    actionsLabel: "Acciones",
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
    /* --- progreso persistente por grupo (viene de learning_events) --- */
    progressLegend: "Cómo llevas cada tema",
    nextStepTitle: "Tu siguiente paso",
    nextStepEvidenceOne: "1 pregunta más y te digo cómo lo llevas.",
    nextStepEvidence: "{count} preguntas más y te digo cómo lo llevas.",
    nextStepToLevelOne: "1 acierto más y subes a {level}.",
    nextStepToLevel: "{count} aciertos y subes a {level}.",
    nextStepMastered: "Dominado. Pásate de vez en cuando para que siga así.",
    notPractisedYet: "Sin practicar todavía",
    answeredCountOne: "1 pregunta respondida",
    answeredCount: "{count} preguntas respondidas",
    progressUnavailable: "Ahora mismo no podemos enseñarte tu progreso. No has perdido nada.",
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
      mix: "Mezcla",
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
