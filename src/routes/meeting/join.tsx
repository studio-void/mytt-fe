import { createFileRoute } from '@tanstack/react-router';

import { JoinMeetingPage } from '@/pages';

export const Route = createFileRoute('/meeting/join')({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === 'string' ? search.code : undefined,
  }),
  component: JoinMeetingPage,
});
