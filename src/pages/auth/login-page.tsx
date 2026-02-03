import { useEffect } from 'react';

import { useNavigate } from '@tanstack/react-router';

import { Layout } from '@/components';
import { GoogleLoginButton } from '@/components/auth/google-login-button';
import { useAuthStore } from '@/store/useAuthStore';

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthReady } = useAuthStore();

  useEffect(() => {
    if (isAuthReady && isAuthenticated) {
      navigate({ to: '/dashboard' });
    }
  }, [isAuthenticated, isAuthReady, navigate]);

  return (
    <Layout>
      <div className="flex items-center justify-center min-h-screen">
        <div className="rounded-lg p-8 max-w-lg w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-extrabold mb-2">MyTT</h1>
            <p className="text-gray-600 text-lg">
              함께 일정을 공유하고, 효율적으로 약속을 잡아보세요.
            </p>
          </div>

          <GoogleLoginButton />

          <p className="text-xs text-gray-500 text-center mt-6">
            Google 로그인으로 계속하면{' '}
            <a
              href="https://wevoid.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-700"
            >
              서비스 이용약관
            </a>{' '}
            및{' '}
            <a
              href="https://wevoid.com/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-700"
            >
              개인정보처리방침
            </a>
            에 동의하는 것입니다.
          </p>
        </div>
      </div>
    </Layout>
  );
}
