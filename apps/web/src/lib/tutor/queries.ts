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

import type { I18nText } from "@cet/shared";

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

  const { data: perfil, error: perfilError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", studentId)
    .maybeSingle();

  // RUIDOSO A PROPOSITO (R4), y no por simetria con `listarHijos`.
  //
  // Esta funcion devuelve `null` y su pagina responde 404, que es lo correcto
  // cuando el id no es de un hijo suyo. Pero un fallo de permisos —una politica
  // que falta, un `grant` que no esta— produce EXACTAMENTE el mismo `null`, y
  // entonces el 404 deja de significar "no es tuyo" y pasa a significar "algo
  // esta roto y nadie se ha enterado". Distinguirlos en el LOG no le dice nada
  // a quien sondea, porque la respuesta sigue siendo la misma.
  if (perfilError !== null) {
    console.error("[cet] detalleDeHijo profiles", perfilError.code, perfilError.message);
    return null;
  }

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

/* ===========================================================================
 * EL SEGUIMIENTO: cómo va el hijo
 * =========================================================================== */

/** Un día de la serie de constancia, tal y como lo devuelve la base. */
export interface DiaDeEstudio {
  /** Día LOCAL del alumno, en `YYYY-MM-DD`. Lo decide la base, no el navegador. */
  readonly fecha: string;
  /** Minutos de ese día. `null` = la fila no traía un número utilizable. */
  readonly minutos: number | null;
}

/** Una destreza medida. `mastery` viene en 0..1. */
export interface DestrezaDeHijo {
  readonly id: string;
  readonly nombre: I18nText;
  readonly mastery: number | null;
}

/** Una lección y los minutos que se le atribuyen. */
export interface LeccionDeHijo {
  readonly id: string;
  readonly nombre: I18nText;
  readonly minutos: number;
}

/** Las nueve cifras de cabecera. `porcentajeAcierto` viene en 0..100. */
export interface ResumenDeEstudio {
  readonly minutosEstudio: number;
  readonly sesiones: number;
  readonly leccionesAbiertas: number;
  readonly leccionesCompletadas: number;
  readonly itemsRespondidos: number;
  readonly porcentajeAcierto: number;
  readonly examenesEntregados: number;
  readonly pistasPedidas: number;
  readonly rachaMaxima: number;
}

export interface SeguimientoDeHijo {
  /** Días que abarca la ventana, hoy incluido. Se pinta en los textos. */
  readonly dias: number;
  /** `null` cuando la consulta no devolvió fila: no es lo mismo que «todo a cero». */
  readonly resumen: ResumenDeEstudio | null;
  readonly serie: readonly DiaDeEstudio[];
  readonly destrezas: readonly DestrezaDeHijo[];
  readonly lecciones: readonly LeccionDeHijo[];
}

/** Ventana por defecto. Una semana cabe en una pantalla de móvil sin apretar. */
export const DIAS_DE_SEGUIMIENTO = 7;

/** Número utilizable, o `null`. PostgREST entrega los `numeric` como cadena. */
function numero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string" && valor.trim() !== "") {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Número utilizable o cero, para las cifras que la base garantiza no nulas. */
function entero(valor: unknown): number {
  const n = numero(valor);
  return n === null ? 0 : Math.round(n);
}

/**
 * Los dos extremos de la ventana de informe, en ISO.
 *
 * LA TRAMPA, ESCRITA DONDE SE CONSTRUYE. Las cuatro funciones de informe usan
 * una ventana SEMIABIERTA `[desde, hasta)`: `server_ts >= p_desde and
 * server_ts < p_hasta`. Pasar la medianoche de HOY como fin deja el día en
 * curso ENTERO fuera, y un tutor que abre la ficha por la tarde, después de que
 * su hijo haya estudiado, ve ceros en todo. El fin tiene que caer DESPUÉS del
 * último evento de hoy — el `current_date + 1` de SQL, o cualquier instante
 * posterior a ahora.
 *
 * Y EL FIN ES «AHORA», NO LA MEDIANOCHE DE MAÑANA. Este es el segundo filo de
 * la misma navaja, y no se ve hasta que se mira la gráfica. La serie diaria
 * genera su calendario con `generate_series` desde `desde` hasta
 * `hasta - 1 microsegundo`, LEÍDOS EN LA ZONA HORARIA DEL ALUMNO. Un fin en la
 * medianoche UTC de mañana son las 02:00 de mañana en Madrid, así que el
 * calendario incluiría el día de MAÑANA: una columna a cero, en el futuro,
 * pegada al borde derecho de la gráfica, para siempre. Es exactamente la
 * «barra de cero permanente al borde» contra la que avisa la cabecera de la
 * migración 0062. Con `ahora` como fin, el último día del calendario es el de
 * hoy en la zona del niño, sea cual sea esa zona.
 *
 * El principio sí se ancla a la medianoche UTC, para que el primer día salga
 * entero y no cortado por la hora a la que el tutor abra la pantalla.
 *
 * NINGUNO DE LOS DOS EXTREMOS INTENTA ADIVINAR LA ZONA DEL NIÑO: el día que
 * agrupa la serie lo decide la base con `app.zona_horaria_alumno`. Aquí solo se
 * eligen dos instantes que no recorten por el lado de hoy ni inventen mañana.
 * Como consecuencia, la serie puede traer un día MÁS de los pedidos cuando el
 * alumno vive al este de Greenwich; los textos cuentan los días que de verdad
 * vienen y no los que se pidieron, así que la frase nunca contradice al dibujo.
 */
function ventanaDeInforme(dias: number): { readonly desde: string; readonly hasta: string } {
  const ahora = new Date();
  const medianocheDeHoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  const inicio = medianocheDeHoy - (dias - 1) * 24 * 60 * 60 * 1000;
  return { desde: new Date(inicio).toISOString(), hasta: ahora.toISOString() };
}

/** `jsonb` de la base a `I18nText`, o `null` si no trae ningún idioma con texto. */
function leerI18n(valor: unknown): I18nText | null {
  if (typeof valor === "string" && valor.trim() !== "") return { en: valor, es: valor };
  if (valor === null || typeof valor !== "object") return null;
  const fila = valor as Fila;
  const bruto = (clave: string): string | undefined => {
    const v = fila[clave];
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  };
  const en = bruto("en");
  const es = bruto("es");
  if (en === undefined && es === undefined) return null;
  return { ...(en === undefined ? {} : { en }), ...(es === undefined ? {} : { es }) };
}

/**
 * Cómo le va a UN hijo en los últimos días.
 *
 * Va con la SESIÓN DEL TUTOR, igual que `detalleDeHijo` y por el mismo motivo:
 * las cuatro funciones de informe llaman a `app.puede_ver_informe()` en su
 * primera línea, así que es el motor quien decide si este adulto alcanza a este
 * menor. Aquí no se escribe ninguna comprobación de pertenencia — escribirla
 * sería una segunda copia de la regla de acceso a datos de un menor, y dos
 * copias divergen.
 *
 * NO LANZA, como el resto de lecturas de esta casa. Si una de las cuatro
 * consultas falla, esa parte viene vacía y las otras tres se pintan igual: un
 * informe incompleto es mejor que la pantalla roja de `app/error.tsx`, y quien
 * decide qué enseñar es la página.
 *
 * Las cuatro van en paralelo porque son independientes entre sí; la quinta
 * —los nombres de las lecciones— no puede: necesita los ids que devuelve la
 * cuarta.
 */
export async function seguimientoDeHijo(
  studentId: string,
  dias: number = DIAS_DE_SEGUIMIENTO,
): Promise<SeguimientoDeHijo> {
  const vacio: SeguimientoDeHijo = { dias, resumen: null, serie: [], destrezas: [], lecciones: [] };

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
    return vacio;
  }

  const supabase = await createClient();
  const { desde, hasta } = ventanaDeInforme(dias);
  const args = { p_student_id: studentId, p_desde: desde, p_hasta: hasta };

  const [resumen, serie, skills, tiempo] = await Promise.all([
    supabase.rpc("informe_alumno_resumen", args),
    supabase.rpc("informe_alumno_serie_diaria", args),
    supabase.rpc("informe_alumno_skills", args),
    supabase.rpc("informe_alumno_tiempo_por_leccion", args),
  ]);

  // RUIDOSO A PROPÓSITO (R4). Un informe a cero por un `grant` que falta se ve
  // en pantalla exactamente igual que un niño que no ha estudiado, y el tutor
  // no tiene forma de distinguirlos. En el registro sí se distinguen.
  const respuestas = [
    { parte: "resumen", error: resumen.error },
    { parte: "serie", error: serie.error },
    { parte: "skills", error: skills.error },
    { parte: "tiempo", error: tiempo.error },
  ];
  for (const { parte, error } of respuestas) {
    if (error !== null) {
      console.error("[cet] seguimientoDeHijo", parte, error.code, error.message);
    }
  }

  const filaResumen = ((resumen.data ?? []) as Fila[])[0];
  const cifras: ResumenDeEstudio | null =
    filaResumen === undefined
      ? null
      : {
          minutosEstudio: numero(filaResumen["minutos_estudio"]) ?? 0,
          sesiones: entero(filaResumen["sesiones"]),
          leccionesAbiertas: entero(filaResumen["lecciones_abiertas"]),
          leccionesCompletadas: entero(filaResumen["lecciones_completadas"]),
          itemsRespondidos: entero(filaResumen["items_respondidos"]),
          porcentajeAcierto: numero(filaResumen["porcentaje_acierto"]) ?? 0,
          examenesEntregados: entero(filaResumen["examenes_entregados"]),
          pistasPedidas: entero(filaResumen["pistas_pedidas"]),
          rachaMaxima: entero(filaResumen["racha_maxima"]),
        };

  const serieDeDias = ((serie.data ?? []) as Fila[])
    .map((fila): DiaDeEstudio | null => {
      const fecha = fila["fecha"];
      if (typeof fecha !== "string") return null;
      return { fecha, minutos: numero(fila["minutos_estudio"]) };
    })
    .filter((d): d is DiaDeEstudio => d !== null);

  const destrezas = ((skills.data ?? []) as Fila[])
    .map((fila): DestrezaDeHijo | null => {
      const id = fila["skill_id"];
      const nombre = leerI18n(fila["nombre_skill"]);
      // Sin nombre no hay renglón que pintar: una escalera sin destreza al lado
      // no le dice nada a nadie.
      if (typeof id !== "string" || nombre === null) return null;
      return { id, nombre, mastery: numero(fila["mastery"]) };
    })
    .filter((s): s is DestrezaDeHijo => s !== null);

  const minutosPorLeccion = new Map<string, number>();
  for (const fila of (tiempo.data ?? []) as Fila[]) {
    const id = fila["leccion_id"];
    const minutos = numero(fila["minutos"]);
    if (typeof id === "string" && minutos !== null && minutos > 0) {
      minutosPorLeccion.set(id, minutos);
    }
  }

  return {
    dias,
    resumen: cifras,
    serie: serieDeDias,
    destrezas,
    lecciones: await nombrarLecciones(supabase, minutosPorLeccion),
  };
}

