import { forwardRef } from 'react';

import { Link, useNavigate } from '@tanstack/react-router';

import { authApi } from '@/services/api/authApi';
import { useAuthStore } from '@/store/useAuthStore';

import { Button } from './ui/button';

export const Header = forwardRef<
  HTMLElementTagNameMap['header'],
  React.HTMLAttributes<HTMLElementTagNameMap['header']>
>((_, ref) => {
  const navigate = useNavigate();
  const { isAuthenticated, user, isAuthReady } = useAuthStore();

  const handleLogout = () => {
    authApi.logout().finally(() => {
      navigate({ to: '/' });
    });
  };

  return (
    <header
      ref={ref}
      className="border-b border-gray-200 bg-white sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex gap-4 justify-between items-center">
        <nav className="flex flex-row gap-8 items-center">
          <Link
            to="/"
            className="text-2xl font-bold text-gray-900 hover:text-gray-700"
          >
            MyTT
          </Link>

          {isAuthenticated && (
            <>
              <Link
                to="/dashboard"
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                대시보드
              </Link>
              <Link
                to="/schedule/calendar"
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                캘린더
              </Link>
            </>
          )}
        </nav>

        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              {/* <Button size="sm" onClick={() => navigate({ to: '/dashboard' })}>
                대시보드
              </Button> */}
              <span className="text-sm text-gray-600">{user?.email}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                로그아웃
              </Button>
            </>
          ) : (
            <Link to="/auth/login">
              <Button size="sm" disabled={!isAuthReady}>
                시작하기
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
});
