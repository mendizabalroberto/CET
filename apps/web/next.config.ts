/**
 * Next.js 15 — configuración de la app web de Cambridge Exam Trainer.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ---------------------------------------------------------------------------
 * DÓNDE VIVE LA CSP — decisión deliberada
 * ---------------------------------------------------------------------------
 * La Content-Security-Policy NO se define aquí, sino en `middleware.ts`.
 *
 * Motivo: una CSP estricta de verdad (sin `unsafe-inline` en `script-src`)
 * necesita un **nonce distinto por petición**, y `headers()` de next.config es
 * estático — no puede generar un nonce. Peor aún: si se emitieran DOS cabeceras
 * CSP (una estática aquí y otra con nonce en el middleware), el navegador aplica
 * la INTERSECCIÓN de ambas y la política estática (sin el nonce) bloquearía los
 * propios scripts de Next.js. Una CSP duplicada no es "defensa en profundidad",
 * es una app rota.
 *
 * Por tanto: CSP -> middleware. Todo lo demás -> aquí, donde es estático y se
 * aplica también a respuestas que el middleware no toca (assets de /_next).
 */
import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad estáticas. Cada una responde a un ataque concreto.
 */
const securityHeaders = [
  {
    // Prohíbe que la app se cargue dentro de un <iframe>. Sin esto, un sitio
    // hostil puede superponer una capa invisible sobre nuestros botones y hacer
    // que un niño pulse "entregar examen" creyendo que pulsa otra cosa
    // (clickjacking). `frame-ancestors 'none'` en la CSP dice lo mismo para
    // navegadores modernos; esta cabecera cubre a los que aún no la respetan.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Impide el "MIME sniffing": que el navegador ignore el Content-Type que
    // declaramos y ejecute como script un fichero que subió un profesor.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // No filtramos rutas internas a terceros. Dentro del propio origen se envía
    // la URL completa (útil para analítica propia); hacia fuera, solo el origen,
    // y hacia un destino sin TLS, nada en absoluto.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Desactiva de raíz APIs del navegador que esta plataforma no usa. Si mañana
    // un XSS consiguiera ejecutarse, no podrá encender la cámara o el micrófono
    // de un menor ni leer su geolocalización. Se abre por excepción, nunca por
    // defecto.
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "publickey-credentials-get=(self)",
      "screen-wake-lock=(self)",
      "usb=()",
      "xr-spatial-tracking=()",
      // Impide que un tercero incrustado herede nuestro presupuesto de red.
      "interest-cohort=()",
    ].join(", "),
  },
  {
    // HSTS: tras la primera visita el navegador se niega a hablar con nosotros
    // por HTTP aunque el usuario teclee `http://`. `preload` + `includeSubDomains`
    // extiende la garantía a los subdominios de colegio (colegio.cet.app).
    // Dos años, que es lo que exige la lista de preload.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Evita que Chrome/Edge legacy hagan "sniffing" de descargas y las abran en
    // el contexto del sitio.
    key: "X-Download-Options",
    value: "noopen",
  },
  {
    // Aísla la ventana de cualquier `window.opener` cruzado. Junto con COEP
    // sería crossOriginIsolated; aquí basta con cortar la referencia.
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    // Nuestros recursos no se pueden incrustar desde otro origen.
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // El monorepo comparte TypeScript sin compilar: Next debe transpilar estos
  // paquetes en lugar de esperar un `dist/`.
  transpilePackages: ["@cet/ui", "@cet/engine", "@cet/shared"],

  /**
   * Los paquetes internos son TypeScript ESM y se importan entre si con
   * extension `.js` (`./enums.js`), que es lo que exige la resolucion ESM de
   * Node y lo que `tsc` espera con `moduleResolution: "Bundler"`. El fichero
   * real, sin embargo, es `.ts`.
   *
   * `tsc` y Vitest hacen esa correspondencia solos; webpack no, y falla con
   * "Can't resolve './enums.js'". `extensionAlias` se la ensena.
   *
   * Turbopack (`next dev`) resuelve el caso por su cuenta, asi que este bloque
   * solo afecta al build de produccion.
   */
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },

  // Un build que compila con errores de tipos es un build que miente.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  // No anunciamos la tecnología ni su versión: es información gratis para quien
  // busca un CVE conocido.
  poweredByHeader: false,

  experimental: {
    // Los Server Actions solo aceptan peticiones cuyo Origin coincida. Es la
    // defensa contra CSRF en las acciones de login.
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },

  images: {
    // Todo el media vive en Supabase Storage. Ningún otro host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "clcutoqjdgeggvgyreud.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  async headers() {
    return [
      {
        // Todas las rutas, incluidos los assets estáticos.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
