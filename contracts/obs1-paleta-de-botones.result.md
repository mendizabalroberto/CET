# Resultado - obs1-paleta-de-botones
- Contrato: `contracts/obs1-paleta-de-botones.md`
- Modelo: deepseek-chat
- Desenlace: **verde**
- Rondas consumidas: 3 de 4
- Rama: `deepseek/obs1-paleta-de-botones`
- Duracion: 105.2 s
## Diff

~~~diff
diff --git a/packages/ui/src/feedback/HintPanel.tsx b/packages/ui/src/feedback/HintPanel.tsx
index c2313a4..dcb8d1a 100644
--- a/packages/ui/src/feedback/HintPanel.tsx
+++ b/packages/ui/src/feedback/HintPanel.tsx
@@ -8,6 +8,7 @@
 import { useId, type ReactNode } from "react";
 import type { I18nText } from "@cet/shared";
 import { cn } from "../lib/cn.js";
+import { Button } from "../primitives/Button.js";
 import { useI18n } from "../lib/i18n.js";
 import { parseSafeHtml } from "../lib/html-to-react.js";
 import { UI_STRINGS } from "../lib/strings.js";
@@ -19,8 +20,13 @@ export interface HintPanelProps {
   readonly onOpenChange: (open: boolean) => void;
   readonly label?: I18nText | undefined;
   readonly className?: string | undefined;
+  readonly part?: "all" | "trigger" | "panel" | undefined;
+  readonly id?: string | undefined;
 }
 
+type Partido = { readonly part: "trigger" | "panel"; readonly id: string };
+type Entero = { readonly part?: "all" | undefined; readonly id?: string | undefined };
+
 /**
  * Pista bajo demanda. El `.fb.hint` de los trainers Y6A.
  *
@@ -30,27 +36,57 @@ export interface HintPanelProps {
  * `aria-controls`, asi que un lector de pantalla sabe que hay contenido
  * asociado antes de abrirlo.
  */
-export function HintPanel({ html, open, onOpenChange, label, className }: HintPanelProps): ReactNode {
+export function HintPanel({ html, open, onOpenChange, label, className, part = "all", id }: HintPanelProps): ReactNode {
   const t = useI18n();
-  const id = useId();
-  const panelId = `${id}-hint`;
+  const generatedId = useId();
+  const panelId = `${id ?? generatedId}-hint`;
 
-  return (
-    <div className={cn("flex flex-col gap-2", className)}>
-      <button
+  if (part === "trigger") {
+    return (
+      <Button
         type="button"
+        variant="secondary"
+        size="md"
+        className="w-fit"
         aria-expanded={open}
         aria-controls={panelId}
         onClick={() => onOpenChange(!open)}
+      >
+        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--cet-hint-vivid)]" />
+        {t(label, open ? UI_STRINGS.hint : UI_STRINGS.showHint)}
+      </Button>
+    );
+  }
+
+  if (part === "panel") {
+    return (
+      <div
+        id={panelId}
+        hidden={!open}
         className={cn(
-          "inline-flex min-h-touch w-fit items-center gap-2 rounded-sm px-4 font-semibold",
-          "border-2 border-[var(--cet-hint-accent)] bg-[var(--cet-surface)] text-[var(--cet-hint-text)]",
-          "hover:bg-[var(--cet-hint-bg)]",
-          "transition-colors duration-fast ease-cet motion-reduce:transition-none",
+          "rounded-r-sm border-l-4 border-l-[var(--cet-hint-accent)] bg-[var(--cet-hint-bg)] px-4 py-3",
+          "text-body text-[var(--cet-hint-text)]",
         )}
       >
+        <div className="cet-prose">{parseSafeHtml(html)}</div>
+      </div>
+    );
+  }
+
+  return (
+    <div className={cn("flex flex-col gap-2", className)}>
+      <Button
+        type="button"
+        variant="secondary"
+        size="md"
+        className="w-fit"
+        aria-expanded={open}
+        aria-controls={panelId}
+        onClick={() => onOpenChange(!open)}
+      >
+        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--cet-hint-vivid)]" />
         {t(label, open ? UI_STRINGS.hint : UI_STRINGS.showHint)}
-      </button>
+      </Button>
 
       <div
         id={panelId}
diff --git a/packages/ui/src/feedback/SolutionPanel.tsx b/packages/ui/src/feedback/SolutionPanel.tsx
index 7c0fd14..f6a95ca 100644
--- a/packages/ui/src/feedback/SolutionPanel.tsx
+++ b/packages/ui/src/feedback/SolutionPanel.tsx
@@ -8,6 +8,7 @@
 import { useId, type ReactNode } from "react";
 import type { I18nText } from "@cet/shared";
 import { cn } from "../lib/cn.js";
