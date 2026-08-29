# Traspaso — cierre de la primera ronda

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> 29 de agosto de 2026. Complementa a `HANDOFF.md` y a la spec
> `docs/superpowers/specs/2026-08-29-cierre-primera-ronda-design.md`.
>
> **Para quien siga:** léete el §1 antes de lanzar nada. Es la lista de errores
> que cometí repartiendo trabajo, y repetir cualquiera cuesta media hora y unos
> céntimos por contrato.

---

## 0 · Lo único urgente

**Hay una brecha de aislamiento entre colegios viva en producción.**

`learning_events` tiene tres políticas de INSERT y Postgres las combina con
**OR**. `learning_events_insert_student` —creada por `0059`, sin fichero que la
respaldara hasta ayer— dice solo `student_id = auth.uid()`, **sin comprobar el
colegio**, y al combinarse anula a la política estricta. Un alumno puede escribir
telemetría con cualquier `school_id`. `learning_events_insert_staff` permite
además que un profesor genere telemetría de aprendizaje, que el invariante 12
prohíbe.

Verificado dos veces: por `supabase/tests/telemetry_ingest.sql` (asserts 8, 11 y
12, rojos) y leyendo `pg_policies` directamente.

**Está pendiente de decisión del humano**, porque retirar políticas de producción
no es un cambio que un agente deba hacer solo. El arreglo *parece* ser retirar
las dos permisivas —la ingesta real pasa por la estricta— pero eso hay que
comprobarlo con una prueba, no suponerlo.

Llevaba invisible desde el 28/08 porque el fichero que debía cazarlo abortaba
antes de llegar: un `c.relname` de tipo `name` comparado con `text` mataba la
sentencia con `function is(name, text, unknown) does not exist`. Ya está
arreglado; el detector funciona.

---

## 1 · Cómo repartir trabajo aquí, aprendido a golpes

De seis contratos lanzados hoy, **cuatro fallaron por cómo estaban escritos, no
por el modelo**. Las reglas que salen de eso:

### 1.1 · La forma del trabajo elige el motor

| Forma | Motor | Por qué |
|---|---|---|
| Diff pequeño y quirúrgico | **DeepSeek** | Devuelve un diff que el motor aplica |
| Reescritura de fichero entero | **Kimi** | Entra al worktree y edita: no hay diff que desalinear |
| Hay que mirar, o hace falta criterio | **Agente interno** | Los otros dos no ven imágenes |

`cierre-5` (reescribir `db-test.mjs`) se lanzó a DeepSeek: **cuatro rondas, tres
con «el parche no aplica ni con --recount», $0,30 y nada**. La primera ronda
gastó los 32.000 tokens de salida razonando y devolvió contenido vacío
(`finish_reason=length`), que es un modo de fallo conocido del `reasoner`.

### 1.2 · Un verificador estático no valida comportamiento

`cierre-1` se verificó con `validar-sql.mjs`, que comprueba que el SQL parsea y
declara las funciones esperadas — **nunca ejecuta la prueba**. Volvió «verde» con
un arreglo que no funcionaba. Ejecutado de verdad: 7 verdes, 2 rojos.

Ahora que el motor pasa credenciales al `verify` (§1.5), no hay excusa: si la
corrección del contrato es de comportamiento, el `verify` ejecuta.

### 1.3 · El territorio debe incluir todo lo que la verificación obliga a tocar

`cierre-4` (añadir un enum) tenía como territorio `enums.ts`. Pero
`enum-parity.test.ts` lleva **una lista explícita de importaciones y una tabla de
correspondencias**: un enum declarado y no registrado ahí sigue contando como
desconocido. El contrato era **imposible de cumplir** y el modelo no tenía forma
de saberlo. Gastó sus tres rondas; yo fallé en el mismo sitio hasta que leí el
test.

### 1.4 · Comprueba la premisa del contrato antes de escribirlo

`cierre-6` decía «la ingesta recibe la destreza y no la guarda». **Falso.**
Comparé contra la fecha del commit en vez de la del despliegue:

| | filas | con `skill_id` |
|---|---|---|
| Antes del despliegue del arreglo (27/08 21:51 UTC) | 151 | 0 |
| Después | 26 | **26** |

