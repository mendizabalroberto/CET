# M03 · `users` — perfiles, roles, invitaciones y aprobación de registro

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Depende de: M01 `security`, M02 `auth`. Del que depende: M04 `students`.

---

## Objetivo

Gestionar **quién es quién** dentro de un colegio: el ciclo de vida de un perfil
desde que alguien pide entrar hasta que se le suspende, y el reparto de los cuatro
roles del sistema.

Dos invariantes que este módulo existe para sostener:

1. **`superadmin` ⟺ `school_id IS NULL`.** No hay superadmin de un colegio, y no
   hay staff sin colegio. Está en la base de datos como CHECK, no en el código.
2. **Nadie se asciende a sí mismo.** Ni un alumno, ni un profesor, ni un
   `school_admin` (que no puede crear otros administradores ni superadmins).

---

## Arquitectura

### Los cuatro roles

| Rol | `school_id` | Alcance | Cómo se crea |
|---|---|---|---|
| `superadmin` | **NULL** | Todos los colegios. Autor de la biblioteca global (AD-2) | A mano, seed `0001_superadmin.sql` + MFA |
| `school_admin` | obligatorio | Su colegio entero: perfiles, PINs, contenido propio, auditoría | Invitado por un superadmin |
| `teacher` | obligatorio | Su colegio: alumnos, clases, exámenes, corrección | Invitado por un `school_admin` |
| `student` | obligatorio | Solo lo suyo | Alta por `school_admin` o aprobación de una solicitud |

`app.is_staff()` cubre `school_admin` **y** `teacher`, y **no** incluye
`superadmin` — a propósito: "staff" significa "personal de un colegio". Las
políticas que quieren cubrir a los tres lo escriben explícitamente.

### Estados de un perfil

```
        registro / invitación
                 │
                 ▼
             pending ──────► active ◄────► suspended
                 │              │
                 └── rejected   └── (borrado real: DELETE en auth.users, cascade)
```

`pending` y `suspended` **no ven nada**: `app.current_school_id()` y
`app.current_role()` exigen `status = 'active'`. La única excepción es su propia
fila de `profiles`, cuya política compara contra `auth.uid()` sin pasar por los
helpers — precisamente para que la interfaz pueda decirle **por qué** no puede
entrar en vez de mostrarle una pantalla en blanco.

Efecto lateral deseado: **suspender corta el acceso al instante**, sin tocar
sesiones ni esperar a que caduque un JWT.

### La escalada de privilegios y por qué la RLS no basta

`profiles_update_own` permite a cualquiera hacer UPDATE de su propia fila (para
cambiar su nombre o su idioma). Una política RLS decide **qué filas**, nunca **qué
columnas**. Sin más defensa, esto funcionaría:

```js
supabase.from('profiles').update({ role: 'superadmin', school_id: null }).eq('id', myId)
```

`with check (id = auth.uid())` lo aprueba, porque la fila resultante sigue siendo
suya. Lo que lo impide es el trigger **`app.profiles_guard_escalation()`**, que
congela `role`, `school_id`, `status` e `id` salvo para quien tenga derecho:

- `superadmin` → puede todo.
- `school_admin` → puede cambiar rol y estado **dentro de su colegio**, pero
  nunca mover un perfil a otro colegio ni crear/tocar superadmins.
- cualquier otro (incluido uno mismo) → los cuatro campos congelados.

Y en la política de INSERT hay una segunda barrera: `profiles_insert_school_admin`
lleva `and role in ('teacher','student')`. Comprometer una cuenta de admin de
colegio no debe comprometer la plataforma.

### Alta de perfil

```
Invitación de staff:   superadmin/school_admin  ->  Server Action  ->  GoTrue inviteUserByEmail
                                                                   ->  insert profiles (status='pending')
                       el invitado fija contraseña               ->  update status='active'

Registro de alumno:    formulario público -> Route Handler (service_role, captcha)
                                          -> insert registration_requests (status='pending')
                       school_admin aprueba -> crea auth.users sintético + profiles + students
                                            -> update registration_requests(status='approved')
```

El formulario público **no** llega a la tabla desde el navegador: `anon` no tiene
ningún GRANT. Dar INSERT a `anon` sobre `registration_requests` sería un
formulario de spam abierto a internet.

---

## Tablas

| Tabla | Propiedad de | Notas |
|---|---|---|
| `profiles` | **M03** | `id = auth.users.id`. CHECK `superadmin ⟺ school_id IS NULL`; CHECK "el staff necesita email"; email único **por colegio** (la misma persona puede trabajar en dos) |
| `registration_requests` | **M03** | CHECK: `pending ⟺ reviewed_at IS NULL`; CHECK: `rejected ⟺ hay motivo` — rechazar sin motivo deja al tutor sin nada que hacer |
| `sections`, `section_members` | compartida con M04 | `school_id` denormalizado para que la RLS no necesite joins |
| `audit_log` | M01 | Toda alta, cambio de rol y suspensión pasa por `app.audit()` |

Índices que sirven a las queries reales de este módulo:

- `profiles_school_role_status_idx (school_id, role, status)` — "profesores de mi
  colegio", "alumnos pendientes de aprobación".
- `profiles_full_name_trgm_idx` (GIN, pg_trgm) — la búsqueda por nombre del panel
  admin: sin él, `ILIKE '%garcía%'` es un seq scan del colegio entero.
- `registration_requests_pending_idx` — índice **parcial** `where status='pending'`:
  la bandeja de entrada se consulta a diario y las solicitudes ya resueltas son el
  99 % de la tabla.

