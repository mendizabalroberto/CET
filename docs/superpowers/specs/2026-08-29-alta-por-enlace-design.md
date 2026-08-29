# Alta por enlace — la cadena de invitación y el dispositivo recordado

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Fecha: 29 de agosto de 2026.
> **Continúa y cierra** `2026-08-28-refundacion-tenencia-design.md`. Aquel hito diseñó el modelo
> (rol `guardian`, membresías con fechas, `student_access_links`); este lo pone en pie de punta a
> punta y añade lo que allí no existía: **cómo entra un tutor** y **cómo el dispositivo recuerda
> al niño**.

---

## 1 · Qué cambia, en una frase

Nadie entra en CET sin que alguien le haya dado un enlace, y un niño que ya entró una vez
**no vuelve a teclear más que su PIN**.

---

## 2 · La cadena de invitación

```
[contratación]  ──►  enlace de tutor  ──►  Roberto  ──►  enlace de alumno  ──►  Leo
   (fuera de           un solo uso,                        un solo uso,
    este spec)         7 días, ligado                      7 días, sin correo
                       a un correo
```

Tres eslabones y **un solo mecanismo**: un token aleatorio de 32 bytes, del que la base de datos
guarda únicamente el SHA-256, con caducidad, revocable, y consumido al primer canje con éxito.
La forma se repite a propósito: una sola idea que auditar, un solo modo de fallo que entender.

### 2.1 · Por qué de un solo uso

Un enlace reutilizable es una credencial permanente viviendo en un hilo de WhatsApp. Un enlace de
un solo uso, en cambio, se convierte en papel mojado en el instante en que cumple su función, y eso
cambia el análisis de todo lo demás: el token puede viajar en la URL —y por tanto quedar escrito en
los registros de acceso de Vercel— porque para cuando alguien lea ese registro ya no abre nada.

El precio es real y se asume: si Leo estrena tablet, borra los datos del navegador o abre la app en
modo incógnito, necesita un enlace nuevo. Cuesta dos clics a su tutor, y la puerta clásica
—colegio → código → PIN— sigue existiendo para los alumnos que sí tienen colegio.

### 2.2 · El eslabón que no se diseña aquí

La contratación —qué se compra, cómo se paga, qué pasa cuando caduca— **queda fuera**. Lo que este
spec deja es la sutura: la acción de dominio `invitarTutor(email)` y una columna `contrato_ref`
vacía en `guardian_invites`. Hoy la invoca el superadmin desde `/admin`; mañana la invoca el
proceso de compra y no hay nada que reescribir. Lo que no se hace es adivinar planes, estados de
suscripción ni pasarelas de pago.

---

## 3 · El recorrido, con Roberto y Leo

1. **El superadmin invita a Roberto.** `invitarTutor('mendizabal.roberto@gmail.com')` escribe una
   fila en `guardian_invites` y devuelve la URL **una sola vez**, igual que hace hoy
   `resetStudentPin` con el PIN.
2. **Roberto se da de alta.** Abre el enlace, ve su correo **fijo y no editable**, y solo pone
   nombre y contraseña. Se crea `profiles(role='guardian', school_id=null, status='active')`.
   No hay correo de verificación aparte: el enlace **se entregó por ese buzón**, y abrirlo ya
   demuestra que lo controla. La constraint `profiles_staff_needs_email`, que ya existe, obliga a
   que un tutor tenga correo; no es una convención de la aplicación sino una regla de la base.
3. **Roberto crea a Leo.** Nombre y apellidos, fecha de nacimiento, curso. La etapa —y con ella la
   longitud del PIN, 4 o 6— se deriva del curso. El colegio se queda vacío. Se crean el `auth.users`
   sintético, `profiles(role='student', school_id=null)`, `students` con un `pin_hash` inservible y
   `guardian_students(Roberto → Leo)`.
4. **Roberto genera el enlace de Leo** y se lo manda por donde quiera. La URL se muestra una vez.
5. **Leo lo abre.** Una pantalla, su nombre de pila, dos grupos de casillas: **elige su PIN**.
6. **El canje.** Verifica el token, delega en la Edge Function `student-pin` —el único sitio del
   sistema que calcula Argon2id— para escribir `pin_hash`, marca el enlace consumido, da de alta el
   dispositivo, abre sesión y devuelve la cookie. Todo auditado. Leo está dentro.
