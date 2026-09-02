# Planes de estudio a partir del boletín — diseño

Fecha: 2026-09-02 · Autor: Roberto Mendizabal (con Claude) · Estado: propuesto

## 1 · Problema

La app mide muy bien y no dirige nada. Sabe cuántos minutos estudió un niño
(`informe_alumno_serie_diaria`), en qué lección los gastó
(`informe_alumno_tiempo_por_leccion`), cuántos ítems acertó
(`informe_alumno_logro_diario`) y su mastery por skill
(`informe_alumno_skills`). Lo que nadie le dice al niño es **qué estudiar hoy y
cuánto**. El alumno entra a `/learn`, elige una materia por intuición, y el
tutor recibe una foto de lo que pasó sin un patrón contra el que compararla.

La información que falta ya existe fuera del sistema: el **boletín** dice dónde
flojea, el **calendario escolar** dice cuánto tiempo queda hasta qué. Ninguno de
los dos entra hoy a la plataforma.

Este trabajo cierra el circuito: el tutor sube el boletín, un agente propone un
plan apoyado en los cursos que realmente existen, el niño ve su día, y un parte
nocturno le dice al tutor si lo planificado ocurrió.

## 2 · Alcance, y lo que se deja fuera a propósito

Se construye:

1. Subida del boletín en PDF por el tutor y extracción de las notas, con
   confirmación humana antes de que el dato valga.
2. Generación del plan: reparto de minutos por materia y recomendaciones.
3. Vista `/learn/hoy` para el alumno.
4. Parte nocturno al tutor por Telegram.

**No** se construye, y se deja escrito para que nadie lo dé por supuesto:

- **Materias sin contenido.** El boletín de Y6 trae once materias; la plataforma
  cubre seis. Art, Music, Physical Education y Religion **no entran en el plan**.
  Decisión del propietario el 2026-09-02: solo se planifica lo que el sistema
  puede verificar por telemetría, sin una sola tarea autodeclarada. COML es un
  área compensada (Spanish + English), derivada, y tampoco es una fila del plan.
- **Base de evidencia pedagógica citable.** Las recomendaciones son texto del
  agente, sin `span_id` que las respalde. Es la excepción explícita a la regla
  del corpus (`verifyCandidate`), y se acepta porque son consejo para un adulto,
  no un dato que el sistema presenta como medido. Ver §9.
- **Ingesta genérica de calendarios.** Las fechas de 2026 entran como seed.
- **Versionado inmutable de planes.** Un plan activo por alumno; regenerar
  reemplaza.
- **Reajuste automático diario.** El parte informa la brecha; no mueve minutos.

## 3 · Lo que hay debajo, verificado contra la base

Consultado en `clcutoqjdgeggvgyreud` el 2026-09-02, no leído de los docs:

| Materia | Skills | Lecciones pub. | Bloques | Preguntas pub. |
|---|---|---|---|---|
| english | 7 | 5 | 61 | 86 |
| ict | 9 | 6 | 101 | 172 |
| math | 23 | 8 | 58 | **16** |
| science | 7 | 5 | 48 | 78 |
| socials | 9 | 6 | 79 | 165 |
| spanish | 5 | 3 | 39 | 93 |

Tres hechos que condicionan el diseño:

- **`estimated_minutes = 0` en las 33 lecciones.** No hay ni un minuto declarado
  en el catálogo. Se resuelve en §5.
- **Math tiene el catálogo de skills más grande (23) y la munición más pobre
  (16 preguntas).** Un plan que reparta por nota va a querer darle mucho a Math
  y no va a poder. El repartidor tiene que toparlo y el agente tiene que decirlo.
- **`skill_mastery` tiene 2 filas y hay 408 `learning_events` en toda la base.**
  El primer plan sale del boletín, no del mastery. Cuando haya historial, entra
  como señal; hoy sería un número inventado con cara de dato.

## 4 · Las tablas

Migración `0091_plan_de_estudio.sql`. `school_id` y RLS desde la primera línea,
como manda AD-1.

