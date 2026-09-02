-- =============================================================================
-- 0081_estimacion_que_nadie_midio.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- «UNOS 20 MIN» EN LAS 33 LECCIONES
--
--   select count(*), count(estimated_minutes), min(estimated_minutes),
--          max(estimated_minutes) from public.lessons;
--   -->  33 | 33 | 20 | 20
--
-- Minimo 20, maximo 20, en las treinta y tres. Eso no es una estimacion: es el
-- valor por defecto que alguien puso para rellenar la columna y que nadie llego
-- a sustituir. Y la aplicacion lo pintaba en dos sitios —la cabecera de la
-- leccion y la tarjeta del listado— como si fuera un dato.
--
-- POR QUE SE BORRA EN VEZ DE DEJAR DE PINTARLO
--
-- Dejar de pintarlo esconde el problema en la capa equivocada: la columna
-- seguiria diciendo «20» y el siguiente que la lea —un informe, una consulta a
-- mano, otra pantalla— se lo volveria a creer. El dato es el que esta mal, asi
-- que se arregla el dato. La interfaz ya trata `null` como «no lo sabemos» y no
-- pinta nada, sin tocar una linea.
--
-- Y no es un detalle de presentacion. Una leccion de repaso de tres bloques y
-- una de fracciones de veinte no duran lo mismo; decirle a un nino de once anos
-- que «son unos 20 min» y que acabe en seis le ensena que el numero miente, o
-- peor, que el va mal. Un hueco honesto es mejor que una cifra inventada.
--
-- DE DONDE SALDRA LA BUENA
--
-- Del evento `tiempo_en_pantalla` (0080), que desde el 01/09/2026 guarda el
-- tiempo ACTIVO real de cada visita. Cuando haya suficientes visitas, la
-- estimacion sera la MEDIANA medida y no la suposicion de nadie. Esa es la
-- razon por la que se prefirio no ensenar ningun tiempo esperado en pantalla
-- mientras tanto.
--
-- LA GUARDA
--
-- El `update` solo actua si TODAS las lecciones comparten el mismo valor, que
-- es la firma de un relleno automatico. El dia que alguien haya cargado
-- estimaciones de verdad —distintas entre si— esta migracion no toca nada,
-- aunque se reaplique.
-- =============================================================================

update public.lessons
   set estimated_minutes = null
 where estimated_minutes is not null
   and (select count(distinct estimated_minutes) from public.lessons) = 1;

comment on column public.lessons.estimated_minutes is
  'Minutos estimados de la leccion. NULL = todavia no se ha medido, y la interfaz no pinta nada. Se rellenara con la mediana real de `tiempo_en_pantalla` (0080), nunca a ojo: el relleno uniforme anterior -20 en las 33- se borro en 0081.';
