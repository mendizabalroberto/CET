# Refundación de la tenencia — el tutor como raíz

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Fecha: 28 de agosto de 2026.
> **Descongela `DATA_MODEL.md`.** Su cabecera exige actualizar `MASTER_PLAN.md` y avisar a las
> cinco vías del Hito 1; ese aviso es una tarea de este hito, no papeleo posterior.
> Hito **A** de cinco. B (presencia), C (agregados y objetivos), D (panel visual) y E (generador
> PDF en Python) se apoyan encima y tienen sus propios specs.

---

## 1 · Qué cambia, en una frase

Hoy el colegio es el dueño de todo y el alumno cuelga de él. A partir de aquí **el tutor se
registra primero, crea a su hijo, y engancha al colegio si quiere** — y el colegio ve lo que
ocurre bajo su techo, nunca lo que el niño practica en casa.

## 2 · Por qué no es un ajuste

Medido sobre el árbol, no estimado:

| Acoplamiento | Cuenta |
|---|---|
| Llamadas a `app.current_school_id()` en migraciones | **74**, repartidas en 9 ficheros |
| Políticas RLS en `0012_rls_policies.sql` | **105** |
| Columnas `school_id uuid not null` | **10**, incluida la de la tabla particionada |

Y una constraint que hace **imposible** el estado en el que vive un tutor recién registrado:

```sql
check ((role = 'superadmin') = (school_id is null))   -- profiles_superadmin_has_no_school
```

`0025_superadmin_sin_colegio.sql` ya documenta, con evidencia reproducida contra producción, lo que
pasa cuando alguien no tiene colegio en este esquema: `school_id = NULL` **no es FALSE, es NULL**,
y una política que devuelve NULL no deja pasar. Doce políticas se comportaron así en silencio. Ese
mismo fallo, multiplicado por cada tutor y cada niño sin colegio, es lo que este hito evita —
diseñándolo de entrada en vez de descubrirlo en producción.

## 3 · El modelo nuevo

### 3.1 · Roles

`user_role` gana **`guardian`**. Miembro nuevo en Postgres y en `packages/shared/src/enums.ts`, con
`enum-parity.test.ts` verificando que coinciden miembro a miembro — el test ya existe, y es lo que
convierte esto en un cambio comprobable en vez de en dos sitios que se desincronizan.

La constraint de `profiles` deja de ser binaria y pasa a ser por rol:

| Rol | `school_id` |
|---|---|
| `superadmin` | siempre NULL |
| `school_admin`, `teacher` | **not null** — el personal sí pertenece a un colegio |
| `student`, `guardian` | siempre NULL en `profiles` |

La última fila es la decisión estructural: **la pertenencia del alumno a un colegio deja de ser una
columna y pasa a ser una relación con fechas.** Un niño no «es de» un colegio; está matriculado en
él durante un tramo.

### 3.2 · Tablas nuevas

```
guardian_students          guardian_id → profiles, student_id → profiles,
                           parentesco, es_principal, created_at, revoked_at
                           PK (guardian_id, student_id)

student_school_memberships student_id, school_id, section_id null,
                           starts_on, ends_on null, status
                           (solicitada | activa | rechazada | terminada),
                           requested_by (el tutor), approved_by (el colegio), approved_at
                           EXCLUDE: dos membresías ACTIVAS solapadas del mismo alumno

student_access_links       token_hash, student_id, created_by (el tutor),
                           expires_at, revoked_at, last_used_at
```

`student_access_links` es el enlace que el tutor genera para que entre su hijo. Se guarda
**hasheado**, nunca en claro, y se muestra una sola vez en la respuesta de la acción — exactamente
la regla que `modules/admin` §4 ya fija para `resetStudentPin`.

La exclusión de membresías solapadas va como constraint `EXCLUDE USING gist`, no como comprobación
en la aplicación. Dos matrículas activas a la vez rompen la atribución de cada evento a un colegio,
y ese dato no se puede reparar después.

### 3.3 · `students.school_id` sobrevive, pero como caché

No se borra la columna: se hace **nullable** y se convierte en caché denormalizada de la membresía
activa, mantenida por trigger. `DATA_MODEL.md` la puso ahí «denormalizado a propósito: evita un
join en cada política RLS», y ese motivo sigue siendo bueno. `NULL` significa ahora *«este niño
estudia en casa»*, que es un estado legítimo y no la ausencia de un dato.

### 3.4 · `learning_events.school_id` pasa a nullable — y ahí vive la regla aprobada

Al ingerir, el servidor sella el evento con el colegio **al que pertenece la actividad**:

- actividad sobre contenido activado por el colegio de la membresía vigente → `school_id` = ese colegio;
- todo lo demás (contenido global practicado en casa, o niño sin membresía) → `school_id` = **NULL**.

