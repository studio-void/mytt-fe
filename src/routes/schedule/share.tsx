import { createFileRoute } from '@tanstack/react-router';

import { ShareSchedulePage } from '@/pages/schedule/share-schedule-page';

export const Route = createFileRoute('/schedule/share')({
  component: ShareSchedulePage,
});
