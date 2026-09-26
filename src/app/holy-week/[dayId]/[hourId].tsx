import { Href, useLocalSearchParams } from 'expo-router';

import ServiceDocument from '@/components/chc/screens/ServiceDocument';
import { HOLY_WEEK_HOURS } from '@/constants/manifest';

export default function HolyWeekHourDocument() {
  const { dayId, hourId } = useLocalSearchParams<{ dayId: string; hourId: string }>();
  const hour = HOLY_WEEK_HOURS.find((entry) => entry.id === hourId && entry.dayId === dayId);

  if (!hour) return null;

  return (
    <ServiceDocument
      schema={hour.schema}
      table={hour.table}
      title={hour.title}
      arabic={hour.arabic}
      extraContext={hour.extraContext}
      entryId={hour.id}
      appendHyperlinkKey={hour.nextHyperlinkKey}
      backHref={`/holy-week/${hour.dayId}` as Href}
    />
  );
}
