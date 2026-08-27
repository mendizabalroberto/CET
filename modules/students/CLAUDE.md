# M04 · `students` — fichas, códigos, clases, gestión de PIN y tutores

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Depende de: M03 `users` (y por tanto de M01 y M02).

---

## Objetivo

Ser la ficha operativa del alumno: el código con el que entra, la clase a la que
pertenece, el estado de su PIN y el único dato de contacto que el sistema guarda
de un menor.

Este módulo trabaja bajo una restricción que no es negociable: **son datos de
menores**. MASTER_PLAN §9 lo traduce en cuatro reglas concretas:

1. **Minimización.** No se pide un dato que no se necesite. Un alumno no tiene
   email, ni teléfono, ni dirección, ni fecha de nacimiento. Tiene un nombre, un
   curso, una clase y —opcionalmente— el email de un tutor.
2. **Auditoría.** Todo acceso de staff a datos de alumno queda registrado.
3. **Cifrado en tránsito y reposo.** Lo aporta la plataforma; este módulo no
   guarda nada fuera de ella.
4. **Borrado en cascada verificado.** Borrar a un alumno tiene que llevarse
   *todo* lo suyo, y hay un test que lo demuestra.

---

## Arquitectura

### El código de alumno

`students.student_code` es `citext` y es único **por colegio**, no globalmente:
`unique (school_id, student_code)`. Dos colegios pueden tener ambos un "A001" y
eso no es una colisión, es lo normal.

`citext` porque el niño teclea `y6a-001` y su carné dice `Y6A-001`, y las dos
cosas tienen que funcionar. El CHECK `students_code_format` lo acota a
`[A-Za-z0-9._-]{2,32}`: sin espacios ni símbolos, porque es lo que un niño de 11
años copia a mano de un papel.

### La denormalización de `school_id`

`students.school_id` está duplicado respecto de `profiles.school_id`. Es
deliberado (DATA_MODEL §1): sin él, **cada** política RLS de datos de alumno haría
un join a `profiles`. Con él, la comparación de tenant es un filtro sobre una
columna indexada de la propia fila.

Lo que hace que la denormalización sea segura y no una bomba de relojería:

- El trigger `app.students_guard_update()` **prohíbe** cambiar `school_id` con un
  UPDATE: mover a un alumno de colegio es una migración de datos, no un `set`.
- `app.sync_attempt_school_id()` **impone** (no comprueba) el `school_id` de cada
  `exam_attempts` a partir del alumno, para que ni un backend con un bug pueda
  escribir un tenant ajeno.

### El PIN — qué le toca a este módulo

M02 verifica el PIN; M04 lo **administra**. La frontera es estricta:

| Columna | La escribe |
|---|---|
| `pin_hash` | **Solo** la Edge Function con `service_role`. `authenticated` no tiene GRANT de UPDATE sobre esa columna |
| `pin_updated_at` | Igual |
| `pin_must_change` | El staff (reset de PIN) o la Edge Function (tras un cambio) |
| `failed_pin_attempts` | La Edge Function lo incrementa; el staff **solo puede bajarlo** (el trigger rechaza subirlo) |
| `locked_until` | La Edge Function lo pone; el staff lo limpia para desbloquear |

La asimetría en `failed_pin_attempts` es intencionada: desbloquear a un alumno es
una acción legítima del profesor; "castigar" a otro subiéndole el contador no lo
es, y tampoco lo es que un bug de la interfaz de administración deshaga el
anti-fuerza-bruta sin querer.

La longitud del PIN sale de `students.stage` cruzado con el colegio:
`primary` → `schools.pin_length_primary` (4 por defecto), `secondary` →
`pin_length_secondary` (6). AD-4.

### Clases

`sections (school_id, academic_year, name)` es único: dos "Y6A" del mismo curso
académico en el mismo colegio son un error de datos, no dos clases.

`section_members` lleva `school_id` denormalizado y su política de lectura usa
`app.is_member_of_section()` en vez de un `exists` sobre sí misma — un `exists`
recursivo produciría *infinite recursion detected in policy for relation
section_members*.

