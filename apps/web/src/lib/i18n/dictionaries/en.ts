/**
 * English dictionary — canonical shape.
 * © 2026 Roberto Mendizabal. All rights reserved.
 *
 * This file defines the TYPE of every dictionary (AD-7). Adding a key here and
 * forgetting it in `es.ts` is a compile error, not a string that silently shows
 * up in the wrong language in front of a class of eleven-year-olds.
 */
export const en = {
  common: {
    appName: "Cambridge Exam Trainer",
    shortName: "CET",
    tagline: "The platform underneath the lessons.",
    back: "Back",
    next: "Next",
    continue: "Continue",
    cancel: "Cancel",
    loading: "Loading…",
    submit: "Submit",
    close: "Close",
    signOut: "Sign out",
    skipToContent: "Skip to main content",
    languageLabel: "Language",
    languageEnglish: "English",
    languageSpanish: "Español",
    themeLabel: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
  },
  /**
   * Bottom tab bar for students. Three destinations and no more: a child of
   * eleven should be able to reach anything in one tap, and every extra tab
   * makes the row harder to hit on a shared tablet.
   */
  studentNav: {
    label: "Sections",
    learn: "Learn",
    practice: "Practice",
    exam: "Exams",
    account: "My account",
    /** Screen-reader suffix on the active tab. The dot alone says nothing. */
    current: "you are here",
    backTo: "Back to {section}",
  },
  account: {
    title: "My account",
    subtitle: "Your details and how you sign in.",
    name: "Name",
    code: "Student code",
    school: "School",
    role: "Role",
    language: "Language",
    changePin: "Change my PIN",
    changePinHint: "Six digits. Nobody else should know it, not even a friend.",
    changePassword: "Change my password",
    changePasswordHint: "You will be asked for the current one.",
  },
  nav: {
    platform: "Platform",
    subjects: "Subjects",
    howItWorks: "How it works",
    forSchools: "For schools",
    login: "Sign in",
    register: "Request access",
    menu: "Menu",
  },
  footer: {
    copyright: "© 2026 Roberto Mendizabal. Todos los derechos reservados.",
    legal: "Legal",
    privacy: "Privacy",
    terms: "Terms",
    product: "Product",
    builtOn: "Built on the Y6A Exam Trainers.",
    dataNote: "Student data is minimised, encrypted and audited.",
  },
  landing: {
    hero: {
      eyebrow: "Multi-school learning and assessment",
      titleLead: "Lessons that teach.",
      titleAccent: "Exams you can prove.",
      subtitle:
        "Structured lessons, instant-feedback practice and timed mock exams — sitting on an identity, content and telemetry platform built for schools, not on a page that forgets everything the moment you close it.",
      ctaPrimary: "Sign in",
      ctaSecondary: "Request access for your school",
      note: "Students sign in with a school code and a PIN. No email address required.",
    },
    stats: {
      subjects: "Subjects",
      subjectsValue: "6",
      reconstruct: "Attempt reconstruction",
      reconstructValue: "100%",
      feedback: "Practice feedback",
      feedbackValue: "<50 ms",
      locales: "Languages",
      localesValue: "ES / EN",
    },
    pillars: {
      title: "What the platform adds",
      subtitle: "The pedagogy was already working. What was missing was everything underneath it.",
      items: {
        identity: {
          title: "Identity built for children",
          body: "A student signs in with their school, their student code and a PIN — four digits in primary, six in secondary. No email, no password to forget, no personal data we do not need.",
        },
        engine: {
          title: "A hybrid exam engine",
          body: "Practice runs in the browser so feedback is instant and survives a flaky school network. Exams run on the server, where the answer key never leaves the database.",
        },
        forensics: {
          title: "Attempts you can reconstruct",
          body: "For any finished exam we can replay exactly what the student saw, in what order, which version of each question, what they answered, when, and how many times they changed their mind.",
        },
        adaptive: {
          title: "Telemetry that becomes teaching",
          body: "Every hint, hesitation and revision is recorded against a skill taxonomy, so weaknesses surface as evidence instead of as a hunch.",
        },
      },
    },
    subjects: {
      title: "Six subjects, one spine",
      subtitle:
        "Every subject shares the same lesson structure, the same practice loop and the same assessment engine.",
      items: {
        math: {
          name: "Mathematics",
          body: "Fractions, decimals, measure, geometry and word problems — with parametric generators, so nobody practises the same question twice.",
        },
        science: {
          name: "Science",
          body: "Investigations, circuits, forces, materials and living things, with interactive diagrams.",
        },
        english: {
          name: "English",
          body: "Tenses, pronouns, comprehension and writing, with targeted grammar drills.",
        },
        spanish: {
          name: "Español",
          body: "Spelling, accentuation, verbs and reading comprehension, graded with full sensitivity to diacritics.",
        },
        socials: {
          name: "Social Studies",
          body: "Geography, history and civics, built around maps and timelines.",
        },
        ict: {
          name: "ICT",
          body: "Digital literacy, spreadsheets, presentations and safe use of technology.",
        },
      },
    },
    how: {
      title: "How a term looks",
      steps: {
        one: {
          title: "Learn",
          body: "Lessons broken into rules, worked examples, tips and warnings — the structure the Y6A trainers proved works.",
        },
        two: {
          title: "Practise",
          body: "Generated questions with immediate feedback and a worked solution, as many times as needed.",
        },
        three: {
          title: "Sit the mock",
          body: "A timed, server-authoritative exam. The clock is the server's, not the browser's.",
        },
        four: {
          title: "See the evidence",
          body: "Teachers get the attempt reconstructed question by question, and mastery per skill.",
        },
      },
    },
    audience: {
      title: "Who it is for",
      student: {
        title: "Students",
        body: "One code, one PIN, and everything you need to revise — in English or Spanish.",
      },
      teacher: {
        title: "Teachers",
        body: "Assign a blueprint to a class, watch attempts arrive, and grade what cannot be graded automatically.",
      },
      admin: {
        title: "School administrators",
        body: "Approve registrations, manage sections, audit every staff access to student data.",
      },
    },
    cta: {
      title: "Bring it to your school",
      body: "Registration requests are reviewed by an administrator before any account is created. No school is onboarded automatically.",
      button: "Request access",
      secondary: "Already have a code? Sign in",
    },
  },
  auth: {
    sesionAbierta: {
      yaDentro: "You are signed in as {name}.",
      continuar: "Continue",
      salir: "Sign out",
      otraCuenta: "Or sign in with a different account:",
    },
    chooseRole: {
      title: "How do you sign in?",
      subtitle: "Choose the option that describes you.",
      student: "I am a student",
      studentHint: "You have a student code and a PIN",
      staff: "I am a teacher or administrator",
      staffHint: "You sign in with your email address",
    },
    student: {
      stepOf: "Step {current} of {total}",
      schoolStep: "Your school",
      schoolLabel: "Choose your school",
      schoolPlaceholder: "Select your school",
      schoolHelp: "If your school is not on the list, ask your teacher.",
      codeStep: "Your student code",
      codeLabel: "Student code",
      codePlaceholder: "For example: Y6A-014",
      codeHelp: "Your teacher gave you this code. It is not your name.",
      pinStep: "Your PIN",
      pinLabel: "Enter your PIN",
      pinHelp4: "Your PIN has 4 numbers.",
      pinHelp6: "Your PIN has 6 numbers.",
      pinLengthToggle: "My PIN has {length} numbers",
      pinDigitLabel: "Digit {index}",
      signIn: "Sign in",
      signingIn: "Signing you in…",
      wrongPersonQuestion: "Not you?",
      startOver: "Start again",
    },
    staff: {
      title: "Staff sign in",
      emailLabel: "Email address",
      emailPlaceholder: "you@school.edu",
      passwordLabel: "Password",
      signIn: "Sign in",
      signingIn: "Signing in…",
      forgot: "Forgot your password?",
    },
    pinChange: {
      title: "Choose your new PIN",
      subtitle: "This is your first time here, so you need to pick a PIN only you know.",
      currentLabel: "Your current PIN",
      newLabel: "Your new PIN",
      confirmLabel: "Type your new PIN again",
      rules: "Do not use 1234, your birthday, or the same number repeated.",
      submit: "Save my new PIN",
      saving: "Saving…",
      success: "Your PIN has been changed.",
    },
    errors: {
      /**
       * DELIBERATELY VAGUE. This message is identical for "the code does not
       * exist", "the PIN is wrong" and "the student is suspended". If they
       * differed, anyone could enumerate a school's valid student codes by
       * trying codes and reading the response.
       */
      badCredentials: "That code and PIN do not go together. Check them and try again.",
      locked: "Too many tries. Wait a few minutes and try again, or ask your teacher.",
      rateLimited: "Too many attempts from this device. Please wait a moment.",
      schoolUnavailable: "That school is not available right now. Ask your teacher.",
      pinMismatch: "The two PINs are not the same. Try again.",
      pinTooWeak: "Choose a different PIN — that one is too easy to guess.",
      pinWrongLength: "Your PIN needs {length} numbers.",
      pinOnlyDigits: "A PIN can only have numbers.",
      staffBadCredentials: "Those sign-in details are not correct.",
      required: "Please fill this in.",
      unexpected: "Something went wrong on our side. Please try again.",
      sessionExpired: "You were away for a while, so we signed you out. Please sign in again.",
    },
  },
  register: {
    title: "Request access",
    subtitle:
      "Fill this in and a school administrator will review it. Nothing is created until they approve it.",
    schoolLabel: "School",
    schoolPlaceholder: "Select the school",
    fullNameLabel: "Student's full name",
    yearLevelLabel: "Year level",
    guardianEmailLabel: "Parent or guardian email address",
    guardianEmailHelp:
      "This is the only contact detail we ask for, and it is used solely to confirm the request.",
    noteLabel: "Anything the school should know (optional)",
    consent:
      "I confirm I am the parent, guardian or a member of staff of this school, and I have read the Privacy Policy.",
    submit: "Send request",
    submitting: "Sending…",
    sentTitle: "Request sent",
    sentBody:
      "A school administrator will review it. If it is approved, the school will pass on the student code and starting PIN directly — never by email.",
    backHome: "Back to the home page",
    errors: {
      consentRequired: "Please confirm before sending.",
      invalidEmail: "That does not look like an email address.",
      generic: "We could not send your request. Please try again.",
    },
  },
  /**
   * La cadena de invitacion: el tutor y su hijo.
   *
   * REGISTRO. `modules/admin` fija densidad y detalle tecnico para personal
   * adulto; un padre no es eso, y un nino de diez menos todavia. Aqui no
   * aparece ni un termino tecnico, tampoco en los errores: nadie que lea esto
   * tiene por que saber que es un token ni un dispositivo casado.
   */
  tutor: {
    home: {
      title: "My children",
      empty: "You haven't added anyone yet.",
      emptyBody: "Add your child and we'll give you a link to send them.",
      add: "Add a child",
      noSchool: "Learning at home",
      linkActive: "Link ready to send",
      linkNone: "No link right now",
      devices: "{count} device(s) remembered",
      open: "Open",
    },
    /*
     * Avisos por Telegram. El vinculo va al reves de lo que parece -es el padre
     * quien escribe primero al bot- y por eso el texto tiene que decirle que
     * pulse «Empezar»: sin ese gesto suyo no hay forma de escribirle.
     */
    telegram: {
      title: "Telegram alerts",
      body: "We can message you on Telegram about how your child is getting on. Only you see it, and you can stop it whenever you like.",
      enable: "Turn on Telegram notifications",
      enabling: "Getting your link ready…",
      pendingTitle: "One step to go",
      pendingBody:
        "Open this link and press “Start” in Telegram. That press is what tells us the chat is yours.",
      open: "Open Telegram",
      pendingExpires: "The link is good for half an hour. If it runs out, just make another one.",
      connected: "Connected",
      connectedSince: "Connected since {date}.",
      disconnect: "Disconnect",
      disconnecting: "Disconnecting…",
    },
    add: {
      title: "Add a child",
      fullNameLabel: "Their full name",
      birthDateLabel: "Date of birth",
      birthDateHelp: "We use it only to work out their year. We don't store it.",
      yearLevelLabel: "Year",
      submit: "Add",
      submitting: "Adding\u2026",
    },
    child: {
      linkTitle: "Their access link",
      linkBody:
        "Send this link to your child. It works once: they choose their PIN and they're in.",
      linkGenerate: "Create link",
      linkRegenerate: "Create a new link",
      linkRevoke: "Cancel this link",
      linkCopy: "Copy",
      linkCopied: "Copied",
      linkOnce: "Copy it now \u2014 for your child's safety we won't show it again.",
      devicesTitle: "Devices that remember them",
      devicesEmpty: "None yet. The first one is remembered when they use their link.",
      devicesLastSeen: "Last used {when}",
      devicesForget: "Forget this device",
      devicesForgetHelp:
        "They'll need a new link to get back in on it. Use this if the device is lost or is no longer theirs.",
      pinTitle: "Their PIN",
      pinBody: "If they've forgotten it, create a new link and they'll choose another one.",
      back: "Back to my children",
      /**
       * El seguimiento. Lo redacta `lib/tutor/seguimiento.ts`, que compone las
       * frases en los DOS idiomas a la vez porque los componentes de informe
       * piden `I18nText` para todo lo que lleva nombre accesible.
       *
       * REGISTRO. Un padre no es personal docente: ni «ítems», ni «sesiones»,
       * ni «dominio». «Veces que ha entrado» dice lo mismo que «sesiones» y no
       * obliga a nadie a aprender una palabra nueva para leer la pantalla de su
       * hijo.
       */
      progress: {
        statsTitle: "These days",
        effortTitle: "Day by day",
        skillsTitle: "What they've got, and what they haven't",
        lessonsTitle: "Where the time goes",
        emptyTitle: "How they're doing",
        emptyBody:
          "Nothing to tell yet. Once your child signs in and studies for a while, this is where you'll see their time, how steady they've been and how each skill is coming along.",
        minutes: "Study time",
        sessions: "Times they came in",
        lessonsOpened: "Lessons opened",
        lessonsCompleted: "Lessons finished",
        answered: "Questions answered",
        accuracy: "Got right",
        streak: "Best run",
        hints: "Hints asked for",
        exams: "Exams handed in",
        /** Resumen del dibujo de constancia. Lo lee el lector de pantalla. */
        effortSummary: "{total} over the last {window}. They studied on {active}.",
        effortSummaryNone: "No study in the last {window}.",
        dayOne: "1 day",
        dayMany: "{count} days",
        /** Lo que sale al posar el ratón sobre una columna. */
        dayStudied: "{day}: {minutes}",
        dayNone: "{day}: no study",
        minutesUnit: "{count} min",
        hoursUnit: "{hours} h {minutes} min",
        percentValue: "{value}%",
        /* --- When they study (migration 0085) ------------------------------ */
        rhythmTitle: "When they study",
        hourRange: "{from} to {to}",
        hourStudied: "{range}: {minutes}",
        hourNone: "{range}: no study",
        rhythmSummary: "They study between {from} and {to}, mostly {peak} ({minutes}).",
        rhythmSummaryOne: "All of their time falls between {peak} ({minutes}).",
        /* --- Effort against outcome ---------------------------------------- */
        outcomeTitle: "Is the time paying off?",
        outcomeXAxis: "Study time",
        outcomeYAxis: "Lessons finished",
        outcomeYAxisRight: "Questions right",
        outcomeSummary:
          "One dot for each day they studied: further right means more time on it, higher up means more lessons finished. {days} with study.",
        outcomeTooFew:
          "There is nothing to answer this with yet: it takes at least {min} with study, and so far there are {days}.",
        outcomePoint: "{day}: {minutes}, {lessons}",
        lessonOne: "1 lesson",
        lessonMany: "{count} lessons",
        rightOne: "1 right",
        rightMany: "{count} right",
        /* --- Period figures, all derived from the daily series -------------- */
        medianLabel: "A typical day",
        bestDayLabel: "Their best day",
        activeDaysLabel: "Days with study",
        activeDaysValue: "{active} of {total}",
        daysRowLabel: "Days in a row",
      },
    },
    signUp: {
      title: "Create your account",
      closedTitle: "CET is invitation only",
      closedBody:
        "If you've signed up for the service, look for the link in your email. It's the only way in.",
      emailLabel: "Your email",
      emailFixed: "This is the address the invitation was sent to, so it can't be changed.",
      fullNameLabel: "Your name",
      passwordLabel: "Choose a password",
      passwordHelp: "At least 10 characters. Make it something no one else would guess.",
      submit: "Create account",
      submitting: "Creating\u2026",
      doneSignInYourself: "Your account is ready. Sign in with your email and password.",
    },
    redeem: {
      greeting: "Hi, {name}",
      title: "Choose your PIN",
      body: "Pick {length} numbers you'll remember. You'll use them every time you come back.",
      pinLabel: "Your new PIN",
      repeatLabel: "Type it again",
      submit: "That's my PIN",
      submitting: "Just a second\u2026",
      invalidTitle: "This link doesn't work any more",
      invalidBody: "Ask whoever sent it to you for a new one.",
    },
    errors: {
      nameRequired: "Please write a name.",
      yearRange: "Pick a year between 1 and 13.",
      emailFormat: "That doesn't look like an email address.",
      passwordTooShort: "A bit longer, please \u2014 at least 10 characters.",
      pinMismatch: "The two PINs aren't the same. Try again.",
      pinTooEasy: "That PIN is too easy to guess. Pick another one.",
      linkInvalid: "This link doesn't work any more.",
      notFound: "We couldn't find that.",
      generic: "That didn't work. Please try again.",
    },
  },
  dashboard: {
    studentTitle: "Your learning",
    staffTitle: "Teaching",
    adminTitle: "Administration",
    comingSoon:
      "This area arrives with Milestone 2: lessons, practice and timed exams for Mathematics Year 6.",
    signedInAs: "Signed in as {name}",
  },
  errors: {
    notFoundTitle: "We could not find that page",
    notFoundBody: "The link may be old, or you may not have access to it.",
    genericTitle: "Something went wrong",
    genericBody: "The problem has been recorded. You can try again.",
    retry: "Try again",
    goHome: "Go to the home page",
  },
  legal: {
    updated: "Last updated: 26 August 2026",
    contents: "Contents",
    privacy: {
      title: "Privacy Policy",
      intro:
        "Cambridge Exam Trainer is used by children. That single fact shapes every decision below. We collect the minimum needed to teach and to prove a grade, we keep it inside the school that owns it, and we log every time an adult looks at it.",
      sections: [
        {
          heading: "Who is responsible",
          paragraphs: [
            "The platform is owned and operated by Roberto Mendizabal. Each participating school is the controller of its own students' data; the platform acts as processor on that school's instructions.",
            "A school may request export or deletion of its data at any time, and that request is honoured in full, including derived analytics.",
          ],
        },
        {
          heading: "What we collect about a student",
          paragraphs: [
            "Identity: the school, a student code issued by the school, the year level and section, the student's name as the school records it, and a hashed PIN. We do not ask a student for an email address, a phone number, a photograph, a date of birth or a home address.",
            "One guardian email address, provided by the school or on the registration request, used only to confirm the request and to contact an adult about the account.",
            "Learning activity: which lessons were opened, which questions were shown, what was answered, when, how long it took, how many times an answer was changed, and which hints were used. This is what makes personalised teaching possible.",
            "Exam attempts: the exact questions presented, the order, the version of each question, every revision of every answer, and the grading applied.",
            "Technical data: the browser user agent and a salted, irreversible hash of the IP address. We never store an IP address in the clear.",
          ],
        },
        {
          heading: "What we never collect",
          paragraphs: [
            "No advertising identifiers, no third-party analytics, no social media pixels, no cross-site tracking, and no behavioural profiling for any purpose other than the student's own learning. There are no third-party scripts on this platform, which is why the content security policy forbids them outright.",
            "We do not sell, rent or share student data with anyone. There is no commercial use of children's data of any kind.",
          ],
        },
        {
          heading: "Why we are allowed to hold it",
          paragraphs: [
            "The lawful basis is the performance of the educational task the school has asked us to carry out, under the school's instructions. Where consent is the appropriate basis, it is obtained from a parent or guardian by the school before an account is created.",
          ],
        },
        {
          heading: "Who can see it",
          paragraphs: [
            "A student sees their own data and nothing else. A teacher sees the students in their own school. A school administrator sees their own school. Nobody sees another school's data.",
            "This is enforced in the database itself with row level security, on every table without exception, and not merely in the application. Every staff access to student data is written to an append-only audit log with the actor, the action, the record and the timestamp.",
          ],
        },
        {
          heading: "How long we keep it",
          paragraphs: [
            "Exam attempts and their reconstruction are retained for as long as the school needs them for academic record-keeping, and are then deleted. Detailed interaction telemetry is retained for the current academic year plus one, then aggregated into skill mastery figures and the raw events deleted.",
            "Authentication attempt records, used to detect brute-force attacks on PINs, are kept for 90 days.",
            "When a student leaves, the school can trigger deletion; personal identifiers are removed and the deletion cascades to every dependent record.",
          ],
        },
        {
          heading: "Security",
          paragraphs: [
            "All traffic is encrypted in transit with TLS and enforced by HTTP Strict Transport Security. Data is encrypted at rest. PINs are stored as Argon2id hashes and are never readable, not even by an administrator; a teacher can reset a PIN but can never see it.",
            "Repeated failed PIN attempts lock an account temporarily rather than allowing an attacker to keep guessing. Sign-in error messages are deliberately identical whether or not a student code exists, so the platform cannot be used to discover which children attend a school.",
          ],
        },
        {
          heading: "Cookies",
          paragraphs: [
            "We set only the cookies required to keep a user signed in and to remember the chosen language and theme. There are no analytics or advertising cookies, so there is no consent banner to dismiss.",
          ],
        },
        {
          heading: "Your rights",
          paragraphs: [
            "A parent or guardian may ask, through the school, to see, correct, export or delete their child's data. Requests are answered within one month.",
            "Because the school is the controller, requests are raised with the school, which then instructs us.",
          ],
        },
        {
          heading: "Contact",
          paragraphs: [
            "Data protection questions should be sent to the school in the first instance. The school can escalate to the platform owner, Roberto Mendizabal.",
          ],
        },
      ],
    },
    terms: {
      title: "Terms of Service",
      intro:
        "These terms govern the use of Cambridge Exam Trainer by schools, their staff and their students.",
      sections: [
        {
          heading: "Accounts",
          paragraphs: [
            "Accounts are created by a school, not by self-registration. A registration request is a request only; it creates nothing until a school administrator approves it.",
            "A student account belongs to the school. Student codes and PINs are personal: they must not be shared, and a student who learns another student's PIN must tell a teacher rather than use it.",
          ],
        },
        {
          heading: "Acceptable use",
          paragraphs: [
            "The platform is for learning and assessment. It must not be used to harass anyone, to attempt to access another person's account or another school's data, to interfere with an exam in progress, or to probe, scan or test the security of the service.",
            "Attempting to extract answer keys, to tamper with the exam clock, or to submit answers on behalf of another student is a breach of these terms and is detectable: every attempt is reconstructable from the server's own records.",
          ],
        },
        {
          heading: "Academic integrity",
          paragraphs: [
            "Exams are authoritative on the server. The timer, the question selection and the grading are the server's, and the answer key never reaches the browser. Where an attempt shows evidence of interference, the school may void it.",
          ],
        },
        {
          heading: "Content and intellectual property",
          paragraphs: [
            "The platform, its source code, its design system and its question generators are the property of Roberto Mendizabal. All rights reserved. No licence is granted beyond use of the service by an authorised school.",
            "Teaching material uploaded by a school remains the property of that school. Material in the global library is licensed to participating schools for use within the platform only.",
          ],
        },
        {
          heading: "Availability",
          paragraphs: [
            "We aim for the platform to be available whenever a school needs it, and in particular during scheduled exam windows, but the service is provided without a contractual uptime guarantee unless a school has a separate written agreement.",
            "Because exams are server-authoritative, an interrupted attempt can be resumed: answers are saved continuously and the deadline is held by the server.",
          ],
        },
        {
          heading: "Suspension",
          paragraphs: [
            "An account or a whole school may be suspended where these terms are breached, or where continued access would put other users' data at risk. A suspended school's data is retained and returned, not destroyed.",
          ],
        },
        {
          heading: "Changes",
          paragraphs: [
            "Material changes to these terms are notified to school administrators before they take effect. Continued use after that date constitutes acceptance.",
          ],
        },
        {
          heading: "Governing terms",
          paragraphs: [
            "Nothing in these terms limits the rights that a child, a parent or a guardian holds under applicable data protection law.",
          ],
        },
      ],
    },
  },
};

/**
 * NOTA: `en` NO lleva `as const` a propósito. Con `as const` cada valor sería un
 * tipo literal (`"Sign in"`) y ninguna traducción podría satisfacer el tipo.
 * Sin él, TypeScript ensancha a `string` y `Dictionary` describe la ESTRUCTURA,
 * que es justo lo que queremos verificar en `es.ts`.
 */
export type Dictionary = typeof en;
