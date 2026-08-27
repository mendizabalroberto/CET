-- =============================================================================
-- 0003_math_y6.sql — materia Math, curso Math Y6, módulos, lecciones y skills
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- FUENTE: Y6A/Math/Grade 5 Maths Exam Trainer.html
--   · Los 8 títulos de lección salen LITERALMENTE del array `LESSONS` (línea 411),
--     con las entidades HTML resueltas (`&amp;` -> `&`).
--   · La taxonomía de skills se deriva de los generadores `GEN.*` (línea 596 y
--     siguientes): simplify, compare, fracop, mixed, decimal, powten, metric,
--     shape, word. Cada `skills.code` es exactamente el `skillCode` que
--     devolverá el `GeneratedItem` correspondiente de @cet/engine
--     (packages/shared/src/engine-contract.ts), de modo que el motor y la base
--     de datos hablen del mismo identificador sin tabla de traducción.
--
-- El desglose fino de `fracop` (+ − × ÷), de `metric` (length/mass/capacity) y de
-- `shape` (area/perimeter) sale de los argumentos que el propio trainer pasa a
-- sus generadores en `MOCK_PLAN` (línea 1025) y del array `CONVS` (línea 734):
-- son las variantes que el examen distingue, así que son skills distintas para
-- el modelo de mastery.
--
-- Contenido GLOBAL (school_id = NULL, AD-2): Math Y6 es biblioteca de
-- plataforma, no propiedad del colegio demo. El colegio demo lo ACTIVA al final
-- del fichero vía `school_courses` (DATA_MODEL §2: visibilidad ≠ activación).
--
-- Idempotente: se apoya en las claves naturales (subjects.code, skills.code,
-- ord de módulos y lecciones).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Materia
-- -----------------------------------------------------------------------------
-- Sin id explícito: la clave natural de una materia global es su `code`, y el
-- índice parcial `subjects_global_code_uniq` es quien la garantiza. Inventar
-- UUIDs a mano en un seed solo sirve para que dos entornos diverjan en silencio.
insert into public.subjects (school_id, code, name, icon, color, ord)
select null, 'math',
       jsonb_build_object('en', 'Mathematics', 'es', 'Matemáticas'),
       'calculator', '#173a63', 1
where not exists (
  select 1 from public.subjects where code = 'math' and school_id is null
);


-- -----------------------------------------------------------------------------
-- Curso: Math Y6 (global)
-- -----------------------------------------------------------------------------
insert into public.courses (school_id, subject_id, name, year_level, locale, status, version)
select
  null,
  s.id,
  jsonb_build_object('en', 'Mathematics — Year 6', 'es', 'Matemáticas — 6º'),
  6, 'en', 'published', 1
from public.subjects s
where s.code = 'math' and s.school_id is null
  and not exists (
    select 1 from public.courses c
    where c.subject_id = s.id and c.school_id is null and c.year_level = 6
  );


-- -----------------------------------------------------------------------------
-- Módulos — los 8 temas del trainer agrupados en 4 bloques
-- -----------------------------------------------------------------------------
with course as (
  select c.id
  from public.courses c
  join public.subjects s on s.id = c.subject_id
  where s.code = 'math' and s.school_id is null
    and c.school_id is null and c.year_level = 6
)
insert into public.course_modules (course_id, ord, title, description)
select course.id, m.ord, m.title, m.description
from course,
     (values
       (1,
        jsonb_build_object('en', 'Fractions', 'es', 'Fracciones'),
        jsonb_build_object('en', 'Simplifying, comparing, the four operations, and mixed numbers.',
                           'es', 'Simplificar, comparar, las cuatro operaciones y números mixtos.')),
       (2,
        jsonb_build_object('en', 'Decimals and place value', 'es', 'Decimales y valor posicional'),
        jsonb_build_object('en', 'Multiplying and dividing decimals, and moving digits by powers of ten.',
                           'es', 'Multiplicar y dividir decimales y mover cifras por potencias de diez.')),
       (3,
        jsonb_build_object('en', 'Measurement and shape', 'es', 'Medida y geometría'),
        jsonb_build_object('en', 'Metric conversions and compound shapes.',
                           'es', 'Conversiones métricas y figuras compuestas.')),
       (4,
        jsonb_build_object('en', 'Problem solving', 'es', 'Resolución de problemas'),
        jsonb_build_object('en', 'Turning words into calculations — and answering in the right unit.',
                           'es', 'Convertir enunciados en cálculos y responder con la unidad correcta.'))
     ) as m(ord, title, description)