7. **Al día siguiente.** La sesión caducó, el middleware lo manda a `/login`, `/login` lee la cookie
   del dispositivo, resuelve quién es y pinta «Hola, Leo» con cuatro casillas. Ni colegio, ni
   código, ni correo.

### 3.1 · El PIN se fija, no se transmite

Hoy el sistema genera un PIN, alguien se lo dicta al niño, el niño entra con él y lo cambia
(`pin_must_change`, AD-4). Con un enlace de un solo uso **el enlace ya es la prueba de identidad**,
así que Leo fija su PIN por primera vez sin teclear ninguno anterior.

Esto elimina una credencial entera del recorrido: no hay un PIN inicial viajando por WhatsApp junto
al enlace. AD-4 no se contradice —su exigencia es que el alumno acabe con un PIN que solo él
conoce— y se cumple mejor: nunca existió otro.

El camino del colegio no cambia. `createStudent` sigue devolviendo un PIN de un solo uso para el
administrador que da de alta a treinta alumnos de golpe y no va a generar treinta enlaces.

---

## 4 · Modelo de datos

### 4.1 · `guardian_invites` — el enlace del tutor

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `token_hash` | text not null unique | SHA-256. El token en claro no se guarda jamás |
| `email` | citext not null | a quién va dirigida; la pantalla de alta lo muestra fijo |
| `expires_at` | timestamptz not null | |
| `revoked_at` | timestamptz | |
| `used_at` | timestamptz | |
| `used_by` | uuid → `profiles(id)` on delete set null | el tutor que nació de aquí |
| `created_by` | uuid → `profiles(id)` on delete set null | superadmin hoy; el proceso de compra mañana |
| `contrato_ref` | text | vacía hasta que exista la contratación |
| `created_at` | timestamptz not null default now() | |

RLS habilitada. **Ninguna política concede lectura a nadie**: la tabla se consulta solo con
`service_role`, desde la acción de canje. El fallo seguro es que no se lea.

**No se fusiona con `student_access_links`** aunque la forma sea casi idéntica. Una guarda la
credencial de un adulto y la otra la de un menor, y las políticas que las gobiernan no se parecen.
Una tabla única con discriminador obliga a que cada política razone sobre el tipo antes de decidir,
y esa es exactamente la clase de política que se escribe mal una vez y filtra durante meses.

### 4.2 · `student_devices` — el dispositivo casado

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid not null → `profiles(id)` on delete cascade | |
| `device_hash` | text not null unique | SHA-256 del secreto. El secreto vive **solo** en la cookie |
| `etiqueta` | text | «Tablet de casa». Lo pone el tutor |
| `agente_familia` | text | «Chrome en Android». **No** el user-agent completo |
| `created_from_link` | uuid → `student_access_links(id)` on delete set null | trazabilidad del canje |
| `created_at` | timestamptz not null default now() | |
| `last_seen_at` | timestamptz | |
| `revoked_at` | timestamptz | |

`create index dispositivos_alumno_idx on student_devices (student_id) where revoked_at is null`.

RLS: el alumno ve los suyos; el tutor, los de sus hijos vía `app.puede_ver_alumno()`, que ya existe
(migración `0058`). `INSERT` y `UPDATE`, solo `service_role`. Y `device_hash` se protege con
**`grant` por columna**, exactamente como `pin_hash` en `0013_grants.sql`: que la columna no sea
legible es una garantía del motor, no de una política que alguien pueda reescribir mal.

`agente_familia` es minimización de datos, no pereza: el tutor necesita reconocer qué tablet está
revocando, y el user-agent completo de un menor es una huella digital que no hace falta tener.

### 4.3 · Lo que ya existe y no se toca

`student_access_links` (migración `0057`) **no necesita columna nueva** para el uso único:
`revoked_at` ya significa «este enlace no vale» y el canje lo escribe junto a `last_used_at`.
`guardian_students` y `student_school_memberships` quedan como están.

