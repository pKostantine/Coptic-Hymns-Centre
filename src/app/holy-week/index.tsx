import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { HOLY_WEEK_DAYS } from '@/constants/manifest';

/** Holy Week opens on its days; each day lists its hours (see HOLY_WEEK_DAYS). */
export default function HolyWeekSubmenu() {
  return <ServiceSubmenu basePath="holy-week" title="Holy Week" arabic="أسبوع الآلام" services={HOLY_WEEK_DAYS} backHref="/books" />;
}
