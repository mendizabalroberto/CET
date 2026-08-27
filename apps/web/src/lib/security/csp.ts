/**
 * Content-Security-Policy.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Esta CSP es funcional, no decorativa. La prueba: `script-src` NO contiene
 * `'unsafe-inline'` ni `'unsafe-eval'` en producción. Un XSS reflejado en el
 * nombre de un alumno no puede ejecutarse, porque el script inyectado no
 * llevará el nonce de esta petición.
 *
 * Se genera aquí (y se emite desde `middleware.ts`) y no en `next.config.ts`
 * porque el nonce debe ser distinto en cada petición; ver el comentario largo
 * en next.config.ts.
 */

/** Nonce criptográfico de 128 bits, en base64, para los scripts de esta petición. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // btoa existe en el runtime Edge y en Node >= 16.
  return btoa(String.fromCharCode(...bytes));
}

export interface CspOptions {
  readonly nonce: string;
  readonly isDev: boolean;
  /** Origen de Supabase (API REST, Auth, Storage, Realtime por WebSocket). */
  readonly supabaseOrigin: string;
}

export function buildContentSecurityPolicy({ nonce, isDev, supabaseOrigin }: CspOptions): string {
  // Realtime usa wss:// contra el mismo host que la API.
  const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");

  const directives: Record<string, string[]> = {
    // Nada se carga por defecto. Todo lo demás es una excepción explícita.
    "default-src": ["'self'"],

    // El nonce autoriza los scripts que emite Next.js. `strict-dynamic` permite
    // que esos scripts carguen los chunks de la app sin tener que enumerarlos:
    // sin él habría que listar cada fichero de /_next/static, algo inmantenible.
    // Cuando un navegador entiende `strict-dynamic`, ignora las listas de hosts;
    // por eso `https:` está solo como fallback para navegadores antiguos.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "https:",
      // En desarrollo, React Refresh y el overlay de errores de Next compilan
      // módulos con `eval`. En producción esto NO se emite.
      ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
    ],

    // Los estilos sí llevan 'unsafe-inline'. Es una concesión consciente:
    // Next.js inyecta <style> sin nonce para el CSS crítico, y Tailwind emite
    // estilos en línea en algunos casos. Un `style-src` inyectado permite
    // exfiltración por CSS en escenarios rebuscados, pero no ejecución de
    // código; el riesgo es de otro orden de magnitud que el de `script-src`.
    "style-src": ["'self'", "'unsafe-inline'"],

    // Sin fuentes de terceros: la tipografía se autoaloja. Un Google Fonts
    // filtra la IP de cada menor a un tercero en cada carga de página.
    "font-src": ["'self'", "data:"],

    // Imágenes propias, media de Supabase Storage, y data:/blob: para los SVG
    // generados por el motor y las previsualizaciones de subida.
    "img-src": ["'self'", "data:", "blob:", supabaseOrigin],

    // Adónde puede hablar el JavaScript: solo a nosotros y a Supabase.
    // Esto es lo que impide que un script inyectado exfiltre respuestas de
    // examen a un servidor externo.
    "connect-src": ["'self'", supabaseOrigin, supabaseWs, ...(isDev ? ["ws:", "http://localhost:*"] : [])],

    "media-src": ["'self'", supabaseOrigin, "blob:"],

    // Nada de Flash, applets ni <object>.
    "object-src": ["'none'"],

    // Los <base href> inyectados reescriben todas las URL relativas de la
    // página; es un vector clásico de secuestro de formularios.
    "base-uri": ["'self'"],

    // Los formularios (incluidos los Server Actions) solo se envían a nosotros.
    "form-action": ["'self'"],

    // Equivalente moderno de X-Frame-Options: DENY. Anti-clickjacking.
    "frame-ancestors": ["'none'"],

    // No incrustamos nada de terceros.
    "frame-src": ["'none'"],

    // Un Worker inyectado sería código ejecutándose fuera del alcance de la
    // mayoría de las defensas de la página.
    "worker-src": ["'self'", "blob:"],

    // Los manifiestos PWA solo del propio origen.
    "manifest-src": ["'self'"],
  };

  const serialized = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");

  // En producción se fuerza HTTPS para cualquier subrecurso que se haya colado
  // como http://. En desarrollo rompería localhost.
  return isDev ? serialized : `${serialized}; upgrade-insecure-requests`;
}
