import { createFileRoute } from '@tanstack/react-router';

import { CalendarPage } from '@/pages';

export const Route = createFileRoute('/schedule/calendar')({
  component: CalendarPage,
});
