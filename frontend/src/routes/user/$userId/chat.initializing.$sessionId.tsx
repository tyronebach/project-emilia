import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../../__root';
import { AppProvider } from '../../../context/AppContext';
import InitializingPage from '../../../components/InitializingPage';

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/user/$userId/chat/initializing/$sessionId',
  component: InitializingRoute,
});

function InitializingRoute() {
  const { userId, sessionId } = route.useParams();
  return (
    <AppProvider>
      <InitializingPage userId={userId} sessionId={sessionId} />
    </AppProvider>
  );
}
