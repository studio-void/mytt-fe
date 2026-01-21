import { Layout } from '@/components';

export const NotFoundPage: React.FC = () => {
  return (
    <Layout disableHeaderHeight>
      <div className="w-full h-screen flex items-center justify-center">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-medium text-neutral-900 dark:text-neutral-50 m-0">
            404
          </h1>
          <p className="text-sm sm:text-base font-normal text-neutral-600 dark:text-neutral-400 m-0">
            This page could not be found.
          </p>
        </div>
      </div>
    </Layout>
  );
};
