import { useLocalSearchParams } from 'expo-router';

import ServiceDocument from '@/components/chc/screens/ServiceDocument';
import { SERVICES_BY_CATEGORY } from '@/constants/manifest';

export default function LectionaryDocument() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const service = SERVICES_BY_CATEGORY.lectionary.find((s) => s.id === serviceId);

  if (!service) return null;

  return (
    <ServiceDocument
      schema={service.schema}
      table={service.table}
      title={service.title}
      arabic={service.arabic}
      extraContext={service.extraContext}
      backHref="/lectionary"
    />
  );
}
