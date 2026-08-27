# REVIEW — área de personal (`(staff)` + `components/staff`)

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Pasada 2 del protocolo de 3 pasadas (MASTER_PLAN §7), adversarial, sobre el
> panel del profesor, la reconstrucción forense, la corrección manual y el
> panel de administración.

Cada hallazgo corregido lleva su marca `P2-n` como comentario en el código, en
el sitio exacto donde estaba el fallo. La marca no es decoración: si mañana
alguien "simplifica" esa línea, el comentario le dice por qué estaba así.

---

## 1. Las preguntas del enunciado, contestadas

### ¿Se puede ver un intento de otro colegio manipulando la URL?

**No, y hay cuatro barreras.** El `attemptId` de la URL es entrada del atacante
y se trata como tal:

1. `middleware` — `PROTECTED_AREAS` recorta `/teach` a staff y `/admin` a
   administración, con `onDeny: "not-found"`.
2. `(staff)/layout.tsx` — `requireRole` contra `profiles` con RLS activa, no
   contra los claims del JWT (un profesor suspendido conserva su claim hasta una
   hora; la consulta lo ve suspendido en el acto).
3. `page.tsx` — `requireRole` **otra vez**. Una página puede acabar bajo otro
   layout tras una refactorización, y esa suposición no puede ser lo único que
   protege los datos de un menor.
4. `loadAttemptReconstruction` — `.eq("school_id", …)` explícito **más** una
   comprobación redundante sobre la fila devuelta (`attempt.school_id !==
   schoolId → null`), **más** RLS en Postgres, que es la que manda.

Un intento ajeno y un intento inexistente devuelven **el mismo 404**.
Distinguirlos confirmaría al profesor curioso que ese intento existe.

`isUuid()` corta antes de llegar a PostgREST cualquier id malformado: sin eso,
un `attemptId` basura devuelve un 400 con el mensaje de error de Postgres, que
es información sobre el esquema.

### ¿Sale `answer_key` en el HTML sin pedirla?

**No.** `queries.ts` no nombra `answer_key` en ninguna lista de columnas — y no
podría leerla aunque quisiera: el `GRANT` por columna de `0013_grants.sql` se la
retira a `authenticated`, y alumnos y profesores comparten ese rol de Postgres.
El único camino es `app.attempt_item_answer_key(uuid)` (`security definer`,
comprueba rol y tenant fila a fila), invocado desde una Server Action al pulsar
un botón. Hasta ese momento no hay nada de la clave en el DOM ni en la carga RSC.

Ver **P2-1** y **P2-2** más abajo: la primera versión tenía dos grietas en esta
promesa, ninguna de ellas una fuga entre colegios, las dos reales.

### ¿La traducción de `option_order` es correcta o está invertida?

**Correcta, y verificada en las dos direcciones.** La semántica es

```
option_order[posiciónQueVioElAlumno] = índiceCanónicoEnElBanco
```

