/**
 * @cet/ui — design system de Cambridge Exam Trainer.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Los tokens NO se exportan desde aqui: son CSS. La aplicacion importa
 * `@cet/ui/tokens.css` una sola vez, en su layout raiz.
 */

/* --- infraestructura --- */
export { cn, type ClassValue } from "./lib/cn.js";
export { LocaleProvider, useLocale, useI18n, type LocaleProviderProps } from "./lib/i18n.js";
export { UI_STRINGS, type UiStringKey } from "./lib/strings.js";
export {
  sanitizeHtml,
  sanitizeSvg,
  sanitizeUrl,
  htmlToPlainText,
  decodeEntities,
  escapeText,
  escapeAttribute,
  tokenizeHtml,
  type SanitizeOptions,
  type HtmlToken,
} from "./lib/sanitize.js";
export { SafeHtml, SafeSvg, type SafeHtmlProps, type SafeSvgProps } from "./lib/safe-html.js";
export { parseSafeHtml } from "./lib/html-to-react.js";
export { fractionToWords, type FractionParts } from "./lib/fraction-words.js";
export { cetPreset, cetThemeLayer, type TailwindPreset } from "./tailwind-preset.js";

/* --- a11y --- */
export { VisuallyHidden, type VisuallyHiddenProps } from "./a11y/VisuallyHidden.js";
export { FocusTrap, type FocusTrapProps } from "./a11y/FocusTrap.js";
export { LiveRegion, type LiveRegionProps, type LiveRegionPoliteness } from "./a11y/LiveRegion.js";
export { SkipLink, type SkipLinkProps } from "./a11y/SkipLink.js";

/* --- primitivas --- */
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./primitives/Button.js";
export { Input, type InputProps } from "./primitives/Input.js";
export { Select, type SelectProps, type SelectOption } from "./primitives/Select.js";
export { Checkbox, type CheckboxProps } from "./primitives/Checkbox.js";
export { RadioGroup, type RadioGroupProps, type RadioOption } from "./primitives/Radio.js";
export { Card, type CardProps } from "./primitives/Card.js";
export { Badge, type BadgeProps, type BadgeTone } from "./primitives/Badge.js";
export { Dialog, type DialogProps } from "./primitives/Dialog.js";
export { Tooltip, TooltipProvider, type TooltipProps, type TooltipProviderProps } from "./primitives/Tooltip.js";
export { Tabs, type TabsProps, type TabItem } from "./primitives/Tabs.js";
export { Accordion, type AccordionProps, type AccordionItem } from "./primitives/Accordion.js";
export { Progress, type ProgressProps } from "./primitives/Progress.js";
export { Alert, type AlertProps, type AlertTone } from "./primitives/Alert.js";
export { Skeleton, type SkeletonProps } from "./primitives/Skeleton.js";
export { Toast, ToastProvider, type ToastProps, type ToastTone } from "./primitives/Toast.js";
export { Table, type TableProps, type TableColumn } from "./primitives/Table.js";
export { Avatar, type AvatarProps, type AvatarSize } from "./primitives/Avatar.js";

/* --- leccion --- */
export {
  LessonBlock,
  type LessonBlockProps,
  type LessonBlockContent,
  type LessonTableRow,
} from "./learning/LessonBlock.js";
// Sale de un modulo SIN "use client" a proposito: lo llama el mapeo de bloques,
// que corre en el servidor. Ver la cabecera de `learning/block-kind.ts`.
export { isRenderableBlockKind, RENDERABLE_BLOCK_KINDS } from "./learning/block-kind.js";
export { RuleBox, type RuleBoxProps } from "./learning/RuleBox.js";
export { ExampleBox, type ExampleBoxProps } from "./learning/ExampleBox.js";
export { TipBox, type TipBoxProps } from "./learning/TipBox.js";
export { WarningBox, type WarningBoxProps } from "./learning/WarningBox.js";
export { StepList, type StepListProps, type Step } from "./learning/StepList.js";
export { FractionText, type FractionTextProps } from "./learning/FractionText.js";
export { MathStem, type MathStemProps } from "./learning/MathStem.js";
// La figura y sus datos van por separado a proposito: `lesson-figure.js` no
// lleva `"use client"` y el mapeo del servidor importa de ahi.
export { LessonFigure, type LessonFigureProps } from "./learning/LessonFigure.js";
export {
  LESSON_FIGURE_COMPONENTS,
  chainConversion,
  chainSteps,
  chainUnits,
  stepFactor,
  figureAltText,
  parseLessonFigure,
  type ChainQuantity,
  type ChainStep,
  type FractionBar,
  type LessonFigure as LessonFigureData,
} from "./learning/lesson-figure.js";

