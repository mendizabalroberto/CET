# SISTEMA DE COLOR Y TIPOGRAFÍA PEDAGÓGICO — propuesta

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> **Estado: PROPUESTA. No implementada.** Ningún fichero de `packages/ui` ni de `apps/web` se ha
> tocado para escribir esto. Requiere aprobación humana antes de convertirse en código.
> **Fecha:** 2026-08-27

**Alcance.** Alumnos de Year 6 (10–12 años) en tabletas compartidas y portátiles de colegio;
profesores y administradores en escritorio. Español e inglés. Tema claro y oscuro.

**Qué contiene.** Lo que la evidencia sostiene, lo que es folclore, la medición del estado actual
—con los pares que fallan y sus números—, una propuesta de tokens que encaja en la estructura que
ya existe, y las diferencias deliberadas entre lección, práctica y examen.

**Lo que NO contiene.** Rediseño visual. La paleta Y6A se conserva casi entera; lo que se propone
son correcciones puntuales con justificación numérica. Si al terminar de leer esto la conclusión es
"apenas cambia nada", es la conclusión correcta: el sistema actual está bien pensado y tiene siete
defectos concretos.

---

## 1. Qué dice la evidencia

### 1.1 El color que enseña es el color que *señala*, no el que decora

El resultado más sólido y más útil para este proyecto es el **principio de señalización (signaling
/ cueing)** de la teoría cognitiva del aprendizaje multimedia. Marcar con color la correspondencia
entre partes del material —un término del texto y su parte en el diagrama, una categoría y sus
miembros— produce un efecto positivo pequeño-a-medio en comprensión y transferencia, **y el efecto
es mayor en aprendices con poco conocimiento previo**, que es exactamente la población de este
producto. El seguimiento ocular explica el mecanismo: el material codificado por color reduce el
tiempo de primera fijación, es decir, el alumno encuentra antes lo relevante y gasta menos memoria
de trabajo buscándolo.

Consecuencia de diseño: **cada color de la paleta debe significar una cosa y siempre la misma.**
El amarillo no puede ser "truco" en la lección y "marcado para revisar" en el examen sin que eso
tenga un coste. Un mapa color → significado estable es lo que hace que la señalización funcione;
un mapa inconsistente es ruido con aspecto de sistema.

### 1.2 El color que no señala, resta

El **principio de coherencia** dice que se aprende más profundamente cuando se excluye el material
extraño. El caso particular de los **detalles seductores** —información interesante pero irrelevante—
está medido en metaanálisis: efecto negativo pequeño-a-medio en retención y **medio en
transferencia**. La explicación es sobrecarga de memoria de trabajo, desvío de atención e
interferencia de esquemas.

Aplicado aquí: un degradado decorativo detrás de un enunciado, una ilustración simpática junto a
una regla, un confeti al acertar. Nada de eso es neutro. Ocupa el mismo recurso escaso que la
tarea. Es el argumento —empírico, no estético— para que el examen sea sobrio y para que la práctica
no celebre con animaciones.

### 1.3 Estimulación media, no mínima ni máxima

El estudio HEAD (Barrett et al., 27 colegios de primaria, 153 aulas, 3.766 alumnos) encontró que
los factores físicos del aula explican hasta un 16 % del progreso anual en lectura, escritura y
matemáticas, y que la **estimulación** —color y complejidad visual— pesa aproximadamente el 23 % de
ese efecto. El hallazgo clave no es "más color, mejor" ni "menos color, mejor": es que la relación
tiene forma de U invertida. El aula que rinde es la que no es ni caótica ni sosa.

Esto es evidencia sobre aulas físicas, no sobre interfaces, y la traslación es una analogía, no una
demostración. Pero es la mejor evidencia disponible sobre nivel de estimulación en entornos de
aprendizaje infantil, y coincide con lo que dice la coherencia: una interfaz totalmente gris no es
la respuesta correcta a "el color distrae".

### 1.4 Contraste: umbrales duros, no opiniones

WCAG 2.2, nivel AA, es el suelo. No es un objetivo de diseño, es la línea por debajo de la cual el
producto está roto para alguien:

| Criterio | Nivel | Requisito numérico |
|---|---|---|
| 1.4.1 Uso del color | A | El color **no** es el único medio visual de transmitir información, indicar una acción o distinguir un elemento |
| 1.4.3 Contraste (mínimo) | AA | 4.5:1 texto normal; 3:1 texto grande (≥18 pt, o ≥14 pt en negrita) |
| 1.4.11 Contraste no textual | AA | 3:1 para componentes de interfaz y objetos gráficos, contra los colores **adyacentes** |
| 1.4.12 Espaciado de texto | AA | Sin pérdida de contenido con interlineado 1.5×, espacio entre párrafos 2×, entre letras 0.12×, entre palabras 0.16× del tamaño de fuente |
| 2.3.1 Tres destellos | A | Nada parpadea más de 3 veces por segundo |
| 2.4.11 Foco no oculto (mínimo) | AA | El elemento con foco no queda totalmente tapado por contenido del autor |
| 2.4.13 Apariencia del foco | AAA | El indicador de foco cubre al menos el área de un perímetro de 2 px CSS y contrasta ≥3:1 |
| 2.5.8 Tamaño del objetivo (mínimo) | AA | 24×24 px CSS, o separación equivalente |

El proyecto ya supera 2.5.8 con holgura: `--cet-touch-min: 44px` y `--cet-touch-comfy: 52px`. Eso
está bien resuelto y no se toca.

### 1.5 Deficiencia de visión del color: no es un caso extremo

**8 % de los hombres y 0.5 % de las mujeres** tienen una deficiencia de tipo rojo-verde; en
poblaciones del norte de Europa la cifra sube al 10–11 % de los varones. De ese 8 %, la mayoría
(≈5 puntos) es deuteranomalía. En una clase de 25 alumnos, la expectativa es **uno o dos niños**.

No es una hipótesis: en la sección 3.4 se simula la paleta actual y se demuestra que dos estados
opuestos del producto —acierto y error— son literalmente indistinguibles bajo deuteranopía.

### 1.6 Tipografía para lectura infantil

- La **British Dyslexia Association** (Style Guide 2023) recomienda 12–14 pt, equivalente a
  **16–19 px**, interlineado **1.5**, tipografía sans-serif, y evitar el blanco puro de fondo por
  deslumbrante, prefiriendo crema o un pastel suave.
- **Longitud de línea:** el rango aceptado para texto corrido es 50–75 caracteres por línea, con 66
  como objetivo habitual; la BDA recomienda 60–70. Para lectores noveles la literatura apunta más
  bajo, **34–60 caracteres, con ~45 como óptimo**. Líneas muy largas y muy cortas ralentizan por el
  mismo motivo: rompen el patrón normal del movimiento ocular.

Estas cifras son recomendaciones de guía profesional respaldadas por revisión de literatura, no
resultados de un ensayo único. Se tratan como tales: son un punto de partida defendible, no una
verdad medida sobre *estos* alumnos con *este* contenido.

---

## 2. Qué es mito

Esta sección existe porque la mayor parte de lo que se publica sobre "color y aprendizaje" no se
sostiene, y porque adoptar un mito cuesta lo mismo que adoptar un hallazgo.

### 2.1 "El azul calma y el rojo altera el rendimiento"

Es la afirmación popular más citada y la peor sostenida. El trabajo original (Elliot y Maier, 2007)
propuso que la percepción breve de rojo antes de una prueba deteriora el rendimiento por asociación
con el fracaso. **Las réplicas son contradictorias.** Cuatro experimentos publicados en *Collabra:
Psychology* (2020), dos de ellos réplicas directas de Lichtenfeld et al. (2009), **no encontraron
efecto** del rojo sobre razonamiento verbal ni en estudiantes de secundaria ni en universitarios.
Otras réplicas sí encuentran algo. El estado del arte no es "el rojo perjudica"; es "el efecto, si
existe, no es robusto ni generalizable".

