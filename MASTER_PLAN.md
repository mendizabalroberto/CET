# MASTER PLAN — Cambridge Exam Trainer (CET)

> Plataforma multi-colegio de aprendizaje y evaluación para primaria y secundaria.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.

**Estado:** Fase 0 — arquitectura aprobada, implementación en curso
**Última actualización:** 2026-08-26

---

## 1. Visión

Los seis "Exam Trainers" de Y6A demuestran que la pedagogía funciona: lecciones estructuradas,
práctica con feedback inmediato, mini-juegos, simulacros cronometrados y planes de estudio.
Lo que no existe es **nada debajo**: cero persistencia (`grep localStorage` → 0 ocurrencias en
los 6 ficheros), cero identidad, cero analítica, cero auditoría.

CET no reconstruye la pedagogía. **Construye la plataforma bajo ella**: identidad multi-colegio,
contenido versionado en Supabase, un motor de examen auditable y una capa de telemetría diseñada
para aprendizaje adaptativo.

### Principio rector

> Para cualquier examen terminado, el sistema debe poder reconstruir **exactamente** qué vio el
> estudiante, en qué orden, qué versión de cada pregunta, qué respondió, cuándo, cuántas veces
> cambió de opinión y cómo se calificó — sin depender de la honestidad del cliente.

Este principio no es un requisito más. Es la restricción que dicta el modelo de datos.

---

## 2. Decisiones de arquitectura (cerradas)

| # | Decisión | Elección | Por qué no se puede retrofitear |
|---|---|---|---|
| AD-1 | Tenancy | Multi-colegio. `school_id` en toda tabla de negocio y en toda política RLS desde la migración 001 | Añadir tenant después obliga a reescribir cada política, cada índice y cada query de analytics |
| AD-2 | Propiedad del contenido | Híbrido. `school_id NULL` = biblioteca global (autorada por superadmin); `school_id` con valor = contenido propio del colegio. RLS: ves lo global **OR** lo tuyo | Una columna nullable ahora; una migración de datos masiva después |
| AD-3 | Identidad | Identidad sintética sobre Supabase Auth. Alumno: colegio + código + PIN, **o aparato recordado + PIN**, → Edge Function valida → sesión Supabase real. Staff: email+password (MFA para admins). **Nadie entra sin invitación**: el tutor por enlace, el alumno por enlace de su tutor | `auth.uid()` es el eje de todas las RLS. La cookie de aparato NO abre sesión: solo ahorra dos pasos del formulario |
| AD-4 | PIN | 4 dígitos primaria / 6 secundaria, configurable por colegio. Por el camino del colegio, el profesor genera y el alumno cambia en el primer login. **Por el camino del enlace el alumno LO FIJA**, sin teclear ninguno anterior: el enlace de un solo uso ya es la prueba de identidad, y así no hay un PIN inicial viajando por WhatsApp. Argon2id, rate limit, lockout — y el lockout cuenta por ALUMNO, nunca por puerta | — |
| AD-5 | Motor de examen | **Híbrido por modo.** Práctica y juegos → cliente (feedback <50 ms, tolerante a red). Exámenes → servidor autoritativo (materialización, clave nunca sale de la DB, corrección server-side) | Un motor cliente no produce exámenes auditables |
| AD-6 | Código compartido | `@cet/engine`: generadores y correctores escritos **una vez**, ejecutables en cliente y servidor | Evita que las dos rutas de ejecución diverjan |
| AD-7 | i18n | es/en desde el día uno, sin strings hardcodeados | Retrofitear i18n toca cada componente |
| AD-8 | Despliegue | Vercel + Supabase cloud. Preview deployment por PR, rama Supabase para staging | — |

---

## 3. Stack

