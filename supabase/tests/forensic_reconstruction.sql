-- =============================================================================
-- forensic_reconstruction.sql — EL TEST ESTRELLA
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: DATA_MODEL.md §10 · principio rector del MASTER_PLAN
-- =============================================================================
-- "Para cualquier examen terminado, el sistema debe poder reconstruir EXACTAMENTE
--  qué vio el estudiante, en qué orden, qué versión de cada pregunta, qué
--  respondió, cuándo, cuántas veces cambió de opinión y cómo se calificó — sin
--  depender de la honestidad del cliente."
--
-- Este fichero ejecuta LA QUERY DE §10 TAL CUAL está escrita en DATA_MODEL.md y
-- comprueba, cláusula por cláusula del principio rector, que devuelve el 100 %
-- de lo ocurrido.
--
-- El intento sembrado (s1a, 3 items):
--   item 1 — versión 1 (la ANTIGUA), opciones barajadas [1,0]
--            rev 0: eligió "b" (mal)  ->  rev 1: rectificó a "a" (bien)   1 punto
--   item 2 — versión 2, opciones barajadas [0,2,1]
--            rev 0: "c"  ->  rev 1: "a" (bien)  ->  rev 2: "b" (mal, final)  0 puntos
--   item 3 — versión 2, opciones barajadas [2,0,1]
--            rev 0: "a" (bien, sin cambiar de opinión)                    1 punto
--   Nota final: 2 de 3.
-- =============================================================================
begin;
select plan(22);

\ir helpers/fixture.psql

-- -----------------------------------------------------------------------------
-- LA QUERY DE DATA_MODEL §10, LITERAL
-- -----------------------------------------------------------------------------
-- Si esta query deja de compilar o deja de devolver algo, es que el esquema se
-- ha desviado del contrato. Ese es justamente el fallo que este test debe
-- detectar, así que se copia sin adaptar.
create temp table forensic as
select
  ai.ord,
  ai.rendered_body,            -- lo que vio, literal
  ai.option_order,             -- en qué orden vio las opciones
  qv.version,                  -- qué versión de la pregunta
  ai.answer_key,               -- la clave vigente entonces
  r.response, r.revision, r.server_ts,   -- cada cambio de opinión
  g.points_awarded, g.graded_by, g.graded_at
from attempt_items ai
join question_versions qv on qv.id = ai.question_version_id
left join attempt_responses r on r.attempt_item_id = ai.id
left join attempt_gradings  g on g.attempt_item_id = ai.id
where ai.attempt_id = '33333333-0000-4000-8000-0000000000a1'
order by ai.ord, r.revision;


-- =============================================================================
-- 1. "qué vio el estudiante" — el enunciado LITERAL
-- =============================================================================
select is(
  (select count(distinct ord)::int from forensic),
  3,
  'La reconstrucción cubre los 3 items del intento');

select is(
  (select distinct rendered_body ->> 'stem' from forensic where ord = 1),
  'Simplify 24/36 (v1)',
  'Item 1: se recupera el enunciado EXACTO que se le mostró, con su errata incluida');

select is(
  (select distinct rendered_body ->> 'stem' from forensic where ord = 2),
  'Simplify 24/36',
  'Item 2: enunciado exacto de la versión corregida');


-- =============================================================================
-- 2. "en qué orden" — la permutación de opciones
-- =============================================================================
-- Sin option_order, "eligió la primera opción" no significa nada. Con él, se
-- reconstruye qué había DETRÁS de cada posición aplicando la permutación al
-- body de la versión original.
select is(
  (select distinct option_order from forensic where ord = 1),
  array[1, 0],
  'Item 1: se recupera la permutación aplicada a las opciones');

select is(
  (select distinct
     qv.body -> 'options' -> (f.option_order[1]) ->> 'html'
   from forensic f
   join public.question_versions qv on qv.version = f.version
                                   and qv.question_id = '77777777-0000-4000-8000-000000000001'
   where f.ord = 1),
  '3/4',
  'Item 1: aplicando option_order al body de la versión, la PRIMERA opción que '
  'vio era "3/4" — la reconstrucción del orden funciona de verdad');

select is(
  (select distinct option_order from forensic where ord = 2),
  array[0, 2, 1],
  'Item 2: se recupera su permutación, distinta de la del item 1');


-- =============================================================================
-- 3. "qué versión de cada pregunta"
-- =============================================================================
-- Este es el corazón del versionado inmutable: la pregunta ya va por la v2, pero
-- el item 1 sigue apuntando a la v1 porque es lo que se le mostró.
select is(
  (select distinct version from forensic where ord = 1), 1,
  'Item 1: conserva la versión 1 aunque el banco ya vaya por la 2');