---

## APIs

Todo por **Server Actions** de Next.js (no hay REST propio). Cada una valida con
Zod, comprueba el rol en el servidor y audita.

| Acción | Quién | Efectos |
|---|---|---|
| `inviteStaff({ email, role, fullName })` | `school_admin` (solo `teacher`), `superadmin` (cualquiera) | GoTrue invite + `profiles` en `pending` + `app.audit('profile.invited', ...)` |
| `approveRegistration({ requestId, studentCode, yearLevel, section })` | `school_admin` | Crea usuario sintético, `profiles`, `students` con PIN aleatorio; devuelve el PIN **una sola vez**; audita |
| `rejectRegistration({ requestId, reason })` | `school_admin` | `reason` obligatorio (lo exige un CHECK, no solo Zod) |
| `changeRole({ profileId, role })` | `school_admin` (no a/desde `superadmin`), `superadmin` | Audita `before`/`after` |
| `suspendProfile({ profileId, reason })` | `school_admin`, `superadmin` | `status='suspended'`; el acceso muere en la siguiente petición |
| `updateOwnProfile({ fullName, locale })` | cualquiera | El trigger congela `role`, `school_id`, `status` |
| `deleteProfile({ profileId })` | `superadmin` | Borra en `auth.users`; el resto cae por CASCADE. **No hay política de DELETE sobre `profiles`**: el borrado de una persona es una operación deliberada de administración, no un DELETE suelto desde el cliente |

---

## Frontend

- **`/admin/users`** — listado con filtros por rol y estado; búsqueda por nombre
  (trigram); acciones en línea. Server Component + islas cliente para las
  acciones.
- **`/admin/registrations`** — bandeja de solicitudes pendientes; aprobar abre un
  formulario con código de alumno sugerido y muestra el PIN generado **una vez**,
  con un aviso claro de que no se podrá volver a ver.
- **`/profile`** — edición de nombre e idioma. Los campos `role`, `school_id` y
  `status` se muestran **deshabilitados y explicados**, no ocultos: un campo
  oculto invita a buscarlo en el DOM; uno visible y bloqueado comunica la regla.
- **`/pending`** — pantalla para `status = 'pending'`. Dice qué falta y a quién
  avisar. Es accesible porque la política `profiles_select_own` no pasa por los
  helpers.

Accesibilidad: tablas con `<caption>` y cabeceras asociadas, acciones alcanzables
con teclado, confirmación explícita antes de suspender o borrar, y todo string por
i18n (AD-7).

---

## Seguridad

| Amenaza | Defensa |
|---|---|
| Autoascenso a superadmin | Trigger `app.profiles_guard_escalation()` |
| `school_admin` que fabrica administradores | `and role in ('teacher','student')` en la política de INSERT |
| Mover un perfil a otro colegio | El trigger lo rechaza para todos menos el superadmin |
| Superadmin "de un colegio" | CHECK `profiles_superadmin_has_no_school` |
| Staff huérfano (sin colegio) | El mismo CHECK. Sin él, sus políticas compararían contra NULL y quedaría un usuario roto e indepurable |
| Spam en el formulario público de registro | `anon` sin GRANT; el alta pasa por Route Handler con captcha y `service_role` |
| Enumeración de emails en la invitación | El resultado es siempre "si ese email es válido, recibirá una invitación" |
| Staff cotilleando perfiles ajenos | Toda lectura de datos de alumno por parte de staff se audita (`app.audit`) |

---

## Pruebas

**pgTAP**
- `constraints.sql`: superadmin con colegio → imposible; staff sin colegio →
  imposible; staff sin email → imposible; rechazo sin motivo → imposible.
- `rls_student_cannot_read_peers.sql`: un alumno no se asciende a superadmin ni se
  cambia de colegio (42501 en ambos casos).
- `rls_tenant_isolation.sql`: `profiles` y `registration_requests` de otro colegio
  → 0 filas, en ambos sentidos.

**Vitest**
- Los esquemas Zod de cada Server Action rechazan rol fuera del enum, email
  inválido y `reason` vacío en el rechazo.

**Integración**
- Un `school_admin` que intenta `changeRole(x, 'superadmin')` recibe 42501 y no
  deja rastro de cambio.
- Suspender un perfil deja sin acceso a la siguiente petición **con el mismo JWT**
  (el test es exactamente reutilizar el token).

**e2e**
- Invitar profesor → aceptar invitación → aparece como `active`.
- Registro público → aprobación → el alumno entra con su PIN.

---

## Criterios de finalización

- [ ] Los cuatro roles existen y sus políticas están probadas tabla por tabla.
- [ ] Ningún camino permite a alguien cambiarse su propio `role`, `school_id` o `status`.
- [ ] Un `school_admin` no puede crear ni modificar `school_admin` ni `superadmin`.
- [ ] El flujo completo de registro (solicitud → aprobación → alumno con PIN) funciona end-to-end.
- [ ] Rechazar una solicitud sin motivo es imposible en la DB, no solo en el formulario.
- [ ] Suspender corta el acceso en la petición siguiente, con el JWT todavía vigente.
- [ ] Toda alta, cambio de rol y suspensión aparece en `audit_log` con `before`/`after`.
- [ ] La búsqueda de usuarios usa el índice trigram (verificado con `EXPLAIN`, no supuesto).
- [ ] Cero strings hardcodeados: todo por i18n (AD-7).
