import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { SERVICES_BY_CATEGORY } from '@/constants/manifest';

export default function HolyWeekSubmenu() {
  return <ServiceSubmenu basePath="holy-week" title="Holy Week" arabic="أسبوع الآلام" services={SERVICES_BY_CATEGORY['holy-week']} backHref="/books" />;
}