### 4.4 · El alumno sin colegio

Tres cambios en tablas existentes, todos consecuencia de que Leo nace sin colegio:

- **`students.school_id` pasa a nullable.** Hoy es `not null` (`0003_tenancy.sql:164`).
- **La unicidad del código.** `students_code_uniq` es `unique (school_id, student_code)`, y en
  Postgres dos NULL son distintos entre sí: con `school_id` nulo, esa constraint dejaría entrar
  códigos repetidos. Hace falta además un **índice único parcial** sobre `student_code`
  `where school_id is null`. Sin él, la unicidad desaparece justo en el caso nuevo.
- **El correo sintético.** `createStudent` compone hoy
  `s.<código>.<8 primeros del colegio>@students.cet.invalid`. Sin colegio no hay sufijo, así que el
  hijo de un tutor usa `s.<código>@familia.cet.invalid`, con el código generado por el sistema y
  globalmente único por el índice parcial anterior. Sigue siendo un dominio `.invalid` (RFC 2606):
  no resuelve en DNS y por tanto no puede recibir correo.

---

## 5 · Las dos puertas de `auth-pin`

La Edge Function gana una segunda forma de entrada. El Zod de la frontera pasa a ser una unión
discriminada:

```
{ schoolId, studentCode, pin }        ← la puerta del colegio, intacta
{ deviceToken, pin }                  ← la puerta del dispositivo
```

`deviceToken` se acota a base64url de 43 caracteres **antes** de tocar la base de datos, por el
mismo motivo que el PIN se acota a 4–8 dígitos: sin ese límite, una entrada de 10 MB llega hasta el
verificador de Argon2id, que reserva 19 MiB por verificación, y eso es una denegación de servicio
gratuita.

Nada de lo que protege la puerta vieja se relaja en la nueva:

- **El lockout y el rate limit cuentan por alumno, no por puerta.** Si contaran por puerta, la del
  dispositivo sería un rodeo para gastar intentos infinitos contra el mismo PIN.
- **El hash señuelo y el suelo de `MIN_RESPONSE_MS` se aplican igual** cuando el `deviceToken` no
  existe. Si «dispositivo desconocido» respondiera en 5 ms y «PIN incorrecto» en 90, se enumerarían
  tokens con un cronómetro — el mismo ataque que la cabecera del fichero ya documenta para los
  códigos de alumno.
- **Dispositivo revocado, enlace caducado, alumno suspendido, colegio suspendido**: todos devuelven
  el mismo fallo genérico, con el mismo cuerpo y el mismo tiempo.

Y el invariante que sostiene el diseño entero:

> **La cookie de dispositivo no abre ninguna sesión por sí sola.**
> Lo único que compra es saltarse los pasos 1 y 2 del formulario. La sesión sigue naciendo de un
> Argon2id verificado, y `auth.uid()` sigue siendo el único eje de la RLS.

La alternativa —mantener viva la sesión de Supabase para siempre y poner el PIN como pantalla de
bloqueo— se evaluó y se descarta: convierte el PIN en decoración, porque la sesión ya está viva
antes de teclearlo y cualquiera que coja la tablet entra navegando directamente a `/learn`.

### 5.1 · La cookie

`cet_device`, con `HttpOnly` (ningún JavaScript de la página puede leerla), `Secure`,
`SameSite=Lax`, `Path=/` y `Max-Age` de un año. Contiene el secreto en claro; la base de datos solo
tiene su hash. Perder la cookie es perder el atajo, nunca la cuenta.

Un dispositivo, un alumno. Si un hermano canjea su enlace en la misma tablet, sustituye al anterior
en esa cookie; la tabla admite varios sin cambio alguno, pero la pantalla de «elige quién eres» no
se construye hasta que haga falta de verdad.

---

## 6 · Interfaz

Cinco superficies. Todas en `es` y `en`, sin cadenas a pelo, y con `axe` limpio en tema claro y
oscuro.

