# `prac-a-iconos` — resultado

Ficheros escritos (los dos del `territory`, ninguno más):

- `packages/ui/src/navigation/TopicIcon.tsx` — solo el mapa `PATHS` (y la
  cabecera, de la que se cae la nota de «ANDAMIO»: la geometría ya está).
- `packages/ui/__tests__/identidad-de-tema.test.tsx` — nuevo.

## 1 · Las once siluetas, en palabras

| clave | dibujo | por qué ése |
|---|---|---|
| `simplify` | **tijeras** (dos hojas cruzadas y dos anillas) | simplificar es cortar, no calcular |
| `compare` | **balanza de dos platos** (asta, base, brazo y dos platos triangulares) | comparar es pesar cuál es mayor |
| `fracop` | **signo de dividir** (barra con punto arriba y punto abajo) | es la barra de fracción con su cifra arriba y abajo; deliberadamente NO otra cruz, para no chocar con `math` |
| `mixed` | **una tarta entera y media tarta** (círculo completo + semicírculo con su diámetro) | eso es literalmente un número mixto: un entero y una parte |
| `decimal` | **tira de décimas** (rectángulo ancho partido por tres líneas verticales) | la unidad partida en partes iguales, que es de donde sale la coma |
| `powten` | **flecha en arco que salta por encima de un punto** | «se mueven las cifras, no la coma»: la flecha salta, el punto se queda |
| `metric` | **escalera de tres peldaños** | la escalera de km–m–cm que ya se sube y se baja en clase |
| `shape` | **figura en L con la costura a la vista** | dos rectángulos pegados, no un polígono cualquiera |
| `word` | **signo de interrogación** | el enunciado pregunta algo; deliberadamente NO un libro, para no chocar con `english` |
| `mix` | **dado con tres puntos** | `mix` no es un tema: es un sorteo entre los demás |
| `otro` | **rombo** | el tema que este design system aún no conoce |

Las tres reglas de `SubjectIcon` se cumplen: solo trazo con `currentColor`
(ni un hexadecimal, `fill="none"`), grosor 2 sobre lienzo 24, y `aria-hidden`.
Ninguna repite ni se acerca a las siete de materia (cruz, libro, bocadillo,
matraz, globo, pantalla, marcador): cada tema sale de una familia de objeto
distinta —herramienta, aparato, signo, tarta, escalera, dado— y no de una
variación del mismo trazo, que es donde se cae con los cuatro temas de
fracciones.

Comprobado además a ojo, renderizando las once a 64 px, a 24 px, a 20 px y en
escala de grises junto a las siete de materia (HTML desechable en el
scratchpad, no en el árbol). Ahí se corrigió `powten`: el arco original era
corto y la punta de flecha no se leía a 20 px; se abrió el arco y se alargó la
punta.

## 2 · Qué comprueba la prueba (42 casos)

1. **Todas las claves tienen dibujo.** Recorre `[...TOPIC_CODES, UNKNOWN_TOPIC]`
   —derivado del módulo, nunca copiado a mano— y exige `d` no vacía que empiece
   por `M`. Más un caso que ata el recuento a `TOPIC_CODES.length + 1`, para que
   un generador nuevo sin silueta ponga esto rojo solo.
2. **Las once son distintas dos a dos** (cadenas `d` crudas).
3. **Siguen siendo distintas sin el ruido de la escritura.** Se comparan
   normalizadas: comandos en mayúscula y números redondeados al lienzo de 24.
   Dos siluetas que solo se diferencien en un espacio, en una coma o en unas
   décimas de unidad colapsan aquí a la misma cadena.
4. **Ninguna pareja es la misma silueta con un punto movido.** Para cada par con
   el mismo esqueleto de comandos y el mismo número de coordenadas, se exige que
   discrepen en más de la mitad de sus números. Es la capa que persigue el
   copiar-pegar con retoque, que es como se «dibujan» diez iconos en diez
   minutos.
5. **Ninguna comparte trazo con una silueta de materia**, ni crudo ni
   normalizado: se importa `SubjectIcon` y se renderizan las siete más la neutra.
6. **Ni color propio ni anuncio**, clave a clave: sin hexadecimales en el
   `outerHTML`, `stroke="currentColor"`, `fill="none"`, `aria-hidden="true"`,
   `focusable="false"`, sin `<title>` ni `aria-label`, y `textoExpuesto()` vacío
   (el mismo lector de los tests de accesibilidad, no un selector).
7. **Una clave desconocida no revienta ni sale vacía**: `math.angles`, `""`,
   `SIMPLIFY` y `fracop2` pintan exactamente la silueta neutra.

Verde por código de salida:

```
pnpm --filter @cet/ui exec vitest run __tests__/identidad-de-tema.test.tsx   -> 0 (42 pasan)
pnpm --filter @cet/ui typecheck                                             -> 0
pnpm --filter @cet/ui lint                                                  -> 0
```

## 3 · La prueba de mutación

Tres mutaciones sobre `compare`, deshechas todas después (el fichero quedó
idéntico al de antes, verificado con copia de respaldo):

