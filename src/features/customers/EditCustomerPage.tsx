import { useParams } from 'react-router-dom';
import { AddCustomerPage } from './AddCustomerPage';

export function EditCustomerPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <AddCustomerPage editingCustomerId={id} />;
}
