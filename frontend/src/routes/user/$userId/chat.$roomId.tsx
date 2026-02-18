import { createFileRoute } from '@tanstack/react-router';
import App from '../../../App';

export const Route = createFileRoute('/user/$userId/chat/$roomId')({
  component: ChatRoute,
});

function ChatRoute() {
  const { userId, roomId } = Route.useParams();
  return <App userId={userId} roomId={roomId} />;
}
