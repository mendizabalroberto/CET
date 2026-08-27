/**
 * Validación de PIN y de código de alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { describe, expect, it } from "vitest";

import { isWeakPin, pinChangeSchema, studentLoginSchema } from "./schemas";

describe("studentLoginSchema", () => {
  const valid = {
    schoolId: "3f6d9d3a-1c4b-4c2e-9f7a-8b1d2e3f4a5b",
    studentCode: "Y6A-014",
    pin: "4821",
  };

  it("acepta una entrada válida", () => {
    expect(studentLoginSchema.safeParse(valid).success).toBe(true);
  });

  it("rechaza un PIN con letras", () => {
    expect(studentLoginSchema.safeParse({ ...valid, pin: "48a1" }).success).toBe(false);
  });

  it("rechaza un PIN de menos de 4 o más de 8 dígitos", () => {
    expect(studentLoginSchema.safeParse({ ...valid, pin: "123" }).success).toBe(false);
    expect(studentLoginSchema.safeParse({ ...valid, pin: "123456789" }).success).toBe(false);
  });

  it("rechaza un código con caracteres fuera de la lista blanca", () => {
    // Cierra la puerta a que un código acabe en un log o en un correo como
    // vector de inyección.
    expect(studentLoginSchema.safeParse({ ...valid, studentCode: "Y6A <b>" }).success).toBe(false);
    expect(studentLoginSchema.safeParse({ ...valid, studentCode: "Y6A;DROP" }).success).toBe(false);
  });

  it("rechaza un schoolId que no es UUID", () => {
    expect(studentLoginSchema.safeParse({ ...valid, schoolId: "colegio-1" }).success).toBe(false);
  });
});

describe("isWeakPin", () => {
  it("detecta repeticiones y secuencias de cualquier longitud", () => {
    expect(isWeakPin("0000")).toBe(true);
    expect(isWeakPin("1234")).toBe(true);
    expect(isWeakPin("4321")).toBe(true);
    expect(isWeakPin("2345")).toBe(true);
    expect(isWeakPin("987654")).toBe(true);
    expect(isWeakPin("555555")).toBe(true);
  });

  it("acepta un PIN razonable", () => {
    expect(isWeakPin("4821")).toBe(false);
    expect(isWeakPin("729143")).toBe(false);
  });
});

describe("pinChangeSchema", () => {
  it("exige que los dos PIN nuevos coincidan", () => {
    const result = pinChangeSchema.safeParse({
      currentPin: "1357",
      newPin: "4821",
      confirmPin: "4822",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("pin_mismatch");
  });

  it("no deja repetir el PIN actual", () => {
    const result = pinChangeSchema.safeParse({
      currentPin: "4821",
      newPin: "4821",
      confirmPin: "4821",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un PIN nuevo trivial", () => {
    const result = pinChangeSchema.safeParse({
      currentPin: "4821",
      newPin: "1111",
      confirmPin: "1111",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("pin_too_weak");
  });

  it("acepta un cambio correcto", () => {
    expect(
      pinChangeSchema.safeParse({ currentPin: "1357", newPin: "4826", confirmPin: "4826" }).success,
    ).toBe(true);
  });
});
