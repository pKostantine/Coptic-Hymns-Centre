import { Redirect } from 'expo-router';

export default function LegacyMusicSearchRoute() {
  return <Redirect href="/search?scope=music" />;
}
