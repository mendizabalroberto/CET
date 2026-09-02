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

import { cache } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { I18nText } from "@cet/shared";

import { requireRole } from "@/lib/auth/session";
import { telegramDisponible } from "@/lib/telegram/bot";
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
 * EL ALCANCE DEL HIJO: qué biblioteca es la suya
 * =========================================================================== */

export interface AlcanceDeHijo {
  readonly id: string;
  readonly nombre: string;
  /**
   * `students.school_id`, que es lo que decide QUÉ CONTENIDO es el suyo (AD-2:
   * `null` = solo la biblioteca global, con valor = global más el del centro).
   *
   * Sale de `students` y NO de `profiles`: desde la refundación de la tenencia,
   * `profiles.school_id` es NULL para todo alumno y la matrícula vive en
   * `student_school_memberships`, de la que `students.school_id` es la caché
   * (DATA_MODEL §3.3). Es la misma columna que lee `requireStudent()`, así que
   * el padre mira EXACTAMENTE el mismo catálogo que su hijo y no una
   * aproximación que un día divergiría.
   */
  readonly schoolId: string | null;
}

/**
 * Quién es este hijo y cuál es su biblioteca, para poder enseñarle al padre el
 * contenido que su hijo tiene delante.
 *
 * Va con la SESIÓN DEL TUTOR, como todo lo demás de esta casa: `profiles` y
 * `students` se leen bajo `app.puede_ver_alumno`, así que un id que no sea de
 * un hijo suyo devuelve `null` y su página responde 404. Aquí no se escribe
 * ninguna comprobación de pertenencia.
 *
 * OJO A LO QUE ESTA FUNCIÓN NO CONCEDE. Devolver el `school_id` de un colegio
 * no le abre a este adulto el contenido de ese colegio: las políticas de
 * contenido (`app.can_read_content`, 0004) miran el colegio DEL LECTOR, no el
 * que traiga un argumento. Para un tutor sin centro, el filtro `.or(...)` de
 * `getStudentCourses` puede nombrar el colegio del hijo y la base seguirá
 * devolviéndole solo lo global. Es el resultado correcto —ve menos, nunca
 * más—, y la pantalla lo dice en vez de fingir un catálogo vacío.
 */
/**
 * ENVUELTA EN `cache()` DE REACT, y no por ahorrar milisegundos.
 *
 * El layout del área del hijo la llama para pintar su nombre y decidir el 404,
 * y la página de dentro vuelve a llamarla para lo mismo. Esa segunda llamada es
 * deliberada —un layout no es una barrera de autorización— pero sin `cache()`
 * serían DOS pares de consultas idénticas por cada navegación, y el número
 * crecería con cada pantalla nueva que se añadiera al área.
 *
 * `cache()` memoiza por argumentos DENTRO de una misma petición, así que no hay
 * riesgo de servirle a un tutor la fila que se leyó para otro: dos peticiones
 * son dos cachés. Es el mecanismo que Next documenta justo para este caso.
 */
export const alcanceDeHijo = cache(async function alcanceDeHijo(
  studentId: string,
): Promise<AlcanceDeHijo | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
    return null;
  }

  const supabase = await createClient();

  const { data: perfil, error: perfilError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", studentId)
    .maybeSingle();

  // RUIDOSO A PROPÓSITO (R4), igual que `detalleDeHijo`: un `null` por permisos
  // y un `null` por «no es tuyo» producen el mismo 404, y solo el registro los
  // distingue.
  if (perfilError !== null) {
    console.error("[cet] alcanceDeHijo profiles", perfilError.code, perfilError.message);
    return null;
  }

  const nombre = (perfil as Fila | null)?.["full_name"];
  if (typeof nombre !== "string") return null;

  const { data: alumno, error: alumnoError } = await supabase
    .from("students")
    .select("school_id")
    .eq("profile_id", studentId)
    .maybeSingle();

  if (alumnoError !== null) {
    console.error("[cet] alcanceDeHijo students", alumnoError.code, alumnoError.message);
    return null;
  }

  // Un perfil con rol `student` sin ficha en `students` es un estado imposible
  // (DATA_MODEL §1). No se adivina un alcance: se corta.
  if (alumno === null) return null;

  const colegio = (alumno as Fila)["school_id"];

  return {
    id: studentId,
    nombre,
    schoolId: typeof colegio === "string" ? colegio : null,
  };
});

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

