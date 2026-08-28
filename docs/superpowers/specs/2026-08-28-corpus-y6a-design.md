# Corpus Y6A — de 71 ficheros sueltos a contenido citable

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Diseño aprobado el 28 de agosto de 2026. Piloto implementado y en verde.
> Contrato de la migración `supabase/migrations/0027_corpus.sql`.

**En una frase:** un corpus donde cada trozo de material original es citable, una
puerta que rechaza toda propuesta cuya cita no case **literalmente** con el
original, y un mando único —`pnpm corpus`— que recorre el camino entero desde el
fichero del profesor hasta la base de datos.

---

## 1 · El problema que había

`@cet/content` extrae los seis entrenadores HTML de Y6A y produce packs con
trazabilidad al carácter: `source: {file, symbol, index}`. Es determinista y por
eso se puede auditar.

Pero eso son **6 de los 71 ficheros de Y6A**. Los otros 65 —los exámenes reales
de Math con su clave, las diez hojas de `Classwork` de Science, los booklets de
Socials, los temarios oficiales, las 19 páginas de ICT que solo existen como
imagen— no se habían tocado nunca. Y no se pueden tocar igual: convertir un
`.docx` en una lección con preguntas **lo hace un modelo, y un modelo inventa**.

Y había un segundo problema, mayor y hasta hoy invisible: **no existía el
sembrador**. `supabase/seed/0003_math_y6.sql` inserta materia, curso, módulos,
lecciones y skills de Math, y ni una sola pregunta. Las 462 preguntas ya
extraídas vivían solo como JSON en disco. Ampliar la cobertura sin arreglar eso
habría dejado el contenido nuevo exactamente donde estaba el viejo.

---

## 2 · Las cuatro decisiones

| | Decisión | Alternativa descartada |
|---|---|---|
| 1 | **Cobertura** primero: minar los 65 ficheros sin tocar | profundidad pedagógica sobre lo que ya hay; alineación con currículos externos |
| 2 | **Cita verificable + revisión humana**: nada se siembra sin que un humano lo apruebe | cita automática sin revisión; doble agente sin cita |
| 3 | El carril visual **lo transcribo con visión**, a spans | OCR local; dejar los 39 visuales fuera |
| 4 | Corpus y cola **en tablas de Supabase** | ficheros versionados en git (más barato hoy, peor cuando revise un profesor) |

La 4 cuesta infraestructura por delante —migración, RLS, pgTAP, revisor en el
panel— y se tomó sabiéndolo: es a donde hay que llegar el día que revise un
profesor y no el autor.

---

## 3 · El reparto real de Y6A

Medido, no estimado (`pnpm corpus status`):

| Carril | Ficheros | Quién lo lee |
|---|---:|---|
| `html_trainer` | 6 | ya extraído por el pipeline de trainers |
| `office_xml` (.docx/.pptx) | 13 | determinista — **implementado** |
| `plain` (.txt) | 1 | determinista — **implementado** |
| `text_layer` (PDF con fuentes) | 17 | determinista — **falta el extractor** |
| `vision` (imagen y PDF escaneado) | 33 | nadie con texto: exige transcripción mirando |
| duplicado exacto | 1 | `Grade 5 Math Exam_1.pdf` ≡ `(v2).pdf`, mismo sha256 |

**El 46 % del material es visual**, y ahí DeepSeek no entra (HANDOFF-DEEPSEEK
§0.2). ICT es el caso extremo: sus 19 páginas son su única fuente.

---

## 4 · El esquema

Cuatro tablas en `0027_corpus.sql`, todas con `school_id` nullable (AD-2),
denormalizado por trigger, y RLS donde **el alumno no aparece en ninguna
política** — para un alumno están vacías, que es el fallo seguro correcto.

- **`source_documents`** — el fichero, con `sha256` y `extraction`. El sha256 con
  índices únicos parciales mata el duplicado de Math por construcción.
- **`source_spans`** — la unidad citable. `span_text` es texto plano y **no**
  `I18nText`: es material original en el idioma del profesor. **Inmutable en
  UPDATE** (`app.block_mutation`), no en DELETE — un trigger `before delete` en
  la hija se dispararía también en la cascada y dejaría los documentos
  imborrables.
