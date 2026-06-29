export type MedallionTone = 'gold' | 'ink' | 'bronze';

/** Visual rarity per badge — frontend-only (keeps gamify.ts's data contract clean). Accuracy +
 * the top tier read as gold; helpfulness/verification as ink; milestones as bronze. */
const TONE: Record<string, MedallionTone> = {
  sharp: 'gold',
  sharp_ii: 'gold',
  sharp_iii: 'gold',
  calibrated: 'gold',
  called_it: 'gold',
  steward: 'gold',
  contributor: 'ink',
  corrected_the_record: 'ink',
  bridge_builder: 'ink',
  fact_checker: 'ink',
  founding_reader: 'ink',
  first_call: 'bronze',
  on_a_roll: 'bronze',
  devoted: 'bronze',
  stalwart: 'bronze',
};

export function badgeTone(id: string): MedallionTone {
  return TONE[id] ?? 'ink';
}
