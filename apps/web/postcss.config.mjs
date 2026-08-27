/**
 * PostCSS — Tailwind CSS v4.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * En v4 el plugin vive en su propio paquete (@tailwindcss/postcss) y no se
 * necesita autoprefixer: Lightning CSS ya aplica los prefijos.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
