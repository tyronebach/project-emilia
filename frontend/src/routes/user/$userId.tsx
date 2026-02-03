import { createFileRoute } from '@tanstack/react-router';
import AgentSelection from '../../components/AgentSelection';

export const Route = createFileRoute('/user/$userId')({
  component: AgentSelectionRoute,
});

function AgentSelectionRoute() {
  const { userId } = Route.useParams();
  return <AgentSelection userId={userId} />;
}
