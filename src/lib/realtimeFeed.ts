import type { BreakingItem, EventItem, Feed, Market } from './types';
import { hydrateMarket } from './feed';

/**
 * Model B — live feed reads. The SPA paints from the static feed.json (fast,
 * SEO-safe), then this layers Supabase Realtime updates on top: an initial
 * snapshot reconciles the static feed with live data, and postgres_changes
 * stream per-market deltas with no rebuild. supabase-js stays lazy (imported
 * here, never in the first-paint bundle). The merge helpers are pure + tested.
 */

export type FeedChange =
  | { table: 'feed_markets'; kind: 'upsert'; market: Market }
  | { table: 'feed_markets'; kind: 'delete'; id: string }
  | { table: 'feed_meta'; generatedAt: string | null; breaking: BreakingItem[]; events: EventItem[] };

/** Apply one realtime change to the in-memory feed (pure). */
export function applyChange(feed: Feed, change: FeedChange): Feed {
  if (change.table === 'feed_meta') {
    return {
      ...feed,
      generatedAt: change.generatedAt ?? feed.generatedAt,
      breaking: change.breaking,
      events: change.events,
    };
  }
  if (change.kind === 'delete') {
    return { ...feed, markets: feed.markets.filter((m) => m.id !== change.id) };
  }
  const exists = feed.markets.some((m) => m.id === change.market.id);
  const markets = exists
    ? feed.markets.map((m) => (m.id === change.market.id ? change.market : m))
    : [...feed.markets, change.market];
  return { ...feed, markets };
}

/** Build a COMPLETE feed from a full Supabase snapshot — self-sufficient even with
 * no prior feed (so a load race can't drop it); `prev` only supplies fall-back
 * values for fields the snapshot doesn't carry. Pure. */
export function snapshotToFeed(
  rows: { data: Market }[],
  meta: { generated_at: string | null; breaking: BreakingItem[]; events?: EventItem[] } | null,
  prev: Feed | null,
): Feed {
  return {
    generatedAt: meta?.generated_at ?? prev?.generatedAt ?? '',
    version: 1,
    markets: rows.map((r) => hydrateMarket(r.data)),
    breaking: meta?.breaking ?? prev?.breaking ?? [],
    events: meta?.events ?? prev?.events ?? [],
  };
}

type Apply = (updater: (prev: Feed | null) => Feed | null) => void;

/**
 * Subscribe to the live feed: stream per-row deltas, and (re)load a full snapshot
 * on every SUBSCRIBED event — which fires on the initial subscribe AND on every
 * reconnect, so the snapshot both seeds the live feed and recovers any deltas
 * missed while the socket was down. `onLive` fires once a snapshot has populated
 * the feed (so the caller can render even if the static first-paint fetch failed).
 * Returns an unsubscribe fn; a no-op if Supabase isn't configured.
 */
export async function subscribeFeed(apply: Apply, onLive?: () => void): Promise<() => void> {
  const { supabase } = await import('./supabase');
  if (!supabase) return () => {};

  const loadSnapshot = async () => {
    const [markets, meta] = await Promise.all([
      supabase.from('feed_markets').select('data'),
      // `*` (not an explicit column list) so a pre-migration feed_meta that lacks the
      // `events` column still returns generated_at + breaking instead of erroring the
      // whole snapshot — events just fall back to [] until the column is added.
      supabase.from('feed_meta').select('*').eq('id', 'singleton').maybeSingle(),
    ]);
    const rows = markets.data as { data: Market }[] | null;
    if (!rows) return;
    const metaRow = meta.data as
      | { generated_at: string | null; breaking: BreakingItem[]; events?: EventItem[] }
      | null;
    apply((prev) => snapshotToFeed(rows, metaRow, prev));
    onLive?.();
  };

  const channel = supabase
    .channel('modelb-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_markets' }, (p) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as { id?: string }).id; // DELETE carries only the PK (default replica identity)
        if (id) apply((f) => (f ? applyChange(f, { table: 'feed_markets', kind: 'delete', id }) : f));
        return;
      }
      const market = (p.new as { data?: Market }).data;
      if (market) {
        const m = hydrateMarket(market); // same normalization (flags + category) as loadFeed
        apply((f) => (f ? applyChange(f, { table: 'feed_markets', kind: 'upsert', market: m }) : f));
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_meta' }, (p) => {
      const row = p.new as {
        generated_at?: string | null;
        breaking?: BreakingItem[];
        events?: EventItem[];
      };
      apply((f) =>
        f
          ? applyChange(f, {
              table: 'feed_meta',
              generatedAt: row.generated_at ?? null,
              breaking: row.breaking ?? [],
              events: row.events ?? [],
            })
          : f,
      );
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void loadSnapshot();
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
