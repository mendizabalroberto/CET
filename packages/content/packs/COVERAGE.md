# COBERTURA DE EXTRACCIÓN — Y6A → content packs

> Generado por `@cet/content`. **No editar a mano**: se reescribe en cada ejecución.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.

Este informe existe para decir lo que **no** se extrajo. Un pipeline que solo
presume de lo que consiguió es un pipeline en el que no se puede confiar.

## Resumen

| Materia | Idioma | Lecciones | Bloques | Preguntas | Generadas | Blueprints | Ítems | Plan | Skills |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **math** | `en` | 8 | 56 | 0 | 9 | 1 | 20 | 5 días | 14 |
| **science** | `en` | 5 | 52 | 68 | 0 | 1 | 20 | 5 días | 7 |
| **english** | `en` | 5 | 63 | 85 | 0 | 1 | 25 | 5 días | 7 |
| **spanish** | `es` | 3 | 42 | 82 | 0 | 1 | 20 | 5 días | 5 |
| **socials** | `en` | 6 | 83 | 139 | 0 | 1 | 30 | 6 días | 9 |
| **ict** | `en` | 6 | 105 | 79 | 0 | 1 | 25 | 5 días | 9 |
| **TOTAL** | | 33 | 401 | 453 | 9 | 6 | 140 | | 51 |

## Detalle por materia

### 📐 math — `Y6A/Math/Grade 5 Maths Exam Trainer.html`

**Bloques por tipo**

| kind | n |
|---|---:|
| `example` | 18 |
| `rule` | 15 |
| `steps` | 3 |
| `table` | 1 |
| `text` | 6 |
| `tip` | 7 |
| `warning` | 6 |

**Preguntas por skill**

| skill | n |
|---|---:|
| `math.decimals.multiply_divide` | 1 |
| `math.decimals.powers_of_ten` | 1 |
| `math.fractions.compare` | 1 |
| `math.fractions.mixed` | 1 |
| `math.fractions.operations` | 1 |
| `math.fractions.simplify` | 1 |
| `math.geometry.compound_shapes` | 1 |
| `math.measurement.metric` | 1 |
| `math.problem_solving.word` | 1 |

**Blueprints**

- `math.y6.mock` — 13 secciones, 20 ítems, 25 min

**No extraído, y por qué**

- **Shape Lab** (`makeShape / shapeSVG / LAB`) — figura SVG generada en tiempo de ejecución con lados ocultos. No es contenido estático: se reimplementa como generador `math.shape` en @cet/engine, que emite `renderedBody.figureSvg`.
- **lógica de los generadores** (`GEN.*`) — el cuerpo de cada generador es código (aritmética de fracciones, tolerancias de comparación). Se declara el contrato `engine_key` y lo implementa @cet/engine; duplicarlo aquí garantizaría que las dos copias divergieran.
- **pistas y soluciones de los generadores** (`GEN.*.hint / GEN.*.sol`) — se construyen con interpolación sobre los valores sorteados, así que no existen como texto hasta que hay una instancia. Las produce el generador junto con el enunciado.
- **campos sin equivalente en el material original** — los trainers Y6A no declaran dificultad, duración estimada, umbral de aprobado ni número de intentos. El pipeline los rellena con valores por defecto uniformes (difficulty 2 en banco / 3 en generadas, estimatedMinutes 20, passThreshold 0.6, maxAttempts sin límite, pointsPerItem 1) que un profesor debe revisar antes de publicar el curso. NO son datos extraídos.

### 🔬 science — `Y6A/Science/Grade 5 Science Exam Trainer.html`

**Bloques por tipo**

| kind | n |
|---|---:|
| `rule` | 6 |
| `steps` | 3 |
| `table` | 7 |
| `text` | 17 |
| `tip` | 14 |
| `warning` | 5 |

**Preguntas por skill**

| skill | n |
|---|---:|
| `science.electricity.circuits` | 15 |
| `science.electricity.conductors` | 13 |
| `science.electricity.symbols` | 14 |
| `science.environment.acid_rain` | 13 |
| `science.environment.recycling` | 13 |

**Blueprints**

- `science.y6.mock` — 5 secciones, 20 ítems, sin límite de tiempo

**No extraído, y por qué**

