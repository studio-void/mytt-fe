import { createFileRoute } from '@tanstack/react-router';

import { GoogleCallbackPage } from '@/pages';

export const Route = createFileRoute('/auth/callback')({
  component: GoogleCallbackPage,
});