```sql
create type public.boletin_estado as enum ('extraido', 'confirmado');

create table public.boletines (
  id            uuid primary key default extensions.gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  subido_por    uuid not null references public.profiles(id) on delete restrict,
  gestion       integer not null check (gestion between 2020 and 2100),
  trimestre     smallint check (trimestre between 1 and 3),
  storage_path  text not null,
  checksum      text not null check (checksum ~ '^[0-9a-f]{64}$'),
  notas         jsonb not null default '[]'::jsonb,
  estado        public.boletin_estado not null default 'extraido',
  modelo        text,
  tokens_in     integer,
  tokens_out    integer,
  created_at    timestamptz not null default now(),
  confirmado_at timestamptz,

  constraint boletines_notas_es_lista check (jsonb_typeof(notas) = 'array'),
  constraint boletines_confirmado_coherente
    check ((estado = 'confirmado') = (confirmado_at is not null))
);

-- Un mismo PDF no entra dos veces para el mismo alumno.
create unique index boletines_unicos on public.boletines (student_id, checksum);
```

`notas` es una lista de objetos con esta forma, validada con Zod en el server
action antes de escribir:

```json
[{ "materia": "English", "subject_id": "…uuid o null", "nota": 64, "banda": "needs_improvement" }]
```

Va en `jsonb` y no en tabla aparte porque nunca se consulta por nota suelta: se
lee el boletín entero o no se lee. `subject_id` es nullable — *Art* no mapea a
nada y esa fila existe igual, para que el tutor vea que se leyó y por qué no se
planifica.

```sql
create table public.planes_de_estudio (
  id               uuid primary key default extensions.gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_id       uuid not null references public.profiles(id) on delete cascade,
  boletin_id       uuid not null references public.boletines(id) on delete cascade,
  desde            date not null,
  hasta            date not null,
  minutos_por_dia  smallint not null check (minutos_por_dia between 10 and 180),
  reparto          jsonb not null,
  recomendaciones  text[] not null default '{}',
  activo           boolean not null default true,
  modelo           text,
  tokens_in        integer,
  tokens_out       integer,
  creado_por       uuid not null references public.profiles(id) on delete restrict,
  created_at       timestamptz not null default now(),

  constraint planes_ventana check (hasta > desde),
  constraint planes_recomendaciones_acotadas
    check (array_length(recomendaciones, 1) is null
           or array_length(recomendaciones, 1) <= 6)
);

-- Un solo plan activo por alumno. Regenerar desactiva el anterior.
create unique index planes_uno_activo on public.planes_de_estudio (student_id)
  where activo;

create type public.tarea_tipo as enum ('leccion', 'practica');

create table public.plan_tareas (
  id          uuid primary key default extensions.gen_random_uuid(),
  plan_id     uuid not null references public.planes_de_estudio(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  fecha       date not null,
  ord         smallint not null check (ord >= 0),
  subject_id  uuid not null references public.subjects(id) on delete restrict,
  tipo        public.tarea_tipo not null,
  lesson_id   uuid references public.lessons(id) on delete cascade,
  skill_id    uuid references public.skills(id) on delete cascade,
  minutos     smallint not null check (minutos between 5 and 90),

  constraint tarea_apunta_a_algo check (
    (tipo = 'leccion'  and lesson_id is not null and skill_id is null) or
    (tipo = 'practica' and skill_id  is not null and lesson_id is null))
);

create unique index plan_tareas_orden on public.plan_tareas (plan_id, fecha, ord);
create index plan_tareas_dia on public.plan_tareas (student_id, fecha);

create table public.plan_partes (
  id                 uuid primary key default extensions.gen_random_uuid(),
  plan_id            uuid not null references public.planes_de_estudio(id) on delete cascade,
  student_id         uuid not null references public.profiles(id) on delete cascade,
  fecha              date not null,
  minutos_previstos  smallint not null,
  minutos_medidos    numeric(6,1) not null,
  items_respondidos  integer not null default 0,
  aciertos           integer not null default 0,
  enviado_at         timestamptz,
  created_at         timestamptz not null default now()
);

create unique index plan_partes_un_parte_por_dia on public.plan_partes (plan_id, fecha);
```

`plan_partes` existe **solo** para que el cron no mande el mismo aviso dos veces;
el índice único es la garantía, no la vigilancia del código que lo llama.

### RLS

