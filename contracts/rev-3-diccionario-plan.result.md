# Resultado - rev-3-diccionario-plan
- Contrato: `contracts/rev-3-diccionario-plan.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 1 de 3
- Rama: `deepseek/rev-3-diccionario-plan`
- Duracion: 35.4 s
## Diff

~~~diff
diff --git a/apps/web/src/lib/i18n/dictionaries/en.ts b/apps/web/src/lib/i18n/dictionaries/en.ts
index 1c5cfe4..faa4e70 100644
--- a/apps/web/src/lib/i18n/dictionaries/en.ts
+++ b/apps/web/src/lib/i18n/dictionaries/en.ts
@@ -192,6 +192,11 @@ export const en = {
     },
   },
   auth: {
+    sesionCaducada: {
+      title: "Your session has expired",
+      body: "Sign in again to continue.",
+      button: "Sign in again",
+    },
     sesionAbierta: {
       yaDentro: "You are signed in as {name}.",
       continuar: "Continue",
@@ -203,8 +208,8 @@ export const en = {
       subtitle: "Choose the option that describes you.",
       student: "I am a student",
       studentHint: "You have a student code and a PIN",
-      staff: "I am a teacher or administrator",
-      staffHint: "You sign in with your email address",
+      staff: "I am a teacher, administrator or parent",
+      staffHint: "You sign in with your email and password",
     },
     student: {
       stepOf: "Step {current} of {total}",
@@ -380,6 +385,40 @@ export const en = {
       plan: {
         cardTitle: "Their study plan",
         title: "{name}'s study plan",
+        success: {
+          planBoletinExtraido: "We've read the grades on the report card. Check them and confirm.",
+          planBoletinConfirmado: "Grades confirmed.",
+          planPropuesto: "Here is the proposal.",
+          planCreado: "Plan created. {name} will see it under “Today”.",
+          planCancelado: "Plan cancelled. {name} won't have tasks from this plan any more.",
+          boletinDescartado: "Report card discarded.",
+        },
+        cancelTitle: "Cancel this plan",
+        cancelBody: "{name} will stop seeing the tasks from this plan. What's been done so far is kept.",
+        cancelButton: "Cancel the plan",
+        cancelConfirm: "Yes, cancel",
+        cancelKeep: "No, keep it",
+        cancelling: "Cancelling…",
+        discardButton: "Discard this report card",
+        discarding: "Discarding…",
+        discardHelp: "You can only discard a report card you haven't confirmed yet.",
+        historyTitle: "Previous report cards",
+        historyEmpty: "There are no previous report cards yet.",
+        historyLine: "{term} · {count} subjects · {date}",
+        historyCurrent: "This is the current one",
+        historyTermUnknown: "Term without a date",
+        calendarTitle: "Upcoming school dates",
+        calendarEmpty: "No marked dates in the next two months.",
+        calendarRange: "From {from} to {to}",
+        calendarDay: "On {date}",
+        calendarTypes: {
+          feriado: "Holiday",
+          sin_clases: "No classes",
+          examenes_finales: "Final exams",
+          vacaciones: "Vacation",
+          fin_trimestre: "End of term",
+          hito_cambridge: "Cambridge exam",
+        },
         intro:
           "Upload the school report card. We read the grades, you confirm them, and a plan is proposed using the lessons and practice that actually exist here.",
         uploadTitle: "The report card",
@@ -645,6 +684,8 @@ export const en = {
       planSinConfirmar: "Confirm the grades first.",
       planNotaInvalida: "Grades go from 0 to 100.",
       planSinContenido: "None of the graded subjects has content here yet, so there's nothing to plan.",
+      planNoActivo: "That plan was no longer active.",
+      planBoletinConfirmadoNoSeDescarta: "A confirmed report card can't be discarded: it's part of {name}'s history.",
       generic: "That didn't work. Please try again.",
     },
   },
diff --git a/apps/web/src/lib/i18n/dictionaries/es.ts b/apps/web/src/lib/i18n/dictionaries/es.ts
index 7354563..54a2c45 100644
--- a/apps/web/src/lib/i18n/dictionaries/es.ts
+++ b/apps/web/src/lib/i18n/dictionaries/es.ts
@@ -198,6 +198,11 @@ export const es: Dictionary = {
     },
   },
   auth: {
+    sesionCaducada: {
+      title: "Tu sesión ha caducado",
+      body: "Vuelve a entrar para seguir.",
+      button: "Entrar de nuevo",
+    },
     sesionAbierta: {
       // «{name}» lo sustituye el componente. Se nombra a la persona porque el
       // caso real es tener dos cuentas propias: sin el nombre, el aviso no
@@ -212,8 +217,8 @@ export const es: Dictionary = {
       subtitle: "Elige la opción que te describe.",
       student: "Soy alumno o alumna",
       studentHint: "Tienes un código de alumno y un PIN",
-      staff: "Soy profesor o administrador",
-      staffHint: "Entras con tu correo electrónico",
+      staff: "Soy profesor, administrador o familia",
+      staffHint: "Entras con tu correo electrónico y tu contraseña",
     },
     student: {
       stepOf: "Paso {current} de {total}",
@@ -363,6 +368,40 @@ export const es: Dictionary = {
       plan: {
         cardTitle: "Su plan de estudio",
         title: "El plan de estudio de {name}",
+        success: {
+          planBoletinExtraido: "Hemos leído las notas del boletín. Revísalas y confírmalas.",
+          planBoletinConfirmado: "Notas confirmadas.",
+          planPropuesto: "Aquí tienes la propuesta.",
+          planCreado: "Plan creado. {name} lo verá en «Hoy».",
+          planCancelado: "Plan cancelado. {name} ya no tendrá tareas de este plan.",
+          boletinDescartado: "Boletín descartado.",
+        },
+        cancelTitle: "Cancelar este plan",
+        cancelBody: "{name} dejará de ver las tareas de este plan. Lo hecho hasta hoy se conserva.",
+        cancelButton: "Cancelar el plan",
+        cancelConfirm: "Sí, cancelar",
+        cancelKeep: "No, dejarlo",
+        cancelling: "Cancelando…",
+        discardButton: "Descartar este boletín",
+        discarding: "Descartando…",
+        discardHelp: "Solo se puede descartar un boletín que aún no has confirmado.",
+        historyTitle: "Boletines anteriores",
+        historyEmpty: "Todavía no hay boletines anteriores.",
+        historyLine: "{term} · {count} materias · {date}",
+        historyCurrent: "Este es el actual",
+        historyTermUnknown: "Trimestre sin fecha",
+        calendarTitle: "Próximas fechas del colegio",
+        calendarEmpty: "No hay fechas señaladas en los próximos dos meses.",
+        calendarRange: "Del {from} al {to}",
+        calendarDay: "El {date}",
+        calendarTypes: {
+          feriado: "Feriado",
+          sin_clases: "Sin clases",
+          examenes_finales: "Exámenes finales",
+          vacaciones: "Vacaciones",
+          fin_trimestre: "Fin de trimestre",
+          hito_cambridge: "Examen de Cambridge",
+        },
         intro:
           "Sube el bolet\u00edn del colegio. Leemos las notas, t\u00fa las confirmas, y se propone un plan con las lecciones y la pr\u00e1ctica que de verdad existen aqu\u00ed.",
         uploadTitle: "El bolet\u00edn",
@@ -577,6 +616,8 @@ export const es: Dictionary = {
       planSinConfirmar: "Confirma primero las notas.",
       planNotaInvalida: "Las notas van de 0 a 100.",
       planSinContenido: "Ninguna de las materias con nota tiene contenido aqu\u00ed todav\u00eda, as\u00ed que no hay nada que planificar.",
+      planNoActivo: "Ese plan ya no estaba activo.",
+      planBoletinConfirmadoNoSeDescarta: "Un boletín confirmado no se descarta: es parte de la historia de {name}.",
       generic: "No ha salido bien. Int\u00e9ntalo otra vez.",
     },
   },

~~~

## Salida final de `pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/lib/i18n && pnpm --filter @cet/web exec vitest run src/lib/i18n/claves-del-plan src/components/tutor/PlanDeEstudio`

~~~

> @cet/web@0.1.0 typecheck D:\.cet-worktrees\rev-3-diccionario-plan\apps\web
> tsc --noEmit


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/rev-3-diccionario-plan/apps/web[39m

 [32m✓[39m src/lib/i18n/claves-del-plan.test.ts [2m([22m[2m39 tests[22m[2m)[22m[90m 4[2mms[22m[39m
 [32m✓[39m src/components/tutor/PlanDeEstudio.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[90m 63[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m43 passed[39m[22m[90m (43)[39m
[2m   Start at [22m 16:47:21
[2m   Duration [22m 853ms[2m (transform 102ms, setup 302ms, collect 76ms, tests 67ms, environment 341ms, prepare 154ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.