# Traspaso — 27 de agosto de 2026, tercera tanda

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Sustituye al anterior (`2fbbbc6`), que sigue siendo válido en su §3 y §5 pero
> ya no describe el trabajo abierto. `VERIFICATION_PLAN.md` sigue vigente entero.
>
> **Lo de hoy en una frase:** veinte fallos encontrados, todos de la misma
> familia —código escrito, revisado, desplegado y que no hace lo que dice— y
> ninguno de lógica.

---

## 0 · Los dos que bloquean, ya diagnosticados

### 0.1 · El botón de inglés no hace nada, y sé por qué

`apps/web/src/lib/i18n/server.ts`, `resolveLocale()`:

```
1. profiles.locale del usuario autenticado   <- gana y RETORNA
2. Cookie cet_locale
3. Accept-Language
4. DEFAULT_LOCALE
```

`LocaleSwitcher` (`components/PreferenceSwitchers.tsx`) invoca
`setLocalePreference`, que **escribe solo la cookie**. Un usuario con sesión
siempre tiene `profiles.locale`, así que el paso 1 gana y la cookie no se lee
jamás.

**El botón funciona, el formulario envía, la acción escribe, y el lector la
ignora.** Y el comentario de la cabecera dice que el perfil manda porque «es su
elección guardada» — pero el selector nunca guarda en el perfil, así que esa
elección no se puede cambiar desde ninguna pantalla.

Arreglo: que `setLocalePreference` escriba **también** `profiles.locale` cuando
haya sesión. Ojo con la RLS —hay un guard de esquema en `0022` que vigila quién
puede tocar `profiles`— y con que la acción hoy no consulta la sesión, así que
hay que decidir si la lee ella o si el selector recibe el id.

**El invariante que pediría:** ninguna preferencia se escribe en un sitio que su
lector no consulta. Hoy es el idioma; el tema (`cet_theme`) hay que comprobar
que no tenga el mismo problema — no lo he mirado.

### 0.2 · Todo el contenido está solo en inglés

Medido contra producción:

| tabla | filas | con `es` | con `en` |
|---|---|---|---|
| `lessons` | 8 | **0** | 8 |
| `course_modules` | 1 | **0** | 1 |
| `lesson_blocks` | 58 | **0** | 52 |
| `courses` · `subjects` · `skills` | 25 | 25 | 25 |

La interfaz está en español entero y sin una errata (778 cadenas, verificadas
hoy). El contenido no tiene ni una palabra. Por eso el alumno ve el marco en
español y la lección en inglés: no es un fallo de i18n, es contenido que falta.

Los 6 bloques que no cuentan como `en` son las figuras nuevas: son **números**,
y su texto accesible se genera en el idioma que toque. Ese diseño ya está pagando.

**Se arregla por base de datos**, como dice el usuario. Antes de escribir la
migración hay que decidir dos cosas con él: quién traduce (¿el colegio, una
traducción automática revisada?) y qué pasa mientras falte una lengua —hoy
`resolveI18n` cae al otro idioma en silencio, que es razonable pero conviene que
sea una decisión y no un accidente.

---

## 1 · Estado actual

**Producción:** https://cet-sable.vercel.app · Supabase `clcutoqjdgeggvgyreud`

| | Traspaso anterior | Ahora |
|---|---|---|
| Tests unitarios | 1135 | **1298** |
| Migraciones | 25 | **26**, todas aplicadas |
| Invariantes de familia | 10 | **17** |

**Desplegar sigue siendo dos comandos**, y hay una trampa nueva que costó un
despliegue roto hoy:

```bash
git push origin main
npx vercel --prod --yes
```

**`vercel --prod` sube el DIRECTORIO DE TRABAJO, no el commit.** Si hay ficheros
sin commitear, se despliegan; si el commit está incompleto, el despliegue local
lo tapa. Hoy partí commits por tema, dejé fuera ficheros que el barril de
`@cet/ui` exportaba, y **`pnpm verify` en local pasó** porque los ficheros
estaban en disco. Falló en Vercel con `Module not found`. Despliega desde un
árbol limpio:

