import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEngagementGate } from '../hooks/useEngagementGate';

const setWin = (prop: 'innerHeight' | 'scrollY', value: number) =>
  Object.defineProperty(window, prop, { value, configurable: true, writable: true });

afterEach(() => {
  vi.useRealTimers();
  setWin('scrollY', 0);
});

describe('useEngagementGate', () => {
  it('holds false on load, then latches true after a quiet dwell', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEngagementGate(true, 10_000));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toBe(true);
  });

  it('engages as soon as the reader scrolls past the fold', () => {
    vi.useFakeTimers();
    setWin('innerHeight', 800);
    const { result } = renderHook(() => useEngagementGate(true));
    act(() => {
      setWin('scrollY', 700); // > 0.8 * 800 = 640
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(true);
  });

  it('a small scroll re-arms the dwell rather than firing early', () => {
    vi.useFakeTimers();
    setWin('innerHeight', 800);
    const { result } = renderHook(() => useEngagementGate(true, 10_000));
    act(() => {
      vi.advanceTimersByTime(8_000);
      setWin('scrollY', 100); // below the fold threshold → re-arms the dwell
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(8_000); // only 8s since the re-arm
    });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(3_000)); // now past 10s since the re-arm
    expect(result.current).toBe(true);
  });

  it('does nothing while inactive', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEngagementGate(false));
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current).toBe(false);
  });
});
