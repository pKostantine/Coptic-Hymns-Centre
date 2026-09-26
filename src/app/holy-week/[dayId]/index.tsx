import { useLocalSearchParams } from 'expo-router';

import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { HOLY_WEEK_DAYS } from '@/constants/manifest';

/** A single day or eve: just its own hours, listed by their short names ("First Hour"). */
export default function HolyWeekDaySubmenu() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const day = HOLY_WEEK_DAYS.find((entry) => entry.id === dayId);

  if (!day) return null;

  const hours = day.hours.map((hour) => ({ ...hour, title: hour.shortTitle, arabic: hour.shortArabic }));
  return <ServiceSubmenu basePath={`holy-week/${day.id}`} title={day.title} arabic={day.arabic} services={hours} backHref="/holy-week" />;
}
