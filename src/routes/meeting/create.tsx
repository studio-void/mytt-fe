import { createFileRoute } from '@tanstack/react-router';

import { CreateMeetingPage } from '@/pages';

export const Route = createFileRoute('/meeting/create')({
  component: CreateMeetingPage,
});
