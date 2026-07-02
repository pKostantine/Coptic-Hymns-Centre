import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { SERVICES_BY_CATEGORY } from '@/constants/manifest';

export default function LiturgySubmenu() {
  return <ServiceSubmenu categoryId="liturgy" title="Liturgy" arabic="القداس" services={SERVICES_BY_CATEGORY.liturgy} />;
}
