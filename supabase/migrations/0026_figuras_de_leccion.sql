-- =============================================================================
-- 0026_figuras_de_leccion.sql — los apoyos visuales llegan a la lección
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
--
-- SIN APLICAR. Es contenido que ve un niño, así que lo aprueba una persona.
-- Validada contra producción dentro de una transacción revertida (la técnica
-- del `do $$ … raise exception $$` de VERIFICATION_PLAN): las seis filas pasan
-- el trigger de validación de `0006_content.sql` y la renumeración deja los
-- `ord` consecutivos y sin choques.
--
-- -----------------------------------------------------------------------------
-- POR QUÉ HACE FALTA ESTA MIGRACIÓN
-- -----------------------------------------------------------------------------
-- El código que dibuja las figuras entró sin que ninguna lección las pidiera:
--
--   select kind, count(*) from lesson_blocks group by 1;
--   -- example 18 · rule 14 · tip 6 · warning 6 · text 4 · steps 3 · table 1
--   -- CERO filas con kind = 'interactive'.
--
-- Es decir: se desplegaba, un niño abría una lección y veía exactamente lo
-- mismo que el día anterior. El encargo no estaba cumplido, estaba compilado.
--
-- -----------------------------------------------------------------------------
-- POR QUÉ UNA MIGRACIÓN Y NO EL PIPELINE DE CONTENIDO
-- -----------------------------------------------------------------------------
-- El contenido de estas lecciones nace en `packages/content`, que EXTRAE los
-- trainers de `Y6A/`. Ese camino no sirve aquí, por dos razones:
--
--   1. `Y6A/` es material del colegio y es de solo lectura. Las figuras no
--      están en el original: son un añadido pedagógico sobre él.
--   2. El extractor se define a sí mismo como «traducción directa» del HTML de
--      Y6A, y sus tests comprueban que extraer dos veces da lo mismo. Meter
--      contenido inventado ahí rompería su contrato y su idempotencia.
--
-- Una figura es contenido editorial, no una extracción. Por eso viaja como
-- migración de datos, que es como viaja el resto del contenido de esta base.
--
-- AVISO: si algún día se escribe un cargador que reimporte los packs sobre
-- `lesson_blocks`, tiene que preservar los bloques `interactive` o los borrará.
--
-- -----------------------------------------------------------------------------
-- DÓNDE SE COLOCA CADA FIGURA
-- -----------------------------------------------------------------------------
-- Cada una va INMEDIATAMENTE DESPUÉS del bloque de Y6A que ilustra, porque el
-- apoyo visual es redundante con el texto, no sustituto: primero se lee, luego
-- se ve lo mismo dicho por otra vía.
--
--   Comparing & simplifying fractions
--     ord 4  eg  «Which is bigger, 5/9 or 2/3?»      -> barras 5/9 vs 2/3
--     ord 6  warn «a bigger denominator does not…»    -> barras 1/2 vs 1/10
--   Multiplying & dividing by 10, 100 and 1,000
--     ord 3  eg  «0.086 × 1,000»                      -> tabla de valor posicional
--     ord 4  eg  «9.3 ÷ 100»                          -> tabla, con sus ceros
--   Metric unit conversions
--     ord 8  eg  «6.35 km → m»                        -> escalera de longitud
--     ord 9  eg  «950 g → kg»                         -> escalera de masa
-- =============================================================================

do $$
declare
  v_frac  uuid := 'c4f3bc7f-e465-5f62-a374-0b060f5ff05c';  -- Comparing & simplifying fractions
  v_diez  uuid := '882d2ac6-089a-507f-9da7-8034f080ff17';  -- × y ÷ por 10, 100 y 1.000
  v_metr  uuid := '142674d5-1e9e-5254-9b5c-744b999e0f62';  -- Metric unit conversions
  v_n     integer;