Con eso, «el colegio ve lo suyo y el tutor lo ve todo» deja de ser una política que hay que
acordarse de escribir bien en once sitios y pasa a ser una propiedad del dato: el personal filtra
por su `school_id` como ya hace hoy, y los eventos de casa sencillamente no están en su conjunto.
El tutor no filtra por colegio en absoluto.

La clave de partición sigue siendo `server_ts`, así que un `school_id` nullable no toca el
particionado ni los índices existentes.

### 3.5 · El ayudante que sustituye al eje

`app.current_school_id()` no desaparece — el personal la sigue necesitando y 74 llamadas dependen
de ella. Lo que se añade es la pregunta que el modelo nuevo obliga a hacer:

```sql
app.puede_ver_alumno(p_student_id uuid) -> boolean
```

Cierta por cuatro caminos, y solo por esos cuatro: es el propio alumno · es su tutor con vínculo
sin revocar · es personal de un colegio con membresía **vigente** de ese alumno · es superadmin.
Con `security definer`, `set search_path = ''` y `stable`: las tres reglas innegociables que
`0004_app_helpers.sql` declara en su cabecera.

`app.puede_ver_informe()` de `0053` se reescribe encima de ella y deja de comparar colegios a mano.

## 4 · Las 105 políticas: clasificar antes de reescribir

**No se reescriben las 105.** La mayoría son de currículo y contenido, van sobre el `school_id` de
tablas que siguen perteneciendo al colegio, y son correctas tal cual. La primera tarea del hito es
clasificarlas en tres montones y dejar la clasificación escrita:

1. **Intactas** — contenido, currículo, exámenes, blueprints.
2. **Reescritas** — todas las que hablan de datos de alumno: `profiles`, `students`,
   `learning_events`, `skill_mastery`, `exam_attempts`, `attempt_*`, `audit_log`.
3. **Nuevas** — las de las tres tablas del §3.2 y las del rol `guardian`.

La clasificación es un entregable revisable, no un paso mental. Sin ella, «reescribir la RLS» es
una tarea sin borde y nadie puede decir cuándo está terminada.

## 5 · Recalibración de la interfaz

Lo que hay que tocar, con nombre y apellidos:

| Fichero / zona | Qué le pasa |
|---|---|
| `apps/web/src/lib/routes.ts` (`PROTECTED_AREAS`) | área nueva `(guardian)` con su rol |
| `(auth)/register/page.tsx` + `components/auth/RegisterForm.tsx` | deja de ser «solicito plaza en un colegio» y pasa a ser **alta de tutor** (correo + contraseña) |
| `(auth)/login/student` + `StudentLoginForm.tsx` | hoy son tres pasos *colegio → código → PIN*. Se añade la puerta del enlace: el token identifica al niño y **solo queda el PIN**. La puerta de colegio se conserva para las matrículas que abre el colegio |
| `app/(guardian)/` **nuevo** | mis hijos · generar y revocar enlace · presencia (hito B) · informes y boletín (C/E) · solicitar enganche a un colegio |
| `(staff)/admin/page.tsx` | selector de colegio intacto; se le añade la **cola de solicitudes de enganche**, que sustituye conceptualmente a `registration_requests` |
| `components/staff/queries.ts` | el filtro explícito por `school_id` —regla 2 de su cabecera— sigue, pero con el eje del §3.5 |
| `components/nav`, `StaffChrome` | navegación del rol nuevo |
| `lib/i18n/dictionaries` | es y en para todo lo anterior. AD-7: cero strings a pelo |
| `packages/shared/src/enums.ts` | miembro `guardian` + su test de paridad |

**El tono de la zona del tutor no es el del panel de staff.** `modules/admin` §5.1 fija densidad y
detalle técnico para adultos profesionales; un padre mirando si su hijo está en línea no es eso. La
zona `(guardian)` es de lectura, pocas cifras, y ninguna referencia técnica en los errores.

## 6 · Migración de lo que ya existe

Hoy en producción hay **un** superadmin sin colegio, un colegio demo y los alumnos de Y6A, todos
dados de alta por el colegio. La migración de datos es pequeña, y por eso conviene hacerla ahora:

1. Por cada alumno con `students.school_id`, crear una `student_school_memberships` **activa** con
   `starts_on = enrolled_at` y `approved_by` = quien aprobó su registro.
2. `students.school_id` conserva el mismo valor: pasa a ser caché de esa membresía.
3. **No** se inventan tutores. Un alumno matriculado por el colegio no tiene tutor en el sistema
   hasta que uno se registre y reclame el vínculo; ese reclamo lo aprueba el colegio.
4. Los `learning_events` existentes conservan su `school_id`: se generaron bajo el techo del
   colegio y esa atribución es correcta.

## 7 · Seguridad y datos de menores

