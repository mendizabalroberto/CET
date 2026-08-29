/**
 * Pruebas de las piezas puras de las dos puertas.
 * Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Aquí no hay red ni base de datos. Lo que se prueba es exactamente lo que se
 * puede probar sin `hash-wasm` ni `@supabase/supabase-js`: la frontera de
 * entrada, el hash del token y las derivaciones. Importar `index.ts` desde una
 * prueba muere en el primer `import` — ver la cabecera de `vitest.config.mjs`.
 */

import { describe, it, expect } from "vitest";
import {
  claveDeIntento,
  emailSinteticoDeAlumno,
  entradaDeAuthPin,
  entradaDeStudentPin,
  esPinDebil,
  esPuertaDeDispositivo,
  longitudDePinPorEtapa,
  presentaClaveDeServicio,
  sha256hex,
} from "./puertas.ts";

const UUID = "00000000-0000-4000-8000-000000000001";
const TOKEN = "a".repeat(43);

describe("entradaDeAuthPin", () => {
  it("acepta la puerta del colegio, intacta", () => {
    const r = entradaDeAuthPin.safeParse({
      schoolId: UUID,
      studentCode: "Y6A-001",
      pin: "1357",
    });
    expect(r.success).toBe(true);
  });

  it("acepta la puerta del dispositivo", () => {
    expect(entradaDeAuthPin.safeParse({ deviceToken: TOKEN, pin: "1357" }).success).toBe(true);
  });

  it("rechaza un deviceToken que no mida 43 caracteres", () => {
    // 32 bytes en base64url son EXACTAMENTE 43 caracteres.
    expect(entradaDeAuthPin.safeParse({ deviceToken: "a".repeat(42), pin: "1357" }).success).toBe(
      false,
    );
    expect(entradaDeAuthPin.safeParse({ deviceToken: "a".repeat(44), pin: "1357" }).success).toBe(
      false,
    );
  });

  it("rechaza un deviceToken con caracteres que base64url no tiene", () => {
    expect(
      entradaDeAuthPin.safeParse({ deviceToken: `${"a".repeat(42)}+`, pin: "1357" }).success,
    ).toBe(false);
    expect(
      entradaDeAuthPin.safeParse({ deviceToken: `${"a".repeat(42)}/`, pin: "1357" }).success,
    ).toBe(false);
    expect(
      entradaDeAuthPin.safeParse({ deviceToken: `${"a".repeat(42)}=`, pin: "1357" }).success,
    ).toBe(false);
  });

  it("rechaza un cuerpo que traiga las dos puertas a la vez", () => {
    expect(
      entradaDeAuthPin.safeParse({
        deviceToken: TOKEN,
        studentCode: "Y6A-001",
        pin: "1357",
      }).success,
    ).toBe(false);

    expect(
      entradaDeAuthPin.safeParse({
        deviceToken: TOKEN,
        schoolId: UUID,
        studentCode: "Y6A-001",
        pin: "1357",
      }).success,
    ).toBe(false);
  });

  it("sigue acotando el PIN a 4-8 digitos en las dos puertas", () => {
    expect(entradaDeAuthPin.safeParse({ deviceToken: TOKEN, pin: "123" }).success).toBe(false);
    expect(entradaDeAuthPin.safeParse({ deviceToken: TOKEN, pin: "1".repeat(9) }).success).toBe(
      false,
    );
    // Un "PIN" de 10 MB no debe llegar nunca al verificador de Argon2id.
    expect(entradaDeAuthPin.safeParse({ deviceToken: TOKEN, pin: "1".repeat(4096) }).success).toBe(
      false,
    );
    expect(
      entradaDeAuthPin.safeParse({ schoolId: UUID, studentCode: "Y6A-001", pin: "abcd" }).success,
    ).toBe(false);
  });

  it("rechaza un cuerpo sin ninguna de las dos puertas", () => {
    expect(entradaDeAuthPin.safeParse({ pin: "1357" }).success).toBe(false);
    expect(entradaDeAuthPin.safeParse({}).success).toBe(false);
  });

  it("esPuertaDeDispositivo discrimina la rama analizada", () => {
    const dispositivo = entradaDeAuthPin.parse({ deviceToken: TOKEN, pin: "1357" });
    const colegio = entradaDeAuthPin.parse({ schoolId: UUID, studentCode: "Y6A-001", pin: "1357" });
    expect(esPuertaDeDispositivo(dispositivo)).toBe(true);
    expect(esPuertaDeDispositivo(colegio)).toBe(false);
  });
});

