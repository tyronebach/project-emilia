import { createFileRoute } from '@tanstack/react-router';
import NewChatPage from '../../../components/NewChatPage';

export const Route = createFileRoute('/user/$userId/chat/new')({
  component: NewChatRoute,
});

function NewChatRoute() {
  const { userId } = Route.useParams();
  return <NewChatPage userId={userId} />;
}
