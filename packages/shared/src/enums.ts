/**
 * Enumeraciones canónicas del dominio CET.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * CONTRATO CONGELADO — ver DATA_MODEL.md.
 * Todo valor aquí debe existir como enum de Postgres con el mismo nombre y los
 * mismos miembros. Un desajuste entre este fichero y la DB es un bug de release.
 */

import { z } from "zod";

/** Roles del sistema. Un superadmin NO pertenece a ningún colegio (ver constraint en profiles). */
export const userRole = z.enum(["superadmin", "school_admin", "teacher", "student", "guardian"]);
export type UserRole = z.infer<typeof userRole>;

export const profileStatus = z.enum(["pending", "active", "suspended"]);
export type ProfileStatus = z.infer<typeof profileStatus>;

export const schoolStatus = z.enum(["active", "suspended"]);
export type SchoolStatus = z.infer<typeof schoolStatus>;

/** Determina la longitud del PIN: primary -> 4 dígitos, secondary -> 6 (AD-4). */
export const schoolStage = z.enum(["primary", "secondary"]);
export type SchoolStage = z.infer<typeof schoolStage>;

export const contentStatus = z.enum(["draft", "in_review", "published", "retired"]);
export type ContentStatus = z.infer<typeof contentStatus>;

/**
 * Bloques de lección. Traducción directa de las clases CSS de los trainers Y6A:
 * .rule -> rule, .eg -> example, .tip -> tip, .warn -> warning, .steps -> steps
 */
export const blockKind = z.enum([
  "rule",
  "example",
  "tip",
  "warning",
  "steps",
  "table",
  "text",
  "image",
  "video",
  "interactive",
  "formula",
]);
export type BlockKind = z.infer<typeof blockKind>;

/** `static` = banco fijo. `generated` = generador paramétrico determinista de @cet/engine. */
export const questionKind = z.enum(["static", "generated"]);
export type QuestionKind = z.infer<typeof questionKind>;

export const questionFormat = z.enum([
  "mcq_single",
  "mcq_multi",
  "true_false",
  "numeric",
  "fraction",
  "short_text",
  "long_text",
  "cloze",
  "ordering",
  "matching",
  "drag_drop",
  "hotspot",
]);
export type QuestionFormat = z.infer<typeof questionFormat>;

/** CÓMO se califica una pregunta. Propiedad de la pregunta, no del intento. */
export const gradingMode = z.enum(["auto", "partial", "manual"]);
export type GradingMode = z.infer<typeof gradingMode>;

/**
 * QUIÉN produjo una calificación. Distinto de `gradingMode`: una pregunta de
 * `gradingMode: "partial"` la califica el sistema (`auto`), y ese mismo ítem
 * puede recibir después una recalificación `manual` de un profesor.
 *
 * Se llama `grading_actor` y no `graded_by` para no colisionar en Postgres con
 * el nombre de la columna que lo usa (`attempt_gradings.graded_by`).
 */
export const gradingActor = z.enum(["auto", "manual"]);
export type GradingActor = z.infer<typeof gradingActor>;

export const feedbackMode = z.enum(["never", "after_submit", "immediate"]);
export type FeedbackMode = z.infer<typeof feedbackMode>;

export const attemptStatus = z.enum([
  "in_progress",
  "submitted",
  "grading",
  "graded",
  "abandoned",
  "voided",
]);
export type AttemptStatus = z.infer<typeof attemptStatus>;

/** Quién cerró el intento. `timer` = lo cerró el deadline del servidor. */
export const submittedBy = z.enum(["student", "timer", "teacher", "system"]);
export type SubmittedBy = z.infer<typeof submittedBy>;

export const responseSource = z.enum(["typed", "selected", "autosave", "restored"]);
export type ResponseSource = z.infer<typeof responseSource>;

export const registrationStatus = z.enum(["pending", "approved", "rejected"]);
export type RegistrationStatus = z.infer<typeof registrationStatus>;

export const blueprintSectionSource = z.enum(["bank", "generated", "mixed"]);
export type BlueprintSectionSource = z.infer<typeof blueprintSectionSource>;

/**
 * Papel de una persona dentro de una clase (`section_members.role_in_section`).
 *
 * `assistant` es el profesor de apoyo: ve la clase y el progreso, pero no
 * califica. Sin este tercer valor habría que darle rol de `teacher` completo,
 * que es más permiso del que su trabajo necesita.
 */
export const sectionRole = z.enum(["student", "teacher", "assistant"]);
export type SectionRole = z.infer<typeof sectionRole>;
