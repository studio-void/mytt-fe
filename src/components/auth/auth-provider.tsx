import { useEffect } from 'react';
import type { PropsWithChildren } from 'react';

import { toast } from 'sonner';

import { authApi } from '@/services/api/authApi';
import { useAuthStore } from '@/store/useAuthStore';

export const AuthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { reset } = useAuthStore();

  useEffect(() => {
    authApi
      .completeRedirectSignIn()
      .then((user) => {
        if (user) {
          toast.success('Google 로그인 완료');
        }
      })
      .catch((error) => {
        console.error('Failed to complete redirect sign-in:', error);
        const message =
          error instanceof Error
            ? error.message
            : '리디렉트 로그인 실패';
        toast.error(message);
      });
    const unsubscribe = authApi.hydrateStoreFromAuth();
    return () => {
      unsubscribe();
      reset();
    };
  }, [reset]);

  return <>{children}</>;
};
