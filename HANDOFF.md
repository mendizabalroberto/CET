# Traspaso — 27 de agosto de 2026

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Léelo entero antes de tocar nada. Es la continuación de `VERIFICATION_PLAN.md`,
> que sigue vigente: este documento dice **qué ha cambiado desde entonces** y
> **qué está abierto ahora mismo**.

---

## 0 · Lo primero, porque bloquea

**Hay un fallo vivo sin diagnosticar: la telemetría de aprendizaje no emite.**
No es el mismo fallo que se arregló hoy. Ese era el envío; este es la emisión.
Sección 3. Empieza por ahí: sin él, M11 sigue muerto y el informe para padres
(el encargo grande del usuario) no tiene datos sobre los que construirse.

**Y hay credenciales expuestas.** El usuario pegó en el chat su contraseña de
superadmin y el PIN del alumno de prueba. `secrets/accounts.env` sigue en disco.
Recuérdaselo: cambiar ambas y vaciar el fichero. No las uses tú.

---

## 1 · Estado actual

**Producción:** https://cet-sable.vercel.app · Supabase `clcutoqjdgeggvgyreud` ·
GitHub `mendizabalroberto/CET`

| | Antes de hoy | Ahora |
|---|---|---|
| Tests unitarios | 976 | **1002** |
| pgTAP | **nunca ejecutado** | **178, `Result: PASS`** |
| Migraciones | 19 | **22** (las tres nuevas, aplicadas a producción) |
| Workflow `db.yml` | rojo desde siempre | **verde** |

**Despliegue: NO hay integración con GitHub.** Un push a `main` no despliega
nada. Se despliega con `npx vercel --prod --yes`, y hay que hacer las dos cosas.
El usuario intentó `vercel git connect` y falló porque su cuenta de Vercel no
tiene GitHub como método de acceso vinculado; queda pendiente que lo haga él en
vercel.com/account/login-connections.

### Los diez commits de hoy

```
451c5d5 feat(nav)  el alumno ya no se queda encerrado en una practica
88ab0bf fix        la telemetria no se guardaba, reintentaba en bucle
d5a678f docs       pasada 4 de REVIEW
5275ea4 test       students_guard_update, probado con quien llega hasta el
e413750 test       el control positivo de tenant_isolation contaba mal
4843978 security   los cuatro guards del esquema estaban inertes
08edc65 fix(db)    una CHECK de produccion con un regex que no compila
8732bee fix(ci)    el workflow de base de datos nunca habia llegado a pgTAP
4a326e4 feat(admin) el superadmin elige colegio en vez de leer una mentira
187d7da fix        una cookie muerta encerraba al usuario fuera del login
```

Todo lo de hoy está en `main`, desplegado y verificado contra producción, salvo
lo que la sección 3 declara abierto.

---

## 2 · Lo que se encontró hoy, y por qué importa el patrón

Seis fallos. **Ninguno era un error de lógica.** Los seis eran código escrito,
revisado y desplegado que no hacía lo que dice hacer. Es la misma familia que ya
documenta `VERIFICATION_PLAN.md §2`, y es la razón de ser de este proyecto.

### 2.1 · Los cuatro guards del esquema eran inertes (CRÍTICO, corregido)

Cuatro funciones `security definer` decidían con
`if current_user <> 'authenticated' then return new`. **Dentro de un SECURITY
DEFINER, `current_user` es el propietario.** Vale siempre `postgres`, la
condición se cumple siempre, los cuatro guards salían por la primera línea.

Reproducido contra producción con el JWT de un alumno real:

```
update public.profiles set status = 'suspended' where id = <el mismo>;
-> 1 fila. Sin error.
```

Afectaba a: escalada de privilegios (rol/colegio/estado), `pin_hash` y el
lockout del PIN, la identidad forense del intento, y quién puede escribir en el
`audit_log`. Lo único que frenaba la escalada a superadmin era, por casualidad,
la constraint `profiles_staff_needs_email`. Un profesor habría pasado.

Corregido en `0022` con `app.is_app_user()`, que lee el GUC `role`. Verificado
contra producción: los cuatro caminos devuelven ahora `42501`.

### 2.2 · Una CHECK con un regex que no compila (corregido)

