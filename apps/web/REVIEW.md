# REVIEW — `apps/web` (Vía E, Hito 1)

> Revisión crítica adversarial y su corrección.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Protocolo de 3 pasadas (MASTER_PLAN §7). Fecha: 2026-08-26.

**Estado:** pasada 1 (implementación) y pasada 3 (corrección) completadas.
Todos los hallazgos bloqueantes están corregidos. Los que quedan abiertos son
riesgos aceptados y documentados, o dependen de otra vía.

---

## Resumen

| # | Severidad | Hallazgo | Estado |
|---|---|---|---|
| H-01 | **Crítica** | El middleware reescribía `/api/events` a la página 404 | Corregido |
| H-02 | **Alta** | Bucle infinito de redirecciones al suspender a un usuario | Corregido |
| H-03 | **Alta** | `error.tsx` lanzaba al renderizarse en las páginas públicas | Corregido |
| H-04 | **Alta** | Reintento de telemetría duplicaba eventos | Corregido |
| H-05 | Media | Límite de cuerpo medido en caracteres UTF-16, no en bytes | Corregido |
| H-06 | Media | `aria-describedby` en un `<div>` sin rol: no lo anuncia nadie | Corregido |
| H-07 | Media | `/logout` y `/not-found` inalcanzables sin sesión | Corregido |
| H-08 | Media | `db.yml` instalaba paquetes inexistentes en Ubuntu | Corregido |
| H-09 | Baja | `revalidate` en una página forzosamente dinámica | Corregido |
| H-10 | Baja | El PIN fallido se quedaba escrito tras un error | Corregido |
| H-11 | Baja | Comentario que describía un menú `<details>` inexistente | Corregido |
| H-12 | Baja | Comentario que sobrevendía `autocomplete="one-time-code"` | Corregido |
| R-01 | Riesgo | Rate limiting en memoria, no distribuido | Aceptado, documentado |
| R-02 | Riesgo | La lista de colegios es pública | Aceptado, documentado |
| R-03 | Riesgo | Canal lateral de tiempo en el login de personal | Aceptado, documentado |
| R-04 | Riesgo | `style-src 'unsafe-inline'` en la CSP | Aceptado, documentado |
| R-05 | Riesgo | `sessionId` de telemetría no se valida contra el usuario | Aceptado, documentado |
| D-01 | Dependencia | Claims `cet_role` / `cet_school_id` en el JWT | Pendiente de la vía A |
| D-02 | Dependencia | Edge Function `auth-pin` y RPC `change_student_pin` | Pendiente de la vía A |
| D-03 | Dependencia | API real de `@cet/ui` | Pendiente de la vía D |

---

## Pasada 2 — Hallazgos

### H-01 · CRÍTICA · El middleware rompía la ingesta de telemetría

**Qué pasaba.** `src/lib/routes.ts` implementa una lista blanca: lo que no es
público y no está en `PROTECTED_AREAS` se deniega. Es la política correcta para
páginas — añadir una página sin registrarla la deja cerrada, no abierta — pero
`/api/events` tampoco estaba en ninguna de las dos listas.

Resultado: el middleware la reescribía a `/not-found`. La cola del cliente
enviaba su lote, recibía **HTML con estado 404**, entraba en la rama de error
(`!response.ok`), reencolaba el lote y reintentaba con backoff. Para siempre.

**Por qué es la peor clase de bug.** No hay excepción, no hay traza y no hay
pantalla rota. La telemetría simplemente nunca llegaría, y como toda la analítica
de aprendizaje (M11), el mastery y la detección de debilidades se apoyan en esos
eventos, el fallo se habría descubierto semanas después con los dashboards vacíos.

**Corrección.** `isApiPath()` en `routes.ts` y una rama explícita al principio
del middleware: las rutas `/api/*` refrescan la sesión y pasan. La autorización
la hace la Route Handler, que además puede responder 401/403/429 con JSON en vez
de una página. Cubierto por test de regresión en `src/lib/routes.test.ts`.

---

### H-02 · ALTA · Bucle infinito de redirecciones al suspender a un usuario

