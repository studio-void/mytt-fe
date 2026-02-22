import { useEffect, useMemo, useState } from 'react';

import { useNavigate, useParams } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarPlus,
  Check,
  Copy,
  Crown,
  ExternalLink,
  LogOut,
  Pencil,
  Trash,
  User,
  UserMinus,
} from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type GroupRole, groupApi } from '@/services/api/groupApi';
import { meetingApi } from '@/services/api/meetingApi';
import { useAuthStore } from '@/store/useAuthStore';
import { setPageMeta } from '@/utils/meta';

interface GroupInfo {
  id: string;
  title: string;
  description?: string | null;
  inviteCode: string;
  masterUid: string;
}

interface MemberInfo {
  uid: string;
  role: GroupRole;
  email: string | null;
  displayName: string | null;
  nickname: string | null;
  photoURL: string | null;
}

interface MeetingSummary {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  inviteCode: string;
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

export function GroupDetailPage() {
  const { groupId } = useParams({ strict: false });
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [groupMeetings, setGroupMeetings] = useState<MeetingSummary[]>([]);
  const [updating, setUpdating] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDescription, setGroupDescription] = useState('');

  useEffect(() => {
    if (isAuthReady && !isAuthenticated) {
      navigate({ to: '/auth/login' });
      return;
    }
    if (isAuthenticated && groupId) {
      loadGroup();
    }
  }, [groupId, isAuthenticated, isAuthReady, navigate]);

  useEffect(() => {
    if (!group) return;
    setPageMeta({
      title: group.title || 'MyTT',
      description: group.description || '약속 잡기는 MyTT',
    });
  }, [group]);

  const loadGroup = async () => {
    if (!groupId) return;
    try {
      setLoading(true);
      const [groupResponse, membersResponse] = await Promise.all([
        groupApi.getGroupById(groupId),
        groupApi.getGroupMembers(groupId),
      ]);
      setGroup(groupResponse.data as GroupInfo);
      setGroupTitle((groupResponse.data as GroupInfo).title);
      setGroupDescription((groupResponse.data as GroupInfo).description ?? '');
      setMembers(membersResponse.data as MemberInfo[]);
      const meetingsResponse = await meetingApi.getMeetingsByGroup(groupId);
      setGroupMeetings(meetingsResponse.data as MeetingSummary[]);
    } catch (error) {
      console.error('Error loading group:', error);
      toast.error('그룹 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const myRole = useMemo(() => {
    if (!user?.uid) return 'member';
    return members.find((member) => member.uid === user.uid)?.role ?? 'member';
  }, [members, user?.uid]);

  const canManageMembers = myRole === 'master' || myRole === 'manager';
  const canManageManagers = myRole === 'master';
  const canManageGroupMeetings = myRole === 'master' || myRole === 'manager';

  const inviteLink = group
    ? `${window.location.origin}/group/invite/${group.inviteCode}`
    : '';

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    toast.success('초대 링크가 복사되었습니다.');
    setCopiedInvite(true);
    window.setTimeout(() => {
      setCopiedInvite(false);
    }, 1200);
  };