/**
 * Los minutos de la ventana, agrupados por materia.
 *
 * Sale de encadenar `lessons -> course_modules -> courses -> subjects` a partir
 * de las mismas filas que ya trae `informe_alumno_tiempo_por_leccion`: no hay
 * ningún RPC que devuelva materia directamente, así que el agrupado lo hace
 * esta capa (`materiasDeLecciones`, más abajo), nunca SQL nuevo.
 *
 * SOLO MINUTOS. `informe_alumno_resumen` y `informe_alumno_skills` dan acierto
 * y dominio agregados de TODO el niño, no por materia: no hay de dónde sacar
 * «74 % de acierto en Matemáticas» sin una función nueva que reparta los ítems
 * respondidos por materia, y esta ronda no abre migraciones. Por eso
 * `SubjectBreakdownRow` en `@cet/ui` admite acierto y lecciones terminadas
 * opcionales, y aquí nunca se rellenan.
 */
export interface MateriaDeHijo {
  readonly subjectId: string;
  readonly code: string;
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

/**
 * Una hora del reloj del alumno y lo que hizo en ella.
 *
 * `informe_alumno_actividad_por_hora` devuelve SIEMPRE las veinticuatro, con
 * las vacías a cero, así que aquí el cero es una medida y no un hueco. Los
 * minutos salen de la diferencia entre latidos consecutivos del cronómetro, de
 * modo que cada minuto está atribuido a la hora en la que de verdad ocurrió;
 * la cabecera de la migración 0085 lo explica entero.
 */
export interface HoraDeEstudio {
  /** 0..23, en la zona horaria del alumno. La resuelve la base, no esta capa. */
  readonly hora: number;
  readonly minutos: number;
  /** Eventos de aprendizaje de esa hora. No se pinta: sirve para depurar. */
  readonly eventos: number;
}

/**
 * Lo que salió de un día: el otro eje de la dispersión.
 *
 * La fecha es la MISMA clave que trae `serie`, y los dos calendarios los genera
 * la base igual (ver 0086). Cruzarlos por la fecha es lo único que hace la capa
 * de arriba; si alguna vez dejaran de cuadrar, los puntos llevarían los minutos
 * de un día y las lecciones de otro sin que nada fallara.
 */
export interface LogroDelDia {
  readonly fecha: string;
  readonly leccionesCompletadas: number;
  readonly itemsRespondidos: number;
  readonly aciertos: number;
}

export interface SeguimientoDeHijo {
  /** Días que abarca la ventana, hoy incluido. Se pinta en los textos. */
  readonly dias: number;
  /** `null` cuando la consulta no devolvió fila: no es lo mismo que «todo a cero». */
  readonly resumen: ResumenDeEstudio | null;
  /**
   * El MISMO resumen, pero de los `dias` inmediatamente anteriores a la
   * ventana (p. ej. `[hoy-14, hoy-7)` cuando `resumen` es `[hoy-7, hoy]`). Sirve
   * SOLO para calcular la variación de las cifras de cabecera; `null` cuando no
   * hay fila —sin periodo anterior no hay variación que enseñar, y no se
   * inventa un cero contra el que comparar.
   */
  readonly resumenAnterior: ResumenDeEstudio | null;
  readonly serie: readonly DiaDeEstudio[];
  /**
   * Los últimos 28 días, día a día, para la tendencia semanal de la baldosa de
   * tiempo. Ventana distinta de `serie` a propósito: la constancia diaria
   * necesita columnas legibles y 28 se emborronarían; la tendencia semanal
   * necesita cuatro semanas completas y 7 días no alcanzan para una sola.
   */
  readonly serie28: readonly DiaDeEstudio[];
  readonly destrezas: readonly DestrezaDeHijo[];
  readonly lecciones: readonly LeccionDeHijo[];
  /** El reparto de `lecciones` por materia. Ver `MateriaDeHijo`. */
  readonly materias: readonly MateriaDeHijo[];
  /** El reloj del día. Vacío cuando la consulta falla o no hay medición. */
  readonly horas: readonly HoraDeEstudio[];
  /** Lo logrado cada día, para cruzarlo con los minutos de `serie`. */
  readonly logro: readonly LogroDelDia[];
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

/**
 * Los `dias` inmediatamente ANTERIORES al `desde` de la ventana actual.
 *
 * `hasta` de esta ventana es el `desde` de la actual, sin tocar: como las seis
 * funciones de informe leen `[p_desde, p_hasta)` —semiabierto—, el instante en
 * el que empieza «esta semana» queda excluido de «la semana anterior», y las
 * dos ventanas ni se solapan ni dejan un hueco de un microsegundo entre ellas.
 */
function ventanaAnterior(
  desdeActual: string,
  dias: number,
): { readonly desde: string; readonly hasta: string } {
  const hasta = desdeActual;
  const desde = new Date(new Date(desdeActual).getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
  return { desde, hasta };
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
 * las seis funciones de informe llaman a `app.puede_ver_informe()` en su
 * primera línea, así que es el motor quien decide si este adulto alcanza a este
 * menor. Aquí no se escribe ninguna comprobación de pertenencia — escribirla
 * sería una segunda copia de la regla de acceso a datos de un menor, y dos
 * copias divergen.
 *
 * NO LANZA, como el resto de lecturas de esta casa. Si una de las seis
 * consultas falla, esa parte viene vacía y las demás se pintan igual: un
 * informe incompleto es mejor que la pantalla roja de `app/error.tsx`, y quien
 * decide qué enseñar es la página.
 *
 * Las seis van en paralelo porque son independientes entre sí; la séptima
 * —los nombres de las lecciones— no puede: necesita los ids que devuelve la
 * del tiempo por lección.
 *
 * DOS DE LAS SEIS SON NUEVAS Y NO ROMPEN NADA SI FALTAN. El reloj del día
 * (0085) y el logro diario (0086) llegan vacíos si su función no está en la
 * base, y sus dos paneles se callan solos: el informe pierde dos secciones y
 * conserva las otras cuatro. Es la misma tolerancia que ya tenía, aplicada a
 * las partes que se añaden después.
 */
export async function seguimientoDeHijo(
  studentId: string,
  dias: number = DIAS_DE_SEGUIMIENTO,
): Promise<SeguimientoDeHijo> {
  const vacio: SeguimientoDeHijo = {
    dias,
    resumen: null,
    resumenAnterior: null,
    serie: [],
    serie28: [],
    destrezas: [],
    lecciones: [],
    materias: [],
    horas: [],
    logro: [],
  };

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
    return vacio;
  }

  const supabase = await createClient();
  const { desde, hasta } = ventanaDeInforme(dias);
  const args = { p_student_id: studentId, p_desde: desde, p_hasta: hasta };
  const anterior = ventanaAnterior(desde, dias);
  const argsAnterior = { p_student_id: studentId, p_desde: anterior.desde, p_hasta: anterior.hasta };
  // Ventana de 28 días para la tendencia semanal de la baldosa de tiempo. Ver
  // `SeguimientoDeHijo.serie28` y `minutosObservados` en `lib/plan/consultas.ts`,
  // que reparte la misma ventana para el mismo RPC.
  const ventana28 = ventanaDeInforme(28);
  const args28 = { p_student_id: studentId, p_desde: ventana28.desde, p_hasta: ventana28.hasta };

  const [resumen, resumenAnterior, serie, serie28Res, skills, tiempo, horas, logro] = await Promise.all([
    supabase.rpc("informe_alumno_resumen", args),
    supabase.rpc("informe_alumno_resumen", argsAnterior),
    supabase.rpc("informe_alumno_serie_diaria", args),
    supabase.rpc("informe_alumno_serie_diaria", args28),
    supabase.rpc("informe_alumno_skills", args),
    supabase.rpc("informe_alumno_tiempo_por_leccion", args),
    supabase.rpc("informe_alumno_actividad_por_hora", args),
    supabase.rpc("informe_alumno_logro_diario", args),
  ]);

  // RUIDOSO A PROPÓSITO (R4). Un informe a cero por un `grant` que falta se ve
  // en pantalla exactamente igual que un niño que no ha estudiado, y el tutor
  // no tiene forma de distinguirlos. En el registro sí se distinguen.
  const respuestas = [
    { parte: "resumen", error: resumen.error },
    { parte: "resumenAnterior", error: resumenAnterior.error },
    { parte: "serie", error: serie.error },
    { parte: "serie28", error: serie28Res.error },
    { parte: "skills", error: skills.error },
    { parte: "tiempo", error: tiempo.error },
    { parte: "horas", error: horas.error },
    { parte: "logro", error: logro.error },
  ];
  for (const { parte, error } of respuestas) {
    if (error !== null) {
      console.error("[cet] seguimientoDeHijo", parte, error.code, error.message);
    }
  }

  /** Una fila de `informe_alumno_resumen` a `ResumenDeEstudio`, o `null` sin fila. */
  function leerResumen(filas: readonly Fila[]): ResumenDeEstudio | null {
    const fila = filas[0];
    if (fila === undefined) return null;
    return {
      minutosEstudio: numero(fila["minutos_estudio"]) ?? 0,
      sesiones: entero(fila["sesiones"]),
      leccionesAbiertas: entero(fila["lecciones_abiertas"]),
      leccionesCompletadas: entero(fila["lecciones_completadas"]),
      itemsRespondidos: entero(fila["items_respondidos"]),
      porcentajeAcierto: numero(fila["porcentaje_acierto"]) ?? 0,
      examenesEntregados: entero(fila["examenes_entregados"]),
      pistasPedidas: entero(fila["pistas_pedidas"]),
      rachaMaxima: entero(fila["racha_maxima"]),
    };
  }

  const cifras = leerResumen((resumen.data ?? []) as Fila[]);
  const cifrasAnteriores = leerResumen((resumenAnterior.data ?? []) as Fila[]);

  const serie28 = ((serie28Res.data ?? []) as Fila[])
    .map((fila): DiaDeEstudio | null => {
      const fecha = fila["fecha"];
      if (typeof fecha !== "string") return null;
      return { fecha, minutos: numero(fila["minutos_estudio"]) };
    })
    .filter((d): d is DiaDeEstudio => d !== null);

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

  // El reloj: la base garantiza las 24 horas, pero lo que llega se filtra
  // igual. Una fila con la hora fuera de 0..23 no es una hora del día y
  // pintarla correría todo el eje sin que nada avisara.
  const relojDelDia = ((horas.data ?? []) as Fila[])
    .map((fila): HoraDeEstudio | null => {
      const hora = numero(fila["hora"]);
      if (hora === null || !Number.isInteger(hora) || hora < 0 || hora > 23) return null;
      return { hora, minutos: numero(fila["minutos"]) ?? 0, eventos: entero(fila["eventos"]) };
    })
    .filter((h): h is HoraDeEstudio => h !== null);

  const logroPorDia = ((logro.data ?? []) as Fila[])
    .map((fila): LogroDelDia | null => {
      const fecha = fila["fecha"];
      if (typeof fecha !== "string") return null;
      return {
        fecha,
        leccionesCompletadas: entero(fila["lecciones_completadas"]),
        itemsRespondidos: entero(fila["items_respondidos"]),
        aciertos: entero(fila["aciertos"]),
      };
    })
    .filter((l): l is LogroDelDia => l !== null);

  const { lecciones, filas: filasDeLecciones } = await nombrarLecciones(supabase, minutosPorLeccion);

  return {
    dias,
    resumen: cifras,
    resumenAnterior: cifrasAnteriores,
    serie: serieDeDias,
    serie28,
    destrezas,
    lecciones,
    materias: await materiasDeLecciones(supabase, lecciones, filasDeLecciones),
    horas: relojDelDia,
    logro: logroPorDia,
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
 *
 * Devuelve también las filas CRUDAS —con `module_id`— para que
 * `materiasDeLecciones` no tenga que volver a pedir `lessons`: es la misma
 * fila, y una segunda vuelta a la base por el mismo dato sería la clase de
 * duplicado que esta casa evita.
 */
async function nombrarLecciones(
  supabase: Awaited<ReturnType<typeof createClient>>,
  minutosPorLeccion: ReadonlyMap<string, number>,
): Promise<{ readonly lecciones: readonly LeccionDeHijo[]; readonly filas: readonly Fila[] }> {
  const ids = [...minutosPorLeccion.keys()];
  if (ids.length === 0) return { lecciones: [], filas: [] };

  const { data, error } = await supabase
    .from("lessons")
    .select("id, title, module_id")
    .in("id", ids);
  if (error !== null) {
    console.error("[cet] seguimientoDeHijo lessons", error.code, error.message);
    return { lecciones: [], filas: [] };
  }
  const filas = (data ?? []) as Fila[];

  const salida: LeccionDeHijo[] = [];
  for (const fila of filas) {
    const id = fila["id"];
    const nombre = leerI18n(fila["title"]);
    if (typeof id !== "string" || nombre === null) continue;
    const minutos = minutosPorLeccion.get(id);
    if (minutos === undefined) continue;
    salida.push({ id, nombre, minutos });
  }
  return { lecciones: salida, filas };
}

/**
 * Agrupa los minutos de `lecciones` por materia, encadenando
 * `lessons.module_id -> course_modules.course_id -> courses.subject_id ->
 * subjects`. Ver la cabecera de `MateriaDeHijo`: SOLO minutos, nunca acierto
 * ni lecciones terminadas, que ningún RPC reparte por materia todavía.
 *
 * Sin lecciones no hay materias que agrupar, y una lección cuya cadena no
 * llegue hasta una materia reconocida —RLS de otro colegio, módulo huérfano—
 * se descarta en vez de inventar una fila con datos a medias.
 */
async function materiasDeLecciones(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lecciones: readonly LeccionDeHijo[],
  filasDeLecciones: readonly Fila[],
): Promise<readonly MateriaDeHijo[]> {
  if (lecciones.length === 0) return [];

  const moduloPorLeccion = new Map<string, string>();
  for (const fila of filasDeLecciones) {
    const id = fila["id"];
    const moduleId = fila["module_id"];
    if (typeof id === "string" && typeof moduleId === "string") moduloPorLeccion.set(id, moduleId);
  }

  const moduleIds = [...new Set(moduloPorLeccion.values())];
  if (moduleIds.length === 0) return [];

  const { data: modulosData, error: modulosError } = await supabase
    .from("course_modules")
    .select("id, course_id")
    .in("id", moduleIds);
  if (modulosError !== null || modulosData === null) return [];

  const cursoPorModulo = new Map<string, string>();
  for (const fila of modulosData as Fila[]) {
    const id = fila["id"];
    const courseId = fila["course_id"];
    if (typeof id === "string" && typeof courseId === "string") cursoPorModulo.set(id, courseId);
  }

  const courseIds = [...new Set(cursoPorModulo.values())];
  if (courseIds.length === 0) return [];

  const { data: cursosData, error: cursosError } = await supabase
    .from("courses")
    .select("id, subject_id")
    .in("id", courseIds);
  if (cursosError !== null || cursosData === null) return [];

  const materiaPorCurso = new Map<string, string>();
  for (const fila of cursosData as Fila[]) {
    const id = fila["id"];
    const subjectId = fila["subject_id"];
    if (typeof id === "string" && typeof subjectId === "string") materiaPorCurso.set(id, subjectId);
  }

  const subjectIds = [...new Set(materiaPorCurso.values())];
  if (subjectIds.length === 0) return [];

  const { data: materiasData, error: materiasError } = await supabase
    .from("subjects")
    .select("id, code, name")
    .in("id", subjectIds);
  if (materiasError !== null || materiasData === null) return [];

  const materiaPorId = new Map<string, { code: string; nombre: I18nText }>();
  for (const fila of materiasData as Fila[]) {
    const id = fila["id"];
    const code = fila["code"];
    const nombre = leerI18n(fila["name"]);
    if (typeof id === "string" && typeof code === "string" && nombre !== null) {
      materiaPorId.set(id, { code, nombre });
    }
  }

  const minutosPorMateria = new Map<string, { code: string; nombre: I18nText; minutos: number }>();
  for (const leccion of lecciones) {
    const moduleId = moduloPorLeccion.get(leccion.id);
    const courseId = moduleId === undefined ? undefined : cursoPorModulo.get(moduleId);
    const subjectId = courseId === undefined ? undefined : materiaPorCurso.get(courseId);
    const materia = subjectId === undefined ? undefined : materiaPorId.get(subjectId);
    if (materia === undefined || subjectId === undefined) continue;

    const actual = minutosPorMateria.get(subjectId);
    minutosPorMateria.set(subjectId, {
      code: materia.code,
      nombre: materia.nombre,
      minutos: (actual?.minutos ?? 0) + leccion.minutos,
    });
  }

  return [...minutosPorMateria.entries()].map(([subjectId, m]) => ({
    subjectId,
    code: m.code,
    nombre: m.nombre,
    minutos: m.minutos,
  }));
}

/* ========================================================================== */
/* Telegram: si este tutor esta conectado, y desde cuando                      */
/* ========================================================================== */

export interface EstadoDeTelegram {
  /** ¿Hay bot configurado? Si no, la seccion no se pinta. */
  readonly disponible: boolean;
  readonly vinculado: boolean;
  /** ISO-8601, o `null`. Es lo unico que la sesion puede leer ademas del id. */
  readonly vinculadoAt: string | null;
}

/**
 * El estado del vinculo con Telegram del tutor de la sesion.
 *
 * SE PIDEN DOS COLUMNAS Y NO `*`, y no es estilo: es lo unico que funciona. El
 * GRANT de `telegram_de_tutor` (0087) es POR COLUMNA y la sesion solo alcanza
 * `guardian_id, vinculado_at, created_at, updated_at`. Un `select("*")` -o
 * cualquier peticion que incluya `chat_id` o `token_hash`- se va en un 42501
 * «permission denied for column», y la pantalla se quedaria sin seccion sin
 * que nadie entendiera por que. Ese GRANT existe para que un XSS en el panel
 * del tutor no pueda sacar el `chat_id` con el que se le escribe a un padre.
 *
 * Se lee con la SESION del tutor, no con el cliente de servicio: la politica
 * `telegram_select_propio` es quien decide de quien es la fila, y esta consulta
 * no la esquiva.
 *
 * `disponible` se resuelve ANTES de tocar la base. Sin bot no hay nada que
 * ofrecer, y preguntar por una fila cuyo estado no se va a pintar es un viaje
 * a la base por nada.
 */
export async function estadoDeTelegram(): Promise<EstadoDeTelegram> {
  if (!telegramDisponible()) {
    return { disponible: false, vinculado: false, vinculadoAt: null };
  }

  const tutor = await requireRole(["guardian"], { onDeny: "not-found" });
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("telegram_de_tutor")
    .select("guardian_id, vinculado_at")
    .eq("guardian_id", tutor.id)
    .maybeSingle();

  if (error !== null) {
    // Ruidoso a proposito (R4): «no conectado» por un fallo de consulta se lee
    // en pantalla como un estado real, y el padre pulsaria un boton que no
    // hacia falta. Sin fila tampoco hay vinculo, asi que el fallo seguro es el
    // mismo, pero queda constancia de que no fue el estado, fue el viaje.
    console.error("[cet] estadoDeTelegram", error.code, error.message);
    return { disponible: true, vinculado: false, vinculadoAt: null };
  }

  const vinculadoAt = (data as Fila | null)?.["vinculado_at"];
  const fecha = typeof vinculadoAt === "string" ? vinculadoAt : null;

  // `vinculado_at` no nulo ES el estado «conectado»: el `chat_id` que de verdad
  // lo determina no se puede leer desde aqui, y las dos columnas se escriben y
  // se borran juntas, en la misma sentencia, siempre.
  return { disponible: true, vinculado: fecha !== null, vinculadoAt: fecha };
}

/* ========================================================================== */
/* La cola de invitaciones — la lee la administracion, vive aqui              */
/* ========================================================================== */

/** Una invitacion emitida y todavia sin canjear. Nunca su `token_hash`. */
export interface InvitacionPendiente {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

/**
 * Las invitaciones de tutor emitidas que nadie ha canjeado todavia.
 *
 * ===========================================================================
 * QUIEN LA LLAMA NO ES UN TUTOR: ES EL SUPERADMIN, DESDE /admin
 * ===========================================================================
 * Y sin embargo la funcion vive AQUI y no en `components/staff/queries.ts`,
 * que es donde se pinta. El motivo es que `guardian_invites` no tiene NI UNA
 * politica RLS —para nadie, tampoco para el superadmin— y ademas `0065` le
 * retira todo privilegio a `authenticated` y a `anon`. No es un olvido: la
 * cabecera de aquella migracion lo escribe con todas las letras — la tabla
 * guarda credenciales de alta, y «para todos los demas es inalcanzable, que es
 * el fallo seguro correcto».
 *
 * Asi que hay dos formas de leerla, y las dos son malas de distinta manera:
 *
 *   a) Escribir una politica que deje entrar al superadmin. Seria deshacer la
 *      decision de 0065 desde el lado equivocado: volveria alcanzable por
 *      sesion una tabla que hoy solo alcanza el proceso que la escribe, y todo
 *      para pintar una lista.
 *   b) Escalar a `service_role`, que es lo que hace esta funcion.
 *
 * (b) gana, y ademas gana SIN ampliar la superficie: este modulo YA es una de
 * las excepciones tasadas de `apps/web/eslint.config.mjs`, y es el mismo
 * modulo cuyo `actions.ts` INSERTA en esta tabla desde `invitarTutor`. Meter
 * la lectura en `components/staff/queries.ts` habria obligado a añadir una
 * quinta entrada a esa lista, y la cabecera del fichero de lint dice que si esa
 * lista crece es un fallo de arquitectura y no una necesidad.
 *
 * NO COMPRUEBA EL ROL, y eso es deliberado: no es una Server Action, no hay
 * endpoint HTTP que apunte aqui, y quien la llama —`loadFamiliesData`— ya
 * devuelve `null` a todo el que no sea superadmin antes de invocarla. Si algun
 * dia se convierte en accion, la comprobacion va DELANTE de la escalada.
 *
 * SE PIDEN CUATRO COLUMNAS Y NINGUNA MAS. `token_hash` no aparece ni en la
 * lista: es el hash de una credencial y no hace falta para pintar nada. Con
 * `service_role` no hay grant por columna que lo impida, asi que lo impide la
 * revision de este `select` — por eso esta escrito columna a columna y jamas
 * como un `*`.
 *
 * @returns `disponible: false` cuando la consulta falla. Quien llama decide que
 *   enseñar; esta funcion NO LANZA.
 */
export async function invitacionesPendientes(): Promise<{
  readonly filas: readonly InvitacionPendiente[];
  readonly disponible: boolean;
}> {
  let admin: SupabaseClient;
  try {
    admin = createAdminClient(
      "Leer la cola de invitaciones de tutor: guardian_invites no tiene ninguna politica RLS, por diseño (0065)",
    );
  } catch (causa) {
    // Sin `SUPABASE_SERVICE_ROLE_KEY` el constructor lanza. La pantalla que la
    // llama no se cae por eso: pinta el resto y avisa de que esto no se leyo.
    console.error("[cet] invitacionesPendientes sin cliente de servicio", causa);
    return { filas: [], disponible: false };
  }

  const { data, error } = await admin
    .from("guardian_invites")
    .select("id, email, created_at, expires_at")
    .is("used_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error !== null) {
    console.error("[cet] invitacionesPendientes select", error.code, error.message);
    return { filas: [], disponible: false };
  }

  const filas: InvitacionPendiente[] = ((data ?? []) as Fila[]).map((fila) => ({
    id: texto(fila, "id"),
    // `email` es `citext`: PostgREST lo devuelve como cadena igualmente.
    email: texto(fila, "email"),
    createdAt: texto(fila, "created_at"),
    expiresAt: texto(fila, "expires_at"),
  }));

  return { filas, disponible: true };
}
