import { useAuthStore } from '@/store/useAuthStore';

export const Footer: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  return (
    <footer className="bg-neutral-100 dark:bg-neutral-925">
      <div className="px-4 sm:px-6 py-8 sm:py-12 text-center">
        <div className="mx-auto w-full max-w-7xl">
          {isAuthenticated ? (
            <p className="text-neutral-600 dark:text-neutral-400 text-sm sm:text-base">
              MyTT | © {new Date().getFullYear()} VO!D., All rights reserved.
            </p>
          ) : (
            <p className="text-neutral-600 dark:text-neutral-400 text-sm sm:text-base">
              MyTT | © {new Date().getFullYear()} VO!D., All rights reserved.
            </p>
          )}
        </div>
      </div>
    </footer>
  );
};
