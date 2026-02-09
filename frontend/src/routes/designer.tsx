import { createFileRoute } from '@tanstack/react-router';
import DesignerPage from '../components/designer/DesignerPage';

export const Route = createFileRoute('/designer')({
  component: DesignerPage,
});
