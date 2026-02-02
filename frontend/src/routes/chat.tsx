import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import App from '../App';

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: App,
});