**Qué pasaba.** `getSessionProfile()` devolvía `null` en tres casos distintos:
no hay sesión, el perfil está `pending`, el perfil está `suspended`.
`requireRole()` trataba los tres igual y redirigía al login.

Pero cuando el perfil está suspendido **la cookie de Auth sigue siendo válida**.
El middleware, en `/login`, ve claims correctos y redirige a la portada del rol.
La portada llama a `requireRole()`, que redirige al login. Bucle infinito.

**Cuándo aparece.** Exactamente cuando un administrador suspende a alguien: el
peor momento posible, y un caso que ningún camino feliz recorre.

**Corrección.** `SessionState` con tres variantes explícitas —`anonymous`,
`stale`, `active`— y una ruta `GET /logout` que cierra la sesión antes de volver
al login. `stale` redirige allí, lo que rompe el ciclo. `/logout` está en la
lista de rutas públicas precisamente porque tiene que ser alcanzable por alguien
cuya sesión ya no sirve.

---

### H-03 · ALTA · La pantalla de error se rompía al renderizarse

**Qué pasaba.** `app/error.tsx` llamaba a `useI18n()`, que lanza si falta el
provider. Y el provider **no** está montado en las páginas públicas: la landing
y las legales son 100 % servidor a propósito, para no arrastrar JavaScript.

Consecuencia: cualquier error en la landing hacía que el propio boundary lanzara,
React escalaba a `global-error` y el usuario veía una pantalla en blanco en vez
de un mensaje.

**Corrección.** `useOptionalI18n()`, que cae al diccionario por defecto en vez de
lanzar, y un `global-error.tsx` propio con estilos en línea (por si el CSS
tampoco cargó) y texto en los dos idiomas, ya que allí no hay forma de negociar.

El precio —el mensaje de error sale en inglés en las páginas públicas— es
aceptable para una pantalla que solo se ve cuando ya ha fallado algo. Lo que no
es aceptable es una pantalla de error que se rompe.

---

### H-04 · ALTA · El reintento de telemetría duplicaba eventos

**Qué pasaba.** La cola reintenta ante 5xx y ante red caída, que es lo correcto.
Pero si el `INSERT` llegó a aplicarse y lo que se perdió fue la respuesta, el
reintento traía los mismos eventos y se insertaban otra vez.

Efecto: cada corte de wifi en un aula inflaba las métricas. Y con la constraint
`unique (session_id, seq)` que el módulo de analytics especifica, sería peor: el
lote entero fallaría por conflicto, devolvería 500, y el cliente reintentaría en
bucle indefinidamente.

**Corrección.** `upsert(rows, { onConflict: "session_id,seq", ignoreDuplicates: true })`.
El reintento pasa a ser idempotente. Documentado como contrato en
`modules/analytics/CLAUDE.md`: la constraint es obligatoria en la vía A.

---

### H-05 · MEDIA · El límite de cuerpo se medía en caracteres, no en bytes

`raw.length` cuenta unidades UTF-16. Un lote con acentos o emoji ocupa
sensiblemente más bytes de los que declara, así que el tope de 256 KB se quedaba
corto justo con contenido en español. **Corregido** con `Buffer.byteLength(raw, "utf8")`.

---

### H-06 · MEDIA · `aria-describedby` en un elemento que no se anuncia

En `PinInput` el atributo colgaba de un `<div>` sin rol. Un div no se anuncia,
así que ni la ayuda ("Tu PIN tiene 4 números") ni el mensaje de error llegaban a
un lector de pantalla. **Corregido**: el atributo va en el `<fieldset>`, que sí
agrupa y sí se anuncia.

---

### H-07 · MEDIA · Rutas internas inalcanzables

`/logout` y `/not-found` no estaban en la lista blanca. `/not-found` es el
destino del rewrite de denegación; `/logout` es la salida del caso `stale` de
H-02. Sin sesión, ambas redirigían al login. **Corregido** añadiéndolas a
`PUBLIC_PREFIXES` (ninguna revela nada: una pinta un 404 y la otra cierra sesión).

---

### H-08 · MEDIA · `db.yml` instalaba paquetes que no existen