```bash
git worktree add --detach /tmp/deploy HEAD && cp -r .vercel /tmp/deploy/
cd /tmp/deploy && npx vercel --prod --yes
```

---

## 2 · El trabajo pedido, listo para repartir

Reparto por **territorio de ficheros disjunto**, no por tema. Ver §5.

| Orden | Pieza | Puede ir a la vez con |
|---|---|---|
| 1 | **2.1** El botón de idioma | todas |
| 2 | **2.2** Traducir el contenido | todas |
| 3 | **2.3** Móvil y tableta, probado | — toca todo, va sola |
| 4 | **2.4** Progreso en Aprender y progreso global | 2.1, 2.2 |
| 5 | **2.5** Alta por enlace | 2.1, 2.2, 2.4 |
| 6 | **2.6** Puntos configurables | después de 2.4 |

### 2.1 · El botón de idioma — §0.1

Territorio: `lib/preferences-actions.ts`, `lib/i18n/server.ts`,
`components/PreferenceSwitchers.tsx`.

### 2.2 · Traducir el contenido — §0.2

Territorio: `supabase/migrations/`, `packages/content/`.

Y **verifica el resultado consultando la base**, no leyendo el `.sql`. Hoy una
migración de contenido llegó a revisión con dos figuras que no se pintaban
nunca, y el invariante que debía cazarlo buscaba el nombre del componente en vez
de pasar el contenido por el parser real. Ya está arreglado: úsalo de modelo
(`packages/ui/__tests__/figura-de-leccion-habla.test.tsx`).

### 2.3 · Móvil y tableta, probado

Territorio: transversal — **va sola, sin otros agentes escribiendo**.

Está todo medido en `docs/superpowers/specs/2026-08-27-tactil-y-red.md`, con las
cifras y las nueve preguntas abiertas. Lo que rompe el uso:

- **La cabecera del alumno desborda 47 px a 360 px** (`scrollWidth 392` contra
  `clientWidth 345`): «Salir» queda medio fuera y toda la app gana scroll
  horizontal. Un `flex` sin `flex-wrap` con cuatro hijos en
  `(student)/layout.tsx`. A 768 px el raíl lateral tapa la marca.
- **`/learn` pesa 197 kB y `/practice` 106 kB** haciendo lo mismo. La diferencia
  es una línea: importar dos componentes del barril de `@cet/ui`, que reexporta
  63 símbolos. **91 kB.**
- El teclado en pantalla entró hoy y **nadie lo ha tocado con un dedo**.

**Lo que el usuario pide es «listo y PROBADO»**, así que esta pieza no termina
con tests: termina con capturas en dispositivo o, si no hay dispositivo, con la
lista explícita de lo que no se pudo probar. No inventes que se probó.

### 2.4 · Progreso en Aprender, y progreso global

Territorio: `packages/ui/src/progress/`, `(student)/learn/page.tsx`,
`(student)/layout.tsx` (la cabecera).

Dos cosas distintas:

- **En la pestaña Aprender no hay progreso ninguno.** Hoy vive todo en
  Practicar. Ojo: `/learn` tenía un `MasteryMeter` que se quitó porque
  `skill_mastery` está vacía y nadie la escribe (§4.2). Lo que se ponga tiene que
  salir de una fuente viva, y hay un invariante que lo exige
  (`progreso-tiene-fuente-viva.test.ts`).
- **Progreso global en la cabecera o en el pie.** Decide dónde y **defiéndelo**:
  la cabecera ya desborda a 360 px (§2.3), así que meter algo ahí sin arreglar
  eso antes empeora el problema.

**El invariante de densidad ya existe y se aplica**
(`densidad-de-indicadores.test.tsx`): cuenta toda fila cuya pinta cambie con el
progreso, se dibuje en SVG o se escriba. Un indicador global mal puesto lo pone
rojo, y eso es lo que se quiere.