+import { Button } from "../primitives/Button.js";
 import { useI18n } from "../lib/i18n.js";
 import { parseSafeHtml } from "../lib/html-to-react.js";
 import { UI_STRINGS } from "../lib/strings.js";
@@ -22,8 +23,13 @@ export interface SolutionPanelProps {
   readonly onOpenChange: (open: boolean) => void;
   readonly label?: I18nText | undefined;
   readonly className?: string | undefined;
+  readonly part?: "all" | "trigger" | "panel" | undefined;
+  readonly id?: string | undefined;
 }
 
+type Partido = { readonly part: "trigger" | "panel"; readonly id: string };
+type Entero = { readonly part?: "all" | undefined; readonly id?: string | undefined };
+
 /**
  * Explicacion paso a paso de la respuesta.
  *
@@ -41,27 +47,62 @@ export function SolutionPanel({
   onOpenChange,
   label,
   className,
+  part = "all",
+  id,
 }: SolutionPanelProps): ReactNode {
   const t = useI18n();
-  const id = useId();
-  const panelId = `${id}-solution`;
+  const generatedId = useId();
+  const panelId = `${id ?? generatedId}-solution`;
+
+  if (part === "trigger") {
+    return (
+      <Button
+        type="button"
+        variant="secondary"
+        size="md"
+        className="w-fit"
+        aria-expanded={open}
+        aria-controls={panelId}
+        onClick={() => onOpenChange(!open)}
+      >
+        {t(label, open ? UI_STRINGS.hideSolution : UI_STRINGS.showSolution)}
+      </Button>
+    );
+  }
+
+  if (part === "panel") {
+    return (
+      <div id={panelId} hidden={!open}>
+        {steps && steps.length > 0 ? (
+          <StepList steps={steps.map((stepHtml) => ({ html: stepHtml }))} label={UI_STRINGS.solution} />
+        ) : null}
+        {html ? (
+          <div
+            className={cn(
+              "cet-prose rounded-md border border-[var(--cet-line)] bg-[var(--cet-surface-2)] px-4 py-3",
+              "text-body text-[var(--cet-ink)]",
+            )}
+          >
+            {parseSafeHtml(html)}
+          </div>
+        ) : null}
+      </div>
+    );
+  }
 
   return (
     <div className={cn("flex flex-col gap-2", className)}>
-      <button
+      <Button
         type="button"
+        variant="secondary"
+        size="md"
+        className="w-fit"
         aria-expanded={open}
         aria-controls={panelId}
         onClick={() => onOpenChange(!open)}
-        className={cn(
-          "inline-flex min-h-touch w-fit items-center gap-2 rounded-sm px-4 font-semibold",
-          "border-2 border-[var(--cet-border-strong)] bg-[var(--cet-surface)] text-[var(--cet-ink)]",
-          "hover:bg-[var(--cet-surface-2)]",
-          "transition-colors duration-fast ease-cet motion-reduce:transition-none",
-        )}
       >
         {t(label, open ? UI_STRINGS.hideSolution : UI_STRINGS.showSolution)}
-      </button>
+      </Button>
 
       <div id={panelId} hidden={!open}>
         {steps && steps.length > 0 ? (

~~~

## Salida final de `pnpm --filter @cet/ui exec vitest run __tests__/paleta-de-botones.test.tsx __tests__/a11y.test.tsx __tests__/contraste-tokens.test.ts`

~~~

[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/obs1-paleta-de-botones/packages/ui[39m

 [32m✓[39m __tests__/contraste-tokens.test.ts [2m([22m[2m83 tests[22m[2m)[22m[90m 8[2mms[22m[39m
 [32m✓[39m __tests__/paleta-de-botones.test.tsx [2m([22m[2m10 tests[22m[2m)[22m[90m 84[2mms[22m[39m
 [32m✓[39m __tests__/a11y.test.tsx [2m([22m[2m46 tests[22m[2m)[22m[33m 1558[2mms[22m[39m

[2m Test Files [22m [1m[32m3 passed[39m[22m[90m (3)[39m
[2m      Tests [22m [1m[32m139 passed[39m[22m[90m (139)[39m
[2m   Start at [22m 09:32:19
[2m   Duration [22m 5.79s[2m (transform 391ms, setup 2.24s, collect 2.47s, tests 1.65s, environment 3.36s, prepare 688ms)[22m

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