on conflict (course_id, ord) do update
  set title = excluded.title, description = excluded.description;


-- -----------------------------------------------------------------------------
-- Lecciones — títulos LITERALES del array LESSONS del trainer
-- -----------------------------------------------------------------------------
with course as (
  select c.id
  from public.courses c
  join public.subjects s on s.id = c.subject_id
  where s.code = 'math' and s.school_id is null
    and c.school_id is null and c.year_level = 6
),
mods as (
  select m.id, m.ord from public.course_modules m
  join course on course.id = m.course_id
)
insert into public.lessons (module_id, ord, title, estimated_minutes, status)
select mods.id, l.lesson_ord, l.title, l.minutes, 'published'
from mods
join (values
  -- LESSONS[0..7] del trainer. `module_ord` es la agrupación editorial.
  (1, 1, jsonb_build_object(
          'en', 'Comparing & simplifying fractions',
          'es', 'Comparar y simplificar fracciones'), 25),
  (1, 2, jsonb_build_object(
          'en', 'Adding, subtracting, multiplying & dividing fractions',
          'es', 'Sumar, restar, multiplicar y dividir fracciones'), 35),
  (1, 3, jsonb_build_object(
          'en', 'Improper fractions & mixed numbers',
          'es', 'Fracciones impropias y números mixtos'), 25),
  (2, 1, jsonb_build_object(
          'en', 'Multiplying & dividing decimals',
          'es', 'Multiplicar y dividir decimales'), 30),
  (2, 2, jsonb_build_object(
          'en', 'Multiplying & dividing by 10, 100 and 1,000',
          'es', 'Multiplicar y dividir por 10, 100 y 1.000'), 20),
  (3, 1, jsonb_build_object(
          'en', 'Metric unit conversions (length, mass, capacity)',
          'es', 'Conversiones de unidades métricas (longitud, masa, capacidad)'), 30),
  (3, 2, jsonb_build_object(
          'en', 'Compound shapes: area and perimeter',
          'es', 'Figuras compuestas: área y perímetro'), 30),
  (4, 1, jsonb_build_object(
          'en', 'Word problems',
          'es', 'Problemas de enunciado'), 35)
) as l(module_ord, lesson_ord, title, minutes)
  on l.module_ord = mods.ord
on conflict (module_id, ord) do update
  set title = excluded.title,
      estimated_minutes = excluded.estimated_minutes,
      status = excluded.status;


