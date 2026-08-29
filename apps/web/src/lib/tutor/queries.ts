/**
 * Lecturas de la zona del tutor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Vive aparte de `actions.ts` a proposito: aquel lleva `"use server"` y todo lo
 * que exporta es un endpoint HTTP invocable desde el navegador. Una lectura que
 * un Server Component hace para pintar no debe serlo.
 *
 * `listarHijos()` lee con la SESION del tutor: la RLS de `guardian_students`,
 * `profiles` y `students` (migracion 0059, sobre `app.puede_ver_alumno`) es la
 * frontera, y este modulo no la esquiva.
 *
 * `alumnoDelDispositivo()` es la unica excepcion, y esta documentada abajo.
 */
import "server-only";

import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { longitudDePin as longitudPorEtapa } from "./schemas";
import { hashToken } from "./tokens";

export interface HijoRow {
  readonly id: string;
  readonly nombre: string;
  readonly colegio: string | null;
  readonly enlaceActivo: boolean;
  readonly dispositivos: number;
}

/** Lo que Postgres devuelve cuando se le piden columnas sin tipos generados. */
type Fila = Record<string, unknown>;

function texto(fila: Fila, columna: string): string {
  const v = fila[columna];
  return typeof v === "string" ? v : "";
}

/**
 * Los hijos del tutor de la sesion, con lo justo para pintar la lista:
 * su nombre, si hoy tiene un enlace vivo y cuantos dispositivos le recuerdan.
 *
 * No devuelve curso, ni fecha, ni codigo de alumno: esta lista se pinta en una
 * pantalla y lo que no se pinta no hace falta que viaje.
 */
export async function listarHijos(): Promise<readonly HijoRow[]> {
  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });
  const supabase = await createClient();

  const { data: vinculos, error: vinculosError } = await supabase
    .from("guardian_students")
    .select("student_id")
    .eq("guardian_id", tutor.id)
    .is("revoked_at", null);

  if (vinculosError !== null || vinculos === null) {
    // Ruidoso a proposito (R4): una lista vacia por un fallo de consulta se lee
    // en pantalla como "no tienes hijos", que es un mensaje falso.
    console.error("[cet] listarHijos guardian_students", vinculosError?.message ?? "sin datos");
    return [];
  }

  const ids = (vinculos as Fila[])
    .map((v) => v["student_id"])
    .filter((v): v is string => typeof v === "string");
  if (ids.length === 0) return [];

  const ahora = new Date().toISOString();

  const [perfiles, membresias, enlaces, dispositivos] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", ids),
    supabase
      .from("student_school_memberships")
      .select("student_id, schools(name)")
      .in("student_id", ids)
      .eq("status", "activa"),
    supabase
      .from("student_access_links")
      .select("student_id")
      .in("student_id", ids)
      .is("revoked_at", null)
      .gt("expires_at", ahora),
    supabase
      .from("student_devices")
      .select("student_id")
      .in("student_id", ids)
      .is("revoked_at", null),
  ]);

  const nombrePorId = new Map<string, string>();
  for (const fila of (perfiles.data ?? []) as Fila[]) {
    const id = fila["id"];
    if (typeof id === "string") nombrePorId.set(id, texto(fila, "full_name"));
  }

  const colegioPorId = new Map<string, string>();
  for (const fila of (membresias.data ?? []) as Fila[]) {
    const id = fila["student_id"];
    // PostgREST devuelve el join anidado como objeto o como array de uno,
    // segun la cardinalidad que infiera de la FK. Se aceptan las dos formas.
    const anidado = fila["schools"];
    const escuela = Array.isArray(anidado) ? anidado[0] : anidado;
    const nombre = (escuela as Fila | null | undefined)?.["name"];
    if (typeof id === "string" && typeof nombre === "string") colegioPorId.set(id, nombre);
  }

  const conEnlace = new Set(
    ((enlaces.data ?? []) as Fila[])
      .map((f) => f["student_id"])
      .filter((v): v is string => typeof v === "string"),
  );

  const cuentaDispositivos = new Map<string, number>();
  for (const fila of (dispositivos.data ?? []) as Fila[]) {
    const id = fila["student_id"];
    if (typeof id === "string") cuentaDispositivos.set(id, (cuentaDispositivos.get(id) ?? 0) + 1);
  }

  return ids.map((id) => ({
    id,
    nombre: nombrePorId.get(id) ?? "",
    colegio: colegioPorId.get(id) ?? null,
    enlaceActivo: conEnlace.has(id),
    dispositivos: cuentaDispositivos.get(id) ?? 0,
  }));
}

/**
 * Quien es el nino que vuelve al dia siguiente, a partir del secreto de su
 * cookie.
 *
 * ESCALADA DE PRIVILEGIO, y aqui es inevitable: quien pregunta TODAVIA NO TIENE
 * SESION —esa es justo la pantalla de login— asi que no hay `auth.uid()` contra
 * el que una politica pueda decidir, y `student_devices` no le concede nada a
 * `anon` (0065 le retira incluso el `select`).
 *
 * Devuelve SOLO el nombre de pila y cuantas casillas de PIN dibujar. Ni
 * apellidos, ni curso, ni colegio, ni codigo: quien encuentre la tablet perdida
 * de un nino no debe poder sacar de ahi su ficha.
 */
export async function alumnoDelDispositivo(secreto: string): Promise<{
  readonly nombreDePila: string;
  readonly longitudDePin: 4 | 6;
} | null> {
  // Se acota ANTES de tocar la base: la cookie la controla quien visita, y un
  // valor de 10 MB no tiene por que llegar hasta un `where`.
  if (!/^[A-Za-z0-9_-]{43}$/.test(secreto)) return null;

  const admin = createAdminClient(
    "Resolver el alumno de una cookie de dispositivo: student_devices no es legible por anon",
  );

  const { data: dispositivo } = await admin
    .from("student_devices")
    .select("student_id")
    .eq("device_hash", hashToken(secreto))
    .is("revoked_at", null)
    .maybeSingle();

  const studentId = (dispositivo as Fila | null)?.["student_id"];
  if (typeof studentId !== "string") return null;

  const [{ data: perfil }, { data: ficha }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", studentId).maybeSingle(),
    admin.from("students").select("stage").eq("profile_id", studentId).maybeSingle(),
  ]);

  const nombreCompleto = (perfil as Fila | null)?.["full_name"];
  if (typeof nombreCompleto !== "string" || nombreCompleto.trim() === "") return null;

  const etapa = (ficha as Fila | null)?.["stage"];
  const longitud = longitudPorEtapa(etapa === "secondary" ? "secondary" : "primary");

  return {
    // El nombre de pila y nada mas. "Leo", no "Leo Mendizabal Garcia".
    nombreDePila: nombreCompleto.trim().split(/\s+/)[0] ?? "",
    longitudDePin: longitud,
  };
}
