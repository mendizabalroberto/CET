/**
 * El doble clic en Entregar manda una sola petición.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it, vi } from "vitest";

import { SubmitGuard } from "./submit-guard";

describe("SubmitGuard", () => {
  it("dos clics seguidos producen UNA sola entrega", async () => {
    const guard = new SubmitGuard();
    // `resolve` se declara con `let ... !` y no capturado en el ejecutor porque
    // TypeScript estrecharía la variable capturada a `never`.
    let resolve!: () => void;
    const task = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );

    // Sin `await` entre medias: es literalmente un doble clic.
    const first = guard.run(task);
    const second = guard.run(task);

    expect(task).toHaveBeenCalledTimes(1);

    resolve();
    await Promise.all([first, second]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("tres clics rápidos siguen siendo una entrega", async () => {
    const guard = new SubmitGuard();
    const task = vi.fn(async () => {});
    await Promise.all([guard.run(task), guard.run(task), guard.run(task)]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("después de entregar con éxito no vuelve a entregar nunca", async () => {
    const guard = new SubmitGuard();
    const task = vi.fn(async () => {});

    await guard.run(task);
    await guard.run(task);
    await guard.run(task);

    expect(task).toHaveBeenCalledTimes(1);
    expect(guard.completed).toBe(true);
  });

  it("si falla, DEJA reintentar: un botón muerto con el examen sin entregar es el peor final", async () => {
    const guard = new SubmitGuard();
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("sin red"))
      .mockResolvedValueOnce(undefined);

    await expect(guard.run(task)).rejects.toThrow("sin red");
    expect(guard.busy).toBe(false);

    await guard.run(task);
    expect(task).toHaveBeenCalledTimes(2);
    expect(guard.completed).toBe(true);
  });

  it("`markCompleted` cierra el cerrojo sin ejecutar nada (ya estaba entregado)", async () => {
    const guard = new SubmitGuard();
    const task = vi.fn(async () => {});
    guard.markCompleted();
    await guard.run(task);
    expect(task).not.toHaveBeenCalled();
  });
});
