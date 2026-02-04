import { useEffect, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { Crown, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { groupApi, type GroupRole } from '@/services/api/groupApi';
import { useAuthStore } from '@/store/useAuthStore';

interface GroupSummary {
  id: string;
  title: string;
  description?: string | null;
  inviteCode: string;
  masterUid: string;
  createdAt?: string | null;
  role: GroupRole;
}

const roleLabel: Record<GroupRole, string> = {
  master: '마스터',
  manager: '매니저',
  member: '멤버',
};

const roleCrownColor: Record<GroupRole, string> = {
  master: 'text-amber-500',
  manager: 'text-gray-400',
  member: 'text-transparent',
};

export function GroupListPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '' });

  useEffect(() => {
    if (isAuthReady && !isAuthenticated) {
      navigate({ to: '/auth/login' });
      return;
    }
    if (isAuthenticated) {
      loadGroups();
    }
  }, [isAuthenticated, isAuthReady, navigate]);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const response = await groupApi.getMyGroups();
      setGroups((response.data ?? []) as GroupSummary[]);
    } catch (error) {
      console.error('Error loading groups:', error);
      toast.error('그룹을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.title.trim()) {
      toast.error('그룹 이름을 입력해주세요.');
      return;
    }
    try {
      setCreating(true);
      await groupApi.createGroup({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
      });
      toast.success('그룹이 생성되었습니다.');
      setFormData({ title: '', description: '' });
      await loadGroups();
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('그룹 생성에 실패했습니다.');
    } finally {
      setCreating(false);
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

  return (
    <Layout disableHeaderHeight>
      <div className="mx-auto py-12 sm:py-16">
        <div className="flex flex-col gap-4 mb-8">
          <h1 className="text-3xl font-extrabold">내 그룹</h1>
          <p className="text-gray-600">
            그룹을 생성하고, 관리하거나 참여 중인 그룹을 확인하세요.
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-5 sm:p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">새 그룹 만들기</h2>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                그룹 이름
              </label>
              <Input
                name="title"
                value={formData.title}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    title: event.target.value,
                  }))
                }
                placeholder="예: 운영팀"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">설명</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-md bg-white"
                rows={3}
                placeholder="그룹 설명을 입력하세요"
              />
            </div>
            <Button type="submit" disabled={creating}>
              <Plus />
              {creating ? '생성 중...' : '그룹 만들기'}
            </Button>
          </form>
        </div>

        {groups.length === 0 ? (
          <div className="border border-gray-200 rounded-lg p-10 text-center text-gray-500">
            아직 참여 중인 그룹이 없습니다.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {groups.map((group) => (
              <div
                key={group.id}
                className="border border-gray-200 rounded-lg p-6 bg-white"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{group.title}</h3>
                      {group.role !== 'member' && (
                        <Crown
                          className={`h-4 w-4 ${roleCrownColor[group.role]}`}
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      내 역할: {roleLabel[group.role]}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate({ to: `/group/${group.id}` })
                    }
                  >
                    관리하기
                  </Button>
                </div>
                {group.description && (
                  <p className="text-sm text-gray-600 mt-3">
                    {group.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
