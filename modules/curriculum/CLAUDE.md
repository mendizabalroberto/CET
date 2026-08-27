# M05 · `curriculum`

> Materias, cursos, niveles, módulos, lecciones y **taxonomía de skills**.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Depende de: **M01 security**. Depende de él: M06 content, M07 questions.

---

## 1. Objetivo

Dar al sistema el esqueleto sobre el que cuelga todo lo demás: qué se enseña, en qué orden, y —
lo importante — **qué habilidad concreta entrena cada cosa**.

La taxonomía de skills es el eje del Hito 5 (adaptativo). Sin ella, "el alumno falla mucho" es
todo lo que el sistema puede decir. Con ella, dice "falla el 70 % de
`math.fractions.operations` cuando el operador es `÷`, y acierta el resto" — que es lo único
accionable.

Los seis trainers Y6A ya traen una taxonomía implícita: la clave con la que filtran su banco
(`c:"ps"`, `t:'acid'`, `Q.amz`). Este módulo la hace explícita, jerárquica y estable.

---

## 2. Arquitectura

```
Y6A/*.html ──► @cet/content ──► packs/*.json ──► supabase/seed ──► subjects
   (fuente)      (extractor)      (contrato)       (sembrador)      courses
                                                                    course_modules
                                                                    lessons
                                                                    skills
                                                                    lesson_skills
```

**AD-2 en la práctica.** Toda tabla de este módulo lleva `school_id` **nullable**: `NULL` =
biblioteca global, un valor = contenido propio del colegio. La RLS lee lo global **OR** lo tuyo.
Es una columna nullable hoy y una migración de datos masiva si se pospone.

**Visibilidad ≠ activación.** Un curso global lo *ve* todo el mundo, pero solo *aparece* a un
alumno si su colegio lo activó en `school_courses`. Separarlo evita que un colegio nuevo abra
la aplicación y vea doscientos cursos irrelevantes.

### Códigos de skill

`materia.familia[.detalle]`, minúsculas, `_` como separador interno:

```
math.fractions                  familia
math.fractions.simplify         hoja  ← aquí se mide mastery
science.environment.acid_rain
english.grammar.present_simple
spanish.ortografia.tilde_diacritica
socials.rivers.amazon
ict.systems.hardware_software
```

El código es la clave estable frente a la base de datos (`unique (course_id, code)`).
**Renombrar un código es una migración, no una edición**: `skill_mastery` referencia el id, y
`learning_events` lleva años de historia colgando de él.

La lista canónica vive en `packages/content/src/skills.ts`, con el campo `y6aKey` como puente
al material original — es lo que permite responder "esta pregunta salió de la categoría `ps` del
trainer de English".

---

## 3. Tablas

Definidas en `DATA_MODEL.md` §2. Resumen operativo:

| Tabla | Clave | Notas |
|---|---|---|
| `subjects` | `code` (`math`, `science`, `english`, `spanish`, `socials`, `ict`) | `name` I18nText, `icon`, `color`, `ord` |
| `courses` | `(subject_id, year_level, locale)` | `status` draft/published/archived, `version` |
| `school_courses` | PK `(school_id, course_id)` | activación por colegio |
| `course_modules` | `unique (course_id, ord)` | `on delete cascade` desde `courses` |
| `lessons` | `unique (module_id, ord)` | `school_id` denormalizado para RLS sin joins |
| `skills` | `unique (course_id, code)` | `parent_skill_id` self-FK |
| `lesson_skills` | PK `(lesson_id, skill_id)` | `weight` — hoy uniforme, ver R-7 de `packages/content/REVIEW.md` |

Todo `foreign key` declara su `on delete` explícitamente. Nunca el default.

---

## 4. APIs

**Lectura (alumno y profesor)** — Server Components consultando directamente con RLS activa.
No hay endpoint: la política de la fila ya es la autorización.

```
listActiveCourses(schoolId)        cursos activados para el colegio
getCourseOutline(courseId)         módulos -> lecciones -> skillCodes
getSkillTree(courseId)             jerarquía completa para el panel de mastery
```

**Escritura (staff)** — Server Actions con validación Zod en los dos extremos.

```
createCourse / updateCourse / publishCourse
reorderModules(courseId, ordering[])       transaccional
importContentPack(pack)                    consume packs/*.json de @cet/content
```

`importContentPack` es idempotente por diseño: los ids del pack son deterministas, así que
reimportar es un `upsert`, no un duplicado.

---

## 5. Frontend

- `/[school]/courses` — cursos activos del alumno.
- `/[school]/courses/[courseId]` — temario: módulos y lecciones, con progreso por skill.
- `/admin/curriculum` — CRUD de staff: cursos, módulos, orden, taxonomía.

Server Components por defecto. Solo el reordenamiento drag-and-drop es isla cliente.
Todo texto sale de `I18nText` resuelto con `resolveI18n(text, locale)` — cero strings
hardcodeados (AD-7).

---

## 6. Seguridad

RLS en **todas** las tablas, sin excepción.

```sql
-- Contenido híbrido (AD-2): lo global O lo mío
create policy read_global_or_own on courses for select
  using (app.can_read_content(school_id));

-- Escribir: solo lo propio, y solo staff
create policy write_own_only on courses for all
  using  (school_id = app.current_school_id() and app.is_staff())
  with check (school_id = app.current_school_id() and app.is_staff());
```

Puntos que un revisor debe comprobar:

- Ningún `security definer` sin `set search_path = ''` (§9 de `DATA_MODEL`). Sin eso, una tabla
  `public` maliciosa secuestra la función: es el fallo clásico de Supabase.
- Un alumno del colegio A no puede leer `lessons` del colegio B forzando un id ajeno. Lo prueba
  pgTAP, no la inspección visual.
- `school_courses` no puede activar un curso de otro colegio: `check` sobre el `school_id` del
  curso cuando no es `NULL`.

---

## 7. Pruebas

| Nivel | Qué verifica |
|---|---|
| pgTAP | RLS por rol y por colegio; `unique (course_id, code)`; cascadas de borrado; que un skill no pueda ser su propio ancestro |
| Vitest | `importContentPack` es idempotente: importar dos veces no duplica ni una fila |
| Vitest | Los códigos de skill validan contra la expresión canónica y todo padre referenciado existe |
| Playwright | Un alumno ve el temario de su curso y no ve los cursos no activados |

---

## 8. Criterios de finalización

- [ ] Las siete tablas creadas, con RLS activa y política escrita para cada operación
- [ ] pgTAP en verde: ningún rol lee currículo de otro colegio
- [ ] `math.y6` sembrado desde `packages/content/packs/math.json`
- [ ] Los 15 skills de Math presentes, con la jerarquía correcta
- [ ] Reimportar el mismo pack no crea ni una fila nueva (test automatizado)
- [ ] `lesson_skills` poblada: ninguna lección sin skill
- [ ] El temario se ve en `/[school]/courses/[courseId]` en es y en en
- [ ] `pnpm verify` en verde
