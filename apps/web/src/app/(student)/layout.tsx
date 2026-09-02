/**
 * Layout de alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * SEGUNDA barrera de autorización. El middleware ya filtró con los claims del
 * JWT; aquí se comprueba contra `profiles`/`students` con RLS activa, que es la
 * verdad. Si el middleware fallara o alguien añadiera una ruta sin registrarla
 * en `PROTECTED_AREAS`, este layout sigue cerrando la puerta.
 *
 * También impone el cambio de PIN del primer acceso (AD-4): mientras
 * `pin_must_change` sea true, no se entra a ninguna pantalla de alumno.
 * `/account/pin` vive en OTRO grupo de rutas precisamente para no quedar
 * atrapado en este redirect.
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { StudentNav } from "@/components/nav/StudentNav";
import { LocaleSwitcher } from "@/components/PreferenceSwitchers";
import { requireStudent } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { getDictionary } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/provider";
import { resolveLocale } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { TelemetryProvider } from "@/lib/telemetry/provider";
import { EstadoDeEnvio } from "@/lib/telemetry/EstadoDeEnvio";
import { getLearnDictionary } from "@/components/learn/dictionary";
import { UiInteractionScope } from "@/components/telemetry/UiInteractionScope";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const student = await requireStudent();

  if (student.pinMustChange) redirect(ROUTES.pinChange);

  // El idioma del alumno manda sobre la cookie del dispositivo: una tableta
  // compartida no debe imponerle el idioma del compañero anterior.
  const locale = await resolveLocale(student.locale);
  const t = getDictionary(locale);
  const tl = getLearnDictionary(locale);

  return (
    <LocaleProvider locale={locale} dictionary={t}>
      {/* La telemetría se monta AQUÍ y no en el layout raíz: la landing y las
          páginas legales no generan eventos de aprendizaje y no deben cargar
          este JavaScript. */}
      <TelemetryProvider>
        {/* Dentro del provider y por encima de TODO lo demás: recoge los actos
            de interfaz de cualquier control marcado con `data-cet-id`, incluidos
            los de los diálogos, que React monta en un portal fuera de este
            árbol del DOM. */}
        <UiInteractionScope>
        {/* Fuera del flujo y en posicion fija: el aviso no puede empujar la
            leccion ni moverla cuando aparece a mitad de una frase. */}
        <EstadoDeEnvio textos={tl.envio} />
        <div className="flex min-h-dvh flex-col">
          <header className="border-b border-line bg-card">
            <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
              <span className="font-bold tracking-tight text-ink">{t.common.appName}</span>
              {/* El nombre es el camino a la cuenta. Antes era texto muerto y
                  `/account` no existía: cualquier enlace ahí daba un 404 mudo. */}
              <Link
                href="/account"
                data-cet-id="cabecera.cuenta"
                className="ml-auto rounded-lg px-2 py-1 text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                {student.fullName}
              </Link>
              <LocaleSwitcher current={locale} t={t} />
              <form action={signOut}>
                <button
                  type="submit"
                  data-cet-id="cabecera.salir"
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink"
                >
                  {t.common.signOut}
                </button>
              </form>
            </div>
          </header>

          {/* `pb-24`: la barra de pestañas es `fixed` y taparía el final del
              contenido. Sin este colchón, el último botón de una lección larga
              queda debajo de la barra y no se puede pulsar. En escritorio la
              barra pasa a raíl lateral y el colchón se mueve a la izquierda. */}
          <main
            id="main"
            className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-24 md:pb-8 md:pl-60"
          >
            {children}
          </main>

          <footer className="border-t border-line bg-card py-5 pb-24 md:pb-5 md:pl-56">
            <p className="text-center text-xs text-muted">{t.footer.copyright}</p>
          </footer>

          {/* Va al final del DOM y no dentro de la cabecera: el orden de
              tabulación debe llevar primero al contenido y después a la
              navegación, igual que el `SkipLink`. Visualmente el CSS la coloca
              donde toca. */}
          <StudentNav t={t} />
        </div>
        </UiInteractionScope>
      </TelemetryProvider>
    </LocaleProvider>
  );
}
