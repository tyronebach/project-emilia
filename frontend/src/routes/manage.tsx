import { createFileRoute } from '@tanstack/react-router';
import AdminPanel from '../components/AdminPanel';

export const Route = createFileRoute('/manage')({
  component: AdminPanel,
});
