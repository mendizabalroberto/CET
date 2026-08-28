-- =============================================================================
-- 0050_titulos_pendientes_es.sql — los cinco titulos que quedaron sin traducir
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
--
-- Las migraciones 0040-0049 dejaron los 307 bloques de leccion al 100 % en
-- espanol, pero cinco TITULOS se quedaron fuera: cada lote traducia los titulos
-- de las lecciones que le tocaban y estos cayeron en la costura entre lotes.
--
-- Son cinco cadenas. Se traducen aqui a mano en vez de montar otro contrato:
-- delegar cinco titulos cuesta mas que escribirlos.
--
-- Criterios, los mismos que 0028 fijo para matematicas:
--   · Los emojis se conservan: son parte del titulo y ayudan a distinguir la
--     leccion de un vistazo.
--   · «Scratch» no se traduce: es el nombre del lenguaje.
--   · `&amp;` que une dos palabras pasa a «y».
--   · La numeracion de socials («4 · », «5 · ») se conserva tal cual.
--
-- Idempotente y aditiva: guarda `not (title ? 'es')` y `||` sobre el objeto
-- existente, asi que no puede perder el ingles ni pisar una correccion a mano.
-- =============================================================================

update public.lessons l
set title = l.title || jsonb_build_object('es', tr.es)
from public.course_modules m
join public.courses c on c.id = m.course_id
join public.subjects s on s.id = c.subject_id,
(values
  ('ict',     1, '🖥️ Elegir hardware y software'),
  ('ict',     2, '🐱 Scratch: predice el resultado y dibuja figuras'),
  ('ict',     3, '📡 Contenido digital y streaming'),
  ('socials', 4, '🌋 4 · ¿Cómo se forman las montañas?'),
  ('socials', 5, '🏙️ 5 · El crecimiento de las ciudades')
) as tr(materia, leccion_ord, es)
where l.module_id = m.id
  and s.code = tr.materia
  and s.school_id is null
  and c.school_id is null
  and c.year_level = 6
  and l.ord = tr.leccion_ord
  and not (l.title ? 'es');
