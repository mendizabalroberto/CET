/**
 * English dictionary for the exam runner — canonical shape.
 * © 2026 Roberto Mendizabal. All rights reserved.
 *
 * WHY A SEPARATE FILE FROM `en.ts`
 * The exam runner is the only part of the app that ships a large client bundle,
 * and it is owned by a single vertical. Keeping its strings here means (a) three
 * other agents can edit `en.ts` without ever colliding with this file, and
 * (b) the landing page never pays for exam copy it will not render.
 *
 * This file defines the TYPE (`ExamDictionary`). Adding a key here and
 * forgetting it in `exam.es.ts` is a compile error, not a string that silently
 * shows up in the wrong language in front of a class of eleven-year-olds.
 *
 * TONE RULE, and it outranks brevity: the reader is eleven, possibly anxious,
 * possibly watching a clock. No jargon, no blame, no technical codes. Every
 * failure message says what happened, that it is not their fault, and what
 * happens next.
 */
export const examEn = {
  list: {
    title: "Your exams",
    subtitle: "Everything your teachers have set for you.",
    emptyTitle: "No exams right now",
    emptyBody: "When a teacher sets an exam, it will appear here. Nothing to do for now.",
    errorTitle: "We could not load your exams",
    errorBody: "This is our problem, not yours. Try again in a moment.",
    retry: "Try again",
    questions: "{count} questions",
    minutes: "{count} minutes",
    attemptsLeft: "{count} of {max} tries left",
    lastTry: "This is your last try",
    noAttemptsLeft: "No tries left",
    closesAt: "Closes {when}",
    opensAt: "Opens {when}",
    statusAvailable: "Ready to start",
    statusInProgress: "In progress — carry on",
    statusSubmitted: "Handed in",
    statusClosed: "Closed",
    statusNotOpen: "Not open yet",
    open: "Open",
    resume: "Carry on",
    seeResult: "See my result",
    score: "You scored {score} out of {max}",
  },
  lobby: {
    backToList: "Back to my exams",
    heading: "Before you start",
    rulesTitle: "How this exam works",
    ruleTime: "You have {minutes} minutes. The clock starts when you press the button — not before.",
    ruleCount: "There are {count} questions. Each one is worth points towards your score.",
    ruleBackAllowed:
      "You can move between questions as much as you like, and change any answer before you hand in.",
    ruleBackForbidden:
      "You move forward one question at a time. Once you move on, you cannot go back — so take your time on each one.",
    ruleAutosave:
      "Your answers save by themselves as you type. You do not need to press save, ever.",
    ruleNetwork:
      "If the internet drops out, keep answering. We hold your answers on this device and send them as soon as it comes back.",
    ruleReload:
      "If the page closes or the tablet turns off, open the exam again. Your answers and your remaining time will be exactly where you left them.",
    ruleBlank: "A blank answer scores nothing, so it is always worth writing something.",
    ruleFeedbackNever: "Your teacher will go through the answers with you. You will see your score here.",
    ruleFeedbackAfter: "As soon as you hand in, you will see your score and which questions you got right.",
    start: "Start my exam",
    resume: "Carry on with my exam",
    starting: "Getting your exam ready…",
    startError: "We could not start your exam",
    startErrorBody:
      "Nothing has been lost and this does not count as a try. Press the button to have another go, and tell your teacher if it keeps happening.",
    closedTitle: "This exam is closed",
    closedBody: "The window for this exam has passed. Ask your teacher if you think that is wrong.",
    notOpenTitle: "This exam has not opened yet",
    notOpenBody: "It opens {when}. Come back then.",
    noAttemptsTitle: "You have used all your tries",
    noAttemptsBody: "You cannot start this exam again. Your last result is below.",
    alreadySubmittedTitle: "You have already handed this one in",
    alreadySubmittedBody: "There is nothing left to do here.",
  },
  run: {
    heading: "Exam in progress",
    questionOf: "Question {current} of {total}",
    next: "Next question",
    previous: "Previous question",
    submit: "Hand in my exam",
    submitting: "Handing in…",
    noBackNotice: "This exam moves forward only. Check your answer before you continue.",
    yourAnswer: "Your answer",
    clear: "Clear my answer",
    soundOn: "Time warnings: sound on",
    soundOff: "Time warnings: sound off",
    warn5: "Five minutes left. Keep going at your own pace.",
    warn1: "One minute left. Finish the question you are on.",
    expiredTitle: "Time is up",
    expiredBody: "We are handing in your exam now. Everything you answered has been saved.",
    leaveWarning: "Your exam is still open. If you leave now we may not save your last answer.",
    emptyItemsTitle: "This exam has no questions",
    emptyItemsBody:
      "Something went wrong when the exam was built, and it is not your fault. Nothing counts against you. Please tell your teacher.",
    loadErrorTitle: "We could not open your exam",
    loadErrorBody:
      "This is our problem, not yours. Try again — nothing you have done has been lost.",
    saveErrorTitle: "We cannot reach the internet",
    saveErrorBody: "Keep answering. Your work is safe on this device and we keep trying to send it.",
    submitErrorTitle: "We could not hand in your exam",
    submitErrorBody:
      "Your answers are safe. Press the button again. If it still will not go through, tell your teacher straight away — they can see your answers on their side.",
    lockedTitle: "This exam is open in another tab",
    lockedBody:
      "To make sure nothing gets lost, only one tab can answer at a time. Carry on in the other tab, or take over here.",
    takeOver: "Answer here instead",
    readOnly: "Read only",
    deadlinePassedTitle: "The time for this exam has ended",
    deadlinePassedBody: "We are handing in what you answered. Nothing has been lost.",
    unansweredNone: "You have answered every question.",
    progress: "{answered} of {total} answered",
  },
  result: {
    backToList: "Back to my exams",
    heading: "Your result",
    pending: "We are still marking this",
    pendingBody: "Check back in a moment — the page will not lose anything if you close it.",
    passed: "You passed",
    notPassed: "Not passed this time",
    percent: "{pct}%",
    reviewTitle: "Question by question",
    reviewHidden: "Your teacher will go through the answers with you in class.",
    yourAnswer: "You answered",
    correctAnswer: "The answer was",
    noAnswer: "You left this blank",
    correct: "Correct",
    incorrect: "Not right",
    points: "{points} of {max}",
    errorTitle: "We could not load your result",
    errorBody: "It is safely stored. Try again in a moment.",
  },
  a11y: {
    timerLabel: "Time left",
    navigatorLabel: "Jump to a question",
    autosaveRegion: "Saving status",
  },
} as const;

/** El tipo que `exam.es.ts` está obligado a satisfacer. */
export type ExamDictionary = {
  readonly [K in keyof typeof examEn]: { readonly [P in keyof (typeof examEn)[K]]: string };
};