| Ruta | Quién | Qué |
|---|---|---|
| `/admin` → invitar tutor | superadmin | un campo (correo), y la URL mostrada una sola vez |
| `/register?t=…` | nadie aún | correo fijo + nombre + contraseña. **Sin token válido**, no es un formulario: dice «El acceso a CET es por invitación. Si has contratado el servicio, busca el enlace en tu correo» |
| `/tutor` | guardian | sus hijos, y el botón de añadir uno |
| `/tutor/hijos/[id]` | guardian | el enlace (generar · copiar una vez · revocar), los dispositivos casados con su etiqueta y su «visto por última vez» y un botón **«Olvidar este dispositivo»**, y el reseteo de PIN |
| `/e/[token]` | el niño | una pantalla, su nombre de pila, elige PIN |

**Tono.** `modules/admin` §5.1 fija densidad y detalle técnico para personal adulto; un padre no es
eso. En la zona del tutor no aparece un término técnico, tampoco en los errores.

**El nombre de pila y nada más.** «Hola, Leo», nunca «Leo Mendizabal, Y6A». Quien encuentre la
tablet perdida no debe poder sacar de ahí la ficha de un menor.

**Un enlace que no vale** da una pantalla amable que no distingue caducado de ya usado de
inexistente: distinguirlos convierte la pantalla en un oráculo sobre qué tokens existieron.

`registration_requests` no se toca: es la cola de peticiones de personal de colegio y sigue siendo
asunto de `/admin`.

---

## 7 · Lo que hay que terminar de la refundación de tenencia

Leo nace sin colegio, y hoy **el código no lo permite**. La migración `0060` retiró la constraint
`profiles_alcance_por_rol` y dejó escrito por qué: la aplicación sigue dando de alta al alumno con
`school_id`, y `lib/auth/session.ts` y `app/api/attempts/_context.ts` cortan con
`if (!profile.schoolId) → forbidden`. Un alumno sin colegio, hoy, se lleva un 403 a mitad de examen.

Entra por tanto en este hito lo que quedó pendiente allí:

- **Tarea 7** — `learning_events.school_id` nullable y `app.colegio_del_evento()`: el colegio no ve
  ni un solo evento de lo que el niño practica en casa.
- **Tarea 8** — la migración de datos. En producción hay **un superadmin y un alumno de prueba**
  (`Y6A-001`), comprobado el 29/08/2026 y autorizado su borrado por el propietario. Lo que era una
  migración es un `delete` y una resiembra.
- **Tarea 9** — `app.audit()` con actor sin colegio.
- **La purga de `if (!schoolId)`** en `session.ts` y `_context.ts`, y la constraint
  `profiles_alcance_por_rol` **de vuelta**, ahora sí en la misma tanda que el código que la respeta
  y que `supabase/tests/escrituras_de_perfil.sql`, que es quien obliga a que vayan juntos.

Esto no es alcance que se añade por gusto: sin ello, el recorrido de este spec no funciona.

---

## 8 · Seguridad y datos de menores

1. **Ningún token en claro en reposo.** Ni el del tutor, ni el del alumno, ni el del dispositivo.
2. **Ninguna credencial se muestra dos veces.** Las tres URL se devuelven una vez, en la respuesta
   de su acción, y no se escriben en ningún registro nuestro.
3. **Todo canje deja rastro.** `audit_log` con `before`/`after`, dentro de la misma transacción que
   la operación — si el audit va fuera, existe un intervalo en el que la acción ocurrió y no consta.
4. **El colegio no ve lo de casa.** Consecuencia de la tarea 7, verificada por pgTAP.
5. **Minimización.** Del dispositivo se guarda una familia de agente, no el user-agent. Del alumno,
   ningún dato de contacto: el correo del tutor es el único.
6. **Riesgo aceptado:** el token viaja en la URL y queda en los registros de acceso de Vercel. Lo
   hace tolerable el uso único y los 7 días de caducidad. Se documenta aquí para que la decisión sea
   deliberada y no un descuido heredado.

---

## 9 · Verificación

**pgTAP**
- `guardian_invites` y `student_devices` con RLS habilitada y `grant` por columna sobre
  `device_hash` y `token_hash`.
