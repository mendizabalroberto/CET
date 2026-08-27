/**
 * Diccionario español del motor de examen.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La forma la impone `exam.en.ts` (`ExamDictionary`). Falta una clave aquí y no
 * compila: es a propósito. Un texto que se cae al inglés a mitad de un examen es
 * un fallo silencioso, y los fallos silenciosos delante de un niño de once años
 * son los peores.
 *
 * REGLA DE TONO, idéntica a la inglesa: quien lee tiene once años y puede estar
 * nervioso mirando un reloj. Sin jerga, sin culpar, sin códigos técnicos. Todo
 * mensaje de fallo dice qué ha pasado, que no es culpa suya y qué va a pasar
 * ahora. El tuteo es deliberado: es un niño, no un cliente.
 */
import type { ExamDictionary } from "./exam.en";

export const examEs: ExamDictionary = {
  list: {
    title: "Tus exámenes",
    subtitle: "Todo lo que te han puesto tus profesores.",
    emptyTitle: "Ahora mismo no tienes exámenes",
    emptyBody: "Cuando un profesor te ponga uno, aparecerá aquí. De momento no tienes que hacer nada.",
    errorTitle: "No hemos podido cargar tus exámenes",
    errorBody: "El problema es nuestro, no tuyo. Inténtalo otra vez dentro de un momento.",
    retry: "Volver a intentarlo",
    questions: "{count} preguntas",
    minutes: "{count} minutos",
    attemptsLeft: "Te quedan {count} de {max} intentos",
    lastTry: "Este es tu último intento",
    noAttemptsLeft: "No te quedan intentos",
    closesAt: "Se cierra {when}",
    opensAt: "Se abre {when}",
    statusAvailable: "Listo para empezar",
    statusInProgress: "Empezado — puedes seguir",
    statusSubmitted: "Entregado",
    statusClosed: "Cerrado",
    statusNotOpen: "Todavía no está abierto",
    open: "Abrir",
    resume: "Seguir",
    seeResult: "Ver mi nota",
    score: "Has sacado {score} de {max}",
  },
  lobby: {
    backToList: "Volver a mis exámenes",
    heading: "Antes de empezar",
    rulesTitle: "Cómo funciona este examen",
    ruleTime: "Tienes {minutes} minutos. El reloj empieza cuando pulses el botón, no antes.",
    ruleCount: "Hay {count} preguntas. Cada una suma puntos para tu nota.",
    ruleBackAllowed:
      "Puedes moverte entre las preguntas todo lo que quieras y cambiar cualquier respuesta antes de entregar.",
    ruleBackForbidden:
      "Avanzas de una en una. Cuando pasas a la siguiente ya no puedes volver, así que tómate tu tiempo en cada una.",
    ruleAutosave: "Tus respuestas se guardan solas mientras escribes. No tienes que pulsar guardar nunca.",
    ruleNetwork:
      "Si se cae internet, sigue respondiendo. Guardamos tus respuestas en este aparato y las enviamos en cuanto vuelva.",
    ruleReload:
      "Si se cierra la página o se apaga la tableta, vuelve a abrir el examen. Tus respuestas y el tiempo que te queda estarán exactamente como los dejaste.",
    ruleBlank: "Una respuesta en blanco no puntúa, así que siempre merece la pena escribir algo.",
    ruleFeedbackNever: "Tu profesor repasará las respuestas contigo. Aquí verás tu nota.",
    ruleFeedbackAfter: "En cuanto entregues verás tu nota y qué preguntas has acertado.",
    start: "Empezar mi examen",
    resume: "Seguir con mi examen",
    starting: "Preparando tu examen…",
    startError: "No hemos podido empezar tu examen",
    startErrorBody:
      "No se ha perdido nada y esto no te gasta un intento. Pulsa el botón para probar otra vez, y avisa a tu profesor si sigue pasando.",
    closedTitle: "Este examen está cerrado",
    closedBody: "El plazo ya ha pasado. Habla con tu profesor si crees que es un error.",
    notOpenTitle: "Este examen todavía no está abierto",
    notOpenBody: "Se abre {when}. Vuelve entonces.",
    noAttemptsTitle: "Has gastado todos tus intentos",
    noAttemptsBody: "No puedes volver a empezar este examen. Abajo tienes tu última nota.",
    alreadySubmittedTitle: "Este ya lo has entregado",
    alreadySubmittedBody: "Aquí no te queda nada por hacer.",
  },
  run: {
    heading: "Examen en curso",
    questionOf: "Pregunta {current} de {total}",
    next: "Siguiente pregunta",
    previous: "Pregunta anterior",
    submit: "Entregar mi examen",
    submitting: "Entregando…",
    noBackNotice: "Este examen solo avanza. Repasa tu respuesta antes de continuar.",
    yourAnswer: "Tu respuesta",
    clear: "Borrar mi respuesta",
    soundOn: "Avisos de tiempo: con sonido",
    soundOff: "Avisos de tiempo: sin sonido",
    warn5: "Quedan cinco minutos. Sigue a tu ritmo.",
    warn1: "Queda un minuto. Termina la pregunta que tienes.",
    expiredTitle: "Se ha acabado el tiempo",
    expiredBody: "Estamos entregando tu examen. Todo lo que has respondido está guardado.",
    leaveWarning: "Tu examen sigue abierto. Si sales ahora quizá no guardemos tu última respuesta.",
    emptyItemsTitle: "Este examen no tiene preguntas",
    emptyItemsBody:
      "Algo ha salido mal al prepararlo, y no es culpa tuya. Esto no cuenta en tu contra. Avisa a tu profesor, por favor.",
    loadErrorTitle: "No hemos podido abrir tu examen",
    loadErrorBody: "El problema es nuestro, no tuyo. Inténtalo otra vez: no has perdido nada.",
    saveErrorTitle: "No llegamos a internet",
    saveErrorBody:
      "Sigue respondiendo. Tu trabajo está a salvo en este aparato y seguimos intentando enviarlo.",
    submitErrorTitle: "No hemos podido entregar tu examen",
    submitErrorBody:
      "Tus respuestas están a salvo. Vuelve a pulsar el botón. Si sigue sin salir, avisa a tu profesor ahora mismo: él puede ver tus respuestas desde su lado.",
    lockedTitle: "Este examen está abierto en otra pestaña",
    lockedBody:
      "Para que no se pierda nada, solo una pestaña puede responder a la vez. Sigue en la otra, o toma el control aquí.",
    takeOver: "Responder aquí",
    readOnly: "Solo lectura",
    deadlinePassedTitle: "El tiempo de este examen ha terminado",
    deadlinePassedBody: "Estamos entregando lo que has respondido. No se ha perdido nada.",
    unansweredNone: "Has respondido todas las preguntas.",
    progress: "{answered} de {total} respondidas",
  },
  result: {
    backToList: "Volver a mis exámenes",
    heading: "Tu nota",
    pending: "Todavía estamos corrigiendo",
    pendingBody: "Vuelve dentro de un momento. Si cierras la página no se pierde nada.",
    passed: "Has aprobado",
    notPassed: "Esta vez no has llegado",
    percent: "{pct} %",
    reviewTitle: "Pregunta a pregunta",
    reviewHidden: "Tu profesor repasará las respuestas contigo en clase.",
    yourAnswer: "Tú respondiste",
    correctAnswer: "La respuesta era",
    noAnswer: "Dejaste esta en blanco",
    correct: "Bien",
    incorrect: "No era esa",
    points: "{points} de {max}",
    errorTitle: "No hemos podido cargar tu nota",
    errorBody: "Está guardada. Inténtalo otra vez dentro de un momento.",
  },
  a11y: {
    timerLabel: "Tiempo restante",
    navigatorLabel: "Ir a una pregunta",
    autosaveRegion: "Estado del guardado",
  },
};
