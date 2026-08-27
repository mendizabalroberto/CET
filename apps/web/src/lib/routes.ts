/**
 * Mapa de rutas y matriz de autorización.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Este fichero es la ÚNICA fuente de verdad sobre qué rol puede ver qué. El
 * middleware y los layouts leen de aquí. Duplicar esta lógica en dos sitios es
 * la forma habitual de dejarse una ruta sin proteger.
 *
 * PRINCIPIO: lista blanca, no lista negra.
 * Toda ruta que no aparezca como pública requiere sesión. Añadir una página
 * nueva sin tocar este fichero la deja PROTEGIDA, que es el fallo seguro
 * correcto. Con una lista negra, olvidarse de un `startsWith` deja la página
 * abierta a internet.
 */
import type { UserRole } from "@cet/shared";

export const ROUTES = {
  home: "/",
  privacy: "/privacy",
  terms: "/terms",
  login: "/login",
  register: "/register",
  registerSent: "/register/sent",
  logout: "/logout",
  /** Cambio obligatorio de PIN en el primer acceso (AD-4). */
  pinChange: "/account/pin",
  /** Cambio obligatorio de contrasena del personal en el primer acceso. */
  passwordChange: "/account/password",
  studentHome: "/learn",
  staffHome: "/teach",
  adminHome: "/admin",
} as const;

/**
 * Rutas accesibles sin sesión. Prefijos exactos o con `/` detrás: `/login` y
 * `/login/staff` valen, `/loginfalso` no.
 */
const PUBLIC_PREFIXES = [
  "/",
  "/privacy",
  "/terms",
  "/login",
  "/register",
  "/auth", // callbacks de Supabase (confirmación de email, recuperación)
  "/logout", // cierra la sesión; tiene que ser alcanzable SIN sesión válida
  "/not-found", // destino del rewrite de denegación; solo pinta un 404
] as const;

/**
 * Qué hacer cuando el rol no basta.
 *
 * - `not-found`: se responde 404. Se usa en TODA área privilegiada. Un 403 le
 *   confirma a un alumno curioso que `/admin` existe; un 404 no le dice nada.
 *   Es el requisito explícito del alcance del módulo.
 * - `home`: se le manda a su propia portada. Se usa cuando la ruta no es un
 *   secreto (un profesor entrando en `/learn`), y así no se le castiga con un
 *   404 confuso.
 */
type DenyBehaviour = "not-found" | "home";

interface ProtectedArea {
  readonly prefix: string;
  readonly allow: readonly UserRole[];
  readonly onDeny: DenyBehaviour;
}

/**
 * Orden importante: se evalúa el prefijo más largo que case, así que
 * `/admin/schools` gana a `/admin`.
 */
export const PROTECTED_AREAS: readonly ProtectedArea[] = [
  { prefix: "/admin", allow: ["superadmin", "school_admin"], onDeny: "not-found" },
  { prefix: "/teach", allow: ["superadmin", "school_admin", "teacher"], onDeny: "not-found" },
  { prefix: "/reports", allow: ["superadmin", "school_admin", "teacher"], onDeny: "not-found" },
  { prefix: "/learn", allow: ["student"], onDeny: "home" },
  { prefix: "/practice", allow: ["student"], onDeny: "home" },
  // `/exam` en singular, que es la ruta real. Con el plural, `matchesPrefix`
  // exige coincidencia exacta o con `/` detras, asi que "/exam/abc" NO casaba
  // con "/exams" y toda el area de examen quedaba sin filtro de rol: un
  // profesor podia abrir el examen de un alumno.
  { prefix: "/exam", allow: ["student"], onDeny: "home" },
  // Cualquiera con sesión puede cambiar su propio PIN / ver su cuenta.
  {
    prefix: "/account",
    allow: ["superadmin", "school_admin", "teacher", "student"],
    onDeny: "home",
  },
];

/**
 * Las rutas `/api/*` NO se autorizan por rol en el middleware.
 *
 * Motivo: una Route Handler ya comprueba la sesión ella misma y necesita poder
 * responder con un código HTTP significativo (401, 403, 429). Si el middleware
 * las reescribiera a la página 404, la cola de telemetría recibiría HTML donde
 * espera JSON y reintentaría en bucle sin enterarse de nada.
 *
 * Lo que sí hace el middleware con ellas es refrescar la sesión, que es
 * precisamente lo que necesitan para poder autorizar.
 */
export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

/** Devuelve el área protegida más específica que case con la ruta, si la hay. */
export function findProtectedArea(pathname: string): ProtectedArea | undefined {
  let best: ProtectedArea | undefined;
  for (const area of PROTECTED_AREAS) {
    if (matchesPrefix(pathname, area.prefix)) {
      if (!best || area.prefix.length > best.prefix.length) best = area;
    }
  }
  return best;
}

/** Portada propia de cada rol tras iniciar sesión. */
export function homeForRole(role: UserRole | null): string {
  switch (role) {
    case "student":
      return ROUTES.studentHome;
    case "teacher":
      return ROUTES.staffHome;
    case "school_admin":
    case "superadmin":
      return ROUTES.adminHome;
    default:
      return ROUTES.home;
  }
}
