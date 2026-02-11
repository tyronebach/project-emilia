import { createFileRoute } from '@tanstack/react-router';
import RoomChatPage from '../../../components/rooms/RoomChatPage';

export const Route = createFileRoute('/user/$userId/rooms/$roomId')({
  component: RoomChatRoute,
});

function RoomChatRoute() {
  const { userId, roomId } = Route.useParams();
  return <RoomChatPage userId={userId} roomId={roomId} />;
}