`postgresql-client-17` y `postgresql-17-pgtap` no están en los repositorios por
defecto de Ubuntu; harían falta los de PGDG. **Corregido**: en el runner se
instala el metapaquete `postgresql-client` (el protocolo es compatible entre
versiones) más `pg_prove`; la **extensión** pgTAP se instala dentro del
contenedor de Postgres, que es donde tiene que existir.

---

### H-09 · BAJA · `revalidate` en una página forzosamente dinámica

`/login/student` declaraba `revalidate = 300`, pero lee cookies a través del
layout, así que Next la renderiza dinámicamente igualmente. Era una mentira
tranquilizadora. **Corregido**: se elimina y se documenta que, si el listado de
colegios llegara a pesar, se cachea la **consulta** con `unstable_cache`, no la
página.

---

### H-10 · BAJA · El PIN fallido se quedaba escrito

Tras un error, las casillas conservaban los dígitos. Un niño pulsa "entrar" otra
vez con lo mismo y gasta un intento del lockout sin darse cuenta. **Corregido**:
la `key` del `PinInput` incorpora la identidad del intento, así que un error
nuevo remonta el componente y vacía las casillas.

---

### H-11 y H-12 · BAJAS · Comentarios que no describían el código

`SiteChrome` decía usar un menú `<details>/<summary>` que no existe, y `PinInput`
afirmaba que `autocomplete="one-time-code"` **impide** que un gestor guarde el
PIN, cuando solo lo desalienta. Un comentario que miente es peor que ninguno:
alguien lo lee, se lo cree y no comprueba. **Ambos corregidos.**

---

## Respuestas a la lista de comprobación del encargo

**¿Hay algún secreto en el repositorio?**
No. `.env.example` solo tiene marcadores evidentes (`PON_AQUI_TU_...`). Además,
el job `secret-scan` de `ci.yml` busca en cada PR el prefijo de cabecera de un
JWT de Supabase y valores asignados a `SUPABASE_SERVICE_ROLE_KEY`. Es la última
barrera antes de que una clave acabe en el historial.

**¿Puede el cliente service-role acabar en un bundle de navegador?**
Tres barreras independientes:
1. `SUPABASE_SERVICE_ROLE_KEY` no lleva prefijo `NEXT_PUBLIC_`, así que el
   compilador de Next sustituye por `undefined` cualquier acceso desde código de
   cliente: la clave nunca se inlinea.
2. `import "server-only"` en `admin.ts` hace **fallar el build** si alguien lo
   importa desde un componente de cliente.
3. `assertServer()` aborta en runtime si `window` existe.
Y una cuarta preventiva: una regla `no-restricted-imports` en ESLint que prohíbe
importarlo fuera de `src/app/api/**`. Hoy **no se usa en ninguna parte**, que es
el estado correcto: la ingesta de eventos escribe con el cliente de sesión a
propósito, para que RLS siga siendo la última palabra.

**¿Deja el middleware alguna ruta sin proteger?**
No, porque la política es lista blanca y no lista negra: lo que no es público ni
está catalogado se deniega. Una página nueva sin registrar queda **cerrada**.
La excepción son `/api/*` (H-01), donde la autorización la hace cada Route
Handler y está verificada en el propio código. Además, cada layout privilegiado
repite la comprobación contra la base de datos, y por debajo está RLS: tres
capas, no una.

**¿Filtran los mensajes de error si un usuario existe?**
No. `bad_credentials` es idéntico para "código inexistente", "PIN incorrecto",
"cuenta bloqueada" y "cuenta suspendida". El bloqueo por intentos **no se
anuncia**, precisamente porque anunciarlo confirmaría que ese código existe.
El único mensaje distinguible es el de rate limit por dispositivo, que no depende
de que la cuenta exista. Lo mismo en el login de personal y en el registro, donde
"ese colegio no existe" y "fallo de base de datos" comparten respuesta.

