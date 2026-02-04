import { createFileRoute } from '@tanstack/react-router';

import { GroupListPage } from '@/pages';

export const Route = createFileRoute('/group/')({
  component: GroupListPage,
});
