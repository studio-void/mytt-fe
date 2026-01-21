import { useEffect, useState } from 'react';

import { useNavigate, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { calendarApi } from '@/services/api/calendarApi';
import { meetingApi } from '@/services/api/meetingApi';
import { useAuthStore } from '@/store/useAuthStore';

interface TimeSlot {
  startTime: string;
  endTime: string;
  availableCount: number;
  availability: number;
  isOptimal: boolean;
}

interface BusySlot {
  userId: number;
  startTime: string;
  endTime: string;
}

export function MeetingJoinPage() {
  const { inviteCode } = useParams({ strict: false });
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [meeting, setMeeting] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<TimeSlot[]>([]);
  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    if (!inviteCode) {
      toast.error('유효하지 않은 초대 링크입니다.');
      navigate({ to: '/' });
      return;
    }

    loadMeetingData();
  }, [inviteCode, isAuthenticated]);

  const loadMeetingData = async () => {
    try {
      setLoading(true);

      // 미팅 정보 조회
      const meetingResponse = await meetingApi.getMeetingByCode(inviteCode!);
      setMeeting(meetingResponse.data);

      if (isAuthenticated) {
        // 참가자 정보 조회
        const participantsResponse = await meetingApi.getMeetingParticipants(
          inviteCode!,
        );
        setParticipants(participantsResponse.data);

        // 가용성 정보 조회
        const availabilityResponse = await meetingApi.getMeetingAvailability(
          inviteCode!,
        );
        setBusySlots(availabilityResponse.data.busySlots);
        setAvailabilitySlots(availabilityResponse.data.availabilitySlots);
      }
    } catch (error) {
      console.error('Error loading meeting:', error);
      toast.error('약속 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinMeeting = async () => {
    if (!isAuthenticated) {
      toast.error('로그인이 필요합니다.');
      navigate({
        to: '/auth/login',
        search: { redirect: `/meeting/${inviteCode}` },
      });
      return;
    }

    try {
      setJoining(true);

      // 캘린더 동기화
      const syncResponse = await calendarApi.syncCalendar();

      if (syncResponse.error) {
        toast.error(`캘린더 동기화 실패: ${syncResponse.error}`);
        setJoining(false);
        return;
      }

      // 미팅 참여
      await meetingApi.joinMeetingByCode(inviteCode!);

      toast.success('약속에 참여했습니다!');
      setHasJoined(true);

      // 데이터 새로고침
      await loadMeetingData();
    } catch (error) {
      console.error('Error joining meeting:', error);
      toast.error('약속 참여에 실패했습니다.');
    } finally {
      setJoining(false);
    }
  };

  const copyInviteLink = () => {
    const shareUrl = `${window.location.origin}/meeting/${inviteCode}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('초대 링크가 복사되었습니다!');
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center">로딩 중...</div>
        </div>
      </Layout>
    );
  }

  if (!meeting) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center">약속을 찾을 수 없습니다.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 미팅 정보 */}
        <div className="border border-gray-200 rounded-lg p-8 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{meeting.title}</h1>
              {meeting.description && (
                <p className="text-gray-600 mb-4">{meeting.description}</p>
              )}
              <div className="text-sm text-gray-500">
                <p>
                  기간: {formatDate(meeting.startTime)} -{' '}
                  {formatDate(meeting.endTime)}
                </p>
                <p>시간대: {meeting.timezone}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={copyInviteLink} variant="outline">
                링크 복사
              </Button>
              {!hasJoined && isAuthenticated && (
                <Button onClick={handleJoinMeeting} disabled={joining}>
                  {joining ? '참여 중...' : '약속 참여'}
                </Button>
              )}
              {!isAuthenticated && (
                <Button onClick={() => navigate({ to: '/auth/login' })}>
                  로그인하여 참여
                </Button>
              )}
            </div>
          </div>

          {/* 참가자 목록 */}
          {participants.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h2 className="text-lg font-semibold mb-3">
                참가자 ({participants.length}명)
              </h2>
              <div className="flex flex-wrap gap-2">
                {participants.map((participant, index) => (
                  <div
                    key={index}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {participant.email}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 가용성 시각화 */}
        {isAuthenticated && availabilitySlots.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-8">
            <h2 className="text-2xl font-bold mb-6">최적의 시간 찾기</h2>

            {/* 최적 시간대 추천 */}
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-2">
                ⭐ 추천 시간대 (모든 참가자가 가능한 시간)
              </h3>
              <div className="space-y-2">
                {availabilitySlots
                  .filter((slot) => slot.isOptimal)
                  .slice(0, 5)
                  .map((slot, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-white rounded border border-green-300"
                    >
                      <span className="font-medium">
                        {formatDate(slot.startTime)}{' '}
                        {formatTime(slot.startTime)} -{' '}
                        {formatTime(slot.endTime)}
                      </span>
                      <span className="text-green-600 font-semibold">
                        ✓ 모두 가능
                      </span>
                    </div>
                  ))}
                {availabilitySlots.filter((slot) => slot.isOptimal).length ===
                  0 && (
                  <p className="text-gray-500">
                    모든 참가자가 가능한 시간이 없습니다.
                  </p>
                )}
              </div>
            </div>

            {/* 시간대별 가용성 */}
            <div>
              <h3 className="font-semibold mb-4">시간대별 가용성</h3>
              <div className="space-y-2">
                {availabilitySlots.slice(0, 20).map((slot, index) => {
                  const availabilityPercent = Math.round(
                    slot.availability * 100,
                  );
                  let bgColor = 'bg-red-100';
                  let textColor = 'text-red-800';

                  if (availabilityPercent === 100) {
                    bgColor = 'bg-green-100';
                    textColor = 'text-green-800';
                  } else if (availabilityPercent >= 70) {
                    bgColor = 'bg-yellow-100';
                    textColor = 'text-yellow-800';
                  }

                  return (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded ${bgColor}`}
                    >
                      <span className="font-medium">
                        {formatDate(slot.startTime)}{' '}
                        {formatTime(slot.startTime)} -{' '}
                        {formatTime(slot.endTime)}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className={textColor}>
                          {slot.availableCount}/{participants.length}명 가능
                        </span>
                        <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              availabilityPercent === 100
                                ? 'bg-green-500'
                                : availabilityPercent >= 70
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${availabilityPercent}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold">
                          {availabilityPercent}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {!isAuthenticated && (
          <div className="border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-600 mb-4">
              로그인하여 일정을 연동하고 최적의 시간을 확인하세요.
            </p>
            <Button onClick={() => navigate({ to: '/auth/login' })}>
              Google 계정으로 로그인
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