| Capa | Tecnología | Nota |
|---|---|---|
| Lenguaje | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess` | Sin `any` implícito en código de producción |
| Frontend | Next.js 15 (App Router), React 19, Server Components por defecto | `"use client"` solo donde hay interacción real |
| Estilos | Tailwind CSS v4 + design tokens propios en `@cet/ui` | Tema claro/oscuro, WCAG 2.1 AA |
| Estado servidor | TanStack Query (solo en islas cliente) | Server Components cubren la mayoría |
| Validación | Zod en **ambos** extremos de cada frontera (form → action → DB) | Un esquema, inferencia de tipos gratis |
| Backend | Supabase: Postgres 17, Auth, Storage, Realtime, Edge Functions (Deno) | Proyecto `clcutoqjdgeggvgyreud` |
| Seguridad DB | RLS en **todas** las tablas, sin excepción. `security definer` solo con `search_path` fijado | |
| Tests | Vitest (unit), pgTAP (RLS y constraints), Playwright (e2e) | El motor se testea puro y rápido |
| Monorepo | pnpm workspaces + Turborepo | |
| CI/CD | GitHub Actions: typecheck → lint → unit → pgTAP → build → e2e → deploy | Ningún merge sin verde |

---

## 4. Estructura de carpetas

```
cambridge-exam-trainer/
├── MASTER_PLAN.md              ← este documento
├── DATA_MODEL.md               ← esquema completo y razonado
├── MODULES.md                  ← mapa de módulos y dependencias
├── apps/
│   └── web/                    ← Next.js 15 (landing, alumno, profesor, admin)
├── packages/
│   ├── engine/                 ← @cet/engine — generadores, correctores, blueprint, grading
│   ├── ui/                     ← @cet/ui — design system, tokens, componentes
│   ├── content/                ← @cet/content — pipeline Y6A HTML → content packs JSON
│   └── shared/                 ← @cet/shared — tipos DB, esquemas Zod, constantes, i18n
├── supabase/
│   ├── migrations/             ← SQL versionado, orden estricto
│   ├── seed/                   ← superadmin, colegio demo, curso Math Y6
│   ├── functions/              ← Edge Functions (auth-pin, attempt-start, attempt-submit)
│   └── tests/                  ← pgTAP: RLS, constraints, triggers
├── modules/                    ← 13 × CLAUDE.md (contrato de cada módulo)
├── docs/superpowers/specs/     ← specs de diseño por módulo
├── scripts/
├── .github/workflows/
└── Y6A/                        ← material fuente original (read-only, no se modifica)
```

Regla: **un módulo = una carpeta en `modules/` con su `CLAUDE.md`**, que documenta objetivo,
arquitectura, tablas, APIs, frontend, seguridad, pruebas y criterios de finalización. El código
del módulo vive donde le corresponde por capa (`supabase/`, `packages/`, `apps/web/`), no dentro
de `modules/` — `modules/` es el contrato, no el código.

---

## 5. Los 13 módulos

| # | Módulo | Objetivo | Depende de |
|---|---|---|---|
| M01 | `security` | RLS transversal, audit log, rate limiting, hashing, helpers `current_school_id()` / `current_role()` | — |
| M02 | `auth` | Login PIN alumno, email+password staff, sesiones, recuperación, lockout | M01 |
| M03 | `users` | Perfiles, roles, invitaciones, aprobación de registro | M01, M02 |
| M04 | `students` | Fichas de alumno, códigos, secciones, gestión de PIN, tutores | M03 |
| M05 | `curriculum` | Materias, cursos, niveles, módulos, lecciones, taxonomía de skills | M01 |
| M06 | `content` | Bloques de lección, media en Storage, gráficos interactivos | M05 |
| M07 | `questions` | Banco, versionado inmutable, plantillas estáticas y generadas, autoría | M05 |
| M08 | `exams` | Blueprints, secciones, asignación a clases, ventanas temporales | M07 |
| M09 | `exam-engine` | Ciclo de vida del intento: materialización, autosave, recuperación, entrega | M08, M01 |
| M10 | `grading` | Automática, parcial, manual; rúbricas; recalificación | M09 |
| M11 | `analytics` | Eventos de aprendizaje, mastery, dashboards, reportes | M09, M10 |
| M12 | `admin` | Panel completo: colegios, usuarios, contenido, exámenes, auditoría | M03–M11 |
| M13 | `deployment` | Entornos, CI/CD, migraciones, observabilidad, backups | todos |

Grafo de dependencias:

```
M01 security
 ├── M02 auth ── M03 users ── M04 students
 ├── M05 curriculum ── M06 content
 │                  └── M07 questions ── M08 exams ── M09 exam-engine ── M10 grading ── M11 analytics
 └───────────────────────────────────────────────────────────────────────────────────── M12 admin
                                                                                         M13 deployment
