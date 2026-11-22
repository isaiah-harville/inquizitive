'use client';

import {
  BarChart3,
  CalendarClock,
  Clock,
  FolderClosed,
  Home,
  Library,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useApiQuery } from '@/hooks/use-api';
import { isMultiUser, useSession } from '@/hooks/use-session';
import { endOfDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AuthGate } from './auth-gate';
import { Logo } from './logo';
import { NewSetDialog } from './new-set-dialog';
import { SearchPalette } from './search-palette';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

function useNav(): NavItem[] {
  const { data: session } = useSession();
  const { data: due } = useApiQuery(['due-counts'], (api) => api.dueCounts(endOfDay()), {
    refetchInterval: 60_000,
  });
  const items: NavItem[] = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/library/', label: 'Library', icon: Library },
    { href: '/folders/', label: 'Folders', icon: FolderClosed },
    { href: '/recent/', label: 'Recent', icon: Clock },
    { href: '/review/', label: 'Due for review', icon: CalendarClock, badge: due?.dueNow },
    { href: '/stats/', label: 'Statistics', icon: BarChart3 },
  ];
  if (isMultiUser(session))
    items.splice(2, 0, { href: '/shared/', label: 'Shared sets', icon: Users });
  items.push({ href: '/settings/', label: 'Settings', icon: Settings });
  if (isMultiUser(session) && session?.user?.role === 'admin')
    items.push({ href: '/admin/', label: 'Admin', icon: ShieldCheck });
  return items;
}

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = useNav();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex h-11 items-center gap-3 rounded-lg px-3 font-semibold text-sm transition-colors',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
            )}
          >
            <item.icon className={cn('size-5', active ? 'text-primary' : 'opacity-70')} />
            <span className="flex-1">{item.label}</span>
            {!!item.badge && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 font-semibold text-[0.7rem] text-primary-foreground tabular-nums leading-none">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
      <DropdownMenuRadioItem value="light">
        <Sun /> Light
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <Moon /> Dark
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system">
        <Monitor /> System
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

function AccountMenu() {
  const { data: session } = useSession();
  const user = session?.user;
  const multi = isMultiUser(session);
  const signOut = async () => {
    await fetch('/api/auth/logout/', { method: 'POST', credentials: 'same-origin' });
    window.location.assign('/login/');
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account and appearance"
          className="flex size-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-sm uppercase outline-none ring-offset-2 ring-offset-background transition hover:brightness-110 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {(user?.displayName ?? '?').slice(0, 1)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {multi && (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="font-semibold">{user?.displayName}</div>
              <div className="text-muted-foreground text-xs">@{user?.username}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-muted-foreground text-xs">Theme</DropdownMenuLabel>
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        {multi && session?.config.authMode !== 'proxy' && (
          <DropdownMenuItem onSelect={signOut}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Top bar: logo, a big search field and the create button. */
function TopBar({
  onSearch,
  onNew,
  onMenu,
}: {
  onSearch: () => void;
  onNew: () => void;
  onMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenu}
          aria-label="Open navigation"
          className="md:hidden"
        >
          <Menu />
        </Button>
        <Link href="/" className="shrink-0 md:w-52">
          <Logo className="max-sm:[&>span]:hidden" />
        </Link>
        <button
          type="button"
          onClick={onSearch}
          aria-keyshortcuts="Meta+K Control+K"
          className="mx-auto flex h-10 w-full max-w-xl items-center gap-2.5 rounded-full bg-muted px-4 text-left text-muted-foreground text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate">Search sets, terms and tags</span>
          <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
        </button>
        <Button
          onClick={onNew}
          size="icon"
          className="size-10 shrink-0 rounded-full sm:w-auto sm:px-4"
          aria-label="Create a study set"
        >
          <Plus className="size-5" /> <span className="hidden sm:inline">Create</span>
        </Button>
        <AccountMenu />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <AuthGate>
      <div className="flex min-h-svh flex-col">
        <TopBar
          onSearch={() => setSearchOpen(true)}
          onNew={() => setNewOpen(true)}
          onMenu={() => setMobileOpen(true)}
        />
        <div className="flex flex-1">
          <aside className="sticky top-16 hidden h-[calc(100svh-4rem)] w-60 shrink-0 overflow-y-auto px-3 py-5 md:block">
            <NavLinks />
          </aside>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-4">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Logo className="mb-6 px-2" />
          <NavLinks onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <NewSetDialog open={newOpen} onOpenChange={setNewOpen} />
    </AuthGate>
  );
}

/** Standard page width + heading. */
export function Page({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8', className)}>
      {(title || actions) && (
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {title && <h1 className="font-bold text-2xl sm:text-[1.75rem]">{title}</h1>}
            {description && <p className="mt-1.5 text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
