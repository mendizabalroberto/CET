/**
 * Sembrado: packs -> base de datos, y corpus -> base de datos.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Hasta hoy no existía. `supabase/seed/0003_math_y6.sql` siembra materia, curso,
 * módulos, lecciones y skills de Math — y ni una sola pregunta. Las 453
 * preguntas extraídas vivían solo como JSON en disco. Sin esta pieza, ampliar la
 * cobertura de Y6A no habría servido de nada: el contenido nuevo se habría
 * quedado donde ya estaba el viejo.
 *
 * Todo lo de aquí es IDEMPOTENTE por id: los packs traen UUID deterministas
 * (`ids.ts`), así que sembrar dos veces no duplica nada. Se apoya en la clave
 * primaria, no en adivinar si algo "parece" lo mismo.
 *
 * Todo va dentro de UNA transacción por pack: o entra el curso entero o no
 * entra nada. Un curso a medias es peor que un curso ausente, porque parece que
 * está.
 */

import type pg from "pg";

import type { ContentPack } from "../../packages/content/src/schema.ts";

/* -------------------------------------------------------------------------- */
/* Contador de lo que se hizo, para poder contarlo sin creerse nada            */
/* -------------------------------------------------------------------------- */

export interface SeedCounts {
  subjects: number;
  courses: number;
  skills: number;
  modules: number;
  lessons: number;
  blocks: number;
  lessonSkills: number;
  questions: number;
  versions: number;
  blueprints: number;
}

export function emptyCounts(): SeedCounts {
  return {
    subjects: 0,
    courses: 0,
    skills: 0,
    modules: 0,
    lessons: 0,
    blocks: 0,
    lessonSkills: 0,
    questions: 0,
    versions: 0,
    blueprints: 0,
  };
}

/** Lo que el pack trae y la base de datos no sabe guardar. Se cuenta, no se tira. */
export interface SeedGap {
  what: string;
  why: string;
}

export interface SeedResult {
  counts: SeedCounts;
  gaps: SeedGap[];
}

/* -------------------------------------------------------------------------- */
/* Materia: clave natural `code` con school_id NULL (biblioteca global, AD-2)  */
/* -------------------------------------------------------------------------- */

async function upsertSubject(client: pg.Client, subject: ContentPack["subject"]): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into public.subjects (school_id, code, name, icon, color, ord)
     values (null, $1, $2::jsonb, $3, $4, $5)
     on conflict (code) where school_id is null
     do update set name = excluded.name,
                   icon = excluded.icon,
                   color = excluded.color,
                   ord = excluded.ord
     returning id`,
    [
      subject.code,
      JSON.stringify(subject.name),
      subject.icon,
      subject.color,
      subject.ord,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`no se pudo insertar la materia \`${String(subject.code)}\``);
  return id;
}

/* -------------------------------------------------------------------------- */
/* I18nText -> texto: la proyeccion que la base de datos exige                */
/* -------------------------------------------------------------------------- */

/**
 * `question_versions.body` es un `RenderedBody` de @cet/shared: el enunciado YA
 * localizado, string plano. El pack lo guarda como `I18nText` porque un pack no
 * tiene por que elegir idioma. Alguien tiene que proyectar, y ese alguien es
 * este sembrador.
 *
 * Se proyecta al `locale` que declara la propia pregunta. Si ese idioma no esta,
 * se lanza en vez de coger "el que haya": una pregunta servida en un idioma que
 * nadie pidio es peor que una pregunta ausente, porque el alumno la ve y no la
 * entiende.
 */
function texto(v: Record<string, string | undefined>, locale: string, donde: string): string {
  const t = v[locale];
  if (t === undefined || t.trim() === "") {
    throw new Error(`${donde}: falta el texto en \`${locale}\` (hay: ${Object.keys(v).join(", ") || "nada"})`);
  }
  return t;
}

/** Cuenta los idiomas que se PIERDEN al proyectar. La base guarda uno por version. */
function idiomasPerdidos(v: Record<string, string | undefined>, locale: string): string[] {
  return Object.keys(v).filter((k) => k !== locale);
}

/* -------------------------------------------------------------------------- */
/* El pack entero                                                             */
/* -------------------------------------------------------------------------- */

