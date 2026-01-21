import { createFileRoute } from '@tanstack/react-router';

import { MeetingJoinPage } from '@/pages/meeting/meeting-join-page';

export const Route = createFileRoute('/meeting/$inviteCode')({
  component: MeetingJoinPage,
});
