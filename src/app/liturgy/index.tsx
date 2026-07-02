import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { LITURGY_GROUPS } from '@/constants/manifest';

export default function LiturgySubmenu() {
  return <ServiceSubmenu basePath="liturgy" title="Liturgy" arabic="القداس" services={LITURGY_GROUPS} backHref="/" />;
}
