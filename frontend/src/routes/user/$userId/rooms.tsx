import { createFileRoute } from '@tanstack/react-router';
import RoomListPage from '../../../components/rooms/RoomListPage';

export const Route = createFileRoute('/user/$userId/rooms')({
  component: RoomsRoute,
});

function RoomsRoute() {
  const { userId } = Route.useParams();
  return <RoomListPage userId={userId} />;
}
