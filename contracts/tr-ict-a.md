---
id: tr-ict-a
model: chat
territory: [supabase/migrations/0031_*]
forbidden: [packages/ui/src/index.ts, supabase/migrations/0028_leccion_en_espanol.sql]
context: [contracts/fuentes/ict-a.json, supabase/migrations/0028_leccion_en_espanol.sql]
verify: node scripts/deepseek/validar-traduccion.mjs contracts/fuentes/ict-a.json supabase/migrations/0031_ict_es.sql
setup: ninguno
rounds: 5
deadline: 5 rondas o 25 min
---

## 1 · El problema

La materia **ict** (Informatica) esta sembrada en produccion
**solo en ingles**. El alumno ve el marco de la aplicacion en espanol y la
leccion en ingles. No es un fallo de i18n: es contenido que falta.

Te toca **lecciones 1 a 3**: 52 bloques, 5564 caracteres.
Otro agente lleva el resto de esta misma materia en paralelo, asi que no toques
ninguna otra migracion.

## 2 · La evidencia que ya tenemos

El texto ingles exacto que hay que traducir esta en
`contracts/fuentes/ict-a.json`, que te doy entero mas abajo. Cada bloque
trae su `leccion_ord`, su `bloque_ord` y su `html_en`. **Esas dos cifras son
la clave por la que se localiza la fila**: no hay UUID en ninguna parte.

La forma del i18n esta anidada, y esto importa: el `I18nText` **no** es
`content`, esta un nivel mas abajo, en `content.html`.

`supabase/migrations/0028_leccion_en_espanol.sql` es la migracion hermana, ya
aplicada en produccion para matematicas. **Copia su forma.** Fija las
convenciones de la casa: localizacion por clave natural, escrituras aditivas con
`jsonb_set(content, '{html}', (content -> 'html') || jsonb_build_object('es', …))`,
guarda `not (content -> 'html' ? 'es')` en cada UPDATE, y cero UUID.

## 3 · El criterio de aceptacion

Escribe `supabase/migrations/0031_ict_es.sql` y haz que salga verde:

```
node scripts/deepseek/validar-traduccion.mjs contracts/fuentes/ict-a.json supabase/migrations/0031_ict_es.sql
```

Ese verificador **lo escribio el supervisor, no tu**, y comprueba por codigo de
salida: cobertura de los 52 bloques uno a uno, que el marcado HTML se
conserve como multiconjunto de etiquetas, que ningun numero cambie, que ninguna
escritura reemplace el objeto entero, y que un bloque con palabras no quede
identico al ingles.

## 3 bis · Como tiene que ser el espanol

Es material escolar para un nino de 10 anos, en un colegio bilingue. **Las
siete decisiones de abajo ya se tomaron al traducir matematicas y son
obligatorias aqui**, para que las seis materias no diverjan en estilo:

1. **Espanol de Espana, natural para un nino.** No traduccion literal: busca la
   formula que un maestro diria en clase.
2. **La notacion numerica inglesa se CONSERVA**: punto decimal (`12.6`) y coma
   de millar (`1,000`). No los pases a `12,6` ni `1.000`. El examen es en
   ingles y el nino escribira `12.6`; ensenarle otra notacion en la mitad
   espanola del mismo trainer seria ensenarle a fallar. En consecuencia se dice
   «el punto decimal», no «la coma».
3. **El HTML se conserva exactamente**: `<b>`, `<i>`, `<div class="step">`,
   las entidades. Solo cambia el texto.
4. **`&amp;` que une dos palabras se traduce por «y»**; `&lt;` se conserva
   literal, es el signo «menor que».
5. **Los simbolos y numeros se conservan**: `x`, `÷`, `→`, y toda cifra.
6. **La terminologia de la materia es fija, no la inventes.** Si dudas de un
   termino, elige el mas comun en un libro de texto espanol de primaria y
   **dilo en un comentario SQL** al final del fichero.
7. **Los nombres propios no se traducen** (lugares, personas, productos, nombres
   de herramientas informaticas). Si un nombre es tambien una etiqueta de la
   interfaz, dejalo en ingles y anotalo.

## 4 · Que NO cuenta como resuelto

- Una escritura que reemplace `content` entero en vez de anadir la clave `es`.
  **Perder el ingles seria peor que no traducir**: el verificador lo caza y
  rechaza el parche.
- UUID literales. Se localiza por `subjects.code = 'ict'` + el curso
  global de `year_level = 6` + `lessons.ord` + `lesson_blocks.ord`.
- Traducir a medias y dejar bloques fuera. El verificador cuenta los 52.
- Cambiar un numero. Un dato plausible no es un dato correcto: si el ingles dice
  `4.7`, el espanol dice `4.7`.
- Comerte o inventarte una etiqueta HTML. El verificador compara el
  multiconjunto de etiquetas de cada bloque.
- Copiar el ingles tal cual en un bloque que tiene palabras.
- Tocar `0028_leccion_en_espanol.sql` o cualquier migracion que no sea la tuya.
  Hay cuatro agentes mas trabajando en paralelo sobre las suyas.
- Decir «deberia funcionar». Ejecuta el verificador y pega su salida literal.
