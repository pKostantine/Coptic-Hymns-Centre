import { Href, useLocalSearchParams } from 'expo-router';

import ServiceDocument from '@/components/chc/screens/ServiceDocument';
import { HOLY_WEEK_DAYS, HOLY_WEEK_HOURS } from '@/constants/manifest';

export default function HolyWeekHourDocument() {
  const { dayId, hourId } = useLocalSearchParams<{ dayId: string; hourId: string }>();
  const hour = HOLY_WEEK_HOURS.find((entry) => entry.id === hourId && entry.dayId === dayId);

  if (!hour) return null;

  // A day that is a single service (Bright Saturday) opens straight from the menu, so back returns there.
  const isOnlyService = HOLY_WEEK_DAYS.find((day) => day.id === hour.dayId)?.hours.length === 1;

  return (
    <ServiceDocument
      schema={hour.schema}
      table={hour.table}
      title={hour.title}
      arabic={hour.arabic}
      extraContext={hour.extraContext}
      entryId={hour.id}
      appendHyperlinkKey={hour.nextHyperlinkKey}
      backHref={(isOnlyService ? '/holy-week' : `/holy-week/${hour.dayId}`) as Href}
    />
  );
}