confirmada contra la fuente (`packages/engine/src/blueprint.ts`:
`order.map(i => options[i])`), contra el test SQL
(`supabase/tests/forensic_reconstruction.sql`, que comprueba que
`option_order[1]` es la opción del banco que se vio la primera) y contra el
contrato del motor de examen (`lib/exam/types.ts`: "las opciones ya llegan
barajadas en `renderedBody`").

La consecuencia práctica: `rendered_body.options` **ya está barajado**, así que
la posición vista es el índice en ese array y `option_order` solo sirve para
volver al banco. `invertPermutation()` existe como función con nombre
precisamente porque invertir eso mentalmente es el error clásico.

Los tests usan permutaciones **no simétricas** a propósito. `[1,0]` es su propia
inversa y habría pasado igual con el código al revés; `[2,0,1]` (inversa
`[1,2,0]`) no. Hay un test explícito —`"si se invirtiera el índice, el resultado
sería OTRO"`— que falla si alguien cambia la dirección.

### ¿Qué pasa con un intento `in_progress` (aún sin notas)?

- Aviso destacado arriba del todo, antes de que el profesor lea ninguna cifra:
  *"lo que estás leyendo es una foto en vivo, no un examen terminado"*.
- La nota del intento se pinta como `—` con la nota al pie "todavía sin
  calificar", **no como 0 %**. `totalEffectivePoints()` devuelve `null` cuando
  ningún item tiene nota, justamente para que cero y "sin calificar" no se
  confundan (hay test).
- Sin `is_final` en ninguna revisión, la frase "qué eligió" usa la **última
  revisión guardada**, que es lo último que el alumno llegó a dejar escrito.
- `/grade` se niega en redondo: corregir un intento abierto es poner nota a una
  respuesta que el alumno todavía puede cambiar. Bloqueado en la página *y* en
  la Server Action (`attemptNotSubmitted`).

### ¿Y con uno `voided`?

- Se reconstruye igual, con aviso: un intento anulado se conserva **para poder
  explicar por qué se anuló**. Ocultarlo sería destruir la prueba de la decisión.
- No se puede corregir. Bloqueado en la página y en la acción.

---

## 2. Hallazgos y correcciones

### P2-1 · Denegar la clave de respuesta no dejaba rastro — **corregido**

`revealAnswerKey` auditaba la concesión y auditaba el fallo del RPC, pero cuando
la comprobación previa "este item es de este intento y de tu colegio" fallaba,
**volvía sin auditar nada**. Es decir: el único camino que un atacante recorre
—pedir la clave de un item que no le corresponde— era exactamente el único que
no quedaba registrado.

Corregido: se escribe `attempt.answer_key_denied` con el motivo antes de
denegar. Un log forense está para recoger los intentos, no solo los éxitos.

### P2-2 · `solution` viajaba al navegador sin pedirla — **corregido**

La consulta de `question_versions` traía `hint` y `solution` "por si acaso".
Nada las pintaba, pero viajaban dentro de la carga RSC de `AttemptView`.
`solution` es el desarrollo completo de la respuesta (el `sol:` de los trainers
Y6A). El `GRANT` permite al profesor leerla, así que **no era una fuga entre
colegios**, pero contradecía de plano la promesa de la pantalla y vaciaba de
sentido el registro de auditoría del botón: si el desarrollo de la solución ya
estaba en el HTML, "revelar la clave" dejaba de ser un gesto deliberado.

Corregido: lo que no se pinta, no se pide.

### P2-3 · `blueprint_snapshot` entero, 500 veces — **corregido**

El panel del profesor traía `blueprint_snapshot` completo para hasta 500
intentos, y de ese jsonb usaba **solo el título**. El snapshot lleva las
secciones, la selección de items y los pesos: decenas de KB por fila cruzando la
red y serializándose al cliente para pintar una celda de texto. Lo mismo en la
reconstrucción, donde además viajaba al navegador dentro de las props.

Corregido con proyección en SQL (`exam_title:blueprint_snapshot->title`) en los
dos sitios.

### P2-4 · Una columna que mentía sobre lo que mostraba — **corregido**

La columna titulada "reloj del navegador" mostraba en realidad el **desfase**
respecto al servidor. Un profesor leería `+2 min 10 s` como si fuera una hora.
Corregido: se muestra la hora que dijo el navegador y, debajo, cuánto se
separaba del servidor.

Esto importa más de lo que parece: un portátil con el reloj adelantado genera
`client_ts` imposibles, y sin esta columna eso parece manipulación. El servidor
nunca puntúa con esos valores (DATA_MODEL §0), pero el profesor tiene que poder
verlos para no acusar a nadie por un reloj mal puesto.

### P2-5 · El PIN de un alumno recién aprobado se anunciaba como `pinOnce` — **corregido**

`approveRegistration` delega en `createStudent`, así que devuelve claves de
diccionario del ámbito `students` (`pinOnce`, `codeTaken`) desde un formulario
del ámbito `registrations`. La búsqueda de traducción miraba un solo ámbito, así
que el aviso salía con el **nombre de la clave en crudo** — y ese aviso es la
única vez que el PIN se muestra. Corregido buscando en los dos ámbitos.

### P2-6 · Todo alumno nuevo nacía en inglés — **corregido**

`createStudent` escribía `locale: "en"` fijo. En un colegio con
`default_locale = 'es'`, la primera pantalla que ve el alumno —la del cambio de
PIN obligatorio (AD-4)— salía en inglés. Corregido leyendo
`schools.default_locale`.

### P2-7 · La figura de la pregunta no se pintaba — **corregido**

`rendered_body.figureSvg` se leía en la consulta y se descartaba. En los "labs"
de Y6A (formas compuestas, circuitos, mapas) **la figura es la pregunta**: sin
ella, la pantalla no reconstruía lo que el alumno vio, solo su pie de foto.
Corregido con `SafeSvg` (única vía autorizada para SVG de la base de datos), con
`figureAlt` como etiqueta accesible y una etiqueta genérica de reserva para
items materializados antes de que `figureAlt` fuera obligatorio.

### P2-8 · La "nota vigente" estaba a punto de ser la más antigua — **evitado por diseño**

No llegó a ser un bug, pero merece constar porque el esquema invita al error.
`0009_attempts.sql` declara

```sql
create unique index attempt_gradings_current_uniq
  on public.attempt_gradings (attempt_item_id)
  where supersedes_id is null;
```

y lo comenta como *"solo UNA calificación vigente por item"*. **Ese comentario
induce a error.** `supersedes_id` apunta a la fila que ESTA sustituye, así que
la fila con `supersedes_id IS NULL` es la **raíz**: la nota más antigua. Lo que
el índice garantiza es una sola raíz por item, no una sola nota vigente.

Leer "vigente = `supersedes_id is null`" —que es la lectura natural del
comentario— habría mostrado al profesor la nota **anterior** justo después de
recalificar, es decir, en el único momento en que mirar la nota importa. La
vigente es la **hoja**: la fila que nadie sustituye. `grading-chain.ts` lo
calcula así y hay un test que fija el comportamiento con una cadena
`auto 0 pts → manual 2 pts`, comprobando explícitamente que la raíz es la de 0.

`gradeItemManually` encadena contra la hoja por el mismo motivo: encadenar
contra la raíz crearía dos ramas en vez de una historia.

---

## 3. Riesgos conocidos y decisiones conscientes

Cosas que **no** son bugs pero que quien venga detrás debe saber.

### Dos profesores recalificando a la vez

`attempt_gradings_current_uniq` solo cubre la raíz, así que nada en la base de
datos impide que dos correcciones simultáneas apunten a la misma hoja y creen
dos ramas. `orderGradingChain` no se rompe (una rama queda `detached` y se
muestra igualmente, nunca se pierde una nota), pero "la nota vigente" queda
decidida por el orden de `graded_at`. La solución correcta es una constraint de
exclusión en la base de datos, que es de la vía A. **Ninguna nota se pierde
nunca**, que es la propiedad que sí depende de este código.

### Un profesor sin clases asignadas ve todo su colegio

`loadTeachDashboard` recorta las clases a las del profesor (`section_members`
con rol distinto de `student`). Si no está en ninguna, ve el colegio entero. Es
deliberado: RLS ya le concede lectura de todo su colegio
(`exam_attempts_select_staff`), y un panel vacío en un colegio que todavía no ha
poblado `section_members` sería inútil justo en el momento de la puesta en
marcha. El recorte es de producto, no de seguridad; la seguridad la pone RLS.

### El alta de alumno escala a `service_role`

Crear un alumno crea una fila en `auth.users`, que ninguna política RLS permite
al administrador. Es uno de los casos legítimos que enumera
`lib/supabase/admin.ts`, ocurre en una Server Action auditada (nunca en un
Server Component), el rol se comprueba antes y el `school_id` sale de la
**sesión**, jamás del formulario. Si algo falla a mitad, se borra el usuario de
auth y la cascada limpia `profiles` y `students`: no quedan cuentas huérfanas.

`students.pin_hash` es `NOT NULL` con `check (pin_hash ~ '^\$argon2id\$')` y
Argon2id no se puede calcular ni en Postgres (pgcrypto no lo trae) ni aquí — el
único sitio del sistema que calcula PINs es la Edge Function `student-pin`, y
tener dos sería cómo divergen los parámetros de coste. Así que la ficha nace con
un hash de la forma correcta y **bytes aleatorios**: nadie conoce su preimagen,
ni este código, así que no verifica contra nada y el alumno no puede entrar.
Acto seguido se invoca `student-pin` (op `provision`), que le fija la identidad
sintética y su PIN real. Si esa llamada falla, la ficha queda **sin acceso** —
el fallo seguro — y el botón "Regenerar PIN" la recupera.

### El RPC del esquema `app` se intenta por dos vías

`app.audit` y `app.attempt_item_answer_key` viven en el esquema `app`, no en
`public`. PostgREST expone `public` por defecto y su configuración no es
versionable desde `supabase/migrations/`, así que `appRpc()` prueba
`.schema("app").rpc()` y, **solo** si la respuesta es "la función no existe"
(`PGRST202`/`42883`), reintenta con un `.rpc()` pelado — que es la convención
que ya usa `lib/auth/actions.ts` para `app.change_student_pin`. Cualquier otro
error (permisos, excepción de la propia función) se propaga tal cual: reintentar
convertiría un `insufficient_privilege` en un "no existe", que es un mensaje
distinto y engañoso.

### La auditoría no puede tumbar una operación ya hecha

`audit()` nunca lanza. Una acción que ya se ejecutó no debe reportarse como
fallida porque el log fallara. Pero el fallo se escribe en los logs del servidor
marcado como **AUDITORÍA FALLIDA**, porque eso es un incidente, no ruido.

---

## 4. Otras comprobaciones

**Inyección.** No hay un solo `dangerouslySetInnerHTML` en esta área. Todo el
HTML de la base de datos pasa por `MathStem` (que sanea y además convierte las
fracciones apiladas para el lector de pantalla) o por `SafeSvg`. `stripTags()`
existe para incrustar el texto de una opción en una frase; el resultado se
inserta como **texto** en React, que escapa todo, y por eso la función está
documentada como de legibilidad y **no se disfraza de saneador** — para que
nadie la use nunca como si lo fuera.

**Fechas.** Todas en la zona del colegio (`schools.timezone`), formateadas en el
servidor. La zona del navegador del profesor no interviene en ningún sitio: un
intento entregado a las 09:58 hora del colegio no puede leerse como las 15:58 y
parecer fuera de plazo. Una zona inválida degrada a UTC en vez de tumbar la
pantalla. Formatear en el servidor evita además el error de hidratación que
aparece "solo a veces", según dónde esté el revisor.

**Cero strings hardcodeados.** Todo el texto sale de `staff.en.ts`/`staff.es.ts`,
tipados el uno contra el otro: añadir una clave y olvidarla en el otro idioma es
un error de compilación. Las Server Actions devuelven **claves**, nunca frases:
una acción no puede saber el idioma del usuario, y devolver texto ya traducido
desde el servidor es cómo se cuelan literales en un producto bilingüe.

**Tablas y scroll.** Todas usan `Table` de `@cet/ui`, que envuelve en
`overflow-x-auto` con `tabIndex={0}` y `role="region"` (una región que hace
scroll tiene que poder recorrerse con teclado, WCAG 2.1.1). El `body` no hace
scroll lateral en ningún caso. Los `<pre>` de JSON llevan su propio
`overflow-x-auto`.

**Server Components por defecto.** Las cuatro páginas son de servidor y no
contienen ni un `"use client"`. La frontera de cliente es `StaffChrome`, que
existe porque los primitivos de datos de `@cet/ui` resuelven sus `I18nText` con
`useI18n()` y necesitan su propio `LocaleProvider` — distinto del de la
aplicación. Hacen falta los dos, y el layout monta los dos.

---

## 5. Lo que falta (fuera del alcance de esta vía)

- **`/admin/questions/[id]`** — la reconstrucción enlaza al banco de preguntas
  con `?version=…`. Esa pantalla es de M07/M12 y todavía no existe: hoy el
  enlace lleva a un 404. Se deja puesto a propósito, porque el enlace es parte
  del requisito ("qué versión era, con enlace al banco") y quitarlo lo escondería.
- **Paginación del audit log.** Hoy son las 50 entradas más recientes con
  filtro por acción en cliente. `modules/admin` §4 pide paginación por cursor
  (`created_at`, `id`), nunca `OFFSET`; el índice
  `audit_log (school_id, created_at desc)` ya está puesto para servirla.
- **Exportación CSV con marca de agua** (`audit.exported`).
- **Vistas guardadas** (`admin_saved_views`), que la tabla todavía no existe.
- **e2e y axe.** Playwright cubre esto en su propia vía; aquí Vitest cubre la
  lógica pura, que es donde viven los fallos silenciosos de esta área.
