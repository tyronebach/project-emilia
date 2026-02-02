import { createRoute } from '@tanstack/react-router';
import { rootRoute } from '../__root';
import AgentSelection from '../../components/AgentSelection';

export const route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/user/$userId',
  component: AgentSelectionRoute,
});

function AgentSelectionRoute() {
  const { userId } = route.useParams();
  return <AgentSelection userId={userId} />;
}
