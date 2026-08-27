/**
 * Política de Privacidad.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import type { Metadata } from "next";

import { LegalDocument } from "@/components/marketing/LegalDocument";
import { getServerDictionary } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.legal.privacy.title };
}

export default async function PrivacyPage() {
  const { t } = await getServerDictionary();
  const doc = t.legal.privacy;

  return (
    <LegalDocument
      title={doc.title}
      updated={t.legal.updated}
      intro={doc.intro}
      sections={doc.sections}
      contentsLabel={t.legal.contents}
    />
  );
}
