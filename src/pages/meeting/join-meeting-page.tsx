import { useEffect, useState } from 'react';

import { useNavigate, useSearch } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { meetingApi } from '@/services/api/meetingApi';
import { useAuthStore } from '@/store/useAuthStore';

export function JoinMeetingPage() {
  const navigate = useNavigate();
  const { code } = useSearch({ strict: false }) as { code?: string };
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { isAuthenticated, isAuthReady } = useAuthStore();

  useEffect(() => {
    if (!code) return;
    const normalized = code.trim().toUpperCase();
    if (normalized) {
      setInviteCode(normalized);
    }
  }, [code]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteCode.trim()) {
      toast.error('초대 코드를 입력해주세요.');
      return;
    }

    if (!isAuthenticated) {
      toast.error('로그인이 필요합니다.');
      navigate({ to: '/auth/login' });
      return;
    }

    setLoading(true);
    try {
      const response = await meetingApi.joinMeeting(inviteCode);
      toast.success('약속에 참여했습니다!');
      navigate({ to: `/meeting/${response.data.id}` });
    } catch (error) {
      console.error('Error joining meeting:', error);
      toast.error('약속 참여에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout disableHeaderHeight>
      <div className="flex items-center justify-center min-h-screen">
        <div className="rounded-lg p-8 max-w-md w-full">
          <h1 className="text-3xl font-extrabold mb-2">약속 참여하기</h1>
          <p className="text-gray-600 mb-6">공유받은 초대 코드를 입력하세요</p>

          {!isAuthReady ? (
            <p className="text-sm text-gray-500">로그인 상태 확인 중...</p>
          ) : null}

          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                초대 코드
              </label>
              <Input
                type="text"
                placeholder="예: ABC123"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="text-center text-lg tracking-widest"
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading} className="flex-1">
                <Check />
                {loading ? '참여 중...' : '참여하기'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: '/' })}
              >
                취소
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