/**
 * Los minutos por lección, con el nombre de cada una puesto.
 *
 * La función de informe devuelve `leccion_id` y nada más —mide, no cataloga—,
 * así que los títulos se leen aparte de `lessons`, y con la sesión del tutor:
 * `lessons_select` (0012) le deja ver la biblioteca GLOBAL, que es donde está
 * el contenido de un niño que aprende en casa.
 *
 * UNA LECCIÓN CUYO TÍTULO NO ALCANZA SE CAE DE LA LISTA, y es deliberado: si
 * pertenece a un colegio ajeno, la RLS no devuelve su fila, y pintar «45 min»
 * junto a un renglón vacío —o junto a un uuid— sería enseñarle a este adulto un
 * dato de un centro al que no pertenece. Mejor una lista más corta y cierta.
 */
async function nombrarLecciones(
  supabase: Awaited<ReturnType<typeof createClient>>,
  minutosPorLeccion: ReadonlyMap<string, number>,
): Promise<readonly LeccionDeHijo[]> {
  const ids = [...minutosPorLeccion.keys()];
  if (ids.length === 0) return [];

  const { data, error } = await supabase.from("lessons").select("id, title").in("id", ids);
  if (error !== null) {
    console.error("[cet] seguimientoDeHijo lessons", error.code, error.message);
    return [];
  }

  const salida: LeccionDeHijo[] = [];
  for (const fila of (data ?? []) as Fila[]) {
    const id = fila["id"];
    const nombre = leerI18n(fila["title"]);
    if (typeof id !== "string" || nombre === null) continue;
    const minutos = minutosPorLeccion.get(id);
    if (minutos === undefined) continue;
    salida.push({ id, nombre, minutos });
  }
  return salida;
}
