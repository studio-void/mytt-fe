import { createFileRoute } from '@tanstack/react-router';

import { MeetingListPage } from '@/pages';

export const Route = createFileRoute('/meeting/')({
  component: MeetingListPage,
});
