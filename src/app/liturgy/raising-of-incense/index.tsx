import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { RAISING_OF_INCENSE_OPTIONS } from '@/constants/manifest';

export default function RaisingOfIncenseSubmenu() {
  return (
    <ServiceSubmenu
      basePath="liturgy/raising-of-incense"
      title="Raising of Incense"
      arabic="رفع بخور"
      services={RAISING_OF_INCENSE_OPTIONS}
      backHref="/liturgy"
    />
  );
}