1. **La identidad la sigue poniendo el servidor.** El enlace del tutor identifica al niño; el PIN lo
   autentica. Un token no es una sesión: se canjea, no se acepta.
2. **El enlace caduca y es revocable** desde la zona del tutor, y cada canje se registra.
3. **Un tutor no puede reclamar a un niño ajeno.** El vínculo lo crea el tutor al dar de alta a su
   hijo; reclamar uno preexistente exige aprobación del colegio en el que está matriculado.
4. **Enganchar a un colegio es un consentimiento explícito y revocable**, y su texto dice qué verá
   el colegio y qué no — el §3.4 en lenguaje de padre.
5. **Toda lectura de personal sobre datos identificables de un menor sigue yendo a `audit_log`**
   (`modules/analytics` §6.5). Añadir un rol no relaja esa regla; la extiende.
6. `app.audit()` escribe `school_id = app.current_school_id()`, que para un superadmin es NULL —
   hallazgo ya abierto en `HANDOFF.md` §6 y señalado en `0025`. Con tutores sin colegio deja de
   afectar a un solo usuario, y **entra en el alcance de este hito**.

## 8 · Verificación

Nada se da por hecho sin ejecutar; el criterio es el código de salida.

**pgTAP**
- Un tutor ve a sus hijos y **a ninguno más**, ni por lectura ni por escritura.
- Un colegio con membresía vigente ve los eventos sellados con su `school_id` y **no ve los de
  `school_id` NULL** del mismo niño. Es el test que demuestra la decisión del §3.4.
- Terminada la membresía, el colegio deja de ver lo nuevo y conserva lo de su tramo.
- Dos membresías activas solapadas son imposibles (la constraint, no la aplicación).
- Un alumno sin colegio existe, entra y emite eventos — el estado que hoy la constraint prohíbe.
- Los tres casos de escalada de `modules/admin` §6 siguen fallando en la base de datos.
- Ninguna política queda con la forma `school_id = app.current_school_id()` sobre una tabla de
  datos de alumno: es el patrón que `0025` documenta como fuente de NULL silencioso.

**Vitest** — paridad del enum; validación Zod del alta de tutor y del canje de enlace; el token se
guarda hasheado y no aparece en claro en ningún registro.

**Playwright** — el camino completo: el tutor se registra, crea a su hijo, genera el enlace, el niño
entra con enlace + PIN, practica, el tutor ve la actividad; el colegio, sin membresía, **no ve
nada**. Después el tutor engancha, el colegio aprueba, y a partir de ese momento —y solo a partir de
ese momento— el colegio ve la actividad de su contenido.

**axe** — cero violaciones en las pantallas nuevas, en claro y en oscuro.

## 9 · Reparto con DeepSeek

`HANDOFF-DEEPSEEK.md` §0.2: un contrato que toca componentes visibles está mal repartido. Este hito
se parte limpio por esa línea.

| Delegable | Por qué |
|---|---|
| Clasificación de las 105 políticas (§4) | Lectura y razonamiento sobre SQL, sin pantallas. `reasoner` |
| Tablas del §3.2 con sus constraints y su RLS | Mecánico y verificable por pgTAP |
| `app.puede_ver_alumno()` y la reescritura de `puede_ver_informe` | Territorio `supabase/`, criterio ejecutable |
| Sellado de `school_id` en la ingesta (§3.4) | Un fichero, `0024` como contexto, test de comportamiento |
| Migración de datos del §6 | Datos, sin criterio visual |

| **No** delegable | Por qué |
|---|---|
| Las cinco zonas de interfaz del §5 | Visual. Nadie que no vea puede firmar `modules/admin` §5.5 |
| El texto del consentimiento del §7.4 | Decide qué entiende un padre que está cediendo acceso |

## 10 · Criterios de finalización

- [ ] `user_role` incluye `guardian` en Postgres y en TypeScript, con paridad verificada.
- [ ] Un alumno sin colegio existe, entra por enlace + PIN y emite telemetría.
- [ ] Las tres tablas del §3.2 con RLS y pgTAP, incluida la exclusión de membresías solapadas.
- [ ] Clasificación de las 105 políticas escrita, y las del montón 2 reescritas.
- [ ] El colegio no ve un solo evento de `school_id` NULL de un alumno suyo, demostrado por pgTAP.
- [ ] Migración del §6 aplicada sin pérdida: los alumnos de Y6A conservan colegio e histórico.
- [ ] Las cinco zonas de interfaz del §5 en es y en, sin strings a pelo, axe limpio en ambos temas.
- [ ] `app.audit()` escribe un `school_id` utilizable también para actores sin colegio.
- [ ] `DATA_MODEL.md` y `MASTER_PLAN.md` actualizados, con el aviso a las cinco vías.
- [ ] `pnpm verify` en verde.
