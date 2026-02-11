import { TRIGGER_TAXONOMY, type TriggerCategory } from '../types/designer';

export function getCategoryForTrigger(trigger: string): TriggerCategory | null {
  for (const [category, triggers] of Object.entries(TRIGGER_TAXONOMY)) {
    if ((triggers as readonly string[]).includes(trigger)) {
      return category as TriggerCategory;
    }
  }
  return null;
}