**Consecuencia:** no se justifica ninguna decisión de esta propuesta apelando a la psicología del
color. El rojo se usa para el error **porque es la convención cultural establecida en material
escolar y porque cumple contraste**, no porque active nada. Y precisamente porque es solo una
convención, nunca puede ir solo: ver 1.5 y §5.

Esto tiene una consecuencia práctica inmediata: la decisión de que en el examen no haya colores de
acierto/error (§6.3) **no se apoya en que el rojo ponga nervioso al niño**. Se apoya en coherencia
(§1.2) y en integridad del examen: la clave no sale de la base de datos hasta la revisión, así que
no hay nada correcto ni incorrecto que colorear.

### 2.2 "Hay fuentes para dislexia"

OpenDyslexic y Dyslexie se venden como tipografías que mejoran la lectura de personas con dislexia.
Un estudio de 2017 en *Annals of Dyslexia* probó Dyslexie en niños con y sin dislexia: **no mejora
la lectura**. En pruebas sobre OpenDyslexic, la fuente **redujo** velocidad y precisión frente a
Arial y Times New Roman. Lo que sí ayuda —y lo que la propia BDA recomienda— es una sans-serif
común, cuerpo grande, interlineado generoso y buen espaciado. Eso es gratis y ya casi lo hace el
proyecto.

**Consecuencia:** no se propone ninguna fuente "para dislexia". Se propone subir el cuerpo y fijar
la longitud de línea, que es lo que tiene respaldo.

### 2.3 "Superponer un color de fondo ayuda a los disléxicos"

Las láminas de color y las gafas tintadas (Irlen / síndrome de Meares-Irlen) siguen siendo
controvertidas en la literatura revisada por pares. El estrés visual afecta a una fracción pequeña
—las estimaciones habituales rondan el 5–10 %— de las personas con dislexia, de modo que la gran
mayoría no obtiene beneficio. La recomendación de la BDA de evitar el blanco puro es razonable y
barata, y esta propuesta la adopta; pero **como decisión de confort, no como tratamiento**, y sin
prometer un efecto sobre el aprendizaje que la evidencia no respalda.

Nota interna coherente con esto: `--cet-surface: #ffffff` (blanco puro) es el fondo de tarjeta
actual. La página ya usa `#f4f7fb`, que no es blanco. En §6.1 se propone que la **prosa larga de
lección** no se pinte sobre blanco puro. Es un ajuste de confort de bajo riesgo, y se etiqueta como
tal.

### 2.4 "La gamificación motiva"

El metaanálisis disponible es más matizado de lo que se suele citar: la gamificación mejora
motivación intrínseca percibida, autonomía y relación, pero tiene **impacto mínimo sobre
competencia**, y la motivación así generada **decae con la exposición prolongada**. El énfasis en
recompensas extrínsecas —puntos, monedas, rachas— puede socavar la motivación intrínseca y producir
implicación superficial.

**Consecuencia:** el `StreakMeter` actual ya está bien calibrado —puntos que se llenan, sin confeti,
sin animación de celebración— y esta propuesta **no lo amplía**. Y no aparece en examen. Nunca.

### 2.5 "Los estilos de aprendizaje visual/auditivo"

No se menciona en ninguna decisión de este documento. Se registra aquí solo para dejar constancia
de que no es una base admisible: no hay evidencia de que emparejar el formato con el "estilo"
declarado del alumno mejore el aprendizaje.

---

## 3. Estado actual, medido

**Método.** Luminancia relativa WCAG 2.2, `(L1+0.05)/(L2+0.05)`, calculada sobre los valores
hexadecimales literales de los ficheros. Umbrales: 4.5:1 texto normal, 3:1 texto grande y
componentes/objetos gráficos. Los pares evaluados son los que **los componentes usan de verdad**,
leídos de los `className` de `packages/ui/src/`, no una selección favorable.

Esto último importa. `packages/ui/REVIEW.md` §1 ya documenta 19 pares medidos en claro y todos
pasan. El problema es que la lista **omite** los pares problemáticos: no mide `--cet-amber` contra
fondo, ni `--cet-tip-accent` contra `--cet-tip-bg`, ni `--cet-primary` contra `--cet-surface` en
oscuro, ni `--cet-example-border`. Los siete fallos de abajo no contradicen REVIEW.md; están en el
hueco que REVIEW.md no cubrió.

### 3.1 Fallos de contraste — tema claro

| # | Par | Ratio | Umbral | Dónde duele |
|---|---|---|---|---|
| C1 | `--cet-amber` `#f2a71b` / `--cet-surface` `#ffffff` | **2.04:1** | 3:1 (1.4.11) | Relleno del punto lleno de `StreakMeter` |
| C1b | `--cet-amber` / `--cet-bg` `#f4f7fb` | **1.89:1** | 3:1 | Lo mismo sobre fondo de página |
| C2 | `--cet-tip-accent` `#f2a71b` / `--cet-tip-bg` `#fff8e6` | **1.92:1** | 3:1 | Barra izquierda de `TipBox` |
| C3 | `--cet-hint-accent` `#f2a71b` / `--cet-hint-bg` `#fff8e6` | **1.92:1** | 3:1 | Borde de opción "missed" en `ChoiceList` |
| C3b | `--cet-hint-accent` / `--cet-surface` | **2.04:1** | 3:1 | **Borde de pregunta marcada para revisar en `QuestionCard`, y estado `flagged` de `QuestionNavigator`** |
| C4 | `--cet-border-strong` `#7d92a8` / `--cet-bg` `#f4f7fb` | **2.98:1** | 3:1 | Borde de control sobre fondo de página |
| C4b | `--cet-border-strong` / `--cet-surface-3` `#eef2f7` | **2.85:1** | 3:1 | Borde de control sobre superficie terciaria |
| C5 | `--cet-example-border` `#c8d6e4` / `--cet-example-bg` `#fbfcfe` | **1.44:1** | — | Único límite visual de `ExampleBox` |
| C6 | `--cet-amber-text` `#8a6100` / `--cet-amber` `#f2a71b` | **2.72:1** | 3:1 | Borde del punto lleno de `StreakMeter` |

**C3b es el más grave.** En un examen cronometrado, "he marcado esta pregunta para volver" es
información funcional, y su portador visual en la tarjeta es un borde ámbar a 2.04:1 contra blanco.
`QuestionNavigator` se salva porque añade un punto y un nombre accesible; `QuestionCard` no añade
nada: el borde ámbar de 2 px es toda la señal.

**C4/C4b** son especialmente relevantes en tabletas compartidas de colegio, que es donde el brillo
está bajo, la pantalla tiene huellas y el niño mira de pie y en ángulo.

**C5 se anota con reserva.** `ExampleBox` no es interactivo y `CalloutBox` ya pinta un rótulo de
texto ("Ejemplo"), así que 1.4.11 no lo exige de forma estricta. Pero el fondo `#fbfcfe` está a
1.03:1 de `#ffffff`: sobre una tarjeta blanca, **el recuadro de ejemplo prácticamente no existe**.
Si el tipo de bloque señala (§1.1), tiene que verse.

**El foco no está roto — y conviene decirlo con números**, porque a primera vista lo parece.
`--cet-focus` `#173a63` es idéntico a `--cet-primary` `#173a63`: 1.00:1. Pero el indicador real es
doble —anillo de 3 px más halo de 7 px— y el halo blanco da **11.53:1** contra el botón primario.
Para cada relleno, al menos una de las dos partes supera 3:1:

| Relleno | Anillo `#173a63` | Halo `#ffffff` |
|---|---|---|
| `--cet-primary` `#173a63` | 1.00 | **11.53** |
| `--cet-surface` `#ffffff` | **11.53** | 1.00 |
| `--cet-surface-3` `#eef2f7` | **10.25** | 1.12 |
| `--cet-danger` `#c0392b` | 2.12 | **5.44** |

El diseño de doble anillo de `tokens.css` es correcto y **no se propone cambiarlo**. Se propone
documentar por qué, para que nadie lo "arregle" igualando el anillo al fondo.

### 3.2 Fallos de contraste — tema oscuro

