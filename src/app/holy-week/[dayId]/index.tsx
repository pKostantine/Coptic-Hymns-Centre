import { useLocalSearchParams } from 'expo-router';

import HolyWeekDay from '@/components/chc/screens/HolyWeekDay';
import { HOLY_WEEK_DAYS } from '@/constants/manifest';

/** A single day or eve: just its own hours. */
export default function HolyWeekDayScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const day = HOLY_WEEK_DAYS.find((entry) => entry.id === dayId);

  if (!day) return null;

  return <HolyWeekDay day={day} />;
}
