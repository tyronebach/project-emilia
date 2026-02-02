import { rootRoute } from './routes/__root';
import { route as IndexRoute } from './routes/index';
import { route as AdminRoute } from './routes/admin';
import { route as UserRoute } from './routes/user/$userId';
import { route as ChatRoute } from './routes/user/$userId/chat.$sessionId';

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  AdminRoute,
  UserRoute,
  ChatRoute,
]);
