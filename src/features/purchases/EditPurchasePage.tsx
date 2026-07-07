import { useParams } from 'react-router-dom';
import { LogPurchasePage } from './LogPurchasePage';

export function EditPurchasePage() {
  const { id = '' } = useParams<{ id: string }>();
  return <LogPurchasePage editingPurchaseId={id} />;
}
