import { Redirect } from 'expo-router';

export default function LegacyLearningSearchRoute() {
  return <Redirect href="/search?scope=learning" />;
}