### 2.5 · Alta por enlace — lo más grande, y necesita spec

Territorio: `lib/auth/`, `(auth)/`, `supabase/migrations/`.

Lo que pide el usuario, en sus palabras: *«simplificar proceso de adición con
link de ingreso que contenga todo de seguridad para que directo ponga pin; el
link lo da un formulario base: nombre, apellido, tipo (alumno / profesor /
admin). Dependiendo el link ya viene categorizado sin poder cambiar. Cambias tu
pin y comienzas; por defecto te asigna el sistema de prueba y un criterio de
valoración acorde a la dificultad, y da premios cada X como un juego.»*

**Esto es arquitectónico y necesita spec antes de una línea de código.** Cinco
cosas que el spec tiene que resolver, y ninguna es opcional:

1. **Un enlace de alta es una credencial portadora.** Quien lo tenga es quien
   entra. Tiene que ser de un solo uso, caducar, no ser adivinable, y **el rol
   tiene que vivir en el servidor**, no en la URL — si el rol viaja en el enlace,
   cambiarlo es editar una cadena. «Sin poder cambiar» se consigue guardando el
   rol en la fila de invitación y leyéndolo del servidor.
2. **Se puede reenviar.** Un enlace de profesor reenviado a un alumno le da rol
   de profesor. Hay que decidir qué lo ata: correo, un dato que solo el
   destinatario sepa, o la aprobación del colegio al canjearlo.
3. **Son datos de un menor.** `MASTER_PLAN §9` obliga a minimización y a auditar
   los accesos de staff. Un formulario que crea alumnos desde un enlace tiene que
   dejar rastro en `audit_log` — ya existe `public.audit_staff_action` (0023).
4. **Ya existe un camino de alta y hay que decidir si lo sustituye.**
   `registration_requests` con aprobación del `school_admin`, arreglado hoy. Dos
   caminos a la vez es el patrón que este repo lleva persiguiendo doce fallos.
5. **El captcha sigue sin existir**, y `0012` lo daba por hecho. Si el enlace
   sustituye al formulario público, el problema del spam cambia de forma: quizá
   desaparece. Dilo explícitamente.

Lo del examen de prueba automático y el criterio de valoración se apoya en 2.6 y
en el spec de recompensas; no lo dupliques.

### 2.6 · Puntos configurables desde la base

Territorio: `supabase/migrations/`, y lo que decida el spec.

El usuario quiere que la asignación de puntos sea configurable **desde la base de
datos, por dificultad y por tiempo de actividad**, y que dé premios cada X.

**Antes de escribir nada, lee
`docs/superpowers/specs/2026-08-27-progreso-recompensas-tutor.md`.** Está a medio
ampliar (marcado en su cabecera) pero tiene el diseño y, sobre todo, los
hallazgos que condicionan esto:

- **La práctica se corrige EN EL CLIENTE.** `practice_item_answered` trae
  `isCorrect` y `pointsAwarded` en un payload tipado como `z.record(z.unknown())`
  y nadie lo valida. **Un sistema de puntos que confíe en eso lo escribe el
  propio beneficiario.** El spec resuelve pagando el intento honesto (tiempo de
  servidor, verificable) y no el acierto.
- **`skill_mastery` está vacía y nadie la escribe** (§4.2). Sin ella no hay forma
  de saber qué es difícil para ESE niño, y esa es toda la defensa contra el
  farmeo: un sistema de puntos mal calibrado enseña a repetir lo fácil y evitar
  donde uno falla.
- El spec propone un **ledger append-only con cadena verificable**, y que la
  configuración sea de verdad configurable es compatible con eso — pero el saldo
  se deriva, no se guarda mutable.

---

## 3 · Lo que sigue abierto de antes

