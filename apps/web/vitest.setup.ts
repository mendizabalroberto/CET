/**
 * Preparación de las pruebas de componente.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Sin esto, el árbol de un test sigue montado en el siguiente y los
// `getByRole` encuentran dos coincidencias. Los fallos que produce parecen
// aleatorios y dependen del orden de ejecución, que es lo peor de depurar.
afterEach(() => {
  cleanup();
});

/**
 * jsdom no implementa estas dos, y los componentes de examen y de lección las
 * usan de verdad: `matchMedia` para `prefers-reduced-motion` y
 * `IntersectionObserver` para medir cuánto tiempo mira el alumno un bloque.
 *
 * Se declaran como stubs mínimos y no como mocks "inteligentes": un stub que
 * finge comportamiento acaba probando el stub en vez del componente.
 */
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  if (!window.IntersectionObserver) {
    class StubIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds: readonly number[] = [];
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    window.IntersectionObserver =
      StubIntersectionObserver as unknown as typeof window.IntersectionObserver;
  }

  // `requestAnimationFrame` sí existe en jsdom, pero con temporizadores falsos
  // se queda colgado. Los componentes lo usan para mover el foco.
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0) as unknown as number) as typeof window.requestAnimationFrame;
  }
}
