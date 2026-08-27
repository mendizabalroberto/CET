/**
 * What the exam API's error codes mean, in English.
 * © 2026 Roberto Mendizabal. All rights reserved.
 *
 * The API never returns prose — it returns a stable `error` code (see
 * `src/lib/exam/errors.ts`). Server messages name tables and constraints, which
 * is a free map of the data model for anyone probing the endpoints; the words a
 * human reads are chosen here instead.
 *
 * WRITTEN FOR AN ELEVEN-YEAR-OLD IN THE MIDDLE OF AN EXAM.
 * Every message answers two questions: what happened, and what do I do now.
 * "409 conflict" answers neither. Nothing here blames the child, and nothing
 * here suggests their work was lost when it wasn't — because it wasn't:
 * `attempt_responses` is append-only and every saved answer is already in the
 * database.
 *
 * This file lives apart from `en.ts` on purpose: `en.ts` is shared by every
 * screen of the app and four agents edit it at once. This one belongs to the
 * exam engine alone.
 */
import type { ExamErrorCode } from "@/lib/exam/errors";

export const examApiEn: Record<ExamErrorCode, string> = {
  unauthenticated: "You have been signed out. Sign in again and your exam will be waiting.",
  forbidden: "This page is for students taking an exam.",
  not_found: "We could not find that exam.",
  invalid_request: "Something went wrong sending your answer. We will try again on our own.",
  window_not_open: "This exam has not opened yet. Come back when your teacher says so.",
  window_closed: "This exam is closed now.",
  max_attempts_reached: "You have used all your attempts at this exam.",
  deadline_passed: "Time is up. Your exam has been handed in with everything you answered.",
  attempt_not_in_progress: "This exam has already been handed in.",
  attempt_not_submitted: "This exam has not been handed in yet, so there is no result to show.",
  insufficient_pool: "This exam is not ready yet. Tell your teacher — it is not your fault.",
  blueprint_invalid: "This exam is not set up correctly. Tell your teacher — it is not your fault.",
  attempt_starting: "Your exam is still opening. Give it a moment and try again.",
  rate_limited: "That was a lot of clicks. Wait a moment and try again.",
  internal: "We could not save that. Keep going — we will try again on our own.",
};

/** Fallback for a code this build does not know about yet. */
export const examApiFallbackEn = "Something went wrong. Keep going — we will try again on our own.";