La regla de §2 del acuerdo: *el boletín es de la familia, no del colegio*.

- `boletines`, `planes_de_estudio`, `plan_partes`: `select`/`insert` al tutor
  vinculado vía `guardian_students` con `revoked_at is null`. **El staff del
  colegio no aparece en ninguna política de estas tres tablas** — ni siquiera el
  admin del colegio. Es un dato que la familia entregó a la plataforma, no al
  colegio.
- `plan_tareas`: el tutor ve las de su hijo; **el alumno ve las suyas**
  (`student_id = auth.uid()`), sin restricción de fecha en la política. Que solo
  vea hoy es una decisión de producto y vive en la query de la pantalla, no en
  RLS: una política que filtra por `current_date` rompería el parte nocturno,
  que corre después de medianoche.
- Escritura de `plan_tareas` y `plan_partes`: nadie desde el navegador. Las
  produce el repartidor y el cron con la clave de servicio.

### Storage

Bucket nuevo **`boletines`**, privado, 10 MB de tope, `application/pdf`
únicamente. No se reutiliza `source-material` (0030): aquel es material
curricular que sube el staff, éste es documentación privada de un menor subida
por su familia, y mezclar los dos obliga a que una sola política de storage
tenga que distinguir dos mundos.

Ruta: `boletines/{student_id}/{checksum}.pdf`. El checksum como nombre hace que
el mismo PDF subido dos veces sea un solo objeto, igual que en
`source_documents`.

## 5 · Los minutos que no existen

Las 33 lecciones tienen `estimated_minutes = 0`. Sin un número ahí, el
repartidor no tiene contra qué presupuestar.

Se rellena en la misma migración, derivándolo del número de bloques:

```sql
update public.lessons l
set estimated_minutes = greatest(10, round(
      (select count(*) from public.lesson_blocks b where b.lesson_id = l.id) * 1.5))
where estimated_minutes = 0;
```

Da: math ≈ 12 min, science ≈ 15, spanish ≈ 20, socials ≈ 21, english ≈ 22,
ict ≈ 35.

**Es una aproximación y hay que decirlo.** Un bloque de texto y un bloque
interactivo no cuestan lo mismo, y el factor 1,5 no está medido: está elegido
para que los números caigan en un rango creíble para un niño de 10–11 años. Se
escribe a la columna en vez de calcularse al vuelo justamente para que sea
inspeccionable y un profesor pueda corregir una lección concreta sin tocar
código. Cuando haya historial real, `informe_alumno_tiempo_por_leccion` da la
mediana observada y esta estimación se sustituye por medición.

## 6 · Las fechas del colegio

Seed `supabase/seed/calendario_2026.sql`, extraído del PDF oficial que el
propietario aportó en `docs/academico/`. Tabla mínima:

```sql
create type public.evento_escolar as enum (
  'feriado', 'sin_clases', 'examenes_finales', 'vacaciones',
  'fin_trimestre', 'hito_cambridge');

create table public.calendario_eventos (
  id           uuid primary key default extensions.gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  gestion      integer not null,
  desde        date not null,
  hasta        date not null,
  tipo         public.evento_escolar not null,
  titulo       text not null,
  year_levels  smallint[],          -- NULL = aplica a todos
  constraint calendario_rango check (hasta >= desde)
);
```

Lo que va en el seed para 2026, de septiembre en adelante (lo anterior ya pasó y
solo interesa como historia):

| Desde | Hasta | Tipo | Título |
|---|---|---|---|
| 09-23 | 09-23 | `sin_clases` | Jornada pedagógica |
| 09-24 | 09-24 | `feriado` | Aniversario de Santa Cruz |
| 09-25 | 09-25 | `sin_clases` | Jornada pedagógica |
| 10-27 | 10-27 | `sin_clases` | 3.º Open House |
| 11-02 | 11-02 | `feriado` | Día de Todos los Difuntos |
| 11-13 | 11-20 | `examenes_finales` | Exámenes finales — 3.er trimestre |
| 12-02 | 12-02 | `fin_trimestre` | Awards Ceremony — 3.er trimestre |

