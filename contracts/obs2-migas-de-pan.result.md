# Resultado - obs2-migas-de-pan
- Contrato: `contracts/obs2-migas-de-pan.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 1 de 4
- Rama: `deepseek/obs2-migas-de-pan`
- Duracion: 27.9 s
## Diff

~~~diff
diff --git a/apps/web/src/components/nav/Migas.test.tsx b/apps/web/src/components/nav/Migas.test.tsx
new file mode 100644
index 0000000..896345d
--- /dev/null
+++ b/apps/web/src/components/nav/Migas.test.tsx
@@ -0,0 +1,120 @@
+/**
+ * Pruebas de las migas de pan.
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ *
+ * Cada `it` falla si se borra la regla que protege. La mutación que pondría
+ * rojo cada test se indica en su comentario.
+ */
+import { describe, expect, it } from "vitest";
+import { render, screen } from "@testing-library/react";
+
+import { Migas } from "./Migas";
+import type { Miga } from "./Migas";
+
+describe("Migas", () => {
+  it("el nav tiene el nombre accesible que se le pasó", () => {
+    // Mutación que lo pondría rojo: quitar `aria-label` del `<nav>`.
+    render(<Migas label="Ruta" items={[{ label: "Aprender", href: "/learn" }]} />);
+    expect(screen.getByRole("navigation", { name: "Ruta" })).toBeInTheDocument();
+  });
+
+  it("con tres escalones, solo los dos primeros con href son enlaces", () => {
+    // Fixture: [Aprender, /learn] → enlace (intermedio con href)
+    //          [Matemáticas, /learn/matematicas] → enlace (intermedio con href)
+    //          [Fracciones] → texto (último, nunca enlace)
+    // Enlaces: 2.
+    // Mutación que lo pondría rojo: pintar el último escalón como `<Link>`
+    // cuando trae `href`, o pintar un intermedio sin `href` como enlace.
+    const items: readonly Miga[] = [
+      { label: "Aprender", href: "/learn" },
+      { label: "Matemáticas", href: "/learn/matematicas" },
+      { label: "Fracciones" },
+    ];
+    render(<Migas label="Ruta" items={items} />);
+
+    expect(screen.getAllByRole("link")).toHaveLength(2);
+    expect(screen.getByText("Fracciones")).toBeInTheDocument();
+    expect(screen.getByText("Fracciones").tagName).toBe("SPAN");
+  });
+
+  it("solo el último escalón lleva aria-current=page", () => {
+    // Mutación que lo pondría rojo: poner `aria-current` en todos los escalones,
+    // o no ponerlo en el último.
+    const items: readonly Miga[] = [
+      { label: "Aprender", href: "/learn" },
+      { label: "Matemáticas", href: "/learn/matematicas" },
+      { label: "Fracciones" },
+    ];
+    render(<Migas label="Ruta" items={items} />);
+
+    const nav = screen.getByRole("navigation", { name: "Ruta" });
+    const conCurrent = nav.querySelectorAll('[aria-current="page"]');
+    expect(conCurrent).toHaveLength(1);
+    expect(conCurrent[0]).toHaveTextContent("Fracciones");
+  });
+
+  it("el último escalón con href sigue sin ser enlace", () => {
+    // Fixture: [Aprender, /learn] → enlace (intermedio con href)
+    //          [Fracciones, /learn/fracciones] → texto (último, NUNCA enlace)
+    // Enlaces: 1.
+    // Mutación que lo pondría rojo: pintar el último escalón como `<Link>`
+    // «porque tiene href».
+    const items: readonly Miga[] = [
+      { label: "Aprender", href: "/learn" },
+      { label: "Fracciones", href: "/learn/fracciones" },
+    ];
+    render(<Migas label="Ruta" items={items} />);
+
+    expect(screen.getAllByRole("link")).toHaveLength(1);
+    expect(screen.getByText("Fracciones").tagName).toBe("SPAN");
+  });
+
+  it("un escalón intermedio sin href aparece como texto, no desaparece", () => {
+    // Fixture: [Aprender, /learn] → enlace (intermedio con href)
+    //          [Matemáticas] → texto (intermedio sin href)
+    //          [Fracciones, /learn/fracciones] → texto (último, NUNCA enlace)
+    // Enlaces: 1. La regla del test 4 vale también aquí: el último con href
+    // no es enlace.
+    // Mutación que lo pondría rojo: no pintar un escalón intermedio sin `href`,
+    // o pintarlo como enlace.
+    const items: readonly Miga[] = [
+      { label: "Aprender", href: "/learn" },
+      { label: "Matemáticas" },
+      { label: "Fracciones", href: "/learn/fracciones" },
+    ];
+    render(<Migas label="Ruta" items={items} />);
+
+    expect(screen.getAllByRole("link")).toHaveLength(1);
+    expect(screen.getByText("Matemáticas")).toBeInTheDocument();
+    expect(screen.getByText("Matemáticas").tagName).toBe("SPAN");
+  });
+
+  it("con items vacío no se pinta nada", () => {
+    // Mutación que lo pondría rojo: devolver un `<nav>` con lista vacía en
+    // lugar de `null`.
+    render(<Migas label="Ruta" items={[]} />);
+    expect(screen.queryByRole("navigation")).toBeNull();
+  });
+
+  it("los separadores no se anuncian y no van después del último", () => {
+    // Mutación que lo pondría rojo: quitar `aria-hidden` de los separadores,
+    // o pintar un separador después del último escalón.
+    const items: readonly Miga[] = [
+      { label: "Aprender", href: "/learn" },
+      { label: "Matemáticas", href: "/learn/matematicas" },
+      { label: "Fracciones" },
+    ];
+    render(<Migas label="Ruta" items={items} />);
+
+    const nav = screen.getByRole("navigation", { name: "Ruta" });
+    const separadores = nav.querySelectorAll('[aria-hidden="true"]');
+    expect(separadores).toHaveLength(items.length - 1);
+    for (const sep of separadores) {
+      expect(sep.textContent).toBe("›");
+    }
+
+    // El texto accesible no termina en el separador.
+    const textoAccesible = nav.textContent ?? "";
+    expect(textoAccesible.trim().endsWith("›")).toBe(false);
+  });
+});
diff --git a/apps/web/src/components/nav/Migas.tsx b/apps/web/src/components/nav/Migas.tsx
new file mode 100644
index 0000000..52b261f
--- /dev/null
+++ b/apps/web/src/components/nav/Migas.tsx
@@ -0,0 +1,91 @@
+/**
+ * Migas de pan para las pantallas profundas del alumno.
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ *
+ * ===========================================================================
+ * POR QUÉ EXISTE
+ * ===========================================================================
+ * En `/learn/<id>` y `/practice/<tema>` el alumno no sabe dónde está: el curso
+ * y el módulo se pintan como texto muerto y el único enlace dice «Volver a tus
+ * lecciones» sin decir a dónde vuelve. El rail lateral responde «en qué
+ * sección estoy»; esto responde «en qué pantalla estoy» dentro de esa sección.
+ *
+ * ===========================================================================
+ * LAS REGLAS QUE MANDAN AQUÍ
+ * ===========================================================================
+ * 1. El último escalón NUNCA es un enlace, aunque traiga `href`: un enlace a
+ *    la página en la que ya estás es un clic que no hace nada, y para un lector
+ *    de pantalla es una promesa falsa.
+ * 2. Un escalón intermedio sin `href` se pinta como texto, no desaparece: que
+ *    un módulo todavía no tenga página propia no es motivo para ocultarle al
+ *    alumno en qué módulo está.
+ * 3. Los separadores van en `<span aria-hidden="true">` entre escalones, y no
+ *    después del último: un lector no debe decir «mayor que» entre cada paso.
+ * 4. `items` vacío devuelve `null`: un `<nav>` con una lista vacía es ruido
+ *    para un lector de pantalla.
+ */
+"use client";
+
+import Link from "next/link";
+import type { ReactNode } from "react";
+
+export interface Miga {
+  /** Rótulo ya resuelto al idioma del alumno. Nunca una clave de diccionario. */
+  readonly label: string;
+  /** Destino. Si falta, el escalón se pinta como texto y no como enlace. */
+  readonly href?: string | undefined;
+}
+
+export interface MigasProps {
+  /** Nombre accesible del `<nav>`, ya traducido. Ej.: "Ruta". */
+  readonly label: string;
+  /** De la raíz al sitio actual. El ÚLTIMO es siempre el sitio actual. */
+  readonly items: readonly Miga[];
+  readonly className?: string | undefined;
+}
+
+export function Migas({ label, items, className }: MigasProps): ReactNode {
+  if (items.length === 0) return null;
+
+  return (
+    <nav aria-label={label} className={className}>
+      <ol className="flex flex-wrap items-center gap-1">
+        {items.map((miga, indice) => {
+          const esUltimo = indice === items.length - 1;
+          const esEnlace = !esUltimo && miga.href !== undefined;
+
+          return (
+            <li key={`${miga.label}-${indice}`} className="flex items-center gap-1">
+              {indice > 0 ? (
+                <span aria-hidden="true" className="text-muted">
+                  ›
+                </span>
+              ) : null}
+              {esEnlace ? (
+                <Link
+                  href={miga.href}
+                  className={[
+                    "min-h-11 inline-flex items-center text-sm text-muted transition-colors",
+                    "hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2",
+                  ].join(" ")}
+                >
+                  {miga.label}
+                </Link>
+              ) : (
+                <span
+                  {...(esUltimo ? { "aria-current": "page" as const } : {})}
+                  className={[
+                    "min-h-11 inline-flex items-center text-sm",
+                    esUltimo ? "font-semibold text-ink" : "text-muted",
+                  ].join(" ")}
+                >
+                  {miga.label}
+                </span>
+              )}
+            </li>
+          );
+        })}
+      </ol>
+    </nav>
+  );
+}

~~~

## Salida final de `pnpm --filter @cet/web exec vitest run src/components/nav`

~~~

[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/obs2-migas-de-pan/apps/web[39m

 [32m✓[39m src/components/nav/StudentNav.test.ts [2m([22m[2m5 tests[22m[2m)[22m[90m 1[2mms[22m[39m
 [32m✓[39m src/components/nav/Migas.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[90m 50[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m12 passed[39m[22m[90m (12)[39m
[2m   Start at [22m 09:38:32
[2m   Duration [22m 1.28s[2m (transform 55ms, setup 256ms, collect 80ms, tests 51ms, environment 340ms, prepare 570ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.