# Traspaso — Delegación de contratos a DeepSeek

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Complementa a `HANDOFF.md` (tercera tanda del 27 de agosto); no lo sustituye.
> Las observaciones a las que se refiere son las de su §3 y su §7.
>
> **En una frase:** un motor que convierte una observación pendiente en un
> encargo cerrado —territorio de ficheros, evidencia, criterio de aceptación y
> plazo—, se lo manda a DeepSeek, aplica su parche en una rama aislada y solo
> lo da por bueno si la verificación sale verde **por código de salida**.
>
> **Estado: diseñado y aprobado, no implementado.** Nada de lo que sigue existe
> todavía en el árbol.

---

## 0 · Lo que hay que saber antes de escribir una línea

### 0.1 · La clave

Está en `secrets/accounts.env`, y la variable se llama **`DEEP_SEEK_API`** —
no `DEEPSEEK_API_KEY`. Un grep de «DEEPSEEK» no la encuentra, porque lleva
guion bajo entre las dos palabras. El motor debe leer ese nombre exacto, y
fallar con un mensaje claro si falta, nunca con un 401 desde la red.

El fichero está en `.gitignore` (línea 8) y en `.vercelignore`. Bien.

**Pero la clave ya se pegó en el chat**, como la contraseña de superadmin y el
PIN del alumno de prueba. Va a la misma lista de rotación pendiente de
`HANDOFF.md §6`, y es la más barata de rotar de las tres: se regenera en el
panel de DeepSeek en un minuto y no rompe nada que esté desplegado.

### 0.2 · DeepSeek no ve imágenes

Ni `deepseek-chat` ni `deepseek-reasoner` aceptan entrada visual. Esto no es un
detalle de configuración: **decide qué se puede delegar y qué no.**

Todo el §7 de `HANDOFF.md` —«lo que nadie ha visto nunca»— es visual, y por
tanto **no delegable**: el dedo sobre la tableta, el tema oscuro, las seis
figuras dentro de una lección real, las capturas de `tocheck/`. Y §5.5 exige
capturas a quien toque interfaz; un agente que no ve no puede cumplirlo. Un
contrato que toque componentes visibles es un contrato mal repartido.

### 0.3 · El presupuesto de contexto

Unos 64K de entrada y ~8K de salida por respuesta. Un contrato lleva **los
ficheros recortados que nombra, no el repositorio**. Ahí está el ahorro real:
el territorio se elige una vez —con criterio y con el mapa completo del
proyecto en la cabeza— y a partir de ahí DeepSeek itera dentro de él solo.

---

## 1 · Qué se delega

| Observación | Delegable | Por qué |
|---|---|---|
| 3.1 flechas de `place-value-shift` sin prueba | Sí, con reservas | Es un test nuevo sobre una figura; se puede describir el requisito en texto, pero nadie verá el resultado |
| 3.2 test intermitente de densidad | Sí, **solo informe** | Investigación pura. Dos revisores discrepan; hace falta razonamiento, no un parche |
| 3.3 `clearPersisted()` borra en silencio | Sí | Lógica acotada en un fichero, con el fallo ya localizado en la línea 333 |
| 3.4 `skill_mastery` no la escribe nadie | No todavía | Espera decisión del usuario (§6.5 del traspaso principal) |
| 3.5 `learning_events.skill_id` NULL al 100 % | Sí | Mecánico y verificable: el dato está en `payload.skillCode` y el índice no sirve |
| 3.6 spec de color sin aprobar | No | Espera decisión, y sus medidas están mal tomadas |
| 3.7 cinco materias sin sembrar | Sí | 453 preguntas y 5 blueprints ya extraídos. Trabajo de datos, sin criterio visual |
| §7 entero | **No** | Visual. Véase §0.2 |

---

## 2 · El contrato

Un fichero por encargo en `contracts/<id>.md`. Cabecera YAML y cuerpo en prosa.

```yaml
---
id: 3.5-skill-id-null
model: chat                                  # chat | reasoner
territory: [lib/telemetry/**]                # lo único que puede tocar
forbidden: [packages/ui/src/index.ts]        # el barril: ajeno siempre (§5.2)
context:   [lib/telemetry/track.ts, supabase/migrations/0012_*.sql]
verify:    pnpm vitest run lib/telemetry     # criterio, por código de salida
rounds:    3
deadline:  3 rondas o 15 min
---
```

El cuerpo, cuatro apartados y nada más:

1. **El problema**, en dos frases.
2. **La evidencia que ya tenemos**, literal. Es la diferencia entre minutos y
   media hora (§5.8): los agentes que recibieron trazas terminaron rápido; los
   que empezaron a ciegas, no.
3. **El criterio de aceptación**, ejecutable.
4. **Qué no cuenta como resuelto.** Aquí es donde se cierra la puerta a los
   siete falsos verdes de ayer: un `data-testid` inexistente, un `if` que nunca
   se cumple, una aserción que compara un valor consigo mismo.

`deadline` no es decorativo: hay un invariante en el repositorio —«petición sin
plazo»— que ya vigila esto en el código, y el mismo criterio se aplica aquí.

---

## 3 · El motor

