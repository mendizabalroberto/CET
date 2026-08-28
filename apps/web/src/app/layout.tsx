/**
 * Layout raíz.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Server Component puro: no hay un solo `"use client"` en el árbol raíz. El
 * idioma y el tema se resuelven en el servidor y se pintan directamente en el
 * <html>, así que no hay parpadeo de tema ni script en línea que la CSP tenga
 * que perdonar.
 */
import type { Metadata, Viewport } from "next";

import { getDictionary } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n/server";
import { getTheme } from "@/lib/preferences";

import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Cambridge Exam Trainer",
    template: "%s · Cambridge Exam Trainer",
  },
  description:
    "Plataforma multi-colegio de aprendizaje y evaluación para primaria y secundaria: lecciones, práctica con feedback inmediato y exámenes auditables.",
  applicationName: "Cambridge Exam Trainer",
  authors: [{ name: "Roberto Mendizabal" }],
  creator: "Roberto Mendizabal",
  // Producto de uso escolar, no de captación pública. Que no lo indexe nadie
  // hasta que el propietario decida lo contrario.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Cambridge Exam Trainer",
    title: "Cambridge Exam Trainer",
    description: "Lecciones que enseñan. Exámenes que se pueden demostrar.",
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // NO se fija `maximumScale`: impedir el zoom es una barrera de accesibilidad
  // para cualquiera con baja visión, y en un producto usado por niños es
  // sencillamente inaceptable (WCAG 1.4.4).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#173a63" },
    { media: "(prefers-color-scheme: dark)", color: "#0b141f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveLocale();
  const theme = await getTheme();
  const t = getDictionary(locale);

  return (
    <html
      lang={locale}
      // `system` no pinta atributo: así manda `prefers-color-scheme` desde CSS.
      // Sin cookie no se llega aquí con `system`, sino con `light`: el tema del
      // dispositivo no decide con qué contraste estudia un niño (ver `getTheme`).
      {...(theme === "system" ? {} : { "data-theme": theme })}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-surface text-ink antialiased">
        <a href="#main" className="skip-link">
          {t.common.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