Más los `hito_cambridge` con su `year_levels`: Y5 Flyers 11-09→11-12, Y4 Movers
10-29→11-06, Y7 KET 10-01→10-06, Y9 PET 10-08→10-13, Y12/Y13 FCE/CAE/CPE en
octubre. **Y6 no tiene examen Cambridge en 2026**: para LEO, el hito más cercano
son los finales del 13 de noviembre — 72 días desde hoy, unas 10 semanas y
media. Ese es el `hasta` del plan.

## 7 · El camino del tutor

Pantalla nueva en `/tutor/hijos/[id]`, debajo de lo que ya hay.

**Paso 1 — Subir.** Un `input[type=file]` acotado a PDF. Server action:
calcula el sha256, sube a Storage, y extrae el texto con `pdfToSpans` de
`@cet/content`.

Si el PDF es un escaneo sin capa de texto, `pdfToSpans` lanza `PdfSinTextoError`
y **ahí se para**: el tutor ve *«Este PDF es una imagen escaneada y no puedo
leerlo. Sube el PDF original del colegio.»* No hay fallback de visión en esta
fase — DeepSeek no ve imágenes (HANDOFF-DEEPSEEK §0.2) y añadir un modelo de
visión aquí duplicaría el alcance. El boletín de LEO se leyó limpio con las once
materias, así que el camino normal funciona.

**Paso 2 — Extraer.** Una llamada a `deepseek-chat` con el texto plano y un
esquema de salida estricto: `{gestion, trimestre, notas: [{materia, nota}]}`.
Sin cita literal (§9), pero con dos puertas duras antes de escribir:

- Zod valida la forma; cualquier `nota` fuera de 0–100 tumba la extracción entera.
- **Toda `materia` devuelta debe aparecer literalmente en el texto del PDF.**
  Si el modelo inventa una materia que no está impresa, se rechaza la extracción
  completa. Es lo que queda de la regla del corpus, y es barato: un `includes`.

El mapeo materia→`subject_id` lo hace **código, no la IA**: una tabla de
sinónimos (`{english, inglés} → english`, `{math, mathematics, matemáticas} →
math`, …). Lo que no mapea queda con `subject_id = null`.

**Paso 3 — Confirmar.** El tutor ve la tabla extraída, con las filas sin
`subject_id` marcadas como *«no se planifica: la app no cubre esta materia»*.
Puede corregir cualquier nota a mano. Al confirmar, `estado = 'confirmado'`.
**Hasta ese momento el boletín no puede generar un plan** — es un `check` en el
server action y una condición en la query, no una convención.

**Paso 4 — Generar plan.** Botón. Ver §8.

## 8 · Cómo se arma el plan

Dos mitades con una frontera nítida: la IA decide **cuánto a cada materia**, el
código decide **qué día y qué tarea**.

### 8.1 · El estratega (DeepSeek, una llamada)

Recibe, todo estructurado, nada de prosa libre:

- Las notas confirmadas con su banda, y las materias que no se planifican.
- Los seis cursos con su inventario real: lecciones publicadas, minutos
  estimados totales, preguntas publicadas por skill.
- La ventana (hoy → hito más cercano) y qué es ese hito.
- Los minutos/día observados de las últimas 4 semanas
  (`informe_alumno_serie_diaria`), o `null` si no hay historial.

Devuelve, con esquema Zod estricto:

```json
{
  "minutos_por_dia": 45,
  "reparto": { "english": 0.35, "math": 0.25, "spanish": 0.2, "science": 0.1, "socials": 0.1 },
  "recomendaciones": ["…", "…", "…"]
}
```

`reparto` son pesos que suman 1. Si no suman 1 ± 0,01, se normalizan en código
antes de escribir; si alguna clave no es una materia con contenido, se descarta
esa clave y se renormaliza. El modelo no puede meter una materia que no existe
en el plan por mucho que insista.

`minutos_por_dia` es una **propuesta**. El tutor la ve y la confirma o la cambia
antes de que el repartidor corra: es el compromiso de la familia, y quien lo
firma es el adulto. Esta es la decisión del propietario del 2026-09-02 —
la IA propone el presupuesto en vez de que lo teclee el tutor a ciegas, porque
con 408 eventos en la base no hay historial que sostenga una inferencia sola;
la propuesta se apoya en el caso (notas, hito, inventario) y el adulto la valida.

