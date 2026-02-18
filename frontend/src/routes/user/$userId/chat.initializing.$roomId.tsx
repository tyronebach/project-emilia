import { createFileRoute } from '@tanstack/react-router';
import InitializingPage from '../../../components/InitializingPage';

export const Route = createFileRoute('/user/$userId/chat/initializing/$roomId')({
  component: InitializingRoute,
});

function InitializingRoute() {
  const { userId, roomId } = Route.useParams();
  return <InitializingPage userId={userId} roomId={roomId} />;
}