### El tutor

`guardian_email` es el **único** dato de contacto. No hay tabla de tutores, ni
nombre, ni teléfono, ni parentesco. Si mañana se necesita más, será una decisión
consciente con su base legal, no una columna que ya estaba ahí.

---

## Tablas

| Tabla | Columnas clave de M04 |
|---|---|
| `students` | `profile_id` (PK, = `profiles.id`), `school_id`, `student_code`, `year_level` (1–13), `stage`, `section`, `pin_*`, `guardian_email`, `enrolled_at` |
| `sections` | `school_id`, `name`, `year_level`, `academic_year` |
| `section_members` | `(section_id, profile_id)` PK, `role_in_section`, `school_id` |

Índices y su porqué:

- `students_code_uniq (school_id, student_code)` — sirve además el login: la Edge
  Function busca exactamente por ese par.
- `students_school_section_idx (school_id, section, year_level)` — "los alumnos de
  Y6A" en el panel del profesor.
- `students_locked_idx (school_id, locked_until) where locked_until is not null` —
  parcial: en régimen normal casi ninguna fila la cumple, así que el índice es
  diminuto y responde al instante a "¿a quién hay que desbloquear?".
- `section_members_profile_idx (profile_id)` — inverso a la PK: "¿en qué clases
  está este perfil?" es la primera query de la pantalla de inicio.
- `section_members_section_role_idx (section_id, role_in_section)` — "dame los
  alumnos de esta clase" al asignar un examen.

---

## APIs

Server Actions, todas con Zod + comprobación de rol en el servidor + `app.audit`.

| Acción | Quién | Notas |
|---|---|---|
| `createStudent({ fullName, studentCode, yearLevel, stage, section, guardianEmail })` | `school_admin` | Crea `auth.users` sintético, `profiles`, `students` con PIN aleatorio. Devuelve el PIN **una sola vez** |
| `updateStudent({ profileId, ...campos })` | `school_admin` | `school_id`, `profile_id`, `pin_hash` y `pin_updated_at` no son modificables (GRANT + trigger) |
| `resetPin({ profileId })` | `school_admin`, `teacher` | PIN aleatorio con `crypto.getRandomValues`, `pin_must_change = true`, `locked_until = null`. Audita `student.pin_reset` |
| `unlockStudent({ profileId })` | `school_admin`, `teacher` | `locked_until = null`, `failed_pin_attempts = 0`. Audita |
| `bulkImportStudents(csv)` | `school_admin` | Transaccional: o entran todos o no entra ninguno. Devuelve un PDF con los PIN para imprimir y repartir |
| `assignToSection({ profileIds, sectionId })` | `teacher`, `school_admin` | La clase debe ser del mismo colegio |
| `deleteStudent({ profileId })` | `school_admin` | Borra en `auth.users`; el CASCADE se lleva perfil, ficha, matrículas, intentos, respuestas, calificaciones, telemetría y mastery |

**Contrato con M09:** ningún endpoint de este módulo devuelve `pin_hash` ni lo
acepta como entrada. El PIN en claro solo existe en memoria durante la petición
que lo genera y en la respuesta que lo muestra una vez.

---

## Frontend

- **`/admin/students`** — listado por clase y curso, estado del PIN visible de un
  vistazo (icono de candado si `locked_until` está vigente, aviso si
  `pin_must_change`), búsqueda por nombre o código.
- **`/admin/students/new`** y **`/admin/students/import`** — alta individual y por
  CSV. La importación muestra una previsualización con los errores por fila
  **antes** de escribir nada.
- **`/admin/students/[id]`** — ficha: datos, clases, historial de exámenes,
  mastery por skill y acciones de PIN.
- **`/admin/sections`** — clases y sus miembros.
- **Hoja de PINs imprimible** — una tarjeta por alumno con colegio, código y PIN,
  pensada para recortar. Es la única vez que un PIN se ve, y la interfaz lo dice
  antes de generarla.

