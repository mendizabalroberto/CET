/**
 * Publicación: candidatos APROBADOS -> `questions` + `question_versions`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La cuarentena de `content_candidates` (0027) tenía tres patas y le faltaba la
 * cuarta. Un agente propone, `verifyCandidate` verifica y una persona aprueba —
 * y ahí se acababa el camino: un candidato `approved` seguía siendo una fila en
 * una tabla que el alumno no puede ni leer. Sin esta pieza, aprobar no sirve de
 * nada.
 *
 * Lo que este módulo NO hace, a propósito:
 *
 *   - No inventa. Si el curso de la materia es ambiguo, o el `skillCode` no
 *     existe en ese curso, el candidato se SALTA con un motivo legible. Elegir
 *     "el primero que salga" pondría una pregunta en un curso al azar, y eso no
 *     se ve hasta que un alumno la responde.
 *   - No toca una versión existente. `question_versions` es INMUTABLE (0007):
 *     se inserta con `on conflict (question_id, version) do nothing` y, si ya
 *     estaba, se dice y se sigue. Actualizarla reescribiría exámenes ya
 *     calificados.
 *   - No pisa una pregunta ajena. Si el uuid del payload ya existe en
 *     `questions` apuntando a otro curso u otra skill, se salta: publicar
 *     encima de contenido de otro es peor que no publicar.
 *   - No marca el candidato como "publicado". `candidate_status` no tiene ese
 *     estado y añadirlo es una migración, no una decisión de este script. La
 *     idempotencia la da el uuid del payload, no una bandera.
 *
 * Una transacción POR CANDIDATO: lo que falle se queda fuera él solo, y los
 * demás entran. Un lote entero perdido por una pregunta mal formada es la peor
 * forma de fallar en un trabajo que se ejecuta a mano y de noche.
 */

import type pg from "pg";

import { question, type Question } from "../../packages/content/src/schema.ts";

export interface Saltado {
  id: string;
  motivo: string;
}

export interface ResultadoPublicacion {
  publicados: number;
  saltados: Saltado[];
}

/* -------------------------------------------------------------------------- */
/* I18nText -> texto: la misma proyección que hace el sembrador               */
/* -------------------------------------------------------------------------- */

/**
 * `question_versions.body` es un `RenderedBody`: el enunciado YA localizado,
 * string plano, y las opciones como `{id, html}` con `html` string. El payload
 * del candidato guarda `I18nText` porque un candidato no tiene por qué elegir
 * idioma. Alguien tiene que proyectar, y aquí ese alguien es esta función.
 *
 * Se proyecta al `locale` que declara la propia pregunta, y si ese idioma no
 * está se LANZA en vez de coger "el que haya": una pregunta servida en un
 * idioma que nadie pidió es peor que una pregunta ausente, porque el alumno la
 * ve y no la entiende.
 *
 * Está duplicada de `seed.ts` a sabiendas: allí no se exporta y este encargo no
 * permite tocar aquel fichero. Si alguna vez se unifican, tienen que seguir
 * lanzando igual — el trigger `question_versions_validate_body` comprueba la
 * forma, no el idioma, así que la única defensa contra publicar el idioma
 * equivocado es esta.
 */
function texto(v: Record<string, string | undefined>, locale: string, donde: string): string {
  const t = v[locale];
  if (t === undefined || t.trim() === "") {
    throw new Error(
      `${donde}: falta el texto en \`${locale}\` (hay: ${Object.keys(v).join(", ") || "nada"})`,
    );
  }
  return t;
}

