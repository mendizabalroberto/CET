/**
 * Landing pública.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * 100 % Server Component: cero JavaScript de cliente en la primera página que
 * ve cualquiera. Los únicos formularios (idioma y tema) son Server Actions.
 *
 * Paleta: la de los trainers Y6A — navy #173a63, teal #0f9b8e, amber #f2a71b —
 * expuesta como tokens semánticos en globals.css para que el tema oscuro
 * funcione sin escribir `dark:` en ningún sitio.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Lecciones que enseñan. Exámenes que se pueden demostrar.",
};

/* -------------------------------------------------------------------------- */
/* Iconografía — SVG en línea. Ni una petición de red, ni un icono que falte.  */
/* -------------------------------------------------------------------------- */

type IconProps = { className?: string };

const ICONS = {
  math: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true" {...p}>
      <path d="M4 7h6M7 4v6M14 6.5h6M14 17.5h6M17 14.5v6M4 17.5l5 0M4.5 20l4-5" />
    </svg>
  ),
  science: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M9 3v6.2L4.4 17A2.4 2.4 0 0 0 6.5 20.6h11A2.4 2.4 0 0 0 19.6 17L15 9.2V3M8 3h8M7.5 14h9" />
    </svg>
  ),
  english: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </svg>
  ),
  spanish: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d="M5 19l5.5-13h3L19 19M8 14.5h8M9.5 3.4l2.4-1.2" />
    </svg>
  ),
  socials: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.4 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.4-3.5-8.5S9.7 5.9 12 3.5z" />
    </svg>
  ),
  ict: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16.5V20" />
    </svg>
  ),
} as const;

const SUBJECT_ORDER = ["math", "science", "english", "spanish", "socials", "ict"] as const;

/** Un acento por materia: la retícula se lee de un vistazo, no como seis cajas iguales. */
const SUBJECT_ACCENT: Record<(typeof SUBJECT_ORDER)[number], string> = {
  math: "var(--brand)",
  science: "var(--teal)",
  english: "var(--amber)",
  spanish: "var(--danger)",
  socials: "var(--success)",
  ict: "var(--brand-bright)",
};

const PILLAR_ORDER = ["identity", "engine", "forensics", "adaptive"] as const;
const STEP_ORDER = ["one", "two", "three", "four"] as const;

/* -------------------------------------------------------------------------- */