**¿Es la CSP real o decorativa?**
Real, y hay un test que lo demuestra. `script-src` no contiene `'unsafe-inline'`
ni `'unsafe-eval'` en producción: usa un **nonce por petición** más
`strict-dynamic`. El nonce obliga a que la CSP viva en el middleware y no en
`next.config.ts` (una configuración estática no puede generarlo, y emitir dos
cabeceras haría que el navegador aplicase la intersección y bloquease los propios
scripts de Next). `e2e/landing.spec.ts` verifica que el nonce está presente y que
`script-src` no tiene las directivas permisivas: una CSP decorativa pasaría un
"¿existe la cabecera?" pero no este test.

**¿Confía la ingesta de eventos en algo del cuerpo de la petición?**
En nada relativo a identidad. `school_id` y `student_id` salen de la sesión
autenticada. El esquema `clientEvent` de `@cet/shared` ni siquiera admite esos
campos, así que Zod los descarta al parsear. Y el insert usa el cliente de sesión
con RLS activa: aunque el código tuviera un fallo, la política lo rechazaría en
la base de datos. Se acepta del cuerpo únicamente lo que es del cliente por
naturaleza: `sessionId`, `seq`, `eventType`, los ids de contexto, `payload` y
`clientTs` — este último se guarda como dato y **nunca** ordena ni puntúa.

**¿Hay `"use client"` innecesarios?**
Se auditaron todos. Quedan **diez**, y cada uno está justificado:
`PinInput`, `StudentLoginForm`, `StaffLoginForm`, `RegisterForm` y
`PinChangeForm` (formularios con `useActionState`); `LocaleProvider` y
`TelemetryProvider` (contextos); `error.tsx` y `global-error.tsx` (React exige
que un boundary de error sea cliente); y `lib/supabase/client.ts`, que no es un
componente sino un módulo que **solo** tiene sentido en el navegador — la marca
es ahí una barrera, no un coste.

Lo que **no** es cliente, y podría haberlo sido por inercia:
- La landing, las páginas legales, el selector de rol y las cabeceras/pies: cero
  JavaScript.
- **El selector de tema y el de idioma.** Son formularios que invocan Server
  Actions. Coste en el bundle: cero, y funcionan con JavaScript desactivado.
- **El cambio de tema sin parpadeo.** El patrón habitual es un script en línea
  que "arregla" el tema tras la primera pintura — y es justo lo que obliga a
  meter `unsafe-inline` en la CSP. Aquí el servidor pinta `data-theme` desde una
  cookie y, si no hay cookie, manda `prefers-color-scheme` desde CSS puro.
- `TelemetryProvider` se monta en el layout de **alumno**, no en el raíz: la
  landing no emite eventos de aprendizaje y no debe cargar ese código.

---

## Riesgos aceptados

**R-01 · Rate limiting en memoria.** `src/lib/security/rate-limit.ts` vive en la
memoria de una instancia: con varias instancias cada una lleva su cuenta, y un
despliegue lo reinicia. Es un amortiguador, no la defensa. La defensa real contra
la fuerza bruta sobre PINs está en la base de datos (`students.locked_until`,
`auth_attempts`) y es responsabilidad de la vía A. Documentarlo importa: si
alguien diera por cubierto el rate limiting, no lo implementaría donde hace falta.

**R-02 · La lista de colegios es pública.** Un desplegable de login tiene que
mostrarlos. Un colegio no es un dato personal, y no se expone `settings`: el
`select` es columna a columna, nunca `select("*")`. Mitigación del spam de
registro: 5 solicitudes por hora y dispositivo.

**R-03 · Canal lateral de tiempo en el login de personal.** Supabase responde
antes ante un email inexistente que ante uno válido con contraseña incorrecta,
porque en el segundo caso verifica el hash. Es medible. Está fuera de nuestro
control y afecta al personal, no a los menores. Se acepta.

**R-04 · `style-src 'unsafe-inline'`.** Next inyecta `<style>` sin nonce para el
CSS crítico. Un `style-src` inyectado permite exfiltración por CSS en escenarios
rebuscados, pero **no ejecución de código**: el riesgo es de otro orden de
magnitud que el de `script-src`, que sí está cerrado.

