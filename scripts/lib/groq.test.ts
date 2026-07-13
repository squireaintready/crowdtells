import { describe, expect, it } from 'vitest';
import { buildSlots, buildUser, relativeAge, storyWeight, toBriefing, type MarketContext } from './groq';
import { clampText } from './news';
import type { Config } from './config';

const ctx = (over: Partial<MarketContext> = {}): MarketContext => ({
  title: 'Test market',
  category: 'Politics',
  description: '',
  favored: 'Yes',
  oddsPct: 60,
  movement7d: null,
  movement24h: null,
  volume: 0,
  volume24h: 0,
  divergence: null,
  altOddsPct: null,
  altSource: null,
  trajectory: '',
  resolvesInDays: null,
  resolvesOn: null,
  ...over,
});

const base = {
  hook: 'Newsom leads the 2028 Democratic field',
  dek: 'The California governor is the market favorite even as polls show a wide-open race.',
  analysis: 'Newsom is the crowd favorite at {odds} as Democrats look to 2028.',
  background: 'The field has stayed unsettled since the midterms, with several governors testing the waters.',
  whatToWatch: 'Watch the first primary debates and whether any challenger consolidates the center.',
  take: 'We think the market is ahead of the polling here.',
  marketRead: 'The money is more committed than the coverage.',
  crowdVsCoverage: 'ahead',
  consensus: ['The 2028 field is unsettled'],
  disputed: ['Whether Buttigieg is truly surging'],
  perspectives: [{ source: 'Politico', view: 'Frames the race as wide open' }],
  entities: [
    { type: 'person', name: 'Gavin Newsom' },
    { type: 'person', name: 'Pete Buttigieg' },
    { type: 'country', name: 'United States' },
  ],
};

describe('toBriefing', () => {
  it('parses the full article shape (dek, lead, background, what-to-watch, entities)', () => {
    const b = toBriefing(JSON.stringify(base));
    expect(b.dek).toContain('California governor');
    expect(b.analysis).toContain('{odds}'); // tokens preserved for render-time hydration
    expect(b.background).toContain('midterms');
    expect(b.whatToWatch).toContain('debates');
    expect(b.take).toContain('ahead of the polling');
    expect(b.crowdVsCoverage).toBe('ahead');
    expect(b.synthesis.disputed).toEqual(['Whether Buttigieg is truly surging']);
    expect(b.entities).toEqual([
      { type: 'person', name: 'Gavin Newsom' },
      { type: 'person', name: 'Pete Buttigieg' },
      { type: 'country', name: 'United States' },
    ]);
  });

  it('drops badly-typed and duplicate entities', () => {
    const b = toBriefing(
      JSON.stringify({
        ...base,
        entities: [
          { type: 'person', name: 'Gavin Newsom' },
          { type: 'PERSON', name: 'Gavin Newsom' }, // dup (case-insensitive)
          { type: 'celebrity', name: 'Someone' }, // invalid type
          { name: 'No type' }, // missing type
          { type: 'token', name: '' }, // empty name
        ],
      }),
    );
    expect(b.entities).toEqual([{ type: 'person', name: 'Gavin Newsom' }]);
  });

  it('clamps the dek to a sane length and tolerates missing optional fields', () => {
    const longDek = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    const b = toBriefing(
      JSON.stringify({ hook: 'A hook', analysis: 'A lead.', dek: longDek }),
    );
    expect(b.dek.split(/\s+/).length).toBeLessThanOrEqual(32);
    expect(b.background).toBe('');
    expect(b.whatToWatch).toBe('');
    expect(b.entities).toEqual([]);
    expect(b.precedents).toEqual([]);
    expect(b.synthesis.disputed).toEqual([]);
  });

  it('parses precedents, defaulting any non-"high" confidence to low, dropping empties, capping at 3', () => {
    const b = toBriefing(
      JSON.stringify({
        ...base,
        precedents: [
          { fact: 'No sitting governor has won the nomination since 1972', confidence: 'high' },
          { fact: 'Three of the last four winners trailed at this stage', confidence: 'medium' },
          { fact: 'Polls in 2016 showed a similar spread' }, // missing confidence → low
          { fact: '', confidence: 'high' }, // empty fact → dropped
          { fact: 'extra one past the cap', confidence: 'high' },
        ],
      }),
    );
    expect(b.precedents).toEqual([
      { fact: 'No sitting governor has won the nomination since 1972', confidence: 'high' },
      { fact: 'Three of the last four winners trailed at this stage', confidence: 'low' },
      { fact: 'Polls in 2016 showed a similar spread', confidence: 'low' },
    ]);
  });

  it('throws when the model omits the required hook or lead', () => {
    expect(() => toBriefing(JSON.stringify({ hook: '', analysis: 'x' }))).toThrow();
    expect(() => toBriefing(JSON.stringify({ hook: 'x', analysis: '' }))).toThrow();
  });

  it('keeps up to 4 disputed claims (matches the prompt + sibling fields)', () => {
    const b = toBriefing(JSON.stringify({ ...base, disputed: ['a', 'b', 'c', 'd', 'e'] }));
    expect(b.synthesis.disputed).toEqual(['a', 'b', 'c', 'd']);
  });

  it('preserves a lone asterisk in prose (multiplication / "5*million") while stripping bold', () => {
    const b = toBriefing(
      JSON.stringify({
        ...base,
        analysis: 'The fund closed at $5*million, **up** sharply from a year ago.',
      }),
    );
    expect(b.analysis).toContain('$5*million');
    expect(b.analysis).not.toContain('**'); // paired bold markers still removed
  });
});

