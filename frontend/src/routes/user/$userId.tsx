import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import AvatarSelection from '../../components/AvatarSelection';

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/user/$userId',
  component: AvatarSelectionRoute,
});

function AvatarSelectionRoute() {
  const { userId } = route.useParams();
  return <AvatarSelection userId={userId} />;
}
