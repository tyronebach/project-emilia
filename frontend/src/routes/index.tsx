import { createRoute } from '@tanstack/react-router';
import { rootRoute } from './__root';
import UserSelection from '../components/UserSelection';

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: UserSelection,
});
