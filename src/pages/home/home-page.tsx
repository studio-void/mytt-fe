import { useNavigate } from '@tanstack/react-router';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const handleCreateMeeting = () => {
    navigate({ to: '/meeting/create' });
  };

  const handleShareSchedule = () => {
    navigate({ to: '/schedule/share' });
  };

  const handleViewCalendar = () => {
    navigate({ to: '/schedule/calendar' });
  };

  if (isAuthenticated) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">대시보드</h1>
            <p className="text-lg text-gray-600">원하는 기능을 선택하세요</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={handleCreateMeeting}
              className="p-8 border-2 border-gray-200 rounded-lg hover:border-gray-900 transition-all text-left group"
            >
              <div className="text-3xl mb-4">📅</div>
              <h3 className="text-2xl font-bold mb-2 group-hover:text-gray-700">
                약속 잡기
              </h3>
              <p className="text-gray-600">
                링크를 공유하여 여러 사람과 함께 공통으로 가능한 시간을
                찾아보세요
              </p>
            </button>

            <button
              onClick={handleShareSchedule}
              className="p-8 border-2 border-gray-200 rounded-lg hover:border-gray-900 transition-all text-left group"
            >
              <div className="text-3xl mb-4">🔗</div>
              <h3 className="text-2xl font-bold mb-2 group-hover:text-gray-700">
                일정 공유
              </h3>
              <p className="text-gray-600">
                내 일정을 링크로 공유하고 공개 범위를 설정할 수 있습니다
              </p>
            </button>

            <button
              onClick={handleViewCalendar}
              className="p-8 border-2 border-gray-200 rounded-lg hover:border-gray-900 transition-all text-left group"
            >
              <div className="text-3xl mb-4">📆</div>
              <h3 className="text-2xl font-bold mb-2 group-hover:text-gray-700">
                내 캘린더
              </h3>
              <p className="text-gray-600">
                Google Calendar와 동기화된 내 일정을 확인하세요
              </p>
            </button>

            <button
              onClick={() => navigate({ to: '/meeting/join' })}
              className="p-8 border-2 border-gray-200 rounded-lg hover:border-gray-900 transition-all text-left group"
            >
              <div className="text-3xl mb-4">✉️</div>
              <h3 className="text-2xl font-bold mb-2 group-hover:text-gray-700">
                약속 참여
              </h3>
              <p className="text-gray-600">
                초대 코드로 다른 사람의 약속에 참여하세요
              </p>
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-24 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">MyTT</h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Google Calendar를 연동하여 팀과 함께 공통 일정을 찾고,
          <br />
          효율적으로 약속을 잡으세요.
        </p>
        <Button size="lg" onClick={() => navigate({ to: '/auth/login' })}>
          시작하기
        </Button>

        <div className="grid md:grid-cols-3 gap-8 mt-24">
          <div className="p-6">
            <div className="text-4xl mb-4">📅</div>
            <h3 className="text-xl font-semibold mb-2">캘린더 동기화</h3>
            <p className="text-gray-600">
              Google Calendar와 자동 동기화하여 항상 최신 일정을 유지하세요
            </p>
          </div>

          <div className="p-6">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-xl font-semibold mb-2">팀 약속 관리</h3>
            <p className="text-gray-600">
              링크 공유로 팀원들과 함께 공통 가능한 시간을 찾아보세요
            </p>
          </div>

          <div className="p-6">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-semibold mb-2">개인정보 보호</h3>
            <p className="text-gray-600">
              공개 범위를 설정하여 원하는 만큼만 정보를 공개하세요
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};
