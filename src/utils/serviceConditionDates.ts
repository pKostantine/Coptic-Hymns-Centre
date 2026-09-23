import { addUtcDays } from './dateUtils';

type ExtraContext = Record<string, unknown> | undefined;

interface ServiceWeekdayConditionInput {
  schema: string;
  table: string;
  extraContext?: ExtraContext;
  effectiveDate: Date;
  vespersEffectiveDate: Date;
}

export function isVespersPraisesService(schema: string, table: string): boolean {
  return schema === 'psalmody' && table === 'vespers_praises';
}

export function isVespersWeekdayService(schema: string, table: string, extraContext?: ExtraContext): boolean {
  return (
    (schema === 'liturgy' && table === 'raising_of_incense' && extraContext?.Vespers === true) ||
    (schema === 'liturgy' && table === 'lectionary_vespers')
  );
}

/**
 * Returns a date override for weekday/day-family condition flags only.
 *
 * The main hydration date still supplies feasts, fasts, seasons, Coptic date
 * tokens, and all non-weekday conditions. Vespers Praises is the special case:
 * its weekday condition vocabulary follows the previous liturgical day.
 */
export function getServiceWeekdayConditionDate({
  schema,
  table,
  extraContext,
  effectiveDate,
  vespersEffectiveDate,
}: ServiceWeekdayConditionInput): Date | undefined {
  if (isVespersPraisesService(schema, table)) {
    return addUtcDays(effectiveDate, -1);
  }

  // Sermon Planner mixes all three services in one document. Its hydrator
  // applies this override only to the Vespers rows, not Matins or Liturgy.
  if (schema === 'liturgy' && table === 'sermon_planner') {
    return vespersEffectiveDate;
  }

  if (isVespersWeekdayService(schema, table, extraContext)) {
    return vespersEffectiveDate;
  }

  return undefined;
}