- **`content_candidates`** — la cuarentena. `verified` ≠ `approved`: lo primero
  dice que la cita casa, lo segundo que una persona lo leyó. Un `check` impide
  llegar a `approved` sin firma y fecha.
- **`content_candidate_citations`** — el vínculo, **con clave foránea real**. Un
  `jsonb` con `{"span_id": …}` no lo comprueba nadie; con FK, una cita imposible
  no entra en la base de datos. Un trigger `constraint` diferido exige que todo
  candidato tenga al menos una cita al hacer COMMIT.

---

## 5 · La puerta

`verifyCandidate()` comprueba cuatro cosas, y devuelve **código de salida**, no
prosa:

1. **Forma** — valida contra el Zod del pack. Si falla, para: seguir hablaría de
   campos que no existen.
2. **Skill** — el `skillCode` existe en la taxonomía del curso.
3. **Cita** — cada `quote` está contenida literalmente en el span citado, tras
   normalizar solo lo que rompe el copiado (espacios, comillas tipográficas,
   guiones). Mayúsculas y tildes **no** se normalizan: cambian el significado.
4. **Respuesta** — el texto de la respuesta correcta aparece en lo citado.

La cuarta es la que justifica el sistema entero. Sin ella un agente puede citar
impecablemente el párrafo correcto y marcar mal la respuesta: la cita existe, la
pregunta miente. Es la versión en contenido del test verde que pasa por el
motivo equivocado.

Probado con tres candidatos reales sobre `Classwork 27.docx`: los dos honestos
en verde, y el fabricado cayó por los tres motivos a la vez.

---

## 6 · El mando

```
pnpm corpus status                    qué hay en Y6A, en los packs y en la BD
pnpm corpus doctor                    qué impide subir algo, y por qué
pnpm corpus ingest [materia|ruta]     Y6A -> spans citables
pnpm corpus verify <candidatos.json>  la puerta
pnpm corpus review [--approve <id>]   cola de revisión humana
pnpm corpus push                      packs -> Supabase
```

**Nada escribe en la base de datos sin `--apply`.** Sin la bandera, cada
subcomando dice exactamente qué haría y sale con 0.

---

## 7 · Fases

| | Fase | Estado |
|---|---|---|
| 0 | Esquema, extractor OOXML, puerta, mando | **hecho, 219 tests en verde** |
| 1 | Aplicar `0027` y sembrar los 6 packs (462 preguntas) | bloqueada: ver §8 |
| 2 | Ingerir los 14 ficheros del carril determinista | listo para `--apply` |
| 3 | Extractor de PDF con capa de texto (17 ficheros) | sin construir |
| 4 | Transcripción con visión (33 ficheros; ICT primero) | sin empezar |
| 5 | Contratos DeepSeek por documento sobre el corpus | sin empezar |
| 6 | Revisor de candidatos en el panel de admin (M12) | sin empezar |

---

## 8 · Lo que bloquea la fase 1

Dos desacuerdos entre el pack y el esquema, y **ninguno se decide solo**
(`pnpm corpus doctor` los lista):

1. **`passThreshold`** — el pack usa fracción (`0.6`); `exam_blueprints.
   pass_threshold` usa porcentaje (0–100). Sembrarlo tal cual pondría el
   aprobado en el 0,6 %: un examen que se aprueba con una pregunta.
2. **`maxAttempts`** — el pack dice `null` = sin límite; la columna es `not null`
   con `check >= 1` y no sabe decir "sin límite". O se fija un tope real, o se
   migra la columna a nullable.

Hasta que se decidan, `push` siembra todo **menos los blueprints**, y lo dice.

Hay un tercero, menor: `course_modules` no tiene columna para el `overview` del
módulo, así que ese contenido se perdería al sembrar. Se cuenta como hueco, no
se tira en silencio.

---

## 9 · Lo que este diseño NO resuelve

- No añade **profundidad pedagógica**: las preguntas siguen teniendo una
  solución de una línea, sin razón del distractor ni error típico. Era el otro
  eje, y se descartó a conciencia para esta fase.
- No toca los **laboratorios interactivos ni los mini-juegos** de los trainers
  (`COVERAGE.md` los documenta): son programas, no contenido.
- No prueba la RLS. `pnpm corpus` se conecta como `postgres` y **salta las
  políticas**; quien las prueba es pgTAP en `supabase/tests/`, y el test de las
  cuatro tablas nuevas está por escribir.
