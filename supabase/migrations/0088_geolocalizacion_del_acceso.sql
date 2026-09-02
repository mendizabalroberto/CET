-- =============================================================================
-- 0088_geolocalizacion_del_acceso.sql
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- =============================================================================
-- «DESDE DONDE SE CONECTO» — TODO LO QUE SE PUEDE SABER, Y NI UN METRO MAS
--
-- `accesos_de_alumno` guarda pais, region y ciudad desde 0078. El borde de
-- Vercel da TRES datos mas en cada peticion que se estaban tirando:
--
--     x-vercel-ip-latitude    x-vercel-ip-longitude    x-vercel-ip-timezone
--
-- POR QUE NO SE CONTRATA UN SERVICIO DE GEOLOCALIZACION
--
-- Porque no seria mas preciso. La geolocalizacion por IP -la de Vercel y la de
-- cualquier proveedor de pago- sale de las mismas bases de datos y llega al
-- mismo sitio: la CIUDAD. Las coordenadas que devuelve son el centroide de esa
-- ciudad, no la casa de nadie. Un servicio externo no compraria precision;
-- compraria mandarle la IP de un menor a un tercero, que es justo lo que este
-- proyecto lleva evitando desde 0078.
--
-- Dicho de otro modo: ya tienes el techo. Lo que faltaba era recogerlo.
--
-- QUE APORTA CADA UNO
--
-- `latitud`/`longitud` no son «la ciudad con mas decimales». Son lo que permite
-- medir DISTANCIA entre dos accesos, y esa es una pregunta que el nombre de la
-- ciudad no puede responder: «Santa Cruz» y «Santa Cruz» son iguales como
-- texto aunque uno sea de otra Santa Cruz en otro pais. La senal
-- `salto_de_pais` de 0078 se apoya hoy en el codigo de pais y por eso no ve un
-- salto de 900 km dentro del mismo pais.
--
-- `zona_horaria` es el dato mas util de los tres y el menos evidente: es la
-- zona REAL del aparato desde el que entra el alumno. `app.zona_horaria_alumno`
-- la deduce hoy por otros medios, y esto le da una fuente directa. Un niño
-- boliviano cuyos informes salgan en UTC deja de ser un misterio.
--
-- QUIEN VE QUE — LAS COORDENADAS NO SALEN AL NAVEGADOR
--
-- `latitud` y `longitud` quedan FUERA del grant de `authenticated`, con `ip`,
-- `ip_hash` y `user_agent`. No porque revelen mas que la ciudad -no lo hacen-
-- sino porque PARECEN revelarlo: unas coordenadas con seis decimales en una
-- pantalla se leen como la direccion de un niño, y quien las vea va a creerselas
-- con una precision que el dato no tiene. La ciudad dice la verdad sin
-- aparentar lo que no es.
--
-- `zona_horaria` SI entra en el grant: no localiza a nadie -media America
-- comparte zona- y es lo que permite pintar las horas de un informe en la hora
-- del niño en vez de en UTC.
-- =============================================================================

alter table public.accesos_de_alumno
  add column if not exists latitud      numeric(9, 6),
  add column if not exists longitud     numeric(9, 6),
  add column if not exists zona_horaria text;

comment on column public.accesos_de_alumno.latitud is
  'Latitud del centroide de la ciudad segun el borde de Vercel. NO es la posicion de nadie. Fuera del GRANT de authenticated: parece mas precisa de lo que es.';
comment on column public.accesos_de_alumno.longitud is
  'Longitud del centroide de la ciudad. Con la latitud permite medir distancia entre accesos, que el nombre de la ciudad no puede responder. Fuera del GRANT.';
comment on column public.accesos_de_alumno.zona_horaria is
  'Zona horaria IANA del aparato desde el que entro (x-vercel-ip-timezone). No localiza a nadie y sirve para pintar las horas en la del alumno.';

-- `numeric(9,6)`: seis decimales son ~11 cm, de sobra para un centroide de
-- ciudad, y el tipo exacto evita el redondeo binario de `double precision` —que
-- haria que dos accesos del mismo sitio no salieran iguales al compararlos.

-- -----------------------------------------------------------------------------
-- El grant, columna a columna
-- -----------------------------------------------------------------------------
-- `grant select (col)` es ADITIVO: no repone ni retira lo concedido en 0078, y
-- por eso aqui solo aparece la columna que se abre. Las dos que se quedan fuera
-- lo hacen por omision, que es como se quedan fuera las de 0078.
grant select (zona_horaria) on public.accesos_de_alumno to authenticated;
