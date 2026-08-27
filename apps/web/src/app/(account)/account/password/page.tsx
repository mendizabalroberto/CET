/**
 * /account/password — cambio obligatorio de contraseña del personal.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `allowPasswordChange: true` es imprescindible: `requireRole` redirige AQUÍ
 * mientras la marca siga puesta, así que sin esa excepción esta página se
 * redirigiría a sí misma en un bucle infinito.
 */
import type { Metadata } from "next";

import { PasswordChangeForm } from "@/components/auth/PasswordChangeForm";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Contraseña" };

export default async function PasswordChangePage() {
  const profile = await requireRole(["superadmin", "school_admin", "teacher"], {
    onDeny: "home",
    allowPasswordChange: true,
  });

  const primeraVez = profile.mustChangePassword;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12">
      <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-ink">
          {primeraVez ? "Elige tu contraseña" : "Cambiar contraseña"}
        </h1>
        <p className="mt-2 text-muted">
          {primeraVez
            ? "Entraste con una contraseña provisional. Elige una tuya para continuar."
            : "Puedes cambiarla cuando quieras."}
        </p>

        <div className="mt-8">
          <PasswordChangeForm />
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-muted">
        © 2026 Roberto Mendizabal. Todos los derechos reservados.
      </p>
    </div>
  );
}
