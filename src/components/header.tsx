import { forwardRef } from 'react';

import { Link } from '@tanstack/react-router';

export const Header = forwardRef<
  HTMLElementTagNameMap['header'],
  React.HTMLAttributes<HTMLElementTagNameMap['header']>
>((_, ref) => {
  return (
    <header
      ref={ref}
      className="p-2 flex gap-2 bg-white text-black justify-between"
    >
      <nav className="flex flex-row">
        <div className="px-2 font-bold">
          <Link to="/">Home</Link>
        </div>

        <div className="px-2 font-bold">TanStack Query</div>
      </nav>
    </header>
  );
});
