export type StrictGroundingMode = "off" | "warn-on-weak-evidence" | "require-evidence";

export interface SafetySanitizationOptions {
  sanitizeRetrievedText: boolean;
  stripInstructionalSpans: boolean;
}
