import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import { useNavigate, useParams } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import {
  Check,
  Copy,
  Crown,
  LogIn,
  LogOut,
  RefreshCw,
  Save,
  Sparkles,
  Trash,
} from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { type StoredEvent, calendarApi } from '@/services/api/calendarApi';
import { meetingApi } from '@/services/api/meetingApi';
import { useAuthStore } from '@/store/useAuthStore';
import { setPageMeta } from '@/utils/meta';

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
  nickname: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export function MeetingJoinPage() {
  const { inviteCode } = useParams({ strict: false });
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [savingBlocks, setSavingBlocks] = useState(false);
  const [meeting, setMeeting] = useState<any>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
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
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [hoveredAvailability, setHoveredAvailability] = useState<{
    slot: TimeSlot;
    x: number;
    y: number;
  } | null>(null);
  const [recommendDuration, setRecommendDuration] = useState('60');
  const [recommendations, setRecommendations] = useState<
    Array<{
      start: Date;
      end: Date;
      availableCount: number;
      availability: number;
    }>
  >([]);
  const [recommendationError, setRecommendationError] = useState<string | null>(
    null,
  );
  const [calendarEvents, setCalendarEvents] = useState<StoredEvent[]>([]);
  const [hoveredCalendarEvent, setHoveredCalendarEvent] = useState<{
    event: StoredEvent;
    x: number;
    y: number;
  } | null>(null);
  const hasOtherParticipants = useMemo(() => {
    if (!participants || participants.length === 0) return false;
    return participants.some((participant) => participant.uid !== user?.uid);
  }, [participants, user?.uid]);

  useEffect(() => {
    if (!inviteCode) {
      toast.error('유효하지 않은 초대 링크입니다.');
      navigate({ to: '/' });
      return;
    }

    loadMeetingData();
  }, [inviteCode, isAuthenticated]);

  useEffect(() => {
    if (!meeting) return;
    setPageMeta({
      title: meeting.title || '약속',
      description: meeting.description || 'MyTT에서 약속에 참여하세요!',
    });
  }, [meeting]);

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

  const handleLeaveMeeting = async () => {
    if (!isAuthenticated) {
      toast.error('로그인이 필요합니다.');
      return;
    }
    const confirmed = window.confirm('약속에서 나가시겠어요?');
    if (!confirmed) return;
    try {
      setJoining(true);
      await meetingApi.leaveMeetingByCode(inviteCode!);
      toast.success('약속에서 나갔습니다.');
      setHasJoined(false);
      navigate({ to: '/meeting' });
    } catch (error) {
      console.error('Error leaving meeting:', error);
      toast.error('약속 나가기에 실패했습니다.');
    } finally {
      setJoining(false);
    }
  };

  const copyInviteLink = () => {
    const shareUrl = `${window.location.origin}/meeting/${inviteCode}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('초대 링크가 복사되었습니다!');
    setCopiedInvite(true);
    window.setTimeout(() => {
      setCopiedInvite(false);
    }, 1200);
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

  const loadCalendarEvents = async (start: Date, end: Date) => {
    try {
      const response = await calendarApi.getEvents(start, end);
      const events = (response.data ?? []).filter((event) => event.isBusy);
      setCalendarEvents(events);
    } catch (error) {
      console.error('Error loading calendar events:', error);
      setCalendarEvents([]);
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
      if (meetingRange) {
        await loadCalendarEvents(meetingRange.start, meetingRange.end);
      }
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
          label:
            participant.nickname ??
            participant.displayName ??
            participant.email ??
            participant.uid ??
            '알 수 없음',
          photoURL: participant.photoURL ?? null,
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

  useEffect(() => {
    if (!isAuthenticated || !meetingRange) {
      setCalendarEvents([]);
      return;
    }
    loadCalendarEvents(meetingRange.start, meetingRange.end);
  }, [isAuthenticated, meetingRange]);

  const busySlotEventMap = useMemo(() => {
    const map = new Map<string, StoredEvent>();
    if (!meetingRange || calendarEvents.length === 0) return map;
    const rangeStart = meetingRange.start;
    const rangeEnd = meetingRange.end;
    calendarEvents.forEach((event) => {
      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);
      if (eventEnd <= rangeStart || eventStart >= rangeEnd) return;
      let cursor = new Date(
        Math.max(eventStart.getTime(), rangeStart.getTime()),
      );
      cursor.setMinutes(
        Math.floor(cursor.getMinutes() / SLOT_MINUTES) * SLOT_MINUTES,
        0,
        0,
      );
      const end = new Date(Math.min(eventEnd.getTime(), rangeEnd.getTime()));
      while (cursor < end) {
        const slotId = cursor.toISOString();
        if (!map.has(slotId)) {
          map.set(slotId, event);
        }
        cursor = addMinutes(cursor, SLOT_MINUTES);
      }
    });
    return map;
  }, [calendarEvents, meetingRange]);

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

  const handleRecommendTime = () => {
    if (!meetingRange) return;
    const minutes = Number(recommendDuration);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setRecommendations([]);
      setRecommendationError('유효한 시간을 입력해주세요.');
      return;
    }
    if (participants.length === 0 || availabilitySlots.length === 0) {
      setRecommendations([]);
      setRecommendationError('참가자 정보가 없습니다.');
      return;
    }

    const target = new Date();
    const baseTime =
      target < meetingRange.start
        ? meetingRange.start
        : target > meetingRange.end
          ? meetingRange.end
          : target;

    const sortedStarts = availabilitySlots
      .map((slot) => new Date(slot.startTime))
      .sort((a, b) => a.getTime() - b.getTime());

    const candidates: Array<{
      start: Date;
      end: Date;
      availableCount: number;
      availability: number;
      distance: number;
    }> = [];

    sortedStarts.forEach((start) => {
      if (start < meetingRange.start) return;
      const end = addMinutes(start, minutes);
      if (end > meetingRange.end) return;
      if (!isWithinActiveHours(start, end)) return;

      const availableCount = getAvailableCountForRange(
        start,
        end,
        participants,
        availabilityDocsMap,
      );
      const availability = participants.length
        ? availableCount / participants.length
        : 0;
      const distance = Math.abs(start.getTime() - baseTime.getTime());

      candidates.push({
        start,
        end,
        availableCount,
        availability,
        distance,
      });
    });

    if (candidates.length === 0) {
      setRecommendations([]);
      setRecommendationError('추천할 수 있는 시간이 없습니다.');
      return;
    }

    const sorted = candidates.sort((a, b) => {
      if (b.availableCount !== a.availableCount) {
        return b.availableCount - a.availableCount;
      }
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return a.start.getTime() - b.start.getTime();
    });

    const selected: Array<{
      start: Date;
      end: Date;
      availableCount: number;
      availability: number;
    }> = [];

    sorted.forEach((item) => {
      if (selected.length >= 3) return;
      const overlaps = selected.some(
        (picked) => item.start < picked.end && item.end > picked.start,
      );
      if (overlaps) return;
      selected.push({
        start: item.start,
        end: item.end,
        availableCount: item.availableCount,
        availability: item.availability,
      });
    });

    setRecommendations(selected);
    setRecommendationError(null);
  };

  const handleRecommendDurationChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setRecommendDuration(event.target.value);
    setRecommendations([]);
    setRecommendationError(null);
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

  if (!meeting) {
    return (
      <Layout disableHeaderHeight>
        <div className="mx-auto py-16">
          <div className="text-center">약속을 찾을 수 없습니다.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout disableHeaderHeight>
      <div className="mx-auto py-10 sm:py-16">
        {/* 미팅 정보 */}
        <div className="border border-gray-200 rounded-lg p-5 sm:p-8 mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">
                {meeting.title}
              </h1>
              {meeting.description && (
                <p className="text-gray-600 mb-4">{meeting.description}</p>
              )}
              <div className="text-sm text-gray-500">
                <p>
                  기간: {formatDate(meeting.startTime)} -{' '}
                  {formatDate(meeting.endTime)}
                </p>
                <p>시간대: {meeting.timezone}</p>
                {meeting.groupTitle && (
                  <p className="text-xs text-gray-500 mt-1">
                    그룹: {meeting.groupTitle}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={copyInviteLink} variant="outline">
                <motion.span
                  key={copiedInvite ? 'check' : 'copy'}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.18 }}
                  className="inline-flex"
                >
                  {copiedInvite ? <Check /> : <Copy />}
                </motion.span>
                링크 복사
              </Button>
              {isAuthenticated && (
                <Button
                  onClick={handleManualSync}
                  variant="outline"
                  disabled={manualSyncing}
                >
                  <motion.span
                    animate={manualSyncing ? { rotate: 360 } : { rotate: 0 }}
                    transition={
                      manualSyncing
                        ? { duration: 1, repeat: Infinity, ease: 'linear' }
                        : { duration: 0.2 }
                    }
                    className="inline-flex"
                  >
                    <RefreshCw />
                  </motion.span>
                  {manualSyncing ? '동기화 중...' : '수동 동기화'}
                </Button>
              )}
              {isAuthenticated && user?.uid === meeting.hostUid && (
                <div className="relative group">
                  <Button
                    variant="destructive"
                    onClick={handleDeleteMeeting}
                    disabled={hasOtherParticipants}
                  >
                    <Trash />
                    약속 삭제
                  </Button>
                  {hasOtherParticipants && (
                    <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                      다른 참가자가 있어 삭제할 수 없습니다.
                    </div>
                  )}
                </div>
              )}
              {hasJoined &&
                isAuthenticated &&
                user?.uid !== meeting.hostUid && (
                  <Button variant="destructive" onClick={handleLeaveMeeting}>
                    <LogOut />
                    약속 나가기
                  </Button>
                )}
              {!hasJoined && isAuthenticated && (
                <Button onClick={handleJoinMeeting} disabled={joining}>
                  <LogIn />
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
                {participants.map((participant, index) => {
                  const label =
                    participant.nickname ??
                    participant.displayName ??
                    participant.email ??
                    participant.uid ??
                    '알 수 없음';
                  const fallback = label.slice(0, 2).toUpperCase();
                  const isHost = participant.uid === meeting.hostUid;
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-2 pl-1.5 pr-3 py-1 border border-gray-200 rounded-full text-sm"
                    >
                      <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-[10px] font-semibold text-gray-600">
                        {participant.photoURL ? (
                          <img
                            src={participant.photoURL}
                            alt={label}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          fallback
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {isHost && (
                          <span className="relative group inline-flex items-center">
                            <Crown className="h-3.5 w-3.5 text-amber-500" />
                            <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                              주최자
                            </span>
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 가용성 시각화 */}
        {isAuthenticated && availabilitySlots.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-5 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-extrabold mb-6">
              최적의 약속 잡기
            </h2>
            {meetingRange && weekStart && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-gray-700">
                      스마트 약속 추천
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="text-gray-600">
                        시간(분)
                        <input
                          type="number"
                          min={15}
                          step={15}
                          value={recommendDuration}
                          onChange={handleRecommendDurationChange}
                          className="ml-2 w-24 rounded-md border border-gray-200 px-2 py-1 text-sm"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRecommendTime}
                      >
                        <Sparkles className="h-4 w-4" />
                        추천
                      </Button>
                    </div>
                  </div>
                  {recommendations.length === 0 && recommendationError && (
                    <div className="text-xs text-red-500">
                      {recommendationError}
                    </div>
                  )}
                </div>
                {recommendations.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {recommendations.map((rec) => (
                      <div
                        key={rec.start.toISOString()}
                        className="rounded-md border border-blue-200 bg-white px-3 py-2 text-xs text-gray-700"
                      >
                        <div className="font-semibold text-blue-700">
                          <span className="inline-flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5" /> 추천 시간
                          </span>
                        </div>
                        <div>
                          {formatDate(rec.start.toISOString())}{' '}
                          {formatTime(rec.start.toISOString())} -{' '}
                          {formatTime(rec.end.toISOString())}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          가능 {rec.availableCount}/{participants.length} (
                          {Math.round(rec.availability * 100)}%)
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-600">
                    파란색이 진할수록 더 많은 참가자가 가능한 시간입니다.
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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

                <div className="overflow-x-auto">
                  <div className="min-w-[720px] border border-gray-200 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[64px_repeat(7,1fr)] bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
                      <div className="p-2">시간</div>
                      {availabilityWeekDays.map((day) => (
                        <div
                          key={day.toISOString()}
                          className="p-2 text-center"
                        >
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
                          className="relative border-l border-gray-100"
                        >
                          {recommendations.map((rec) => {
                            const dayStart = startOfDay(day);
                            const dayEnd = new Date(dayStart);
                            dayEnd.setDate(dayEnd.getDate() + 1);
                            if (rec.end <= dayStart || rec.start >= dayEnd) {
                              return null;
                            }
                            const segmentStart =
                              rec.start > dayStart ? rec.start : dayStart;
                            const segmentEnd =
                              rec.end < dayEnd ? rec.end : dayEnd;
                            const durationMinutes =
                              (segmentEnd.getTime() - segmentStart.getTime()) /
                              60000;
                            const offsetMinutes =
                              (segmentStart.getTime() - dayStart.getTime()) /
                              60000;
                            const height =
                              (durationMinutes / AVAIL_SLOT_MINUTES) *
                              AVAIL_SLOT_HEIGHT;
                            const top =
                              (offsetMinutes / AVAIL_SLOT_MINUTES) *
                              AVAIL_SLOT_HEIGHT;
                            const showLabel =
                              segmentStart.getTime() === rec.start.getTime();

                            return (
                              <div
                                key={rec.start.toISOString()}
                                className="absolute left-0 right-0 z-20 pointer-events-none"
                                style={{ top, height }}
                              >
                                <div className="relative h-full w-full rounded-md border-2 border-blue-600 bg-blue-200/35 shadow-[0_0_0_1px_rgba(37,99,235,0.25)_inset]">
                                  {showLabel && (
                                    <div className="absolute right-1 top-1 flex items-center gap-1 rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 shadow">
                                      <Sparkles className="h-3 w-3" />
                                      추천 시간
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
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
                                onMouseLeave={() =>
                                  setHoveredAvailability(null)
                                }
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
                                  {availability.available.map((name) => (
                                    <span
                                      key={name}
                                      className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700"
                                    >
                                      {name}
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
                                  {availability.unavailable.map((name) => (
                                    <span
                                      key={name}
                                      className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                                    >
                                      {name}
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
          <div className="border border-gray-200 rounded-lg p-5 sm:p-8 mt-6">
            <h2 className="text-xl font-extrabold mb-4">
              내 일정에서 제외할 시간
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Google 캘린더에 없는 일정도 직접 차단할 수 있습니다.
            </p>
            {meetingRange && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-600">
                    15분 단위로 드래그하여 차단 시간을 선택하세요.
                  </div>
                  <div className="text-xs text-gray-500">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-50 border border-blue-100 align-middle mr-1" />
                    내 캘린더 일정
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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

                <div className="overflow-x-auto">
                  <div className="min-w-[720px] border border-gray-200 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[64px_repeat(7,1fr)] bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
                      <div className="p-2">시간</div>
                      {weekDays.map((day) => (
                        <div
                          key={day.toISOString()}
                          className="p-2 text-center"
                        >
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
                          <div
                            key={dayKey}
                            className="border-l border-gray-100"
                          >
                            {TIME_SLOTS.map((slotMinutes) => {
                              const slotStart = addMinutes(day, slotMinutes);
                              const slotEnd = addMinutes(slotStart, 15);
                              const inRange =
                                slotStart >= meetingRange.start &&
                                slotEnd <= meetingRange.end;
                              const slotId = slotStart.toISOString();
                              const isBlocked = blockedSlots.has(slotId);
                              const isCalendarBusy = myBusySlots.has(slotId);
                              const slotEvent = busySlotEventMap.get(slotId);

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
                                  title={
                                    slotEvent
                                      ? `${slotEvent.title ?? '일정'}\n${
                                          slotEvent.calendarTitle ?? '캘린더'
                                        }\n${slotEvent.location ?? '장소 없음'}`
                                      : ''
                                  }
                                  onPointerDown={(event) => {
                                    if (!inRange) return;
                                    event.preventDefault();
                                    const nextMode = isBlocked
                                      ? 'remove'
                                      : 'add';
                                    setDragMode(nextMode);
                                    setIsDragging(true);
                                    handleToggleSlot(slotId, nextMode);
                                  }}
                                  onPointerEnter={() => {
                                    if (!isDragging || !inRange) return;
                                    handleToggleSlot(slotId, dragMode);
                                  }}
                                  onMouseEnter={(event) => {
                                    if (isDragging || !slotEvent) return;
                                    setHoveredCalendarEvent({
                                      event: slotEvent,
                                      x: event.clientX,
                                      y: event.clientY,
                                    });
                                  }}
                                  onMouseLeave={() =>
                                    setHoveredCalendarEvent(null)
                                  }
                                />
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {hoveredCalendarEvent && (
                  <div
                    className="fixed z-50 w-64 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg"
                    style={{
                      top: hoveredCalendarEvent.y + 12,
                      left: hoveredCalendarEvent.x + 12,
                    }}
                  >
                    <div className="font-semibold text-gray-800 mb-1">
                      {hoveredCalendarEvent.event.title ?? '일정'}
                    </div>
                    <div className="text-[11px] text-gray-500 mb-1">
                      {hoveredCalendarEvent.event.calendarTitle ?? '캘린더'}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {hoveredCalendarEvent.event.location || '장소 없음'}
                    </div>
                  </div>
                )}

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
                      <Save />
                      {savingBlocks ? '저장 중...' : '차단 시간 저장'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!isAuthenticated && (
          <div className="border border-gray-200 rounded-lg p-5 sm:p-8 text-center">
            <p className="text-gray-600 mb-4">
              로그인하여 일정을 연동하고 최적의 약속 시간을 함께 찾아보세요.
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

// const isSameDay = (left: Date, right: Date) =>
//   left.getFullYear() === right.getFullYear() &&
//   left.getMonth() === right.getMonth() &&
//   left.getDate() === right.getDate();

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

const isWithinActiveHours = (start: Date, end: Date) => {
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const startDay = startOfDay(start);
  const endDay = startOfDay(end);
  const dayDiff = Math.round(
    (endDay.getTime() - startDay.getTime()) / 86_400_000,
  );
  const endMinutesRaw = end.getHours() * 60 + end.getMinutes();
  const ACTIVE_START = 9 * 60;
  const ACTIVE_END_NEXT = 2 * 60;
  if (dayDiff === 0) {
    return startMinutes >= ACTIVE_START;
  }
  if (dayDiff === 1) {
    return startMinutes >= ACTIVE_START && endMinutesRaw <= ACTIVE_END_NEXT;
  }
  return false;
};

const getAvailableCountForRange = (
  start: Date,
  end: Date,
  participants: ParticipantInfo[],
  availabilityDocs: Map<string, AvailabilityDoc>,
) => {
  let availableCount = 0;
  participants.forEach((participant) => {
    const doc = availabilityDocs.get(participant.uid);
    if (!doc) {
      availableCount += 1;
      return;
    }
    const isBusy = doc.busyBlocks.some((block) =>
      blocksOverlap(start, end, block),
    );
    if (!isBusy) {
      availableCount += 1;
    }
  });
  return availableCount;
};

const getSlotAvailabilityDetails = (
  startTime: string,
  endTime: string,
  participants: Array<{ uid: string; label: string }>,
  availabilityDocs: Map<string, AvailabilityDoc>,
) => {
  const slotStart = new Date(startTime);
  const slotEnd = new Date(endTime);
  const available: string[] = [];
  const unavailable: string[] = [];

  participants.forEach((participant) => {
    const doc = availabilityDocs.get(participant.uid);
    if (!doc) {
      available.push(`${participant.label} (미응답)`);
      return;
    }
    const isBusy = doc.busyBlocks.some((block) =>
      blocksOverlap(slotStart, slotEnd, block),
    );
    if (isBusy) {
      unavailable.push(participant.label);
    } else {
      available.push(participant.label);
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
