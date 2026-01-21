import { useEffect } from 'react';

import { useNavigate, useSearch } from '@tanstack/react-router';

import { useAuthStore } from '@/store/useAuthStore';

export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const { setToken } = useAuthStore();
  const { token } = useSearch({ from: '/auth/callback' }) as { token?: string };

  useEffect(() => {
    if (token) {
      // 토큰 저장
      setToken(token);
      localStorage.setItem('token', token);

      // 홈으로 리디렉션
      navigate({ to: '/' });
    } else {
      // 토큰이 없으면 로그인으로
      navigate({ to: '/auth/login' });
    }
  }, [token, navigate, setToken]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-lg font-medium">인증 중...</p>
      </div>
    </div>
  );
}
