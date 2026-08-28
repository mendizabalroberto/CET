# Navegación visual por materias — diseño

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Fecha: 2026-08-28 · Estado: aprobado, en implementación.

## 1 · El problema

`/learn` es hoy una lista anidada: `<section>` por curso → `<ol>` de módulos →
`<ul>` de lecciones. Sin color, sin avance, sin nada que se pueda tocar salvo
el título de cada lección. Un alumno de once años que entra no sabe por dónde
iba, cuánto le queda ni qué materia está mirando sin leer.

## 2 · El hallazgo que manda sobre el diseño

Se midió la conversión a deuteranopia (Vienot 1999) de seis colores de materia
bien separados a ojo. Los ratios entre pares ya convertidos:

```
math ↔ science  1.15      science ↔ english  1.03
math ↔ english  1.12      science ↔ ict      1.02
math ↔ socials  1.16      english ↔ ict      1.05
math ↔ ict      1.18      english ↔ socials  1.30
```

Y en escala de grises los seis rellenos elegidos caen entre `#666666` y
`#717171`.

**Para uno de cada doce niños varones las seis materias son el mismo color.**
Por tanto el color NO puede ser cómo se reconoce una materia. Cada materia se
identifica por tres canales simultáneos: **icono** (silueta distinta incluso en
gris), **nombre** siempre visible, y **color** como refuerzo. Quitado el color,
la pantalla sigue siendo navegable.

Es la misma ley que ya rige `--cet-ok-vivid` / `--cet-no-vivid` en `tokens.css`
y que vigila `__tests__/estados-no-solo-color.test.tsx`.

## 3 · Dónde se pinta el color, y dónde no

El color de materia es **gráfico, nunca tinta**. Se pinta en tres sitios:

1. el **raíl** del borde de la tarjeta,
2. el **medallón** del icono (icono en blanco encima),
3. el relleno de la **barra de avance**.

El cuerpo de la tarjeta usa el token `-suave` y encima va la tinta del sistema,
con su contraste ya probado. Ningún texto se apoya nunca sobre el relleno
saturado salvo el blanco del medallón, que está medido.

### 3.1 · Los doce tokens, medidos

Relleno claro — blanco encima ≥ 4.5:1. Relleno oscuro — `#0b1622` encima ≥ 4.5:1.
Suave claro — tinta `#12202f` encima ≥ 14:1. Suave oscuro — tinta `#e9eff6`
encima ≥ 11:1 y distinguible de la superficie (≥ 1.20:1).

| materia | relleno claro | relleno oscuro | suave claro | suave oscuro |
|---|---|---|---|---|
| math    | `#2a76c7` 4.65 | `#3c82cc` 4.56 | `#eaf1f9` 14.49 | `#1a324b` 11.33 |
| science | `#1d8648` 4.61 | `#239151` 4.55 | `#e8f3ed` 14.51 | `#153435` 11.52 |
| english | `#c64d44` 4.62 | `#cb5d54` 4.54 | `#f9edec` 14.41 | `#332b36` 11.78 |
| spanish | `#a9660f` 4.57 | `#b3701a` 4.56 | `#f6f0e7` 14.56 | `#2f2e2b` 11.73 |
| socials | `#8164c2` 4.63 | `#8c71c7` 4.60 | `#f2f0f9` 14.61 | `#282f4a` 11.37 |
| ict     | `#12828a` 4.58 | `#238b93` 4.50 | `#e7f3f3` 14.54 | `#153341` 11.47 |

Viven en `packages/ui/src/tokens.css` y en ningún otro sitio: lo impone
`__tests__/una-sola-paleta.test.ts`. Los mide por máquina
`__tests__/contraste-materias.test.ts`, que es parte de este encargo — la tabla
de arriba miente en cuanto alguien toque un hex, el test no.

## 4 · Los componentes: `packages/ui/src/navigation/`

Presentacionales puros. No saben de Supabase, ni de Next, ni de rutas: reciben
datos resueltos y `href` ya construidos.

| Pieza | Qué hace | Entrada |
|---|---|---|
| `subject-identity.ts` | `code → { token, Icono, ord }`; un code desconocido cae en identidad neutra | puro |
| `SubjectCard` | medallón, nombre, «3 de 12 terminadas · 2 en marcha», barra de dos capas | `{ code, name, href, total, completed, started }` |
| `SubjectGrid` | rejilla responsiva y orden | lista de props de tarjeta |
| `ModuleSection` | módulo: título, cuenta y sus fichas | `{ ord, title, lessons }` |
| `LessonTile` | ficha táctil: estado, título, minutos | `{ title, href, state, minutes }` |

