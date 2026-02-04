import { createFileRoute } from '@tanstack/react-router';

import { GroupJoinPage } from '@/pages';

export const Route = createFileRoute('/group/invite/$inviteCode')({
  component: GroupJoinPage,
});