```

---

## 6. Orden de ejecución

### Hito 1 — Cimientos (paralelizable ×5)
Objetivo: base de datos viva, motor testeado, contenido extraído, design system y app arrancando.

| Vía | Alcance | Carpeta propia |
|---|---|---|
| A | Esquema completo + RLS + pgTAP + seed | `supabase/` |
| B | `@cet/engine`: generadores Math, correctores, blueprint, grading | `packages/engine/` |
| C | `@cet/content`: extracción de los 6 trainers Y6A → JSON | `packages/content/` |
| D | `@cet/ui`: tokens, componentes, tema, accesibilidad | `packages/ui/` |
| E | `apps/web`: scaffold Next.js, landing, flujo de login | `apps/web/` |

Las cinco vías tienen **carpetas disjuntas**. Los contratos entre ellas están congelados en
`DATA_MODEL.md` y `packages/shared/`, escritos antes de arrancar.

### Hito 2 — Vertical Math Y6 end-to-end
Alumno entra con PIN → ve lecciones de Math → practica con generadores → hace un examen
cronometrado → recibe nota → el profesor ve el intento reconstruido pregunta a pregunta.

### Hito 3 — Panel de administración
Gestión de colegios, aprobación de registros, autoría de contenido, auditoría.

### Hito 4 — Las otras 5 materias
Science, English, Español, Socials, ICT vía el pipeline de contenido ya validado.

### Hito 5 — Adaptativo y analítica
Mastery por skill, detección de debilidades, recomendaciones.

---

## 7. Protocolo de calidad — 3 pasadas por módulo

Ningún módulo se acepta por compilar.

**Pasada 1 — Implementación.** TDD donde aplique. Tests que fallan primero.

**Pasada 2 — Revisión crítica.** Adversarial, sin piedad, contra esta lista:
- **Seguridad:** ¿toda tabla tiene RLS? ¿se puede leer datos de otro colegio forzando un id ajeno? ¿alguna `security definer` sin `search_path`? ¿la clave de respuesta llega al cliente?
- **Base de datos:** ¿índices para las queries reales? ¿FK con `on delete` explícito? ¿constraints que hagan imposible el estado inválido?
- **Lógica:** casos límite — 0 preguntas, examen expirado, doble submit, red caída a mitad, reloj del cliente adelantado, alumno en dos pestañas.
- **UX:** ¿funciona con teclado? ¿lector de pantalla? ¿contraste AA? ¿en móvil? ¿qué ve un niño de 11 años cuando algo falla?
- **Rendimiento:** ¿N+1? ¿query sin índice sobre `learning_events`?
- **Tests:** ¿cubren el fallo, no solo el camino feliz?

**Pasada 3 — Mejora.** Se corrige lo encontrado y se re-verifica ejecutando los comandos, no
asumiendo. Evidencia antes que afirmaciones.

Al terminar los 13 módulos: **3 pasadas globales** (auditoría de seguridad completa, corrección,
validación end-to-end con datos reales).

---

## 8. Criterios de finalización del prototipo (Hito 1+2)

- [ ] Migraciones aplicadas al proyecto Supabase, RLS activa en el 100% de las tablas
- [ ] pgTAP verde: ningún rol puede leer datos de otro colegio
- [ ] Superadmin **Roberto Mendizabal** creado y funcional
- [ ] Colegio demo + curso Math Y6 + alumno de prueba sembrados
- [ ] Landing page publicada con aviso de copyright
- [ ] Login con PIN funcionando end-to-end
- [ ] Un examen completo: arrancar → responder → autosave → entregar → calificar
- [ ] Intento reconstruible al 100% desde la DB (test automatizado que lo demuestra)
- [ ] `pnpm verify` (typecheck + lint + test + build) en verde
- [ ] CI configurado y pasando

---

## 9. Legal

Producto propiedad de **Roberto Mendizabal**. © 2026. Todos los derechos reservados.
Software propietario — ver `LICENSE`. El material pedagógico de `Y6A/` es material fuente
del colegio y se trata como read-only.

Tratamiento de datos de menores: minimización (no se pide más dato del necesario), cifrado en
tránsito y reposo, audit log de todo acceso de staff a datos de alumno, y borrado en cascada
verificado. Ver `modules/security/CLAUDE.md`.

La minimización sigue siendo la regla del producto. Tiene **una excepción, y está nombrada**:

### Excepción — el registro de accesos de alumno

Decisión del propietario del producto, **2026-09-01**, tomada con las alternativas encima de la
mesa (guardar solo el hash más una zona geográfica gruesa; o guardar la IP en claro y purgarla a
los 30 días). Se eligió la tercera: **guardar la IP en claro, sin caducidad**. No es un descuido
ni un resto de depuración; es una decisión, y esto es lo que abarca.

**Qué se guarda.** En la tabla `accesos_de_alumno` (ver `DATA_MODEL.md` §8), por cada canje de
enlace, login correcto, login fallido y olvido de dispositivo de un alumno: la **IP en claro**
(`inet`), su hash, el **user-agent completo**, el país/región/ciudad derivados, el aparato y el
tipo de acceso. En `student_access_links` se guarda además la IP desde la que el tutor generó el
enlace. Sin caducidad: **retención indefinida**, no hay job de purga.

**Para qué.** Los cuatro usos que motivaron la decisión, todos posteriores al hecho:

1. **Forense a posteriori** — reconstruir desde dónde se apropiaron de una cuenta. El enlace de
   alta es un *bearer token* que viaja por WhatsApp: sin la IP, un robo no deja rastro.
2. **Detección en vivo** — las cuatro señales de `accesos_de_alumno.senales`, que comparan redes
   y países entre accesos. Comparar exige tener qué comparar.
3. **Panel del tutor** — «Chrome en Android · Madrid · hace 2 días», para reconocer y revocar un
   aparato. El tutor ve la ciudad y el aparato; **no** ve la IP.
4. **Responder formalmente a un colegio** — cuando un centro pregunta por escrito qué pasó con
   la cuenta de un alumno, la respuesta la firma una persona con datos, no con conjeturas.

**Quién puede leerlo.** `ip`, `ip_hash` y `user_agent` están **fuera del GRANT de
`authenticated`**: no los alcanza ninguna sesión de navegador — ni el tutor, ni el propio alumno,
ni el staff del colegio. Solo `service_role`, es decir el código de servidor y una consulta
directa hecha por una persona. Este es el patrón que ya protege `attempt_items.answer_key` y
`students.pin_hash`, y es **la compensación que hace sostenible la decisión**: el dato existe,
pero no aparece jamás en una respuesta HTTP, así que un XSS en el panel del tutor no lo exfiltra.
Si esos grants se aflojan, la excepción deja de ser defendible y hay que revisarla entera.

**Durante cuánto tiempo.** Indefinido. Se asume por escrito lo que eso significa: es un historial
de ubicación permanente de un menor, y convierte a `accesos_de_alumno` en la tabla más sensible
del sistema. Se borra con el alumno, por el `on delete cascade` de siempre.

Diseño completo y razonado: `docs/superpowers/specs/2026-09-01-registro-de-accesos-de-alumno-design.md`.
