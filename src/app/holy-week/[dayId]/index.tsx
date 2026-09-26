import { useLocalSearchParams } from 'expo-router';

import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { HOLY_WEEK_DAYS } from '@/constants/manifest';

export default function HolyWeekDaySubmenu() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const day = HOLY_WEEK_DAYS.find((entry) => entry.id === dayId);

  if (!day) return null;

  return <ServiceSubmenu basePath={`holy-week/${day.id}`} title={day.title} arabic={day.arabic} services={day.hours} backHref="/holy-week" />;
}