| | Qué | Dónde |
|---|---|---|
| 3.1 | **Las flechas de `place-value-shift` no tienen prueba en ningún fichero.** Borrarlas deja 331/331 verde, y son el único elemento que muestra *que los dígitos se han movido* — el hecho que la figura existe para enseñar | `packages/ui/src/learning/LessonFigure.tsx` |
| 3.2 | **Un test intermitente sin causa conocida.** `densidad-de-indicadores.test.tsx` salió rojo una vez y no se ha reproducido en 24 ejecuciones con `--sequence.shuffle`. Se creyó explicado por una aserción muerta; un segundo revisor lo refutó con dos razones. **No lo des por cerrado** | ídem |
| 3.3 | `clearPersisted()` puede borrar en silencio una respuesta que nunca viajó, si un 5xx en la ruta de guardar agota el freno. Estrecho, y no es regresión | `exam-runner/ExamRunner.tsx:333` |
| 3.4 | **`skill_mastery` no la escribe nadie.** Bloquea 2.6, el panel de profesor y el rendimiento del progreso | `supabase/migrations/` |
| 3.5 | `learning_events.skill_id` viene NULL al 100 %; el código vive en `payload.skillCode` y el índice no sirve | `lib/telemetry/` |
| 3.6 | El spec de color sigue sin aprobar, y sus medidas están hechas sobre un fichero que el navegador no cargaba | `docs/superpowers/specs/` |
| 3.7 | Cinco materias sin cargar: 453 preguntas y 5 blueprints extraídos y no sembrados. M05 | `packages/content/packs/` |

---

## 4 · Los invariantes son el activo

17 tests que cazan **familias** de fallos, no fallos. Prueba de que funcionan: el
de frontera RSC se escribió por la mañana y cazó una violación nueva, de otro
agente, cinco horas después.

Los que hay: frontera RSC · hoja exportada sin importar · ortografía española ·
indicador sin fuente viva · estados solo por color · progreso desde constante ·
densidad de indicadores · enunciado sin texto hablado · raya que parece barra ·
marca dibujada con `border` · figura muda o solo cromática · figura del registro
sin lección que la pida · escalera métrica única · teclado cubre generadores ·
petición sin plazo · rutas de escritura de la web · superficie RPC pública.

**Cómo trabajar con ellos — y esto se aprendió hoy, a base de fallar:**

1. **Un test rojo se arregla arreglando el código.** Hoy uno protegía que un
   lector dijera «tres cuartos» y no «tres cuatro». Antes de actualizarlo hay que
   demostrar que el requisito se conserva.
2. **Un test verde puede estar pasando por el motivo equivocado.** Ocurrió
   **siete veces** hoy: dos tests miraban un `data-testid` inexistente; uno iba
   envuelto en un `if` que nunca se cumplía; una aserción comparaba un valor
   consigo mismo; un escáner se leía a sí mismo en sus comentarios; un invariante
   de color pasaba con el canal borrado; otro buscaba el nombre de un componente
   y no si funcionaba.
3. **Verifica por mutación — y verifica el verificador.** Un agente comprobó
   cinco mutaciones con un `grep` que no casaba con la salida coloreada y obtuvo
   **cinco falsos verdes**. Comprueba por código de salida.
4. **La mutación que elijas decide lo que demuestras.** Borrar dos canales a la
   vez pone rojo un test que no protege ninguno por separado. Muta **lo mínimo**.
5. **Ningún invariante puede pasar en vacío.** Los de aquí exigen mínimos de
   ficheros, de cadenas o de filas encontradas.

---

## 5 · Cómo trabajar aquí

### Comandos

```bash
pnpm verify                      # typecheck + lint + 1298 tests + build
pnpm --filter @cet/web test:e2e  # 46 pasan, 12 saltados (piden credenciales)
npx vercel logs cet-sable.vercel.app --json | tail -40
```

pgTAP no corre en local (ni Docker ni psql): va en CI con un push que toque
`supabase/**`. Para SQL contra producción, el MCP de Supabase.

