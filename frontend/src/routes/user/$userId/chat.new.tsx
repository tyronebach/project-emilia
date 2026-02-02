import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../../__root';
import NewChatPage from '../../../components/NewChatPage';

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/user/$userId/chat/new',
  component: NewChatRoute,
});

function NewChatRoute() {
  const { userId } = route.useParams();
  return <NewChatPage userId={userId} />;
}
