-- =============================================================================
-- calendario_2026.sql — Calendario escolar 2026 (global)
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- Fuente: docs/academico/Calendario Escolar 2026.pdf
--
-- NOTA: Y6 no tiene hito Cambridge en 2026. Para un alumno de Y6 el hito más
-- cercano son los exámenes finales del 13 de noviembre.
--
-- Idempotente: el índice único de 0092 permite `on conflict do nothing`.
-- =============================================================================

insert into public.calendario_eventos
  (school_id, gestion, desde, hasta, tipo, titulo, year_levels)
values
  (null, 2026, '2026-09-23', '2026-09-23', 'sin_clases',       'Jornada pedagógica',                null),
  (null, 2026, '2026-09-24', '2026-09-24', 'feriado',          'Aniversario de Santa Cruz',        null),
  (null, 2026, '2026-09-25', '2026-09-25', 'sin_clases',       'Jornada pedagógica',                null),
  (null, 2026, '2026-10-27', '2026-10-27', 'sin_clases',       '3.º Open House',                    null),
  (null, 2026, '2026-11-02', '2026-11-02', 'feriado',          'Día de Todos los Difuntos',         null),
  (null, 2026, '2026-11-13', '2026-11-20', 'examenes_finales', 'Exámenes finales — 3.er trimestre', null),
  (null, 2026, '2026-12-02', '2026-12-02', 'fin_trimestre',    'Awards Ceremony — 3.er trimestre',  null),
  (null, 2026, '2026-10-01', '2026-10-06', 'hito_cambridge',   'Cambridge KET — Y7',                '{7}'),
  (null, 2026, '2026-10-08', '2026-10-13', 'hito_cambridge',   'Cambridge PET — Y9',                '{9}'),
  (null, 2026, '2026-10-29', '2026-11-06', 'hito_cambridge',   'Cambridge Movers — Y4',             '{4}'),
  (null, 2026, '2026-11-09', '2026-11-12', 'hito_cambridge',   'Cambridge Flyers — Y5',             '{5}')
on conflict do nothing;

