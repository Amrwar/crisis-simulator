'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

/**
 * The header every signed-in page shares.
 *
 * The MVP repeated the brand mark, the identity line and the sign-out button
 * on each page, so a new page either duplicated them again or quietly did
 * without navigation. This carries the nav as well, which is what makes the
 * leaderboard, analytics, achievements and settings pages reachable at all.
 */

export interface HeaderUser {
  email: string;
  name?: string | null;
}

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/achievements', label: 'Achievements' },
  { href: '/templates', label: 'Templates' },
];

export function AppHeader({ user }: { user: HeaderUser | null }) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/auth/login');
  }

  return (
    <header className="border-b border-bg-border bg-bg-secondary/50 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/dashboard" className="text-2xl font-bold shrink-0">
            <span className="text-text-primary">Crisis</span>
            <span className="text-accent-red">Sim</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(pathname, link.href) ? 'page' : undefined}
                className={
                  isActive(pathname, link.href)
                    ? 'text-sm font-medium text-text-primary bg-bg-hover px-3 py-1.5 rounded-lg'
                    : 'text-sm text-text-secondary hover:text-text-primary px-3 py-1.5 rounded-lg transition-colors'
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/settings"
            className="text-text-secondary text-sm hover:text-text-primary transition-colors truncate max-w-[12rem]"
          >
            {user?.name || user?.email || 'Account'}
          </Link>
          <button onClick={handleLogout} className="btn-ghost text-sm py-1.5 px-3">
            Sign out
          </button>
        </div>
      </div>

      {/* The nav collapses to a scrolling strip rather than a menu: there are
          only five destinations and they all fit on one line. */}
      <nav
        className="md:hidden border-t border-bg-border px-4 py-2 flex gap-1 overflow-x-auto"
        aria-label="Main"
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(pathname, link.href) ? 'page' : undefined}
            className={
              isActive(pathname, link.href)
                ? 'text-xs font-medium text-text-primary bg-bg-hover px-3 py-1.5 rounded-lg whitespace-nowrap'
                : 'text-xs text-text-secondary px-3 py-1.5 rounded-lg whitespace-nowrap'
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/**
 * A link is current for its own page and for anything beneath it, so
 * `/sim/abc/report` still highlights Dashboard rather than nothing.
 */
export function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
