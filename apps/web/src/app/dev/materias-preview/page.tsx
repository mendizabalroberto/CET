/**
 * Vista previa de desarrollo de la navegación por materias.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * PARA QUÉ EXISTE
 * ===========================================================================
 * `/learn` vive detrás de `requireStudent()`, y verificar un cambio visual
 * entrando con las credenciales de un alumno real es exactamente lo que este
 * proyecto no hace. Sin esta página, la rejilla de materias se quedaría probada
 * por unidad y nunca vista — que es la mitad del fallo que `obs001.docx`
 * señaló.
 *
 * Monta los MISMOS componentes que la pantalla real, con los mismos rótulos del
 * diccionario. Lo único fabricado son los nombres de materia y las cifras.
 *
 * ===========================================================================
 * LOS CASOS SON LOS QUE SE PIERDEN SI NADIE LOS MIRA
 * ===========================================================================
 * El que importa es el ÚLTIMO par: «sin empezar» y «no lo sabemos» son estados
 * distintos y tienen que verse distintos. Si alguien decide "simplificar" y
 * pinta la consulta caída como 0 %, esta página lo enseña en dos segundos y
 * ningún test unitario lo discute mejor.
 *
 * Y la de materia desconocida (`music`) es la que evita una tarjeta invisible en
 * producción el día que un colegio dé de alta una materia propia.
 *
 * ===========================================================================
 * NO SALE A PRODUCCIÓN
 * ===========================================================================
 * `notFound()` en cuanto `NODE_ENV` no es `development`. Es una comprobación de
 * servidor, no una bandera de compilación. No lee nada de la base de datos, así
 * que tampoco puede filtrar el dato de un alumno.
 */
import { notFound } from "next/navigation";
import {
  ModuleSection,
  SubjectGrid,
  type LessonTileProps,
  type SubjectCardProps,
} from "@cet/ui";

import { getLearnDictionary, learnI18n } from "@/components/learn/dictionary";
import { UiLocaleProvider } from "@/components/learn/UiLocaleProvider";
import { resolveLocale } from "@/lib/i18n/server";

/** Los seis rótulos que la tarjeta espera de la aplicación (AD-7). */
const CARD_TEXT = {
  ofText: learnI18n((d) => d.subject.of),
  completedText: learnI18n((d) => d.subject.finished),
  startedText: learnI18n((d) => d.subject.onTheGo),
  notStartedText: learnI18n((d) => d.subject.notStarted),
  doneText: learnI18n((d) => d.subject.allDone),
  unavailableText: learnI18n((d) => d.subject.progressUnknown),
} as const;

/** Los tres estados de lección, y el caso «sin minutos». */
const LECCIONES: readonly LessonTileProps[] = [
  {
    title: "Comparar y simplificar fracciones",
    href: "#comparar",
    state: "completed",
    minutes: 12,
    stateLabel: learnI18n((d) => d.subject.stateCompleted),
    minutesLabel: { es: "12 min", en: "12 min" },
  },
  {
    title: "Sumar fracciones con el mismo denominador",
    href: "#sumar",
    state: "started",
    minutes: 8,
    stateLabel: learnI18n((d) => d.subject.stateStarted),
    minutesLabel: { es: "8 min", en: "8 min" },
  },
  {
    title: "Fracciones equivalentes",
    href: "#equivalentes",
    state: "not_started",
    minutes: null,
    stateLabel: learnI18n((d) => d.subject.stateNotStarted),
  },
];

