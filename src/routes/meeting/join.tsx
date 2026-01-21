import { createFileRoute } from '@tanstack/react-router';

import { JoinMeetingPage } from '@/pages';

export const Route = createFileRoute('/meeting/join')({
  component: JoinMeetingPage,
});
