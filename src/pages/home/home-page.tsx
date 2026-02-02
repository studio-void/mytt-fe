import { useEffect } from 'react';

import { useNavigate } from '@tanstack/react-router';

import { Layout } from '@/components';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();

  // 로그인하면 대시보드로 리다이렉트
  useEffect(() => {
    if (isAuthReady && isAuthenticated) {
      navigate({ to: '/dashboard' });
    }
  }, [isAuthenticated, isAuthReady, navigate]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-32 text-center">
        <h1 className="text-6xl font-bold mb-4">MyTT</h1>
        <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed">
          Google Calendar를 연동하여 팀과 함께 공통 일정을 찾고,
          <br />
          효율적으로 약속을 잡으세요.
        </p>
        <Button
          size="lg"
          onClick={() =>
            navigate({ to: isAuthenticated ? '/dashboard' : '/auth/login' })
          }
        >
          {isAuthenticated ? '대시보드' : '시작하기'}
        </Button>

        <div className="grid md:grid-cols-3 gap-8 mt-32">
          <div className="p-8">
            <div className="text-5xl mb-6">📅</div>
            <h3 className="text-lg font-semibold mb-3">캘린더 동기화</h3>
            <p className="text-gray-600 leading-relaxed">
              Google Calendar와 자동 동기화하여 항상 최신 일정을 유지하세요
            </p>
          </div>

          <div className="p-8">
            <div className="text-5xl mb-6">👥</div>
            <h3 className="text-lg font-semibold mb-3">팀 약속 관리</h3>
            <p className="text-gray-600 leading-relaxed">
              링크 공유로 팀원들과 함께 공통 가능한 시간을 찾아보세요
            </p>
          </div>

          <div className="p-8">
            <div className="text-5xl mb-6">🔒</div>
            <h3 className="text-lg font-semibold mb-3">개인정보 보호</h3>
            <p className="text-gray-600 leading-relaxed">
              공개 범위를 설정하여 원하는 만큼만 정보를 공개하세요
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};
