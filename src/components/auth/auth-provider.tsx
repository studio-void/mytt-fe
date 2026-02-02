import { useEffect } from 'react';
import type { PropsWithChildren } from 'react';

import { authApi } from '@/services/api/authApi';
import { useAuthStore } from '@/store/useAuthStore';

export const AuthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { reset } = useAuthStore();

  useEffect(() => {
    const unsubscribe = authApi.hydrateStoreFromAuth();
    return () => {
      unsubscribe();
      reset();
    };
  }, [reset]);

  return <>{children}</>;
};
