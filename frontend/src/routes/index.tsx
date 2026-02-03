import { createFileRoute } from '@tanstack/react-router';
import UserSelection from '../components/UserSelection';

export const Route = createFileRoute('/')({
  component: UserSelection,
});
