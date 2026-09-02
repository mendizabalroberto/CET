/**
 * /tutor — mis hijos.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * La lista sale de `listarHijos()`, que consulta con la SESIÓN DEL TUTOR: es la
 * RLS quien decide qué hijos son suyos, no una condición escrita aquí. Si un
 * día esa política se relajara, el fallo se vería en la prueba de RLS y no en
 * esta página — que es donde debe verse.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { AnadirHijoForm } from "@/components/tutor/AnadirHijoForm";
import { Telegram } from "@/components/tutor/Telegram";
import { interpolate } from "@/lib/i18n";
import { getServerDictionary } from "@/lib/i18n/server";
import { estadoDeTelegram, listarHijos } from "@/lib/tutor/queries";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.home.title };
}

export default async function TutorPage() {
  const { t } = await getServerDictionary();
  const [hijos, telegram] = await Promise.all([listarHijos(), estadoDeTelegram()]);

  const H = t.tutor.home;

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">{H.title}</h1>

      {hijos.length === 0 ? (
        <div className="rounded-2xl border-2 border-line bg-card p-5">
          <p className="font-semibold text-ink">{H.empty}</p>
          <p className="mt-2 text-muted">{H.emptyBody}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {hijos.map((hijo) => (
            <li key={hijo.id}>
              <Link
                href={`/tutor/hijos/${hijo.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-line bg-card px-5 py-4 transition-colors hover:border-teal"
              >
                <div>
                  <p className="font-semibold text-ink">{hijo.nombre}</p>
                  <p className="text-sm text-muted">
                    {/* «Aprende en casa» y no «sin colegio»: para un padre que
                        ha dado de alta a su hijo por su cuenta, no tener
                        colegio no es una carencia. */}
                    {hijo.colegio ?? H.noSchool}
                    {" · "}
                    {hijo.enlaceActivo ? H.linkActive : H.linkNone}
                    {hijo.dispositivos > 0
                      ? ` · ${interpolate(H.devices, { count: hijo.dispositivos })}`
                      : ""}
                  </p>
                </div>
                <span aria-hidden="true" className="font-semibold text-teal">
                  {H.open} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <AnadirHijoForm />

      {/*
        SIN BOT CONFIGURADO, LA SECCION NO EXISTE.
        Ofrecerle a un padre unos avisos que no van a llegar es peor que no
        ofrecerselos: se queda esperandolos. `estadoDeTelegram()` resuelve
        `disponible` mirando el entorno del servidor, no una preferencia suya.

        El `key` tira el estado del cliente cuando el vinculo cambia de verdad
        —al conectarse o al cortarse—, para que un enlace ya quemado no siga
        pintado. El porque completo esta en la cabecera de `Telegram.tsx`.
      */}
      {telegram.disponible ? (
        <Telegram
          key={telegram.vinculadoAt ?? "sin-vinculo"}
          vinculado={telegram.vinculado}
          vinculadoAt={telegram.vinculadoAt}
        />
      ) : null}
    </section>
  );
}