Reglas de UX:

1. **Los PIN se muestran una vez y se avisa antes.** Nada de "vuelve a esta
   pantalla si se te olvida": no se puede.
2. **El desbloqueo es de un clic** desde el listado. Un profesor con 30 niños en
   clase y uno bloqueado no puede navegar cuatro pantallas.
3. Confirmación explícita, con el nombre escrito, antes de borrar a un alumno.
4. Todo texto por i18n; contraste AA; tablas navegables con teclado.

---

## Seguridad

| Amenaza | Defensa |
|---|---|
| Un alumno lee la ficha de otro | `students_select_own` compara contra `auth.uid()`; probado en `rls_student_cannot_read_peers.sql` |
| Un profesor lee alumnos de otro colegio | `students_select_staff` con `school_id = app.current_school_id()`; probado en ambos sentidos |
| Alguien lee `pin_hash` | No está en la lista de columnas concedidas a `authenticated` (0013). Probado con `has_column_privilege` |
| Alguien guarda un PIN en claro | CHECK `students_pin_hash_is_argon2id` |
| Un alumno se desbloquea solo | Sin GRANT de UPDATE para él; y el trigger congela `pin_hash` y solo deja bajar `failed_pin_attempts` |
| Mover un alumno de colegio con un `set` | El trigger lo rechaza |
| Exceso de datos de un menor | La tabla no tiene dónde guardarlos: no hay columnas de teléfono, dirección ni fecha de nacimiento |
| Borrado incompleto (RGPD) | Cascadas verificadas por test: borrar el perfil se lleva telemetría, intentos y mastery |

**Auditoría obligatoria.** Toda lectura *individual* de una ficha por parte de
staff (`/admin/students/[id]`) llama a `app.audit('student.viewed', 'students',
id)`. Es un requisito del tratamiento de datos de menores, no telemetría de
producto.

---

## Pruebas

**pgTAP**
- `constraints.sql`: PIN en claro imposible; código duplicado en el mismo colegio
  imposible; el **mismo** código en otro colegio posible (la unicidad es por
  tenant).
- `rls_student_cannot_read_peers.sql`: s1a no ve la ficha ni el perfil de s2a; no
  puede escribir en ninguna tabla del motor de examen.
- `rls_tenant_isolation.sql`: `students`, `sections` y `section_members` aislados
  en ambos sentidos, con control positivo.
- `immutability.sql`: borrar un perfil de alumno arrastra su telemetría por
  CASCADE — la comprobación de que el derecho de supresión es *ejecutable*.

**Vitest**
- Generador de PIN: distribución uniforme sobre 10^4 / 10^6 y uso de
  `crypto.getRandomValues` (nunca `Math.random`).
- Parser de CSV: filas duplicadas, códigos inválidos, cursos fuera de 1–13.

**Integración**
- `resetPin` deja `pin_must_change = true` y `locked_until = null`, y el alumno
  entra con el PIN nuevo y no con el viejo.
- `bulkImport` con una fila mala no escribe **ninguna** fila.

**e2e**
- Alta de alumno → hoja de PIN → login del alumno → cambio de PIN → home.

---

## Criterios de finalización

- [ ] Tres alumnos de prueba sembrados en Y6A del colegio demo y capaces de entrar.
- [ ] `student_code` único por colegio, y repetible entre colegios (probado).
- [ ] `pin_hash` ilegible para `authenticated` y no escribible desde el cliente.
- [ ] Reset y desbloqueo de PIN funcionando, auditados y a un clic desde el listado.
- [ ] Importación CSV transaccional con previsualización de errores.
- [ ] Hoja de PINs imprimible, con aviso previo de que solo se muestran una vez.
- [ ] Borrado de un alumno verificado en cascada por un test automatizado.
- [ ] Ningún dato personal de un menor más allá de nombre, curso, clase y email del tutor.
- [ ] Toda vista de ficha individual por parte de staff registrada en `audit_log`.
