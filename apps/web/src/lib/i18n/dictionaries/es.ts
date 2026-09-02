/**
 * Diccionario en español.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El tipo `Dictionary` viene de `en.ts`: si falta una clave o sobra, el
 * `typecheck` falla. Esa es toda la garantía de que no queda ningún string sin
 * traducir (AD-7).
 *
 * Registro: los textos dirigidos a alumnos de primaria se tutean y usan frases
 * cortas. Los textos legales y los dirigidos a personal docente usan un registro
 * formal. No es inconsistencia, es adecuación al lector.
 */
import type { Dictionary } from "./en";

export const es: Dictionary = {
  common: {
    appName: "Cambridge Exam Trainer",
    shortName: "CET",
    tagline: "La plataforma que sostiene las lecciones.",
    back: "Atrás",
    next: "Siguiente",
    continue: "Continuar",
    cancel: "Cancelar",
    loading: "Cargando…",
    submit: "Enviar",
    close: "Cerrar",
    signOut: "Salir",
    skipToContent: "Saltar al contenido principal",
    languageLabel: "Idioma",
    languageEnglish: "English",
    languageSpanish: "Español",
    themeLabel: "Tema",
    themeLight: "Claro",
    themeDark: "Oscuro",
    themeSystem: "Sistema",
  },
  /**
   * Barra inferior del alumno. Tres destinos y ni uno más: un niño de once años
   * tiene que llegar a cualquier sitio con un toque, y cada pestaña de más
   * estrecha el blanco en una tableta compartida.
   */
  studentNav: {
    label: "Secciones",
    learn: "Aprender",
    practice: "Practicar",
    exam: "Exámenes",
    account: "Mi cuenta",
    /** Sufijo para lector de pantalla en la pestaña activa. El punto no dice nada. */
    current: "estás aquí",
    backTo: "Volver a {section}",
  },
  account: {
    title: "Mi cuenta",
    subtitle: "Tus datos y cómo entras.",
    name: "Nombre",
    code: "Código de alumno",
    school: "Colegio",
    role: "Rol",
    language: "Idioma",
    changePin: "Cambiar mi PIN",
    changePinHint: "Seis dígitos. Nadie más debe saberlo, ni tu mejor amigo.",
    changePassword: "Cambiar mi contraseña",
    changePasswordHint: "Te pedirá la actual.",
  },
  nav: {
    platform: "Plataforma",
    subjects: "Materias",
    howItWorks: "Cómo funciona",
    forSchools: "Para colegios",
    login: "Entrar",
    register: "Solicitar acceso",
    menu: "Menú",
  },
  footer: {
    copyright: "© 2026 Roberto Mendizabal. Todos los derechos reservados.",
    legal: "Legal",
    privacy: "Privacidad",
    terms: "Términos",
    product: "Producto",
    builtOn: "Construido sobre los Exam Trainers de Y6A.",
    dataNote: "Los datos de los alumnos se minimizan, se cifran y se auditan.",
  },
  landing: {
    hero: {
      eyebrow: "Aprendizaje y evaluación multi-colegio",
      titleLead: "Lecciones que enseñan.",
      titleAccent: "Exámenes que se pueden demostrar.",
      subtitle:
        "Lecciones estructuradas, práctica con feedback inmediato y simulacros cronometrados — sobre una plataforma de identidad, contenido y telemetría hecha para colegios, no sobre una página que lo olvida todo al cerrarla.",
      ctaPrimary: "Entrar",
      ctaSecondary: "Solicitar acceso para tu colegio",
      note: "Los alumnos entran con el código de su colegio y un PIN. No hace falta correo electrónico.",
    },
    stats: {
      subjects: "Materias",
      subjectsValue: "6",
      reconstruct: "Reconstrucción del intento",
      reconstructValue: "100%",
      feedback: "Feedback en práctica",
      feedbackValue: "<50 ms",
      locales: "Idiomas",
      localesValue: "ES / EN",
    },
    pillars: {
      title: "Lo que añade la plataforma",
      subtitle: "La pedagogía ya funcionaba. Lo que faltaba era todo lo que va debajo.",
      items: {
        identity: {
          title: "Identidad pensada para niños",
          body: "El alumno entra con su colegio, su código de alumno y un PIN — cuatro dígitos en primaria, seis en secundaria. Sin correo, sin contraseña que olvidar, sin un solo dato personal que no necesitemos.",
        },
        engine: {
          title: "Un motor de examen híbrido",
          body: "La práctica corre en el navegador: feedback instantáneo que aguanta una red de colegio inestable. Los exámenes corren en el servidor, donde la clave de corrección nunca sale de la base de datos.",
        },
        forensics: {
          title: "Intentos que se pueden reconstruir",
          body: "De cualquier examen terminado podemos reproducir exactamente qué vio el alumno, en qué orden, qué versión de cada pregunta, qué respondió, cuándo y cuántas veces cambió de opinión.",
        },
        adaptive: {
          title: "Telemetría que se convierte en enseñanza",
          body: "Cada pista, cada duda y cada corrección quedan registradas contra una taxonomía de destrezas, de modo que las debilidades aparecen como evidencia y no como corazonada.",
        },
      },
    },
    subjects: {
      title: "Seis materias, una misma columna vertebral",
      subtitle:
        "Todas comparten la misma estructura de lección, el mismo bucle de práctica y el mismo motor de evaluación.",
      items: {
        math: {
          name: "Matemáticas",
          body: "Fracciones, decimales, medida, geometría y problemas — con generadores paramétricos, así que nadie practica dos veces la misma pregunta.",
        },
        science: {
          name: "Ciencias",
          body: "Investigaciones, circuitos, fuerzas, materiales y seres vivos, con diagramas interactivos.",
        },
        english: {
          name: "Inglés",
          body: "Tiempos verbales, pronombres, comprensión y escritura, con ejercicios de gramática dirigidos.",
        },
        spanish: {
          name: "Español",
          body: "Ortografía, acentuación, verbos y comprensión lectora, con corrección sensible a las tildes.",
        },
        socials: {
          name: "Ciencias Sociales",
          body: "Geografía, historia y civismo, articuladas sobre mapas y líneas del tiempo.",
        },
        ict: {
          name: "Informática",
          body: "Competencia digital, hojas de cálculo, presentaciones y uso seguro de la tecnología.",
        },
      },
    },
    how: {
      title: "Cómo es un trimestre",
      steps: {
        one: {
          title: "Aprender",
          body: "Lecciones divididas en reglas, ejemplos resueltos, consejos y avisos — la estructura que los trainers de Y6A ya demostraron que funciona.",
        },
        two: {
          title: "Practicar",
          body: "Preguntas generadas con feedback inmediato y solución paso a paso, tantas veces como haga falta.",
        },
        three: {
          title: "Hacer el simulacro",
          body: "Un examen cronometrado y autoritativo en el servidor. El reloj es el del servidor, no el del navegador.",
        },
        four: {
          title: "Ver la evidencia",
          body: "El profesor recibe el intento reconstruido pregunta a pregunta y el dominio por destreza.",
        },
      },
    },
    audience: {
      title: "Para quién es",
      student: {
        title: "Alumnos",
        body: "Un código, un PIN y todo lo que necesitas para repasar — en español o en inglés.",
      },
      teacher: {
        title: "Profesores",
        body: "Asigna un blueprint a una clase, ve llegar los intentos y califica lo que no se puede calificar solo.",
      },
      admin: {
        title: "Administradores de colegio",
        body: "Aprueba registros, gestiona clases y audita cada acceso del personal a datos de alumno.",
      },
    },
    cta: {
      title: "Llévalo a tu colegio",
      body: "Las solicitudes de registro las revisa un administrador antes de crear ninguna cuenta. Ningún colegio se da de alta automáticamente.",
      button: "Solicitar acceso",
      secondary: "¿Ya tienes código? Entra",
    },
  },
  auth: {
    chooseRole: {
      title: "¿Cómo vas a entrar?",
      subtitle: "Elige la opción que te describe.",
      student: "Soy alumno o alumna",
      studentHint: "Tienes un código de alumno y un PIN",
      staff: "Soy profesor o administrador",
      staffHint: "Entras con tu correo electrónico",
    },
    student: {
      stepOf: "Paso {current} de {total}",
      schoolStep: "Tu colegio",
      schoolLabel: "Elige tu colegio",
      schoolPlaceholder: "Selecciona tu colegio",
      schoolHelp: "Si tu colegio no está en la lista, pregunta a tu profesor.",
      codeStep: "Tu código de alumno",
      codeLabel: "Código de alumno",
      codePlaceholder: "Por ejemplo: Y6A-014",
      codeHelp: "Tu profesor te dio este código. No es tu nombre.",
      pinStep: "Tu PIN",
      pinLabel: "Escribe tu PIN",
      pinHelp4: "Tu PIN tiene 4 números.",
      pinHelp6: "Tu PIN tiene 6 números.",
      pinLengthToggle: "Mi PIN tiene {length} números",
      pinDigitLabel: "Número {index}",
      signIn: "Entrar",
      signingIn: "Entrando…",
      wrongPersonQuestion: "¿No eres tú?",
      startOver: "Empezar de nuevo",
    },
    staff: {
      title: "Acceso de personal",
      emailLabel: "Correo electrónico",
      emailPlaceholder: "tu@colegio.edu",
      passwordLabel: "Contraseña",
      signIn: "Entrar",
      signingIn: "Entrando…",
      forgot: "¿Has olvidado la contraseña?",
    },
    pinChange: {
      title: "Elige tu PIN nuevo",
      subtitle: "Es tu primera vez aquí, así que tienes que elegir un PIN que solo sepas tú.",
      currentLabel: "Tu PIN de ahora",
      newLabel: "Tu PIN nuevo",
      confirmLabel: "Escribe otra vez tu PIN nuevo",
      rules: "No uses 1234, ni tu cumpleaños, ni el mismo número repetido.",
      submit: "Guardar mi PIN nuevo",
      saving: "Guardando…",
      success: "Tu PIN se ha cambiado.",
    },
    errors: {
      badCredentials: "Ese código y ese PIN no van juntos. Míralos otra vez y vuelve a probar.",
      locked: "Has probado muchas veces. Espera unos minutos o pídele ayuda a tu profesor.",
      rateLimited: "Demasiados intentos desde este dispositivo. Espera un momento.",
      schoolUnavailable: "Ese colegio no está disponible ahora mismo. Pregunta a tu profesor.",
      pinMismatch: "Los dos PIN no son iguales. Prueba otra vez.",
      pinTooWeak: "Elige otro PIN — ese es muy fácil de adivinar.",
      pinWrongLength: "Tu PIN tiene que tener {length} números.",
      pinOnlyDigits: "Un PIN solo puede tener números.",
      staffBadCredentials: "Esos datos de acceso no son correctos.",
      required: "Rellena este campo, por favor.",
      unexpected: "Algo ha fallado por nuestra parte. Inténtalo otra vez.",
      sessionExpired: "Estuviste un rato fuera, así que cerramos tu sesión. Vuelve a entrar.",
    },
  },
  register: {
    title: "Solicitar acceso",
    subtitle:
      "Rellena esto y un administrador del colegio lo revisará. No se crea nada hasta que lo apruebe.",
    schoolLabel: "Colegio",
    schoolPlaceholder: "Selecciona el colegio",
    fullNameLabel: "Nombre completo del alumno",
    yearLevelLabel: "Curso",
    guardianEmailLabel: "Correo del padre, madre o tutor",
    guardianEmailHelp:
      "Es el único dato de contacto que pedimos, y se usa solo para confirmar la solicitud.",
    noteLabel: "Algo que el colegio deba saber (opcional)",
    consent:
      "Confirmo que soy el padre, madre, tutor o personal de este colegio, y que he leído la Política de Privacidad.",
    submit: "Enviar solicitud",
    submitting: "Enviando…",
    sentTitle: "Solicitud enviada",
    sentBody:
      "Un administrador del colegio la revisará. Si se aprueba, el colegio entregará el código de alumno y el PIN inicial en mano — nunca por correo electrónico.",
    backHome: "Volver a la página principal",
    errors: {
      consentRequired: "Confirma antes de enviar, por favor.",
      invalidEmail: "Eso no parece un correo electrónico.",
      generic: "No hemos podido enviar tu solicitud. Inténtalo otra vez.",
    },
  },
  tutor: {
    home: {
      title: "Mis hijos",
      empty: "Todav\u00eda no has a\u00f1adido a nadie.",
      emptyBody: "A\u00f1ade a tu hijo y te damos un enlace para mandarle.",
      add: "A\u00f1adir un hijo",
      noSchool: "Aprende en casa",
      linkActive: "Enlace listo para enviar",
      linkNone: "Ahora mismo no hay enlace",
      devices: "{count} aparato(s) recordado(s)",
      open: "Abrir",
    },
    add: {
      title: "A\u00f1adir un hijo",
      fullNameLabel: "Su nombre completo",
      birthDateLabel: "Fecha de nacimiento",
      birthDateHelp: "Solo la usamos para saber en qu\u00e9 curso est\u00e1. No la guardamos.",
      yearLevelLabel: "Curso",
      submit: "A\u00f1adir",
      submitting: "A\u00f1adiendo\u2026",
    },
    child: {
      linkTitle: "Su enlace de acceso",
      linkBody:
        "M\u00e1ndale este enlace a tu hijo. Sirve una vez: elige su PIN y ya est\u00e1 dentro.",
      linkGenerate: "Crear enlace",
      linkRegenerate: "Crear un enlace nuevo",
      linkRevoke: "Anular este enlace",
      linkCopy: "Copiar",
      linkCopied: "Copiado",
      linkOnce: "C\u00f3pialo ahora: por seguridad de tu hijo no volveremos a ense\u00f1\u00e1rtelo.",
      devicesTitle: "Aparatos que le recuerdan",
      devicesEmpty: "Ninguno todav\u00eda. El primero se recuerda cuando use su enlace.",
      devicesLastSeen: "Usado por \u00faltima vez {when}",
      devicesForget: "Olvidar este aparato",
      devicesForgetHelp:
        "Necesitar\u00e1 un enlace nuevo para volver a entrar en \u00e9l. \u00dasalo si se ha perdido o ya no es suyo.",
      pinTitle: "Su PIN",
      pinBody: "Si se le ha olvidado, crea un enlace nuevo y elegir\u00e1 otro.",
      back: "Volver a mis hijos",
      progress: {
        statsTitle: "Estos d\u00edas",
        effortTitle: "D\u00eda a d\u00eda",
        skillsTitle: "Lo que domina y lo que le cuesta",
        lessonsTitle: "En qu\u00e9 se le va el tiempo",
        emptyTitle: "C\u00f3mo va",
        emptyBody:
          "A\u00fan no hay nada que contar. En cuanto tu hijo entre y estudie un rato, aqu\u00ed ver\u00e1s su tiempo, lo constante que ha sido y c\u00f3mo le va cada destreza.",
        minutes: "Tiempo de estudio",
        sessions: "Veces que ha entrado",
        lessonsOpened: "Lecciones abiertas",
        lessonsCompleted: "Lecciones terminadas",
        answered: "Preguntas contestadas",
        accuracy: "Acertadas",
        streak: "Mejor racha",
        hints: "Pistas pedidas",
        exams: "Ex\u00e1menes entregados",
        effortSummary: "{total} en los \u00faltimos {window}. Ha estudiado {active}.",
        effortSummaryNone: "Sin estudio en los \u00faltimos {window}.",
        dayOne: "1 d\u00eda",
        dayMany: "{count} d\u00edas",
        dayStudied: "{day}: {minutes}",
        dayNone: "{day}: no estudi\u00f3",
        minutesUnit: "{count} min",
        hoursUnit: "{hours} h {minutes} min",
        percentValue: "{value} %",
      },
    },
    signUp: {
      title: "Crea tu cuenta",
      closedTitle: "A CET se entra por invitaci\u00f3n",
      closedBody:
        "Si has contratado el servicio, busca el enlace en tu correo. Es la \u00fanica forma de entrar.",
      emailLabel: "Tu correo",
      emailFixed:
        "Es la direcci\u00f3n a la que se envi\u00f3 la invitaci\u00f3n, as\u00ed que no se puede cambiar.",
      fullNameLabel: "Tu nombre",
      passwordLabel: "Elige una contrase\u00f1a",
      passwordHelp: "Al menos 10 caracteres. Que no la adivine nadie.",
      submit: "Crear cuenta",
      submitting: "Creando\u2026",
      doneSignInYourself: "Tu cuenta ya est\u00e1 lista. Entra con tu correo y tu contrase\u00f1a.",
    },
    redeem: {
      greeting: "Hola, {name}",
      title: "Elige tu PIN",
      body: "Piensa {length} n\u00fameros que te acuerdes. Los usar\u00e1s cada vez que vuelvas.",
      pinLabel: "Tu PIN nuevo",
      repeatLabel: "Escr\u00edbelo otra vez",
      submit: "Este es mi PIN",
      submitting: "Un momento\u2026",
      invalidTitle: "Este enlace ya no vale",
      invalidBody: "P\u00eddele otro a quien te lo mand\u00f3.",
    },
    errors: {
      nameRequired: "Escribe un nombre, por favor.",
      yearRange: "Elige un curso entre 1 y 13.",
      emailFormat: "Eso no parece un correo electr\u00f3nico.",
      passwordTooShort: "Un poco m\u00e1s larga, por favor: al menos 10 caracteres.",
      pinMismatch: "Los dos PIN no son iguales. Prueba otra vez.",
      pinTooEasy: "Ese PIN se adivina muy f\u00e1cil. Elige otro.",
      linkInvalid: "Este enlace ya no vale.",
      notFound: "No hemos encontrado eso.",
      generic: "No ha salido bien. Int\u00e9ntalo otra vez.",
    },
  },
  dashboard: {
    studentTitle: "Tu aprendizaje",
    staffTitle: "Docencia",
    adminTitle: "Administración",
    comingSoon:
      "Esta zona llega con el Hito 2: lecciones, práctica y exámenes cronometrados de Matemáticas de Y6.",
    signedInAs: "Sesión iniciada como {name}",
  },
  errors: {
    notFoundTitle: "No hemos encontrado esa página",
    notFoundBody: "Puede que el enlace sea antiguo o que no tengas acceso a él.",
    genericTitle: "Algo ha salido mal",
    genericBody: "El problema ha quedado registrado. Puedes volver a intentarlo.",
    retry: "Reintentar",
    goHome: "Ir a la página principal",
  },
  legal: {
    updated: "Última actualización: 26 de agosto de 2026",
    contents: "Contenido",
    privacy: {
      title: "Política de Privacidad",
      intro:
        "Cambridge Exam Trainer lo usan menores de edad. Ese único hecho condiciona todas las decisiones que siguen. Recogemos lo mínimo necesario para enseñar y para poder demostrar una nota, lo guardamos dentro del colegio al que pertenece, y registramos cada vez que un adulto lo consulta.",
      sections: [
        {
          heading: "Quién es responsable",
          paragraphs: [
            "La plataforma es propiedad de Roberto Mendizabal, que la opera. Cada colegio participante es el responsable del tratamiento de los datos de sus propios alumnos; la plataforma actúa como encargado del tratamiento siguiendo sus instrucciones.",
            "Un colegio puede solicitar la exportación o el borrado de sus datos en cualquier momento, y esa solicitud se atiende íntegramente, incluida la analítica derivada.",
          ],
        },
        {
          heading: "Qué recogemos de un alumno",
          paragraphs: [
            "Identidad: el colegio, un código de alumno emitido por el colegio, el curso y la clase, el nombre del alumno tal como lo tiene el colegio, y un PIN hasheado. No pedimos al alumno correo electrónico, teléfono, fotografía, fecha de nacimiento ni domicilio.",
            "Un correo electrónico de tutor, facilitado por el colegio o en la solicitud de registro, usado únicamente para confirmar la solicitud y para contactar con un adulto sobre la cuenta.",
            "Actividad de aprendizaje: qué lecciones se abrieron, qué preguntas se mostraron, qué se respondió, cuándo, cuánto se tardó, cuántas veces se cambió una respuesta y qué pistas se usaron. Esto es lo que hace posible una enseñanza personalizada.",
            "Intentos de examen: las preguntas exactas presentadas, su orden, la versión de cada pregunta, cada revisión de cada respuesta y la calificación aplicada.",
            "Datos técnicos: el agente de usuario del navegador y un hash irreversible y salado de la dirección IP. Nunca guardamos una IP en claro.",
          ],
        },
        {
          heading: "Qué no recogemos nunca",
          paragraphs: [
            "Ningún identificador publicitario, ninguna analítica de terceros, ningún píxel de redes sociales, ningún seguimiento entre sitios y ningún perfilado de conducta con fin distinto del aprendizaje del propio alumno. En esta plataforma no hay scripts de terceros, y por eso la política de seguridad de contenido los prohíbe de forma tajante.",
            "No vendemos, alquilamos ni compartimos datos de alumnos con nadie. No existe uso comercial alguno de los datos de menores.",
          ],
        },
        {
          heading: "Por qué podemos tratarlos",
          paragraphs: [
            "La base jurídica es el cumplimiento de la misión educativa que el colegio nos ha encomendado, bajo sus instrucciones. Cuando la base adecuada es el consentimiento, lo recaba el colegio del padre, madre o tutor antes de crear ninguna cuenta.",
          ],
        },
        {
          heading: "Quién puede verlos",
          paragraphs: [
            "Un alumno ve sus propios datos y ninguno más. Un profesor ve a los alumnos de su propio colegio. Un administrador ve su propio colegio. Nadie ve los datos de otro colegio.",
            "Esto se impone en la propia base de datos mediante seguridad a nivel de fila, en todas las tablas sin excepción, y no solo en la aplicación. Todo acceso del personal a datos de alumno se escribe en un registro de auditoría de solo adición con el actor, la acción, el registro y la marca de tiempo.",
          ],
        },
        {
          heading: "Cuánto tiempo los conservamos",
          paragraphs: [
            "Los intentos de examen y su reconstrucción se conservan mientras el colegio los necesite como registro académico, y después se borran. La telemetría detallada de interacción se conserva el curso actual más uno; luego se agrega en indicadores de dominio por destreza y los eventos en bruto se eliminan.",
            "Los registros de intentos de autenticación, que sirven para detectar ataques de fuerza bruta contra los PIN, se conservan 90 días.",
            "Cuando un alumno se va, el colegio puede solicitar el borrado; los identificadores personales se eliminan y el borrado se propaga en cascada a todos los registros dependientes.",
          ],
        },
        {
          heading: "Seguridad",
          paragraphs: [
            "Todo el tráfico va cifrado en tránsito con TLS y se fuerza mediante HTTP Strict Transport Security. Los datos se cifran en reposo. Los PIN se guardan como hashes Argon2id y no son legibles jamás, ni siquiera por un administrador; un profesor puede restablecer un PIN, pero nunca verlo.",
            "Los intentos fallidos repetidos bloquean la cuenta temporalmente en lugar de permitir que un atacante siga probando. Los mensajes de error del acceso son deliberadamente idénticos exista o no el código de alumno, de modo que la plataforma no se pueda usar para averiguar qué niños asisten a un colegio.",
          ],
        },
        {
          heading: "Cookies",
          paragraphs: [
            "Solo instalamos las cookies necesarias para mantener la sesión iniciada y recordar el idioma y el tema elegidos. No hay cookies de analítica ni de publicidad, y por eso no hay ningún banner de consentimiento que cerrar.",
          ],
        },
        {
          heading: "Tus derechos",
          paragraphs: [
            "El padre, madre o tutor puede solicitar, a través del colegio, acceder, rectificar, exportar o suprimir los datos de su hijo. Las solicitudes se responden en el plazo de un mes.",
            "Como el responsable es el colegio, las solicitudes se dirigen a él, que a su vez nos da instrucciones.",
          ],
        },
        {
          heading: "Contacto",
          paragraphs: [
            "Las cuestiones de protección de datos deben dirigirse en primera instancia al colegio. El colegio puede escalarlas al titular de la plataforma, Roberto Mendizabal.",
          ],
        },
      ],
    },
    terms: {
      title: "Términos del Servicio",
      intro:
        "Estos términos regulan el uso de Cambridge Exam Trainer por parte de los colegios, su personal y sus alumnos.",
      sections: [
        {
          heading: "Cuentas",
          paragraphs: [
            "Las cuentas las crea un colegio, no un registro libre. Una solicitud de registro es solo eso: no crea nada hasta que un administrador del colegio la aprueba.",
            "La cuenta de un alumno pertenece al colegio. Los códigos de alumno y los PIN son personales: no se comparten, y un alumno que descubra el PIN de otro debe decírselo a un profesor en lugar de usarlo.",
          ],
        },
        {
          heading: "Uso aceptable",
          paragraphs: [
            "La plataforma es para aprender y evaluar. No puede usarse para acosar a nadie, para intentar acceder a la cuenta de otra persona o a los datos de otro colegio, para interferir en un examen en curso, ni para sondear o poner a prueba la seguridad del servicio.",
            "Intentar extraer claves de corrección, manipular el reloj del examen o responder en nombre de otro alumno incumple estos términos y es detectable: todo intento es reconstruible a partir de los propios registros del servidor.",
          ],
        },
        {
          heading: "Integridad académica",
          paragraphs: [
            "Los exámenes son autoritativos en el servidor. El cronómetro, la selección de preguntas y la corrección son del servidor, y la clave de respuestas nunca llega al navegador. Cuando un intento muestre indicios de manipulación, el colegio puede anularlo.",
          ],
        },
        {
          heading: "Contenido y propiedad intelectual",
          paragraphs: [
            "La plataforma, su código fuente, su sistema de diseño y sus generadores de preguntas son propiedad de Roberto Mendizabal. Todos los derechos reservados. No se concede más licencia que el uso del servicio por un colegio autorizado.",
            "El material didáctico que suba un colegio sigue siendo propiedad de ese colegio. El material de la biblioteca global se licencia a los colegios participantes únicamente para su uso dentro de la plataforma.",
          ],
        },
        {
          heading: "Disponibilidad",
          paragraphs: [
            "Aspiramos a que la plataforma esté disponible siempre que un colegio la necesite, y en particular durante las ventanas de examen programadas, pero el servicio se presta sin garantía contractual de disponibilidad salvo acuerdo escrito aparte.",
            "Como los exámenes son autoritativos en el servidor, un intento interrumpido puede reanudarse: las respuestas se guardan de forma continua y el plazo lo custodia el servidor.",
          ],
        },
        {
          heading: "Suspensión",
          paragraphs: [
            "Una cuenta, o un colegio entero, puede suspenderse cuando se incumplan estos términos o cuando mantener el acceso ponga en riesgo los datos de otros usuarios. Los datos de un colegio suspendido se conservan y se devuelven; no se destruyen.",
          ],
        },
        {
          heading: "Cambios",
          paragraphs: [
            "Los cambios sustanciales en estos términos se notifican a los administradores de los colegios antes de que surtan efecto. El uso continuado después de esa fecha supone su aceptación.",
          ],
        },
        {
          heading: "Términos aplicables",
          paragraphs: [
            "Nada de lo aquí dispuesto limita los derechos que la normativa de protección de datos aplicable reconoce a un menor, a su padre, madre o tutor.",
          ],
        },
      ],
    },
  },
};
