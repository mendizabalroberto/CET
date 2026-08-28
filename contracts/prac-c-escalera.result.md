# Resultado - prac-c-escalera
- Contrato: `contracts/prac-c-escalera.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 2 de 4
- Rama: `deepseek/prac-c-escalera`
- Duracion: 263.6 s
## Diff

~~~diff
diff --git a/packages/ui/__tests__/escalera-hereda-la-tinta.test.tsx b/packages/ui/__tests__/escalera-hereda-la-tinta.test.tsx
new file mode 100644
index 0000000..b977142
--- /dev/null
+++ b/packages/ui/__tests__/escalera-hereda-la-tinta.test.tsx
@@ -0,0 +1,118 @@
+/**
+ * @cet/ui — INVARIANTE DE FAMILIA: la escalera y su rotulo heredan la tinta.
+ * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
+ *
+ * ===========================================================================
+ * QUE FAMILIA CAZA ESTE TEST
+ * ===========================================================================
+ * `MasteryLadder` con `showLabel` escribia la palabra del nivel con un token
+ * fijo (`--cet-ink-muted`). El dibujo de al lado ya usaba `currentColor`, y su
+ * cabecera explica por que: con un token fijo daba 2.9:1 dentro del chip activo.
+ * La palabra tenia el mismo fallo que el dibujo tenia entonces: sobre los
+ * lavados de materia de `/practice`, `--cet-ink-muted` mide entre 4.45:1 y
+ * 4.51:1, por debajo del 4.5 de WCAG 1.4.3 en tres de los siete tonos.
+ *
+ * La cura no es otro token: es heredar. El contenedor es quien conoce su fondo
+ * y quien ha medido su texto, asi que el color lo decide el. Este test falla si
+ * alguien vuelve a fijar una tinta en el dibujo o en el rotulo, o si las dos
+ * mitades del indicador se separan cromaticamente.
+ */
+
+import { describe, expect, it } from "vitest";
+import { render } from "@testing-library/react";
+import { LocaleProvider } from "../src/lib/i18n.js";
+import { MasteryLadder } from "../src/progress/MasteryLadder.js";
+
+const T = (es: string, en: string): { es: string; en: string } => ({ es, en });
+const GRUPO = T("Comparar", "Compare");
+const NIVEL = "solid";
+const PALABRA = "Lo llevas bien";
+const TINTA_DE_PRUEBA = "#123456";
+
+/**
+ * Pasea el DOM renderizado y exige que ninguna pieza fije una tinta.
+ *
+ * El dibujo legitimo usa `fill="none"` en los peldanos vacios: es la ausencia
+ * de relleno, no una tinta, y por eso se permite. Lo que este test persigue es
+ * que nadie vuelva a escribir `text-[var(--cet-...)]` en el rotulo ni un
+ * `fill`/`stroke` con un color fijo en la escalera.
+ */
+function sinTintaFija(contenedor: HTMLElement): void {
+  const elementos = Array.from(contenedor.querySelectorAll<Element>("[class]"));
+  expect(elementos.length).toBeGreaterThan(0);
+  for (const el of elementos) {
+    const clase = el.getAttribute("class") ?? "";
+    expect(
+      clase,
+      `<${el.tagName.toLowerCase()}> lleva una clase de color de tinta fija: ${clase}`,
+    ).not.toMatch(/text-\[(?:color:)?var\(--cet-/);
+  }
+
+  const conTrazo = Array.from(contenedor.querySelectorAll("[fill], [stroke]"));
+  expect(conTrazo.length).toBeGreaterThan(0);
+  for (const el of conTrazo) {
+    const fill = el.getAttribute("fill");
+    const stroke = el.getAttribute("stroke");
+    if (fill !== null) {
+      expect(
+        fill,
+        `<${el.tagName.toLowerCase()}> fija un relleno que no es currentColor: ${fill}`,
+      ).toMatch(/^(?:currentColor|none)$/);
+    }
+    if (stroke !== null) {
+      expect(
+        stroke,
+        `<${el.tagName.toLowerCase()}> fija un trazo que no es currentColor: ${stroke}`,
+      ).toBe("currentColor");
+    }
+  }
+}
+
+describe("MasteryLadder — la tinta se hereda, no se fija", () => {
+  it("con showLabel, ni el dibujo ni el rotulo fijan una tinta", () => {
+    const { container } = render(
+      <LocaleProvider locale="es">
+        <MasteryLadder level={NIVEL} groupLabel={GRUPO} showLabel />
+      </LocaleProvider>,
+    );
+    sinTintaFija(container);
+  });
+
+  it("el color efectivo del rotulo y el del dibujo es el mismo", () => {
+    const { container } = render(
+      <LocaleProvider locale="es">
+        <span style={{ color: TINTA_DE_PRUEBA }}>
+          <MasteryLadder level={NIVEL} groupLabel={GRUPO} showLabel />
+        </span>
+      </LocaleProvider>,
+    );
+    const rotulo = container.querySelector('[aria-hidden="true"]');
+    const dibujo = container.querySelector("svg");
+    expect(rotulo).not.toBeNull();
+    expect(dibujo).not.toBeNull();
+    expect(getComputedStyle(rotulo as HTMLElement).color).toBe("rgb(18, 52, 86)");
+    expect(getComputedStyle(dibujo as Element).color).toBe("rgb(18, 52, 86)");
+  });
+
+  it("sin showLabel no se escribe la palabra", () => {
+    const { container } = render(
+      <LocaleProvider locale="es">
+        <MasteryLadder level={NIVEL} groupLabel={GRUPO} />
+      </LocaleProvider>,
+    );
+    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
+    const palabras = Array.from(container.querySelectorAll("*")).filter(
+      (n) => n.textContent === PALABRA && n.tagName.toLowerCase() !== "title",
+    );
+    expect(palabras).toHaveLength(0);
+  });
+
+  it("con level === null no se pinta nada, aunque se pida showLabel", () => {
+    const { container } = render(
+      <LocaleProvider locale="es">
+        <MasteryLadder level={null} groupLabel={GRUPO} showLabel />
+      </LocaleProvider>,
+    );
+    expect(container.innerHTML.trim()).toBe("");
+  });
+});
diff --git a/packages/ui/src/progress/MasteryLadder.tsx b/packages/ui/src/progress/MasteryLadder.tsx
index 83ab615..f64c782 100644
--- a/packages/ui/src/progress/MasteryLadder.tsx
+++ b/packages/ui/src/progress/MasteryLadder.tsx
@@ -179,7 +179,15 @@ export function MasteryLadder({
       {/* El dibujo ya lleva el nivel en su <title>; escribirlo otra vez para el
           lector lo diria dos veces. Visualmente si tiene que estar: es el canal
           que no depende ni del color ni de contar barritas. */}
-      <span aria-hidden="true" className="text-body-sm font-semibold text-[var(--cet-ink-muted)]">
+      {/* El rotulo hereda la tinta del contenedor, como el dibujo. Fijaba
+          `--cet-ink-muted` y eso media 4.45:1 a 4.51:1 sobre los lavados de
+          materia de /practice: tres de siete tonos por debajo del 4.5 de WCAG
+          1.4.3. El contenedor es quien ha medido su fondo, asi que es quien
+          decide el color. Donde antes ya era correcto (tarjetas sobre
+          --cet-surface con tinta --cet-ink) la palabra pasa de atenuada a
+          tinta normal: cambio visible y decidido, no un accidente — rotulo y
+          escalera comparten tinta porque son dos mitades del mismo indicador. */}
+      <span aria-hidden="true" className="text-body-sm font-semibold">
         {levelText}
       </span>
     </span>

~~~

## Salida final de `pnpm --filter @cet/ui exec vitest run __tests__/escalera-hereda-la-tinta.test.tsx __tests__/progreso-viene-de-datos.test.tsx __tests__/mastery-overview.test.tsx`

~~~

[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/prac-c-escalera/packages/ui[39m

 [32m✓[39m __tests__/escalera-hereda-la-tinta.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[90m 43[2mms[22m[39m
 [32m✓[39m __tests__/mastery-overview.test.tsx [2m([22m[2m8 tests[22m[2m)[22m[90m 52[2mms[22m[39m
 [32m✓[39m __tests__/progreso-viene-de-datos.test.tsx [2m([22m[2m26 tests[22m[2m)[22m[90m 100[2mms[22m[39m

[2m Test Files [22m [1m[32m3 passed[39m[22m[90m (3)[39m
[2m      Tests [22m [1m[32m38 passed[39m[22m[90m (38)[39m
[2m   Start at [22m 11:57:01
[2m   Duration [22m 1.36s[2m (transform 134ms, setup 748ms, collect 395ms, tests 194ms, environment 995ms, prepare 235ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.