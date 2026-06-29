import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { diffEarns, type StandingSnapshot } from '../lib/standingStore';
import { getStandingBreadcrumb, setStandingBreadcrumb } from '../lib/standingBreadcrumb';
import { badgeTone } from '../components/standing/medallionTone';
import { Medallion } from '../components/standing/Medallion';
import { StandingChip } from '../components/account/StandingChip';

const snap = (over: Partial<StandingSnapshot> = {}): StandingSnapshot => ({
  level: 3,
  title: 'Caller',
  tier: 'reader',
  merit: 80,
  progress: 0.5,
  badges: [],
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  setStandingBreadcrumb(null); // reset the module singleton between tests
});

describe('diffEarns — when to celebrate', () => {
  it('celebrates nothing on first sight, just records the baseline', () => {
    expect(diffEarns('u', snap({ level: 4, badges: ['first_call'] }))).toEqual([]);
    expect(diffEarns('u', snap({ level: 4, badges: ['first_call'] }))).toEqual([]);
  });
  it('emits a level earn when the level rises', () => {
    diffEarns('u', snap({ level: 3 }));
    const earns = diffEarns('u', snap({ level: 4, title: 'Contributor' }));
    expect(earns).toHaveLength(1);
    expect(earns[0]!.kind).toBe('level');
    expect(earns[0]!.label).toBe('Contributor');
    expect(earns[0]!.level).toBe(4);
  });
  it('emits a badge earn for a newly-held badge (carrying its id for the tone)', () => {
    diffEarns('u', snap({ badges: ['first_call'] }));
    const earns = diffEarns('u', snap({ badges: ['first_call', 'sharp'] }));
    expect(earns).toHaveLength(1);
    expect(earns[0]!.kind).toBe('badge');
    expect(earns[0]!.badgeId).toBe('sharp');
  });
  it('never rubs in a level drop (decay)', () => {
    diffEarns('u', snap({ level: 5 }));
    expect(diffEarns('u', snap({ level: 4 }))).toEqual([]);
  });
  it('keys the baseline per user', () => {
    diffEarns('a', snap({ badges: ['first_call'] }));
    expect(diffEarns('b', snap({ badges: ['first_call'] }))).toEqual([]);
  });
});

describe('badgeTone', () => {
  it('reads accuracy/top-tier as gold, helpfulness as ink, milestones as bronze', () => {
    expect(badgeTone('sharp')).toBe('gold');
    expect(badgeTone('steward')).toBe('gold');
    expect(badgeTone('bridge_builder')).toBe('ink');
    expect(badgeTone('first_call')).toBe('bronze');
    expect(badgeTone('unknown')).toBe('ink');
  });
});

describe('standing breadcrumb', () => {
  it('round-trips level + tier and clears', () => {
    setStandingBreadcrumb({ level: 5, tier: 'contributor' });
    expect(getStandingBreadcrumb()).toEqual({ level: 5, tier: 'contributor' });
    setStandingBreadcrumb(null);
    expect(getStandingBreadcrumb()).toBeNull();
  });
});

describe('Medallion + StandingChip render', () => {
  it('renders the badge mark', () => {
    render(<Medallion mark="★" tone="gold" />);
    expect(screen.getByText('★')).toBeTruthy();
  });
  it('shows the level once the crumb is set, and nothing without it', () => {
    const { container, rerender } = render(<StandingChip />);
    expect(container.firstChild).toBeNull();
    setStandingBreadcrumb({ level: 4, tier: 'contributor' });
    rerender(<StandingChip />);
    expect(screen.getByText('4')).toBeTruthy();
  });
});