begin
  -- Idempotencia. Sin esta guarda, una segunda ejecución volvería a desplazar
  -- los `ord` y dejaría la lección con huecos.
  if exists (select 1 from public.lesson_blocks where kind = 'interactive') then
    raise notice '0026: ya hay bloques interactive; no se toca nada';
    return;
  end if;

  -- Las tres lecciones tienen que existir y estar como se midió. Si alguien
  -- cambió el contenido por debajo, esta migración pararía en vez de insertar
  -- una figura al lado del párrafo equivocado.
  select count(*) into v_n from public.lessons where id in (v_frac, v_diez, v_metr);
  if v_n <> 3 then
    raise exception '0026: esperaba 3 lecciones y encontré %', v_n;
  end if;

  -- ---------------------------------------------------------------------------
  -- Renumeración. Se aparca en el rango ALTO (+1000) y se vuelve a bajar.
  --
  -- `lesson_blocks_ord_uniq` es un UNIQUE no diferible, así que un
  -- `set ord = ord + 1` sobre varias filas puede chocar consigo mismo a mitad
  -- del UPDATE. Hay que apartarse a un rango libre y volver.
  --
  -- La primera versión se apartaba al rango NEGATIVO, y la prueba contra
  -- producción —dentro de una transacción que se revierte— la tumbó en el acto:
  --
  --   ERROR 23514: new row for relation "lesson_blocks" violates check
  --   constraint "lesson_blocks_ord_pos"
  --
  -- `0006_content.sql` declara `check (ord >= 1)`. El rango alto está libre
  -- porque la lección más larga tiene 11 bloques, y sigue siendo positivo.
  -- ---------------------------------------------------------------------------
  update public.lesson_blocks set ord = ord + 1000
   where lesson_id in (v_frac, v_diez, v_metr);

  update public.lesson_blocks
     set ord = (ord - 1000) + case when ord - 1000 >= 5 then 1 else 0 end
   where lesson_id = v_frac;

  update public.lesson_blocks
     set ord = (ord - 1000)
             + case when ord - 1000 >= 4 then 1 else 0 end
             + case when ord - 1000 >= 5 then 1 else 0 end
   where lesson_id = v_diez;

  update public.lesson_blocks
     set ord = (ord - 1000)
             + case when ord - 1000 >=  9 then 1 else 0 end
             + case when ord - 1000 >= 10 then 1 else 0 end
   where lesson_id = v_metr;

  -- ---------------------------------------------------------------------------
  -- Las seis figuras.
  --
  -- `content` es `{ component, props }`, que es lo que el trigger de `0006`
  -- exige para `kind = 'interactive'`. NO lleva `alt`: el texto accesible lo
  -- genera `figureAltText` a partir de estos mismos números, así que no hay dos
  -- fuentes que se puedan contradecir. Y no lleva SVG: el dibujo no viaja por
  -- la red, se calcula en la tableta.
  -- `school_id` no se rellena: lo denormaliza el trigger desde `lessons`.
  -- ---------------------------------------------------------------------------
  insert into public.lesson_blocks (id, lesson_id, ord, kind, content) values
    ('86be3020-142e-45b1-a462-8c06b989b6b0', v_frac, 5, 'interactive',
     '{"component":"fraction-bars","props":{"bars":[{"numerator":5,"denominator":9},{"numerator":2,"denominator":3}]}}'::jsonb),

    -- El `.warn` de Y6A dice «1/10 es mucho más pequeño que 1/2 — más trozos
    -- son trozos más pequeños». Es un hecho de TAMAÑO: dos barras del mismo
    -- largo lo enseñan de un vistazo y el párrafo no.
    ('0f91e1f0-954a-423e-8b0d-c4749ca9a679', v_frac, 8, 'interactive',
     '{"component":"fraction-bars","props":{"bars":[{"numerator":1,"denominator":2},{"numerator":1,"denominator":10}]}}'::jsonb),

    ('0a5463bc-5332-4139-a769-0c0b1877ac6f', v_diez, 4, 'interactive',
     '{"component":"place-value-shift","props":{"value":"0.086","factor":1000,"direction":"multiply"}}'::jsonb),

    -- «No pierdas ese cero»: 9,3 ÷ 100 = 0,093. Los ceros de posición aparecen
    -- solos en la tabla, que es justo lo que el ejemplo de al lado explica.
    ('2cb025d6-8502-4c96-aca7-0b0698be80e4', v_diez, 6, 'interactive',
     '{"component":"place-value-shift","props":{"value":"9.3","factor":100,"direction":"divide"}}'::jsonb),

    ('f9ec4fda-2795-4ef7-bb3e-9bc787793167', v_metr, 9, 'interactive',
     '{"component":"unit-chain","props":{"quantity":"length","from":"km","to":"m"}}'::jsonb),

    ('fea65511-d092-4540-9688-5d51ae28af5d', v_metr, 11, 'interactive',
     '{"component":"unit-chain","props":{"quantity":"mass","from":"g","to":"kg"}}'::jsonb);

  -- ---------------------------------------------------------------------------
  -- Comprobaciones finales, y lo que DELIBERADAMENTE no se comprueba aquí
  -- ---------------------------------------------------------------------------
  -- Sí se comprueba: que las seis filas siguen ahí, y que los `ord` de cada
  -- lección quedan consecutivos desde 1. Un hueco sería un bloque perdido.
  --
  -- NO se comprueba aquí que cada `props` sea RENDERIZABLE, y es una decisión,
  -- no un olvido. Quien define «renderizable» es `parseLessonFigure` de
  -- `packages/ui/src/learning/lesson-figure.ts`: qué unidades tiene cada
  -- escalera, qué factores se admiten, que el numerador no pase del
  -- denominador. Reescribir esas reglas en plpgsql crearía una SEGUNDA fuente
  -- de verdad para el mismo hecho, que es justo el fallo que este repositorio
  -- lleva todo el día encontrando —la escalera métrica duplicada entre el motor
  -- y la figura, y los comentarios que describían defensas inexistentes—. Una
  -- copia en SQL que se quedara atrás daría por bueno un bloque que el
  -- navegador descarta, que es exactamente el fallo que se pretende evitar.
  --
  -- La red es `packages/ui/__tests__/figura-de-leccion-habla.test.tsx`, que
  -- extrae de ESTE fichero cada `'{"component":…}'::jsonb` y lo pasa por el
  -- parser de verdad, exigiendo que ninguno devuelva null. Usa la autoridad en
  -- vez de repetirla, así que no puede desincronizarse. Corre en `pnpm verify`.
  select count(*) into v_n
    from public.lesson_blocks
   where lesson_id in (v_frac, v_diez, v_metr) and kind = 'interactive';
  if v_n <> 6 then
    raise exception '0026: esperaba 6 figuras insertadas y hay %', v_n;
  end if;

  select count(*) into v_n
    from (
      select lesson_id
        from public.lesson_blocks
       where lesson_id in (v_frac, v_diez, v_metr)
       group by lesson_id
      having max(ord) <> count(*) or min(ord) <> 1
    ) roto;
  if v_n <> 0 then
    raise exception '0026: la renumeración dejó % lección(es) con ord no consecutivos', v_n;
  end if;
end
$$;
