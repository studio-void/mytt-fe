import { useEffect, useState } from 'react';

import { useNavigate, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { sharingApi } from '@/services/api/sharingApi';

interface ScheduleEvent {
  id: string;
  title?: string;
  startTime: string;
  endTime: string;
  description?: string;
  location?: string;
  isBusy: boolean;
}

export function ViewSchedulePage() {
  const { userId } = useParams({ strict: false });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<any>(null);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [privacyLevel, setPrivacyLevel] = useState<string>('busy_only');

  useEffect(() => {
    if (!userId) {
      toast.error('유효하지 않은 링크입니다.');
      navigate({ to: '/' });
      return;
    }
    loadSchedule();
  }, [userId]);

  const loadSchedule = async () => {
    try {
      setLoading(true);
      const response = await sharingApi.getUserSchedule(Number(userId));
      setSchedule(response.data);
      setEvents(response.data.events || []);
      setPrivacyLevel(response.data.privacyLevel || 'busy_only');
    } catch (error) {
      console.error('Error loading schedule:', error);
      toast.error('일정을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto py-8">
          <div className="text-center">로딩 중...</div>
        </div>
      </Layout>
    );
  }

  if (!schedule) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto py-8">
          <div className="text-center">일정을 찾을 수 없습니다.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {schedule.userEmail}님의 일정
          </h1>
          <p className="text-gray-600">
            {privacyLevel === 'busy_only' && '바쁜 시간만 표시됩니다'}
            {privacyLevel === 'basic_info' && '기본 정보가 표시됩니다'}
            {privacyLevel === 'full_details' && '전체 정보가 공개됩니다'}
          </p>
        </div>

        {events.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            등록된 일정이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {privacyLevel === 'busy_only' ? (
                      <div className="font-semibold text-gray-700">
                        🔒 바쁜 시간
                      </div>
                    ) : (
                      <div className="font-semibold text-gray-900">
                        {event.title || '(제목 없음)'}
                      </div>
                    )}
                    <div className="text-sm text-gray-600 mt-1">
                      {formatDateTime(event.startTime)} -{' '}
                      {formatTime(event.endTime)}
                    </div>

                    {privacyLevel === 'basic_info' && event.location && (
                      <div className="text-sm text-gray-500 mt-1">
                        📍 {event.location}
                      </div>
                    )}

                    {privacyLevel === 'full_details' && (
                      <>
                        {event.location && (
                          <div className="text-sm text-gray-500 mt-1">
                            📍 {event.location}
                          </div>
                        )}
                        {event.description && (
                          <div className="text-sm text-gray-600 mt-2 p-3 bg-gray-50 rounded">
                            {event.description}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {event.isBusy && (
                    <div className="ml-4 px-3 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                      바쁨
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
