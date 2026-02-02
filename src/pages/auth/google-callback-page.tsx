import { useEffect } from 'react';

import { useNavigate } from '@tanstack/react-router';

import { useAuthStore } from '@/store/useAuthStore';

export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();

  useEffect(() => {
    if (!isAuthReady) return;
    if (isAuthenticated) {
      navigate({ to: '/dashboard' });
    } else {
      navigate({ to: '/auth/login' });
    }
  }, [isAuthenticated, isAuthReady, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400 mx-auto mb-4"></div>
        <p className="text-lg font-medium text-gray-600">인증 중...</p>
      </div>
    </div>
  );
}