Clave: `DEEP_SEEK_API` desde `secrets/accounts.env`, con `apiKey()` de
`scripts/corpus/propose.ts` — la que lleva guion bajo y no aparece en un grep de
`DEEPSEEK`. Tokens y modelo se guardan en la fila, como ya se hace en el corpus.

### 8.2 · El repartidor (`@cet/engine`, determinista, sin red)

Función pura `repartir(entrada): Tarea[]`. Se testea con Vitest sin gastar un
token. Reglas, en orden:

1. **Días hábiles.** Se descartan del rango los `feriado` y `sin_clases` del
   calendario. Sábado y domingo cuentan a la mitad del presupuesto.
2. **Intensidad por época.** `examenes_finales` ×1,5; `vacaciones` ×0,4; resto
   ×1. Se aplica sobre `minutos_por_dia`.
3. **Techo de munición.** Por materia, los minutos totales que se pueden
   planificar en la ventana no superan
   `Σ estimated_minutes de lecciones no completadas + preguntas_publicadas × 0,75 min`.
   Lo que sobra por el techo se redistribuye entre las demás materias
   proporcionalmente a su peso.
   **Math es el caso que esto existe para atajar:** con 16 preguntas y 8
   lecciones (≈96 min), su techo ronda las 2 horas para toda la ventana. Un
   reparto del 25 % sobre 45 min/día × 10 semanas pediría unas 13 horas. El
   repartidor topa Math y devuelve el sobrante al resto.
4. **Forma de la sesión.** Máximo 2 materias por día y ningún bloque de más de
   25 minutos; si el presupuesto del día da para más, se parte en dos bloques.
   Las materias se intercalan entre días en vez de agotar una y pasar a la
   siguiente.
5. **Qué tarea concreta.** Primero las lecciones publicadas no completadas de esa
   materia, en orden de módulo; agotadas, práctica sobre las skills con menor
   mastery (o, sin mastery, en orden de `skills.ord`).

**Cuando un techo se activa, el repartidor lo devuelve** en su salida, y la
pantalla del tutor lo muestra junto a las recomendaciones: *«Math: solo hay
material para ~2 h en toda la ventana; el resto del tiempo se repartió a
English y Spanish.»* Que el sistema diga en voz alta dónde se le acabó el
contenido es más útil que fingir que hay material — y es la vía por la que el
propio producto señala qué contenido falta escribir.

## 9 · Las recomendaciones no llevan cita, y por qué

El corpus rechaza un candidato entero si su cita no aparece carácter a carácter
en el original. Las recomendaciones de §8.1 **no** pasan por esa puerta: son
texto generado sin fuente verificable.

Se acepta con tres límites, y conviene tenerlos escritos:

- Van dirigidas a un **adulto**, en la pantalla del tutor, y nunca al niño.
- Como máximo seis (constraint en la tabla), y la UI las presenta como
  *sugerencias del asistente*, no como hallazgos del sistema.
- **Ningún número medido sale de ahí.** Los minutos, el reparto y la brecha son
  aritmética del repartidor y de las RPC. Una recomendación puede decir *«conviene
  partir la sesión en dos»*; no puede decir *«tu hijo estudió 12 minutos»*.

Si más adelante se quiere que las recomendaciones sean defendibles, el camino ya
está dibujado: fichas de evidencia ingeridas como corpus y citadas con `span_id`.
Se dejó fuera de esta fase a propósito.

## 10 · El día del alumno

Ruta nueva `/learn/hoy`, Server Component.

```sql
select * from public.plan_tareas
where student_id = auth.uid() and fecha = current_date
order by ord;
```

Cada tarea es una tarjeta con la materia, los minutos y un enlace directo a
`/learn/[lessonId]` o `/practice/[skillCode]`. Reutiliza los componentes de
tarjeta y el sistema de color por materia que ya existen.

**El niño no ve la brecha, ni la tendencia, ni cuánto lleva atrasado.**
Decisión del propietario del 2026-09-02. Si no hay plan activo, la pantalla dice
que aún no hay uno y no inventa tareas. Si el día es feriado o no tiene tareas,
lo dice y no muestra una lista vacía.

