import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { useLocation } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';

import { Footer } from './footer';
import { Header } from './header';
import { setPageMeta } from '@/utils/meta';

export const Layout: React.FC<
  PropsWithChildren<{ disableHeaderHeight?: boolean }>
> = ({ children, disableHeaderHeight }) => {
  const headerRef = useRef<HTMLElementTagNameMap['header']>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const location = useLocation();

  useEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl) return;

    const observer = new ResizeObserver(() => {
      setHeaderHeight(headerEl.offsetHeight);
    });

    observer.observe(headerEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPageMeta({
      title: 'MyTT',
      description: '약속 잡기와 일정 공유를 한 곳에서',
    });
  }, [location.pathname, location.searchStr]);

  return (
    <div className="min-h-screen w-full">
      <Header ref={headerRef} />
      <main
        style={{ paddingTop: disableHeaderHeight ? 0 : headerHeight }}
        className="w-full"
      >
        <div
          className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8"
          style={{ minHeight: `calc(100vh - ${headerHeight}px - 3rem)` }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${location.pathname}${location.searchStr}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <Footer />
    </div>
  );
};