describe('storyWeight', () => {
  it('rates a quiet, thinly-covered market (score 0) as brief', () => {
    expect(storyWeight(2, ctx({ volume: 50_000 }))).toBe('brief');
    expect(storyWeight(4, ctx({ volume: 500_000 }))).toBe('brief');
  });

  it('rates a moderately-sourced market (score 1-2) as standard', () => {
    expect(storyWeight(5, ctx({ volume: 50_000 }))).toBe('standard'); // 5 outlets (+1)
    expect(storyWeight(2, ctx({ volume: 30_000_000 }))).toBe('standard'); // heavily traded (+2)
  });

  it('rates a heavily-traded, well-covered story as in-depth', () => {
    expect(storyWeight(7, ctx({ volume: 30_000_000 }))).toBe('in-depth');
  });

  it('counts corroboration (peers + cross-platform split) toward in-depth weight', () => {
    // 5 outlets (+1) + actively traded (+1) + a peer (+1) = 3 → in-depth
    expect(
      storyWeight(
        5,
        ctx({ volume: 3_000_000, peers: [{ source: 'Kalshi', favored: 'Yes', oddsPct: 55 }] }),
      ),
    ).toBe('in-depth');
    // a cross-platform split also lifts an otherwise-modest story
    expect(storyWeight(5, ctx({ volume: 3_000_000, divergence: 9 }))).toBe('in-depth');
  });
});

describe('relativeAge', () => {
  const now = Date.parse('2026-06-18T12:00:00Z');
  it('renders minutes, hours, and days', () => {
    expect(relativeAge('2026-06-18T11:30:00Z', now)).toBe('30m ago');
    expect(relativeAge('2026-06-18T06:00:00Z', now)).toBe('6h ago');
    expect(relativeAge('2026-06-15T12:00:00Z', now)).toBe('3d ago');
  });
  it('returns "" for missing, unparseable, or future timestamps', () => {
    expect(relativeAge(null, now)).toBe('');
    expect(relativeAge('not a date', now)).toBe('');
    expect(relativeAge('2026-06-18T13:00:00Z', now)).toBe(''); // future → no tag
  });
});

describe('buildUser — bet proposition surfacing', () => {
  it('states the SPECIFIC outcome + full resolution rule + date for a multi-outcome market', () => {
    const out = buildUser(
      ctx({
        title: 'Highest temperature in LA on Jun 23, 2026?',
        favored: '71° to 72°',
        description: 'Resolves to the daily high recorded at LAX',
        resolvesOn: 'June 23, 2026',
      }),
      [],
      'June 23, 2026',
    );
    expect(out).toContain('71° to 72°'); // the exact band, not vague-d away
    expect(out).toContain('SPECIFIC OUTCOME');
    expect(out).toContain('Resolves to the daily high recorded at LAX'); // full rule reaches the model
    expect(out).toContain('resolves on June 23, 2026'); // absolute date threaded through
  });
  it('does NOT restate a bare Yes/No as a separate proposition line', () => {
    expect(buildUser(ctx({ favored: 'Yes' }), [], 'June 23, 2026')).not.toContain('SPECIFIC OUTCOME');
  });
  it('synthesizes a resolution line when the platform gives no description', () => {
    const out = buildUser(ctx({ title: 'Will X win?', favored: 'X', description: '' }), [], 'June 23, 2026');
    expect(out).toContain('Resolves on:');
    expect(out).toContain('settles to "X"');
  });
});

describe('clampText — resolution-criteria truncation', () => {
  it('returns short text unchanged', () => {
    expect(clampText('Resolves to the LAX daily high.', 700)).toBe('Resolves to the LAX daily high.');
  });
  it('truncates long text on a WORD boundary with an ellipsis', () => {
    const out = clampText('word '.repeat(200).trim(), 100);
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out).toMatch(/word…$/); // complete word + ellipsis, never mid-word
  });
});

