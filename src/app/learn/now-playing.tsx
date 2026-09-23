import Head from 'expo-router/head';

import LearningNowPlayingScreen from '@/components/learning/LearningNowPlayingScreen';

export default function LearningNowPlayingRoute() {
  return (
    <>
      <Head><title>Now Playing - Learn & Study</title></Head>
      <LearningNowPlayingScreen />
    </>
  );
}
