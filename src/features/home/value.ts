// "Value realization" numbers shown on Home / Capture / Receipt.
// These are ESTIMATES from activity counts, not measurements. Tune the constants with real pilot data.

/** Minutes a manager would have spent per follow-up Muntej sent for them. */
export const MIN_PER_FOLLOWUP = 10;
/** Minutes per status update collected without a meeting/message. */
export const MIN_PER_UPDATE = 5;
/** Loaded hourly cost of a manager's time, SAR. */
export const HOURLY_COST_SAR = 150;

export function hoursSaved(followups: number, updates: number) {
  return (followups * MIN_PER_FOLLOWUP + updates * MIN_PER_UPDATE) / 60;
}

export function sarSaved(hours: number) {
  return Math.round(hours * HOURLY_COST_SAR);
}

/** Per captured task: each planned follow-up the manager no longer sends. */
export function taskSavings(followupSteps: number) {
  const minutes = followupSteps * MIN_PER_FOLLOWUP;
  return { minutes, sar: Math.round((minutes / 60) * HOURLY_COST_SAR), followups: followupSteps };
}

export function formatNumber(n: number, lang: string, fractionDigits = 0) {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(n);
}