| # | Par | Ratio | Umbral | Dónde duele |
|---|---|---|---|---|
| O1 | `--cet-primary` `#2b5f96` / `--cet-surface` `#12202f` | **2.50:1** | 3:1 (1.4.11) | **Borde de la opción seleccionada en `ChoiceList`** |
| O1b | `--cet-primary` / `--cet-rule-bg` `#14293d` | **2.25:1** | 3:1 | La misma opción, contra su propio fondo de selección |
| O2 | `--cet-example-border` `#34506b` / `--cet-example-bg` `#16273a` | **1.81:1** | — | `ExampleBox` en oscuro |
| O3 | `--cet-border-strong` `#6c8298` / `--cet-surface-3` `#22384e` | **3.03:1** | 3:1 | Pasa por 0.03. Un ajuste de superficie lo rompe |
| O4 | `--cet-amber-text` = `--cet-amber` = `#f6c453` | **1.00:1** | 3:1 | El borde del punto de racha es invisible sobre su relleno |

**O1 es el fallo más importante del documento.** "Cuál he elegido" es la información más
consecuente de toda la interfaz de examen, y en tema oscuro su portador es un borde a **2.50:1**
—y a **2.25:1** contra el fondo que el propio estado de selección aplica. El componente lo compensa
parcialmente: el comentario de `ChoiceList` dice, con razón, que hay tres señales (borde grueso,
relleno del indicador, `aria-checked`), y el indicador relleno **sí** contrasta. Pero el borde de
2 px es la señal que se ve desde lejos, y en oscuro no llega.

### 3.3 El fallo estructural: hay dos paletas y la que se ejecuta no es la del design system

`packages/ui/src/tokens.css` define `--cet-*`. `apps/web/src/app/globals.css` define **otro juego
completo** —`--brand`, `--teal`, `--amber`, `--surface`, `--card`, `--ink`, `--muted`, `--line`,
`--ring`— con sus propios valores. El comentario de cabecera de `globals.css` reconoce la
duplicación y anuncia que al integrar `@cet/ui` los tokens de marca "deben venir del preset y
borrarse del bloque `@theme`". No ha ocurrido.

Y no son el mismo color. En tema oscuro divergen por completo:

| Concepto | `@cet/ui` (oscuro) | `apps/web` (oscuro) |
|---|---|---|
| superficie de página | `#0b1622` | `#0b141f` |
| tarjeta | `#12202f` | `#16222f` |
| tinta | `#e9eff6` | `#e7eef6` |
| tinta apagada | `#a7b8c9` | `#93a6ba` |
| marca | `#7cb2ea` | `#4a8fce` |
| éxito | `#5fd39f` | `#2fb782` |
| peligro | `#ff8a80` | `#f0705f` |
| ámbar | `#f6c453` | `#ffc247` |

`apps/web/src/app/(student)/learn/[lessonId]/page.tsx` usa `text-muted`, `text-ink`, `text-card`,
`bg-ink`, `border-line` — es decir, **la paleta de la app, no la del design system**. Los
componentes de `@cet/ui` que esa misma página monta (`LessonBlock`) usan `--cet-*`. En la misma
pantalla conviven dos sistemas de color.

Esto produce un fallo propio, medido:

| # | Par | Ratio | Umbral | Dónde |
|---|---|---|---|---|
| A1 | `--ring` `#34c3b4` / `--brand` `#4a8fce` (oscuro) | **1.57:1** | 3:1 | **El anillo de foco es casi invisible sobre el botón de marca.** La regla `:focus-visible` de `globals.css` es de anillo simple, sin halo, así que aquí no hay segunda señal que lo rescate |
| A2 | `--amber` `#f2a71b` / `--card` `#ffffff` (claro) | **2.04:1** | 3:1 | Mismo problema del ámbar, duplicado |
| A2b | `--amber` / `--surface` `#f4f7fb` (claro) | **1.89:1** | 3:1 | Ídem |

Un alumno navegando con teclado en tema oscuro **no ve dónde está** al llegar a un botón de marca.
Y en la lección, `--muted` `#5d7086` sobre `--surface` `#f4f7fb` da **4.74:1**: pasa, pero se aplica
a `text-sm` (14 px) y `text-xs` (12 px), muy por debajo del suelo que el propio preset se fijó
("el cuerpo no baja de 15px").

### 3.4 El color como único portador de significado

Aquí es donde el 8 % deja de ser una estadística. Simulando la paleta con la transformación de
Viénot (1999) en espacio LMS:

**Contraste entre los dos colores de estado, para el mismo observador:**

| Par | Visión normal | Protanopía | Deuteranopía |
|---|---|---|---|
| `--cet-ok-accent` `#12805c` vs `--cet-no-accent` `#c0392b` (claro) | 1.11 | 1.68 | **1.10** |
| `--cet-ok-accent` `#5fd39f` vs `--cet-no-accent` `#ff8a80` (oscuro) | 1.23 | 1.65 | **1.07** |
| `--success` vs `--danger` de `apps/web` (oscuro) | 1.14 | 1.62 | **1.05** |
| `--cet-ok-bg` `#e7f6ee` vs `--cet-no-bg` `#fdeeec` (claro) | — | — | **1.01** |
| `--cet-ok-bg` `#102a20` vs `--cet-no-bg` `#2b1512` (oscuro) | — | — | 1.09 |

Bajo deuteranopía, `#12805c` se convierte en `#6e6e5e` y `#c0392b` en `#77771e`. **Verde de acierto
y rojo de error son el mismo color.** Los fondos de acierto y error, a 1.01:1, son
indistinguibles incluso para visión normal en cuanto a luminancia; lo único que los separa es el
tono, y el tono es justo lo que falta.

Esto no es un defecto del contraste —los pares texto/fondo dentro de cada recuadro cumplen AA con
holgura, 7.16:1 y 7.30:1— sino de 1.4.1. Y el proyecto, en general, lo ha resuelto bien. Auditoría
componente a componente:

| Componente | Canal aparte del color | Veredicto |
|---|---|---|
| `CorrectFeedback` | Icono círculo+check, título de texto, `LiveRegion` | **Correcto** |
| `IncorrectFeedback` | Icono círculo+barra+punto, título de texto, `LiveRegion` | **Correcto** |
| `QuestionNavigator` | Check dibujado en "respondida", punto en "marcada", estado en el nombre accesible | **Correcto** — es el modelo a imitar |
| `ExamTimer` | Fase en color **y** en texto explicativo, `data-phase`, `LiveRegion` | **Correcto** |
| `CalloutBox` (rule/tip/warning) | Rótulo de texto ("Regla", "Truco"…) y `aria-label` | **Correcto**, salvo con `hideLabel` |
| `ChoiceList` — estado *seleccionado* | Borde grueso, relleno del indicador, `aria-checked` | **Correcto** (pero ver O1: en oscuro el borde no contrasta) |
| **`ChoiceList` — estado de *revisión*** | **Solo color de borde y de fondo** | **FALLA 1.4.1** |
| **`QuestionCard` — `flagged`** | **Solo borde ámbar de 2 px** | **FALLA 1.4.1 + 1.4.11 (2.04:1)** |
| `StreakMeter` | Relleno vs. hueco (diferencia de forma) | Pasa 1.4.1; falla 1.4.11 (C1) |
| `CalloutBox` con `hideLabel: true` | Solo barra de color y fondo | Riesgo: el tipo de bloque queda en el color |

`ChoiceList.REVIEW_STYLES` mapea `correct` / `incorrect` / `missed` a tres pares de color sin
ningún glifo:

```
correct:   border-[var(--cet-ok-accent)]   bg-[var(--cet-ok-bg)]
incorrect: border-[var(--cet-no-accent)]   bg-[var(--cet-no-bg)]
missed:    border-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)]
```

Un alumno deuteranope revisando su examen ve tres filas idénticas. **No puede saber cuál acertó.**
Es el fallo funcional más serio del inventario, por encima incluso de O1, porque O1 degrada una
señal que tiene respaldo y este elimina la única que hay.

---

## 4. Propuesta de tokens

