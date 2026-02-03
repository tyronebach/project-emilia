import { createFileRoute } from '@tanstack/react-router';
import AvatarDebugPanel from '../components/AvatarDebugPanel';

export const Route = createFileRoute('/debug')({
  component: AvatarDebugPanel,
});
