/**
 * Diccionario del personal (panel del profesor, visor forense, corrección
 * manual y administración).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Tipado contra `StaffDictionary`: añadir una clave en `staff.en.ts` y
 * olvidarla aquí es un error de compilación, no una cadena en inglés que
 * aparece en la pantalla de un profesor hispanohablante.
 */
import type { StaffDictionary } from "./staff.en";

export const staffEs: StaffDictionary = {
  nav: {
    teach: "Docencia",
    admin: "Administración",
    attempts: "Intentos",
    backToTeach: "Volver al panel de docencia",
    backToAttempt: "Volver al intento",
    sectionLabel: "Secciones del personal",
  },

  common: {
    student: "Alumno",
    students: "Alumnos",
    section: "Clase",
    exam: "Examen",
    status: "Estado",
    score: "Nota",
    unknown: "Desconocido",
    none: "—",
    notAvailable: "No disponible",
    yes: "Sí",
    no: "No",
    of: "de",
    points: "puntos",
    view: "Ver",
    reason: "Motivo",
    time: "Hora",
    date: "Fecha",
    actor: "Realizado por",
    action: "Acción",
    entity: "Registro",
    loading: "Cargando…",
    timezoneNote:
      "Todas las horas se muestran en la zona horaria del colegio ({timezone}), con el reloj del servidor.",
  },

  attemptStatus: {
    in_progress: "En curso",
    submitted: "Entregado",
    grading: "Corrigiéndose",
    graded: "Calificado",
    abandoned: "Abandonado",
    voided: "Anulado",
  },

  submittedBy: {
    student: "Cerrado por el alumno",
    timer: "Cerrado por el cronómetro",
    teacher: "Cerrado por un profesor",
    system: "Cerrado por el sistema",
  },

  responseSource: {
    typed: "Escrito",
    selected: "Seleccionado",
    autosave: "Autoguardado",
    restored: "Restaurado tras una reconexión",
  },

  gradingMode: {
    auto: "Automática",
    partial: "Crédito parcial",
    manual: "Manual",
  },

  gradedBy: {
    auto: "Calificado automáticamente",
    manual: "Calificado a mano",
  },

  teach: {
    title: "Panel de docencia",
    subtitle: "Tus clases, tus alumnos y cómo van sus exámenes.",
    statsCaption: "Totales de intentos en tus clases",
    stats: {
      submitted: "Entregados",
      inProgress: "En curso",
      notStarted: "Sin empezar",
      averageScore: "Nota media",
      averageScoreHint:
        "Media de los intentos ya calificados. Los que siguen en curso no cuentan.",
      notStartedHint: "Alumnos con un examen asignado que todavía no lo han abierto.",
    },
    classes: {
      title: "Tus clases",
      caption: "Clases que impartes, con matrícula y actividad de examen",
      name: "Clase",
      yearLevel: "Curso",
      academicYear: "Año académico",
      studentCount: "Alumnos",
      assignmentCount: "Exámenes asignados",
      empty: "Todavía no estás asignado a ninguna clase.",
      emptyBody:
        "Es la administración del colegio quien asigna profesores a las clases. Hasta entonces este panel no tiene nada que enseñarte.",
    },
    assignments: {
      title: "Exámenes asignados",
      caption: "Exámenes asignados a tus clases, con su avance",
      exam: "Examen",
      section: "Clase",
      window: "Ventana",
      opens: "Abre",
      closes: "Cierra",
      progress: "Avance",
      submitted: "Entregados",
      inProgress: "En curso",
      notStarted: "Sin empezar",
      averageScore: "Media",
      empty: "No hay exámenes asignados a tus clases.",
      emptyBody:
        "En cuanto se asigne un examen, su avance aparecerá aquí a medida que los alumnos lo hagan.",
    },
    attempts: {
      title: "Intentos recientes",
      caption: "Los intentos de examen más recientes del colegio",
      openLabel: "Reconstruir este intento",
      started: "Iniciado",
      submitted: "Entregado",
      empty: "Todavía no hay intentos.",
      emptyBody: "En cuanto un alumno abra un examen asignado, su intento aparecerá aquí.",
    },
    weakSkills: {
      title: "Destrezas más flojas del colegio",
      subtitle:
        "Agregado desde el mastery de cada alumno. Las destrezas con menos de {minObservations} observaciones quedan fuera: dos respuestas no son un diagnóstico.",
      caption: "Destrezas ordenadas de más floja a más sólida",
      skill: "Destreza",
      mastery: "Dominio medio",
      studentsTracked: "Alumnos observados",
      observations: "Observaciones",
      empty: "Todavía no hay evidencia suficiente.",
      emptyBody:
        "El dominio se construye con preguntas respondidas. Cuando tus clases hayan practicado, aquí aparecerán las destrezas más flojas.",
      lowConfidence: "Confianza baja",
    },
  },

  attempt: {
    title: "Reconstrucción del intento",
    subtitle: "Exactamente qué vio este alumno, en qué orden y qué hizo con ello.",
    heading: "{student} · {exam}",
    notFound: "Ese intento no existe, o no pertenece a tu colegio.",
    summary: {
      caption: "Resumen del intento",
      student: "Alumno",
      studentCode: "Código de alumno",
      exam: "Examen",
      section: "Clase",
      attemptNumber: "Número de intento",
      status: "Estado",
      startedAt: "Inicio (reloj del servidor)",
      deadlineAt: "Límite del servidor",
      submittedAt: "Entrega",
      gradedAt: "Calificación",
      score: "Nota",
      passed: "Aprobado",
      questions: "Preguntas",
      notGradedYet: "Todavía sin calificar",
    },
    warnings: {
      inProgressTitle: "Este intento sigue abierto",
      inProgressBody:
        "El alumno no ha entregado. Lo que hay debajo son las revisiones guardadas hasta ahora y todavía no hay notas: estás leyendo una foto en vivo, no un examen terminado.",
      voidedTitle: "Este intento está anulado",
      voidedBody:
        "Un intento anulado no cuenta para el expediente del alumno. Se conserva, y se puede reconstruir, precisamente para poder explicar la decisión de anularlo.",
      abandonedTitle: "Este intento se abandonó",
      abandonedBody:
        "El alumno nunca entregó y la ventana se cerró. Debajo está lo que quedó autoguardado.",
      gradingTitle: "Corrección en curso",
      gradingBody: "Puede que algunas preguntas todavía no tengan nota.",
    },
    telemetry: {
      title: "Telemetría del intento",
      subtitle:
        "Derivada de los eventos de aprendizaje registrados en este intento, con el reloj del servidor.",
      caption: "Totales de telemetría del intento",
      totalTime: "Tiempo en preguntas",
      hintsRequested: "Pistas pedidas",
      idleTime: "Tiempo inactivo",
      focusLosses: "Pérdidas de foco",
      focusLossesHint:
        "Veces que la pestaña del examen perdió el foco. Por sí solo no demuestra nada.",
      revisits: "Vueltas a una pregunta",
      noEvents: "No se registró telemetría de este intento.",
      noEventsBody:
        "O el navegador del alumno no pudo alcanzar el endpoint de eventos, o este intento es anterior a la telemetría. Las respuestas y las notas de abajo no se ven afectadas: vienen del motor de examen, no del navegador.",
    },
    item: {
      heading: "Pregunta {ord} de {total}",
      stemLabel: "Lo que vio el alumno",
      optionsLabel: "El orden en que se le mostraron las opciones",
      optionsCaption: "Opciones tal como se presentaron, con su posición en el banco",
      positionColumn: "Posición vista",
      optionColumn: "Opción",
      bankColumn: "En el banco",
      chosenColumn: "Elegida",
      chosen: "Elegida",
      notChosen: "No elegida",
      selectionSentence:
        "Eligió la opción {position} de las {total} que vio, que era «{text}».",
      selectionSentenceMulti: "Eligió {count} de las {total} opciones que vio:",
      selectionEmpty: "Dejó esta pregunta en blanco.",
      selectionUnreadable:
        "La respuesta guardada no coincide con ninguna opción de las que vio. Debajo está el valor en bruto.",
      bankPosition: "posición {position} en el banco",
      bankPositionUnknown: "posición en el banco desconocida",
      orderMissing:
        "No se registró ninguna permutación de opciones para esta pregunta, así que las posiciones de abajo no se pueden mapear al banco.",
      orderInvalid:
        "La permutación registrada no encaja con las opciones que se mostraron. Las posiciones de abajo son las que vio el alumno; el mapeo al banco no es fiable.",
      version: "Versión {version} de esta pregunta",
      versionLink: "Abrir en el banco de preguntas",
      versionUnknown: "Versión de la pregunta no disponible",
      format: "Formato",
      gradingModeLabel: "Corrección",
      difficulty: "Dificultad",
      maxPoints: "Vale",
      skill: "Destreza",
      figureAlt: "Figura mostrada con esta pregunta",
      rawResponse: "Valor guardado en bruto",
    },
    timeline: {
      title: "Cada revisión de su respuesta",
      subtitle:
        "Una fila por cada cambio guardado, con el reloj del servidor. Así se ve que cambió de opinión.",
      caption: "Revisiones de la respuesta, en orden",
      revision: "Revisión",
      whatTheyWrote: "Lo que se guardó",
      when: "Cuándo (servidor)",
      clientWhen: "Reloj del navegador",
      via: "Vía",
      timeOnItem: "Tiempo en la pregunta",
      isFinal: "Final",
      empty: "Esta pregunta nunca se respondió.",
      changedMindOnce: "Guardó una sola respuesta.",
      changedMind: "Cambió de opinión {count} veces.",
      clockSkew: "El reloj del navegador difería del servidor en {skew}.",
    },
    grading: {
      title: "Calificación",
      subtitle: "Incluidas todas las recalificaciones, de la más antigua a la más nueva.",
      caption: "Cadena de calificación de esta pregunta",
      points: "Puntos",
      by: "Calificado por",
      when: "Cuándo",
      rationale: "Justificación",
      noRationale: "No se registró ninguna justificación.",
      superseded: "Sustituida",
      effective: "Nota vigente",
      chainNote:
        "Esta nota se ha revisado {count} veces. Se muestra la cadena completa; la última fila es la que cuenta.",
      empty: "Todavía sin calificar.",
      emptyManual: "Pendiente de corrección manual.",
      gradeLink: "Corregir a mano",
      correct: "Correcta",
      incorrect: "Incorrecta",
      partial: "Crédito parcial",
      grader: "Corrector",
      unknownGrader: "El corrector ya no está en el sistema",
    },
    answerKey: {
      title: "Clave de respuesta",
      warning:
        "Revelar la clave de respuesta queda registrado en el audit log con tu nombre y la hora. Hazlo solo cuando la necesites.",
      reveal: "Revelar la clave de respuesta",
      revealing: "Solicitando…",
      hide: "Ocultar",
      shown: "Clave de respuesta de la pregunta {ord}",
      denied: "No tienes permiso para ver esta clave de respuesta.",
      failed: "No se ha podido obtener la clave de respuesta.",
      auditNote: "Esta consulta ha quedado registrada en el audit log.",
      notRequested:
        "Oculta. En esta página no se carga nada de la clave de respuesta hasta que la pidas.",
    },
  },

  grade: {
    title: "Corrección manual",
    subtitle:
      "Aquí solo se corrigen las preguntas cuyo modo de corrección es manual. Cada nota es un registro nuevo; nunca se sobrescribe nada.",
    heading: "{student} · {exam}",
    noManualItems: "Este intento no tiene ninguna pregunta que haya que corregir a mano.",
    noManualItemsBody:
      "Todas sus preguntas las corrige el motor automáticamente. Si una nota parece equivocada, todavía se puede recalificar desde la vista de reconstrucción.",
    notSubmitted: "Este intento todavía no se ha entregado.",
    notSubmittedBody:
      "Corregir un intento abierto sería poner nota a una respuesta que el alumno aún puede cambiar. Espera a que lo entregue.",
    voided: "Este intento está anulado y no se puede corregir.",
    itemHeading: "Pregunta {ord}",
    currentMark: "Nota actual",
    noCurrentMark: "Todavía sin nota",
    pointsLabel: "Puntos otorgados (de 0 a {max})",
    rationaleLabel: "Justificación",
    rationaleHint:
      "Escribe lo que un tutor necesitaría leer para entender esta nota. Se guarda con la nota y se muestra en la reconstrucción.",
    submit: "Guardar la nota",
    saving: "Guardando…",
    supersedesNote: "Esto sustituirá a la nota actual. La anterior se conserva en la cadena.",
    success: "Nota guardada.",
    errors: {
      invalidPoints: "Los puntos deben ser un número entre 0 y el máximo de la pregunta.",
      rationaleRequired:
        "La justificación es obligatoria. Una nota que nadie puede explicar no es una nota.",
      rationaleTooLong: "La justificación es demasiado larga (máximo {max} caracteres).",
      notManual: "Esta pregunta no se corrige a mano.",
      notFound: "Esa pregunta no forma parte de este intento.",
      forbidden: "No tienes permiso para corregir este intento.",
      attemptNotSubmitted: "El intento todavía no se ha entregado.",
      unexpected: "No se ha podido guardar la nota. No se ha cambiado nada.",
    },
  },

  admin: {
    title: "Administración",
    /**
     * Un superadmin no pertenece a ningún colegio —la base lo hace imposible a
     * propósito—, así que este panel le pregunta cuál quiere abrir.
     */
    schoolPicker: {
      body: "Eres superadmin, así que no perteneces a ningún colegio concreto. Elige el colegio cuyo panel quieres abrir.",
      empty: "Todavía no hay ningún colegio activo.",
      current: "Viendo {school}",
      change: "Cambiar de colegio",
    },
    subtitle: "Alumnos, solicitudes de acceso y rastro de auditoría de {school}.",
    tabs: {
      students: "Alumnos",
      registrations: "Solicitudes de acceso",
      audit: "Audit log",
    },
    inviteTutor: {
      title: "Invitar a un padre, madre o tutor",
      body:
        "Recibe un enlace para crear su cuenta. Sirve una vez y caduca a los siete d\u00edas.",
      emailLabel: "Su direcci\u00f3n de correo",
      submit: "Crear invitaci\u00f3n",
      submitting: "Creando\u2026",
      once: "C\u00f3pialo ahora: este enlace no se volver\u00e1 a mostrar.",
      copy: "Copiar",
      copied: "Copiado",
      sentTo: "Invitaci\u00f3n para {email}",
      errors: {
        emailFormat: "Eso no parece un correo electr\u00f3nico.",
        generic: "No se ha podido crear la invitaci\u00f3n. Int\u00e9ntalo otra vez.",
      },
    },
    /**
     * Familias. Este bloque NO habla de un colegio, y ahí está la gracia: un
     * hijo dado de alta por su tutor nace sin colegio (migración 0066), así que
     * ninguna tabla de colegio puede llegar a listarlo.
     */
    families: {
      title: "Familias",
      body:
        "Una familia no pertenece a ningún colegio, así que estos alumnos no salen en la tabla de ningún colegio. Aquí están todos.",
      timezoneNote:
        "Las horas se muestran en UTC. Una familia no tiene colegio, así que no hay zona horaria de colegio que aplicar.",
      summary: {
        families: "Familias con cuenta",
        children: "Hijos dados de alta",
        pendingInvites: "Invitaciones sin canjear",
      },
      guardian: "Padre, madre o tutor",
      noEmail: "Sin correo",
      childrenCaption: "Hijos de {guardian}",
      child: "Hijo",
      code: "Código",
      yearLevel: "Curso",
      stage: "Etapa",
      stagePrimary: "Primaria",
      stageSecondary: "Secundaria",
      device: "Dispositivo",
      deviceYes: "Activo",
      deviceNo: "Ninguno",
      link: "Enlace de acceso",
      linkLive: "Vivo, sin canjear",
      linkNone: "Ninguno",
      lastAccess: "Último acceso",
      never: "No ha entrado nunca",
      noChildren: "Todavía no ha dado de alta a ningún hijo.",
      /* ------------------------------------------------------------------
         Los accesos de un hijo. El vocabulario aquí es el de una persona que
         mira un rastro, no el de la base: `enlace_canjeado` es un identificador
         y «Canje del enlace» es lo que se lee. Las señales se traducen una a
         una en vez de pintarse crudas por el mismo motivo — `ip_multicuenta`
         no le dice nada a nadie que no haya leído la migración 0078.
         ------------------------------------------------------------------ */
      accesses: {
        toggle: "Accesos de {child} ({count})",
        caption: "Últimos accesos registrados de {child}",
        when: "Cuándo",
        kind: "Tipo",
        from: "Desde dónde",
        device: "Aparato",
        signals: "Señales",
        unknownPlace: "Sin ubicación",
        unknownDevice: "Sin aparato",
        noSignals: "Ninguna",
        /* Ningún acceso no es un error: es un hijo dado de alta que todavía no
           ha entrado. Se dice con una frase y no con una tabla vacía. */
        none: "Todavía no ha entrado ninguna vez.",
        kindRedeemed: "Canje del enlace",
        kindLoginOk: "Entrada correcta",
        kindLoginFailed: "Intento fallido",
        kindDeviceForgotten: "Aparato olvidado",
        signalNewDevice: "Aparato nuevo",
        signalCountryJump: "Salto de país",
        signalOutOfNetwork: "Canje fuera de red",
        signalSharedIp: "IP con varias cuentas",
        /* Por qué esta tabla no enseña la IP ni las coordenadas. Va en pantalla
           y no solo en un comentario: quien administre esto tiene que saber que
           el hueco es deliberado, o lo pedirá como si fuera una carencia. */
        privacyNote:
          "No se muestran ni la dirección IP ni las coordenadas. Son el centro de la ciudad, no la casa de nadie, y aparentarían una precisión que el dato no tiene.",
      },
      empty: "Todavía no hay ninguna familia con cuenta.",
      emptyBody:
        "En cuanto un tutor canjee su invitación y cree su cuenta, aparecerá aquí con sus hijos.",
      invites: {
        title: "Invitaciones pendientes",
        caption: "Tutores invitados que todavía no han creado su cuenta",
        email: "Correo",
        issued: "Emitida",
        expires: "Caduca",
        empty: "No hay ninguna invitación sin canjear.",
        emptyBody:
          "Las invitaciones que emitas aquí arriba esperan en esta lista hasta que el tutor cree su cuenta.",
        /* La lectura ha fallado. Decir aquí "no hay ninguna" sería mentir. */
        unavailable:
          "No se ha podido leer la cola de invitaciones. Eso no significa que esté vacía.",
      },
    },
    students: {
      title: "Alumnos",
      caption: "Alumnos matriculados en este colegio",
      name: "Nombre",
      code: "Código de alumno",
      yearLevel: "Curso",
      stage: "Etapa",
      section: "Clase",
      status: "Estado",
      locked: "Bloqueado",
      lockedUntil: "Bloqueado hasta {when}",
      notLocked: "Activo",
      failedAttempts: "Intentos de PIN fallidos",
      pinMustChange: "Debe cambiar el PIN",
      guardianEmail: "Email del tutor",
      empty: "Todavía no hay alumnos matriculados.",
      emptyBody: "Aprueba una solicitud de acceso, o da de alta a un alumno, para empezar.",
      actions: "Acciones",
      resetPin: "Regenerar PIN",
      unlock: "Desbloquear",
      addTitle: "Dar de alta a un alumno",
      addSubtitle:
        "El alumno entra con el colegio, su código y un PIN. No se pide correo electrónico: solo el del tutor, y solo si lo tienes.",
      fullName: "Nombre completo",
      studentCode: "Código de alumno",
      studentCodeHint: "Único dentro de este colegio. Letras, dígitos, punto, guion o guion bajo.",
      yearLevelLabel: "Curso (1–13)",
      stageLabel: "Etapa",
      stagePrimary: "Primaria",
      stageSecondary: "Secundaria",
      sectionLabel: "Clase (opcional)",
      guardianEmailLabel: "Email del tutor (opcional)",
      add: "Crear alumno",
      adding: "Creando…",
      pinOnce:
        "PIN de {name}: {pin}. Se muestra una sola vez y nunca más: apúntalo antes de salir de esta página. El alumno tendrá que cambiarlo en su primer acceso.",
      confirmResetPin: "¿Regenerar el PIN de {name}? El PIN actual deja de funcionar en el acto.",
      confirmUnlock: "¿Desbloquear a {name}? Su contador de intentos fallidos vuelve a cero.",
      unlocked: "{name} ha sido desbloqueado.",
      errors: {
        nameRequired: "El nombre completo es obligatorio.",
        codeFormat:
          "El código de alumno debe tener 2–32 caracteres: letras, dígitos, punto, guion o guion bajo.",
        codeTaken: "Ese código de alumno ya está en uso en este colegio.",
        yearRange: "El curso debe estar entre 1 y 13.",
        emailFormat: "Ese email del tutor no parece una dirección de correo.",
        notFound: "Ese alumno no está matriculado en este colegio.",
        unexpected: "La operación ha fallado. No se ha cambiado nada.",
      },
    },
    registrations: {
      title: "Solicitudes de acceso",
      caption: "Solicitudes pendientes de entrar en este colegio",
      requestedName: "Nombre",
      requestedYear: "Curso solicitado",
      guardianEmail: "Email del tutor",
      note: "Nota",
      requestedAt: "Solicitada",
      approve: "Aprobar",
      reject: "Rechazar",
      rejectReason: "Motivo del rechazo",
      rejectReasonHint: "Obligatorio. El motivo se guarda con la solicitud.",
      confirmApprove: "¿Aprobar a {name}? Se crea su ficha de alumno y un PIN inicial.",
      empty: "No hay solicitudes pendientes.",
      emptyBody: "Cuando alguien pida entrar en este colegio, su solicitud te esperará aquí.",
      approved: "{name} ha sido aprobado.",
      rejected: "La solicitud de {name} ha sido rechazada.",
      errors: {
        reasonRequired: "Hace falta un motivo para rechazar una solicitud.",
        alreadyReviewed: "Esa solicitud ya ha sido revisada.",
        // El alumno SÍ existe: decir "no se ha cambiado nada" sería mentir, y
        // quien lo leyera volvería a aprobar y crearía un segundo alumno.
        notMarked:
          "El alumno se ha creado, pero la solicitud no se ha podido marcar como aprobada. Compruébala en la cola antes de volver a aprobarla: hacerlo otra vez crearía un segundo alumno.",
        notFound: "Esa solicitud no pertenece a este colegio.",
        unexpected: "No se ha podido procesar la solicitud. No se ha cambiado nada.",
      },
    },
    audit: {
      title: "Audit log",
      subtitle:
        "Toda acción del personal sobre datos de alumno, de la más reciente a la más antigua. Append-only: las entradas no se pueden editar ni borrar, tampoco desde la plataforma.",
      caption: "Entradas del audit log",
      when: "Cuándo",
      actor: "Quién",
      actorRole: "Rol en ese momento",
      action: "Acción",
      entity: "Registro",
      entityId: "Id del registro",
      details: "Detalle",
      before: "Antes",
      after: "Después",
      showDetails: "Ver el detalle",
      hideDetails: "Ocultar el detalle",
      empty: "Todavía no se ha registrado nada.",
      emptyBody: "Las acciones del personal sobre datos de alumno aparecen aquí según ocurren.",
      filterAction: "Filtrar por acción",
      filterAll: "Todas las acciones",
      loadMore: "Ver entradas más antiguas",
      teacherDenied: "El audit log está disponible para la administración del colegio.",
    },
  },

  errors: {
    loadFailedTitle: "Esto no se ha podido cargar",
    loadFailedBody:
      "La consulta ha fallado. La referencia de abajo la identifica en los logs del servidor.",
    forbiddenTitle: "No disponible",
    forbiddenBody: "Este registro no pertenece a tu colegio.",
  },
};
