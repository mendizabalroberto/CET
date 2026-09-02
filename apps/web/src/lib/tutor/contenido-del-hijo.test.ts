/**
 * INVARIANTES de las pantallas de contenido del tutor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ SE PROTEGE AQUÍ, Y POR QUÉ NO BASTA CON MIRARLO
 * ===========================================================================
 * El padre lee las lecciones de su hijo con el MISMO código que las pinta para
 * el niño. Es la decisión correcta —dos catálogos divergen, y entonces una de
 * las dos pantallas miente sobre lo que el niño tiene delante— y trae consigo
 * un riesgo concreto: que alguien, arreglando algo en la pantalla del alumno,
 * copie de vuelta a la del tutor una pieza que allí es veneno.
 *
 * La pieza es la TELEMETRÍA. Si esta zona emitiera `lesson_opened`, el informe
 * del hijo contaría como estudio suyo el rato que pasó leyendo su padre — y ese
 * informe es exactamente lo que el padre viene a leer dos pantallas más arriba.
 * Se envenenaría a sí mismo, en silencio, y el síntoma —«mi hijo estudia más de
 * lo que yo creía»— no señalaría nunca a su causa.
 *
 * Un `git grep` lo vería hoy. Este test lo ve en cada `pnpm verify`, que es la
 * diferencia entre una convención y una garantía.
 *
 * Se lee el TEXTO de los ficheros a propósito: importar las páginas arrastraría
 * `server-only` y medio Next, y lo que hay que comprobar no es lo que hacen en
 * ejecución sino lo que se han traído.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { estaActivo } from "@/components/tutor/NavDelHijo";
import { findProtectedArea } from "@/lib/routes";

import { rutasDeHijo } from "./rutas";

const BASE = join(process.cwd(), "src", "app", "(tutor)", "tutor", "hijos", "[id]");

const PANTALLAS = [
  { nombre: "índice de materias", fichero: join(BASE, "contenido", "page.tsx") },
  { nombre: "materia", fichero: join(BASE, "contenido", "materia", "[key]", "page.tsx") },
  { nombre: "lección", fichero: join(BASE, "contenido", "leccion", "[lessonId]", "page.tsx") },
  { nombre: "práctica", fichero: join(BASE, "practica", "page.tsx") },
] as const;

/**
 * Todo lo que MIDE al alumno. Ninguna de estas piezas puede aparecer en la zona
 * del tutor: las cuatro primeras escriben `learning_events` sobre el hijo, y la
 * quinta abre la cola que las envía.
 */
const MIDEN_AL_ALUMNO = [
  "LessonTracking",
  "cronometro-de-pantalla",
  "TiempoEnPantalla",
  "UiInteractionScope",
  "TelemetryProvider",
] as const;

function fuente(fichero: string): string {
  return readFileSync(fichero, "utf8");
}

/**
 * El código sin sus comentarios.
 *
 * Hace falta porque estas pantallas EXPLICAN en sus cabeceras por qué no
 * llevan ciertas piezas —«no hay «practicar esto»; `/practice` es zona de
 * `student`»— y un test que buscara la cadena a pelo castigaría justo al
 * comentario que documenta la decisión. Lo que no puede volver es el
 * MECANISMO, y el mecanismo vive en el código.
 *
 * Es un borrado tosco a propósito: no distingue un `//` dentro de una cadena.
 * En estos ficheros no hay ninguno, y una gramática de TypeScript dentro de un
 * test sería más código que probar que el que prueba.
 */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

describe("el contenido del hijo, visto por su padre", () => {
  for (const { nombre, fichero } of PANTALLAS) {
    describe(nombre, () => {
      it("no mide al alumno", () => {
        const texto = fuente(fichero);
        for (const pieza of MIDEN_AL_ALUMNO) {
          expect(texto, `${nombre} importa ${pieza}, que escribe el informe del hijo`).not.toContain(
            pieza,
          );
        }
      });

      it("autoriza con el alcance del hijo y no con una sesión de alumno", () => {
        const texto = fuente(fichero);
        // `requireStudent()` daría el alcance del LECTOR, y el lector es el
        // padre: la pantalla enseñaría el catálogo de un adulto sin ficha de
        // alumno, que es ninguno, y el 404 resultante parecería un permiso mal
        // puesto.
        expect(texto).not.toContain("requireStudent");
        expect(texto).toContain("alcanceDeHijo");
      });

      it("no ofrece nada que altere el trabajo del niño", () => {
        const codigo = sinComentarios(fuente(fichero));
        // Marcar como terminada una lección que el niño no ha hecho es
        // falsear su trabajo.
        expect(codigo).not.toContain("LessonCompleteButton");
        // Y mandar al padre a practicar en nombre de su hijo añadiría
        // respuestas a un historial que no es suyo. Sería además un 404 mudo:
        // esa zona es de `student`.
        expect(codigo).not.toContain("practiceThis");
        expect(codigo).not.toMatch(/["'`]\/practice/);
      });
    });
  }
});

describe("las rutas del hijo", () => {
  const rutas = rutasDeHijo("11111111-2222-3333-4444-555555555555");

  it("viven todas bajo la zona del tutor, que solo alcanza un guardian", () => {
    const destinos = [
      rutas.ficha,
      rutas.contenido,
      rutas.materia("math"),
      rutas.leccion("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      rutas.practica,
    ];

    for (const destino of destinos) {
      const area = findProtectedArea(destino);
      // Sin área, el middleware manda a un 404 por «ruta no catalogada»: la
      // lista blanca de `routes.ts` es la que cierra, y una ruta nueva fuera de
      // ella no se abre sola. Aquí se comprueba que sí está catalogada y con
      // quién.
      expect(area, `${destino} no cae en ninguna área protegida`).toBeDefined();
      expect(area?.allow).toEqual(["guardian"]);
      // 404 y no 403: un 403 le confirmaría a quien sondea que esa ficha de
      // menor existe.
      expect(area?.onDeny).toBe("not-found");
    }
  });

  it("la pestaña de la ficha no se come a las demás", () => {
    // `/tutor/hijos/<id>` es prefijo de TODO lo que hay bajo ese hijo. Si se
    // comparase por prefijo, «Cómo va» saldría marcada mientras el padre lee
    // una lección, y las pestañas dejarían de responder «¿dónde estoy?» justo
    // en las pantallas profundas, que son las únicas donde uno se pierde.
    const ficha = { href: rutas.ficha, label: "Cómo va", exacto: true } as const;
    const contenido = { href: rutas.contenido, label: "Sus lecciones" } as const;

    expect(estaActivo(rutas.ficha, ficha)).toBe(true);
    expect(estaActivo(rutas.contenido, ficha)).toBe(false);
    expect(estaActivo(rutas.leccion("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), ficha)).toBe(false);

    // Y al revés: una pestaña normal SÍ sigue activa en sus subrutas.
    expect(estaActivo(rutas.contenido, contenido)).toBe(true);
    expect(estaActivo(rutas.materia("math"), contenido)).toBe(true);
    expect(estaActivo(rutas.ficha, contenido)).toBe(false);
  });

  it("codifica los segmentos variables", () => {
    // `subjects.code` es dato de contenido, editable desde el panel. Un `/`
    // dentro partiría la URL en dos y la materia dejaría de existir.
    expect(rutas.materia("a/b")).toContain("a%2Fb");
    expect(rutas.materia("a/b")).not.toContain("a/b");
  });
});
