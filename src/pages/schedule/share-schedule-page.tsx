import { useEffect, useMemo, useState } from 'react';

import { IconCalendar, IconLink } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { Edit, Pencil, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { calendarApi } from '@/services/api/calendarApi';
import {
  type PrivacyLevel,
  type ShareLink,
  type SharingAudience,
  sharingApi,
} from '@/services/api/sharingApi';
import { useAuthStore } from '@/store/useAuthStore';

const privacyLabels: Record<PrivacyLevel, string> = {
  busy_only: '제한 (바쁜 시간만)',
  basic_info: '일반 (제목+캘린더)',
  full_details: '상세 (전체 정보)',
};

const audienceLabels: Record<SharingAudience, string> = {
  public: '공개',
  restricted: '제한',
};

export function ShareSchedulePage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [linkId, setLinkId] = useState('');
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>('busy_only');
  const [audience, setAudience] = useState<SharingAudience>('public');
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!isAuthenticated) {
      navigate({ to: '/auth/login' });
      return;
    }
    loadLinks();
  }, [isAuthenticated, isAuthReady, navigate]);

  const loadLinks = async () => {
    try {
      setLoading(true);
      const response = await sharingApi.getShareLinks();
      setLinks(response.data ?? []);
    } catch (error) {
      console.error('Error loading share links:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setLinkId('');
    setPrivacyLevel('busy_only');
    setAudience('public');
    setAllowedEmails([]);
    setEmailInput('');
    setEditingLinkId(null);
  };

  const handleSyncCalendar = async () => {
    try {
      setSyncing(true);
      const response = await calendarApi.syncCalendar();

      if (response.error) {
        toast.error(`캘린더 동기화 실패: ${response.error}`);
        return;
      }

      await sharingApi.refreshShareLinksForOwner();
      await loadLinks();
      if (response.data?.skipped) {
        toast.message('동기화가 너무 빈번해 잠시 건너뛰었습니다.');
        return;
      }
      toast.success('캘린더가 동기화되었습니다!');
    } catch (error) {
      console.error('Error syncing calendar:', error);
      toast.error('캘린더 동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const handleAddEmail = () => {
    const next = emailInput.trim().toLowerCase();
    if (!next) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      toast.error('올바른 이메일을 입력해주세요.');
      return;
    }
    if (!allowedEmails.includes(next)) {
      setAllowedEmails((prev) => [...prev, next]);
    }
    setEmailInput('');
  };

  const handleRemoveEmail = (email: string) => {
    setAllowedEmails((prev) => prev.filter((item) => item !== email));
  };

  const handleSaveLink = async () => {
    try {
      setLoading(true);
      if (editingLinkId) {
        await sharingApi.updateShareLink(editingLinkId, {
          privacyLevel,
          audience,
          allowedEmails,
        });
        toast.success('공유 링크가 수정되었습니다.');
      } else {
        await sharingApi.createShareLink({
          linkId: linkId || undefined,
          privacyLevel,
          audience,
          allowedEmails,
        });
        toast.success('공유 링크가 생성되었습니다.');
      }
      await loadLinks();
      resetForm();
    } catch (error) {
      console.error('Error saving share link:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : '공유 링크 저장에 실패했습니다.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEditLink = (link: ShareLink) => {
    setEditingLinkId(link.id);
    setLinkId(link.linkId);
    setPrivacyLevel(link.privacyLevel);
    setAudience(link.audience);
    setAllowedEmails(link.allowedEmails ?? []);
    setEmailInput('');
  };

  const handleDeleteLink = async (link: ShareLink) => {
    if (!confirm('이 공유 링크를 삭제할까요?')) return;
    try {
      setLoading(true);
      await sharingApi.deleteShareLink(link.id);
      await loadLinks();
      if (editingLinkId === link.id) {
        resetForm();
      }
      toast.success('공유 링크가 삭제되었습니다.');
    } catch (error) {
      console.error('Error deleting share link:', error);
      toast.error('공유 링크 삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const linkList = useMemo(() => {
    return links.map((link) => ({
      ...link,
      url: `${window.location.origin}/schedule/view/${link.ownerUid}/${link.linkId}`,
    }));
  }, [links]);

  if (loading && links.length === 0) {
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
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">
            일정 공유
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            여러 개의 공유 링크를 만들고 각 링크별로 공개 범위를 설정하세요.
          </p>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 sm:p-6 mb-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
            <IconCalendar size={22} stroke={1.8} className="text-gray-700" />
            <span>캘린더 동기화</span>
          </h2>
          <p className="text-gray-600 mb-4 text-sm sm:text-base">
            Google Calendar와 동기화하여 최신 일정을 불러옵니다
          </p>
          <Button onClick={handleSyncCalendar} disabled={syncing}>
            <RefreshCw />
            {syncing ? '동기화 중...' : '지금 동기화'}
          </Button>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 sm:p-6 mb-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
            {editingLinkId ? <Edit /> : <Plus />}
            {editingLinkId ? '공유 링크 수정' : '새 공유 링크 만들기'}
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">링크 ID</label>
              <input
                type="text"
                value={linkId}
                onChange={(e) => setLinkId(e.target.value)}
                disabled={!!editingLinkId}
                placeholder="예: team-weekly (비워두면 자동 생성)"
                className="w-full px-3 py-2 border border-gray-200 rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">
                3~32자, 영문/숫자/-/_ 사용 가능
              </p>
            </div>

            <div className="space-y-4">
              {(Object.keys(privacyLabels) as PrivacyLevel[]).map((level) => (
                <label
                  key={level}
                  className="flex items-start p-4 border border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
                >
                  <input
                    type="radio"
                    name="privacyLevel"
                    value={level}
                    checked={privacyLevel === level}
                    onChange={() => setPrivacyLevel(level)}
                    className="mt-1 mr-4"
                  />
                  <div>
                    <div className="font-semibold mb-1">
                      {privacyLabels[level]}
                    </div>
                    <div className="text-sm text-gray-600">
                      {level === 'busy_only' &&
                        '일정이 있는 시간대만 표시됩니다.'}
                      {level === 'basic_info' &&
                        '제목과 캘린더 이름이 표시됩니다.'}
                      {level === 'full_details' &&
                        '제목, 시간, 설명, 위치 등 모든 정보가 표시됩니다.'}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">공유 대상</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="audience"
                    value="public"
                    checked={audience === 'public'}
                    onChange={() => setAudience('public')}
                  />
                  <span className="text-sm text-gray-700">
                    공개 - 링크가 있는 모든 사람
                  </span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="audience"
                    value="restricted"
                    checked={audience === 'restricted'}
                    onChange={() => setAudience('restricted')}
                  />
                  <span className="text-sm text-gray-700">
                    제한 - 지정한 사람만 열람
                  </span>
                </label>
              </div>

              {audience === 'restricted' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">
                    허용된 이메일
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddEmail();
                        }
                      }}
                      placeholder="example@email.com"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-md"
                    />
                    <Button type="button" onClick={handleAddEmail}>
                      추가
                    </Button>
                  </div>
                  {allowedEmails.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {allowedEmails.map((email) => (
                        <div
                          key={email}
                          className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-sm"
                        >
                          <span>{email}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(email)}
                            className="text-gray-400 hover:text-gray-700"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSaveLink} disabled={loading}>
                {editingLinkId ? <Pencil /> : <Plus />}
                {editingLinkId ? '수정 저장' : '링크 생성'}
              </Button>
              {editingLinkId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  취소
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
            <IconLink size={22} stroke={1.8} className="text-gray-700" />
            <span>내 공유 링크</span>
          </h2>
          {linkList.length === 0 ? (
            <p className="text-gray-500">등록된 공유 링크가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {linkList.map((link) => (
                <div
                  key={link.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-gray-500">링크 ID</p>
                        <p className="font-semibold text-gray-900">
                          {link.linkId}
                        </p>
                      </div>
                      <div className="text-sm text-gray-500">
                        {privacyLabels[link.privacyLevel]} ·{' '}
                        {audienceLabels[link.audience]}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <input
                        type="text"
                        readOnly
                        value={link.url}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm"
                      />
                      <Button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(link.url);
                          toast.success('공유 링크가 복사되었습니다!');
                        }}
                      >
                        복사
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleEditLink(link)}
                      >
                        편집
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleDeleteLink(link)}
                      >
                        삭제
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