| mutación | resultado |
|---|---|
| `compare` = copia literal de la silueta de `simplify` | **ROJO**: caen los tres casos (crudas, normalizadas y punto movido) |
| `compare` = la de `simplify` con el último número de `4.2` a `4.3` (cadenas distintas) | **ROJO**: la comparación cruda PASA —como se temía— y caen las otras dos |
| `compare` = la de `simplify` con un punto movido 2,2 unidades (ni las cadenas ni las normalizadas coinciden) | **ROJO**: solo cae «ninguna pareja es la misma silueta con un punto movido» |

La segunda y la tercera son las que importan: demuestran que la prueba no se
sostiene sobre un `Set` de cadenas, que es justo lo que el contrato no acepta
como resuelto.

Estado final tras deshacer: 42 en verde.

## 4 · Qué queda sin hacer

- **No se ha tocado nada fuera del `territory`.** `topic-identity.ts`,
  `index.ts`, `TopicCard`, `TopicGrid` y `apps/web` siguen como estaban; el
  icono se exporta y se consume desde donde ya lo hacía el andamio.
- **`mixed` es la silueta con la que menos cómodo me quedo**: el círculo entero
  más el semicírculo se lee «OD» si uno busca letras. Se distingue a 20 px y no
  choca con ninguna otra, pero si en revisión visual molesta, el arreglo es de
  dibujo (por ejemplo, la parte como sector con sus dos radios) y no de prueba.
- **La distinción «a 20 px y en gris» la valida un ojo, no el CI.** La prueba
  vigila que las once sean dibujos distintos; que se distingan de un vistazo se
  comprobó a mano con el render descrito arriba. Una prueba de píxeles (dos
  siluetas rasterizadas a 20 px con distancia mínima) sería el siguiente paso
  honesto, y no está hecha: pide un rasterizador que el paquete hoy no tiene.
- **No se han hecho capturas para `tocheck/`**: ese directorio no es territorio
  de este contrato.
- **Sin `git add` ni `git commit`**, como se pidió: integra el supervisor.

---

## 5 · Segunda ronda: las dos siluetas que no se leían en el medallón

La pasada visual del coordinador sobre `/dev/practice-preview` (medallón a
24 px) devolvió dos fallos, los dos del mismo tipo: la silueta no se lee como
el objeto dibujado sino como otra cosa. Rehechas ambas; las otras nueve no se
tocan.

### `simplify` — las tijeras se leían como un aspa

Diagnóstico correcto: con hojas largas y anillas pequeñas, lo que pesa a 24 px
es el cruce, y un aspa en una app de matemáticas es el signo de multiplicar —
el mismo choque que el contrato pedía evitar entre `fracop` y la cruz de `math`.

Se mantiene el objeto (simplificar es cortar; ninguna otra silueta del lote es
una herramienta) y se cambia la proporción, que es donde estaba el fallo:
**anillas de radio 3,4 en vez de 2,1** (diámetro 6,8: más que dos tercios de la
altura del cruce) y **hojas más cortas**, de y=4,6 a y=13,2 en vez de llegar a
16,4. A 24 px sobre el medallón las anillas ya no desaparecen y la silueta se
lee «tijeras», no «×».

### `mixed` — la tarta entera y la media tarta se leían «OD»

Aquí no bastaba con la proporción: el fallo era la composición. Dos formas del
mismo tamaño, a la misma altura y una al lado de otra son, para el ojo, dos
glifos de texto; por eso salía una palabra. Se probaron en el scratchpad, a
24 px sobre el medallón azul, seis alternativas: apilar el entero sobre la
mitad (sale un monigote), la tarta con un corte visible (sale un **reloj**), la
porción separada (ilegible a 24 px), el entero con una fracción al lado (mismo
fallo de dos glifos), barra entera + barra partida (choca con la tira de
`decimal`) y el ciclo de dos flechas.

La elegida es **dos flechas horizontales opuestas, una encima de otra: ida y
vuelta**, que es literalmente lo que dice el rótulo del tema («Impropias ↔
mixtas») y lo que el alumno practica: convertir en los dos sentidos. Se
distingue de `powten` (una sola flecha en arco que salta un punto) y de
`fracop` (barra con dos puntos), comprobado a 24 px en la misma tira.

**Coste declarado:** se pierde el modelo de tarta, que era la pieza más
«matemática» del lote. Cuando la silueta compite con la lectura de una palabra,
prefiero la que no se lee mal.

### La prueba no ha tenido que aflojarse

Ninguna capa se ha tocado: los umbrales, el trazo normalizado y el esqueleto de
comandos son los mismos de la primera ronda, y las dos siluetas nuevas pasan sin
ajustes (los once esqueletos siguen siendo distintos entre sí). Mutación
repetida sobre el dibujo nuevo —`mixed` = la silueta nueva de `simplify` con un
punto movido 2,4 unidades— **ROJO** en «ninguna pareja es la misma silueta con
un punto movido», y verde otra vez al deshacerla.

Verificación tras el cambio:

```
pnpm --filter @cet/ui exec vitest run __tests__/identidad-de-tema.test.tsx   -> 0 (42 pasan)
pnpm --filter @cet/ui typecheck                                             -> 0
pnpm --filter @cet/ui lint                                                  -> 0
```

Revisado además a 24 px y a 48 px sobre cuadrado `#2a76c7` con el trazo en
blanco, y las once junto a las siete de materia en escala de grises. Los HTML
son desechables y viven en el scratchpad: no se ha añadido nada al árbol fuera
del `territory`.
