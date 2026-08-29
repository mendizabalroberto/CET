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

/**
 * Quien es el nino que acaba de abrir su enlace.
 *
 * Misma escalada y mismo motivo que `alumnoDelDispositivo`: quien abre el
 * enlace no tiene sesion todavia —viene precisamente a conseguirla— y
 * `student_access_links` solo la lee `service_role`.
 *
 * Devuelve `null` para un enlace caducado, ya usado o inexistente, SIN
 * distinguir cual de los tres. La pantalla pinta el mismo mensaje en los tres
 * casos, y esa indistincion es deliberada: separarlos convertiria la pagina en
 * un oraculo sobre que tokens llegaron a existir.
 */
export async function alumnoDelEnlace(token: string): Promise<{
  readonly nombreDePila: string;
  readonly longitudDePin: 4 | 6;
} | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const admin = createAdminClient(
    "Resolver el alumno de un enlace de acceso: student_access_links solo la lee service_role",
  );

  const { data: enlace } = await admin
    .from("student_access_links")
    .select("student_id, expires_at")
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .maybeSingle();

  const fila = enlace as Fila | null;
  const studentId = fila?.["student_id"];
  const caduca = fila?.["expires_at"];
  if (typeof studentId !== "string") return null;

  // La caducidad se comprueba aqui y no en el `where`: asi el mismo camino
  // resuelve «caducado» y «revocado», y los dos devuelven exactamente lo mismo.
  if (typeof caduca !== "string" || new Date(caduca).getTime() <= Date.now()) return null;

  const [{ data: perfil }, { data: ficha }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", studentId).maybeSingle(),
    admin.from("students").select("stage").eq("profile_id", studentId).maybeSingle(),
  ]);

  const nombreCompleto = (perfil as Fila | null)?.["full_name"];
  if (typeof nombreCompleto !== "string" || nombreCompleto.trim() === "") return null;

  const etapa = (ficha as Fila | null)?.["stage"];

  return {
    nombreDePila: nombreCompleto.trim().split(/\s+/)[0] ?? "",
    longitudDePin: longitudPorEtapa(etapa === "secondary" ? "secondary" : "primary"),
  };
}

/**
 * A que buzon iba una invitacion de tutor, si sigue siendo canjeable.
 *
 * Devuelve `null` para una invitacion caducada, ya usada, revocada o
 * inexistente — sin distinguir, por el mismo motivo que `alumnoDelEnlace`.
 *
 * `guardian_invites` no tiene NI UNA politica RLS (0065) y es deliberado: el
 * fallo seguro de la tabla que guarda la credencial de un adulto es que nadie
 * la lea. De ahi la escalada, con la misma disciplina que las otras dos: se
 * devuelve el correo y nada mas.
 */
export async function invitacionDelToken(token: string): Promise<{ readonly email: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const admin = createAdminClient(
    "Resolver una invitacion de tutor: guardian_invites no tiene politica RLS para nadie, por diseño",
  );

  const { data } = await admin
    .from("guardian_invites")
    .select("email, expires_at, used_at")
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .maybeSingle();

  const fila = data as Fila | null;
  const email = fila?.["email"];
  const caduca = fila?.["expires_at"];

  if (typeof email !== "string") return null;
  // Un solo uso: `used_at` relleno es una invitacion gastada.
  if (fila?.["used_at"] != null) return null;
  if (typeof caduca !== "string" || new Date(caduca).getTime() <= Date.now()) return null;

  return { email };
}

export interface DispositivoRow {
  readonly id: string;
  readonly etiqueta: string | null;
  readonly agenteFamilia: string | null;
  readonly ultimoUso: string | null;
}

export interface DetalleDeHijo {
  readonly id: string;
  readonly nombre: string;
  readonly enlaceActivo: boolean;
  readonly dispositivos: readonly DispositivoRow[];
}

/**
 * La ficha de UN hijo para su pantalla.
 *
 * Va con la SESION DEL TUTOR y no con el cliente administrativo, a proposito:
 * asi es la RLS quien decide si puede verlo -`dispositivos_select_tutor` en
 * 0065 se apoya en `app.puede_ver_alumno`- y no una condicion que hayamos
 * escrito nosotros aqui. Si la consulta no devuelve fila, no es suyo, y la
 * pantalla responde 404 sin preguntarse por que.
 *
 * `device_hash` NO aparece en el `select`, y aunque apareciera no llegaria:
 * 0065 le retira el `select` de esa columna a `authenticated` con un grant por
 * columna. La lista de campos de aqui es conveniencia; la garantia esta en el
 * motor.
 */
export async function detalleDeHijo(studentId: string): Promise<DetalleDeHijo | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
    return null;
  }

  const supabase = await createClient();

  const { data: perfil } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", studentId)
    .maybeSingle();

  const nombre = (perfil as Fila | null)?.["full_name"];
  if (typeof nombre !== "string") return null;

  const [{ data: enlaces }, { data: dispositivos }] = await Promise.all([
    supabase
      .from("student_access_links")
      .select("id, expires_at")
      .eq("student_id", studentId)
      .is("revoked_at", null),
    supabase
      .from("student_devices")
      .select("id, etiqueta, agente_familia, last_seen_at")
      .eq("student_id", studentId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const ahora = Date.now();
  const enlaceActivo = ((enlaces ?? []) as Fila[]).some((fila) => {
    const caduca = fila["expires_at"];
    return typeof caduca === "string" && new Date(caduca).getTime() > ahora;
  });

  return {
    id: studentId,
    nombre,
    enlaceActivo,
    dispositivos: ((dispositivos ?? []) as Fila[]).map((fila) => ({
      id: String(fila["id"]),
      etiqueta: typeof fila["etiqueta"] === "string" ? fila["etiqueta"] : null,
      agenteFamilia: typeof fila["agente_familia"] === "string" ? fila["agente_familia"] : null,
      ultimoUso: typeof fila["last_seen_at"] === "string" ? fila["last_seen_at"] : null,
    })),
  };
}