describe("claveDeIntento — el lockout cuenta por alumno, nunca por puerta", () => {
  // La MISMA fila de `students`, resuelta por una puerta o por la otra.
  const alumno = { school_id: "00000000-0000-4000-8000-0000000000aa", student_code: "Y6A-001" };

  // Dos entradas DISTINTAS que resuelven ese mismo alumno. El codigo va aqui en
  // minusculas a proposito: `students.student_code` es `citext`, asi que el
  // alumno que se resuelve es el mismo, y una implementacion que sacara la clave
  // de lo TECLEADO abriria una segunda ventana con solo cambiar la caja.
  const porColegio = entradaDeAuthPin.parse({
    schoolId: alumno.school_id,
    studentCode: alumno.student_code.toLowerCase(),
    pin: "1357",
  });
  const porDispositivo = entradaDeAuthPin.parse({ deviceToken: TOKEN, pin: "1357" });

  it("las dos puertas dan la MISMA clave para el mismo alumno", () => {
    // Este es el invariante entero: si la puerta entrara en la clave, habria dos
    // ventanas independientes contra el mismo PIN, o sea intentos infinitos.
    expect(claveDeIntento(porDispositivo, alumno)).toEqual(
      claveDeIntento(porColegio, alumno),
    );
  });

  it("la clave sale de la fila del alumno y no de lo que trae la entrada", () => {
    // Una entrada por la puerta del colegio cuyo `studentCode` NO es el del
    // alumno resuelto no puede desplazar la cuenta a otra clave.
    const conOtroColegio = entradaDeAuthPin.parse({
      schoolId: "00000000-0000-4000-8000-0000000000bb",
      studentCode: "Y6A-001",
      pin: "1357",
    });
    expect(claveDeIntento(conOtroColegio, alumno)).toEqual({
      schoolId: alumno.school_id,
      studentCode: alumno.student_code,
    });
  });

  it("el hijo de un tutor cuenta por su codigo, con colegio nulo", () => {
    // `students.school_id` es nullable (0066) y `auth_attempts.school_id` tambien
    // (0067). El codigo es unico globalmente por el indice parcial, asi que
    // `(NULL, codigo)` identifica al alumno sin ambiguedad.
    const hijo = { school_id: null, student_code: "leo-4f2a91" };
    expect(claveDeIntento(porDispositivo, hijo)).toEqual({
      schoolId: null,
      studentCode: "leo-4f2a91",
    });
  });

  it("sin alumno, la puerta del colegio cuenta por el codigo TECLEADO", () => {
    // Contar los intentos contra codigos que no existen es como se detecta una
    // enumeracion: es para lo que `auth_attempts` fue disenada.
    expect(claveDeIntento(porColegio, null)).toEqual({
      schoolId: alumno.school_id,
      studentCode: "y6a-001",
    });
  });

  it("sin alumno, la puerta del dispositivo no cuenta nada", () => {
    // Un deviceToken desconocido no es un codigo que nadie haya tecleado, y
    // colgarle una fila dejaria llenar la tabla desde fuera. Ese camino ya sale
    // por el senuelo y por el suelo de tiempo.
    expect(claveDeIntento(porDispositivo, null)).toBeNull();
  });
});

