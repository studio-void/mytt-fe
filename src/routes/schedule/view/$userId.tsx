import { createFileRoute } from '@tanstack/react-router';

import { ViewSchedulePage } from '@/pages/schedule/view-schedule-page';

export const Route = createFileRoute('/schedule/view/$userId')({
  component: ViewSchedulePage,
});
