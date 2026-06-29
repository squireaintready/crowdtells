import type { EventItem } from './types';

/**
 * The count shown on the minimized "Live" wire tab. The full strip also carries
 * context — scheduled games days out, just-finished finals, daily world-events
 * summaries — which are useful inside the panel but make a "Live (N)" badge overcount
 * what's actually current. So the BADGE counts only genuinely-live signal: every
 * developing-news cluster (corroborated in the last few hours, inherently fresh) plus
 * events that are happening now or imminent. Finals and far-future scheduled items
 * stay in the panel but don't inflate the headline number. Pure (caller passes now).
 */
const IMMINENT_MS = 36 * 3_600_000; // a scheduled event within ~1.5 days counts as "live"

export function liveWireCount(
  developingNewsCount: number,
  events: EventItem[],
  nowMs: number,
): number {
  const live = events.filter((e) => {
    if (e.status === 'live') return true;
    if (e.status === 'scheduled') {
      const t = Date.parse(e.startTime);
      return Number.isFinite(t) && t - nowMs <= IMMINENT_MS;
    }
    return false; // 'final' = just-finished context, not live
  }).length;
  return developingNewsCount + live;
}