  const handleRoleChange = async (memberId: string, role: GroupRole) => {
    if (!groupId) return;
    try {
      setUpdating(true);
      await groupApi.updateMemberRole(groupId, memberId, role);
      await loadGroup();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('역할 변경에 실패했습니다.');
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!groupId) return;
    const confirmed = window.confirm('해당 멤버를 그룹에서 제거할까요?');
    if (!confirmed) return;
    try {
      setUpdating(true);
      await groupApi.removeMember(groupId, memberId);
      await loadGroup();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('멤버 삭제에 실패했습니다.');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelegateMaster = async (memberId: string, memberLabel: string) => {
    if (!groupId) return;
    const confirmed = window.confirm(
      `${memberLabel}님에게 마스터를 위임할까요? 위임 후 내 역할은 매니저로 변경됩니다.`,
    );
    if (!confirmed) return;
    try {
      setUpdating(true);
      await groupApi.delegateMaster(groupId, memberId);
      toast.success('마스터가 위임되었습니다.');
      await loadGroup();
    } catch (error) {
      console.error('Error delegating master:', error);
      toast.error(
        error instanceof Error ? error.message : '마스터 위임에 실패했습니다.',
      );
    } finally {
      setUpdating(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!groupId || !user?.uid) return;
    const confirmed = window.confirm('그룹에서 나가시겠어요?');
    if (!confirmed) return;
    try {
      setUpdating(true);
      await groupApi.removeMember(groupId, user.uid);
      toast.success('그룹에서 나갔습니다.');
      navigate({ to: '/group' });
    } catch (error) {
      console.error('Error leaving group:', error);
      toast.error('그룹 나가기에 실패했습니다.');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupId) return;
    const confirmed = window.confirm('그룹을 삭제할까요? 되돌릴 수 없습니다.');
    if (!confirmed) return;
    try {
      setUpdating(true);
      await groupApi.deleteGroup(groupId);
      toast.success('그룹이 삭제되었습니다.');
      navigate({ to: '/group' });
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('그룹 삭제에 실패했습니다.');
    } finally {
      setUpdating(false);
    }
  };

  const handleCreateGroupMeeting = () => {
    if (!groupId) return;
    window.location.href = `/meeting/create?groupId=${encodeURIComponent(groupId)}`;
  };

  const handleUpdateGroup = async () => {
    if (!groupId) return;
    if (!groupTitle.trim()) {
      toast.error('그룹 이름을 입력해주세요.');
      return;
    }
    try {
      setUpdating(true);
      await groupApi.updateGroup(groupId, {
        title: groupTitle.trim(),
        description: groupDescription.trim() || undefined,
      });
      toast.success('그룹 정보가 수정되었습니다.');
      setEditingGroup(false);
      await loadGroup();
    } catch (error) {
      console.error('Error updating group:', error);
      toast.error('그룹 정보 수정에 실패했습니다.');
    } finally {
      setUpdating(false);
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

  if (loading) {
    return (
      <Layout disableHeaderHeight>
        <div className="mx-auto py-16">
          <div className="text-center">로딩 중...</div>
        </div>
      </Layout>
    );
  }

  if (!group) {
    return (
      <Layout disableHeaderHeight>
        <div className="mx-auto py-16">
          <div className="text-center">그룹을 찾을 수 없습니다.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout disableHeaderHeight>
      <div className="mx-auto py-10 sm:py-16">
        <div className="border border-gray-200 rounded-lg p-5 sm:p-8 mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold">
                  {group.title}
                </h1>
                {myRole !== 'member' && (
                  <Crown className={`h-6 w-6 ${roleCrownColor[myRole]}`} />
                )}
              </div>
              {group.description && (
                <p className="text-gray-600 mt-2">{group.description}</p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                내 역할: {roleLabel[myRole]}
              </p>
              {myRole === 'master' && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingGroup((prev) => !prev)}
                  >
                    <Pencil />
                    {editingGroup ? '수정 취소' : '그룹 정보 수정'}
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleCopyInvite}>
                <AnimatePresence mode="wait" initial={false}>
                  {copiedInvite ? (
                    <motion.span
                      key="check"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.18 }}
                      className="inline-flex"
                    >
                      <Check />
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
                      <Copy />
                    </motion.span>
                  )}
                </AnimatePresence>
                초대 링크 복사
              </Button>
              {canManageGroupMeetings && (
                <Button onClick={handleCreateGroupMeeting}>
                  <CalendarPlus />새 약속 만들기
                </Button>
              )}
              {myRole === 'master' && (
                <Button
                  variant="destructive"
                  onClick={handleDeleteGroup}
                  disabled={updating}
                >
                  <Trash />
                  그룹 삭제
                </Button>
              )}
              {myRole !== 'master' && (
                <Button
                  variant="destructive"
                  onClick={handleLeaveGroup}
                  disabled={updating}
                >
                  <LogOut />
                  그룹 나가기
                </Button>
              )}
            </div>
          </div>
        </div>

        {myRole === 'master' && editingGroup && (
          <div className="border border-gray-200 rounded-lg p-5 sm:p-8 mb-6">
            <h2 className="text-lg font-semibold mb-4">그룹 정보 수정</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  그룹 이름
                </label>
                <Input
                  value={groupTitle}
                  onChange={(event) => setGroupTitle(event.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">설명</label>
                <textarea
                  value={groupDescription}
                  onChange={(event) => setGroupDescription(event.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-white"
                />
              </div>
              <Button onClick={handleUpdateGroup} disabled={updating}>
                저장
              </Button>
            </div>
          </div>
        )}

        {canManageGroupMeetings && (
          <div className="border border-gray-200 rounded-lg p-5 sm:p-8 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              그룹 약속 ({groupMeetings.length}개)
            </h2>
            {groupMeetings.length === 0 ? (
              <p className="text-sm text-gray-500">
                아직 생성된 그룹 약속이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {groupMeetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    className="flex flex-col gap-2 rounded-md border border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{meeting.title}</p>
                      <p className="text-xs text-gray-500">
                        {formatMeetingRange(meeting.startTime, meeting.endTime)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() =>
                        navigate({ to: `/meeting/${meeting.inviteCode}` })
                      }
                    >
                      <ExternalLink />
                      열기
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border border-gray-200 rounded-lg p-5 sm:p-8">
          <h2 className="text-lg font-semibold mb-4">
            멤버 ({members.length}명)
          </h2>
          <div className="space-y-3">
            {members.map((member) => {
              const label =
                member.nickname ??
                member.displayName ??
                member.email ??
                member.uid;
              const isMaster = member.role === 'master';
              const canRemove =
                canManageMembers &&
                !isMaster &&
                (myRole !== 'manager' || member.role === 'member');
              return (
                <div
                  key={member.uid}
                  className="flex flex-col gap-2 rounded-md border border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{label}</span>
                      {member.role !== 'member' && (
                        <Crown
                          className={`h-3.5 w-3.5 ${
                            roleCrownColor[member.role]
                          }`}
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {roleLabel[member.role]}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canManageManagers && !isMaster && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelegateMaster(member.uid, label)}
                          disabled={updating}
                        >
                          <Crown />
                          마스터 위임
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            member.role === 'manager' ? 'default' : 'outline'
                          }
                          onClick={() =>
                            handleRoleChange(member.uid, 'manager')
                          }
                          disabled={updating}
                        >
                          <Crown />
                          매니저
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            member.role === 'member' ? 'default' : 'outline'
                          }
                          onClick={() => handleRoleChange(member.uid, 'member')}
                          disabled={updating}
                        >
                          <User />
                          멤버
                        </Button>
                      </>
                    )}
                    {canRemove && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRemoveMember(member.uid)}
                        disabled={updating}
                      >
                        <UserMinus />
                        제거
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
}
