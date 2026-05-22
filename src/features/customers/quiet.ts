export type QuietInput = {
  channel_name: string;
  last_ordered_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
};

export function quietDurationDays(channelName: string, hasOrders: boolean): number {
  const name = channelName.trim().toLowerCase();
  if (name === 'reseller') return 21;
  if (name === 'exhibition') return hasOrders ? 90 : 30;
  // Personal AND any custom channel default to 60d (per spec §8 — custom
  // channels behave like Personal for v1; tuning per-channel is a v2 setting)
  return 60;
}

export function isQuiet(
  input: QuietInput,
  todayDate: string, // YYYY-MM-DD in Asia/Kolkata (todayInTz())
): { isQuiet: boolean; daysSince: number; thresholdDays: number } {
  const hasOrders = input.last_ordered_at !== null;
  const thresholdDays = quietDurationDays(input.channel_name, hasOrders);

  const anchorIso = [input.last_ordered_at, input.last_contacted_at, input.created_at]
    .filter((x): x is string => x !== null)
    .reduce<string>((max, cur) => (cur > max ? cur : max), input.created_at);

  // Reduce the anchor timestamp to its Asia/Kolkata calendar date (midnight IST)
  // so we compare whole days, not partial days. Spec §8 phrases it as
  // "MAX(...) + threshold_days < today" — a date-level inequality.
  const anchorAsIstMs = new Date(anchorIso).getTime() + 5.5 * 60 * 60 * 1000;
  const anchorDayMs = Math.floor(anchorAsIstMs / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000;
  // Treat todayDate as midnight Asia/Kolkata, then shift to "UTC midnight" the
  // same way so the two are on the same axis.
  const todayMs = new Date(`${todayDate}T00:00:00+05:30`).getTime() + 5.5 * 60 * 60 * 1000;
  const daysSince = Math.floor((todayMs - anchorDayMs) / (24 * 60 * 60 * 1000));

  return {
    isQuiet: daysSince > thresholdDays,
    daysSince: Math.max(0, daysSince),
    thresholdDays,
  };
}