`scripts/deepseek/run-contract.mjs`. Node 20 con `fetch` nativo, cero
dependencias nuevas. La API de DeepSeek es compatible con la de OpenAI:
`POST https://api.deepseek.com/chat/completions`.

Por cada contrato:

1. **Aislar.** `git worktree add` sobre HEAD. Nunca el árbol de trabajo: dos
   servidores corrompieron el `.next` compartido una vez (§5.4), y desplegar
   pide un árbol limpio (§1).
2. **Empaquetar.** Sistema con las reglas de §6 (abajo); usuario con el cuerpo
   del contrato y los ficheros de `context` recortados y numerados por línea.
3. **Pedir un diff unificado.** Nada de prosa con fragmentos: un parche.
4. **Aplicar.** `git apply --check` y después `git apply`.
5. **Guarda de territorio.** Si algún hunk cae fuera de `territory` o dentro de
   `forbidden`, **se rechaza el parche entero** y la ronda se pierde. Ésta es
   la única defensa real contra un agente que se desvía, y por eso vive en el
   motor y no en el prompt: lo que se le pide, se negocia; lo que se le impide,
   no.
6. **Verificar por código de salida.** Nunca por grep sobre la salida. Un
   agente comprobó cinco mutaciones con un grep que no casaba con la salida
   coloreada y obtuvo cinco falsos verdes (§5.3).
7. **Reintentar.** Rojo → se reenvía la salida **literal** del fallo y va otra
   ronda, hasta `rounds`.
8. **Cerrar.** Verde → se deja la rama y se escribe `contracts/<id>.result.md`
   con el diff, las rondas consumidas y la salida final. Consolida el humano.

Lo que el motor **no hace nunca**: commit en `main`, `push`, desplegar, leer
`secrets/` más allá de la variable que necesita, ni tocar `.env*`.

Imprime tokens y coste de cada llamada por pantalla. Sin fichero de registro:
se descartó por ahora.

---

## 4 · El lote

`--batch c1.md c2.md c3.md` lanza varios en paralelo, y **valida que los
`territory` sean disjuntos antes de lanzar nada**. Si dos se solapan, se niega
entero y dice cuáles.

Es el patrón que funcionó con los trece agentes de ayer (§5.1): repartir por
territorio de ficheros, no por tema, y escribirle a cada uno qué ficheros son
suyos y cuáles son de otro.

---

## 5 · El primer lote

| Contrato | Territorio | Modelo |
|---|---|---|
| 3.5 `skill_id` NULL | `lib/telemetry/**` | chat |
| 3.3 `clearPersisted()` | `apps/web/**/exam-runner/**` | chat |
| 3.7 siembra de cinco materias | `packages/content/packs/**` | chat |
| 3.2 test intermitente | ninguno — **solo informe** | reasoner |

3.1 queda fuera de este lote: su territorio colisiona con el de 3.2 en
`packages/ui/src/learning/`. Entra en el segundo, cuando 3.2 haya cerrado.

Criterio de modelo: `reasoner` para diagnóstico e investigación —3.2 es
exactamente eso, un intermitente que no se reproduce en 24 ejecuciones—, y
`chat` para lo mecánico y verificable.

---

## 6 · Lo que va en el prompt de sistema

Las reglas del proyecto, no genéricas. Éstas cinco, textuales:

1. **Verifica ejecutando.** Salida literal. Nunca «debería funcionar».
2. **Un dato plausible no es un dato correcto.**
3. **Un test verde puede estar pasando por el motivo equivocado.** Ocurrió
   siete veces en un solo día.
4. **Nunca debilites una defensa para que un test pase.** Un test rojo se
   arregla arreglando el código; si vas a tocar el test, demuestra primero que
   el requisito se conserva.
5. **Muta lo mínimo.** La mutación que elijas decide lo que demuestras: borrar
   dos canales a la vez pone rojo un test que no protege ninguno por separado.

Y una que es del motor y conviene que el agente sepa: **hay 17 invariantes que
cazan familias de fallos.** Uno de ellos cazó una violación nueva de otro
agente cinco horas después de escribirse. No están para sortearlos.

---

## 7 · Lo que falta decidir

| | Qué | Estado |
|---|---|---|
| 1 | **Rotar `DEEP_SEEK_API`**, que se pegó en el chat | Pendiente del usuario |
| 2 | Generador de contratos desde `HANDOFF.md` | Descartado por ahora; se escriben a mano |
| 3 | Registro de gasto en fichero | Descartado por ahora; solo por pantalla |
| 4 | Qué hacer cuando un contrato agota sus rondas en rojo | Sin decidir. Hoy: se deja la rama y se avisa |
| 5 | Si el informe de 3.2 vale como cierre o solo como insumo | Sin decidir |

---

## 8 · Lo que este sistema no resuelve

Sigue sin tocarse la app con un dedo en una tableta, sigue sin revisarse el
tema oscuro, siguen sin verse las seis figuras dentro de una lección real,
sigue sin ejecutarse el examen de 20 ítems de M09 —y para ése hace falta que el
usuario teclee el PIN: **no lo introduzcas tú**—, y nada se ha probado con un
niño.

Delegar a DeepSeek acelera §3. No toca §7. Conviene no confundir las dos cosas
al mirar cuánto queda.