`media_assets_storage_path_shape` pedía `{0,511}` y Postgres limita los bounds a
255. `ADD CHECK` no compila el patrón sobre una tabla vacía, así que la
constraint llevaba meses con aspecto correcto. Habría estallado en el primer
insert de contenido con imágenes. Corregido en `0021`.

### 2.3 · El CI de base de datos nunca había llegado a pgTAP (corregido)

Moría en la primera migración porque el runner no reproducía tres cosas que
Supabase da hechas: el esquema `extensions`, los roles de PostgREST y el esquema
`auth`. Las 6 suites llevaban meses sin ejecutarse ni una vez.

Detalle que conviene recordar: el paso creaba `pgcrypto` y `citext` **sin
esquema**, o sea en `public`, y parecía funcionar — `create extension if not
exists ... with schema extensions` NO mueve una extensión que ya existe, solo
dice "skipping".

### 2.4 · Deriva de esquema (corregido)

`app.sync_role_claims()` existía en producción y en ninguna migración. Declarado
en `0020`.

### 2.5 · Una cookie muerta encerraba al usuario fuera del login (corregido)

Token válido criptográficamente cuya sesión ya no existía (`session_not_found`).
El middleware decide con `getClaims()` —firma local— y creía que había sesión;
los Server Components usan `getUser()` —servidor de Auth— y sabían que no. El
atajo "ya tienes sesión, ve a tu portada" mandaba a `/` para siempre.

La conveniencia vive ahora en las páginas de login con `getSessionState()`.
**El middleware ya nunca desvía el login: es la única puerta de vuelta.**

### 2.6 · La telemetría reintentaba en bucle contra un 400 (corregido a medias)

`/api/events` hacía `upsert(..., { onConflict: "session_id,seq" })`.
`learning_events` está particionada por `server_ts` y esa constraint no existe ni
puede existir. `modules/analytics/CLAUDE.md` la declaraba y nadie comprobó que
existiera. Corregido el envío. **La emisión sigue rota: sección 3.**

---

## 3 · ABIERTO Y BLOQUEANTE — la telemetría no emite

### Lo que se sabe, con evidencia

- `POST /api/events` anónimo devuelve **400**, no 404: el endpoint vive y valida.
- El alumno cargó una lección a las 16:06:42; **todas las lecturas 200**.
- **Cero peticiones** a `learning_events` en los 50 minutos siguientes. Antes del
  arreglo había una cada 2-5 segundos fallando; ahora no sale ninguna.
- La cola vacía cada `FLUSH_INTERVAL_MS = 5_000`. Con un solo evento encolado
  habría salido una petición.
- `learning_events` tiene **3 filas**, todas `login_success` / `pin_changed`,
  escritas por Edge Functions. Cero eventos de lección o práctica.

**Conclusión: no se está encolando nada.** El envío ya no es el problema.

### El candidato con nombre

`apps/web/src/lib/telemetry/provider.tsx:60`

```ts
return ctx ?? { track: () => {}, sessionId: "", flush: () => {} };
```

Sin contexto, `track` es una función vacía y **nadie se entera nunca**. Es R4 del
plan: *silencioso es peor que ruidoso*. **No está demostrado.** Puede ser también
que las islas de `LessonTracking.tsx` no lleguen a montarse.

### El siguiente paso, que cuesta 30 segundos

Está pedido al usuario y **no ha respondido todavía**: en la lección, F12 →
pestaña Red → filtrar `events` → recargar. Si aparece `/api/events`, el fallo es
del servidor; si no aparece, es del navegador. Pídeselo otra vez antes de
ponerte a leer código: es la diferencia entre media hora y diez minutos.

Si prefieres no depender de él: haz que el fallback deje de ser silencioso.
Un `console.error` en la rama sin contexto, o mejor, que `useTelemetry()` lance
en desarrollo y avise en producción. Un desajuste que revienta es siempre mejor
que uno que calla.

---

## 4 · Los tres encargos del usuario

Decidido con él: **A → B → C, uno a uno**, cada uno con su spec, su aprobación y
su ejecución. C depende de B y no al revés: no se le puede decir a un padre
"estudió 40 minutos y falla en fracciones" sin haber demostrado antes que esos
minutos se registran.

### A · Concha de navegación — EMPEZADO

**Hecho y desplegado** (`451c5d5`):

