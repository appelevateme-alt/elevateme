"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@/lib/types";
import { PUBLIC_NAV, ROLE_NAV } from "@/lib/nav";
import { roleHome, useMockAuth } from "@/lib/auth";

export function TopBar() {
  const { session, switchRole } = useMockAuth();
  const router = useRouter();
  const roles: Role[] = ["student", "parent", "coordinator", "evaluator", "admin"];

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-base font-bold tracking-tight">
          ElevateMe <span className="em-meta font-normal">· Diplomatic Impact</span>
        </Link>
        <nav aria-label="Public" className="hidden items-center gap-4 text-sm md:flex">
          {PUBLIC_NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-gray-600 hover:text-gray-900">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="role-switch">Preview role</label>
          <select
            id="role-switch"
            value={session.role}
            onChange={(e) => {
              const r = e.target.value as Role;
              switchRole(r);
              router.push(roleHome(r));
            }}
            className="h-9 rounded border border-gray-300 bg-white px-2 text-sm"
            title="Demo role switcher (mock auth — no backend yet)"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Link href="/sign-in" className="hidden text-sm font-semibold text-[#1d4ed8] sm:inline">
            {session.name}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SideNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = ROLE_NAV[role];
  return (
    <nav aria-label={`${role} navigation`} className="em-card p-2">
      <ul className="flex flex-col">
        {items.map((n) => {
          const active = pathname === n.href || (n.href !== `/${role}` && pathname.startsWith(n.href));
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded px-3 py-2 text-sm font-medium ${
                  active ? "bg-blue-50 text-[#1d4ed8]" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#1d4ed8]"
    >
      Skip to content
    </a>
  );
}

export function Breadcrumbs({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        {trail.map((t, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {t.href ? (
              <Link href={t.href} className="hover:text-gray-900 hover:underline">{t.label}</Link>
            ) : (
              <span aria-current="page" className="font-medium text-gray-900">{t.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function MobileNavigation({ role }: { role: Role }) {
  const pathname = usePathname();
  // Compact: max five primary destinations on mobile (§6).
  const items = ROLE_NAV[role].slice(0, 5);
  return (
    <nav aria-label={`${role} mobile`} className="mb-4 md:hidden">
      <ul className="flex gap-1 overflow-x-auto border-y border-gray-200 py-2">
        {items.map((n) => {
          const active = pathname === n.href;
          return (
            <li key={n.href} className="shrink-0">
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`block min-h-[44px] rounded border px-3 py-2 text-sm font-medium ${
                  active ? "border-[#1d4ed8] bg-blue-50 text-[#1d4ed8]" : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function UserMenu() {
  const { session, signOut } = useMockAuth();
  return (
    <div className="mt-2 rounded border border-gray-200 bg-white p-3">
      <p className="text-sm font-semibold">{session.name}</p>
      <p className="em-meta">{session.email} · {session.role} · {session.status}</p>
      <button onClick={signOut} className="mt-2 min-h-[44px] text-sm font-semibold text-[#1d4ed8]">
        Sign out (clears mock session)
      </button>
    </div>
  );
}

export function AppShell({
  role,
  title,
  trail,
  children,
}: {
  role: Role;
  title: string;
  trail?: { label: string; href?: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 md:grid-cols-[220px_1fr]">
      <div className="hidden md:sticky md:top-4 md:block md:self-start">
        <SideNav role={role} />
        <UserMenu />
        <p className="em-meta mt-2 px-1">
          {title} workspace · mock auth — server authorization lands with the backend.
        </p>
      </div>
      <div className="min-w-0" id="main-content">
        <MobileNavigation role={role} />
        {trail && <Breadcrumbs trail={trail} />}
        {children}
      </div>
    </div>
  );
}