Reglas que los tres contratos comparten y que sus pruebas comprueban:

- **Cero JavaScript de cliente.** Enlaces envueltos en `<a>`; `/learn` sigue
  siendo Server Component puro.
- **44 px de área táctil mínima**, y el objetivo pulsable es la tarjeta o la
  ficha entera, no el título.
- **Ningún estado sólo por color**: glifo + texto en `VisuallyHidden` + color.
- **`aria-hidden` en el icono de materia**: el nombre ya está escrito al lado;
  un icono anunciado lo diría dos veces.

## 5 · De dónde salen los números

`apps/web/src/components/learn/lesson-progress.ts`, hermano de
`practice-progress.ts` y con su misma disciplina: **fuente viva o nada**.

Lee `learning_events` filtrando por `student_id`, `school_id` (regla transversal
2 de `MODULES.md`) y `event_type` en `lesson_opened` / `lesson_completed`, con
la ventana de 90 días y el tope de filas que ya usa la práctica. Reduce a
`Map<lessonId, "started" | "completed">`; la página agrega lección → módulo →
materia. `completed` gana siempre sobre `started`.

**No se lee `skill_mastery`**: cero filas en producción y ningún escritor. Lo
vigila `progreso-de-lecciones-tiene-fuente-viva.test.ts`.

Tres estados de fallo distintos a propósito, copiando `/practice`:

- consulta caída → tarjetas **sin cifras** y aviso `role="status"`. Una consulta
  caída no es un cero;
- sin eventos → «Sin empezar», no una barra al 0 % que se lee como suspenso;
- con eventos → las cifras.

## 6 · Las pantallas

**`/learn`** — cabecera, el CTA de práctica que ya existe, y `SubjectGrid`. Una
tarjeta por **materia**, no por curso: un curso es `(materia × año)`, y si el
colegio activa dos cursos de la misma materia la tarjeta los suma. Rejilla de 1
columna en móvil, 2 en tablet, 3 en escritorio.

**`/learn/materia/[code]`** — el `code` en la URL (`math`, `ict`), no el uuid:
legible, estable, y no expone identificadores. Cabecera con medallón, nombre y
avance; debajo un `ModuleSection` por módulo. Migas reutilizando `Migas`:
*Aprender › Matemáticas*. Si hay dos cursos de la misma materia, uno por
sección. Un `code` inexistente o no activado para el colegio → `notFound()`.

**`/dev/materias-preview`** — misma forma que `/dev/migas-preview`: `notFound()`
fuera de desarrollo y cero lecturas de base de datos. Enseña los casos que se
pierden si nadie los mira: materia sin empezar, a medias, terminada, de un solo
módulo, y **la consulta de avance caída**.

De ahí salen las cuatro capturas a `tocheck/`: escritorio, móvil, escala de
grises y texto grande al 200 %. La de escala de grises es la prueba de la §2.

## 7 · El reparto

**Paso 0 (supervisor).** Los doce tokens, los seis iconos SVG y
`subject-identity.ts`, con `contraste-materias.test.ts` en verde. No se delega:
tres agentes en paralelo eligiendo colores producen tres paletas, y la medición
se hace una vez.

Luego, territorios disjuntos:

| Contrato | Territorio | Verde por código de salida |
|---|---|---|
| `nav-a-tarjeta` | `navigation/SubjectCard.tsx`, `SubjectGrid.tsx` + test | `pnpm --filter @cet/ui test tarjeta-de-materia`, typecheck, lint |
| `nav-b-modulo` | `navigation/ModuleSection.tsx`, `LessonTile.tsx` + test | `pnpm --filter @cet/ui test fichas-de-leccion`, typecheck, lint |
| `nav-c-avance` | `learn/lesson-progress.ts` + test | `pnpm --filter web test progreso-de-lecciones` |

`packages/ui/src/index.ts` y `packages/ui/src/tokens.css` están en el `forbidden`
de los tres: son del supervisor, y son el único punto donde tres ramas
paralelas podrían chocar.

**Paso final (supervisor).** Exportar en `index.ts`, escribir las dos pantallas
y los rótulos del diccionario (es/en), montar `/dev/materias-preview`, y la
pasada visual con las cuatro capturas.

## 8 · Lo que este encargo NO hace

No toca `/practice`. No toca el interior de la lección. No revive
`skill_mastery`. No añade animaciones de transición entre pantallas. No lee
`subjects.color` ni `subjects.icon` de la base de datos: son nullable y un hex
arbitrario no tiene contraste garantizado.