- Barra inferior de tres pestañas (Aprender · Practicar · Exámenes), raíl lateral
  en escritorio, pestaña activa también en subrutas.
- **`/exam/<id>/run` no lleva navegación.** Un examen del que se sale con un
  toque deja de ser un examen: el reloj del servidor sigue corriendo. La
  condición vive en `esModoExamen()` con cinco tests, y el patrón está anclado
  para que `/learn/como-correr/run` no se quede sin barra por acabar en "run".
  **Si añades una ruta de examen, esa función tiene que cubrirla.**
- `/account` existe por fin. Estaba en `PROTECTED_AREAS` con los cuatro roles y
  no tenía página: cualquier enlace a "Cuenta" caía en el 404 mudo.

**Pendiente de A:**

- Color y tipografía. Hay un spec entregado y **sin aprobar**:
  `docs/superpowers/specs/2026-08-27-sistema-color-pedagogico.md` (sin commitear
  todavía). Sección 5.
- El staff sigue con dos enlaces sueltos y sin indicación de sección.
- No se ha probado la barra en una tableta real.

### B · Verificar qué se guarda de verdad

Es **verificación**, no diseño: amplía M09 y M11 de `VERIFICATION_PLAN.md`.
Bloqueado por la sección 3 — no tiene sentido verificar el guardado de un examen
mientras la emisión esté rota.

Cuando se desbloquee: examen completo de 20 ítems de punta a punta, autosave,
entrega, calificación, y reconstrucción forense desde `/teach/attempts/[id]`.
Ver M09 del plan original, que ya lo detalla bien.

### C · Acceso de padres e informe

**Decisión tomada: rol `guardian` real, con email y contraseña**, vinculado a uno
o varios alumnos. No enlace firmado, no PDF. Implica un cuarto rol en toda la
matriz de rutas, RLS nueva, alta, verificación de email y recuperación.

Nada diseñado todavía. El usuario quiere: a qué hora estudia, cuánto, qué hizo,
qué no hizo, qué se recomienda según sus calificaciones y qué debe reforzar.

**Antes de escribir una línea de este spec**: son datos de un menor cedidos a un
tercero. Mira `MASTER_PLAN.md §9` y decide con el usuario qué se le enseña
exactamente a un tutor y qué no.

---

## 5 · El spec de color, entregado y sin aprobar

`docs/superpowers/specs/2026-08-27-sistema-color-pedagogico.md` — escrito por un
agente de investigación, con fuentes, contrastes calculados y 14 huecos
declarados. **No commiteado. No aprobado. No implementado.**

Lo que encontró y hay que atender pase lo que pase con la paleta:

1. **`ChoiceList.REVIEW_STYLES` incumple WCAG 1.4.1.** Bajo deuteranopía,
   "correcta" contra "incorrecta" da **1.10:1**. Los tres estados de revisión
   están mapeados solo a color, sin glifo. **Un alumno daltónico no puede leer su
   propia corrección.** Esto no es una preferencia estética.
2. **Hay dos paletas conviviendo.** `apps/web/src/app/globals.css` mantiene un
   juego completo paralelo a `packages/ui/src/tokens.css`, divergente en oscuro
   en todos los conceptos. Efecto medido: anillo de foco a **1.57:1** — teclado
   sin indicador visible.
3. Siete pares por debajo del umbral. Los dos peores: el borde de la opción
   seleccionada del examen en oscuro (**2.50:1**) y el de "marcada para revisar"
   (**1.92:1**).
4. **`packages/ui/REVIEW.md` mide 19 pares y todos pasan porque omite justo los
   problemáticos.** Una medición que solo mide lo que ya sabe que sale bien.

---

## 6 · Hallazgos abiertos que nadie ha corregido

