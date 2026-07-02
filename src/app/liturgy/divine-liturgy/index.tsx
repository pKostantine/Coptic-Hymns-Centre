import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { DIVINE_LITURGY_SERVICES } from '@/constants/manifest';

export default function DivineLiturgySubmenu() {
  return (
    <ServiceSubmenu
      basePath="liturgy/divine-liturgy"
      title="The Divine Liturgy"
      arabic="القداس الإلهي"
      services={DIVINE_LITURGY_SERVICES}
      backHref="/liturgy"
    />
  );
}
