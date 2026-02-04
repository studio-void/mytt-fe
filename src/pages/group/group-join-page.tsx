import { useEffect, useState } from 'react';

import { useNavigate, useParams } from '@tanstack/react-router';
import { LogIn } from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { groupApi } from '@/services/api/groupApi';
import { useAuthStore } from '@/store/useAuthStore';

interface GroupInfo {
  id: string;
  title: string;
  description?: string | null;
  inviteCode: string;
}

export function GroupJoinPage() {
  const { inviteCode } = useParams({ strict: false });
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [group, setGroup] = useState<GroupInfo | null>(null);

  useEffect(() => {
    if (!inviteCode) {
      toast.error('유효하지 않은 초대 링크입니다.');
      navigate({ to: '/group' });
      return;
    }
    loadGroup();
  }, [inviteCode, navigate]);

  const loadGroup = async () => {
    try {
      setLoading(true);
      const response = await groupApi.getGroupByInviteCode(inviteCode!);
      setGroup(response.data as GroupInfo);
    } catch (error) {
      console.error('Error loading group:', error);
      toast.error('그룹 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!isAuthenticated) {
      toast.error('로그인이 필요합니다.');
      navigate({
        to: '/auth/login',
        search: { redirect: `/group/invite/${inviteCode}` },
      });
      return;
    }
    try {
      setJoining(true);
      const response = await groupApi.joinGroupByInviteCode(inviteCode!);
      toast.success('그룹에 참여했습니다!');
      navigate({ to: `/group/${response.data.groupId}` });
    } catch (error) {
      console.error('Error joining group:', error);
      toast.error('그룹 참여에 실패했습니다.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <Layout disableHeaderHeight>
        <div className="mx-auto py-16">
          <div className="text-center">로딩 중...</div>
        </div>
      </Layout>
    );
  }

  if (!group) {
    return (
      <Layout disableHeaderHeight>
        <div className="mx-auto py-16">
          <div className="text-center">그룹을 찾을 수 없습니다.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout disableHeaderHeight>
      <div className="mx-auto py-16">
        <div className="border border-gray-200 rounded-lg p-6 sm:p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">
            {group.title}
          </h1>
          {group.description && (
            <p className="text-gray-600 mb-6">{group.description}</p>
          )}
          <Button onClick={handleJoin} disabled={joining}>
            <LogIn />
            {joining ? '참여 중...' : '그룹 참여'}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
