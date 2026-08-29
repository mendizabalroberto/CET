/**
 * /e/[token] — el niño abre el enlace que le mandó su tutor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Es la única página del producto a la que se llega SIN sesión y con una
 * credencial en la URL. Dos consecuencias que se ven en el código:
 *
 *  1. `/e` está en `PUBLIC_PREFIXES` (`lib/routes.ts`). Sin eso el middleware
 *     manda al niño a `/login` antes de que esta página llegue a existir para
 *     él, y el enlace no sirve para lo único que existe.
 *
 *  2. Un enlace que no vale —caducado, ya usado, inventado— da EL MISMO
 *     mensaje en los tres casos. Distinguirlos convertiría esta página en un
 *     oráculo: quien probara tokens sabría cuáles llegaron a existir.
 */
import type { Metadata } from "next";

import { ElegirPinForm } from "@/components/tutor/ElegirPinForm";
import { getServerDictionary } from "@/lib/i18n/server";
import { alumnoDelEnlace } from "@/lib/tutor/queries";

/**
 * `noindex` explícito. La URL lleva una credencial dentro; que un rastreador la
 * siga y la publique sería el peor final posible para un enlace de un menor.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.redeem.title, robots: { index: false, follow: false } };
}

interface PageProps {
  readonly params: Promise<{ token: string }>;
}

export default async function CanjeDeEnlacePage({ params }: PageProps) {
  const { token } = await params;
  const { t } = await getServerDictionary();

  const alumno = await alumnoDelEnlace(token);

  if (alumno === null) {
    const R = t.tutor.redeem;
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">{R.invalidTitle}</h1>
        <p className="mt-3 text-muted">{R.invalidBody}</p>
      </div>
    );
  }

  return (
    <ElegirPinForm
      token={token}
      nombreDePila={alumno.nombreDePila}
      longitudDePin={alumno.longitudDePin}
    />
  );
}