describe("sha256hex", () => {
  it("da el hexadecimal conocido, en minusculas", async () => {
    // Vector de prueba clásico de SHA-256.
    expect(await sha256hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("no emite ni una letra en mayusculas", async () => {
    // La base compara con `check (... ~ '^[0-9a-f]{64}$')`: un hexadecimal en
    // mayusculas no encontraria jamas una fila, y sin dar un error visible.
    const hash = await sha256hex(TOKEN);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("entradaDeStudentPin", () => {
  it("acepta set-from-link sin exigir el PIN anterior", () => {
    const r = entradaDeStudentPin.safeParse({
      op: "set-from-link",
      studentProfileId: UUID,
      newPin: "1357",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza set-from-link con un PIN mal formado o sin alumno", () => {
    expect(
      entradaDeStudentPin.safeParse({ op: "set-from-link", studentProfileId: UUID, newPin: "12" })
        .success,
    ).toBe(false);
    expect(
      entradaDeStudentPin.safeParse({ op: "set-from-link", newPin: "1357" }).success,
    ).toBe(false);
    expect(
      entradaDeStudentPin.safeParse({ op: "set-from-link", studentProfileId: "no", newPin: "1357" })
        .success,
    ).toBe(false);
  });

  it("no ha roto las tres operaciones que ya existian", () => {
    expect(
      entradaDeStudentPin.safeParse({ op: "change", currentPin: "1357", newPin: "2468" }).success,
    ).toBe(true);
    expect(entradaDeStudentPin.safeParse({ op: "reset", studentProfileId: UUID }).success).toBe(
      true,
    );
    expect(entradaDeStudentPin.safeParse({ op: "provision", studentProfileId: UUID }).success).toBe(
      true,
    );
    expect(entradaDeStudentPin.safeParse({ op: "borrar", studentProfileId: UUID }).success).toBe(
      false,
    );
  });
});

describe("esPinDebil", () => {
  it("bloquea repeticiones, escaleras y la lista corta", () => {
    for (const pin of ["0000", "1111", "999999", "1234", "4321", "3456", "1010", "123123"]) {
      expect(esPinDebil(pin)).toBe(true);
    }
  });

  it("deja pasar un PIN normal", () => {
    for (const pin of ["1357", "2846", "8305", "471926"]) {
      expect(esPinDebil(pin)).toBe(false);
    }
  });
});

describe("presentaClaveDeServicio", () => {
  const clave = "clave-de-servicio-de-mentira";

  it("acepta la clave de servicio como Bearer", () => {
    expect(presentaClaveDeServicio(`Bearer ${clave}`, clave)).toBe(true);
    expect(presentaClaveDeServicio(`bearer ${clave}`, clave)).toBe(true);
    expect(presentaClaveDeServicio(`  Bearer   ${clave}  `, clave)).toBe(true);
  });

  it("rechaza un JWT de usuario, la clave anonima y la ausencia de cabecera", () => {
    expect(presentaClaveDeServicio("Bearer eyJhbGciOiJIUzI1NiJ9.alumno.firma", clave)).toBe(false);
    expect(presentaClaveDeServicio("Bearer clave-anonima", clave)).toBe(false);
    expect(presentaClaveDeServicio(null, clave)).toBe(false);
    expect(presentaClaveDeServicio("", clave)).toBe(false);
    expect(presentaClaveDeServicio(clave, clave)).toBe(false); // sin el esquema
    expect(presentaClaveDeServicio("Basic " + clave, clave)).toBe(false);
  });

  it("rechaza todo si el entorno no tiene clave de servicio", () => {
    // Sin este corte, un despliegue sin la variable aceptaria `Bearer ` a secas.
    expect(presentaClaveDeServicio("Bearer ", undefined)).toBe(false);
    expect(presentaClaveDeServicio("Bearer x", "")).toBe(false);
  });
});

describe("emailSinteticoDeAlumno", () => {
  it("compone el correo del alumno de un colegio", () => {
    expect(emailSinteticoDeAlumno("Y6A-001", "santa-maria")).toBe(
      "s.Y6A-001@santa-maria.students.cet.invalid",
    );
  });

  it("compone el del hijo de un tutor, que nace sin colegio", () => {
    expect(emailSinteticoDeAlumno("leo-4f2a91", null)).toBe("s.leo-4f2a91@familia.cet.invalid");
  });
});

describe("longitudDePinPorEtapa", () => {
  it("respeta lo configurado por el colegio", () => {
    const config = { pin_length_primary: 5, pin_length_secondary: 8 };
    expect(longitudDePinPorEtapa("primary", config)).toBe(5);
    expect(longitudDePinPorEtapa("secondary", config)).toBe(8);
  });

  it("cae al default cuando no hay colegio", () => {
    expect(longitudDePinPorEtapa("primary", null)).toBe(4);
    expect(longitudDePinPorEtapa("secondary", null)).toBe(6);
    expect(longitudDePinPorEtapa("primary", { pin_length_primary: null })).toBe(4);
  });
});