La ingesta funciona al 100 %. No ha habido una respuesta de práctica desde
entonces, y `learning_events` es append-only, así que las viejas quedan nulas
para siempre. El parche resultante sigue valiendo —el `error` descartado era un
fallo mudo real— pero la premisa era mía y era falsa.

### 1.5 · El worktree no tiene `secrets/`

Es un árbol limpio de git, y `secrets/` no se versiona. **Ningún contrato cuya
verificación tocara la base podía salir verde jamás**; el motor lo reportaba como
si hubiera fallado el modelo. Los contratos de tenencia de ayer verificaban así,
lo que probablemente explica que `ref-04`, `ref-05` y `ref-06` no tengan ni
fichero de resultado mientras sus migraciones acabaron aplicadas en producción.

Arreglado: el motor pasa `PGPASSWORD` y `CET_DB_URL` por entorno. Hacen falta las
dos: `db-test.mjs` honra `CET_DB_URL` al elegir ruta, pero su `connectAny()`
llama a `readPassword()` **antes y sin condición**.

No reabre la puerta de ayer: `db-apply` clasifica el destino por el nombre del
host, así que escribir en producción sigue exigiendo `--produccion-de-verdad`
escrito en el contrato, donde se revisa en el diff.

---

## 2 · Estado de los contratos

| Contrato | Estado |
|---|---|
| `cierre-1` tiempo de estudio | **Reescrito y relanzado.** La primera versión tenía verify estático e instrucción falsa |
| `cierre-2` skill_id en práctica | ✅ commiteado (`111ae31`) |
| `cierre-3` invariantes de telemetría | ✅ el cast, commiteado (`2fe682f`). **Falta el arreglo del esquema** — es el §0 |
| `cierre-4` paridad de enums | ✅ commiteado (`0d4ad04`), a mano |
| `cierre-5` corredor aislado | **Relanzado en Kimi** tras fracasar en DeepSeek |
| `cierre-6` ingesta no resuelve | ✅ traído y verificado (16/16) |

---

## 3 · Lo que queda para cerrar la etapa

Ordenado por lo que le duele a un alumno, no por dificultad.

1. **La brecha de aislamiento** (§0). Decisión humana, migración corta.
2. **El 409 del examen.** `POST /api/attempts/start` devuelve un error de dominio
   de una lista de ocho. Descartado `insufficient_pool` (las 13 secciones son
   `generated`) y la `selection` está bien formada. **No se identifica
   adivinando**: hay que instrumentar el mapeo o reproducir `startAttempt` fuera
   de la web. Va antes que casi todo: sin examen no hay `attempt_id`, y sin
   `attempt_id` media familia de informes no tiene datos.
3. **La página `/teach/alumno/[id]`.** Los datos ya son alcanzables (`0063`) y
   los componentes están probados (`StudyScorecard`, 45 casos). Falta unirlos.
   **No es delegable a DeepSeek ni a Kimi**: hay que mirar las gráficas, y
   `HANDOFF-DEEPSEEK.md §5.5` exige capturas a quien toca interfaz.
4. **La decisión de tenencia.** `school_id` contra membresía. No es trabajo, es
   criterio, y de ella cuelgan las políticas que faltan en
   `student_school_memberships` —hoy con RLS y **cero políticas**, así que la
   rama «por matrícula» de `profiles_select_school` es código muerto—.
   `rls_tutor.sql` está rojo a propósito como recordatorio.
5. **Los rojos restantes de pgTAP**: `constraints`, `debug_temp`,
   `rls_student_cannot_read_peers`, `web_write_paths`. La auditoría de ayer los
   clasificó como «test desactualizado» salvo los que cuelgan del punto 4.

---

## 4 · Dos cosas que dependen del humano y no avanzan solas

- **La GitHub App de Vercel** no está instalada en `mendizabalroberto/CET`:
  ningún push despliega. https://github.com/apps/vercel
- **La contraseña de `cet-contratos`** (proyecto `nfeiimhcqqlcyjkpoirf`, creado y
  gratis). Con ella, los contratos verifican contra una base virgen en vez de
  contra producción — y aplicar las 52 migraciones sobre una base limpia es, en
  sí mismo, la prueba que nadie ha hecho nunca.
