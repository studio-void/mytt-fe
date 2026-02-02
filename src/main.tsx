import { StrictMode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { Toaster, toast } from 'sonner';

import '@/styles.css';

import { AuthProvider } from './components/auth/auth-provider';
import { NotFoundPage } from './pages';
import { routeTree } from './routeTree.gen';

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
  defaultNotFoundComponent: () => <NotFoundPage />,
  defaultViewTransition: true,
});

const formatConsoleArgs = (args: unknown[]) => {
  const [first] = args;
  if (first instanceof Error) {
    return first.message;
  }
  if (typeof first === 'string') {
    return first;
  }
  try {
    return JSON.stringify(first);
  } catch {
    return '알 수 없는 오류가 발생했습니다.';
  }
};

const shouldToastError = (args: unknown[]) => {
  const message = formatConsoleArgs(args).toLowerCase();
  if (!message) return false;
  if (message.includes('client is offline')) return false;
  if (message.includes('failed to get document because the client is offline')) {
    return false;
  }
  if (message.includes('network error')) return false;
  return true;
};

const toastDedup = (() => {
  const lastShown = new Map<string, number>();
  const windowMs = 5_000;
  return (message: string) => {
    const now = Date.now();
    const last = lastShown.get(message) ?? 0;
    if (now - last < windowMs) {
      return;
    }
    lastShown.set(message, now);
    toast.error(message);
  };
})();

const patchConsoleErrors = () => {
  const globalRef = window as typeof window & { __myttConsolePatched?: boolean };
  if (globalRef.__myttConsolePatched) return;
  globalRef.__myttConsolePatched = true;

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalError(...args);
    if (!shouldToastError(args)) return;
    const message = formatConsoleArgs(args);
    toastDedup(message);
  };
};

patchConsoleErrors();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('app');
if (rootElement && !rootElement.innerHTML) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