- Un tutor ve los dispositivos de su hijo y **no** los del hijo de otro.
- Un alumno sin colegio existe, emite telemetría, y su colegio-que-no-es no ve ni un evento.
- La unicidad del código de alumno se sostiene con `school_id` nulo.

**Vitest**
- El Zod del canje y el de la invitación: token opaco de 32 bytes en base64url, PIN de 4–8 dígitos.
- El discriminador de las dos puertas de `auth-pin`.
- La derivación de etapa y longitud de PIN a partir del curso.

**Playwright, de punta a punta y en una sola prueba**
Superadmin invita → Roberto se da de alta → crea a Leo → genera su enlace → Leo elige PIN y entra →
practica → **vuelve con la cookie puesta y entra solo con el PIN** → el enlace ya usado da la
pantalla amable → el tutor olvida el dispositivo y la siguiente visita cae en la puerta clásica.

**Manual, en producción, con personas de verdad:** Roberto y Leo.

---

## 10 · Reparto entre agentes

`HANDOFF-DEEPSEEK.md` §0.2 y `HANDOFF-KIMI.md` §0.2: DeepSeek no ve imágenes y Kimi sí; nada
visible lo firma quien no lo ve. La línea cae limpia entre el §4/§7 (base de datos) y el §6
(interfaz).

| Contrato | Cubre | Territorio | Agente |
|---|---|---|---|
| `enl-1-tablas` | §4.1, §4.2 | `supabase/migrations/0064_*`, `supabase/tests/invitaciones_y_dispositivos.sql` | DeepSeek `reasoner` |
| `enl-2-alumno-sin-colegio` | §4.4, §7 (tareas 7 y 9) | `supabase/migrations/0065_*`, `0066_*`, `supabase/tests/evento_sin_colegio.sql` | DeepSeek `reasoner` |
| `enl-3-dos-puertas` | §5 | `supabase/functions/auth-pin/**`, `supabase/functions/student-pin/**` | Kimi `k3` |
| `enl-4-acciones` | §3 (acciones de dominio y Zod) | `apps/web/src/lib/tutor/**`, `apps/web/src/components/staff/actions.ts` | Kimi `codigo` |
| `enl-5-e2e` | §9 Playwright | `apps/web/e2e/alta-por-enlace.spec.ts` | Kimi `codigo` |

**Opus (yo) firma:** el §6 entero —las cinco superficies son visuales—, la purga de
`if (!schoolId)` (toca examen, y un fallo ahí es un 403 a mitad de prueba), la tarea 8 del §7 (el
borrado de `Y6A-001` y la resiembra, que es un cambio destructivo sobre producción y no se delega),
el despliegue, y el alta real con Roberto y Leo.

Los territorios de `enl-1` y `enl-2` **se solapan en las migraciones**, así que no van en el mismo
lote: `--batch` valida que sean disjuntos y se negaría entero. Orden: `enl-1` → `enl-2` → (`enl-3`,
`enl-4` en paralelo) → `enl-5`.

`forbidden` en todos: `packages/ui/src/index.ts` y `packages/shared/src/index.ts` — el barril es
ajeno siempre.

---

## 11 · Criterios de finalización

- [ ] El superadmin genera un enlace de tutor y la URL se muestra una sola vez.
- [ ] `/register` sin token no ofrece formulario; con token, el correo es fijo.
- [ ] Roberto existe como `guardian` sin colegio y crea a Leo.
- [ ] Leo existe como `student` sin colegio, entra por enlace, **fija** su PIN, y practica.
- [ ] La segunda visita de Leo pide **solo el PIN**, sin colegio ni código.
- [ ] Ningún token en claro en la base de datos: comprobado por pgTAP sobre las tres tablas.
- [ ] El lockout cuenta por alumno y no por puerta, comprobado con una prueba que agota intentos
      alternando las dos puertas.
- [ ] El tutor olvida un dispositivo y ese dispositivo deja de servir.
- [ ] Un alumno sin colegio emite telemetría y ningún colegio la ve.
- [ ] `pnpm verify` en verde, `axe` limpio en las cinco superficies, en claro y en oscuro.
- [ ] Desplegado, y el alta real hecha: Roberto Mendizabal tutor, Leo Mendizabal alumno.
