import { useEffect, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Crown, Plus, User, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { type GroupRole, groupApi } from '@/services/api/groupApi';
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
  groupId?: string | null;
  groupTitle?: string | null;
}

export function MeetingListPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [joinedMeetings, setJoinedMeetings] = useState<MeetingSummary[]>([]);
  const [copiedInviteCode, setCopiedInviteCode] = useState<string | null>(null);
  const [groupRoleMap, setGroupRoleMap] = useState<
    Record<string, { title: string; role: GroupRole }>
  >({});

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
      const [hostedResponse, joinedResponse, groupsResponse] =
        await Promise.all([
          meetingApi.getMyMeetings(),
          meetingApi.getJoinedMeetings(),
          groupApi.getMyGroups(),
        ]);
      setMeetings(hostedResponse.data ?? []);
      setJoinedMeetings(joinedResponse.data ?? []);
      const map: Record<string, { title: string; role: GroupRole }> = {};
      (groupsResponse.data ?? []).forEach((group) => {
        map[group.id] = { title: group.title, role: group.role };
      });
      setGroupRoleMap(map);
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

  const isMidnight = (date: Date) =>
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;

  const isSameDate = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

  const formatDateOnly = (value: Date) =>
    value.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const formatMeetingRange = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isMidnight(end) && end.getTime() > start.getTime()) {
      const endDateForDisplay = new Date(end);
      endDateForDisplay.setDate(endDateForDisplay.getDate() - 1);
      const startLabel = formatDateTime(startTime);
      if (isSameDate(start, endDateForDisplay)) {
        return `${startLabel} - 24:00`;
      }
      return `${startLabel} - ${formatDateOnly(endDateForDisplay)} 24:00`;
    }
    return `${formatDateTime(startTime)} - ${formatDateTime(endTime)}`;
  };

  const isPastMeeting = (endTime: string) => new Date(endTime) < new Date();

  const roleBadge = (role?: GroupRole) => {
    if (role === 'master') {
      return <Crown className="h-3.5 w-3.5 text-amber-500" />;
    }
    if (role === 'manager') {
      return <Crown className="h-3.5 w-3.5 text-gray-400" />;
    }
    return <User className="h-3.5 w-3.5 text-gray-400" />;
  };

  const GroupBadgeButton = ({ meeting }: { meeting: MeetingSummary }) => {
    if (!meeting.groupId) return null;
    const meta = groupRoleMap[meeting.groupId];
    if (!meta) return null;
    return (
      <button
        type="button"
        onClick={() => navigate({ to: `/group/${meeting.groupId}` })}
        className="group relative inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:text-gray-700 hover:border-gray-400"
        aria-label="그룹 이동"
      >
        <Users className="h-4 w-4" />
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center gap-1">
            {roleBadge(meta.role)}
            {meta.title}
          </span>
        </span>
      </button>
    );
  };

  const handleCopyInviteLink = (inviteCode: string) => {
    const link = `${window.location.origin}/meeting/${inviteCode}`;
    navigator.clipboard.writeText(link);
    toast.success('초대 링크가 복사되었습니다!');
    setCopiedInviteCode(inviteCode);
    window.setTimeout(() => {
      setCopiedInviteCode((current) =>
        current === inviteCode ? null : current,
      );
    }, 1200);
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
      <div className="mx-auto py-16">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold mb-1">내 약속</h1>
            <p className="text-gray-600">
              내가 만들었거나 참여 중인 약속을 확인하세요.
            </p>
          </div>
          <Button onClick={() => navigate({ to: '/meeting/create' })}>
            <Plus /> 새 약속 만들기
          </Button>
        </div>

        {meetings.length === 0 && joinedMeetings.length === 0 ? (
          <div className="border border-gray-200 rounded-lg p-10 text-center">
            <p className="text-gray-600 mb-4">
              아직 만든 약속이 없습니다. 새 약속을 만들어보세요!
            </p>
            {/* <Button onClick={() => navigate({ to: '/meeting/create' })}>
              새 약속 만들기
            </Button> */}
          </div>
        ) : (
          <div className="space-y-10">
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">내가 만든 약속</h2>
                {/* <Button onClick={() => navigate({ to: '/meeting/create' })}>
                  <Plus /> 새 약속 만들기
                </Button> */}
              </div>
              {meetings.length === 0 ? (
                <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-500">
                  아직 만든 약속이 없습니다.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {meetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className={`border border-gray-200 rounded-lg p-6 ${
                        isPastMeeting(meeting.endTime)
                          ? 'bg-gray-50'
                          : 'bg-white'
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <h2 className="text-lg font-semibold">
                          {meeting.title}
                        </h2>
                        <GroupBadgeButton meeting={meeting} />
                      </div>
                      <p className="text-sm text-gray-600">
                        {formatMeetingRange(meeting.startTime, meeting.endTime)}
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
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span>초대 코드: {meeting.inviteCode}</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyInviteLink(meeting.inviteCode)
                            }
                            className="text-gray-400 hover:text-gray-700"
                            aria-label="초대 링크 복사"
                          >
                            <AnimatePresence mode="wait" initial={false}>
                              {copiedInviteCode === meeting.inviteCode ? (
                                <motion.span
                                  key="check"
                                  initial={{ opacity: 0, scale: 0.6 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.6 }}
                                  transition={{ duration: 0.18 }}
                                  className="inline-flex"
                                >
                                  <Check size={14} />
                                </motion.span>
                              ) : (
                                <motion.span
                                  key="copy"
                                  initial={{ opacity: 0, scale: 0.6 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.6 }}
                                  transition={{ duration: 0.18 }}
                                  className="inline-flex"
                                >
                                  <Copy size={14} />
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </button>
                        </div>
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
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">참여 중인 약속</h2>
              </div>
              {joinedMeetings.length === 0 ? (
                <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-500">
                  아직 참여 중인 약속이 없습니다.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {joinedMeetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className={`border border-gray-200 rounded-lg p-6 ${
                        isPastMeeting(meeting.endTime)
                          ? 'bg-gray-50'
                          : 'bg-white'
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <h2 className="text-lg font-semibold">
                          {meeting.title}
                        </h2>
                        <GroupBadgeButton meeting={meeting} />
                      </div>
                      <p className="text-sm text-gray-600">
                        {formatMeetingRange(meeting.startTime, meeting.endTime)}
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
                      <div className="flex items-center justify-end mt-4">
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
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}
