# Iconos de acción — un registro, no un catálogo

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Origen: petición directa — «busca o genera una librería de iconos para cada
> botón, el público tiene una preferencia visual para intercambio de información».
> Estado: **ejecutado, verificado y desplegado.** 28 de agosto de 2026.

---

## 1 · El problema

Los botones eran solo texto. El público de esta aplicación son niños de unos
once años, que procesan un dibujo antes que una palabra. No es una preferencia
estética: es la vía por la que ese público intercambia información más rápido.

Lo que había en su lugar: **unos veinte ficheros dibujando SVG a mano**, cada
uno con su tamaño y su trazo, y ninguna librería instalada. `StudentNav.tsx`
dejaba escrito el razonamiento original:

> «Iconos en SVG inline y no de una librería: son cuatro, no justifican una
> dependencia, y así heredan `currentColor` sin configuración.»

Era cierto con cuatro. Con un icono en cada botón, veinte dibujantes distintos
son peor que una dependencia.

---

## 2 · Las tres decisiones

**De dónde salen.** `lucide-react` 1.35.0, licencia ISC, React 19 soportado,
6.110 iconos disponibles. Al bundle solo entra lo que se importe. Se descartó
dibujar un juego propio: veinticinco iconos que dibujar y mantener, y uno mal
dibujado a los once años es un jeroglífico.

**Icono + texto, siempre.** El icono nunca va solo en un botón de acción. Quien
no reconozca el dibujo lee la palabra y no pierde nada; quien lo reconozca llega
antes. Es la misma regla que ya imponen `color-unico-canal.test.tsx` y
`estados-no-solo-color.test.tsx`: ninguna señal viaja sola. Se descartó el icono
con tooltip porque en tableta no hay «pasar por encima», y la tableta es donde
estudian estos niños: el texto quedaría inalcanzable justo en el dispositivo
principal.

**Alcance: el alumno.** Práctica, lección, examen, raíl de navegación y los ~20
SVG sueltos. `/teach`, `/admin` y la landing quedan para otra pasada — no son el
público que motivó el encargo.

---

## 3 · La arquitectura — por qué un registro y no importaciones sueltas

El enfoque obvio es que cada pantalla importe de `lucide-react`:

```tsx
import { Check } from "lucide-react";
<Button icon={Check}>Comprobar</Button>
```

Se descartó. Serían unos cuarenta sitios de importación, nadie controlaría qué
icono elige cada uno, y retirar o cambiar la librería sería tocar los cuarenta.
`@cet/ui` quedaría acoplado a los tipos de un paquete externo, que es justo lo
que un design system existe para evitar.

Lo que se hizo:

```
packages/ui/src/icons/
├── registro.ts    ← el ÚNICO fichero del monorepo que importa lucide-react
└── Icono.tsx      ← tamaño, trazo, aria-hidden
```

```tsx
<Button icon="comprobar">Comprobar</Button>
```

Cuatro cosas que esto da y la importación suelta no:

- **Una sola puerta a la dependencia.** Cambiarla, o retirarla y dibujar los
  nuestros, es tocar un fichero. Hay un invariante que lo vigila: si aparece un
  `from "lucide-react"` en cualquier otro sitio de `packages/ui/src`, rojo.
- **Los nombres son del producto, no del catálogo.** `pista`, no `Lightbulb`.
  El día que la pista deje de ser una bombilla, el cambio es una línea y no toca
  ninguna pantalla.
- **El juego es cerrado y tipado.** `NombreDeIcono` sale de las claves reales de
  `ICONOS` con `satisfies`, no de una lista escrita a mano que se desincroniza
  el primer día. `icon="pista-nueva"` no compila.
- **Se puede probar como conjunto**, que es lo del §5.

### 3.1 · El tamaño NO va por una clase de Tailwind

Va por la prop `size` del componente de Lucide, que acaba en el atributo
`width`/`height` del `<svg>`.

No es un detalle de estilo. En este mismo `Button`, `tailwind-merge` ya se comió
`text-[var(--cet-on-primary)]` porque no reconocía `text-body` como un tamaño y
los metió en el mismo grupo: «Comprobar» acabó pintado a **1.53:1** donde el
token prometía 11.53:1. Una clase `h-4 w-4` o `size-5` volvería a meter el
tamaño del icono en ese mismo saco. El test lo fija mirando el **atributo**, no
el `className`, precisamente para que esa vía se ponga roja si alguien la abre.

---

## 4 · El reparto

La elección de cada dibujo **no se delegó**. Es la única parte con criterio, y
un icono mal elegido a los once años no es un adorno feo: es un jeroglífico.
Tres reglas la decidieron.

