/**
 * Vista previa de desarrollo de las migas de pan.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * PARA QUÉ EXISTE
 * ===========================================================================
 * `/learn/<id>` y `/practice/<tema>` viven detrás de `requireStudent()`, y
 * verificar un cambio visual entrando con las credenciales de un alumno real es
 * exactamente lo que este proyecto no hace. Sin esta página, las migas se
 * quedaban probadas por unidad y nunca vistas — que es la mitad del fallo que
 * `obs001.docx` señaló: nadie las había mirado.
 *
 * Monta el MISMO componente que las dos pantallas reales, con los mismos
 * rótulos del diccionario. Lo único fabricado son los nombres del curso, el
 * módulo y la lección.
 *
 * Los cuatro casos son los cuatro que el componente distingue, y están juntos a
 * propósito: el que importa es el TERCERO, el escalón intermedio sin destino,
 * porque es el que se pierde si alguien decide "limpiar" filtrando los que no
 * llevan enlace.
 *
 * ===========================================================================
 * NO SALE A PRODUCCIÓN
 * ===========================================================================
 * `notFound()` en cuanto `NODE_ENV` no es `development`. Es una comprobación de
 * servidor, no una bandera de compilación. No lee nada de la base de datos, así
 * que tampoco puede filtrar el dato de un alumno.
 */
import { notFound } from "next/navigation";

import { getLearnDictionary } from "@/components/learn/dictionary";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { Migas, type Miga } from "@/components/nav/Migas";
import { resolveLocale } from "@/lib/i18n/server";

export default async function MigasPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const locale = await resolveLocale(null);
  const d = getLearnDictionary(locale);

  const casos: ReadonlyArray<{
    readonly titulo: string;
    readonly nota: string;
    readonly label: string;
    readonly items: readonly Miga[];
  }> = [
    {
      titulo: "Lección — la ruta completa",
      nota: "Es la captura de obs001: antes decía «Volver a tus lecciones» y debajo un párrafo muerto con el curso y el módulo. Ahora esa misma información ES la navegación.",
      label: d.lesson.trailLabel,
      items: [
        { label: d.lesson.trailRoot, href: "/learn" },
        { label: "Matemáticas — 6º" },
        { label: "The 8 topics on your exam" },
        { label: "Comparing & simplifying fractions" },
      ],
    },
    {
      titulo: "Práctica — dos escalones",
      nota: "El caso corto. El último no es enlace aunque sea el sitio donde estás.",
      label: d.practice.trailLabel,
      items: [
        { label: d.practice.trailRoot, href: "/practice" },
        { label: "Comparar" },
      ],
    },
    {
      titulo: "Lección sin módulo",
      nota: "Un escalón menos. La ruta se acorta, no se rompe.",
      label: d.lesson.trailLabel,
      items: [
        { label: d.lesson.trailRoot, href: "/learn" },
        { label: "Matemáticas — 6º" },
        { label: "Decimales: multiplicar y dividir" },
      ],
    },
    {
      titulo: "Lección que no existe",
      nota: "La pantalla de error también dice dónde está el alumno y por dónde salir.",
      label: d.lesson.trailLabel,
      items: [
        { label: d.lesson.trailRoot, href: "/learn" },
        { label: d.lesson.notFoundTitle },
      ],
    },
  ];

  return (
    <UiLocaleProvider locale={locale}>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-ink">Migas de pan — vista previa</h1>
          <p className="text-sm text-muted">
            Recorre los cuatro casos con el tabulador: solo deben recibir foco los escalones que
            son enlace. El último de cada ruta es el sitio actual y no se pulsa.
          </p>
        </header>

        {casos.map((caso) => (
          <section
            key={caso.titulo}
            className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4"
          >
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{caso.titulo}</h2>
            <p className="text-sm text-muted">{caso.nota}</p>
            <Migas label={caso.label} items={caso.items} />
          </section>
        ))}
      </main>
    </UiLocaleProvider>
  );
}