export default async function MateriasPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const locale = await resolveLocale(null);
  const d = getLearnDictionary(locale);

  const conAvance: readonly SubjectCardProps[] = [
    { code: "math", name: "Matemáticas", href: "#math", total: 12, completed: 3, started: 2 },
    { code: "english", name: "Inglés", href: "#english", total: 9, completed: 9, started: 0 },
    { code: "spanish", name: "Español", href: "#spanish", total: 7, completed: 0, started: 1 },
    { code: "science", name: "Ciencias", href: "#science", total: 8, completed: 0, started: 0 },
    { code: "socials", name: "Sociales", href: "#socials", total: 10, completed: 5, started: 0 },
    { code: "ict", name: "Informática", href: "#ict", total: 6, completed: 1, started: 3 },
  ].map((card) => ({ ...card, ...CARD_TEXT }));

  // Los destinos se cambian además del avance: es OTRA rejilla en la misma
  // página, y dos tarjetas al mismo sitio comparten clave. El aviso de React
  // que eso provoca acabaría tapando avisos de verdad.
  const sinAvance: readonly SubjectCardProps[] = conAvance.map((card) => ({
    ...card,
    href: `${card.href}-sin-avance`,
    completed: null,
    started: null,
  }));

  const desconocida: readonly SubjectCardProps[] = [
    { code: "music", name: "Música", href: "#music", total: 5, completed: 2, started: 0, ...CARD_TEXT },
    { code: "", name: "Taller de lectura", href: "#taller", total: 3, completed: 0, started: 0, ...CARD_TEXT },
  ];

  const casos: ReadonlyArray<{
    readonly titulo: string;
    readonly nota: string;
    readonly materias: readonly SubjectCardProps[];
  }> = [
    {
      titulo: "Las seis materias, con avance",
      nota: "Cada una en su sitio fijo de la rejilla. Míralas en escala de grises: los seis colores son el mismo gris, así que lo que tiene que distinguirlas es el icono y el nombre. Si no lo hacen, el dibujo está mal.",
      materias: conAvance,
    },
    {
      titulo: "La consulta de avance ha fallado",
      nota: "MISMAS materias, cero cifras y cero barras. Compáralo con «Ciencias» de arriba, que sí tiene dato y vale cero: son dos cosas distintas y tienen que verse distintas. Pintar esto como 0 % le diría al alumno que no ha hecho nada, y sería mentira.",
      materias: sinAvance,
    },
    {
      titulo: "Materias que el design system no conoce",
      nota: "Un colegio da de alta «music», o la fila de materia no se puede ver. Icono neutro, color neutro, tarjeta perfectamente usable. Sin esto, el token no existiría y la tarjeta saldría transparente.",
      materias: desconocida,
    },
  ];

  return (
    <UiLocaleProvider locale={locale}>
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-ink">Materias — vista previa</h1>
          <p className="max-w-prose text-sm text-muted">
            Recórrela con el tabulador: cada tarjeta es UN solo destino, y su nombre accesible
            tiene que incluir la materia. Después mírala a 200 % de texto y en escala de grises.
          </p>
          <p className="max-w-prose text-sm text-muted">
            Idioma activo: <strong className="text-ink">{locale}</strong> · rótulos reales del
            diccionario ({d.subject.notStarted}).
          </p>
        </header>

        {casos.map((caso) => (
          <section key={caso.titulo} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{caso.titulo}</h2>
            <p className="max-w-prose text-sm text-muted">{caso.nota}</p>
            <SubjectGrid subjects={caso.materias} />
          </section>
        ))}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            Dentro de una materia
          </h2>
          <p className="max-w-prose text-sm text-muted">
            Los tres estados de una lección, juntos a propósito: sin empezar, empezada y
            terminada. En escala de grises los tres glifos tienen que seguir distinguiéndose —
            son formas distintas, no el mismo círculo de otro color. El segundo módulo es el que
            todavía no tiene lecciones: dice que está vacío en vez de pintar una lista de cero.
          </p>
          <ModuleSection
            title="Fracciones"
            ord={1}
            ordLabel={learnI18n((d) => d.index.moduleLabel)}
            emptyLabel={learnI18n((d) => d.subject.emptyModule)}
            lessons={LECCIONES}
          />
          <ModuleSection
            title="Decimales"
            ord={2}
            ordLabel={learnI18n((d) => d.index.moduleLabel)}
            emptyLabel={learnI18n((d) => d.subject.emptyModule)}
            lessons={[]}
          />
        </section>
      </main>
    </UiLocaleProvider>
  );
}