- **símbolos de circuito dentro de las lecciones** (`sym()`) — 7 símbolos SVG (battery, bulb, cell, motor, switchClosed, switchOpen, wire) sustituidos por un marcador de texto `[circuit symbol: …]`. El SVG original usa atributos que la allowlist del saneador elimina; los repone @cet/ui con un componente propio.
- **Circuit Lab** (`PARTS / SLOTNAMES / MISSIONS`) — simulador de circuitos con SVG y estado (ranuras, interruptor abierto/cerrado, misiones). Es una actividad interactiva, no contenido: necesita un componente propio en @cet/ui + un generador de misiones.
- **juegos** (`PAIRS / THINGS`) — listas de parejas y de objetos que alimentan mini-juegos de emparejar y clasificar. Son datos aprovechables, pero su formato de pregunta (`matching`, `drag_drop`) no está cubierto por este pipeline todavía.
- **campos sin equivalente en el material original** — los trainers Y6A no declaran dificultad, duración estimada, umbral de aprobado ni número de intentos. El pipeline los rellena con valores por defecto uniformes (difficulty 2 en banco / 3 en generadas, estimatedMinutes 20, passThreshold 0.6, maxAttempts sin límite, pointsPerItem 1) que un profesor debe revisar antes de publicar el curso. NO son datos extraídos.

### 🔤 english — `Y6A/English/Year 6 English Exam Trainer.html`

**Bloques por tipo**

| kind | n |
|---|---:|
| `rule` | 6 |
| `table` | 17 |
| `text` | 27 |
| `tip` | 10 |
| `warning` | 3 |

**Preguntas por skill**

| skill | n |
|---|---:|
| `english.grammar.indefinite_pronouns` | 20 |
| `english.grammar.present_simple` | 35 |
| `english.vocabulary.collocations` | 15 |
| `english.vocabulary.topics` | 15 |

**Blueprints**

- `english.y6.mock` — 4 secciones, 25 ítems, 20 min

**No extraído, y por qué**

- **los 7 mini-juegos** (`SVERBS / DOQ / IPWORDS / IPQ / CPAIRS / ORD / MIS / QB`) — cada juego trae su propio banco con un formato distinto (conjugar, ordenar palabras, cazar el error, construir preguntas). Son formatos `ordering`, `cloze` y `matching` que este pipeline aún no emite; extraerlos como mcq falsearía la actividad.
- **Writing Lab y tarjetas de speaking** (`WL / TOM / RC / WT / SPK / PDG / VCATS / VWORDS`) — el corrector de escritura es heurístico (cuenta conectores, longitud, mayúsculas) y las tarjetas de speaking se evalúan en voz alta. Ambos exigen `grading_mode: manual` y una UI propia.
- **campos sin equivalente en el material original** — los trainers Y6A no declaran dificultad, duración estimada, umbral de aprobado ni número de intentos. El pipeline los rellena con valores por defecto uniformes (difficulty 2 en banco / 3 en generadas, estimatedMinutes 20, passThreshold 0.6, maxAttempts sin límite, pointsPerItem 1) que un profesor debe revisar antes de publicar el curso. NO son datos extraídos.

### 🇪🇸 spanish — `Y6A/Español/Entrenador de Examen - Español Y6.html`

**Bloques por tipo**

| kind | n |
|---|---:|
| `rule` | 5 |
| `table` | 8 |
| `text` | 18 |
| `tip` | 8 |
| `warning` | 3 |

**Preguntas por skill**

| skill | n |
|---|---:|
| `spanish.ortografia.diptongo_hiato` | 26 |
| `spanish.ortografia.tilde_diacritica` | 30 |
| `spanish.verbos.regulares` | 26 |

**Blueprints**

- `spanish.y6.mock` — 3 secciones, 20 ítems, 15 min

**No extraído, y por qué**

- **los 5 juegos** (`VERBS / PRON / ENDS / CONJNAME / DHW / TILQ / MPAIRS / ERRS`) — máquina de conjugar, clasificador diptongo/hiato, memoria de monosílabos y cazador de errores. Formatos `cloze`, `matching` y `hotspot` fuera del alcance actual del pipeline.
- **desbloqueo del simulacro por progreso** (`GOAL / answered / isUnlocked`) — el trainer exige el 90% de la práctica antes de abrir el examen. Es una regla de progresión que corresponde a `exam_assignments` y a la capa de analítica, no al contenido.
- **campos sin equivalente en el material original** — los trainers Y6A no declaran dificultad, duración estimada, umbral de aprobado ni número de intentos. El pipeline los rellena con valores por defecto uniformes (difficulty 2 en banco / 3 en generadas, estimatedMinutes 20, passThreshold 0.6, maxAttempts sin límite, pointsPerItem 1) que un profesor debe revisar antes de publicar el curso. NO son datos extraídos.

### 🌍 socials — `Y6A/Socials/Year 6 Social Studies Exam Trainer.html`

**Bloques por tipo**

