/**
 * Motor de examen autoritativo (M09 + M10, lado servidor).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Punto de entrada único: las Route Handlers importan de aquí y de ningún
 * fichero interno. Así el día que `repository.ts` cambie de forma, solo cambia
 * este barril.
 */
export * from "./errors";
export * from "./guards";
export * from "./grade";
export * from "./http";
export * from "./pool";
export * from "./repository";
export * from "./schemas";
export * from "./seed";
export * from "./snapshot";
export * from "./types";
export * from "./events";
export { startAttempt, MIN_START_WINDOW_MS } from "./start";
export type { StartAttemptInput, StartAttemptDeps } from "./start";
export { autosaveAnswer } from "./autosave";
export type { AutosaveInput, AutosaveDeps } from "./autosave";
export { submitAttempt } from "./submit";
export type { SubmitInput, SubmitDeps } from "./submit";
export { getAttemptResult, composeResult } from "./result";
export type { ResultInput, ResultDeps } from "./result";
