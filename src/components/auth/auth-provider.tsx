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
      .then((result) => {
        if (result?.hasRedirectResult) {
          toast.success('Google 로그인 완료');
          return;
        }
        if (!result?.user) {
          toast.info(
            `리디렉트 결과 없음 (persistence: ${result?.persistence ?? 'unknown'})`,
          );
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