## 11 · El parte nocturno

Ruta `/api/plan/parte-diario`, protegida por `CRON_SECRET`, disparada por un
cron de Vercel a las 21:00 hora de Bolivia (`0 1 * * *` UTC), declarado en
`apps/web/vercel.json` — hoy ese fichero solo tiene cabeceras HSTS y no declara
ningún cron.

Por cada plan activo:

1. `minutos_previstos` = suma de `plan_tareas` de hoy.
2. `minutos_medidos` = `informe_alumno_serie_diaria(student_id, hoy, hoy)`.
3. `items_respondidos` y `aciertos` = `informe_alumno_logro_diario(...)`.
4. Inserta en `plan_partes`. **Si el índice único de `(plan_id, fecha)` rechaza
   el insert, el parte ya se mandó y la iteración termina ahí** — la idempotencia
   la da la base, no un `if`.
5. Manda el mensaje con `enviarMensaje()` de `apps/web/src/lib/telegram/bot.ts`
   al chat vinculado en `telegram_de_tutor`, y sella `enviado_at`.

El texto, corto y sin adjetivos:

> **Leo — miércoles 2 de septiembre**
> Previsto 45 min · estudiado **12 min**
> 8 ítems, 5 aciertos
> Pendiente de hoy: English (25 min)

Si `telegram_de_tutor` no tiene chat vinculado, el parte se escribe igual en
`plan_partes` y se ve en el panel del tutor; Telegram es un canal, no la fuente.

## 12 · Pruebas

- **Vitest, `@cet/engine`:** el repartidor. Los casos que importan — feriado
  descartado, ×1,5 en semana de finales, techo de munición de Math activándose y
  redistribuyendo, bloque partido en dos a los 25 min, y la ventana entera de
  LEO (2026-09-02 → 11-13) sumando exactamente el presupuesto.
- **Vitest, extracción:** el texto real del boletín de LEO como fixture; una
  materia inventada por el modelo tumba la extracción; nota 105 la tumba;
  el mapeo de sinónimos.
- **pgTAP:** el staff del colegio **no** puede leer `boletines` de un alumno; un
  tutor no lee el boletín de un niño ajeno; un alumno lee sus `plan_tareas` y no
  las de otro; el índice de un solo plan activo; la idempotencia de `plan_partes`.
- **Playwright:** subir PDF → confirmar notas → generar plan → el alumno ve
  `/learn/hoy` con tareas. Con la llamada a DeepSeek mockeada.

## 13 · Criterios de finalización

1. Un tutor sube el boletín de LEO y ve las once materias extraídas, con Art,
   Music, PE y Religion marcadas como no planificables.
2. Corrige una nota, confirma, genera plan, y ajusta los minutos/día propuestos.
3. El plan cubre del 2026-09-02 al 11-13, salta el 24 de septiembre y el 2 de
   noviembre, y sube la intensidad del 13 al 20 de noviembre.
4. El aviso del techo de Math aparece en la pantalla del tutor.
5. LEO entra a `/learn/hoy` y ve sus tareas del día, sin brecha ni tendencia.
6. El cron escribe el parte, lo manda por Telegram, y correrlo dos veces el
   mismo día no manda dos mensajes.
7. Verde: typecheck, lint, Vitest, pgTAP, Playwright.

## 14 · Riesgos

| Riesgo | Mitigación |
|---|---|
| El PDF del boletín de otro colegio tiene otra forma y la extracción falla | La confirmación humana del paso 3 es la red. El tutor corrige a mano y el plan sale igual |
| Math se queda sin material y el plan pierde credibilidad | El techo lo hace explícito en pantalla en vez de esconderlo. Es también la señal de qué contenido escribir |
| `estimated_minutes` derivado de bloques es impreciso | Escrito a columna, corregible por lección sin tocar código; se sustituye por la mediana observada cuando haya historial |
| DeepSeek cae o devuelve JSON inválido | Sin plan y mensaje claro; el boletín confirmado queda guardado y se puede reintentar |
| El parte nocturno se vuelve ruido diario para el tutor | Fuera de alcance ahora; el candidato natural es un resumen semanal o avisar solo cuando la brecha pasa un umbral |