Criterio de mínima intervención: se conservan todos los nombres existentes. Se propone **un solo
token nuevo**, `--cet-amber-ui`, justificado en §4.3. Se cambian **cinco valores en claro** y
**cuatro en oscuro**. Todo lo demás queda como está.

### 4.1 Cambios propuestos — tema claro

| Token | Actual | Propuesto | Motivo | Verificación |
|---|---|---|---|---|
| `--cet-border-strong` | `#7d92a8` | **`#6d7f93`** | C4, C4b | 4.11 / surface · 3.93 / surface-2 · **3.83 / bg** · **3.66 / surface-3** · 3.88 / tip-bg · 3.65 / no-bg |
| `--cet-example-border` | `#c8d6e4` | **`#7d8fa2`** | C5 | 3.24 / example-bg · 3.32 / surface |
| `--cet-tip-accent` | `#f2a71b` | **`var(--cet-amber-ui)`** | C2 | 4.01 / tip-bg · 4.24 / surface |
| `--cet-hint-accent` | `#f2a71b` | **`var(--cet-amber-ui)`** | C3, C3b | 4.01 / hint-bg · 4.24 / surface · 3.95 / bg |
| `--cet-amber-ui` | *(nuevo)* | **`#a86f14`** | §4.3 | ver tabla completa abajo |
| `--cet-amber` | `#f2a71b` | *sin cambio* | Queda como **relleno decorativo con texto oscuro encima**, uso en el que sí cumple: `--cet-on-amber` `#3a2a00` sobre él da 6.83:1 | 6.83 |

`--cet-amber-ui` `#a86f14`, contra **todas** las superficies claras del sistema:

| Fondo | Ratio | ≥3:1 |
|---|---|---|
| `--cet-surface` `#ffffff` | 4.24 | sí |
| `--cet-surface-2` `#f7fafd` | 4.05 | sí |
| `--cet-surface-3` `#eef2f7` | 3.77 | sí |
| `--cet-bg` `#f4f7fb` | 3.95 | sí |
| `--cet-tip-bg` / `--cet-hint-bg` `#fff8e6` | 4.01 | sí |
| `--cet-rule-bg` `#eef6fb` | 3.88 | sí |
| `--cet-ok-bg` `#e7f6ee` | 3.80 | sí |
| `--cet-no-bg` `#fdeeec` | 3.76 | sí |
| `--cet-example-bg` `#fbfcfe` | 4.13 | sí |

### 4.2 Cambios propuestos — tema oscuro

| Token | Actual | Propuesto | Motivo | Verificación |
|---|---|---|---|---|
| `--cet-primary` | `#2b5f96` | **`#4478b4`** | O1, O1b | **3.61 / surface** · **3.25 / rule-bg** · 3.99 / bg · blanco encima **4.57** |
| `--cet-primary-hover` | `#3775b6` | **`#3d6ba1`** | Debe **oscurecer**, no aclarar | blanco encima 5.50 · 3.00 / surface |
| `--cet-border-strong` | `#6c8298` | **`#7a90a6`** | O3, salir del filo | **3.65 / surface-3** · 5.00 / surface · 5.53 / bg |
| `--cet-example-border` | `#34506b` | **`#5a7896`** | O2 | 3.29 / example-bg · 3.58 / surface |
| `--cet-amber-ui` | *(nuevo)* | **`#c99a2e`** | O4 | 6.40 / surface · 1.59 contra el relleno `#f6c453` |

**Sobre `--cet-primary` en oscuro: las restricciones lo fijan casi sin margen.** El valor tiene que
cumplir tres cosas a la vez: ≥3:1 contra `--cet-surface` (es un borde), ≥3:1 contra `--cet-rule-bg`
(el propio estado seleccionado pinta ese fondo debajo), y ≥4.5:1 con el texto que lleva encima
cuando es relleno de botón. La ventana es estrecha:

| Candidato | / surface | / rule-bg | blanco encima | Veredicto |
|---|---|---|---|---|
| `#2b5f96` (actual) | 2.50 | 2.25 | 6.60 | falla el borde |
| `#3a6ea8` | 3.12 | **2.81** | 5.28 | falla contra rule-bg |
| **`#4478b4`** | **3.61** | **3.25** | **4.57** | **cumple los tres** |
| `#4d7cb0` | 3.79 | 3.41 | **4.35** | falla el texto |
| `#5183bb` | 4.17 | 3.76 | **3.95** | falla el texto |

`#4478b4` es prácticamente el único punto de esa recta que satisface todo. Con blanco a 4.57:1 el
margen es de 0.07 — **es un filo, y debe anotarse como tal**. La alternativa robusta, si se quiere
holgura, es desacoplar: dejar el relleno de botón en un token y el borde de selección en otro. No se
propone porque añade un token para un problema que un solo valor resuelve; pero si el diseño cambia
las superficies oscuras, este par es lo primero que se rompe.

`--cet-primary-hover` **debe ir hacia abajo, no hacia arriba**. Hoy el hover (`#3775b6`) es más
claro que la base, lo cual reduce el contraste del texto blanco de 6.60 a 4.79. Con la base en
`#4478b4` (4.57), aclarar rompería AA. `#3d6ba1` da 5.50 con blanco y 3.00 contra la superficie
—exactamente en el umbral. Se acepta porque el estado por defecto ya identifica el componente a
3.61:1 y el hover es transitorio, pero **conviene además dibujar el botón primario con un borde
explícito de `--cet-primary`**, para que su límite nunca dependa solo del relleno.

### 4.3 Justificación del único token nuevo: `--cet-amber-ui`

El ámbar tiene un problema de geometría, no de gusto: **ningún color que siga leyéndose como ámbar
alcanza 3:1 contra blanco.** `#f2a71b` da 2.04:1. Para llegar a 3:1 hay que bajar hasta la zona del
ocre. Las opciones son tres y hay que elegir una explícitamente:

1. Usar `--cet-amber-text` `#8a6100` también para los usos no textuales. Cumple (5.54:1 contra
   blanco) pero es marrón: el sistema pierde el amarillo como categoría visible y "truco" deja de
   distinguirse de "regla" de un vistazo, que es justo lo que la señalización necesita (§1.1).
2. Aceptar el fallo. No.
3. Añadir un valor intermedio, exclusivo para trazos y bordes, que llegue a 3:1 en todas las
   superficies y siga leyéndose como ámbar oscuro. Es `--cet-amber-ui` `#a86f14`.

Se elige la 3. El token existente `--cet-amber` **no desaparece**: sigue siendo el relleno
decorativo, donde su ratio no importa porque el texto que lleva encima es `--cet-on-amber` a
6.83:1. Queda así una tríada explícita y comprobable:

| Token | Para qué | Umbral que cumple |
|---|---|---|
| `--cet-amber` | relleno de superficie con texto oscuro encima | 6.83:1 con `--cet-on-amber` |
| `--cet-amber-ui` | **trazos, bordes, barras de acento, puntos, iconos** | ≥3.76:1 contra toda superficie clara |
| `--cet-amber-text` | texto | ≥5.23:1 |

Restricción que hay que escribir en el comentario del token: **`--cet-amber-ui` nunca lleva texto
encima.** Blanco sobre `#a86f14` da 4.24:1 y `--cet-on-amber` da 3.28:1; ninguno de los dos llega a
4.5.

Esta tríada es la misma idea que `tokens.css` ya aplica al teal (`--cet-teal` decorativo 3.44:1 /
`--cet-teal-text` legible 6.03:1). La propuesta no inventa un patrón: **termina de aplicar el que
ya existe**, y que el ámbar se saltó.

### 4.4 Lo que NO se toca, y por qué

- **Toda la escala de tinta y superficies.** `--cet-ink` da 14.67–16.49:1 en claro y 10.40–15.75:1
  en oscuro. `--cet-ink-muted` da 4.53–5.09:1 en claro (al límite en `surface-3`, pero pasa) y
  5.93–8.98:1 en oscuro. No hay razón para moverlo.
- **Los pares de feedback.** 7.16:1, 7.30:1 y 7.37:1 en claro; 9.58:1, 9.00:1 y 10.91:1 en oscuro.
  Están por encima de AAA. El problema del feedback no es contraste, es §5.
