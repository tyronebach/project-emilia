import { rootRoute } from './routes/__root';
import { route as IndexRoute } from './routes/index';
import { route as ChatRoute } from './routes/chat';
import { route as UserRoute } from './routes/user/$userId';

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  UserRoute,
  ChatRoute,
]);