**El truco que más rinde:** para probar algo destructivo sin dejar rastro,
mételo en un `do $$ ... $$` que termine con `raise exception` — el mensaje trae
tu diagnóstico y la transacción se revierte entera. Hoy validó las tres
migraciones **antes** de aplicarlas, y encontró un fallo dentro de una de ellas
(la renumeración chocaba con `check (ord >= 1)`).

### Agentes en paralelo

Se lanzaron trece hoy. Lo que funcionó y lo que costó caro:

1. **Reparte por territorio de ficheros disjunto, no por tema.** Y escribe en
   cada encargo qué ficheros son suyos **y cuáles son de otro**.
2. **El barril `packages/ui/src/index.ts` lo tocan todos.** Que solo añadan
   líneas, y colócalas tú al consolidar.
3. **No te fíes de un `pnpm verify` que reporte un agente.** Verifica tú el árbol
   entero, y **despliega desde un árbol limpio** (§1).
4. **Un solo Chrome y un solo servidor.** Dos servidores corrompieron el `.next`
   compartido.
5. **Exige capturas a quien toque interfaz.** Hoy encontraron una tecla de
   44×200 px y un símbolo que se veía como una mota de polvo. Ningún test los ve.
6. **Revisión cruzada, y en dos rondas.** La primera encontró dos veredictos de
   «no desplegable», los dos correctos. La segunda refutó una explicación causal
   que ya dábamos por buena.
7. **Verifica las afirmaciones de los agentes en los dos sentidos.** Hoy uno
   reportó una tabla afectada y eran cuatro; y otro corrigió acertadamente un
   diagnóstico mío.
8. **Dale a cada agente la evidencia que ya tengas.** Los que recibieron trazas
   tardaron minutos; los que empezaron a ciegas, media hora.

### Reglas

Las siete de `VERIFICATION_PLAN.md §6`. Las que más valieron:

1. **Verifica ejecutando.** Salida literal. Nunca «debería funcionar».
2. **Un dato plausible no es un dato correcto.**
3. **Ausente no es denegado, y silencioso es peor que ruidoso.** Hoy: un 406
   tragado, un `track()` vacío, un UPDATE de 0 filas devolviendo 204, un
   autoguardado colgado diciendo «Guardando», y un botón de idioma que escribe
   donde nadie lee.
4. **Nunca debilites una defensa para que un test pase.**
5. **En un INSERT la RLS grita; en un UPDATE y en un DELETE calla.**

---

## 6 · Decisiones que esperan al usuario

| | Qué |
|---|---|
| 1 | **Quién traduce el contenido** y qué se hace mientras falte una lengua (§0.2) |
| 2 | **El spec de alta por enlace**, sobre todo qué ata el enlace a su destinatario (§2.5) |
| 3 | **Captcha** del alta pública: necesita cuenta de proveedor y un secreto en Vercel |
| 4 | **Leaked password protection** de Supabase: es un interruptor, sigue apagado |
| 5 | **`skill_mastery`**: si entra ahora o después (§3.4) |
| 6 | **Qué ve un niño del progreso de otro**, si se hacen equipos |
| 7 | **El spec de color**: implementar, recortar o aparcar |
| 8 | **El examen de 20 ítems de M09.** Necesita que el usuario teclee el PIN. **No introduzcas credenciales tú** |

Y sigue pendiente desde ayer: **cambiar la contraseña de superadmin y el PIN del
alumno de prueba**, que se pegaron en el chat.

---

## 7 · Lo que nadie ha visto nunca

Aquí es donde están los fallos que quedan:

- **Nadie ha tocado la app con un dedo en una tableta**, que es el dispositivo de
  destino. El teclado en pantalla entró hoy sin probarse así.
- **El tema oscuro** no se ha revisado desde ninguno de los cambios de hoy.
- **Las seis figuras nuevas** están aplicadas a producción y nadie las ha visto
  dentro de una lección real.
- **El examen completo de 20 ítems** sigue sin ejecutarse: M09 entero sin
  verificar.
- **Nada se ha probado con un niño.**