describe('buildSlots — multi-provider pool', () => {
  const cfg = (over: Partial<Config> = {}): Config =>
    ({
      geminiKeys: [],
      geminiBase: 'https://gem.test/v1',
      geminiModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      geminiReasoningEffort: 'none',
      groqKeys: [],
      groqBase: 'https://groq.test/v1',
      groqModels: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
      nvidiaKeys: [],
      nvidiaBase: 'https://nv.test/v1',
      nvidiaModels: ['z-ai/glm-5.2', 'meta/llama-3.1-8b-instruct'],
      ...over,
    }) as unknown as Config;

  it('orders Gemini slots before Groq (preference order)', () => {
    const slots = buildSlots(cfg({ geminiKeys: ['g1'], groqKeys: ['q1'] }));
    expect(slots.map((s) => `${s.provider}:${s.model}`)).toEqual([
      'gemini:gemini-2.5-flash',
      'gemini:gemini-2.5-flash-lite',
      'groq:llama-3.3-70b-versatile',
      'groq:openai/gpt-oss-120b',
    ]);
  });

  it('puts Groq first when prefer="groq" (task-aware order for the classifiers)', () => {
    const slots = buildSlots(cfg({ geminiKeys: ['g1'], groqKeys: ['q1'] }), 'groq');
    expect(slots.map((s) => s.provider)).toEqual(['groq', 'groq', 'gemini', 'gemini']);
  });

  it('carries each provider its own base + key; the thinking knob is Gemini-only', () => {
    const slots = buildSlots(cfg({ geminiKeys: ['g1'], groqKeys: ['q1'] }));
    expect(slots[0]).toMatchObject({
      provider: 'gemini',
      base: 'https://gem.test/v1',
      key: 'g1',
      reasoningEffort: 'none',
    });
    const groq = slots.find((s) => s.provider === 'groq')!;
    expect(groq).toMatchObject({ base: 'https://groq.test/v1', key: 'q1' });
    expect(groq.reasoningEffort).toBeUndefined(); // never sent to Groq
  });

  it('expands every model across every key (model outer, key inner)', () => {
    const slots = buildSlots(cfg({ geminiModels: ['m'], geminiKeys: ['g1', 'g2'], groqKeys: [] }));
    expect(slots.map((s) => s.key)).toEqual(['g1', 'g2']);
  });

  it('drops a keyless provider, and is empty when none is configured', () => {
    expect(buildSlots(cfg({ groqKeys: ['q1'] })).every((s) => s.provider === 'groq')).toBe(true);
    expect(buildSlots(cfg())).toEqual([]); // no keys at all → no slots (briefings disabled)
  });

  it('leads with NVIDIA (GLM-5.2) as the primary briefer, then Gemini, then Groq (default order)', () => {
    const slots = buildSlots(cfg({ geminiKeys: ['g1'], groqKeys: ['q1'], nvidiaKeys: ['n1'] }));
    expect(slots.map((s) => s.provider)).toEqual([
      'nvidia',
      'nvidia',
      'gemini',
      'gemini',
      'groq',
      'groq',
    ]);
  });

  it('keeps Groq first for the classifiers, NVIDIA then Gemini behind it (prefer="groq")', () => {
    const slots = buildSlots(
      cfg({ geminiKeys: ['g1'], groqKeys: ['q1'], nvidiaKeys: ['n1'] }),
      'groq',
    );
    expect(slots.map((s) => s.provider)).toEqual([
      'groq',
      'groq',
      'nvidia',
      'nvidia',
      'gemini',
      'gemini',
    ]);
  });

  it('hoists the preferred provider to the front, rest in canonical order', () => {
    const slots = buildSlots(
      cfg({ geminiKeys: ['g1'], groqKeys: ['q1'], nvidiaKeys: ['n1'] }),
      'nvidia',
    );
    expect(slots.map((s) => s.provider)).toEqual([
      'nvidia',
      'nvidia',
      'gemini',
      'gemini',
      'groq',
      'groq',
    ]);
  });

  it('carries NVIDIA its own base + key and never sends the thinking knob', () => {
    const slots = buildSlots(cfg({ nvidiaKeys: ['n1'] }));
    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({
      provider: 'nvidia',
      base: 'https://nv.test/v1',
      key: 'n1',
      model: 'z-ai/glm-5.2',
    });
    expect(slots[0]!.reasoningEffort).toBeUndefined(); // thinking knob is Gemini-only
  });
});
