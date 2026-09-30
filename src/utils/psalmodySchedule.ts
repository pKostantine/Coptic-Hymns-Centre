export type PraiseId = 'vespers_praises' | 'midnight_praises' | 'morning_doxology';

/** When a praise is prayed, told from where the reader is in the day. */
export type PraiseWhen = 'now' | 'this-morning' | 'this-evening' | 'tonight' | 'at-dawn';

export interface PraiseMoment {
  id: PraiseId;
  when: PraiseWhen;
  /** The Midnight Praises sing the Theotokia of the day they begin (0 = Sunday). */
  theotokiaWeekday?: number;
}

/**
 * The praise to pray next, and the one after it, at a clock hour on a
 * weekday (0 = Sunday). The three follow one another round the day: the
 * Morning Doxology at dawn, the Vespers Praises in the evening, the Midnight
 * Praises in the night. The Midnight Praises open the next day, so they sing
 * its Theotokia — Wednesday night's are Thursday's.
 */
export function praisesUpNext(clockHour: number, weekday: number): { next: PraiseMoment; then: PraiseMoment } {
  if (clockHour < 4) {
    return {
      next: { id: 'midnight_praises', when: 'now', theotokiaWeekday: weekday },
      then: { id: 'morning_doxology', when: 'at-dawn' },
    };
  }
  if (clockHour < 12) {
    return {
      next: { id: 'morning_doxology', when: 'this-morning' },
      then: { id: 'vespers_praises', when: 'this-evening' },
    };
  }
  if (clockHour < 19) {
    return {
      next: { id: 'vespers_praises', when: 'this-evening' },
      then: { id: 'midnight_praises', when: 'tonight', theotokiaWeekday: (weekday + 1) % 7 },
    };
  }
  return {
    next: { id: 'midnight_praises', when: 'tonight', theotokiaWeekday: (weekday + 1) % 7 },
    then: { id: 'morning_doxology', when: 'at-dawn' },
  };
}
