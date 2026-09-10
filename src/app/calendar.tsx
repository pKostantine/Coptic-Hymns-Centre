import CalendarScreen from '@/components/chc/screens/CalendarScreen';

/** Route wrapper — the screen itself lives in components/ so a subdocument modal can also render it in place (see DocumentModal's overlay screens). */
export default function CalendarRoute() {
  return <CalendarScreen />;
}
