import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import AdminPanel from '../components/AdminPanel';

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: AdminPanel,
});
