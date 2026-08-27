/**
 * Renderizador de documentos legales.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El contenido vive en los diccionarios (AD-7). Aquí solo está la tipografía y
 * el índice. Un texto legal que solo existe en un idioma no sirve en un colegio
 * bilingüe, y traducirlo "cuando haga falta" significa no traducirlo nunca.
 */
interface LegalSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

interface LegalDocumentProps {
  readonly title: string;
  readonly updated: string;
  readonly intro: string;
  readonly sections: readonly LegalSection[];
  readonly contentsLabel: string;
}

/** `id` estable a partir del encabezado, para los anclajes del índice. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function LegalDocument({
  title,
  updated,
  intro,
  sections,
  contentsLabel,
}: LegalDocumentProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">{updated}</p>
        <p className="mt-6 text-lg leading-relaxed text-ink">{intro}</p>
      </header>

      <div className="mt-12 gap-12 lg:flex">
        {/* Índice pegajoso en escritorio: un documento legal se consulta, no se lee. */}
        <nav
          aria-label={contentsLabel}
          className="mb-10 shrink-0 lg:sticky lg:top-28 lg:mb-0 lg:h-fit lg:w-64"
        >
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">{contentsLabel}</h2>
          <ol className="mt-3 space-y-1.5 text-sm">
            {sections.map((section) => (
              <li key={section.heading}>
                <a
                  href={`#${slugify(section.heading)}`}
                  className="text-muted hover:text-teal"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-3xl">
          {sections.map((section) => (
            <section
              key={section.heading}
              id={slugify(section.heading)}
              className="scroll-mt-28 border-t border-line py-8 first:border-t-0 first:pt-0"
            >
              <h2 className="text-xl font-bold text-ink">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="mt-3 leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
