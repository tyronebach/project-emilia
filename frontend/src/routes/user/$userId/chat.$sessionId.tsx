import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../../__root';
import App from '../../../App';

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/user/$userId/chat/$sessionId',
  component: ChatRoute,
});

function ChatRoute() {
  const { userId, sessionId } = route.useParams();
  return <App userId={userId} sessionId={sessionId} />;
}