**Dos acciones hermanas no comparten dibujo.** «Comprobar» y «Siguiente
pregunta» viven en el MISMO botón, que cambia de texto al responder. Si los dos
fuesen una marca de verificación, el botón diría «has acertado» cuando solo
quiere decir «sigue». Por eso uno es `Check` y el otro una flecha. Lo mismo con
la pista (`Lightbulb`) y la solución (`ListOrdered`): pedir ayuda y rendirse no
son lo mismo, y la analítica de dificultad los cuenta como eventos distintos.

**Lo que ya sabían, se respeta.** Los tres del raíl son las mismas metáforas que
`StudentNav` dibujaba a mano —libro abierto, círculos concéntricos, documento
con marca—. Cambia el trazo, no el significado: nadie tiene que reaprender por
dónde se va a Practicar.

**El ámbar de la pista gana forma.** El punto ámbar de 8 px que obs001 había
puesto pasa a ser una bombilla ámbar. La misma señal, ahora con forma además de
color, en `--cet-hint-vivid-text` (4,97:1 sobre la tarjeta, por encima del 3:1
que pide WCAG 1.4.11 para un objeto gráfico).

---

## 5 · Cómo se prueba

Siete invariantes en `packages/ui/__tests__/iconos.test.tsx`, y ninguno es
decorativo:

1. El icono **llega a la pantalla**: hay un `<svg>` dentro del botón. En este
   repositorio no se da por hecho que una clase sobreviva —lo de
   `tailwind-merge` lo enseñó—: se monta y se mira.
2. El tamaño sale del `size` del botón, comprobado **por atributo**.
3. El icono es invisible para el lector: `aria-hidden`, `focusable="false"`, y
   el nombre accesible del botón sigue siendo exactamente el texto.
4. **Sin `icon` no hay `<svg>`.** Sin este caso, un envoltorio que pintase algo
   siempre pasaría el test 1.
5. **Dentro de un grupo visible, dos acciones no comparten dibujo.** Comparando
   los COMPONENTES, no las claves: dos claves distintas apuntando al mismo
   dibujo es exactamente el fallo que se busca.
6. `lucide-react` se importa en un solo sitio.
7. Todo nombre del registro pinta algo.

Los tests 6 y 7 recorren ficheros y claves, así que afirman primero cuántos
encontraron: un recorrido vacío pasaría en verde sin mirar nada.

---

## 6 · El fallo que el contrato no cubrió

`asChild` + `icon` **reventaba en ejecución**: Radix `Slot` clona a su único
hijo, y añadir el icono le daba dos — «Slot failed to slot onto its children».

No era hipotético. «Practicar esto», en la lección, es un `<Link>` envuelto en
un botón, y con icono. Se encontró montándolo, no leyéndolo.

La solución no fue prohibir la combinación sino usar la pieza que Radix tiene
para esto: `<Slottable>{children}</Slottable>` marca cuál de los dos hijos hay
que clonar, y el icono entra **dentro** del enlace. Sin `asChild`, `Slottable`
es transparente. Tiene test, y con su contraprueba: revertido a `{children}`, el
test cae en rojo.

---

## 7 · De paso, dos restos del mismo defecto que obs001

- Los **tres SVG del raíl**, dibujados a mano.
- **«Ya he terminado esta lección»**, que era otro `<button>` a mano con
  `border-2` y `px-4` — exactamente el defecto que obs001 cerró en los paneles
  de feedback, con la misma consecuencia: medía distinto que cualquier otro
  botón de la pantalla.

Los dos pasan ahora por `Button`.

---

## 8 · Evidencia

- `pnpm verify`: typecheck, lint y **1.486 tests** en verde.
- Build limpio comprobado en un árbol aislado en `HEAD` — el árbol de trabajo
  local estaba roto por un componente sin versionar de otra línea de trabajo
  (`UiInteractionScope.tsx`, que llama a un `trackUi` que todavía no existe).
- Capturas: `tocheck/iconos-acciones-escritorio-detalle.png` y
  `tocheck/iconos-acciones-360-detalle.png`.
- Desplegado a producción: `cet-4rtlximsq` → **https://cet-sable.vercel.app**.

**Lo que NO se ha visto con los ojos:** los iconos del raíl, del examen y del
botón de lección terminada. Viven detrás de `requireStudent()` y comprobarlos
exige teclear el PIN de un alumno, cosa que no hago. Están cubiertos por tipos y
por los siete invariantes, que no es lo mismo que haberlos mirado.
