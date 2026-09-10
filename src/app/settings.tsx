import SettingsScreen from '@/components/chc/screens/SettingsScreen';

/** Route wrapper — the screen itself lives in components/ so a subdocument modal can also render it in place (see DocumentModal's overlay screens). */
export default function SettingsRoute() {
  return <SettingsScreen />;
}