/** Proyecta el cuerpo del candidato al `RenderedBody` que exige la base de datos. */
function cuerpoRenderizado(q: Question): Record<string, unknown> {
  if (q.kind === "generated") {
    // Una pregunta generada no tiene enunciado: tiene un contrato con el motor.
    // El trigger de la base espera `engine_key` en snake_case.
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

/* -------------------------------------------------------------------------- */
/* Resolución de curso y skill                                                */
/* -------------------------------------------------------------------------- */

interface Curso {
  id: string;
  status: string;
}

/**
 * El curso global (`school_id is null`) de la materia del documento.
 *
 * Devuelve `null` cuando hay cero o más de uno. Que haya dos no es imposible:
 * `supabase/seed/0003_math_y6.sql` creó el curso de Math con un uuid aleatorio
 * y el pack trae otro determinista, así que una materia puede acabar con dos
 * cursos globales. Con dos, "el primero" es una moneda al aire que decide en
 * qué curso aparece la pregunta.
 */
async function resolverCurso(client: pg.Client, subjectId: string): Promise<Curso[]> {
  const { rows } = await client.query<Curso>(
    `select id, status::text as status
       from public.courses
      where subject_id = $1 and school_id is null
      order by id`,
    [subjectId],
  );
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Un candidato                                                               */
/* -------------------------------------------------------------------------- */

interface FilaCandidato {
  id: string;
  payload: unknown;
  subject_id: string;
  subject_code: string;
  path: string;
}

/**
 * Publica UN candidato dentro de su propia transacción.
 *
 * Devuelve el motivo por el que no se publicó, o `null` si entró. Todo lo que
 * devuelve motivo ha hecho `rollback`: no queda una pregunta a medias, sin
 * versión, que el resto del sistema vería como contenido roto.
 */
async function publicarUno(client: pg.Client, fila: FilaCandidato): Promise<string | null> {
  await client.query("begin");
  try {
    // FORMA. El payload se validó con Zod antes de entrar en cuarentena, pero
    // eso fue en otro proceso y con otra versión del esquema. Revalidar aquí
    // cuesta microsegundos y es lo que separa "confío en lo que hay guardado"
    // de "lo he comprobado".
    const parsed = question.safeParse(fila.payload);
    if (!parsed.success) {
      await client.query("rollback");
      const primero = parsed.error.issues[0];
      return `el payload no valida contra el esquema de pregunta: ${
        primero ? `${primero.path.join(".") || "(raíz)"}: ${primero.message}` : "sin detalle"
      }`;
    }
    const q = parsed.data;

    // CURSO.
    const cursos = await resolverCurso(client, fila.subject_id);
    if (cursos.length === 0) {
      await client.query("rollback");
      return `la materia del documento \`${fila.subject_code}\` no tiene curso global sembrado: siembra el pack antes de publicar`;
    }
    if (cursos.length > 1) {
      await client.query("rollback");
      return `la materia \`${fila.subject_code}\` tiene ${cursos.length} cursos globales (${cursos
        .map((c) => c.id)
        .join(", ")}): elegir uno sería una moneda al aire. Reconcilia cuál manda`;
    }
    const curso = cursos[0]!;

    // SKILL. Por código DENTRO de ese curso: el mismo código puede existir en
    // otro curso y apuntar a otra cosa.
    const { rows: skills } = await client.query<{ id: string }>(
      `select id from public.skills where course_id = $1 and code = $2`,
      [curso.id, q.skillCode],
    );
    const skillId = skills[0]?.id;
    if (skillId === undefined) {
      await client.query("rollback");
      return `el skillCode \`${q.skillCode}\` no existe en el curso ${curso.id}`;
    }

    // CUERPO. Proyectar puede lanzar (idioma ausente) y tiene que hacerlo antes
    // de escribir nada.
    const body = cuerpoRenderizado(q);

    // IDENTIDAD. `do nothing`, no `do update`: si ese uuid ya es una pregunta,
    // no se le cambia el curso ni la skill por debajo. Se comprueba después que
    // sea la misma pregunta y no otra con el id ocupado.
    await client.query(
      `insert into public.questions (id, school_id, course_id, skill_id, kind, status)
       values ($1, null, $2, $3, $4::public.question_kind, $5::public.content_status)
       on conflict (id) do nothing`,
      // El estado lo hereda del curso, igual que en el sembrado: una pregunta
      // `published` en un curso en borrador no la ve nadie, y una `draft` en un
      // curso publicado es un hueco en el examen. Quien decide si el contenido
      // se sirve es `courses.status`, no este script.
      [q.id, curso.id, skillId, q.kind, curso.status],
    );

    const { rows: existentes } = await client.query<{ course_id: string; skill_id: string }>(
      `select course_id, skill_id from public.questions where id = $1`,
      [q.id],
    );
    const existente = existentes[0];
    if (!existente) {
      await client.query("rollback");
      return `la pregunta ${q.id} no está en \`questions\` tras insertarla: algo la borró en paralelo`;
    }
    if (existente.course_id !== curso.id || existente.skill_id !== skillId) {
      await client.query("rollback");
      return `el uuid ${q.id} ya es una pregunta de otro curso/skill (curso ${existente.course_id}, skill ${existente.skill_id}): publicar encima pisaría contenido ajeno`;
    }

    // VERSIÓN. Inmutable: si la 1 ya existe, NO se toca.
    const { rows: versiones } = await client.query<{ id: string }>(
      `insert into public.question_versions
         (question_id, version, format, body, answer_spec, hint, solution,
          difficulty, max_points, grading_mode, locale, published_at)
       values ($1, 1, $2::public.question_format, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb,
               $7, $8, $9::public.grading_mode, $10,
               case when $11 = 'published' then now() else null end)
       on conflict (question_id, version) do nothing
       returning id`,
      [
        q.id,
        q.format,
        JSON.stringify(body),
        JSON.stringify(q.answerSpec),
        q.hint ? JSON.stringify(q.hint) : null,
        q.solution ? JSON.stringify(q.solution) : null,
        q.difficulty,
        q.maxPoints,
        q.gradingMode,
        q.locale,
        curso.status,
      ],
    );
    if (!versiones[0]) {
      // No es un error: es que ya estaba. Se cierra la transacción sin cambios
      // y se cuenta como saltado, porque contarlo como publicado inflaría el
      // informe con trabajo que no se hizo.
      await client.query("rollback");
      return `la pregunta ${q.id} ya tenía la versión 1: \`question_versions\` es inmutable y no se reescribe`;
    }

    await client.query(
      `update public.questions
          set current_version_id = (select id from public.question_versions
                                     where question_id = $1
                                     order by version desc limit 1)
        where id = $1`,
      [q.id],
    );

    await client.query("commit");
    return null;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    return error instanceof Error ? error.message : String(error);
  }
}

/* -------------------------------------------------------------------------- */
/* El lote                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Lleva a contenido real todos los candidatos `approved` de tipo `question`.
 *
 * `soloDocumento` acepta el uuid del documento o su ruta: quien revisa un
 * documento a mano tiene delante la ruta, no el uuid, y obligarle a traducirla
 * es una invitación a publicar el documento equivocado.
 */
export async function publicarAprobados(
  client: pg.Client,
  opciones: { soloDocumento?: string },
): Promise<ResultadoPublicacion> {
  const filtro = opciones.soloDocumento ?? null;

  const { rows } = await client.query<FilaCandidato>(
    `select c.id, c.payload, d.subject_id, s.code as subject_code, d.path
       from public.content_candidates c
       join public.source_documents d on d.id = c.document_id
       join public.subjects s on s.id = d.subject_id
      where c.status = 'approved'
        and c.kind = 'question'
        and ($1::text is null or d.id::text = $1 or d.path = $1)
      order by d.path, c.created_at, c.id`,
    [filtro],
  );

  const saltados: Saltado[] = [];
  let publicados = 0;

  for (const fila of rows) {
    const motivo = await publicarUno(client, fila);
    if (motivo === null) publicados += 1;
    else saltados.push({ id: fila.id, motivo });
  }

  return { publicados, saltados };
}
