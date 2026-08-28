/**
 * English dictionary for the LEARN + PRACTICE area (Milestone 2).
 * © 2026 Roberto Mendizabal. All rights reserved.
 *
 * AD-7: zero hardcoded strings. This file defines the SHAPE of the dictionary;
 * `learn.es.ts` has to satisfy it or the build fails.
 *
 * It lives apart from `en.ts` on purpose: `en.ts` is shared by every area of the
 * app and four agents edit the tree in parallel. Keeping the learn/practice
 * strings in their own module means adding a lesson string can never conflict
 * with a string added for the exam screen.
 */
export const learnEn = {
  index: {
    title: "Your lessons",
    subtitle: "Everything your school has switched on for you.",
    emptyTitle: "No lessons yet",
    emptyBody:
      "Your teacher has not switched on a course for your class yet. It will show up here as soon as they do.",
    errorTitle: "We could not load your lessons",
    errorBody: "It is not your fault and you have not lost anything. Try again in a moment.",
    lessonCount: "{count} lessons",
    lessonCountOne: "1 lesson",
    minutes: "{count} min",
    moduleLabel: "Unit {ord}",
    progressLabel: "How you are doing",
    progressValue: "{percent}% mastered",
    noProgressYet: "No practice yet",
    practiceCta: "Practise now",
    practiceCtaBody: "Endless questions with instant feedback. Nothing is marked — it is just practice.",
    openCourse: "Open",
  },
  /**
   * The subject grid and the subject screen.
   *
   * `progressUnavailable` is not an empty state and must never read like one:
   * it is what a pupil sees when the query behind the numbers failed. Telling
   * them "0 of 12" when we simply do not know would be a lie about their own
   * work, so the wording says we cannot show it, not that there is nothing.
   */
  subject: {
    openSubject: "Open {subject}",
    /*
     * The card builds its line from pieces — "3 of 12 finished · 2 on the go" —
     * because the numbers come from the component, not from here. Whole
     * sentences with placeholders would force the component to interpolate, and
     * interpolation inside @cet/ui is where a locale bug hides best.
     */
    of: "of",
    finished: "finished",
    onTheGo: "on the go",
    notStarted: "Not started yet",
    allDone: "All finished",
    progressUnknown: "We cannot show your progress",
    progressLabel: "Lessons finished",
    progressUnavailable: "We cannot show how you are doing right now. Your lessons still work.",
    emptyModule: "This unit has no lessons yet.",
    notFoundTitle: "We could not find that subject",
    notFoundBody: "It may have been switched off for your school.",
    stateNotStarted: "Not started",
    stateStarted: "Started",
    stateCompleted: "Finished",
  },
  lesson: {
    backToIndex: "Back to your lessons",
    trailLabel: "Path",
    trailRoot: "Learn",
    estimated: "About {count} min",
    emptyTitle: "This lesson is empty",
    emptyBody: "There is nothing to read here yet. Tell your teacher so they can add it.",
    notFoundTitle: "We could not find that lesson",
    notFoundBody: "It may have been moved or your school may have switched it off.",
    markComplete: "I have finished this lesson",
    completed: "Finished. Well done.",
    practiceThis: "Practise this",
    tableCaption: "Table",
    unsupportedBlock: "This part of the lesson cannot be shown on this device yet.",
  },
  practice: {
    title: "Practice",
    subtitle: "Pick a topic. You get a new question every time, and you find out straight away.",
    chooseTopic: "Choose a topic",
    topicLegend: "Topics",
    backToTopics: "Choose another topic",
    trailLabel: "Path",
    trailRoot: "Practise",
    start: "Start",
    actionsLabel: "Actions",
    check: "Check",
    nextQuestion: "Next question",
    skip: "Skip",
    newQuestion: "New question",
    typeAnswerFirst: "Type an answer first — a guess is better than a blank.",
    answerLabel: "Your answer",
    answerPlaceholder: "Type your answer",
    asked: "Asked",
    right: "Right",
    accuracy: "Accuracy",
    streak: "Streak",
    best: "Best",
    inARow: "{count} in a row",
    noneYet: "—",
    notMeasuredYet: "Not measured yet",
    loadingQuestion: "Making a question…",
    correctTitle: "Correct!",
    incorrectTitle: "Not quite.",
    theAnswerIs: "The answer is",
    offlineNotice: "You are offline. Keep practising — we save everything and send it when you are back.",
    engineErrorTitle: "We could not make a question",
    engineErrorBody: "Try another topic, or come back in a moment.",
    liveCorrect: "Correct. Streak {streak}.",
    liveIncorrect: "Not quite. The answer is {answer}.",
    liveQuestion: "Question {ord}.",
    unknownTopicTitle: "We do not know that topic",
    unknownTopicBody: "Pick one from the list and we will start straight away.",
    /* --- progreso persistente por grupo (viene de learning_events) --- */
    progressLegend: "How you are doing in each topic",
    nextStepTitle: "Your next step",
    nextStepEvidenceOne: "1 more question and I can tell you how you are doing.",
    nextStepEvidence: "{count} more questions and I can tell you how you are doing.",
    nextStepToLevelOne: "1 more right answer and you move up to {level}.",
    nextStepToLevel: "{count} right answers and you move up to {level}.",
    nextStepMastered: "Mastered. Drop by now and then so it stays that way.",
    notPractisedYet: "Not practised yet",
    answeredCountOne: "1 question answered",
    answeredCount: "{count} questions answered",
    progressUnavailable: "We cannot show your progress right now. Nothing is lost.",
    topics: {
      simplify: "Simplifying",
      compare: "Comparing",
      fracop: "+ − × ÷ fractions",
      mixed: "Improper ↔ mixed",
      decimal: "Decimals × ÷",
      powten: "× ÷ 10, 100, 1,000",
      metric: "Metric units",
      shape: "Compound shapes",
      word: "Word problems",
      mix: "🎲 Mixed",
    },
    topicHints: {
      simplify: "Divide top and bottom by the same number.",
      compare: "Which fraction is bigger?",
      fracop: "The four operations with fractions.",
      mixed: "Turn improper fractions into mixed numbers and back.",
      decimal: "Multiply and divide decimals.",
      powten: "The digits move, not the point.",
      metric: "Change between km, m, cm, kg, g, L and mL.",
      shape: "Area and perimeter of shapes made of rectangles.",
      word: "Read it twice, then choose the operation.",
      mix: "A bit of everything.",
    },
  },
};

/**
 * NOTE: no `as const`, for the same reason as `en.ts`: with literal types no
 * translation could ever satisfy the shape.
 */
export type LearnDictionary = typeof learnEn;