-- -----------------------------------------------------------------------------
-- Skills — derivadas de los generadores GEN.* del trainer
-- -----------------------------------------------------------------------------
-- Primero se insertan TODAS sin jerarquía; luego se enlaza `parent_skill_id` por
-- código. Hacerlo en dos pasadas evita depender del orden de inserción y del
-- trigger anti-ciclos.
with course as (
  select c.id
  from public.courses c
  join public.subjects s on s.id = c.subject_id
  where s.code = 'math' and s.school_id is null
    and c.school_id is null and c.year_level = 6
)
insert into public.skills (school_id, course_id, code, name, description, ord)
select null, course.id, sk.code, sk.name, sk.description, sk.ord
from course,
(values
  -- --- Raíces temáticas -----------------------------------------------------
  ('math.fractions', 10,
   jsonb_build_object('en','Fractions','es','Fracciones'),
   jsonb_build_object('en','Everything about parts of a whole.','es','Todo lo relativo a partes de un todo.')),
  ('math.decimals', 20,
   jsonb_build_object('en','Decimals','es','Decimales'),
   jsonb_build_object('en','Decimal notation, operations and place value.','es','Notación decimal, operaciones y valor posicional.')),
  ('math.measurement', 30,
   jsonb_build_object('en','Measurement','es','Medida'),
   jsonb_build_object('en','Units and conversions.','es','Unidades y conversiones.')),
  ('math.geometry', 40,
   jsonb_build_object('en','Geometry','es','Geometría'),
   jsonb_build_object('en','Shape, area and perimeter.','es','Figuras, área y perímetro.')),
  ('math.problem_solving', 50,
   jsonb_build_object('en','Problem solving','es','Resolución de problemas'),
   jsonb_build_object('en','Choosing the operation and answering the question asked.','es','Elegir la operación y responder a lo que se pregunta.')),

  -- --- GEN.simplify ---------------------------------------------------------
  ('math.fractions.simplify', 11,
   jsonb_build_object('en','Simplifying fractions','es','Simplificar fracciones'),
   jsonb_build_object('en','Dividing top and bottom by the highest common factor.','es','Dividir numerador y denominador por el máximo común divisor.')),
  -- --- GEN.compare ----------------------------------------------------------
  ('math.fractions.compare', 12,
   jsonb_build_object('en','Comparing fractions','es','Comparar fracciones'),
   jsonb_build_object('en','Common denominators and the cross-multiplication trick.','es','Denominador común y el truco de multiplicar en cruz.')),
  -- --- GEN.fracop: la familia y sus cuatro operaciones -----------------------
  ('math.fractions.arithmetic', 13,
   jsonb_build_object('en','Fraction arithmetic','es','Aritmética de fracciones'),
   jsonb_build_object('en','The four operations with fractions.','es','Las cuatro operaciones con fracciones.')),
  ('math.fractions.arithmetic.add', 14,
   jsonb_build_object('en','Adding fractions','es','Sumar fracciones'), null),
  ('math.fractions.arithmetic.subtract', 15,
   jsonb_build_object('en','Subtracting fractions','es','Restar fracciones'), null),
  ('math.fractions.arithmetic.multiply', 16,
   jsonb_build_object('en','Multiplying fractions','es','Multiplicar fracciones'), null),
  ('math.fractions.arithmetic.divide', 17,
   jsonb_build_object('en','Dividing fractions','es','Dividir fracciones'),
   jsonb_build_object('en','Keep, change, flip.','es','Mantener, cambiar, invertir.')),
  -- --- GEN.mixed ------------------------------------------------------------
  ('math.fractions.mixed', 18,
   jsonb_build_object('en','Improper fractions and mixed numbers','es','Fracciones impropias y números mixtos'),
   jsonb_build_object('en','Converting both ways and checking the conversion.','es','Convertir en ambos sentidos y comprobar la conversión.')),

  -- --- GEN.decimal ----------------------------------------------------------
  ('math.decimals.multiply_divide', 21,
   jsonb_build_object('en','Multiplying and dividing decimals','es','Multiplicar y dividir decimales'),
   jsonb_build_object('en','Counting decimal places; keeping placeholder zeros.','es','Contar cifras decimales y no perder los ceros.')),
  -- --- GEN.powten -----------------------------------------------------------
  ('math.decimals.powers_of_ten', 22,
   jsonb_build_object('en','Multiplying and dividing by 10, 100 and 1,000','es','Multiplicar y dividir por 10, 100 y 1.000'),
   jsonb_build_object('en','The digits move, not the point.','es','Se mueven las cifras, no la coma.')),

  -- --- GEN.metric: una skill por familia del array CONVS ---------------------
  ('math.measurement.metric', 31,
   jsonb_build_object('en','Metric conversions','es','Conversiones métricas'),
   jsonb_build_object('en','Smaller unit -> multiply; bigger unit -> divide.','es','Unidad menor -> multiplicar; unidad mayor -> dividir.')),
  ('math.measurement.metric.length', 32,
   jsonb_build_object('en','Length: km, m, cm, mm','es','Longitud: km, m, cm, mm'),
   jsonb_build_object('en','The only family that uses 10 and 100 as well as 1,000.','es','La única familia que usa 10 y 100 además de 1.000.')),
  ('math.measurement.metric.mass', 33,
   jsonb_build_object('en','Mass: t, kg, g, mg','es','Masa: t, kg, g, mg'), null),
  ('math.measurement.metric.capacity', 34,
   jsonb_build_object('en','Capacity: kL, L, mL','es','Capacidad: kL, L, mL'), null),

  -- --- GEN.shape ------------------------------------------------------------
  ('math.geometry.compound_shapes', 41,
   jsonb_build_object('en','Compound shapes','es','Figuras compuestas'),
   jsonb_build_object('en','Rectangles stuck together; working out the missing sides.','es','Rectángulos unidos; deducir los lados que faltan.')),
  ('math.geometry.compound_shapes.area', 42,
   jsonb_build_object('en','Area of a compound shape','es','Área de una figura compuesta'), null),
  ('math.geometry.compound_shapes.perimeter', 43,
   jsonb_build_object('en','Perimeter of a compound shape','es','Perímetro de una figura compuesta'), null),

  -- --- GEN.word -------------------------------------------------------------
  ('math.problem_solving.word', 51,
   jsonb_build_object('en','Word problems','es','Problemas de enunciado'),
   jsonb_build_object('en','Read twice, choose the operation, answer in the right unit.','es','Leer dos veces, elegir la operación y responder con la unidad correcta.'))
) as sk(code, ord, name, description)
on conflict (course_id, code) do update
  set name = excluded.name,
      description = excluded.description,
      ord = excluded.ord;


