export const Footer: React.FC = () => {
  return (
    <footer className="bg-neutral-100 dark:bg-neutral-925">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12 text-center">
        <p className="mb-4 text-neutral-800 dark:text-neutral-200 text-md sm:text-lg font-semibold">
          MyTT
        </p>
        <p className="mb-4 text-neutral-800 dark:text-neutral-200 text-sm sm:text-base">
          Made with ❤️ by Team{' '}
          <a
            href="https://wevoid.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-900 dark:text-neutral-100 font-medium underline"
          >
            VO!D
          </a>
        </p>
        <a
          href="https://wevoid.com/privacy-policy"
          className="text-neutral-600 dark:text-neutral-400 hover:underline text-sm sm:text-base"
        >
          개인정보처리방침
        </a>
        <a
          href="https://wevoid.com/terms"
          className="ml-4 text-neutral-600 dark:text-neutral-400 hover:underline text-sm sm:text-base"
        >
          이용약관
        </a>
      </div>
    </footer>
  );
};
