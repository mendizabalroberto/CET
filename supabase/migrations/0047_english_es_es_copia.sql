-- =============================================================================
-- 0047_english_es_es_copia.sql — la asignatura de ingles se copia, no se traduce
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
--
-- POR QUE ESTO NO ES UNA TRADUCCION, Y ES DELIBERADO
--
-- Las otras cinco materias se tradujeron: un nino espanol aprende ciencias en
-- espanol. Pero `english` es la asignatura de LENGUA INGLESA. Su contenido es
-- el objeto de estudio, no el vehiculo: traducir «write the past simple of
-- *to go*» destruiria el ejercicio. Aqui el ingles ES la leccion.
--
-- Asi que se copia `en` en `es`, literal, sin tocar una coma.
--
-- POR QUE COPIAR Y NO DEJAR QUE CAIGA EL FALLBACK
--
-- `resolveI18n` ya cae al otro idioma cuando falta uno, asi que sin esta
-- migracion la pantalla se veria igual. La diferencia es que hoy se veria igual
-- POR ACCIDENTE, y a partir de aqui se ve igual POR DECISION:
--
--   1. Una consulta que cuente cuanto contenido falta por traducir deja de
--      contar estas 45 filas como deuda. Son deuda que nunca se va a pagar.
--   2. El dia que alguien escriba un invariante «ningun bloque se sirve por
--      fallback», estas filas no lo pondran rojo.
--   3. Y si manana se decide traducir algo de aqui —los enunciados en espanol
--      con el texto ingles dentro, por ejemplo— hay una fila que editar en vez
--      de una ausencia que interpretar.
--
-- Es el mismo criterio que el traspaso pedia para el fallback: que sea una
-- decision y no un accidente.
--
-- Idempotente: la guarda `not (... ? 'es')` impide pisar una correccion
-- posterior a mano. Aditiva: `||` sobre el objeto existente, nunca una
-- asignacion que se lleve el ingles por delante.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Bloques de leccion con `content.html`
-- -----------------------------------------------------------------------------
-- El I18nText NO es `content`: esta un nivel mas abajo, en `content.html`. Por
-- eso `jsonb_set(content, '{html}', …)`: se reescribe solo esa rama.
update public.lesson_blocks b
set content = jsonb_set(
      b.content,
      '{html}',
      (b.content -> 'html') || jsonb_build_object('es', b.content -> 'html' -> 'en')
    )
from public.lessons l
join public.course_modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
join public.subjects s on s.id = c.subject_id
where b.lesson_id = l.id
  and s.code = 'english' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and b.content ? 'html'
  and b.content -> 'html' ? 'en'
  and not (b.content -> 'html' ? 'es');

-- -----------------------------------------------------------------------------
-- 2 · Titulos de leccion
-- -----------------------------------------------------------------------------
update public.lessons l
set title = l.title || jsonb_build_object('es', l.title -> 'en')
from public.course_modules m
join public.courses c on c.id = m.course_id
join public.subjects s on s.id = c.subject_id
where l.module_id = m.id
  and s.code = 'english' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and l.title ? 'en'
  and not (l.title ? 'es');

-- -----------------------------------------------------------------------------
-- 3 · Titulos de modulo
-- -----------------------------------------------------------------------------
update public.course_modules m
set title = m.title || jsonb_build_object('es', m.title -> 'en')
from public.courses c
join public.subjects s on s.id = c.subject_id
where c.id = m.course_id
  and s.code = 'english' and s.school_id is null
  and c.school_id is null and c.year_level = 6
  and m.title ? 'en'
  and not (m.title ? 'es');
