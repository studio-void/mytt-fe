import { createFileRoute } from '@tanstack/react-router';

import { ViewSchedulePage } from '@/pages';

export const Route = createFileRoute('/schedule/view/$uid/$id')({
  component: ViewSchedulePage,
});
