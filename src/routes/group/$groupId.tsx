import { createFileRoute } from '@tanstack/react-router';

import { GroupDetailPage } from '@/pages';

export const Route = createFileRoute('/group/$groupId')({
  component: GroupDetailPage,
});