**R-05 · `sessionId` no se valida contra el usuario.** Un alumno podría enviar
eventos con el `sessionId` de otro. El impacto es nulo en confidencialidad — las
filas siguen llevando **su** `student_id`, impuesto por el servidor y por RLS —
y se limita a ensuciar el agrupamiento por sesión de sus propios eventos.

---

## Dependencias de otras vías — verificar al integrar

**D-01 · Claims del JWT (vía A).** El middleware espera `cet_role` y
`cet_school_id` en el token, vía "custom access token hook".
- Sin ellos, `claims.role` es `null` y **toda** área privilegiada devuelve 404.
  Es el fallo seguro correcto, pero deja la app inutilizable para el personal.
- Cuidado con el claim estándar `role`: vale `'authenticated'` (el rol de
  Postgres), **no** el del dominio. Confundirlos daría permisos de administrador
  a cualquiera con sesión. De ahí el prefijo `cet_`.
- Los claims van hasta un ciclo de refresco por detrás de la base de datos, así
  que solo se usan para **denegar** rápido; conceder se revalida contra
  `profiles`.

**D-02 · Edge Function y RPC (vía A).** Contratos asumidos, documentados en
`src/lib/auth/actions.ts`:
- `POST /functions/v1/auth-pin` con `{schoolId, studentCode, pin}` →
  `{ok:true, session:{access_token, refresh_token}}` o
  `{ok:false, reason:"bad_credentials"|"locked"|"rate_limited"|"school_unavailable"}`.
  **Importante:** `locked` se colapsa a `bad_credentials` en la UI a propósito.
- `rpc("change_student_pin", {p_current_pin, p_new_pin})` → `boolean`.

**D-03 · `@cet/ui` (vía D).** Ver `src/components/ui/index.ts`, que es el único
punto de importación del design system y lleva el contrato asumido escrito.
Consumo real hoy: `@cet/ui/tailwind-preset` desde `tailwind.config.ts`.

**Políticas RLS que este código da por hechas (vía A):**
- `schools`: SELECT para `anon`/`authenticated` sobre filas `active`, limitado
  por GRANT de columna a `(id, name, slug, pin_length_primary, pin_length_secondary)`.
- `registration_requests`: INSERT para `anon` con `status = 'pending'` y nada más.
- `learning_events`: INSERT del alumno con `with check` sobre `student_id` **y**
  `school_id`. Sin el `with check`, un alumno podría insertar a nombre de otro
  aunque no pudiera leerlo. Y `unique (session_id, seq)` para H-04.
- `profiles`: SELECT del propio perfil.
- `students`: SELECT de la propia ficha, **sin** `pin_hash`.

---

## Lo que esta vía NO entrega (y por qué)

- **Pantallas de lección, práctica y examen.** Son el Hito 2 y dependen de
  `@cet/engine` y `@cet/content`. `/learn`, `/teach` y `/admin` son marcadores de
  posición con la autorización ya cableada.
- **Ningún uso de `@cet/engine`.** Está declarado como dependencia, pero no se
  importa en ningún fichero: inventar una API para poder decir que se consume
  habría creado un contrato falso que romper después.
- **MFA para administradores (AD-3).** Corresponde a M02 `auth`.
- **Tests de componentes.** Playwright ejerce la app de verdad; Vitest cubre la
  lógica pura, que es donde viven los fallos silenciosos.

---

## Verificación pendiente

Este informe describe una revisión **por lectura**, no por ejecución: el encargo
prohíbe expresamente instalar dependencias o construir, porque cinco agentes en
paralelo corromperían el lockfile. Al integrar hay que ejecutar, en este orden:

```bash
pnpm install
pnpm --filter @cet/web typecheck   # el primero que fallará si @cet/ui difiere
pnpm --filter @cet/web lint
pnpm --filter @cet/web test
pnpm --filter @cet/web build
pnpm --filter @cet/web test:e2e
```

Fallos esperables en la primera pasada, todos por dependencias aún inexistentes:
`@cet/ui` (preset de Tailwind y primitivos) y los tipos de la base de datos, que
hoy se leen con acceso dinámico y casts explícitos y deberían pasar a
`packages/shared/src/database.types.ts` en cuanto exista (`pnpm db:types`).