export default async function LandingPage() {
  const { t } = await getServerDictionary();
  const L = t.landing;

  return (
    <>
      {/* ================= HERO ================= */}
      <section className="cet-hero-gradient relative overflow-hidden text-white">
        <div className="cet-grid-overlay absolute inset-0" aria-hidden="true" />
        {/* Halo ámbar: rompe el degradado plano y ancla la mirada en el titular. */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-25 blur-3xl"
          style={{ background: "var(--amber)" }}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[12.5px] font-semibold tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--amber)" }} aria-hidden="true" />
            {L.hero.eyebrow}
          </p>

          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            {L.hero.titleLead}
            <br />
            <span className="relative inline-block">
              {L.hero.titleAccent}
              {/* Subrayado ámbar dibujado, no un border: sigue la línea base. */}
              <svg
                className="absolute -bottom-2 left-0 w-full"
                height="10"
                viewBox="0 0 300 10"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M2 7C60 2 150 2 298 6" stroke="var(--amber)" strokeWidth="4" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>

          <p className="mt-8 max-w-2xl text-[17px] leading-relaxed text-white/85">{L.hero.subtitle}</p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href={ROUTES.login}
              className="rounded-xl px-6 py-3.5 text-base font-semibold text-[#3a2a00] shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--amber)" }}
            >
              {L.hero.ctaPrimary}
            </Link>
            <Link
              href={ROUTES.register}
              className="rounded-xl border border-white/35 bg-white/10 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/20"
            >
              {L.hero.ctaSecondary}
            </Link>
          </div>

          <p className="mt-5 text-sm text-white/70">{L.hero.note}</p>
        </div>

        {/* ================= FRANJA DE CIFRAS ================= */}
        <div className="relative border-t border-white/15 bg-black/15">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 divide-white/15 px-4 sm:px-6 lg:grid-cols-4 lg:divide-x">
            {[
              { value: L.stats.subjectsValue, label: L.stats.subjects },
              { value: L.stats.reconstructValue, label: L.stats.reconstruct },
              { value: L.stats.feedbackValue, label: L.stats.feedback },
              { value: L.stats.localesValue, label: L.stats.locales },
            ].map((stat) => (
              <div key={stat.label} className="px-2 py-6 lg:px-8">
                <dd className="text-3xl font-bold tracking-tight" style={{ color: "var(--amber)" }}>
                  {stat.value}
                </dd>
                <dt className="mt-1 text-[13px] font-medium uppercase tracking-wider text-white/65">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ================= PILARES ================= */}
      <section id="platform" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
        <header className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{L.pillars.title}</h2>
          <p className="mt-3 text-lg text-muted">{L.pillars.subtitle}</p>
        </header>

        <ul className="mt-12 grid gap-5 md:grid-cols-2">
          {PILLAR_ORDER.map((key, index) => {
            const pillar = L.pillars.items[key];
            return (
              <li
                key={key}
                className="group relative overflow-hidden rounded-xl border border-line bg-card p-7"
              >
                {/* Filete de color en el borde superior; se ensancha al pasar el ratón. */}
                <span
                  className="absolute inset-x-0 top-0 h-1 transition-all group-hover:h-1.5"
                  style={{ background: index % 2 === 0 ? "var(--teal)" : "var(--amber)" }}
                  aria-hidden="true"
                />
                <span className="font-mono text-[13px] font-bold text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-xl font-bold text-ink">{pillar.title}</h3>
                <p className="mt-2.5 leading-relaxed text-muted">{pillar.body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ================= MATERIAS ================= */}
      <section id="subjects" className="scroll-mt-24 border-y border-line bg-surface-alt">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <header className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {L.subjects.title}
            </h2>
            <p className="mt-3 text-lg text-muted">{L.subjects.subtitle}</p>
          </header>

          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SUBJECT_ORDER.map((key) => {
              const subject = L.subjects.items[key];
              const Icon = ICONS[key];
              const accent = SUBJECT_ACCENT[key];
              return (
                <li
                  key={key}
                  className="rounded-xl border border-line bg-card p-6 transition-shadow hover:shadow-md"
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-lg"
                    style={{ background: accent, color: "#fff" }}
                    aria-hidden="true"
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink">{subject.name}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{subject.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ================= CÓMO FUNCIONA ================= */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {L.how.title}
        </h2>

        <ol className="mt-12 grid gap-y-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-6">
          {STEP_ORDER.map((key, index) => {
            const step = L.how.steps[key];
            return (
              <li key={key} className="relative pl-16 lg:pl-0 lg:pt-16">
                {/* Riel que conecta los pasos en escritorio. */}
                <span
                  className="absolute left-6 top-12 hidden h-px w-full bg-line lg:left-12 lg:top-6 lg:block"
                  aria-hidden="true"
                />
                <span
                  className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full border-2 text-lg font-bold"
                  style={{ borderColor: "var(--teal)", color: "var(--teal)", background: "var(--card)" }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h3 className="text-lg font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ================= PÚBLICOS ================= */}
      <section id="schools" className="scroll-mt-24 border-t border-line bg-surface-alt">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {L.audience.title}
          </h2>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[L.audience.student, L.audience.teacher, L.audience.admin].map((group) => (
              <article key={group.title} className="rounded-xl border border-line bg-card p-6">
                <h3 className="text-lg font-bold text-ink">{group.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{group.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ================= LLAMADA FINAL ================= */}
      <section className="cet-hero-gradient text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{L.cta.title}</h2>
            <p className="mt-3 text-white/85">{L.cta.body}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={ROUTES.register}
              className="rounded-xl px-6 py-3.5 font-semibold text-[#3a2a00]"
              style={{ background: "var(--amber)" }}
            >
              {L.cta.button}
            </Link>
            <Link
              href={ROUTES.login}
              className="rounded-xl border border-white/35 px-6 py-3.5 font-semibold text-white hover:bg-white/10"
            >
              {L.cta.secondary}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