| Qué | Dónde | Efecto |
|---|---|---|
| **`app.audit()` no es alcanzable desde la web.** `actions.ts` llama a `app.audit` vía PostgREST; el esquema `app` no está expuesto y devuelve **406**. `appRpc()` solo hace fallback con `PGRST202`/`42883`, no con 406, y `audit()` se traga el error en un `console.error`. | `apps/web/src/components/staff/actions.ts` | **Toda acción de staff auditada desde la web se pierde**, incluido revelar una clave de respuesta, que M12 exige registrar. Ya existen dos envoltorios públicos (`audit_student_pin_reset`, `audit_staff_password_change`) para las Edge Functions: hace falta uno general. |
| El audit del superadmin es invisible | `app.audit()` escribe `school_id = app.current_school_id()`, NULL para superadmin; el visor filtra por `school_id` | Sus acciones quedan registradas pero no aparecen en el log de ningún colegio |
| `window.confirm` en el panel | `AdminPanel.tsx:509` | "Regenerar PIN" y "Desbloquear" son las dos acciones destructivas del panel y **ningún e2e puede cubrirlas**: el diálogo nativo congela toda automatización |
| Leaked password protection desactivada | Supabase Auth | WARN del linter. Es un interruptor. Lo tiene que activar el usuario |
| Los seeds no corren en CI | `db.yml`, a propósito | Atan filas a cuentas de GoTrue. Se verifican contra un proyecto con Auth real |
| Cinco materias sin cargar | `packages/content/packs/` | 453 preguntas y 5 blueprints extraídos y no sembrados. M05 |

---

## 7 · Cómo trabajar aquí

### Comandos

```bash
pnpm verify                      # typecheck + lint + 1002 tests + build
pnpm --filter @cet/web test:e2e  # 29 e2e
npx vercel --prod --yes          # desplegar (el push NO despliega)
```

pgTAP corre en CI (`db.yml`), no en local: **no hay Docker ni psql en esta
máquina**. Se dispara con un push que toque `supabase/**`, y se mira en
github.com/mendizabalroberto/CET/actions. `gh` no está autenticado; el navegador
sí tiene sesión de GitHub.

Para SQL contra producción existe el MCP de Supabase. **Truco útil**: para probar
algo destructivo sin dejar rastro, mételo en un `do $$ ... $$` que termine con
`raise exception` — el mensaje trae tu diagnóstico y la transacción se revierte
entera. Así se reprodujo la escalada de privilegios de §2.1 sin tocar un dato.

### Reglas

Las siete de `VERIFICATION_PLAN.md §6` siguen vigentes. Las que más han valido
hoy:

1. **Verifica ejecutando.** Pega la salida literal. Nunca "debería funcionar".
2. **Un dato plausible no es un dato correcto.** Los seis fallos de hoy producían
   salida creíble.
3. **Cuando dos piezas se construyeron por separado, el contrato entre ellas está
   roto hasta que se demuestre lo contrario.** El `onConflict` de la telemetría
   confiaba en una línea de `modules/analytics/CLAUDE.md` que la tabla nunca
   cumplió.
4. **Ausente no es denegado, y silencioso es peor que ruidoso.** Es literalmente
   el fallo abierto de la sección 3.
5. **Nunca debilites una defensa para que un test pase.** Hoy la base rechazó un
   `UPDATE` con una constraint (`profiles_superadmin_has_no_school`) y la
   respuesta correcta fue cambiar el plan, no la constraint.

### Lo que ha funcionado mejor

**Escribir invariantes de familia, no tests del caso concreto.** De los 10 tests
añadidos hoy, los tres que más van a valer son:

- ninguna CHECK de `public`/`app` usa un bound de regex por encima de 255
- ninguna función `security definer` decide con `current_user`
- ninguna tabla sin RLS, ninguna `security definer` sin `search_path`

Cada uno cierra una familia entera de fallos futuros. Cuando encuentres algo,
pregúntate siempre si el test puede cazar a sus hermanos.

---

## 8 · Por dónde empezar mañana

1. **Sección 3.** Pide al usuario la comprobación de la pestaña Red, o haz que el
   fallback silencioso deje de serlo. Sin esto no hay B ni C.
2. **El envoltorio público de `app.audit()`** (§6, primera fila). Es acotado,
   está diagnosticado y M12 lo exige.
3. **`ChoiceList.REVIEW_STYLES`** (§5.1). Un glifo además del color. No depende
   de aprobar la paleta entera.
4. Pídele al usuario que revise el spec de color y decide con él si se
   implementa, se recorta o se aparca.
5. El examen de 20 ítems sigue esperando. El alumno `Y6A-001` está listo para
   entrar —comprobado pieza por pieza— y la asignación `Timed mock exam — 20
   marks` tiene la ventana abierta hasta el 10 de septiembre, sin intentos
   todavía. **Necesitas que el usuario teclee el PIN: no introduzcas tú
   credenciales.**
