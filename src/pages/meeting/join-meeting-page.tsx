import { useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { meetingApi } from '@/services/api/meetingApi';

export function JoinMeetingPage() {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inviteCode.trim()) {
      toast.error('초대 코드를 입력해주세요.');
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
    <Layout>
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold mb-2">약속 참여하기</h1>
          <p className="text-gray-600 mb-6">공유받은 초대 코드를 입력하세요</p>

          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