- **`--cet-line`** (1.26:1). Es un separador decorativo y el comentario del fichero ya lo declara.
  Correcto tal cual.
- **El doble anillo de foco.** Ver §3.1: es correcto y la razón es contraintuitiva.
- **Los tokens de temporizador.** 5.23:1 y 4.82:1 en claro, 10.91:1 y 9.00:1 en oscuro, y el
  componente ya evita el parpadeo por 2.3.1. Bien resuelto.
- **`--cet-touch-min` / `--cet-touch-comfy`.** 44/52 px contra los 24 px de 2.5.8. Bien resuelto.
- **`--cet-teal`.** 3.44:1 como objeto gráfico: cumple.

### 4.5 Reunificación de las dos paletas

No es una propuesta de color; es la condición para que cualquier propuesta de color signifique algo.
Mientras `apps/web/src/app/globals.css` mantenga su juego paralelo, medir `tokens.css` describe un
sistema que la aplicación no ejecuta.

Lo que se propone (no implementado aquí):

1. `globals.css` importa `@cet/ui/tokens.css` y **borra** sus definiciones de `--brand`,
   `--brand-deep`, `--brand-bright`, `--teal`, `--amber`, `--success`, `--danger`, `--surface`,
   `--surface-alt`, `--card`, `--ink`, `--muted`, `--line`, `--ring`, `--on-brand`.
2. El bloque `@theme inline` reapunta cada utilidad al token `--cet-*` equivalente. Los nombres de
   clase de la app (`text-muted`, `bg-card`, `border-line`) **se conservan como alias** para no
   reescribir cada página en el mismo cambio.

   | Alias de la app | Token de `@cet/ui` |
   |---|---|
   | `--color-surface` | `--cet-bg` |
   | `--color-surface-alt` | `--cet-surface-3` |
   | `--color-card` | `--cet-surface` |
   | `--color-ink` | `--cet-ink` |
   | `--color-muted` | `--cet-ink-muted` |
   | `--color-line` | `--cet-line` |
   | `--color-brand` | `--cet-primary` |
   | `--color-on-brand` | `--cet-on-primary` |
   | `--color-success` / `--color-danger` | `--cet-success` / `--cet-danger` |
   | `--color-amber` | `--cet-amber` (relleno) / `--cet-amber-ui` (trazo) |

3. La regla `:focus-visible` de `globals.css` adopta el **doble anillo** de `tokens.css`. Esto
   resuelve A1: el fallo de 1.57:1 existe precisamente porque la app usa anillo simple con
   `--ring` teal, sin halo que lo rescate.

Hay una decisión de fondo que esta reunificación fuerza y conviene tomar a conciencia: **el color
de foco pasa de teal a navy.** Es un cambio visible. Se propone así porque el anillo teal
(`#0f9b8e`, 3.20:1 contra el fondo de página en claro) tiene menos margen que el navy (10.73:1), y
porque en oscuro el teal contra la marca da 1.57:1.

---

## 5. Criterio para el color con significado

**Regla, no recomendación: ningún estado se comunica solo con color.** Cada estado con significado
declara tres canales, y los tres son obligatorios.

| Canal | Qué es | Por qué |
|---|---|---|
| **Forma** | Un glifo SVG o una diferencia geométrica (grosor de borde, relleno/hueco, posición) | Único canal que sobrevive a cualquier deficiencia de visión del color y a una pantalla mal calibrada |
| **Texto** | Un nombre accesible o un rótulo visible que diga el estado | Único canal que llega al lector de pantalla |
| **Color** | El token semántico | Rápido de leer para quien lo ve. Es el **tercero** en importancia, no el primero |

Y una regla de contraste que va con ella: el glifo es un objeto gráfico y necesita **3:1 contra su
fondo**. Dibujarlo con `currentColor` sobre un token de texto que ya cumple 4.5:1 lo garantiza sin
esfuerzo, que es lo que ya hacen `CorrectFeedback` e `IncorrectFeedback`.

### 5.1 Mapa de estados propuesto

| Estado | Forma | Texto | Color (claro / oscuro) |
|---|---|---|---|
| Acierto | Círculo con **check** | "Correcto" / "Correct" | `--cet-ok-*` |
| Error | Círculo con **barra y punto** (no aspa) | "Casi" / "Not quite" | `--cet-no-*` |
| Pista / sugerencia | **Interrogación** en círculo | "Pista" / "Hint" | `--cet-hint-*` |
| Aviso de contenido | **Triángulo** | "Cuidado con esto" | `--cet-warning-*` |
| Regla | **Barra izquierda de 4 px** | "Regla" | `--cet-rule-*` |
| Ejemplo | **Borde discontinuo** | "Ejemplo" | `--cet-example-*` |
| Marcado para revisar | **Banderín** + esquina recortada | "Marcada" en el nombre accesible | `--cet-amber-ui` |
| Respondida (navegador) | **Check en esquina** | "respondida" en el nombre accesible | `--cet-ok-*` |
| Sin responder | **Sin glifo** (la ausencia es la forma) | "sin responder" | neutro |
| Pregunta actual | **Anillo grueso**, no un color más | `aria-current` | `--cet-focus` |
| Tiempo: aviso | Sin cambio de forma | Frase explicativa visible | `--cet-timer-warn` |
| Tiempo: urgente | Sin cambio de forma | Frase explicativa visible, más urgente | `--cet-timer-urgent` |
| Progreso | Fracción numérica **escrita** (`7 / 12`) | siempre | neutro |

Nota sobre el error: **el aspa roja no se usa.** No por psicología del color (§2.1) sino por la
razón que `IncorrectFeedback` ya documenta —el objetivo de la práctica es que el alumno siga
intentándolo— y porque una barra-y-punto es tan distinguible como un aspa bajo cualquier
deficiencia de color.

### 5.2 Los tres arreglos concretos que exige esta regla

1. **`ChoiceList.REVIEW_STYLES` necesita un glifo por estado.** Es el fallo de §3.4. Cada fila de
   revisión debe llevar, además del par de color, un icono en la fila y el estado en el nombre
   accesible de la opción:

   | Estado de revisión | Glifo | Nombre accesible añadido |
   |---|---|---|
   | `correct` | check | "correcta" / "correct" |
   | `incorrect` | barra y punto | "tu respuesta, incorrecta" / "your answer, incorrect" |
   | `missed` | interrogación | "no marcada, era correcta" / "not selected, was correct" |

   Requiere strings nuevos en `UI_STRINGS` (AD-7: nada literal en el componente).

2. **`QuestionCard` con `flagged` necesita una segunda señal.** Hoy es solo el borde ámbar a
   2.04:1. Propuesta: `--cet-amber-ui` para el borde (pasa a 4.24:1) **y** un banderín visible en
   la cabecera de la tarjeta, no solo en el botón. El botón de marcar ya expone `aria-pressed`;
   falta que la tarjeta lo diga.

3. **`CalloutBox` con `hideLabel: true` deja el tipo de bloque en el color.** El rótulo sigue
   llegando al lector de pantalla, así que 1.4.1 se cumple en sentido estricto; pero un alumno
   vidente con deuteranomalía pierde la distinción regla/truco/aviso. Propuesta: cuando
   `hideLabel` esté activo, el recuadro debe llevar el glifo de su tono. Es decir, `hideLabel`
   oculta la **palabra**, nunca la **forma**.

---

## 6. Tipografía

### 6.1 Estado actual

La pila es `"Segoe UI", system-ui, -apple-system, Arial, sans-serif`. Es defendible: es lo que se
ve en los portátiles Windows del colegio, y coincide con los trainers Y6A ya validados. **No se
propone cambiarla**, y explícitamente no se propone ninguna fuente "para dislexia" (§2.2).

Con una salvedad que hay que anotar: en las **tabletas compartidas**, si son iPad, `Segoe UI` no
existe y la pila cae a `system-ui`, es decir San Francisco. Las métricas cambian —altura de la x,
anchos— y con ellas la longitud de línea real. Los dos parques de dispositivos no ven la misma
tipografía. No es grave, pero cualquier medición de legibilidad hecha en un portátil no es
trasladable a la tableta sin comprobarlo.

