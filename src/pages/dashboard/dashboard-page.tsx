import { useEffect } from 'react';

import { useNavigate } from '@tanstack/react-router';

import { Layout } from '@/components';
import { useAuthStore } from '@/store/useAuthStore';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();

  useEffect(() => {
    if (isAuthReady && !isAuthenticated) {
      navigate({ to: '/auth/login' });
    }
  }, [isAuthenticated, isAuthReady, navigate]);

  const handleMeeting = () => {
    navigate({ to: '/meeting' });
  };

  const handleShareSchedule = () => {
    navigate({ to: '/schedule/share' });
  };

  const handleViewCalendar = () => {
    navigate({ to: '/schedule/calendar' });
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-2">대시보드</h1>
          <p className="text-gray-600 text-lg">원하는 기능을 선택하세요</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <button
            onClick={handleMeeting}
            className="p-8 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors text-left group"
          >
            <div className="text-4xl mb-4">📅</div>
            <h3 className="text-xl font-semibold mb-3 group-hover:text-gray-900">
              약속 잡기
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              링크를 공유하여 여러 사람과 함께 공통으로 가능한 시간을 찾아보세요
            </p>
          </button>

          <button
            onClick={handleShareSchedule}
            className="p-8 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors text-left group"
          >
            <div className="text-4xl mb-4">🔗</div>
            <h3 className="text-xl font-semibold mb-3 group-hover:text-gray-900">
              일정 공유
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              내 일정을 링크로 공유하고 공개 범위를 설정할 수 있습니다
            </p>
          </button>

          <button
            onClick={handleViewCalendar}
            className="p-8 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors text-left group"
          >
            <div className="text-4xl mb-4">📆</div>
            <h3 className="text-xl font-semibold mb-3 group-hover:text-gray-900">
              내 캘린더
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Google Calendar와 동기화된 내 일정을 확인하세요
            </p>
          </button>

          <button
            onClick={() => navigate({ to: '/meeting/join' })}
            className="p-8 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors text-left group"
          >
            <div className="text-4xl mb-4">✉️</div>
            <h3 className="text-xl font-semibold mb-3 group-hover:text-gray-900">
              약속 참여
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              초대 코드로 다른 사람의 약속에 참여하세요
            </p>
          </button>
        </div>
      </div>
    </Layout>
  );
};
