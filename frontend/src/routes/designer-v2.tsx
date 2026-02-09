import { createFileRoute } from '@tanstack/react-router';
import DesignerPageV2 from '../components/designer/DesignerPageV2';

export const Route = createFileRoute('/designer-v2')({
  component: DesignerPageV2,
});
