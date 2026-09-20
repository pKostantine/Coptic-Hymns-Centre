import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacyUnifiedSearchRoute() {
  const params = useLocalSearchParams<{ scope?: string }>();
  const scope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  return <Redirect href={scope === 'learning' ? '/learn/search' : '/music/search'} />;
}
