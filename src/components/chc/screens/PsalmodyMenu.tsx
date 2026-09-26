import { useRouter } from 'expo-router';

import BookMenuScaffold from './BookMenuScaffold';
import JewelTile from '../ui/JewelTile';
import type { IconName } from '../ui/Icon';
import { getBookTheme } from '../../../constants/bookTheme';
import { bookmarkKeyFor, SERVICES_BY_CATEGORY } from '../../../constants/manifest';
import { useReadingPreferences } from '../../../context/ReadingPreferencesContext';

/**
 * The three praises, in the order they are prayed through the night: each
 * tile takes the colour of its hour — dusk for the Vespers Praises, the deep
 * of night for the Midnight Praises, first light for the Morning Doxology.
 */
const PRAISES: {
  id: string;
  gradient: readonly [string, string, string];
  accent: string;
  icon?: IconName;
  hour: { english: string; arabic: string };
}[] = [
  { id: 'vespers_praises', gradient: ['#3B4A9E', '#1D2560', '#0E1132'], accent: '#C9CFF5', icon: 'sunset', hour: { english: 'Evening', arabic: 'المساء' } },
  { id: 'midnight_praises', gradient: ['#15265E', '#0A1438', '#02050F'], accent: '#9CC9FF', icon: 'moon', hour: { english: 'Midnight', arabic: 'نصف الليل' } },
  { id: 'morning_doxology', gradient: ['#2A6CB0', '#16457E', '#0B2447'], accent: '#FFE3A1', icon: 'sunrise', hour: { english: 'Dawn', arabic: 'الفجر' } },
];

export default function PsalmodyMenu() {
  const router = useRouter();
  const { preferences, isBookmarked } = useReadingPreferences();
  const arabic = preferences.appLanguage === 'ar';
  const services = SERVICES_BY_CATEGORY.psalmody;

  return (
    <BookMenuScaffold
      theme={getBookTheme('psalmody')}
      title={{ english: 'Psalmody', arabic: 'الإبصلمودية' }}
      overline={arabic ? 'التسبحة' : 'THE PRAISES'}
      arabic={arabic}
      backHref="/books"
    >
      {PRAISES.map((praise) => {
        const service = services.find((entry) => entry.id === praise.id);
        if (!service) return null;
        return (
          <JewelTile
            key={praise.id}
            layout="row"
            gradient={praise.gradient}
            accent={praise.accent}
            icon={praise.icon}
            overline={arabic ? praise.hour.arabic : praise.hour.english.toUpperCase()}
            title={arabic ? service.arabic : service.title}
            titleSize={22}
            minHeight={108}
            arabic={arabic}
            outlined={praise.id === 'midnight_praises'}
            bookmarked={isBookmarked(bookmarkKeyFor(service.schema, service.table, service.id))}
            onPress={() => router.push(`/psalmody/${service.id}` as never)}
          />
        );
      })}
    </BookMenuScaffold>
  );
}
