import { useLocalSearchParams } from 'expo-router';

import ServiceDocument from '@/components/chc/screens/ServiceDocument';
import { DIVINE_LITURGY_SERVICES } from '@/constants/manifest';

export default function DivineLiturgyDocument() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const service = DIVINE_LITURGY_SERVICES.find((s) => s.id === serviceId);

  if (!service) return null;

  return (
    <ServiceDocument
      schema={service.schema}
      table={service.table}
      title={service.title}
      arabic={service.arabic}
      entryId={service.id}
      backHref="/liturgy/divine-liturgy"
    />
  );
}
