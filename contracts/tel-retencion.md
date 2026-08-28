---
id: tel-retencion
model: reasoner
territory: [supabase/migrations/0054_retencion_telemetria.sql, supabase/tests/retencion_telemetria.sql]
forbidden: [packages/ui/src/index.ts, packages/shared/src/index.ts, supabase/migrations/0010_telemetry.sql, supabase/migrations/0024_learning_events_ingest.sql]
context: [supabase/migrations/0010_telemetry.sql, supabase/migrations/0011_audit.sql, supabase/migrations/0024_learning_events_ingest.sql]
verify: node scripts/deepseek/validar-sql.mjs supabase/migrations/0054_retencion_telemetria.sql supabase/tests/retencion_telemetria.sql app.purgar_learning_events,app.estado_particiones_learning_events
rounds: 4
deadline: 4 rondas o 25 minutos
---

## 1 · El problema

`0010_telemetry.sql` dejo escrito el mecanismo de retencion y **no dejo a nadie
ejecutandolo**. `app.ensure_learning_events_partitions(n)` existe, esta
documentada como «pensada para un pg_cron diario», y no hay ni un `cron.schedule`
en todo el repositorio. Nada purga tampoco las particiones viejas.

Hasta ahora eso era una deuda tolerable. Deja de serlo hoy: la interfaz empieza a
emitir un evento por cada pulsacion de boton (`ui_interaction`, migracion 0051), y
el propio 0010 estima ya sin eso «del orden de 10^8 filas al año» para un colegio
de 800 alumnos. Son datos de conducta de menores, y guardarlos indefinidamente
porque nadie escribio el job no es una decision: es un descuido con consecuencias.

## 2 · La evidencia que ya tenemos

`0010_telemetry.sql`, literal, sobre por que la tabla esta particionada:

```
--   · el borrado por retención es un DROP TABLE instantáneo, no un DELETE que
--     bloquea la tabla durante horas y deja bloat;
```

y sobre la particion por defecto, que es la que se llena en silencio si el cron
no corre:

```
-- `ensure_learning_events_partitions` corriendo a diario mantiene el default
-- vacío en régimen normal.
```

La funcion que ya existe y que hay que PROGRAMAR, no reescribir:

```
create or replace function app.ensure_learning_events_partitions(p_months_ahead integer default 3)
returns setof text
```

Y el aviso de 0024, que este contrato no puede romper: las particiones NO llevan
privilegios para `authenticated`, y hay una comprobacion en tiempo de migracion
que aborta si alguien se los concede.

## 3 · El criterio de aceptacion

`supabase/migrations/0054_retencion_telemetria.sql` declara:

1. **`app.purgar_learning_events(p_meses integer default 24, p_dry boolean default true)`**
   — hace `drop table` de cada particion mensual de `public.learning_events`
   cuyo mes sea anterior a `p_meses` meses. Devuelve `setof text` con lo que
   hizo o haria.
   - **`p_dry` por defecto `true`, y no es cosmetico.** Una funcion cuyo valor
     por defecto BORRA es una funcion que alguien ejecuta sin argumentos «para
     ver que hace» y destruye dos años de telemetria. El borrado se pide a
     proposito.
   - **Nunca toca `learning_events_default`.** Esa particion recoge las filas que
     no encajan en ningun rango; borrarla por edad seria borrar filas del mes en
     curso. Si tiene filas, se REPORTA como anomalia, no se purga.
   - Refuerza el rango antes de borrar: una particion cuyo limite superior sea
     posterior a la frontera de retencion no se borra, aunque el nombre lo
     sugiera. El nombre no es la verdad; `pg_get_expr(relpartbound)` si.
2. **`app.estado_particiones_learning_events()`** — `returns table` con una fila
   por particion: nombre, rango, numero estimado de filas
   (`pg_class.reltuples`), tamaño en bytes (`pg_total_relation_size`) y si la
   particion tiene RLS activada. Es la consulta que responde «cuanto ocupa esto y
   se esta llenando el default», y hoy no existe.
3. **La programacion `pg_cron`**, envuelta en `do $$ ... $$` que no falle si la
   extension no esta instalada (una rama de Supabase puede no tenerla, y la
   migracion no puede abortar por eso):
   - `ensure_learning_events_partitions(3)` a diario;
   - `purgar_learning_events(24, false)` una vez al mes.
   Si ya existe un `cron.job` con ese nombre, se reemplaza; la migracion tiene que
   poder reaplicarse.
4. Las dos funciones `security definer`, con `set search_path = ''`, con
   `revoke all ... from public` y `grant execute ... to service_role`. **Ningun
   grant a `anon` ni a `authenticated`.** `purgar_learning_events` hace `DROP
   TABLE`: un `grant` de mas aqui es la unica linea del repositorio que permite a
   un navegador borrar el historial de un colegio.

`supabase/tests/retencion_telemetria.sql` es pgTAP (`begin; select plan(N); ...
select finish(); rollback;`) y debe:

- llamar a `app.estado_particiones_learning_events()` y comprobar que devuelve
  una fila por cada particion existente, y que **todas** declaran RLS activada
  (el invariante que 0010 se esfuerza en mantener y que nadie verifica);
- llamar a `app.purgar_learning_events(24, true)` y comprobar que **no borra
  nada** (cuenta de particiones antes y despues, iguales);
- comprobar que `learning_events_default` no aparece nunca en la lista de
  candidatas a purga, ni siquiera con `p_meses => 0`;
- comprobar que las particiones siguen sin privilegios para `authenticated` y
  `anon` despues de esta migracion (`has_table_privilege`), que es la garantia
  que 0024 dejo escrita;
- comprobar el aislamiento: un `teacher` no puede ejecutar ninguna de las dos
  funciones (`throws_ok` con `insufficient_privilege`).

**`plan(N)` debe cuadrar exactamente con el numero de asserts.**

## 4 · Que NO cuenta como resuelto

- `p_dry` con valor por defecto `false`.
- Un `purgar` que borre por el NOMBRE de la particion sin comprobar su rango
  real. El nombre lo pone una funcion; el rango lo garantiza Postgres.
- Purgar `learning_events_default`.
- Un `delete from learning_events` en vez de `drop table` de la particion. El
  validador lo rechaza, y 0010 explica por que: bloquea la tabla durante horas y
  deja bloat.
- Reescribir `app.ensure_learning_events_partitions`. Ya funciona; lo que falta
  es programarla. Esta en `forbidden` el fichero que la define.
- Un `cron.schedule` fuera del `do $$` de guarda: la migracion fallaria entera en
  cualquier entorno sin `pg_cron`.
- Cualquier `grant` que alcance a `anon` o a `authenticated`.
- `plan(N)` que no cuadra con los asserts.
