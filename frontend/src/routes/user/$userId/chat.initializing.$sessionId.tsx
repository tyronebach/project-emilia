import { createFileRoute } from '@tanstack/react-router';
import InitializingPage from '../../../components/InitializingPage';

export const Route = createFileRoute('/user/$userId/chat/initializing/$sessionId')({
  component: InitializingRoute,
});

function InitializingRoute() {
  const { userId, sessionId } = Route.useParams();
  return <InitializingPage userId={userId} sessionId={sessionId} />;
}
