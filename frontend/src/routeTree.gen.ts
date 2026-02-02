import { rootRoute } from './routes/__root';
import { route as IndexRoute } from './routes/index';
import { route as SettingsRoute } from './routes/settings';
import { route as UserRoute } from './routes/user/$userId';
import { route as ChatRoute } from './routes/user/$userId/chat.$sessionId';
import { route as ChatNewRoute } from './routes/user/$userId/chat.new';
import { route as ChatInitializingRoute } from './routes/user/$userId/chat.initializing.$sessionId';

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  SettingsRoute,
  UserRoute,
  ChatRoute,
  ChatNewRoute,
  ChatInitializingRoute,
]);