| kind | n |
|---|---:|
| `rule` | 8 |
| `table` | 15 |
| `text` | 41 |
| `tip` | 14 |
| `warning` | 5 |

**Preguntas por skill**

| skill | n |
|---|---:|
| `socials.landforms.maps` | 28 |
| `socials.landforms.mountain_formation` | 22 |
| `socials.rivers.amazon` | 20 |
| `socials.rivers.pollution` | 24 |
| `socials.settlements.capital_cities` | 28 |
| `socials.settlements.city_growth` | 17 |

**Blueprints**

- `socials.y6.mock` — 6 secciones, 30 ítems, sin límite de tiempo

**No extraído, y por qué**

- **Mountain Lab** (`MT_TEXT / MTYPES`) — animaciones SVG de los tres tipos de formación de montañas (plegamiento, bloque, volcánica). El texto explicativo sí está en las lecciones; la animación necesita un componente propio.
- **Map Lab** (`C_COLS / R_BANDS / RV / PGI`) — curvas de nivel, pendientes y mapa de relieve generados con SVG y escalas de color. Es una actividad de exploración, no un bloque de contenido.
- **River Lab** (`LBL de partes del río / AR`) — etiquetado interactivo de las partes de un río; formato `hotspot`, aún no soportado.
- **juegos** (`PAIRS / ORD / CAPS`) — emparejar causa/daño/cura, ordenar los pasos de la lluvia ácida y el juego de capitales. Formatos `matching` y `ordering` fuera del alcance actual.
- **campos sin equivalente en el material original** — los trainers Y6A no declaran dificultad, duración estimada, umbral de aprobado ni número de intentos. El pipeline los rellena con valores por defecto uniformes (difficulty 2 en banco / 3 en generadas, estimatedMinutes 20, passThreshold 0.6, maxAttempts sin límite, pointsPerItem 1) que un profesor debe revisar antes de publicar el curso. NO son datos extraídos.

### 💻 ict — `Y6A/ICT/Year 6 ICT Exam Trainer.html`

**Bloques por tipo**

| kind | n |
|---|---:|
| `rule` | 11 |
| `table` | 21 |
| `text` | 53 |
| `tip` | 16 |
| `warning` | 4 |

**Preguntas por skill**

| skill | n |
|---|---:|
| `ict.applications.digital_content` | 13 |
| `ict.applications.spreadsheets` | 20 |
| `ict.programming.scratch` | 15 |
| `ict.systems.data_transfer` | 15 |
| `ict.systems.hardware_software` | 16 |

**Blueprints**

- `ict.y6.mock` — 5 secciones, 25 ítems, sin límite de tiempo

**No extraído, y por qué**

- **Scratch Lab** (`PRED / PATHS`) — simulador de bloques de Scratch: el alumno predice el recorrido del sprite. Necesita un intérprete de bloques y un lienzo; no es contenido estático.
- **Data Lab (Excel)** (`UNITS / DITEMS`) — hoja de cálculo interactiva con fórmulas. La parte teórica está en las lecciones; la práctica requiere un componente de hoja de cálculo.
- **juegos** (`PAIRS / DITEMS`) — emparejar y clasificar; formatos `matching` y `drag_drop` aún no soportados.
- **tema "ind"** (`Q`) — tiene lección pero ninguna pregunta en el banco
- **campos sin equivalente en el material original** — los trainers Y6A no declaran dificultad, duración estimada, umbral de aprobado ni número de intentos. El pipeline los rellena con valores por defecto uniformes (difficulty 2 en banco / 3 en generadas, estimatedMinutes 20, passThreshold 0.6, maxAttempts sin límite, pointsPerItem 1) que un profesor debe revisar antes de publicar el curso. NO son datos extraídos.

## Lo que ningún extractor puede hacer

Los **laboratorios interactivos** (Shape Lab, Circuit Lab, Mountain/Map/River Lab,
Scratch Lab, Data Lab) y los **mini-juegos** no son contenido: son programas. Dibujan
SVG en tiempo de ejecución, mantienen estado y evalúan la interacción del alumno.
Ningún pipeline de extracción los convierte en `lesson_blocks` sin inventarse la mitad.

Lo que sí ocurre con ellos:

1. La **teoría** que los acompaña sí está extraída — vive en las lecciones.
2. El **Shape Lab de Math** se reimplementa como el generador `math.shape` de `@cet/engine`, que produce el SVG en `renderedBody.figureSvg`. Es el único lab con ruta de migración cerrada.
3. Los demás quedan como trabajo de un módulo de actividades interactivas, con sus formatos (`matching`, `ordering`, `hotspot`, `drag_drop`) ya presentes en `question_format` pero sin extractor.

