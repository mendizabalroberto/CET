# Resultado - iconos-envoltorio-y-boton
- Contrato: `contracts/iconos-envoltorio-y-boton.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 1 de 4
- Rama: `deepseek/iconos-envoltorio-y-boton`
- Duracion: 40.2 s
## Diff

~~~diff
diff --git a/packages/ui/__tests__/iconos.test.tsx b/packages/ui/__tests__/iconos.test.tsx
new file mode 100644
index 0000000..dde4425
--- /dev/null
+++ b/packages/ui/__tests__/iconos.test.tsx
@@ -0,0 +1,117 @@
+/**
+ * @cet/ui — iconos.
+ * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
+ */
+
+import { describe, expect, it } from "vitest";
+import { render, screen } from "@testing-library/react";
+import { readdirSync, readFileSync } from "node:fs";
+import { join } from "node:path";
+import { Button } from "../src/primitives/Button.js";
+import { ICONOS } from "../src/icons/registro.js";
+
+/**
+ * Los grupos que de verdad se ven juntos. Dos acciones hermanas no comparten
+ * dibujo: «Comprobar» y «Siguiente pregunta» viven en el MISMO boton, que
+ * cambia de texto al responder; si los dos fuesen una marca de verificacion, el
+ * boton diria «he acertado» cuando solo quiere decir «sigue».
+ */
+const GRUPOS = [
+  ["comprobar", "saltar", "pista", "solucion"], // zona de acciones
+  ["siguiente", "anterior", "marcar", "entregar"], // barra del examen
+  ["navAprender", "navPracticar", "navExamenes"], // rail lateral
+] as const;
+
+describe("Icono", () => {
+  it("el icono llega a la pantalla dentro del boton", () => {
+    render(<Button icon="comprobar">Comprobar</Button>);
+    const boton = screen.getByRole("button", { name: "Comprobar" });
+    // Se consulta desde el propio boton, no desde el documento: despues de lo
+    // de tailwind-merge, no se da por hecho que algo llega a la pantalla.
+    expect(boton.querySelector("svg")).not.toBeNull();
+  });
+
+  it("el tamano sale del size del boton, no de una clase", () => {
+    const { container } = render(
+      <>
+        <Button icon="comprobar" size="md">
+          Mediano
+        </Button>
+        <Button icon="comprobar" size="lg">
+          Grande
+        </Button>
+      </>,
+    );
+    const botones = container.querySelectorAll("button");
+    expect(botones).toHaveLength(2);
+    // El ATRIBUTO, no el className: si alguien lo cambia a `h-4 w-4`, este test
+    // tiene que ponerse rojo, porque esa es justamente la via que reabre el
+    // conflicto de `cn`.
+    expect(botones[0].querySelector("svg")?.getAttribute("width")).toBe("18");
+    expect(botones[1].querySelector("svg")?.getAttribute("width")).toBe("20");
+  });
+
+  it("el icono es invisible para el lector y el nombre accesible no cambia", () => {
+    render(<Button icon="comprobar">Comprobar</Button>);
+    const boton = screen.getByRole("button", { name: "Comprobar" });
+    const svg = boton.querySelector("svg");
+    expect(svg).not.toBeNull();
+    expect(svg?.getAttribute("aria-hidden")).toBe("true");
+    expect(svg?.getAttribute("focusable")).toBe("false");
+    // El nombre accesible sigue siendo exactamente el texto, ni mas largo ni
+    // distinto.
+    expect(boton).toHaveAccessibleName("Comprobar");
+  });
+
+  it("sin icon no hay svg", () => {
+    render(<Button>Comprobar</Button>);
+    const boton = screen.getByRole("button", { name: "Comprobar" });
+    expect(boton.querySelector("svg")).toBeNull();
+  });
+
+  it("dentro de un grupo, dos acciones no comparten dibujo", () => {
+    for (const grupo of GRUPOS) {
+      for (let i = 0; i < grupo.length; i++) {
+        for (let j = i + 1; j < grupo.length; j++) {
+          // Lo que tiene que ser distinto son los COMPONENTES, no las cadenas:
+          // dos claves distintas apuntando al mismo dibujo es exactamente el
+          // fallo que se busca.
+          expect(
+            ICONOS[grupo[i]],
+            `"${grupo[i]}" y "${grupo[j]}" comparten dibujo y se ven juntos`,
+          ).not.toBe(ICONOS[grupo[j]]);
+        }
+      }
+    }
+  });
+
+  it("lucide-react se importa en un solo sitio", () => {
+    const srcDir = join(process.cwd(), "src");
+    const ficheros = readdirSync(srcDir, { recursive: true })
+      .filter((f): f is string => typeof f === "string")
+      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
+      .map((f) => join(srcDir, f));
+
+    // Un recorrido que no encuentra nada pasaria en verde sin mirar nada.
+    expect(ficheros.length).toBeGreaterThan(30);
+
+    const conImport = ficheros.filter((f) => readFileSync(f, "utf8").includes('from "lucide-react"'));
+    expect(conImport).toEqual([join(srcDir, "icons", "registro.ts")]);
+  });
+
+  it("todo nombre del registro pinta algo", () => {
+    const nombres = Object.keys(ICONOS);
+    // Por lo mismo del punto anterior: un recorrido vacio pasaria en verde.
+    expect(nombres.length).toBeGreaterThan(15);
+
+    for (const nombre of nombres) {
+      const { container } = render(<Button icon={nombre as keyof typeof ICONOS}>{nombre}</Button>);
+      const boton = screen.getByRole("button", { name: nombre });
+      expect(
+        boton.querySelector("svg"),
+        `el icono "${nombre}" no pinta ningun svg`,
+      ).not.toBeNull();
+      container.remove();
+    }
+  });
+});
diff --git a/packages/ui/src/icons/Icono.tsx b/packages/ui/src/icons/Icono.tsx
new file mode 100644
index 0000000..467243b
--- /dev/null
+++ b/packages/ui/src/icons/Icono.tsx
@@ -0,0 +1,43 @@
+/**
+ * @cet/ui — Icono.
+ * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
+ */
+
+import type { ReactNode } from "react";
+import { ICONOS, type NombreDeIcono } from "./registro.js";
+
+export interface IconoProps {
+  readonly nombre: NombreDeIcono;
+  /** Lado del cuadro, en pixeles. */
+  readonly tamano?: number | undefined;
+  readonly className?: string | undefined;
+}
+
+/**
+ * Icono del design system.
+ *
+ * Decisiones:
+ *  - `aria-hidden` SIEMPRE: el icono nunca va solo, siempre acompana al texto
+ *    del boton, que ya da el nombre accesible. Un icono anunciado lo diria dos
+ *    veces.
+ *  - `focusable="false"` ademas del `aria-hidden`: en algunos navegadores un
+ *    `<svg>` entra en el orden de tabulacion aunque este oculto para el lector.
+ *  - El tamano va por la prop `size` del componente de Lucide, que acaba en el
+ *    atributo `width`/`height` del `<svg>` y no pasa por `cn`: una clase de
+ *    Tailwind (`h-4 w-4`, `size-5`...) podria entrar en conflicto con lo que ya
+ *    compone `Button` (ver `boton-conserva-su-tinta.test.ts`).
+ *  - Sin `"use client"`: la leccion se pinta en el SERVIDOR y este componente
+ *    entra ahi. No tiene estado ni manejadores.
+ */
+export function Icono({ nombre, tamano = 18, className }: IconoProps): ReactNode {
+  const Dibujo = ICONOS[nombre];
+  return (
+    <Dibujo
+      size={tamano}
+      strokeWidth={2}
+      className={className ? `shrink-0 ${className}` : "shrink-0"}
+      aria-hidden="true"
+      focusable="false"
+    />
+  );
+}
diff --git a/packages/ui/src/primitives/Button.tsx b/packages/ui/src/primitives/Button.tsx
index 2146e9e..c8e196c 100644
--- a/packages/ui/src/primitives/Button.tsx
+++ b/packages/ui/src/primitives/Button.tsx
@@ -8,6 +8,8 @@
 import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
 import { Slot } from "@radix-ui/react-slot";
 import { cn } from "../lib/cn.js";
+import { Icono } from "../icons/Icono.js";
+import type { NombreDeIcono } from "../icons/registro.js";
 
 export type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger";
 export type ButtonSize = "sm" | "md" | "lg";
@@ -39,6 +41,13 @@ const SIZES: Readonly<Record<ButtonSize, string>> = {
   lg: "min-h-touch-comfy px-7 text-body-lg",
 };
 
+/** Tamano del icono, en pixeles, por tamano de boton. */
+const ICON_SIZES: Readonly<Record<ButtonSize, number>> = {
+  sm: 18,
+  md: 18,
+  lg: 20,
+};
+
 export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
   /** @default "primary" */
   readonly variant?: ButtonVariant | undefined;
@@ -53,6 +62,8 @@ export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
   readonly loading?: boolean | undefined;
   /** Renderiza el hijo en lugar de un `<button>` (para envolver un `<a>`). */
   readonly asChild?: boolean | undefined;
+  /** Nombre del registro. El icono va SIEMPRE antes del texto. */
+  readonly icon?: NombreDeIcono | undefined;
 }
 
 /**
@@ -72,6 +83,7 @@ export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button
     fullWidth = false,
     loading = false,
     asChild = false,
+    icon,
     className,
     disabled,
     type,
@@ -100,6 +112,7 @@ export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button
       )}
       {...rest}
     >
+      {icon ? <Icono nombre={icon} tamano={ICON_SIZES[size]} /> : null}
       {children}
     </Comp>
   );

~~~

## Salida final de `pnpm --filter @cet/ui exec vitest run __tests__/iconos.test.tsx __tests__/a11y.test.tsx __tests__/paleta-de-botones.test.tsx __tests__/boton-conserva-su-tinta.test.ts`

~~~

[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/iconos-envoltorio-y-boton/packages/ui[39m

 [32m✓[39m __tests__/boton-conserva-su-tinta.test.ts [2m([22m[2m5 tests[22m[2m)[22m[90m 6[2mms[22m[39m
 [32m✓[39m __tests__/iconos.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[90m 117[2mms[22m[39m
 [32m✓[39m __tests__/paleta-de-botones.test.tsx [2m([22m[2m10 tests[22m[2m)[22m[90m 124[2mms[22m[39m
 [32m✓[39m __tests__/a11y.test.tsx [2m([22m[2m46 tests[22m[2m)[22m[33m 1554[2mms[22m[39m

[2m Test Files [22m [1m[32m4 passed[39m[22m[90m (4)[39m
[2m      Tests [22m [1m[32m68 passed[39m[22m[90m (68)[39m
[2m   Start at [22m 10:33:39
[2m   Duration [22m 4.67s[2m (transform 329ms, setup 833ms, collect 1.35s, tests 1.80s, environment 5.90s, prepare 752ms)[22m

[90mstderr[2m | __tests__/a11y.test.tsx[2m > [22m[2maxe — componentes interactivos[2m > [22m[2mAvatar no tiene violaciones
[22m[39mAn update to ForwardRef(AvatarFallback) inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.