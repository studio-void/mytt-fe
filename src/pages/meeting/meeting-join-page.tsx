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

interface TimeBlock {
  startTime: string;
  endTime: string;
}

export function MeetingJoinPage() {
  const { inviteCode } = useParams({ strict: false });
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [savingBlocks, setSavingBlocks] = useState(false);
  const [meeting, setMeeting] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<TimeSlot[]>([]);
  const [hasJoined, setHasJoined] = useState(false);
  const [manualBlocks, setManualBlocks] = useState<TimeBlock[]>([]);
  const [blockStart, setBlockStart] = useState('');
  const [blockEnd, setBlockEnd] = useState('');

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

      if (!isAuthenticated) {
        setParticipants([]);
        setAvailabilitySlots([]);
        setHasJoined(false);
        setManualBlocks([]);
        return;
      }

      if (isAuthenticated) {
        // 참가자 정보 조회
        const participantsResponse = await meetingApi.getMeetingParticipants(
          inviteCode!,
        );
        setParticipants(participantsResponse.data);
        const joined = participantsResponse.data.some(
          (participant: { uid?: string }) => participant.uid === user?.uid,
        );
        setHasJoined(joined);

        // 가용성 정보 조회
        const availabilityResponse = await meetingApi.getMeetingAvailability(
          inviteCode!,
        );
        setAvailabilitySlots(availabilityResponse.data.availabilitySlots);

        if (joined && meetingResponse.data?.id) {
          const myAvailability = await meetingApi.getMyAvailability(
            meetingResponse.data.id,
          );
          setManualBlocks(myAvailability.data?.manualBlocks ?? []);
        }
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
      const syncResponse = meeting
        ? await calendarApi.syncCalendar(
            new Date(meeting.startTime),
            new Date(meeting.endTime),
          )
        : await calendarApi.syncCalendar();

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

  const handleAddBlock = () => {
    if (!blockStart || !blockEnd) {
      toast.error('시작/종료 시간을 선택해주세요.');
      return;
    }
    const start = new Date(blockStart);
    const end = new Date(blockEnd);
    if (end <= start) {
      toast.error('종료 시간이 시작 시간보다 늦어야 합니다.');
      return;
    }
    if (meeting) {
      const meetingStart = new Date(meeting.startTime);
      const meetingEnd = new Date(meeting.endTime);
      if (start < meetingStart || end > meetingEnd) {
        toast.error('선택한 시간은 약속 범위 안에 있어야 합니다.');
        return;
      }
    }
    setManualBlocks((prev) => [
      ...prev,
      { startTime: start.toISOString(), endTime: end.toISOString() },
    ]);
    setBlockStart('');
    setBlockEnd('');
  };

  const handleRemoveBlock = (index: number) => {
    setManualBlocks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveBlocks = async () => {
    if (!meeting?.id) return;
    try {
      setSavingBlocks(true);
      await meetingApi.updateManualBlocks(meeting.id, manualBlocks);
      const availabilityResponse = await meetingApi.getMeetingAvailability(
        inviteCode!,
      );
      setAvailabilitySlots(availabilityResponse.data.availabilitySlots);
      toast.success('차단 시간이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving blocks:', error);
      toast.error('차단 시간 저장에 실패했습니다.');
    } finally {
      setSavingBlocks(false);
    }
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
                    className="px-3 py-1 border border-gray-200 rounded-full text-sm"
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
            <div className="mb-6 p-4 border border-gray-200 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">
                ⭐ 추천 시간대 (모든 참가자가 가능한 시간)
              </h3>
              <div className="space-y-2">
                {availabilitySlots
                  .filter((slot) => slot.isOptimal)
                  .slice(0, 5)
                  .map((slot, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded"
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
                  let bgColor = 'bg-red-50';
                  let textColor = 'text-red-700';
                  let barColor = 'bg-red-500';

                  if (availabilityPercent === 100) {
                    bgColor = 'bg-green-50';
                    textColor = 'text-green-700';
                    barColor = 'bg-green-500';
                  } else if (availabilityPercent >= 70) {
                    bgColor = 'bg-yellow-50';
                    textColor = 'text-yellow-700';
                    barColor = 'bg-yellow-500';
                  }

                  return (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded border border-gray-200 ${bgColor}`}
                    >
                      <span className="font-medium text-sm">
                        {formatDate(slot.startTime)}{' '}
                        {formatTime(slot.startTime)} -{' '}
                        {formatTime(slot.endTime)}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className={`text-sm ${textColor}`}>
                          {slot.availableCount}/{participants.length}명 가능
                        </span>
                        <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={barColor}
                            style={{ width: `${availabilityPercent}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-600 w-10">
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

        {isAuthenticated && hasJoined && (
          <div className="border border-gray-200 rounded-lg p-8 mt-6">
            <h2 className="text-xl font-bold mb-4">내 일정에서 제외할 시간</h2>
            <p className="text-sm text-gray-600 mb-4">
              Google 캘린더에 없는 일정도 직접 차단할 수 있습니다.
            </p>
            <div className="grid md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">
                  시작 시간
                </label>
                <input
                  type="datetime-local"
                  value={blockStart}
                  onChange={(e) => setBlockStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  종료 시간
                </label>
                <input
                  type="datetime-local"
                  value={blockEnd}
                  onChange={(e) => setBlockEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md"
                />
              </div>
              <Button onClick={handleAddBlock} type="button">
                차단 시간 추가
              </Button>
            </div>

            <div className="mt-6 space-y-2">
              {manualBlocks.length > 0 ? (
                manualBlocks.map((block, index) => (
                  <div
                    key={`${block.startTime}-${index}`}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded"
                  >
                    <span className="text-sm">
                      {formatDate(block.startTime)}{' '}
                      {formatTime(block.startTime)} -{' '}
                      {formatTime(block.endTime)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveBlock(index)}
                      className="text-sm text-gray-500 hover:text-gray-800"
                    >
                      삭제
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">
                  등록된 차단 시간이 없습니다.
                </p>
              )}
              <div className="pt-4">
                <Button onClick={handleSaveBlocks} disabled={savingBlocks}>
                  {savingBlocks ? '저장 중...' : '차단 시간 저장'}
                </Button>
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
