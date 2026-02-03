import { createFileRoute } from '@tanstack/react-router';
import AdminPanel from '../components/AdminPanel';

export const Route = createFileRoute('/settings')({
  component: AdminPanel,
});