Problemas medibles:

| # | Problema | Número |
|---|---|---|
| T1 | El cuerpo del preset es **15.5 px** | Por debajo del suelo de 16 px de la BDA |
| T2 | `/learn/[lessonId]` usa `text-sm` (14 px) y `text-xs` (12 px) de Tailwind estándar | Por debajo del suelo que el propio preset se fijó ("el cuerpo no baja de 15px") y del de la BDA |
| T3 | **Longitud de línea sin límite.** `max-w-5xl` (1024 px) menos `px-4` deja 992 px de columna | ≈ **128 caracteres por línea** a 15.5 px. El rango recomendado es 45–70 |
| T4 | La prosa de lección se pinta sobre `--cet-surface` `#ffffff` | Blanco puro; la BDA recomienda evitarlo en lectura sostenida |

**T3 es el defecto tipográfico más grave y el más barato de arreglar.** 128 caracteres es casi el
doble del límite superior recomendado y casi el triple del óptimo para lectores noveles. Ningún
ajuste de color compensa una línea de ese ancho.

### 6.2 Escala propuesta

Se conservan los nombres del preset. Los valores suben para cumplir el suelo de 16 px y se fija la
medida de la columna.

| Token del preset | Actual | Propuesto | Interlineado | Uso |
|---|---|---|---|---|
| `body-sm` | 14.5 px / 1.55 | **15 px / 1.55** | 1.55 | Metadatos, pies de figura |
| `body` | 15.5 px / 1.6 | **17 px / 1.6** | 1.6 | Prosa de lección, opciones de respuesta |
| `body-lg` | 17 px / 1.6 | **19 px / 1.6** | 1.6 | Introducción de lección |
| `stem` | 20 px / 1.5 | **21 px / 1.5** | 1.5 | Enunciado de examen |
| `stem-lg` | 26 px / 1.35 | **30 px / 1.3** | 1.3 | Enunciado corto de práctica |
| *(nuevo)* `--cet-measure` | — | **62ch** | — | Ancho máximo de columna de prosa |

Justificación de cada número:

- **17 px de cuerpo** cae dentro del 16–19 px de la BDA, y hacia la parte baja del rango, que es
  donde conviene estar cuando el contenido tiene tablas y fracciones apiladas que crecen con él.
- **1.6 de interlineado** supera el 1.5 de la BDA y el 1.5× exigido por WCAG 1.4.12. Ya es el valor
  de `globals.css` para `body`; se hace explícito en el token.
- **62ch** cae en 45–70. A 17 px son ≈ 527 px de columna, frente a los 992 px actuales. No obliga a
  cambiar `max-w-5xl` en el layout: el contenedor sigue igual y la **prosa** se limita dentro.
- **30 px en `stem-lg`** con interlineado 1.3: son operaciones cortas que se leen de un vistazo,
  donde el interlineado generoso separa en vez de agrupar.

**Riesgo que hay que declarar:** subir el cuerpo de 15.5 a 17 px reflowea toda la aplicación.
Tablas de lección, `MatchingGrid`, `OrderingList` y las rejillas del panel de profesor pueden
desbordar en anchos estrechos. Esto **no se puede aprobar sobre el papel**: requiere revisión
visual en 360 px, en tableta y en portátil de colegio antes de fusionarse.

Y una alternativa más segura si ese riesgo no es aceptable ahora: **arreglar T3 y T2 primero, dejar
T1 para después.** Limitar la línea a 62ch y subir la página de lección de 14/12 px a los tokens
del sistema son cambios locales, y de los cuatro problemas, T3 es el que más pesa.

### 6.3 Otras reglas tipográficas

- **Números tabulares** en temporizador, puntuaciones y respuestas numéricas. Ya se hace
  (`tabular-nums` en `ExamTimer` y `StreakMeter`, `font-variant-numeric` en `globals.css` para
  `input[inputmode="numeric"]`). Extender a los marcadores de progreso.
- **Nada en versalitas para texto largo.** Los rótulos de `CalloutBox` y `QuestionCard` usan
  `uppercase tracking-wide` a 12 px; es aceptable para una etiqueta de dos palabras, no para nada
  más largo. Además, 12 px es el tamaño más pequeño del sistema y va con `--cet-ink-muted`, que en
  claro sobre `surface-3` está a 4.53:1. Pasa, sin margen.
- **Sin justificado.** El texto justificado crea ríos de espacio; la BDA lo desaconseja
  explícitamente. Alineación a la izquierda siempre.
- **Fondo de la prosa larga:** para el cuerpo de lección se propone `--cet-surface-2` `#f7fafd` en
  lugar de `#ffffff` (T4). `--cet-ink` da 15.74:1 sobre él y `--cet-ink-muted` 4.86:1: ambos siguen
  cumpliendo. Es un ajuste de confort de bajo riesgo, **no un tratamiento** (§2.3).

---

## 7. Los tres contextos

Misma paleta, tres presupuestos de estimulación distintos. La diferencia no es decorativa: cada
contexto tiene una tarea cognitiva distinta y la interfaz debe gastar la atención del alumno en esa
tarea.

### 7.1 LECCIÓN — lectura sostenida

**Tarea:** construir un esquema nuevo. El enemigo es la carga extrínseca.

| Decisión | Valor | Por qué |
|---|---|---|
| Longitud de línea | **62ch** máximo | §6.1 T3 |
| Cuerpo | `body` 17 px / 1.6 | §6.2 |
| Fondo de prosa | `--cet-surface-2` | §6.3 |
| Color con significado | **Sí, y aquí es donde más rinde** | Señalización (§1.1): el tipo de bloque es información |
| Colores permitidos | `rule`, `example`, `tip`, `warning` + tinta y superficies | Cuatro categorías, un color cada una |
| Colores **prohibidos** | `ok`, `no`, `hint`, `timer` | No hay nada correcto ni incorrecto en una lección |
| Movimiento | Ninguno salvo transiciones de foco y de acordeón | Coherencia (§1.2) |
| Decoración | Ninguna | Detalles seductores (§1.2) |

Contra la tentación de "alegrar la lección": el nivel de estimulación correcto es medio (§1.3), y
en esta pantalla ya lo aportan cuatro tipos de recuadro con color propio, las figuras SVG y las
tablas. Añadir más es pasarse de la cresta de la U.

### 7.2 PRÁCTICA — retroalimentación inmediata

**Tarea:** consolidar por recuperación. El bucle rápido es el mecanismo; el color solo lo etiqueta.

| Decisión | Valor | Por qué |
|---|---|---|
| Enunciado | `stem-lg` 30 px, centrado, `text-wrap: balance` | Operaciones cortas, lectura de un vistazo |
| Feedback | `ok` / `no` / `hint` **con glifo y con texto** | §5 |
| Latencia del feedback | < 50 ms, cliente (AD-5) | El feedback inmediato es lo que engancha, no los efectos |
| `StreakMeter` | Se mantiene tal cual: puntos que se llenan, sin confeti | §2.4. **No se propone ampliarlo** |
| Ruptura de racha | Los puntos se vacían, **sin color de error** | Ya es el comportamiento. Es correcto: la racha no es una evaluación |
| Movimiento | Solo `duration-fast` en cambios de color, anulado por `prefers-reduced-motion` | Ya está |
| Colores **prohibidos** | `timer-*` | La práctica no se cronometra |

Sobre el `StreakMeter`: la evidencia sobre gamificación (§2.4) no dice "quítalo", dice "no lo
amplíes y no lo conviertas en el motivo". El diseño actual —refuerzo, no presión— es exactamente el
punto donde conviene detenerse. La única corrección es de contraste: el punto lleno debe usar
`--cet-amber-ui` (C1).

### 7.3 EXAMEN — mínima distracción

**Tarea:** rendir bajo tiempo. El enemigo es todo lo demás.

