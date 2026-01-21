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
    <div className="min-h-screen w-full bg-white">
      <Header ref={headerRef} />
      <main
        style={{ paddingTop: disableHeaderHeight ? 0 : headerHeight }}
        className="px-4 sm:px-6 lg:px-8"
      >
        {children}
      </main>
      <Footer />
    </div>
  );
};
