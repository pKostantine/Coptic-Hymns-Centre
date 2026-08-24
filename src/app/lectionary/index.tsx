import ServiceSubmenu from '@/components/chc/screens/ServiceSubmenu';
import { SERVICES_BY_CATEGORY } from '@/constants/manifest';

export default function LectionarySubmenu() {
  return (
    <ServiceSubmenu
      basePath="lectionary"
      title="Lectionary"
      arabic="القطمارس"
      services={SERVICES_BY_CATEGORY.lectionary}
      backHref="/"
    />
  );
}