| Decisión | Valor | Por qué |
|---|---|---|
| Colores semánticos de resultado | **Prohibidos durante el intento** | La clave no sale de la base de datos hasta la revisión (AD-5): no hay nada que colorear |
| Feedback inmediato | Ninguno | Ídem |
| `StreakMeter` y cualquier gamificación | **Ausentes** | §2.4 |
| "Progreso" | **Respondidas / total**, nunca "aciertos" | Contar aciertos durante el examen es filtrar la clave |
| Selección | Borde grueso + indicador relleno + `aria-checked` | Tres canales, ya implementado. Requiere O1 |
| Marcado para revisar | `--cet-amber-ui` + banderín + nombre accesible | §5.2 |
| Navegador de preguntas | `ok`/`hint` **solo como código de estado de respuesta**, con glifo | Ya implementado y correcto |
| Temporizador | `normal` → `warn` (5 min) → `urgent` (1 min), con frase explicativa | Ya implementado |
| Parpadeo | **Ninguno** | WCAG 2.3.1, y ya está documentado en `ExamTimer` |
| Enunciado | `stem` 21 px, alineado a la izquierda | Los problemas de examen son más largos que los de práctica |
| Densidad | Una pregunta por tarjeta | Coherencia (§1.2) |

**Un matiz que conviene precisar**, porque el enunciado del encargo lo pide y porque es fácil
justificarlo mal: en el navegador de preguntas, `--cet-ok-bg` marca "respondida", no "acertada". Es
el mismo token verde con un significado distinto en un contexto distinto — lo que §1.1 dice que hay
que evitar. Se acepta con dos condiciones: (a) el glifo es un check, que en contexto de examen
significa "hecho", no "bien"; (b) el nombre accesible dice literalmente "respondida", nunca
"correcta". Es una tensión real del sistema, no una decisión limpia, y queda anotada como tal en
HUECOS.

En la **revisión posterior al examen** —una pantalla distinta, con la clave ya liberada— el verde
vuelve a significar acierto, con glifo y con texto (§5.2, punto 1).

---

## 8. Qué NO se propone, y por qué

| Propuesta descartada | Por qué |
|---|---|
| Cambiar la paleta de marca (navy / teal / ámbar) | Viene de los trainers Y6A ya validados con alumnos reales. Cambiarla por gusto tira ese aval y no arregla ningún fallo medido |
| Una fuente "para dislexia" | §2.2: Dyslexie no mejora la lectura; OpenDyslexic la empeoró frente a Arial |
| Un selector de color de fondo por alumno (láminas digitales) | §2.3: evidencia controvertida y beneficio limitado a una fracción pequeña. Coste de producto alto (preferencia persistida, RLS, sincronización entre dispositivos) para un beneficio no demostrado |
| Modo "alto contraste" propio | La tinta ya está en 14.67–16.49:1 en claro y 10.40–15.75:1 en oscuro. Un tercer tema triplica la superficie de prueba para ganar poco. Si aparece necesidad real, `forced-colors` del sistema operativo es la vía correcta |
| Colores por asignatura o por curso | Añade una dimensión de color sin información pedagógica y compite con el mapa de §5.1. Es exactamente la clase de color que resta (§1.2) |
| Ilustraciones o mascota en la lección | Detalles seductores (§1.2): efecto negativo medio en transferencia |
| Confeti, insignias, tabla de clasificación | §2.4. Y una tabla de clasificación en primaria tiene además un coste socioemocional que este documento no está cualificado para evaluar |
| Bajar el objetivo táctil a los 24 px de WCAG 2.5.8 | 44/52 px es lo correcto para dedos de 10 años en una tableta compartida. 24 px es el mínimo legal, no el objetivo |
| Aspa roja para el error | §5.1 |
| Sustituir el doble anillo de foco por uno simple | §3.1: parece redundante y no lo es. Y §3.3 A1 muestra qué pasa cuando falta el halo |
| Cambiar `--cet-line` para que cumpla 3:1 | Es un separador decorativo, no un componente. El token que sí debe cumplirlo es `--cet-border-strong`, y se corrige |

---

## 9. Resumen de acciones propuestas, por prioridad

Nada de esto está implementado. El orden refleja daño funcional, no esfuerzo.

**Bloqueantes (rompen la función para alguien):**

1. Glifos en `ChoiceList.REVIEW_STYLES` — §5.2.1. Hoy un alumno con deuteranopía no puede leer su
   propia revisión (§3.4, 1.01:1).
2. `--cet-primary` oscuro `#2b5f96` → `#4478b4` — O1. La opción seleccionada del examen no se
   distingue en tema oscuro.
3. Foco de `apps/web` con doble anillo y color navy — A1. Hoy 1.57:1 sobre el botón de marca en
   oscuro: navegación por teclado sin indicador visible.
4. `QuestionCard.flagged`: `--cet-amber-ui` + banderín — §5.2.2, C3b.

**Contraste (fallan AA, sin bloquear la función):**

5. `--cet-amber-ui` `#a86f14` / `#c99a2e`, y repuntar `tip-accent` y `hint-accent` — C1, C2, C3.
6. `--cet-border-strong`: `#6d7f93` en claro, `#7a90a6` en oscuro — C4, C4b, O3.
7. `--cet-example-border`: `#7d8fa2` en claro, `#5a7896` en oscuro — C5, O2.

**Estructural:**

8. Reunificar `globals.css` con `tokens.css` — §4.5. Sin esto, medir `tokens.css` describe un
   sistema que la aplicación no ejecuta.

**Tipografía:**

9. `--cet-measure: 62ch` en la prosa de lección — T3, de 128 caracteres por línea a ~62.
10. Sustituir `text-sm` / `text-xs` de la página de lección por tokens del sistema — T2.
11. Subir la escala a 17 px de cuerpo — T1. **Requiere revisión visual previa** (§6.2).
12. Prosa de lección sobre `--cet-surface-2` — T4.

**Documentación:**

13. Ampliar `packages/ui/REVIEW.md` §1 con los pares que hoy no mide, incluidos los que fallan.
    Una tabla de contrastes que solo lista los pares que pasan da falsa seguridad, y es la razón
    por la que estos siete defectos han sobrevivido.

---

## 10. HUECOS

Lo que este documento **no** ha podido determinar. Un hueco declarado vale más que una
recomendación inventada.

**No verificado con usuarios ni con dispositivos reales**

1. **Nada de esto se ha probado con un niño.** Todos los números son cálculos sobre valores
   hexadecimales y todas las recomendaciones tipográficas vienen de guías profesionales y revisión
   de literatura general. No hay una sola medición hecha sobre este producto con esta población.
2. **El cuerpo de 17 px es una elección dentro del rango de la BDA, no un resultado medido.** El
   rango 16–19 px no dice dónde caer. Se necesitaría una prueba A/B de comprensión y tiempo de
   lectura en 17 vs 19 px con alumnos de Year 6 y contenido real para decidirlo con datos.
3. **62ch es una elección dentro de un rango con recomendaciones en conflicto.** El rango general
   es 50–75; la BDA dice 60–70; la literatura sobre lectores noveles apunta a 34–60 con ~45 como
   óptimo. Un niño de 11 años que lee matemáticas en su segunda lengua puede estar más cerca del
   rango de novel que del general. 62 es un compromiso, no una conclusión.
4. **No se ha medido nada en las tabletas reales del colegio.** Ni el modelo, ni el brillo típico
   de uso, ni la calibración, ni si son iPad (en cuyo caso la tipografía es San Francisco y no
   Segoe UI, §6.1). El contraste calculado supone una pantalla sRGB en condiciones razonables; una
   tableta compartida a brillo bajo bajo fluorescentes de aula no es eso. Los pares que pasan por
   poco —`--cet-ink-muted` a 4.53:1, `--cet-primary` oscuro con blanco a 4.57:1— son los que se
   caen primero en el mundo real.

**Restricciones técnicas no resueltas**

5. **`--cet-primary` en oscuro no tiene holgura.** `#4478b4` cumple las tres restricciones con un
   margen de 0.07 sobre el umbral de texto. Es el valor correcto hoy y es frágil ante cualquier
   cambio de las superficies oscuras. La solución robusta —separar el token de relleno del token de
   borde— se ha descartado por parsimonia, y esa decisión puede ser la equivocada.
