import { useLocalSearchParams } from 'expo-router';

import ServiceDocument from '@/components/chc/screens/ServiceDocument';
import { RAISING_OF_INCENSE_OPTIONS } from '@/constants/manifest';

export default function RaisingOfIncenseDocument() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const option = RAISING_OF_INCENSE_OPTIONS.find((o) => o.id === serviceId);

  if (!option) return null;

  return (
    <ServiceDocument
      schema={option.schema}
      table={option.table}
      title={option.title}
      arabic={option.arabic}
      extraContext={option.extraContext}
      entryId={option.id}
      backHref="/liturgy/raising-of-incense"
    />
  );
}