/* --- examen --- */
export { QuestionCard, type QuestionCardProps } from "./exam/QuestionCard.js";
export { ChoiceList, type ChoiceListProps, type Choice } from "./exam/ChoiceList.js";
export { NumericInput, type NumericInputProps } from "./exam/NumericInput.js";
export { FractionInput, type FractionInputProps, type FractionValue } from "./exam/FractionInput.js";
export { OrderingList, type OrderingListProps, type OrderingItem } from "./exam/OrderingList.js";
export { MatchingGrid, type MatchingGridProps, type MatchingSide } from "./exam/MatchingGrid.js";
export {
  ExamTimer,
  formatRemaining,
  phaseFor,
  type ExamTimerProps,
  type TimerPhase,
} from "./exam/ExamTimer.js";
export {
  QuestionNavigator,
  type QuestionNavigatorProps,
  type NavigatorEntry,
  type QuestionState,
} from "./exam/QuestionNavigator.js";
export {
  AutosaveIndicator,
  type AutosaveIndicatorProps,
  type AutosaveState,
} from "./exam/AutosaveIndicator.js";
export { SubmitDialog, type SubmitDialogProps } from "./exam/SubmitDialog.js";

/* --- feedback --- */
export { CorrectFeedback, type CorrectFeedbackProps } from "./feedback/CorrectFeedback.js";
export { IncorrectFeedback, type IncorrectFeedbackProps } from "./feedback/IncorrectFeedback.js";
export { HintPanel, type HintPanelProps } from "./feedback/HintPanel.js";
export { SolutionPanel, type SolutionPanelProps } from "./feedback/SolutionPanel.js";
export { StreakMeter, type StreakMeterProps } from "./feedback/StreakMeter.js";

/* --- datos --- */
export { StatTile, type StatTileProps } from "./data/StatTile.js";
export { ProgressBar, type ProgressBarProps } from "./data/ProgressBar.js";
export { MasteryMeter, type MasteryMeterProps } from "./data/MasteryMeter.js";
// Sale de un modulo SIN "use client" a proposito: lo llama el calculo de
// progreso de practica, que corre en el servidor. Mismo motivo que
// `isRenderableBlockKind`. Ver la cabecera de `data/mastery-level.ts`.
export { masteryLevel, type MasteryLevel } from "./data/mastery-level.js";
export { ScoreRing, type ScoreRingProps } from "./data/ScoreRing.js";
export { EmptyState, type EmptyStateProps } from "./data/EmptyState.js";
export { ErrorState, type ErrorStateProps, type ErrorKind } from "./data/ErrorState.js";

/* --- progreso persistente (grupos de practica) --- */
export {
  MasteryLadder,
  ladderSteps,
  ladderLevelFor,
  MASTERY_STEPS,
  type MasteryLadderProps,
} from "./progress/MasteryLadder.js";
export { EffortMeter, MAX_TARGETS, type EffortMeterProps } from "./progress/EffortMeter.js";

/* --- teclado en pantalla (practica tactil) --- */
export { AnswerKeypad, type AnswerKeypadProps } from "./input/AnswerKeypad.js";
// Sale de un modulo SIN "use client" a proposito: lo recorre un invariante que
// corre en Node contra el registro de generadores. Mismo motivo que
// `isRenderableBlockKind`. Ver la cabecera de `input/keypad-layout.ts`.
export {
  keypadLayoutFor,
  keypadKeys,
  keypadCharacters,
  type KeypadKey,
  type KeypadKind,
  type KeypadLayout,
  type KeypadSpec,
} from "./input/keypad-layout.js";
export { MasteryOverview, type MasteryOverviewProps } from "./progress/MasteryOverview.js";