6. **`--cet-primary-hover` oscuro `#3d6ba1` da exactamente 3.00:1 contra la superficie.** Justo en
   el umbral. Se argumenta que es aceptable porque el hover es transitorio, pero es un argumento,
   no una medición.
7. **La tensión verde-"respondida" / verde-"correcta" no está resuelta limpiamente** (§7.3). Se
   propone mitigarla con el glifo y el nombre accesible, pero es una violación consciente del mapa
   estable color → significado de §1.1. Una alternativa —usar un neutro para "respondida" y
   reservar el verde para el acierto— no se ha explorado en detalle y podría ser mejor.
8. **No se ha auditado el panel de profesor ni el de administrador.** Los tokens son los mismos,
   pero los patrones de uso son otros: tablas densas, gráficas, estados de intento. Es previsible
   que ahí aparezcan usos del color como único portador (una gráfica de barras por alumno, una
   tabla de estados) que este documento no ha inventariado.
9. **No se ha auditado el contenido de la base de datos.** El HTML de las lecciones viene de
   `lesson_blocks.content` y de los packs Y6A. Si ese HTML trae colores en línea, ningún token los
   controla. No se ha comprobado si el sanitizador permite atributos `style` o `color`.
10. **Las gráficas y figuras SVG (`kind: "interactive"`, `body.figureSvg`) no están cubiertas.**
    Un SVG con series codificadas solo por color reintroduce el problema de §3.4 por debajo del
    sistema de tokens. Haría falta una regla para el contenido, no solo para los componentes.

**Preguntas abiertas sobre la evidencia**

11. **La traslación del estudio HEAD (§1.3) a una interfaz es una analogía.** Mide aulas físicas.
    No hay evidencia directa de que exista una U invertida equivalente en densidad cromática de
    pantalla, y la afirmación "estimulación media" se usa aquí como heurística razonable, no como
    resultado.
12. **No se ha localizado literatura específica sobre color y carga cognitiva en interfaces de
    examen para primaria.** La decisión de §7.3 se apoya en coherencia (§1.2) y en integridad del
    examen (AD-5), que son argumentos sólidos, pero no en un estudio del caso concreto. Si existe,
    no se ha encontrado.
13. **Ninguna de las cifras de contraste se ha verificado con una herramienta independiente.** Se
    han calculado con la fórmula de WCAG 2.2 implementada para este documento. La fórmula es
    trivial y los resultados coinciden con los 19 pares que `packages/ui/REVIEW.md` ya publicaba,
    lo cual es una validación cruzada parcial pero no una auditoría.
14. **La simulación de deficiencia de visión del color usa el modelo de Viénot (1999).** Es un
    modelo lineal estándar y adecuado para dicromacia (protanopía, deuteranopía), pero **no modela
    la anomalía tricromática** —deuteranomalía y protanomalía—, que es la forma más frecuente. Un
    deuteranómalo distinguirá el verde del rojo **mejor** que lo que muestran esas cifras. Los
    números de §3.4 son por tanto el peor caso, no el caso medio. Eso no cambia la conclusión —hace
    falta forma y texto de todos modos— pero sí la magnitud.

---

## 11. Fuentes

**Carga cognitiva y aprendizaje multimedia**

- Mayer, R. E. — *Principles for Reducing Extraneous Processing in Multimedia Learning: Coherence,
  Signaling, Redundancy, Spatial Contiguity, and Temporal Contiguity Principles.*
  https://www.researchgate.net/publication/262915119
- van Gog, T. — *The Signaling (or Cueing) Principle in Multimedia Learning*, cap. 17 de *The
  Cambridge Handbook of Multimedia Learning*.
  https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/signaling-or-cueing-principle-in-multimedia-learning/3972D4ACC628D5B53F7B2B4785DB2B06
- Ozcelik, E. et al. — *An eye-tracking study of how color coding affects multimedia learning.*
  *Computers & Education.* https://www.sciencedirect.com/science/article/abs/pii/S0360131509000712
- Schneider, S. et al. — *Signaling text-picture relations in multimedia learning: A comprehensive
  meta-analysis.* https://www.sciencedirect.com/science/article/abs/pii/S1747938X15000664
- Rey, G. D. (2012) — metaanálisis del efecto de los detalles seductores. Resumen y discusión:
  https://theelearningcoach.com/learning/seductive-details/

**Entorno físico de aprendizaje**

- Barrett, P. et al. — *Clever Classrooms: Summary report of the HEAD project*, University of
  Salford.
  https://eddesignaward.com/research/wp-content/uploads/2021/12/clever-classrooms-summary-report-of-the-head-the-project_peter-barrett.pdf

**Accesibilidad**

- W3C — *Web Content Accessibility Guidelines (WCAG) 2.2.* https://www.w3.org/TR/WCAG22/
- Colour Blind Awareness — *Types of Colour Blindness* (prevalencia 8 % / 0.5 %, 10–11 % en
  Escandinavia). https://www.colourblindawareness.org/colour-blindness/types-of-colour-blindness/
- Viénot, F., Brettel, H., Mollon, J. D. (1999) — modelo de simulación de dicromacia en espacio
  LMS, usado en §3.4.

**Tipografía y dislexia**

- British Dyslexia Association — *Dyslexia Style Guide 2023.*
  https://cdn.bdadyslexia.org.uk/uploads/documents/Advice/style-guide/BDA-Style-Guide-2023.pdf
- Kuster, S. M. et al. (2017) — *Dyslexie font does not benefit reading in children with or without
  dyslexia.* *Annals of Dyslexia.* https://pmc.ncbi.nlm.nih.gov/articles/PMC5934461/
- Edutopia — *Do Dyslexia Fonts Actually Work?* (resumen de la evidencia sobre OpenDyslexic)
  https://www.edutopia.org/article/do-dyslexia-fonts-actually-work/
- *Colors, colored overlays, and reading skills* (revisión sobre láminas de color e Irlen)
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4114255/
- Dyson, M. C. (2005) — *Optimal Line Length in Reading: A Literature Review.* *Visible Language.*
  https://journals.uc.edu/index.php/vl/article/view/5765
- Baymard Institute — *Readability: The Optimal Line Length.*
  https://baymard.com/blog/line-length-readability

**Mitos: color y motivación**

- Elliot, A. J. & Maier, M. A. (2007) — *Color and psychological functioning: the effect of red on
  performance attainment.* https://pubmed.ncbi.nlm.nih.gov/17324089/ (trabajo original)
- *Processing the Word Red and Intellectual Performance: Four Replication Attempts.* *Collabra:
  Psychology* (2020).
  https://online.ucpress.edu/collabra/article/6/1/3/113047/ (**réplicas fallidas**)
- *The power of red: The influence of colour on evaluation and failure — A replication.*
  https://pubmed.ncbi.nlm.nih.gov/31238175/ (réplica con resultado positivo; el conjunto es
  contradictorio)
- Huang, L. et al. (2023) — *Gamification enhances student intrinsic motivation, perceptions of
  autonomy and relatedness, but minimal impact on competency: a meta-analysis and systematic
  review.* *ETR&D.* https://link.springer.com/article/10.1007/s11423-023-10337-7

**Ficheros del proyecto leídos para el estado actual**

- `packages/ui/src/tokens.css`
- `packages/ui/src/tailwind-preset.ts`
- `packages/ui/REVIEW.md`
- `packages/ui/src/learning/` — `CalloutBox.tsx`, `LessonBlock.tsx`, `MathStem.tsx`
- `packages/ui/src/feedback/` — `CorrectFeedback.tsx`, `IncorrectFeedback.tsx`, `StreakMeter.tsx`
- `packages/ui/src/exam/` — `QuestionCard.tsx`, `ChoiceList.tsx`, `ExamTimer.tsx`,
  `QuestionNavigator.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/(student)/layout.tsx`
- `apps/web/src/app/(student)/learn/[lessonId]/page.tsx`
