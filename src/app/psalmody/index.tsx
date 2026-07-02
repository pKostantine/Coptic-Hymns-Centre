import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { SERVICES_BY_CATEGORY } from '@/constants/manifest';

export default function PsalmodySubmenu() {
  return <ServiceSubmenu basePath="psalmody" title="Psalmody" arabic="الإبصلمودية" services={SERVICES_BY_CATEGORY.psalmody} backHref="/" />;
}
