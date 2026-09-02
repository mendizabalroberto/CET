---
id: rev-3-diccionario-plan
model: chat
territory: [apps/web/src/lib/i18n/dictionaries/es.ts, apps/web/src/lib/i18n/dictionaries/en.ts]
forbidden: [apps/web/src/lib/plan, apps/web/src/components, apps/web/src/app, packages/ui/src/index.ts]
context: [apps/web/src/lib/i18n/dictionaries/es.ts, apps/web/src/lib/i18n/dictionaries/en.ts, apps/web/src/lib/i18n/claves-del-plan.test.ts]
verify: pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/lib/i18n && pnpm --filter @cet/web exec vitest run src/lib/i18n/claves-del-plan src/components/tutor/PlanDeEstudio
rounds: 3
deadline: 3 rondas o 20 min
---

## 1 · El problema

La pantalla del plan del tutor va a ganar acuses de éxito, cancelar plan,
descartar boletín, histórico de boletines y próximos eventos del calendario; y
la pantalla de login necesita decir a los padres por dónde entran. Ninguna de
esas frases existe en los diccionarios. Este contrato SOLO añade claves, en
los dos idiomas, con paridad exacta.

## 2 · La evidencia que ya tenemos

- `es.ts` es la fuente del tipo `Dictionary`; `en.ts` debe tener las mismas
  claves o `typecheck` falla. Por eso el verify es el tipado.
- El bloque `tutor.child.plan` está en `es.ts` ~línea 363 y en `en.ts` ~382.
  `tutor.errors` en `es.ts` ~572 y `en.ts` ~640. `auth.chooseRole` en
  `es.ts` ~210.
- Tono de la casa (cabecera de `(tutor)/layout.tsx`): un padre no es personal
  técnico. Frases cortas, sin jerga, sin «registro», «entidad» ni «operación».
  Interpolación con `{name}` (ver `activeRange`, `windowLine` del mismo bloque).
- Los textos en `es.ts` van con tildes escapadas `í` como el resto del
  fichero, o con la tilde literal si el fichero ya mezcla; respeta lo que veas
  en el bloque donde escribes.

## 3 · El criterio de aceptación

El `verify` sale en 0 y existen, en `es.ts` Y en `en.ts`, exactamente estas
claves nuevas (los valores en inglés son traducción natural, no literal):

Dentro de `tutor.child.plan`:
- `success: { planBoletinExtraido, planBoletinConfirmado, planPropuesto, planCreado, planCancelado, boletinDescartado }` — acuses de una frase.
  es: «Hemos leído las notas del boletín. Revísalas y confírmalas.» / «Notas confirmadas.» / «Aquí tienes la propuesta.» / «Plan creado. {name} lo verá en «Hoy».» / «Plan cancelado. {name} ya no tendrá tareas de este plan.» / «Boletín descartado.»
- `cancelTitle`: «Cancelar este plan» · `cancelBody`: «{name} dejará de ver las tareas de este plan. Lo hecho hasta hoy se conserva.» · `cancelButton`: «Cancelar el plan» · `cancelConfirm`: «Sí, cancelar» · `cancelKeep`: «No, dejarlo» · `cancelling`: «Cancelando…»
- `discardButton`: «Descartar este boletín» · `discarding`: «Descartando…» · `discardHelp`: «Solo se puede descartar un boletín que aún no has confirmado.»
- `historyTitle`: «Boletines anteriores» · `historyEmpty`: «Todavía no hay boletines anteriores.» · `historyLine`: «{term} · {count} materias · {date}» · `historyCurrent`: «Este es el actual» · `historyTermUnknown`: «Trimestre sin fecha»
- `calendarTitle`: «Próximas fechas del colegio» · `calendarEmpty`: «No hay fechas señaladas en los próximos dos meses.» · `calendarRange`: «Del {from} al {to}» · `calendarDay`: «El {date}»
- `calendarTypes: { feriado, sin_clases, examenes_finales, vacaciones, fin_trimestre, hito_cambridge }` — es: «Feriado», «Sin clases», «Exámenes finales», «Vacaciones», «Fin de trimestre», «Examen de Cambridge».

Dentro de `tutor.errors`:
- `planNoActivo`: «Ese plan ya no estaba activo.»
- `planBoletinConfirmadoNoSeDescarta`: «Un boletín confirmado no se descarta: es parte de la historia de {name}.»

Dentro de `auth.chooseRole` (cambiar valores, no nombres):
- `staff`: «Soy profesor, administrador o familia» / en: «I am a teacher, administrator or parent»
- `staffHint`: «Entras con tu correo electrónico y tu contraseña» / en: «You sign in with your email and password»

Y en `auth`, un bloque nuevo `sesionCaducada: { title, body, button }`:
es: «Tu sesión ha caducado» / «Vuelve a entrar para seguir.» / «Entrar de nuevo».

## 4 · Qué NO cuenta como resuelto

- Una clave en un idioma y no en el otro.
- Renombrar o borrar claves que ya existen (otras pantallas las usan).
- Tocar cualquier fichero fuera de los dos diccionarios.
- Frases con jerga técnica o en un tono distinto al del bloque.
- Decir «debería pasar». Ejecuta el verificador y pega su salida literal.

## 5 · El test que manda

`apps/web/src/lib/i18n/claves-del-plan.test.ts` lista cada clave y hoy está en
rojo. Tu parche lo pone en verde. Léelo: ahí están los nombres exactos, la
exigencia de `{name}` en tres frases y que `auth.chooseRole.staff` mencione a
la familia («familia» en es, «parent» en en).
