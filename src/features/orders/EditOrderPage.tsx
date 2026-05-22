import { useParams } from 'react-router-dom';
import { AddOrderPage } from './AddOrderPage';

export function EditOrderPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <AddOrderPage editingOrderId={id} />;
}
