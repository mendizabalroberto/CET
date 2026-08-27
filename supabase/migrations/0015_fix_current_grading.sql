-- =============================================================================
-- 0015_fix_current_grading.sql — corrige la semántica de "calificación vigente"
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- EL ERROR QUE SE CORRIGE
-- `0009_attempts.sql` creó `attempt_gradings_current_uniq` sobre
-- `(attempt_item_id) where supersedes_id is null` y lo documentó como "solo UNA
-- calificación vigente por item".
--
-- Es exactamente al revés. `supersedes_id` apunta a la fila que ESTA sustituye,
-- así que la fila con `supersedes_id IS NULL` es la PRIMERA de la cadena — la
-- más antigua. La vigente es la HOJA: aquella a la que ninguna otra sustituye.
--
-- Verificado sobre datos reales antes de escribir esta migración: con una cadena
-- de dos eslabones (2.00 recalificado a 1.00), la lectura del comentario
-- devolvía 2.00 y la correcta 1.00. Cualquier informe construido siguiendo ese
-- comentario habría enseñado al alumno la nota ANTERIOR a su revisión.
--
-- El índice en sí es útil y se conserva: garantiza que cada item tiene una sola
-- calificación RAÍZ, que es lo que impide dos cadenas paralelas. Solo estaba mal
-- nombrado y mal documentado.
-- =============================================================================

comment on index public.attempt_gradings_current_uniq is
  'Una sola calificación RAÍZ por item (la primera de la cadena). NO es la vigente: '
  'la vigente es la hoja. Ver la vista attempt_gradings_current.';

-- -----------------------------------------------------------------------------
-- La vista que da la respuesta correcta
-- -----------------------------------------------------------------------------
-- `security_invoker = true` es obligatorio, igual que en attempt_items_student:
-- sin él la vista corre con los privilegios de su propietario y saltaría la RLS
-- de attempt_gradings, dejando las notas de todos los colegios a la vista.
create or replace view public.attempt_gradings_current
with (security_invoker = true, security_barrier = true)
as
select g.*
from public.attempt_gradings g
where not exists (
  select 1 from public.attempt_gradings s where s.supersedes_id = g.id
);

comment on view public.attempt_gradings_current is
  'La calificación VIGENTE de cada item: la hoja de la cadena de recalificación. '
  'Es lo que hay que sumar para la nota del intento, nunca la raíz.';

grant select on public.attempt_gradings_current to authenticated;

-- -----------------------------------------------------------------------------
-- La cadena no puede bifurcarse
-- -----------------------------------------------------------------------------
-- Dos filas que sustituyan a la MISMA calificación crearían dos hojas para un
-- item, y "la nota" volvería a ser ambigua. Un UNIQUE lo hace imposible, y de
-- paso sirve de índice para localizar la hoja (el anti-join de la vista).
create unique index if not exists attempt_gradings_one_successor_uniq
  on public.attempt_gradings (supersedes_id)
  where supersedes_id is not null;

comment on index public.attempt_gradings_one_successor_uniq is
  'Cada calificación puede ser sustituida como mucho una vez: sin esto la cadena '
  'se bifurca y el intento tendría dos notas vigentes.';
