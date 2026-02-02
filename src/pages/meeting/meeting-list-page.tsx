import { useEffect, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { meetingApi } from '@/services/api/meetingApi';
import { useAuthStore } from '@/store/useAuthStore';

interface MeetingSummary {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  timezone?: string;
  inviteCode: string;
}

export function MeetingListPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isAuthenticated) {
      navigate({ to: '/auth/login' });
      return;
    }
    loadMeetings();
  }, [isAuthReady, isAuthenticated, navigate]);

  const loadMeetings = async () => {
    try {
      setLoading(true);
      const response = await meetingApi.getMyMeetings();
      setMeetings(response.data ?? []);
    } catch (error) {
      console.error('Error loading meetings:', error);
      toast.error('약속 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  if (loading) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto py-8">
          <div className="text-center">로딩 중...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-1">내 약속</h1>
            <p className="text-gray-600">내가 만든 약속을 확인하세요.</p>
          </div>
          <Button onClick={() => navigate({ to: '/meeting/create' })}>
            새 약속 만들기
          </Button>
        </div>

        {meetings.length === 0 ? (
          <div className="border border-gray-200 rounded-lg p-10 text-center">
            <p className="text-gray-600 mb-4">
              아직 만든 약속이 없습니다. 새 약속을 만들어보세요!
            </p>
            <Button onClick={() => navigate({ to: '/meeting/create' })}>
              새 약속 만들기
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="border border-gray-200 rounded-lg p-6"
              >
                <h2 className="text-lg font-semibold mb-2">
                  {meeting.title}
                </h2>
                <p className="text-sm text-gray-600">
                  {formatDateTime(meeting.startTime)} -{' '}
                  {formatDateTime(meeting.endTime)}
                </p>
                {meeting.timezone && (
                  <p className="text-xs text-gray-400 mt-1">
                    시간대: {meeting.timezone}
                  </p>
                )}
                {meeting.description && (
                  <p className="text-sm text-gray-500 mt-3 line-clamp-2">
                    {meeting.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-gray-400">
                    초대 코드: {meeting.inviteCode}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate({ to: `/meeting/${meeting.inviteCode}` })
                    }
                  >
                    열기
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
