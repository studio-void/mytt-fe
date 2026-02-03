import { forwardRef, useState } from 'react';

import { Link, useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';

import { authApi } from '@/services/api/authApi';
import { useAuthStore } from '@/store/useAuthStore';

import { Button } from './ui/button';

export const Header = forwardRef<
  HTMLElementTagNameMap['header'],
  React.HTMLAttributes<HTMLElementTagNameMap['header']>
>((_, ref) => {
  const navigate = useNavigate();
  const { isAuthenticated, user, isAuthReady } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const displayName =
    user?.nickname ?? user?.displayName ?? user?.email ?? '사용자';
  const avatarFallback = displayName.slice(0, 2).toUpperCase();

  const handleLogout = () => {
    setIsMobileMenuOpen(false);
    authApi.logout().finally(() => {
      navigate({ to: '/' });
    });
  };

  return (
    <header
      ref={ref}
      className="border-b border-gray-200 bg-white sticky top-0 z-50"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex gap-4 justify-between items-center">
        <nav className="flex flex-row gap-8 items-center">
          <Link
            to="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className="inline-flex items-center hover:opacity-90"
          >
            <img
              src="/MyTT.svg"
              alt="MyTT"
              className="h-7 w-auto translate-y-0.5"
            />
          </Link>

          {isAuthenticated && (
            <div className="hidden md:flex flex-row gap-8 items-center">
              <Link
                to="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                대시보드
              </Link>
              <Link
                to="/schedule/calendar"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                캘린더
              </Link>
            </div>
          )}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-600">
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={displayName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      avatarFallback
                    )}
                  </span>
                  <span>{displayName}님</span>
                </Link>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut />
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

          <button
            type="button"
            aria-label={isMobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-controls="mobile-menu"
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="md:hidden inline-flex items-center justify-center rounded-md border border-gray-200 p-2 text-gray-700 hover:bg-gray-50"
          >
            {isMobileMenuOpen ? (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="M6 6 18 18" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div id="mobile-menu" className="md:hidden border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-2">
            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2 text-gray-700 hover:text-gray-900 font-medium"
                >
                  대시보드
                </Link>
                <Link
                  to="/schedule/calendar"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="py-2 text-gray-700 hover:text-gray-900 font-medium"
                >
                  캘린더
                </Link>

                <div className="pt-2 mt-2 border-t border-gray-100 flex items-center justify-between gap-3">
                  <Link
                    to="/settings"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-600">
                      {user?.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={displayName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        avatarFallback
                      )}
                    </span>
                    <span className="truncate max-w-[140px]">
                      {displayName}
                    </span>
                  </Link>
                  <Button variant="outline" size="sm" onClick={handleLogout}>
                    <LogOut />
                    로그아웃
                  </Button>
                </div>
              </>
            ) : (
              <Link to="/auth/login" onClick={() => setIsMobileMenuOpen(false)}>
                <Button size="sm" disabled={!isAuthReady} className="w-full">
                  시작하기
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
});
