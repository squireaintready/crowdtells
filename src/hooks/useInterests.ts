import { reopenOnboarding, saveInterests, useInterestsState } from '../lib/interests';

export interface Interests {
  /** Followed-topic categories; empty = no personalization. */
  topics: string[];
  /** Whether the reader has seen the intro topic picker. */
  onboarded: boolean;
  /** Persist a new topic selection (also marks onboarding complete). */
  save: (topics: string[]) => void;
  /** Re-open the topic picker (keeps current selection). */
  edit: () => void;
}

/**
 * Reading interests, backed by the shared module store in src/lib/interests.ts
 * (so the cloud-sync engine and every component see one source of truth). The
 * interface is unchanged from the old localStorage-only hook.
 */
export function useInterests(): Interests {
  const { topics, onboarded } = useInterestsState();
  return { topics, onboarded, save: saveInterests, edit: reopenOnboarding };
}
