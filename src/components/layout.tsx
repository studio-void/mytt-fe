import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { Footer } from './footer';
import { Header } from './header';

export const Layout: React.FC<
  PropsWithChildren<{ disableHeaderHeight?: boolean }>
> = ({ children, disableHeaderHeight }) => {
  const headerRef = useRef<HTMLElementTagNameMap['header']>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl) return;

    const observer = new ResizeObserver(() => {
      setHeaderHeight(headerEl.offsetHeight);
    });

    observer.observe(headerEl);
    return () => observer.disconnect();
  }, []);

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
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
};
