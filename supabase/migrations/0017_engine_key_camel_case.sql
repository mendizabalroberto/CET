-- =============================================================================
-- 0017_engine_key_camel_case.sql — nomenclatura de `body.engineKey`
-- Cambridge Exam Trainer · (c) 2026 Roberto Mendizabal.
-- =============================================================================
-- `0007_questions.sql` exigia `body ? 'engine_key'` en snake_case, pero TODO el
-- resto del jsonb de este proyecto usa camelCase, porque son objetos que vienen
-- y van directos al contrato de TypeScript: `rendered_body` lleva `figureSvg` y
-- `figureAlt`, `answer_key` lleva `correctIds` y `requireSimplest`. El snake_case
-- del validador era el outlier, y hacia irrepresentable el banco entero de
-- Matematicas que produce `@cet/content`.
--
-- Canonico a partir de aqui: `engineKey` y `paramSpec`.
--
-- Se sigue aceptando `engine_key` porque `question_versions` es INMUTABLE por
-- trigger: las filas escritas antes de fijar la convencion no se pueden migrar,
-- y borrarlas es imposible mientras un intento las referencie
-- (`attempt_items.question_version_id` es `on delete restrict`). Tolerar las dos
-- formas es la consecuencia logica de haber elegido la inmutabilidad, no una
-- dejadez.
-- =============================================================================

create or replace function app.validate_question_version_body()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  q_kind    public.question_kind;
  v_key     text;
  v_params  jsonb;
begin
  select q.kind into q_kind from public.questions q where q.id = new.question_id;

  if q_kind = 'generated' then
    -- camelCase primero: es la forma canonica.
    v_key := coalesce(new.body ->> 'engineKey', new.body ->> 'engine_key');

    if v_key is null or v_key !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$' then
      raise exception
        'question_versions.body de una pregunta generated requiere `engineKey` con forma `materia.familia` (recibido: %)',
        coalesce(v_key, '<ausente>')
        using errcode = 'check_violation';
    end if;

    v_params := coalesce(new.body -> 'paramSpec', new.body -> 'param_spec');
    if v_params is not null and jsonb_typeof(v_params) <> 'object' then
      raise exception 'question_versions.body.paramSpec debe ser un objeto'
        using errcode = 'check_violation';
    end if;
  else
    -- static: el enunciado debe existir. Un `stem` vacío es una pregunta que el
    -- alumno ve en blanco y no puede responder.
    if not (new.body ? 'stem'
            and jsonb_typeof(new.body -> 'stem') = 'string'
            and length(btrim(new.body ->> 'stem')) > 0) then
      raise exception 'question_versions.body de una pregunta static requiere un `stem` no vacío'
        using errcode = 'check_violation';
    end if;
    -- Los formatos de opción múltiple necesitan opciones, y con id único: sin id
    -- estable, `option_order` y `answer_key.correctIds` no significan nada.
    if new.format in ('mcq_single', 'mcq_multi', 'true_false') then
      if not (new.body ? 'options'
              and jsonb_typeof(new.body -> 'options') = 'array'
              and jsonb_array_length(new.body -> 'options') >= 2) then
        raise exception 'question_versions.body de formato % requiere al menos 2 `options`', new.format
          using errcode = 'check_violation';
      end if;
      if exists (
        select 1 from jsonb_array_elements(new.body -> 'options') o
        where not (o.value ? 'id' and jsonb_typeof(o.value -> 'id') = 'string')
      ) then
        raise exception 'question_versions.body.options: cada opción necesita un `id` string'
          using errcode = 'check_violation';
      end if;
      if (select count(distinct o.value ->> 'id')
          from jsonb_array_elements(new.body -> 'options') o)
         <> jsonb_array_length(new.body -> 'options') then
        raise exception 'question_versions.body.options: los `id` deben ser únicos dentro de la pregunta'
          using errcode = 'check_violation';
      end if;
      -- mcq_single admite exactamente una correcta; mcq_multi, una o más.
      if new.format in ('mcq_single', 'true_false')
         and jsonb_array_length(coalesce(new.answer_spec -> 'correctIds', '[]'::jsonb)) <> 1 then
        raise exception 'question_versions de formato % requiere answer_spec.correctIds con exactamente 1 elemento',
          new.format
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function app.validate_question_version_body() is
  'Valida body segun questions.kind. Canonico: engineKey/paramSpec en camelCase, como el resto del jsonb del proyecto.';
