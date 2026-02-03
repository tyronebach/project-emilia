import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import AvatarDebugPanel from '../components/AvatarDebugPanel';

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/debug',
  component: AvatarDebugPanel,
});
