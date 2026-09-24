import { Redirect } from 'expo-router';

// The website has no download/offline-management route or controls.
export default function DownloadsWebRoute() { return <Redirect href={'/account' as any} />; }
