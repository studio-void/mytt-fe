import { useEffect, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { calendarApi } from '@/services/api/calendarApi';
import { sharingApi } from '@/services/api/sharingApi';
import { useAuthStore } from '@/store/useAuthStore';

type PrivacyLevel = 'busy_only' | 'basic_info' | 'full_details';

export function ShareSchedulePage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>('busy_only');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: '/auth/login' });
      return;
    }
    loadSettings();
  }, [isAuthenticated]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await sharingApi.getSettings();
      if (response.data) {
        setSettings(response.data);
        setPrivacyLevel(response.data.privacyLevel);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCalendar = async () => {
    try {
      setSyncing(true);
      const response = await calendarApi.syncCalendar();

      if (response.error) {
        toast.error(`캘린더 동기화 실패: ${response.error}`);
        setSyncing(false);
        return;
      }

      toast.success('캘린더가 동기화되었습니다!');
      await loadSettings();
    } catch (error) {
      console.error('Error syncing calendar:', error);
      toast.error('캘린더 동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateSettings = async () => {
    try {
      setLoading(true);
      await sharingApi.updateSettings({ privacyLevel });
      await loadSettings();
      toast.success('설정이 저장되었습니다!');
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('설정 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyShareLink = () => {
    if (!user?.id) {
      toast.error('사용자 정보를 불러올 수 없습니다.');
      return;
    }
    const shareUrl = `${window.location.origin}/schedule/view/${user.id}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('공유 링크가 복사되었습니다!');
  };

  if (loading && !settings) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto py-8">
          <div className="text-center">로딩 중...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">일정 공유</h1>
          <p className="text-gray-600">
            내 일정을 링크로 공유하고 공개 범위를 설정하세요
          </p>
        </div>

        {/* 캘린더 동기화 */}
        <div className="border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">📅 캘린더 동기화</h2>
          <p className="text-gray-600 mb-4">
            Google Calendar와 동기화하여 최신 일정을 불러옵니다
          </p>
          <Button onClick={handleSyncCalendar} disabled={syncing}>
            {syncing ? '동기화 중...' : '지금 동기화'}
          </Button>
        </div>

        {/* 공개 범위 설정 */}
        <div className="border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🔒 공개 범위 설정</h2>
          <p className="text-gray-600 mb-6">
            다른 사람이 내 일정을 볼 때 어떤 정보까지 공개할지 선택하세요
          </p>

          <div className="space-y-4">
            <label className="flex items-start p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-gray-900 transition-all">
              <input
                type="radio"
                name="privacyLevel"
                value="busy_only"
                checked={privacyLevel === 'busy_only'}
                onChange={(e) =>
                  setPrivacyLevel(e.target.value as PrivacyLevel)
                }
                className="mt-1 mr-4"
              />
              <div>
                <div className="font-semibold mb-1">
                  바쁜 시간만 표시 (기본)
                </div>
                <div className="text-sm text-gray-600">
                  일정이 있는 시간대만 블록으로 표시됩니다. 제목이나 상세정보는
                  공개되지 않습니다.
                </div>
              </div>
            </label>

            <label className="flex items-start p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-gray-900 transition-all">
              <input
                type="radio"
                name="privacyLevel"
                value="basic_info"
                checked={privacyLevel === 'basic_info'}
                onChange={(e) =>
                  setPrivacyLevel(e.target.value as PrivacyLevel)
                }
                className="mt-1 mr-4"
              />
              <div>
                <div className="font-semibold mb-1">기본 정보 표시</div>
                <div className="text-sm text-gray-600">
                  일정의 제목과 시간이 표시됩니다. 상세 설명은 공개되지
                  않습니다.
                </div>
              </div>
            </label>

            <label className="flex items-start p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-gray-900 transition-all">
              <input
                type="radio"
                name="privacyLevel"
                value="full_details"
                checked={privacyLevel === 'full_details'}
                onChange={(e) =>
                  setPrivacyLevel(e.target.value as PrivacyLevel)
                }
                className="mt-1 mr-4"
              />
              <div>
                <div className="font-semibold mb-1">전체 정보 공개</div>
                <div className="text-sm text-gray-600">
                  일정의 모든 정보(제목, 시간, 설명, 위치 등)가 공개됩니다.
                </div>
              </div>
            </label>
          </div>

          <div className="mt-6">
            <Button onClick={handleUpdateSettings} disabled={loading}>
              {loading ? '저장 중...' : '설정 저장'}
            </Button>
          </div>
        </div>

        {/* 공유 링크 */}
        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">🔗 공유 링크</h2>
          <p className="text-gray-600 mb-4">
            아래 링크를 복사하여 다른 사람과 공유하세요
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              readOnly
              value={
                user?.id
                  ? `${window.location.origin}/schedule/view/${user.id}`
                  : ''
              }
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md bg-gray-50"
            />
            <Button onClick={handleCopyShareLink}>링크 복사</Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
