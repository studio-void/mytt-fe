import { useEffect, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calendarApi } from '@/services/api/calendarApi';
import { meetingApi } from '@/services/api/meetingApi';
import { useAuthStore } from '@/store/useAuthStore';

export function CreateMeetingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    timezone: 'Asia/Seoul',
  });

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  useEffect(() => {
    if (isAuthReady && !isAuthenticated) {
      navigate({ to: '/auth/login' });
    }
  }, [isAuthenticated, isAuthReady, navigate]);

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.startTime || !formData.endTime) {
      toast.error('필수 항목을 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      // 미팅 생성
      const response = await meetingApi.createMeeting({
        title: formData.title,
        description: formData.description,
        startTime: new Date(formData.startTime).toISOString(),
        endTime: new Date(formData.endTime).toISOString(),
        timezone: formData.timezone,
      });

      const inviteCode = response.data.inviteCode;
      const shareUrl = `${window.location.origin}/meeting/${inviteCode}`;

      // 링크 복사
      navigator.clipboard.writeText(shareUrl);
      toast.success('약속이 생성되었습니다! 링크가 복사되었습니다.');

      // 공유 링크로 이동
      navigate({ to: `/meeting/${inviteCode}` });
    } catch (error) {
      console.error('Error creating meeting:', error);
      toast.error('약속 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    if (!formData.startTime || !formData.endTime) {
      toast.error('시작/종료 시간을 먼저 입력해주세요.');
      return;
    }
    try {
      setManualSyncing(true);
      const response = await calendarApi.syncCalendar(
        new Date(formData.startTime),
        new Date(formData.endTime),
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
    } catch (error) {
      console.error('Error syncing calendar:', error);
      toast.error('캘린더 동기화에 실패했습니다.');
    } finally {
      setManualSyncing(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto py-12">
        <div className="rounded-lg p-8">
          <h1 className="text-3xl font-bold mb-8">새 약속 만들기</h1>

          <form onSubmit={handleCreateMeeting} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                약속 제목 *
              </label>
              <Input
                type="text"
                name="title"
                placeholder="예: 팀 회의"
                value={formData.title}
                onChange={handleInputChange}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">설명</label>
              <textarea
                name="description"
                placeholder="약속에 대한 설명을 입력하세요"
                value={formData.description}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-md bg-white"
                rows={4}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  시작 시간 *
                </label>
                <Input
                  type="datetime-local"
                  name="startTime"
                  value={formData.startTime}
                  onChange={handleInputChange}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  종료 시간 *
                </label>
                <Input
                  type="datetime-local"
                  name="endTime"
                  value={formData.endTime}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">시간대</label>
              <select
                name="timezone"
                value={formData.timezone}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-200 rounded-md bg-white"
              >
                <option value="Asia/Seoul">서울 (Asia/Seoul)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">
                  뉴욕 (America/New_York)
                </option>
                <option value="Europe/London">런던 (Europe/London)</option>
                <option value="Asia/Tokyo">도쿄 (Asia/Tokyo)</option>
              </select>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? '생성 중...' : '약속 만들기'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleManualSync}
                disabled={manualSyncing}
              >
                {manualSyncing ? '동기화 중...' : '수동 동기화'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: '/' })}
              >
                취소
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