/** Proyecta el cuerpo del pack al `RenderedBody` que guarda la base de datos. */
function renderBody(q: ContentPack["questions"][number]): Record<string, unknown> {
  if (q.kind === "generated") {
    // Una pregunta generada no tiene enunciado: tiene un contrato con el motor.
    // El disparador de la base espera `engine_key` en snake_case.
    return { engine_key: q.body.engineKey, param_spec: q.body.paramSpec };
  }
  return {
    stem: texto(q.body.stem, q.locale, `pregunta ${q.id}`),
    options: q.body.options.map((o) => ({
      id: o.id,
      html: texto(o.html, q.locale, `pregunta ${q.id} opcion ${o.id}`),
    })),
  };
}

export async function seedPack(client: pg.Client, pack: ContentPack): Promise<SeedResult> {
  const counts = emptyCounts();
  const gaps: SeedGap[] = [];

  await client.query("begin");
  try {
    const subjectId = await upsertSubject(client, pack.subject);
    counts.subjects = 1;

    // --- curso -------------------------------------------------------------
    const c = pack.course;

    // GUARDA: si la materia ya tiene un curso con OTRO id, no se siembra.
    //
    // Math llego aqui por `supabase/seed/0003_math_y6.sql`, que crea su curso
    // con un uuid aleatorio, no con el determinista del pack. Sembrar el pack
    // encima no actualizaria aquel: crearia un SEGUNDO curso de Math y dejaria
    // al primero —con sus 23 skills, sus blueprints, sus asignaciones y un
    // intento de examen ya realizado— colgando de nadie.
    //
    // Un sembrador que duplica en silencio es peor que uno que se planta.
    const { rows: previos } = await client.query<{ id: string }>(
      `select co.id from public.courses co
        where co.subject_id = $1 and co.school_id is null and co.id <> $2`,
      [subjectId, c.id],
    );
    if (previos.length > 0) {
      await client.query("rollback");
      throw new Error(
        `la materia \`${pack.subject.code}\` ya tiene el curso ${previos[0]!.id} con otro id que el del pack (${c.id}).
` +
          "  Sembrar crearia un curso duplicado. Reconcilia a mano cual manda antes de continuar.",
      );
    }
    await client.query(
      `insert into public.courses (id, school_id, subject_id, name, year_level, locale, status, version)
       values ($1, null, $2, $3::jsonb, $4, $5, $6, $7)
       on conflict (id) do update set name = excluded.name,
                                      year_level = excluded.year_level,
                                      locale = excluded.locale,
                                      status = excluded.status,
                                      version = excluded.version`,
      [c.id, subjectId, JSON.stringify(c.name), c.yearLevel, c.locale, c.status, c.version],
    );
    counts.courses = 1;

    // --- skills ------------------------------------------------------------
    // Dos pasadas: primero todas sin padre, después se enlazan los padres. Un
    // pack puede listar la hija antes que la madre y una FK no espera.
    for (const s of pack.skills) {
      await client.query(
        `insert into public.skills (id, school_id, course_id, code, name, description, ord)
         values ($1, null, $2, $3, $4::jsonb, $5::jsonb, $6)
         on conflict (id) do update set name = excluded.name,
                                        description = excluded.description,
                                        ord = excluded.ord`,
        [
          s.id,
          c.id,
          s.code,
          JSON.stringify(s.name),
          s.description ? JSON.stringify(s.description) : null,
          s.ord,
        ],
      );
      counts.skills += 1;
    }
    for (const s of pack.skills) {
      if (!s.parentCode) continue;
      await client.query(
        `update public.skills
            set parent_skill_id = (select id from public.skills
                                    where code = $2 and course_id = $3)
          where id = $1`,
        [s.id, s.parentCode, c.id],
      );
    }

    const skillIdByCode = new Map<string, string>(
      pack.skills.map((s) => [s.code, s.id]),
    );

    // --- módulos, lecciones, bloques ---------------------------------------
    for (const m of pack.modules) {
      await client.query(
        `insert into public.course_modules (id, course_id, ord, title, description)
         values ($1, $2, $3, $4::jsonb, $5::jsonb)
         on conflict (id) do update set ord = excluded.ord,
                                        title = excluded.title,
                                        description = excluded.description`,
        [
          m.id,
          c.id,
          m.ord + 1,
          JSON.stringify(m.title),
          m.description ? JSON.stringify(m.description) : null,
        ],
      );
      counts.modules += 1;

      if (m.overview.length > 0) {
        gaps.push({
          what: `module ${String(m.id).slice(0, 8)}.overview`,
          why: `course_modules no tiene columna para el resumen del módulo: se pierden ${m.overview.length} bloques al sembrar`,
        });
      }

      for (const l of m.lessons) {
        await client.query(
          `insert into public.lessons (id, module_id, ord, title, estimated_minutes, status)
           values ($1, $2, $3, $4::jsonb, $5, $6)
           on conflict (id) do update set ord = excluded.ord,
                                          title = excluded.title,
                                          estimated_minutes = excluded.estimated_minutes,
                                          status = excluded.status`,
          [l.id, m.id, l.ord + 1, JSON.stringify(l.title), l.estimatedMinutes, c.status],
        );
        counts.lessons += 1;

        for (const b of l.blocks) {
          await client.query(
            `insert into public.lesson_blocks (id, lesson_id, ord, kind, content)
             values ($1, $2, $3, $4, $5::jsonb)
             on conflict (id) do update set ord = excluded.ord,
                                            kind = excluded.kind,
                                            content = excluded.content`,
            [b.id, l.id, b.ord + 1, b.kind, JSON.stringify(b.content)],
          );
          counts.blocks += 1;
        }

        for (const code of l.skillCodes) {
          const skillId = skillIdByCode.get(code);
          if (!skillId) {
            gaps.push({
              what: `lesson ${String(l.id).slice(0, 8)} -> skill \`${code}\``,
              why: "la lección declara una skill que el pack no define",
            });
            continue;
          }
          await client.query(
            `insert into public.lesson_skills (lesson_id, skill_id, weight)
             values ($1, $2, 1.000)
             on conflict (lesson_id, skill_id) do nothing`,
            [l.id, skillId],
          );
          counts.lessonSkills += 1;
        }
      }
    }

    // --- preguntas ---------------------------------------------------------
    // `questions` es identidad; `question_versions` es el snapshot INMUTABLE.
    // Por eso la versión se inserta con `on conflict do nothing`: si ya existe,
    // NO se toca. Actualizarla sería exactamente lo que el modelo de datos
    // prohíbe, y rompería la reconstrucción forense de cualquier intento que la
    // haya usado.
    for (const q of pack.questions) {
      const skillId = skillIdByCode.get(q.skillCode);
      if (!skillId) {
        gaps.push({
          what: `question ${String(q.id).slice(0, 8)}`,
          why: `skillCode \`${String(q.skillCode)}\` no existe en el pack`,
        });
        continue;
      }

      await client.query(
        `insert into public.questions (id, school_id, course_id, skill_id, kind, status)
         values ($1, null, $2, $3, $4, $5)
         on conflict (id) do update set skill_id = excluded.skill_id,
                                        status = excluded.status`,
        [q.id, c.id, skillId, q.kind, c.status],
      );
      counts.questions += 1;

      if (q.kind === "static") {
        const perdidos = idiomasPerdidos(q.body.stem, q.locale);
        if (perdidos.length > 0) {
          gaps.push({
            what: `question ${q.id.slice(0, 8)}`,
            why: `se sirve en \`${q.locale}\` y se pierde ${perdidos.join(", ")}: la base guarda un cuerpo YA localizado por version`,
          });
        }
      }

      // Id de versión derivado del de la pregunta: determinista y estable sin
      // necesidad de que el pack lo declare.
      const { rows: vrows } = await client.query<{ id: string }>(
        `insert into public.question_versions
           (question_id, version, format, body, answer_spec, hint, solution,
            difficulty, max_points, grading_mode, locale, published_at)
         values ($1, 1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10,
                 case when $11 = 'published' then now() else null end)
         on conflict (question_id, version) do nothing
         returning id`,
        [
          q.id,
          q.format,
          JSON.stringify(renderBody(q)),
          JSON.stringify(q.answerSpec),
          q.hint ? JSON.stringify(q.hint) : null,
          q.solution ? JSON.stringify(q.solution) : null,
          q.difficulty,
          q.maxPoints,
          q.gradingMode,
          q.locale,
          c.status,
        ],
      );
      if (vrows[0]) counts.versions += 1;

      await client.query(
        `update public.questions
            set current_version_id = (select id from public.question_versions
                                       where question_id = $1
                                       order by version desc limit 1)
          where id = $1`,
        [q.id],
      );
    }

    // --- blueprints --------------------------------------------------------
    for (const bp of pack.blueprints) {
      // `durationSeconds: null` significa "el entrenador no cronometraba", y eso
      // SI es un dato extraido. La columna exige entre 60 s y 8 h y no sabe
      // decir "sin limite". Inventarle un cronometro a un examen cambia lo que
      // vive el alumno, asi que no se siembra y se dice.
      if (bp.durationSeconds === null) {
        gaps.push({
          what: `blueprint \`${bp.code}\``,
          why: "sin sembrar: el entrenador no pone limite de tiempo y `duration_seconds` es not null (60..28800). Decide una duracion real o migra la columna a nullable",
        });
        continue;
      }

      await client.query(
        `insert into public.exam_blueprints
           (id, school_id, course_id, title, description, duration_seconds,
            shuffle_questions, shuffle_options, allow_back, feedback_mode,
            pass_threshold, max_attempts, status, version)
         values ($1, null, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, 1)
         on conflict (id) do update set title = excluded.title,
                                        description = excluded.description,
                                        duration_seconds = excluded.duration_seconds,
                                        shuffle_questions = excluded.shuffle_questions,
                                        shuffle_options = excluded.shuffle_options,
                                        allow_back = excluded.allow_back,
                                        feedback_mode = excluded.feedback_mode,
                                        pass_threshold = excluded.pass_threshold,
                                        max_attempts = excluded.max_attempts,
                                        status = excluded.status`,
        [
          bp.id,
          c.id,
          JSON.stringify(bp.title),
          bp.description ? JSON.stringify(bp.description) : null,
          bp.durationSeconds,
          bp.shuffleQuestions,
          bp.shuffleOptions,
          bp.allowBack,
          bp.feedbackMode,
          // Conversion de unidad, no de significado: el pack usa fraccion
          // (0.6) y la columna porcentaje (0..100). Sembrar 0.6 tal cual
          // pondria el aprobado en el 0,6 %.
          bp.passThreshold * 100,
          // `null` = "sin limite" en el pack, que la columna no sabe decir.
          // COVERAGE.md es explicito: maxAttempts NO es un dato extraido, es un
          // relleno uniforme del pipeline que un profesor debe revisar antes de
          // publicar. Se usa el 1 de la columna y se deja constancia.
          bp.maxAttempts ?? 1,
          c.status,
        ],
      );
      counts.blueprints += 1;

      if (bp.maxAttempts === null) {
        gaps.push({
          what: `blueprint \`${bp.code}\`.maxAttempts`,
          why: "sembrado con 1 intento: el pack decia `null` (sin limite), que la columna no sabe expresar. No era dato extraido; un profesor debe fijarlo",
        });
      }

      for (const sec of bp.sections) {
        // El pack selecciona por CODIGO de skill; la columna guarda ids. La
        // traduccion se hace aqui, con el mapa del propio pack: si un codigo no
        // existe, la seccion seleccionaria 0 preguntas y el examen saldria
        // corto sin que nadie se entere.
        const skillIds = sec.selection.skillCodes.map((code) => skillIdByCode.get(code));
        const faltan = sec.selection.skillCodes.filter((code) => !skillIdByCode.has(code));
        if (faltan.length > 0) {
          gaps.push({
            what: `blueprint \`${bp.code}\` seccion ${sec.ord + 1}`,
            why: `selecciona skills que el pack no define: ${faltan.join(", ")}`,
          });
          continue;
        }

        const selection: Record<string, unknown> = { skill_ids: skillIds };
        if (sec.selection.engineKey !== undefined) selection["engine_key"] = sec.selection.engineKey;
        if (sec.selection.params !== undefined) selection["params"] = sec.selection.params;

        await client.query(
          `insert into public.exam_blueprint_sections
             (id, blueprint_id, ord, title, item_count, selection, source, points_per_item)
           values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8)
           on conflict (id) do update set ord = excluded.ord,
                                          title = excluded.title,
                                          item_count = excluded.item_count,
                                          selection = excluded.selection,
                                          source = excluded.source,
                                          points_per_item = excluded.points_per_item`,
          [
            sec.id,
            bp.id,
            sec.ord + 1,
            JSON.stringify(sec.title),
            sec.itemCount,
            JSON.stringify(selection),
            sec.source,
            sec.pointsPerItem,
          ],
        );
      }
    }

    await client.query("commit");
    return { counts, gaps };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

/**
 * Los dos desacuerdos que impiden sembrar blueprints hoy.
 *
 * No son bugs de este script: son dos contratos que dicen cosas distintas, y
 * elegir uno por mi cuenta significaría cambiar en silencio la nota de aprobado
 * de un examen o el número de intentos de un alumno. Eso lo decide una persona.
 */
export function blueprintMismatches(pack: ContentPack): SeedGap[] {
  const out: SeedGap[] = [];
  for (const bp of pack.blueprints) {
    if (bp.passThreshold <= 1) {
      out.push({
        what: `${String(bp.code)}.passThreshold = ${bp.passThreshold}`,
        why:
          "el pack usa fracción (0.6) y `exam_blueprints.pass_threshold` usa PORCENTAJE (0-100). " +
          "Sembrarlo tal cual pondría el aprobado en el 0,6 % — un examen que se aprueba con una pregunta.",
      });
    }
    if (bp.maxAttempts === null) {
      out.push({
        what: `${String(bp.code)}.maxAttempts = null`,
        why:
          "el pack dice `null` = sin límite; la columna es `not null` con check >= 1 y no sabe expresar " +
          "'sin límite'. Hay que decidir: un tope real, o una migración que permita NULL.",
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Corpus -> base de datos                                                    */
/* -------------------------------------------------------------------------- */

export interface PersistedDocument {
  documentId: string;
  spans: number;
  alreadyThere: boolean;
}

/**
 * Guarda un documento y sus spans. Idempotente por `checksum`: reingerir el
 * mismo fichero no crea nada nuevo y no toca los spans existentes, que son
 * inmutables por trigger.
 */
export async function persistDocument(
  client: pg.Client,
  doc: {
    path: string;
    subjectCode: string;
    mime: string;
    bytes: number;
    checksum: string;
    extraction: string;
    extractorVersion: string;
    pages: number | null;
    locale: string;
    spans: { ord: number; page: number | null; kind: string; text: string; checksum: string }[];
  },
): Promise<PersistedDocument> {
  await client.query("begin");
  try {
    const { rows: subj } = await client.query<{ id: string }>(
      `select id from public.subjects where code = $1 and school_id is null`,
      [doc.subjectCode],
    );
    const subjectId = subj[0]?.id;
    if (!subjectId) {
      throw new Error(
        `la materia \`${doc.subjectCode}\` no está sembrada todavía: siembra los packs antes de ingerir su corpus`,
      );
    }

    const { rows: existing } = await client.query<{ id: string }>(
      `select id from public.source_documents where checksum = $1 and school_id is null`,
      [doc.checksum],
    );
    if (existing[0]) {
      await client.query("commit");
      return { documentId: existing[0].id, spans: 0, alreadyThere: true };
    }

    const { rows } = await client.query<{ id: string }>(
      `insert into public.source_documents
         (school_id, subject_id, path, mime, bytes, checksum, extraction, extractor_version, pages, locale)
       values (null, $1, $2, $3, $4, $5, $6::public.extraction_method, $7, $8, $9)
       returning id`,
      [
        subjectId,
        doc.path,
        doc.mime,
        doc.bytes,
        doc.checksum,
        doc.extraction,
        doc.extractorVersion,
        doc.pages,
        doc.locale,
      ],
    );
    const documentId = rows[0]!.id;

    for (const s of doc.spans) {
      await client.query(
        `insert into public.source_spans (document_id, ord, page, kind, span_text, checksum)
         values ($1, $2, $3, $4::public.span_kind, $5, $6)`,
        [documentId, s.ord, s.page, s.kind, s.text, s.checksum],
      );
    }

    await client.query("commit");
    return { documentId, spans: doc.spans.length, alreadyThere: false };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}
