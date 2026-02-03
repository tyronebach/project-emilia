import { createFileRoute } from '@tanstack/react-router';
import App from '../../../App';

export const Route = createFileRoute('/user/$userId/chat/$sessionId')({
  component: ChatRoute,
});

function ChatRoute() {
  const { userId, sessionId } = Route.useParams();
  return <App userId={userId} sessionId={sessionId} />;
}
