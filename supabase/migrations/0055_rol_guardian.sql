-- =============================================================================
-- 0055_rol_guardian.sql — nuevo rol `guardian`
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
-- Contrato: packages/shared/src/enums.ts
-- =============================================================================
-- La refundación de la tenencia introduce al tutor (`guardian`) como rol del
-- sistema. Se apenda al FINAL del enum `public.user_role` a propósito: en
-- Postgres el orden de declaración de un enum ES su orden de comparación, y
-- reordenar los miembros existentes cambiaría el significado de cualquier
-- `order by` ya escrito. `alter type ... add value` sin `before`/`after` es la
-- única forma de ampliar un enum sin tocar el `create type` original.
-- =============================================================================

alter type public.user_role add value if not exists 'guardian';
