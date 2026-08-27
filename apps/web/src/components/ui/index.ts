/**
 * Adaptador del design system.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ EXISTE ESTE FICHERO
 * ===========================================================================
 * `@cet/ui` lo construye otra vía en paralelo y todavía no existe. Toda la app
 * importa los primitivos desde AQUÍ, nunca desde `@cet/ui` directamente. Si al
 * integrar la API real difiere de lo que se asumió, se corrige un fichero en
 * vez de cuarenta.
 *
 * ===========================================================================
 * CONTRATO ASUMIDO DE @cet/ui — verificar al integrar
 * ===========================================================================
 *  `cn(...classes)` -> string
 *      Concatena clases y resuelve conflictos de Tailwind (clsx + tailwind-merge).
 *
 *  <Button variant="primary" | "secondary" | "ghost" | "amber"
 *          size="sm" | "md" | "lg"
 *          {...React.ButtonHTMLAttributes<HTMLButtonElement>} />
 *      Componente de SERVIDOR (sin "use client"): un botón sin onClick no
 *      necesita hidratarse. Si @cet/ui lo marca como cliente, cada página de
 *      marketing arrastraría JavaScript sin necesidad.
 *
 *  <Card title? lead? padding?> -> contenedor con borde, radio y sombra.
 *      Gestiona su propio padding via `padding`; NO existe un <CardBody> aparte.
 *
 *  <Input label error hint {...InputHTMLAttributes} />
 *  <Select label error {...SelectHTMLAttributes} />
 *      Ambos asocian <label>, mensaje de error y `aria-describedby` por sí solos.
 *      La accesibilidad del formulario NO puede depender de que cada página se
 *      acuerde de cablearla.
 *
 *      No existe un <Label> suelto: la etiqueta va dentro de <Input>/<Select>
 *      precisamente para que no se pueda renderizar un campo sin etiqueta.
 *
 *  <Alert tone="error" | "warning" | "success" | "info" role?> -> aviso.
 *      Con `tone="error"` debe emitir `role="alert"` para que un lector de
 *      pantalla anuncie el fallo de login sin que el usuario tenga que buscarlo.
 *
 *  sanitizeHtml(html) -> string
 *      Allowlist para el HTML restringido de los enunciados Y6A
 *      (<b> <i> <u> <br> <sub> <sup> <span class="f">). Lo exige el contrato de
 *      `@cet/shared/engine-contract`. Todavía no se usa en esta app (no hay
 *      pantalla de examen en el Hito 1), pero se reexporta para que la pantalla
 *      de examen no tenga la tentación de buscarse la vida.
 * ===========================================================================
 */
export { Alert, Button, Card, Input, Select, cn, sanitizeHtml } from "@cet/ui";
