/**
 * Staff dictionary (teacher panel, forensic viewer, manual grading, admin).
 * © 2026 Roberto Mendizabal. All rights reserved.
 *
 * WHY A SEPARATE DICTIONARY
 * -------------------------
 * `en.ts` / `es.ts` are the shared application dictionary, owned by another
 * track. The staff surface is by far the most text-heavy area of the product
 * and it has a different register — it is written for adults, and it says
 * things like "grading chain" and "server clock" that must never leak into a
 * screen an eleven-year-old sees. Keeping it in its own file means the staff
 * vocabulary cannot accidentally reach the student bundle.
 *
 * Like `en.ts`, this object deliberately carries NO `as const`: the widened
 * `string` type is what makes `staff.es.ts` checkable as a *structure* rather
 * than as a set of literal types.
 */
export const staffEn = {
  nav: {
    teach: "Teaching",
    admin: "Administration",
    attempts: "Attempts",
    backToTeach: "Back to the teaching panel",
    backToAttempt: "Back to the attempt",
    sectionLabel: "Staff sections",
  },

  common: {
    student: "Student",
    students: "Students",
    section: "Class",
    exam: "Exam",
    status: "Status",
    score: "Score",
    unknown: "Unknown",
    none: "—",
    notAvailable: "Not available",
    yes: "Yes",
    no: "No",
    of: "of",
    points: "points",
    view: "View",
    reason: "Reason",
    time: "Time",
    date: "Date",
    actor: "Performed by",
    action: "Action",
    entity: "Record",
    loading: "Loading…",
    /** Every date in the staff area is stamped with the school's own zone. */
    timezoneNote: "All times are shown in the school timezone ({timezone}), on the server clock.",
  },

  attemptStatus: {
    in_progress: "In progress",
    submitted: "Submitted",
    grading: "Being graded",
    graded: "Graded",
    abandoned: "Abandoned",
    voided: "Voided",
  },

  submittedBy: {
    student: "Closed by the student",
    timer: "Closed by the timer",
    teacher: "Closed by a teacher",
    system: "Closed by the system",
  },

  responseSource: {
    typed: "Typed",
    selected: "Selected",
    autosave: "Autosaved",
    restored: "Restored after a reconnection",
  },

  gradingMode: {
    auto: "Automatic",
    partial: "Partial credit",
    manual: "Manual",
  },

  gradedBy: {
    auto: "Graded automatically",
    manual: "Graded by hand",
  },

  teach: {
    title: "Teaching panel",
    subtitle: "Your classes, your students and how their exams are going.",
    statsCaption: "Attempt totals across your classes",
    stats: {
      submitted: "Submitted",
      inProgress: "In progress",
      notStarted: "Not started",
      averageScore: "Average score",
      averageScoreHint: "Mean of graded attempts only. Attempts still in progress are excluded.",
      notStartedHint: "Students assigned an exam who have not opened it yet.",
    },
    classes: {
      title: "Your classes",
      caption: "Classes you teach, with enrolment and exam activity",
      name: "Class",
      yearLevel: "Year",
      academicYear: "Academic year",
      studentCount: "Students",
      assignmentCount: "Exams assigned",
      empty: "You are not assigned to any class yet.",
      emptyBody:
        "A school administrator adds teachers to classes. Until then this panel has nothing to show you.",
    },
    assignments: {
      title: "Assigned exams",
      caption: "Exams assigned to your classes, with progress",
      exam: "Exam",
      section: "Class",
      window: "Window",
      opens: "Opens",
      closes: "Closes",
      progress: "Progress",
      submitted: "Submitted",
      inProgress: "In progress",
      notStarted: "Not started",
      averageScore: "Average",
      empty: "No exams have been assigned to your classes.",
      emptyBody: "Once an exam is assigned, its progress appears here as students work through it.",
    },
    attempts: {
      title: "Recent attempts",
      caption: "The most recent exam attempts in your school",
      openLabel: "Reconstruct this attempt",
      started: "Started",
      submitted: "Submitted",
      empty: "No attempts yet.",
      emptyBody: "As soon as a student opens an assigned exam, the attempt shows up here.",
    },
    weakSkills: {
      title: "Weakest skills in the school",
      subtitle:
        "Aggregated from every student's mastery record. Skills observed fewer than {minObservations} times are left out — two answers are not a diagnosis.",
      caption: "Skills ranked from weakest to strongest",
      skill: "Skill",
      mastery: "Average mastery",
      studentsTracked: "Students tracked",
      observations: "Observations",
      empty: "Not enough evidence yet.",
      emptyBody:
        "Mastery is built from answered questions. Once your classes have practised, the weakest skills appear here.",
      lowConfidence: "Low confidence",
    },
  },

  attempt: {
    title: "Attempt reconstruction",
    subtitle: "Exactly what this student saw, in the order they saw it, and what they did with it.",
    heading: "{student} · {exam}",
    notFound: "That attempt does not exist, or it does not belong to your school.",
    summary: {
      caption: "Attempt summary",
      student: "Student",
      studentCode: "Student code",
      exam: "Exam",
      section: "Class",
      attemptNumber: "Attempt number",
      status: "Status",
      startedAt: "Started (server clock)",
      deadlineAt: "Server deadline",
      submittedAt: "Submitted",
      gradedAt: "Graded",
      score: "Score",
      passed: "Passed",
      questions: "Questions",
      notGradedYet: "Not graded yet",
    },
    warnings: {
      inProgressTitle: "This attempt is still open",
      inProgressBody:
        "The student has not submitted. Answers below are the revisions saved so far and there are no marks yet — what you are reading is a live snapshot, not a finished exam.",
      voidedTitle: "This attempt has been voided",
      voidedBody:
        "A voided attempt does not count towards the student's record. It is kept, and reconstructable, precisely so the decision to void it can be explained.",
      abandonedTitle: "This attempt was abandoned",
      abandonedBody:
        "The student never submitted and the window has closed. Whatever was autosaved is below.",
      gradingTitle: "Grading in progress",
      gradingBody: "Some questions may not have a mark yet.",
    },
    telemetry: {
      title: "Attempt telemetry",
      subtitle: "Derived from learning events recorded against this attempt, on the server clock.",
      caption: "Telemetry totals for the attempt",
      totalTime: "Time on questions",
      hintsRequested: "Hints requested",
      idleTime: "Idle time",
      focusLosses: "Focus losses",
      focusLossesHint: "Times the exam tab lost focus. Not proof of anything on its own.",
      revisits: "Question revisits",
      noEvents: "No telemetry was recorded for this attempt.",
      noEventsBody:
        "Either the student's browser could not reach the events endpoint, or this attempt predates telemetry. The answers and marks below are unaffected — they come from the exam engine, not from the browser.",
    },
    item: {
      heading: "Question {ord} of {total}",
      stemLabel: "What the student saw",
      optionsLabel: "The order the options were shown in",
      optionsCaption: "Options as presented, with their position in the question bank",
      positionColumn: "Position seen",
      optionColumn: "Option",
      bankColumn: "In the bank",
      chosenColumn: "Chosen",
      chosen: "Chosen",
      notChosen: "Not chosen",
      /** The whole point of persisting `option_order`. */
      selectionSentence:
        'They picked option {position} of the {total} they were shown, which was "{text}".',
      selectionSentenceMulti: "They picked {count} of the {total} options they were shown:",
      selectionEmpty: "They left this question blank.",
      selectionUnreadable:
        "The saved answer does not match any option that was shown. The raw value is below.",
      bankPosition: "position {position} in the bank",
      bankPositionUnknown: "position in the bank unknown",
      orderMissing:
        "No option permutation was recorded for this question, so the positions below cannot be mapped back to the question bank.",
      orderInvalid:
        "The recorded option permutation does not match the options that were shown. The positions below are what the student saw; the mapping back to the bank is not trustworthy.",
      version: "Version {version} of this question",
      versionLink: "Open in the question bank",
      versionUnknown: "Question version not available",
      format: "Format",
      gradingModeLabel: "Grading",
      difficulty: "Difficulty",
      maxPoints: "Worth",
      skill: "Skill",
      figureAlt: "Figure shown with this question",
      rawResponse: "Raw saved value",
    },
    timeline: {
      title: "Every revision of their answer",
      subtitle: "One row per saved change, on the server clock. This is how you see them change their mind.",
      caption: "Answer revisions in order",
      revision: "Revision",
      whatTheyWrote: "What was saved",
      when: "When (server)",
      clientWhen: "Browser clock",
      via: "Via",
      timeOnItem: "Time on question",
      isFinal: "Final",
      empty: "This question was never answered.",
      changedMindOnce: "They saved one answer.",
      changedMind: "They changed their mind {count} times.",
      clockSkew: "The browser clock disagreed with the server by {skew}.",
    },
    grading: {
      title: "Mark",
      subtitle: "Including every regrade, oldest first.",
      caption: "Grading chain for this question",
      points: "Points",
      by: "Marked by",
      when: "When",
      rationale: "Justification",
      noRationale: "No justification was recorded.",
      superseded: "Superseded",
      effective: "Current mark",
      chainNote: "This mark has been revised {count} times. The full chain is shown; the last row is what counts.",
      empty: "Not marked yet.",
      emptyManual: "Waiting for manual marking.",
      gradeLink: "Mark by hand",
      correct: "Correct",
      incorrect: "Incorrect",
      partial: "Partial credit",
      grader: "Marker",
      unknownGrader: "Marker no longer on the system",
    },
    answerKey: {
      title: "Answer key",
      warning:
        "Revealing the answer key is recorded in the audit log with your name and the time. Only do it when you need it.",
      reveal: "Reveal the answer key",
      revealing: "Requesting…",
      hide: "Hide",
      shown: "Answer key for question {ord}",
      denied: "You are not allowed to see this answer key.",
      failed: "The answer key could not be retrieved.",
      auditNote: "This request has been recorded in the audit log.",
      notRequested: "Hidden. Nothing about the answer key is loaded into this page until you ask.",
    },
  },

  grade: {
    title: "Manual marking",
    subtitle:
      "Only questions whose grading mode is manual can be marked here. Each mark is a new record; nothing is ever overwritten.",
    heading: "{student} · {exam}",
    noManualItems: "This attempt has no questions that need marking by hand.",
    noManualItemsBody:
      "Every question in it is graded automatically by the engine. If a mark looks wrong, a regrade is still possible from the reconstruction view.",
    notSubmitted: "This attempt has not been submitted yet.",
    notSubmittedBody:
      "Marking an open attempt would put a mark on an answer the student can still change. Wait until it is submitted.",
    voided: "This attempt is voided and cannot be marked.",
    itemHeading: "Question {ord}",
    currentMark: "Current mark",
    noCurrentMark: "No mark yet",
    pointsLabel: "Points awarded (0 to {max})",
    rationaleLabel: "Justification",
    rationaleHint:
      "Write what a parent would need to read to understand this mark. It is stored with the mark and shown in the reconstruction.",
    submit: "Save mark",
    saving: "Saving…",
    supersedesNote: "This will supersede the existing mark. The old one is kept in the chain.",
    success: "Mark saved.",
    errors: {
      invalidPoints: "Points must be a number between 0 and the maximum for this question.",
      rationaleRequired: "A justification is required. A mark nobody can explain is not a mark.",
      rationaleTooLong: "The justification is too long (maximum {max} characters).",
      notManual: "This question is not marked by hand.",
      notFound: "That question is not part of this attempt.",
      forbidden: "You are not allowed to mark this attempt.",
      attemptNotSubmitted: "The attempt has not been submitted yet.",
      unexpected: "The mark could not be saved. Nothing was changed.",
    },
  },

  admin: {
    title: "Administration",
    subtitle: "Students, access requests and the audit trail for {school}.",
    /**
     * A superadmin belongs to no school — the database makes that state
     * impossible on purpose — so this panel asks which school to open.
     */
    schoolPicker: {
      body: "You are a superadmin, so you belong to no single school. Pick the one whose panel you want to open.",
      empty: "There are no active schools yet.",
      current: "Viewing {school}",
      change: "Switch school",
    },
    tabs: {
      students: "Students",
      registrations: "Access requests",
      audit: "Audit log",
    },
    /**
     * Invitar a un tutor. Hoy lo hace el superadmin a mano; manana lo hara el
     * proceso de contratacion llamando a la misma accion de dominio.
     */
    inviteTutor: {
      title: "Invite a parent or guardian",
      body:
        "They get a link to create their account. It works once and expires in seven days.",
      emailLabel: "Their email address",
      submit: "Create invitation",
      submitting: "Creating\u2026",
      /* El aviso va pegado al enlace, como el PIN de un solo uso. */
      once: "Copy it now \u2014 this link will not be shown again.",
      copy: "Copy",
      copied: "Copied",
      sentTo: "Invitation for {email}",
      errors: {
        emailFormat: "That doesn't look like an email address.",
        generic: "The invitation could not be created. Try again.",
      },
    },
    students: {
      title: "Students",
      caption: "Students enrolled at this school",
      name: "Name",
      code: "Student code",
      yearLevel: "Year",
      stage: "Stage",
      section: "Class",
      status: "Status",
      locked: "Locked",
      lockedUntil: "Locked until {when}",
      notLocked: "Active",
      failedAttempts: "Failed PIN attempts",
      pinMustChange: "Must change PIN",
      guardianEmail: "Guardian email",
      empty: "No students enrolled yet.",
      emptyBody: "Approve an access request, or add a student, to get started.",
      actions: "Actions",
      resetPin: "Regenerate PIN",
      unlock: "Unlock",
      addTitle: "Add a student",
      addSubtitle:
        "A student signs in with the school, their code and a PIN. No email address is collected — only a guardian address, and only if you have one.",
      fullName: "Full name",
      studentCode: "Student code",
      studentCodeHint: "Unique within this school. Letters, digits, dot, dash or underscore.",
      yearLevelLabel: "Year level (1–13)",
      stageLabel: "Stage",
      stagePrimary: "Primary",
      stageSecondary: "Secondary",
      sectionLabel: "Class (optional)",
      guardianEmailLabel: "Guardian email (optional)",
      add: "Create student",
      adding: "Creating…",
      pinOnce:
        "PIN for {name}: {pin}. This is shown once and never again — write it down before you leave this page. The student must change it on first sign-in.",
      confirmResetPin: "Regenerate the PIN for {name}? The current PIN stops working immediately.",
      confirmUnlock: "Unlock {name}? Their failed-attempt counter is reset to zero.",
      unlocked: "{name} has been unlocked.",
      errors: {
        nameRequired: "A full name is required.",
        codeFormat: "The student code must be 2–32 characters: letters, digits, dot, dash or underscore.",
        codeTaken: "That student code is already used at this school.",
        yearRange: "The year level must be between 1 and 13.",
        emailFormat: "That guardian email does not look like an email address.",
        notFound: "That student is not enrolled at this school.",
        unexpected: "The operation failed. Nothing was changed.",
      },
    },
    registrations: {
      title: "Access requests",
      caption: "Pending requests to join this school",
      requestedName: "Name",
      requestedYear: "Requested year",
      guardianEmail: "Guardian email",
      note: "Note",
      requestedAt: "Requested",
      approve: "Approve",
      reject: "Reject",
      rejectReason: "Reason for rejection",
      rejectReasonHint: "Required. The reason is stored with the request.",
      confirmApprove: "Approve {name}? A student record and an initial PIN are created.",
      empty: "No pending requests.",
      emptyBody: "When somebody asks to join this school, their request waits here for you.",
      approved: "{name} has been approved.",
      rejected: "The request from {name} has been rejected.",
      errors: {
        reasonRequired: "A reason is required to reject a request.",
        alreadyReviewed: "That request has already been reviewed.",
        // The student DOES exist: saying "nothing was changed" would be a lie,
        // and whoever read it would approve again and create a second student.
        notMarked:
          "The student was created, but the request could not be marked as approved. Check the queue before approving again: doing so would create a second student.",
        notFound: "That request does not belong to this school.",
        unexpected: "The request could not be processed. Nothing was changed.",
      },
    },
    audit: {
      title: "Audit log",
      subtitle:
        "Every staff action on student data, oldest at the bottom. Append-only: entries cannot be edited or deleted, including by the platform.",
      caption: "Audit log entries",
      when: "When",
      actor: "Who",
      actorRole: "Role at the time",
      action: "Action",
      entity: "Record",
      entityId: "Record id",
      details: "Details",
      before: "Before",
      after: "After",
      showDetails: "Show details",
      hideDetails: "Hide details",
      empty: "Nothing has been recorded yet.",
      emptyBody: "Staff actions on student data appear here as they happen.",
      filterAction: "Filter by action",
      filterAll: "All actions",
      loadMore: "Show older entries",
      teacherDenied: "The audit log is available to school administrators.",
    },
  },

  errors: {
    loadFailedTitle: "This could not be loaded",
    loadFailedBody: "The query failed. The reference below identifies it in the server logs.",
    forbiddenTitle: "Not available",
    forbiddenBody: "This record does not belong to your school.",
  },
};

export type StaffDictionary = typeof staffEn;
