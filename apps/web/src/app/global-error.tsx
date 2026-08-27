/**
 * Frontera de error de ÚLTIMO recurso.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Se activa cuando falla el propio layout raíz, es decir, cuando ni siquiera
 * existe un <html> renderizado. Por eso este componente tiene que pintar sus
 * propias etiquetas <html> y <body>, y por eso no puede usar el diccionario:
 * si lo que ha fallado es el layout, la resolución de idioma es exactamente
 * una de las cosas que pueden haber fallado.
 *
 * Los estilos van en línea, no en Tailwind: si el CSS no se cargó, esta
 * pantalla debe seguir siendo legible. Es la única excepción a la regla de "sin
 * estilos en línea" del proyecto, y va con `style`, no con `<style>`, así que
 * la CSP no la bloquea.
 *
 * Texto en los dos idiomas a la vez, ya que aquí no hay forma de negociar. Es
 * feo y es correcto: es preferible a mostrarle inglés a un niño hispanohablante
 * en el momento en que algo se ha roto.
 */
"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
     
    console.error("[cet] global error", error.digest ?? "sin digest");
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Arial, sans-serif",
          background: "#f4f7fb",
          color: "#12202f",
          padding: "1.5rem",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>
            Something went wrong · Algo ha salido mal
          </h1>
          <p style={{ marginTop: "0.75rem", color: "#5d7086" }}>
            The problem has been recorded. · El problema ha quedado registrado.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.75rem",
              background: "#173a63",
              color: "#fff",
              border: 0,
              borderRadius: "0.75rem",
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again · Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