-- Segunda pasada: jerarquía por código. `parent` es el prefijo del `code` hasta
-- el último punto, que es exactamente la relación que expresa la nomenclatura.
update public.skills child
   set parent_skill_id = parent.id
  from public.skills parent
 where child.course_id = parent.course_id
   and child.code like 'math.%.%'
   and parent.code = left(child.code, length(child.code) - position('.' in reverse(child.code)))
   and child.parent_skill_id is distinct from parent.id;


-- -----------------------------------------------------------------------------
-- lesson_skills — qué enseña cada lección
-- -----------------------------------------------------------------------------
with course as (
  select c.id
  from public.courses c
  join public.subjects s on s.id = c.subject_id
  where s.code = 'math' and s.school_id is null
    and c.school_id is null and c.year_level = 6
),
lesson_map as (
  select l.id, m.ord as module_ord, l.ord as lesson_ord
  from public.lessons l
  join public.course_modules m on m.id = l.module_id
  join course on course.id = m.course_id
),
skill_map as (
  select sk.id, sk.code from public.skills sk join course on course.id = sk.course_id
)
insert into public.lesson_skills (lesson_id, skill_id, weight)
select lesson_map.id, skill_map.id, x.weight
from (values
  (1, 1, 'math.fractions.simplify',                  1.000),
  (1, 1, 'math.fractions.compare',                   1.000),
  (1, 2, 'math.fractions.arithmetic.add',            1.000),
  (1, 2, 'math.fractions.arithmetic.subtract',       1.000),
  (1, 2, 'math.fractions.arithmetic.multiply',       1.000),
  (1, 2, 'math.fractions.arithmetic.divide',         1.000),
  (1, 3, 'math.fractions.mixed',                     1.000),
  (2, 1, 'math.decimals.multiply_divide',            1.000),
  (2, 2, 'math.decimals.powers_of_ten',              1.000),
  (3, 1, 'math.measurement.metric.length',           1.000),
  (3, 1, 'math.measurement.metric.mass',             1.000),
  (3, 1, 'math.measurement.metric.capacity',         1.000),
  (3, 2, 'math.geometry.compound_shapes.area',       1.000),
  (3, 2, 'math.geometry.compound_shapes.perimeter',  1.000),
  -- Los problemas de enunciado ejercitan la skill propia y, de rebote, las
  -- fracciones y los decimales: por eso van con peso menor.
  (4, 1, 'math.problem_solving.word',                1.000),
  (4, 1, 'math.fractions.arithmetic.multiply',       0.300),
  (4, 1, 'math.decimals.multiply_divide',            0.300),
  (4, 1, 'math.measurement.metric.length',           0.300)
) as x(module_ord, lesson_ord, skill_code, weight)
join lesson_map on lesson_map.module_ord = x.module_ord
               and lesson_map.lesson_ord = x.lesson_ord
join skill_map  on skill_map.code = x.skill_code
on conflict (lesson_id, skill_id) do update set weight = excluded.weight;


-- -----------------------------------------------------------------------------
-- Activación del curso en el colegio demo (DATA_MODEL §2)
-- -----------------------------------------------------------------------------
-- El curso es global y por tanto VISIBLE para todos los colegios; solo APARECE
-- a los alumnos del colegio demo porque queda activado aquí.
insert into public.school_courses (school_id, course_id, is_active)
select '00000000-0000-4000-8000-000000000001', c.id, true
from public.courses c
join public.subjects s on s.id = c.subject_id
where s.code = 'math' and s.school_id is null
  and c.school_id is null and c.year_level = 6
on conflict (school_id, course_id) do update set is_active = true;
