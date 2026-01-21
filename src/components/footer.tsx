export const Footer: React.FC = () => {
  return (
    <footer className="bg-neutral-100 dark:bg-neutral-925">
      <div className="px-4 sm:px-6 py-8 sm:py-12 text-center">
        <div className="mx-auto w-full max-w-7xl">
          <p className="text-neutral-600 dark:text-neutral-400 text-sm sm:text-base">
            © {new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