select is(
  (select distinct version from forensic where ord = 2), 2,
  'Item 2: conserva la versión 2');

select is(
  (select current_version_id from public.questions
    where id = '77777777-0000-4000-8000-000000000001'),
  '88888888-0000-4000-8000-000000000002'::uuid,
  'La pregunta vigente HOY es la v2: el item 1 se reconstruye con la v1 pese a ello');


-- =============================================================================
-- 4. "qué respondió, cuándo, cuántas veces cambió de opinión"
-- =============================================================================
select is(
  (select count(*)::int from forensic),
  6,
  'La query devuelve las 6 filas: una POR REVISIÓN, no una por item');

-- La secuencia completa de decisiones, en orden. Es la aserción que prueba el
-- principio rector de un golpe.
select results_eq(
  $$select ord, revision, response ->> 'type', (response -> 'selectedIds' ->> 0)
      from forensic order by ord, revision$$,
  $$values (1, 0, 'choice', 'b'),
           (1, 1, 'choice', 'a'),
           (2, 0, 'choice', 'c'),
           (2, 1, 'choice', 'a'),
           (2, 2, 'choice', 'b'),
           (3, 0, 'choice', 'a')$$,
  'La secuencia COMPLETA de respuestas y revisiones se reconstruye exactamente');

select is(
  (select count(*)::int - 1 from forensic where ord = 2),
  2,
  '"¿Cuántas veces cambió de opinión en el item 2?" -> 2. La pregunta tiene respuesta');

select is(
  (select count(*)::int - 1 from forensic where ord = 3),
  0,
  'Item 3: respondió a la primera y no volvió');

-- Los timestamps son del SERVIDOR y son estrictamente crecientes por revisión.
-- Si no lo fueran, el orden de las decisiones sería inventado.
select ok(
  (select bool_and(prev_ts < server_ts)
   from (select server_ts, lag(server_ts) over (partition by ord order by revision) as prev_ts
         from forensic) t
   where prev_ts is not null),
  'Los server_ts de cada revisión son estrictamente crecientes: la cronología es reconstruible');

select ok(
  (select bool_and(server_ts is not null) from forensic),
  'Ninguna revisión se guardó sin marca de tiempo del servidor');

-- Exactamente una respuesta final por item: la que se corrigió.
select is(
  (select count(*)::int from public.attempt_responses
    where attempt_id = '33333333-0000-4000-8000-0000000000a1' and is_final),
  3,
  'Hay exactamente una respuesta FINAL por item — la que se calificó');


-- =============================================================================
-- 5. "y cómo se calificó"
-- =============================================================================
select results_eq(
  $$select distinct ord, points_awarded, graded_by::text
      from forensic order by ord$$,
  $$values (1, 1::numeric(6,2), 'auto'),
           (2, 0::numeric(6,2), 'auto'),
           (3, 1::numeric(6,2), 'auto')$$,
  'La calificación de cada item se reconstruye, con quién la puso');

select is(
  (select sum(points_awarded) from (select distinct ord, points_awarded from forensic) t),
  (select score_raw from public.exam_attempts
    where id = '33333333-0000-4000-8000-0000000000a1'),
  'La suma de los puntos por item cuadra con score_raw del intento: la nota es auditable');

select ok(
  (select bool_and(graded_at is not null) from forensic),
  'Cada calificación tiene su momento: se sabe cuándo se puso la nota');

-- La clave con la que se corrigió, congelada en el item. Sin ella, "esto estaba
-- mal" sería una afirmación sin prueba.
select is(
  (select distinct answer_key ->> 'type' from forensic where ord = 1),
  'choice',
  'La clave vigente ENTONCES viaja con el item: la corrección es explicable a posteriori');


-- =============================================================================
-- 6. "sin depender de la honestidad del cliente"
-- =============================================================================
-- El blueprint se edita DESPUÉS del examen. El intento tiene que seguir siendo
-- interpretable: para eso existe blueprint_snapshot.
update public.exam_blueprints
   set title = '{"en":"Título cambiado después del examen"}'::jsonb,
       duration_seconds = 60
 where id = '66666666-0000-4000-8000-000000000001';

select is(
  (select blueprint_snapshot -> 'title' ->> 'en' from public.exam_attempts
    where id = '33333333-0000-4000-8000-0000000000a1'),
  'Fractions mock paper',
  'Editar el blueprint NO altera el intento: blueprint_snapshot conserva lo que se examinó');

select is(
  (select (blueprint_snapshot ->> 'duration_seconds')::int from public.exam_attempts
    where id = '33333333-0000-4000-8000-0000000000a1'),
  1800,
  'La duración con la que se examinó sigue siendo 1800 s, no los 60 s de ahora');

select * from finish();
rollback;
