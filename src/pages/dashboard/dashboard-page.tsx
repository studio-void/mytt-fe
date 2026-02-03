import { useEffect } from 'react';

import {
  IconCalendar,
  IconCalendarEvent,
  IconLink,
  IconMail,
} from '@tabler/icons-react';
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
    <Layout disableHeaderHeight>
      <div className="min-h-screen flex items-center justify-center px-4 py-16 sm:py-16">
        <div className="w-full">
          <div className="text-center mb-10 sm:mb-16">
            <h1 className="text-3xl sm:text-4xl font-extrabold mb-2">
              대시보드
            </h1>
            <p className="text-gray-600 text-base sm:text-lg">
              약속 관리와 일정 공유를 시작해보세요
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <button
              onClick={handleMeeting}
              className="p-5 sm:p-8 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors text-left group"
            >
              <div className="mb-4 text-gray-800">
                <IconCalendarEvent size={40} stroke={1.7} />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 group-hover:text-gray-900">
                내 약속
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                링크를 공유하여 여러 사람과 함께 공통으로 가능한 시간을
                찾아보세요
              </p>
            </button>

            <button
              onClick={handleShareSchedule}
              className="p-5 sm:p-8 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors text-left group"
            >
              <div className="mb-4 text-gray-800">
                <IconLink size={40} stroke={1.7} />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 group-hover:text-gray-900">
                일정 공유
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                내 일정을 링크로 공유하고 공개 범위를 설정할 수 있습니다
              </p>
            </button>

            <button
              onClick={handleViewCalendar}
              className="p-5 sm:p-8 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors text-left group"
            >
              <div className="mb-4 text-gray-800">
                <IconCalendar size={40} stroke={1.7} />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 group-hover:text-gray-900">
                내 캘린더
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Google Calendar와 동기화된 내 일정을 확인하세요
              </p>
            </button>

            {/* <button
              onClick={() => navigate({ to: '/meeting/join' })}
              className="p-5 sm:p-8 border border-gray-200 rounded-lg hover:border-gray-400 transition-colors text-left group"
            >
              <div className="mb-4 text-gray-800">
                <IconMail size={40} stroke={1.7} />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-3 group-hover:text-gray-900">
                약속 참여
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                초대 코드로 다른 사람의 약속에 참여하세요
              </p>
            </button> */}
          </div>
        </div>
      </div>
    </Layout>
  );
};
