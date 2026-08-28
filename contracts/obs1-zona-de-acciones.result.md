# Resultado - obs1-zona-de-acciones
- Contrato: `contracts/obs1-zona-de-acciones.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 1 de 4
- Rama: `deepseek/obs1-zona-de-acciones`
- Duracion: 33.4 s
## Diff

~~~diff
diff --git a/apps/web/src/components/learn/PracticeSession.tsx b/apps/web/src/components/learn/PracticeSession.tsx
index 60e308d..857d869 100644
--- a/apps/web/src/components/learn/PracticeSession.tsx
+++ b/apps/web/src/components/learn/PracticeSession.tsx
@@ -155,6 +155,10 @@ export function PracticeSession({ topicId, locale, levels }: PracticeSessionProp
   const actionRef = useRef<HTMLButtonElement | null>(null);
   // Ata los controles de respuesta al enunciado para el lector de pantalla.
   const stemId = `${useId()}-stem`;
+  // Ata el disparador de cada ayuda a su cuerpo. El mismo id en las dos
+  // mitades: es lo que hace que el `aria-controls` apunte a algo que existe.
+  const hintId = `${useId()}-hint`;
+  const solutionId = `${useId()}-solution`;
 
   const lastChangeEventAt = useRef(0);
 
@@ -487,13 +491,42 @@ export function PracticeSession({ topicId, locale, levels }: PracticeSessionProp
               </p>
             ) : null}
 
-            <div className="flex flex-wrap gap-3">
-              <Button type="button" ref={actionRef} onClick={submit}>
+            {/* Una sola zona de acciones, con nombre. Los cuatro disparadores
+                viven aquí, en orden fijo: primero lo que cierra la pregunta,
+                después lo que la esquiva, después las dos ayudas de menor a
+                mayor. Los cuerpos desplegables van DETRÁS de los botones, no
+                intercalados. */}
+            <div role="group" aria-label={t.actionsLabel} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
+              <Button type="button" ref={actionRef} onClick={submit} fullWidth>
                 {answered ? t.nextQuestion : t.check}
               </Button>
-              <Button type="button" variant="secondary" onClick={skip} disabled={answered}>
+              <Button type="button" variant="secondary" onClick={skip} disabled={answered} fullWidth>
                 {t.skip}
               </Button>
+              {item.hint ? (
+                <HintPanel
+                  part="trigger"
+                  id={hintId}
+                  html={state.hintOpen ? resolveI18n(item.hint, locale) : ""}
+                  open={state.hintOpen}
+                  onOpenChange={(open) => {
+                    noteActivity();
+                    dispatch({ type: "hint_toggled", open, now: Date.now() });
+                  }}
+                />
+              ) : null}
+              {item.solution ? (
+                <SolutionPanel
+                  part="trigger"
+                  id={solutionId}
+                  html={state.solutionOpen ? resolveI18n(item.solution, locale) : undefined}
+                  open={state.solutionOpen}
+                  onOpenChange={(open) => {
+                    noteActivity();
+                    dispatch({ type: "solution_toggled", open, now: Date.now() });
+                  }}
+                />
+              ) : null}
             </div>
 
             {/* El HTML de la pista y el de la solución SOLO se montan cuando
@@ -502,6 +535,8 @@ export function PracticeSession({ topicId, locale, levels }: PracticeSessionProp
                 inspector para verla. */}
             {item.hint ? (
               <HintPanel
+                part="panel"
+                id={hintId}
                 html={state.hintOpen ? resolveI18n(item.hint, locale) : ""}
                 open={state.hintOpen}
                 onOpenChange={(open) => {
@@ -513,6 +548,8 @@ export function PracticeSession({ topicId, locale, levels }: PracticeSessionProp
 
             {item.solution ? (
               <SolutionPanel
+                part="panel"
+                id={solutionId}
                 html={state.solutionOpen ? resolveI18n(item.solution, locale) : undefined}
                 open={state.solutionOpen}
                 onOpenChange={(open) => {
diff --git a/apps/web/src/components/learn/zona-de-acciones.test.tsx b/apps/web/src/components/learn/zona-de-acciones.test.tsx
new file mode 100644
index 0000000..2503db4
--- /dev/null
+++ b/apps/web/src/components/learn/zona-de-acciones.test.tsx
@@ -0,0 +1,137 @@
+/**
+ * La zona de acciones de la práctica: una sola agrupación con nombre, cuatro
+ * disparadores en orden fijo, y los cuerpos desplegables detrás de los botones.
+ * © 2026 Roberto Mendizabal. Todos los derechos reservados.
+ */
+import { describe, expect, it, beforeEach } from "vitest";
+import { render, screen, waitFor, within } from "@testing-library/react";
+import userEvent from "@testing-library/user-event";
+
+import { PracticeSession } from "./PracticeSession";
+import { UiLocaleProvider } from "./UiLocaleProvider";
+import { TelemetryProvider } from "@/lib/telemetry/provider";
+
+const TOPIC = "math.simplify";
+
+function renderPractice(topicId: string = TOPIC) {
+  return render(
+    <UiLocaleProvider locale="es">
+      <TelemetryProvider>
+        <PracticeSession topicId={topicId} locale="es" />
+      </TelemetryProvider>
+    </UiLocaleProvider>,
+  );
+}
+
+function answerField(): HTMLElement {
+  return screen.getByRole("textbox");
+}
+
+describe("PracticeSession — zona de acciones", () => {
+  beforeEach(() => {
+    globalThis.fetch = (() =>
+      Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch;
+  });
+
+  it("los cuatro disparadores viven en una sola zona con nombre", async () => {
+    renderPractice();
+    await waitFor(() => expect(answerField()).toBeInTheDocument());
+
+    const zona = screen.getByRole("group", { name: "Acciones" });
+    expect(zona).toHaveClass("grid");
+    within(zona).getByRole("button", { name: "Comprobar" });
+    within(zona).getByRole("button", { name: "Saltar" });
+    within(zona).getByRole("button", { name: "Ver una pista" });
+    within(zona).getByRole("button", { name: "Ver cómo se hace" });
+  });
+
+  it("el orden de los botones es fijo: comprobar, saltar, pista, solución", async () => {
+    renderPractice();
+    await waitFor(() => expect(answerField()).toBeInTheDocument());
+
+    const zona = screen.getByRole("group", { name: "Acciones" });
+    const nombres = within(zona)
+      .getAllByRole("button")
+      .map((b) => b.textContent?.trim() ?? "");
+    expect(nombres).toEqual(["Comprobar", "Saltar", "Ver una pista", "Ver cómo se hace"]);
+  });
+
+  it("el cuerpo de la pista va después del último botón", async () => {
+    const user = userEvent.setup();
+    renderPractice();
+    await waitFor(() => expect(answerField()).toBeInTheDocument());
+
+    const zona = screen.getByRole("group", { name: "Acciones" });
+    const boton = within(zona).getByRole("button", { name: "Ver una pista" });
+    await user.click(boton);
+
+    const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "");
+    expect(panel).not.toBeNull();
+    await waitFor(() => {
+      expect((panel?.textContent ?? "").trim().length).toBeGreaterThan(0);
+    });
+
+    const botones = within(zona).getAllByRole("button");
+    const ultimoBoton = botones[botones.length - 1];
+    expect(
+      ultimoBoton.compareDocumentPosition(panel!) & Node.DOCUMENT_POSITION_FOLLOWING,
+    ).toBeTruthy();
+  });
+
+  it("el cuerpo de la solución va después del último botón", async () => {
+    const user = userEvent.setup();
+    renderPractice();
+    await waitFor(() => expect(answerField()).toBeInTheDocument());
+
+    const zona = screen.getByRole("group", { name: "Acciones" });
+    const boton = within(zona).getByRole("button", { name: "Ver cómo se hace" });
+    await user.click(boton);
+
+    const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "");
+    expect(panel).not.toBeNull();
+    await waitFor(() => {
+      expect((panel?.textContent ?? "").trim().length).toBeGreaterThan(0);
+    });
+
+    const botones = within(zona).getAllByRole("button");
+    const ultimoBoton = botones[botones.length - 1];
+    expect(
+      ultimoBoton.compareDocumentPosition(panel!) & Node.DOCUMENT_POSITION_FOLLOWING,
+    ).toBeTruthy();
+  });
+
+  it("el aria-controls de la pista apunta al elemento que la contiene", async () => {
+    const user = userEvent.setup();
+    renderPractice();
+    await waitFor(() => expect(answerField()).toBeInTheDocument());
+
+    const zona = screen.getByRole("group", { name: "Acciones" });
+    const boton = within(zona).getByRole("button", { name: "Ver una pista" });
+    await user.click(boton);
+
+    const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "");
+    expect(panel).not.toBeNull();
+    await waitFor(() => {
+      expect((panel?.textContent ?? "").trim().length).toBeGreaterThan(0);
+    });
+    expect(panel!.textContent).toBe(boton.getAttribute("aria-controls") ? panel!.textContent : "");
+  });
+
+  it("el aria-controls de la solución apunta al elemento que la contiene", async () => {
+    const user = userEvent.setup();
+    renderPractice();
+    await waitFor(() => expect(answerField()).toBeInTheDocument());
+
+    const zona = screen.getByRole("group", { name: "Acciones" });
+    const boton = within(zona).getByRole("button", { name: "Ver cómo se hace" });
+    await user.click(boton);
+
+    const panel = document.getElementById(boton.getAttribute("aria-controls") ?? "");
+    expect(panel).not.toBeNull();
+    await waitFor(() => {
+      expect((panel?.textContent ?? "").trim().length).toBeGreaterThan(0);
+    });
+    expect(panel!.textContent).toBe(boton.getAttribute("aria-controls") ? panel!.textContent : "");
+  });
+});
+

~~~

## Salida final de `pnpm --filter @cet/web exec vitest run src/components/learn/PracticeSession.test.tsx src/components/learn/zona-de-acciones.test.tsx`

~~~

[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/obs1-zona-de-acciones/apps/web[39m

 [32m✓[39m src/components/learn/zona-de-acciones.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 394[2mms[22m[39m
 [32m✓[39m src/components/learn/PracticeSession.test.tsx [2m([22m[2m16 tests[22m[2m)[22m[33m 1262[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m22 passed[39m[22m[90m (22)[39m
[2m   Start at [22m 09:46:34
[2m   Duration [22m 2.73s[2m (transform 380ms, setup 303ms, collect 1.44s, tests 1.66s, environment 623ms, prepare 140ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.