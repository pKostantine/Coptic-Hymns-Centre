import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { SERVICES_BY_CATEGORY } from '@/constants/manifest';

export default function AgpeyaSubmenu() {
  return <ServiceSubmenu basePath="agpeya" title="Agpeya" arabic="الأجبية" services={SERVICES_BY_CATEGORY.agpeya} backHref="/books" />;
}
