import { useEffect, useMemo, useState } from 'react';

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

interface AvailabilityDoc {
  uid: string;
  busyBlocks: TimeBlock[];
  manualBlocks: TimeBlock[];
}

interface ParticipantInfo {
  uid: string;
  email: string | null;
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
  const [availabilityDocs, setAvailabilityDocs] = useState<AvailabilityDoc[]>(
    [],
  );
  const [hasJoined, setHasJoined] = useState(false);
  const [manualBlocks, setManualBlocks] = useState<TimeBlock[]>([]);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [blockedSlots, setBlockedSlots] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'add' | 'remove'>('add');
  const [hoveredAvailability, setHoveredAvailability] = useState<{
    slot: TimeSlot;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!inviteCode) {
      toast.error('유효하지 않은 초대 링크입니다.');
      navigate({ to: '/' });
      return;
    }

    loadMeetingData();
  }, [inviteCode, isAuthenticated]);

  useEffect(() => {
    const stopDragging = () => setIsDragging(false);
    window.addEventListener('pointerup', stopDragging);
    return () => window.removeEventListener('pointerup', stopDragging);
  }, []);

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
        setAvailabilityDocs(availabilityResponse.data.availabilityDocs ?? []);

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

  const handleRemoveBlock = (index: number) => {
    if (!meetingRange) return;
    const nextBlocks = derivedBlocks.filter((_, idx) => idx !== index);
    setBlockedSlots(buildSlotsFromBlocks(nextBlocks, meetingRange));
  };

  const handleSaveBlocks = async () => {
    if (!meeting?.id) return;
    try {
      setSavingBlocks(true);
      await meetingApi.updateManualBlocks(meeting.id, derivedBlocks);
      const availabilityResponse = await meetingApi.getMeetingAvailability(
        inviteCode!,
      );
      setAvailabilitySlots(availabilityResponse.data.availabilitySlots);
      setAvailabilityDocs(availabilityResponse.data.availabilityDocs ?? []);
      toast.success('차단 시간이 저장되었습니다.');
    } catch (error) {
      console.error('Error saving blocks:', error);
      toast.error('차단 시간 저장에 실패했습니다.');
    } finally {
      setSavingBlocks(false);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!meeting?.inviteCode) return;
    const confirmed = window.confirm('약속을 삭제할까요? 되돌릴 수 없습니다.');
    if (!confirmed) return;
    try {
      await meetingApi.deleteMeetingByCode(meeting.inviteCode);
      toast.success('약속이 삭제되었습니다.');
      navigate({ to: '/dashboard' });
    } catch (error) {
      console.error('Error deleting meeting:', error);
      toast.error('약속 삭제에 실패했습니다.');
    }
  };

  const handleManualSync = async () => {
    if (!meeting?.id) return;
    try {
      setManualSyncing(true);
      const response = await calendarApi.syncCalendar(
        new Date(meeting.startTime),
        new Date(meeting.endTime),
      );
      if (response.error) {
        toast.error(`캘린더 동기화 실패: ${response.error}`);
        return;
      }
      if (response.data?.skipped) {
        toast.message('동기화가 너무 빈번해 잠시 건너뛰었습니다.');
      } else {
        toast.success('캘린더가 동기화되었습니다.');
      }
      await meetingApi.updateManualBlocks(meeting.id, derivedBlocks);
      const availabilityResponse = await meetingApi.getMeetingAvailability(
        inviteCode!,
      );
      setAvailabilitySlots(availabilityResponse.data.availabilitySlots);
      setAvailabilityDocs(availabilityResponse.data.availabilityDocs ?? []);
    } catch (error) {
      console.error('Error manual sync:', error);
      toast.error('동기화에 실패했습니다.');
    } finally {
      setManualSyncing(false);
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

  const meetingRange = useMemo(
    () =>
      meeting ? getMeetingRange(meeting.startTime, meeting.endTime) : null,
    [meeting],
  );

  const weekDays = useMemo(() => {
    if (!weekStart) return [];
    return buildWeekDays(weekStart);
  }, [weekStart]);

  const availabilitySlotMap = useMemo(() => {
    const map = new Map<number, TimeSlot>();
    availabilitySlots.forEach((slot) => {
      const key = new Date(slot.startTime).getTime();
      map.set(key, slot);
    });
    return map;
  }, [availabilitySlots]);

  const availabilityDocsMap = useMemo(() => {
    const map = new Map<string, AvailabilityDoc>();
    availabilityDocs.forEach((doc) => map.set(doc.uid, doc));
    return map;
  }, [availabilityDocs]);

  const myAvailability = useMemo(
    () => (user?.uid ? availabilityDocsMap.get(user.uid) : undefined),
    [availabilityDocsMap, user?.uid],
  );

  const myBusySlots = useMemo(() => {
    const slots = new Set<string>();
    if (!myAvailability || !meetingRange || weekDays.length === 0) {
      return slots;
    }
    weekDays.forEach((day) => {
      TIME_SLOTS.forEach((slotMinutes) => {
        const slotStart = addMinutes(day, slotMinutes);
        const slotEnd = addMinutes(slotStart, SLOT_MINUTES);
        const inRange =
          slotStart >= meetingRange.start && slotEnd <= meetingRange.end;
        if (!inRange) return;
        const isBusy = myAvailability.busyBlocks.some((block) =>
          blocksOverlap(slotStart, slotEnd, block),
        );
        if (isBusy) {
          slots.add(slotStart.toISOString());
        }
      });
    });
    return slots;
  }, [myAvailability, meetingRange, weekDays]);

  const participantList = useMemo(
    () =>
      participants
        .map((participant: ParticipantInfo) => ({
          uid: participant.uid,
          email: participant.email ?? '알 수 없음',
        }))
        .filter((participant) => participant.uid),
    [participants],
  );

  const availabilityWeekDays = useMemo(() => {
    if (!weekStart) return [];
    return buildWeekDays(weekStart);
  }, [weekStart]);

  const derivedBlocks = useMemo(
    () => buildBlocksFromSlots(blockedSlots, meetingRange),
    [blockedSlots, meetingRange],
  );

  useEffect(() => {
    if (!meetingRange) return;
    setWeekStart((prev) => prev ?? startOfWeek(meetingRange.start));
  }, [meetingRange]);

  useEffect(() => {
    if (!meetingRange) return;
    setBlockedSlots(buildSlotsFromBlocks(manualBlocks, meetingRange));
  }, [manualBlocks, meetingRange]);

  const handleToggleSlot = (slotId: string, action: 'add' | 'remove') => {
    setBlockedSlots((prev) => {
      const next = new Set(prev);
      if (action === 'add') {
        next.add(slotId);
      } else {
        next.delete(slotId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="mx-auto py-8">
          <div className="text-center">로딩 중...</div>
        </div>
      </Layout>
    );
  }

  if (!meeting) {
    return (
      <Layout>
        <div className="mx-auto py-8">
          <div className="text-center">약속을 찾을 수 없습니다.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto py-8">
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
              {isAuthenticated && (
                <Button
                  onClick={handleManualSync}
                  variant="outline"
                  disabled={manualSyncing}
                >
                  {manualSyncing ? '동기화 중...' : '수동 동기화'}
                </Button>
              )}
              {isAuthenticated && user?.uid === meeting.hostUid && (
                <Button variant="destructive" onClick={handleDeleteMeeting}>
                  약속 삭제
                </Button>
              )}
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
            {meetingRange && weekStart && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-gray-600">
                    파란색이 진할수록 더 많은 참가자가 가능한 시간입니다.
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() =>
                        setWeekStart((prev) =>
                          prev
                            ? getPreviousWeek(prev, meetingRange.start)
                            : startOfWeek(meetingRange.start),
                        )
                      }
                      disabled={
                        !canMoveToPrevWeek(weekStart, meetingRange.start)
                      }
                    >
                      이전 주
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() =>
                        setWeekStart((prev) =>
                          prev
                            ? getNextWeek(prev, meetingRange.end)
                            : startOfWeek(meetingRange.start),
                        )
                      }
                      disabled={!canMoveToNextWeek(weekStart, meetingRange.end)}
                    >
                      다음 주
                    </Button>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[64px_repeat(7,1fr)] bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
                    <div className="p-2">시간</div>
                    {availabilityWeekDays.map((day) => (
                      <div key={day.toISOString()} className="p-2 text-center">
                        {day.toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          weekday: 'short',
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-[64px_repeat(7,1fr)]">
                    <div>
                      {AVAIL_HOUR_LABELS.map((label, index) => (
                        <div
                          key={`avail-label-${index}`}
                          className="text-xs text-gray-400 px-2"
                          style={{ height: AVAIL_SLOT_HEIGHT * 2 }}
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                    {availabilityWeekDays.map((day) => (
                      <div
                        key={day.toISOString()}
                        className="border-l border-gray-100"
                      >
                        {AVAIL_TIME_SLOTS.map((slotMinutes) => {
                          const slotStart = addMinutes(day, slotMinutes);
                          const slotEnd = addMinutes(
                            slotStart,
                            AVAIL_SLOT_MINUTES,
                          );
                          const inRange =
                            slotStart >= meetingRange.start &&
                            slotEnd <= meetingRange.end;
                          const slotKey = slotStart.getTime();
                          const slot = availabilitySlotMap.get(slotKey);
                          const availability = slot?.availability ?? 0;
                          const availabilityPercent = Math.round(
                            availability * 100,
                          );
                          const bgColor = inRange
                            ? getAvailabilityColor(availability)
                            : '#f8fafc';
                          const isOptimal = slot?.isOptimal;

                          return (
                            <div
                              key={`${day.toISOString()}-${slotMinutes}`}
                              className="border-t border-gray-100 relative"
                              style={{
                                height: AVAIL_SLOT_HEIGHT,
                                backgroundColor: bgColor,
                              }}
                              title={
                                inRange && slot
                                  ? `${availabilityPercent}% (${slot.availableCount}/${participants.length})`
                                  : ''
                              }
                              onMouseEnter={(event) => {
                                if (!inRange || !slot) return;
                                setHoveredAvailability({
                                  slot,
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                              }}
                              onMouseLeave={() => setHoveredAvailability(null)}
                            >
                              {isOptimal && (
                                <div className="absolute inset-0 border border-blue-500/40" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                {hoveredAvailability && (
                  <div
                    className="fixed z-50 w-64 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg"
                    style={{
                      top: hoveredAvailability.y + 12,
                      left: hoveredAvailability.x + 12,
                    }}
                  >
                    <div className="font-semibold text-gray-800 mb-2">
                      {formatDate(hoveredAvailability.slot.startTime)}{' '}
                      {formatTime(hoveredAvailability.slot.startTime)} -{' '}
                      {formatTime(hoveredAvailability.slot.endTime)}
                    </div>
                    <div className="text-[11px] text-gray-500 mb-2">
                      {Math.round(hoveredAvailability.slot.availability * 100)}%
                      가능 ({hoveredAvailability.slot.availableCount}/
                      {participants.length})
                    </div>
                    <div className="space-y-2">
                      {(() => {
                        const availability = getSlotAvailabilityDetails(
                          hoveredAvailability.slot.startTime,
                          hoveredAvailability.slot.endTime,
                          participantList,
                          availabilityDocsMap,
                        );
                        return (
                          <>
                            <div>
                              <div className="font-semibold text-gray-700 mb-1">
                                가능
                              </div>
                              {availability.available.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {availability.available.map((email) => (
                                    <span
                                      key={email}
                                      className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700"
                                    >
                                      {email}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[11px] text-gray-400">
                                  없음
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-700 mb-1">
                                불가
                              </div>
                              {availability.unavailable.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {availability.unavailable.map((email) => (
                                    <span
                                      key={email}
                                      className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                                    >
                                      {email}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[11px] text-gray-400">
                                  없음
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isAuthenticated && hasJoined && (
          <div className="border border-gray-200 rounded-lg p-8 mt-6">
            <h2 className="text-xl font-bold mb-4">내 일정에서 제외할 시간</h2>
            <p className="text-sm text-gray-600 mb-4">
              Google 캘린더에 없는 일정도 직접 차단할 수 있습니다.
            </p>
            {meetingRange && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-gray-600">
                    15분 단위로 드래그하여 차단 시간을 선택하세요.
                  </div>
                  <div className="text-xs text-gray-500">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-50 border border-blue-100 align-middle mr-1" />
                    내 캘린더 일정
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() =>
                        setWeekStart((prev) =>
                          prev
                            ? getPreviousWeek(prev, meetingRange.start)
                            : startOfWeek(meetingRange.start),
                        )
                      }
                      disabled={
                        !weekStart ||
                        !canMoveToPrevWeek(weekStart, meetingRange.start)
                      }
                    >
                      이전 주
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() =>
                        setWeekStart((prev) =>
                          prev
                            ? getNextWeek(prev, meetingRange.end)
                            : startOfWeek(meetingRange.start),
                        )
                      }
                      disabled={
                        !weekStart ||
                        !canMoveToNextWeek(weekStart, meetingRange.end)
                      }
                    >
                      다음 주
                    </Button>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[64px_repeat(7,1fr)] bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
                    <div className="p-2">시간</div>
                    {weekDays.map((day) => (
                      <div key={day.toISOString()} className="p-2 text-center">
                        {day.toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          weekday: 'short',
                        })}
                      </div>
                    ))}
                  </div>

                  <div
                    className="grid grid-cols-[64px_repeat(7,1fr)]"
                    onPointerUp={() => setIsDragging(false)}
                  >
                    <div>
                      {HOUR_LABELS.map((label, index) => (
                        <div
                          key={`label-${index}`}
                          className="text-xs text-gray-400 px-2"
                          style={{ height: SLOT_HEIGHT * 4 }}
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                    {weekDays.map((day) => {
                      const dayKey = day.toISOString();
                      return (
                        <div key={dayKey} className="border-l border-gray-100">
                          {TIME_SLOTS.map((slotMinutes) => {
                            const slotStart = addMinutes(day, slotMinutes);
                            const slotEnd = addMinutes(slotStart, 15);
                            const inRange =
                              slotStart >= meetingRange.start &&
                              slotEnd <= meetingRange.end;
                            const slotId = slotStart.toISOString();
                            const isBlocked = blockedSlots.has(slotId);
                            const isCalendarBusy = myBusySlots.has(slotId);

                            return (
                              <div
                                key={slotId}
                                role="button"
                                tabIndex={-1}
                                className={`border-t border-gray-100 ${
                                  inRange
                                    ? isBlocked
                                      ? 'bg-red-400'
                                      : isCalendarBusy
                                        ? 'bg-blue-50 hover:bg-red-100'
                                        : 'bg-white hover:bg-red-100'
                                    : 'bg-gray-50'
                                }`}
                                style={{ height: SLOT_HEIGHT }}
                                onPointerDown={(event) => {
                                  if (!inRange) return;
                                  event.preventDefault();
                                  const nextMode = isBlocked ? 'remove' : 'add';
                                  setDragMode(nextMode);
                                  setIsDragging(true);
                                  handleToggleSlot(slotId, nextMode);
                                }}
                                onPointerEnter={() => {
                                  if (!isDragging || !inRange) return;
                                  handleToggleSlot(slotId, dragMode);
                                }}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {derivedBlocks.length > 0 ? (
                    derivedBlocks.map((block, index) => (
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

const SLOT_HEIGHT = 16;
const SLOT_MINUTES = 15;
const TIME_SLOTS = Array.from(
  { length: 96 },
  (_, index) => index * SLOT_MINUTES,
);
const HOUR_LABELS = Array.from({ length: 24 }, (_, index) => `${index}:00`);
const AVAIL_SLOT_MINUTES = 30;
const AVAIL_SLOT_HEIGHT = 14;
const AVAIL_TIME_SLOTS = Array.from(
  { length: 48 },
  (_, index) => index * AVAIL_SLOT_MINUTES,
);
const AVAIL_HOUR_LABELS = Array.from(
  { length: 24 },
  (_, index) => `${index}:00`,
);

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const endOfDay = (date: Date) =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );

const addMinutes = (date: Date, minutes: number) => {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
};

const startOfWeek = (date: Date) => {
  const start = startOfDay(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const buildWeekDays = (weekStart: Date) =>
  Array.from({ length: 7 }, (_, index) => {
    const next = new Date(weekStart);
    next.setDate(weekStart.getDate() + index);
    return next;
  });

const getMeetingRange = (startTime: string, endTime: string) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return {
    start,
    end,
    startDay: startOfDay(start),
    endDay: endOfDay(end),
  };
};

const buildSlotsFromBlocks = (
  blocks: TimeBlock[],
  meetingRange: ReturnType<typeof getMeetingRange> | null,
) => {
  const next = new Set<string>();
  if (!meetingRange) return next;
  const rangeStart = meetingRange.start;
  const rangeEnd = meetingRange.end;

  blocks.forEach((block) => {
    let cursor = new Date(block.startTime);
    const blockEnd = new Date(block.endTime);
    while (cursor < blockEnd) {
      const slotStart = new Date(cursor);
      const slotEnd = addMinutes(slotStart, SLOT_MINUTES);
      if (slotStart >= rangeStart && slotEnd <= rangeEnd) {
        next.add(slotStart.toISOString());
      }
      cursor = slotEnd;
    }
  });

  return next;
};

const buildBlocksFromSlots = (
  slots: Set<string>,
  meetingRange: ReturnType<typeof getMeetingRange> | null,
) => {
  if (!meetingRange) return [];
  const sorted = Array.from(slots)
    .map((value) => new Date(value))
    .sort((a, b) => a.getTime() - b.getTime());

  const blocks: TimeBlock[] = [];
  let currentStart: Date | null = null;
  let currentEnd: Date | null = null;

  sorted.forEach((slotStart) => {
    const slotEnd = addMinutes(slotStart, SLOT_MINUTES);
    if (!currentStart) {
      currentStart = slotStart;
      currentEnd = slotEnd;
      return;
    }
    if (slotStart.getTime() === currentEnd?.getTime()) {
      currentEnd = slotEnd;
    } else {
      blocks.push({
        startTime: currentStart.toISOString(),
        endTime: currentEnd!.toISOString(),
      });
      currentStart = slotStart;
      currentEnd = slotEnd;
    }
  });

  if (currentStart && currentEnd) {
    blocks.push({
      startTime: (currentStart as Date).toISOString(),
      endTime: (currentEnd as Date).toISOString(),
    });
  }

  return blocks;
};

const canMoveToPrevWeek = (weekStart: Date, rangeStart: Date) =>
  startOfWeek(weekStart).getTime() > startOfWeek(rangeStart).getTime();

const canMoveToNextWeek = (weekStart: Date, rangeEnd: Date) => {
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  return nextWeekStart.getTime() <= startOfWeek(rangeEnd).getTime();
};

const getPreviousWeek = (weekStart: Date, rangeStart: Date) => {
  const prev = new Date(weekStart);
  prev.setDate(prev.getDate() - 7);
  const min = startOfWeek(rangeStart);
  return prev < min ? min : prev;
};

const getNextWeek = (weekStart: Date, rangeEnd: Date) => {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + 7);
  const max = startOfWeek(rangeEnd);
  return next > max ? max : next;
};

const getAvailabilityColor = (availability: number) => {
  if (availability <= 0) return '#f8fafc';
  const clamped = Math.min(1, Math.max(0, availability));
  const lightness = 94 - clamped * 22;
  return `hsl(210, 85%, ${lightness}%)`;
};

const getSlotAvailabilityDetails = (
  startTime: string,
  endTime: string,
  participants: Array<{ uid: string; email: string }>,
  availabilityDocs: Map<string, AvailabilityDoc>,
) => {
  const slotStart = new Date(startTime);
  const slotEnd = new Date(endTime);
  const available: string[] = [];
  const unavailable: string[] = [];

  participants.forEach((participant) => {
    const doc = availabilityDocs.get(participant.uid);
    if (!doc) {
      available.push(`${participant.email} (미응답)`);
      return;
    }
    const isBusy = doc.busyBlocks.some((block) =>
      blocksOverlap(slotStart, slotEnd, block),
    );
    if (isBusy) {
      unavailable.push(participant.email);
    } else {
      available.push(participant.email);
    }
  });

  return { available, unavailable };
};

const normalizeBlock = (block: TimeBlock) => {
  const start = new Date(block.startTime);
  const end = new Date(block.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  if (end <= start) return null;
  return { start, end };
};

const blocksOverlap = (start: Date, end: Date, block: TimeBlock) => {
  const normalized = normalizeBlock(block);
  if (!normalized) return false;
  return normalized.start < end && normalized.end > start;
};
