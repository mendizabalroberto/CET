/**
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Lo que se prueba aqui no es "que la funcion devuelva algo": es que el token
 * tenga la forma y la entropia que el resto del sistema da por supuestas, y que
 * lo unico que sale de `hashToken` no permita recuperar el token.
 */
import { describe, expect, it } from "vitest";

import { generarToken, hashToken } from "./tokens";

describe("generarToken", () => {
  it("da 43 caracteres de base64url", () => {
    expect(generarToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("no se repite", () => {
    expect(generarToken()).not.toBe(generarToken());
  });

  it("no colisiona en mil tiradas", () => {
    // 256 bits no colisionan; lo que esta prueba caza de verdad es un
    // `randomBytes` sustituido por algo con estado o por una constante.
    const vistos = new Set<string>();
    for (let i = 0; i < 1000; i += 1) vistos.add(generarToken());
    expect(vistos.size).toBe(1000);
  });
});

describe("hashToken", () => {
  it("es estable y no devuelve el token", () => {
    const t = generarToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });

  it("dos tokens distintos dan hashes distintos", () => {
    expect(hashToken(generarToken())).not.toBe(hashToken(generarToken()));
  });

  it("casa con el SHA-256 conocido de una cadena vacia", () => {
    // Vector fijo: si alguien cambiara el algoritmo por sha1 o por md5, el
    // resto de aserciones de forma seguirian pasando y esta no.
    expect(hashToken("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
