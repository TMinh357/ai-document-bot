"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

type ActiveLinkProps = ComponentProps<typeof Link> & {
  activeClassName?: string;
  inactiveClassName?: string;
  /** Match when current path starts with href (useful for /admin which has sub-pages). */
  prefixMatch?: boolean;
};

export default function ActiveLink({
  href,
  className,
  activeClassName = "is-active",
  inactiveClassName = "",
  prefixMatch = false,
  children,
  ...rest
}: ActiveLinkProps) {
  const pathname = usePathname();
  const target = typeof href === "string" ? href : href?.toString() ?? "";

  const isActive = prefixMatch
    ? pathname === target || pathname.startsWith(`${target}/`)
    : pathname === target;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`${className ?? ""} ${isActive ? activeClassName : inactiveClassName}`.trim()}
      {...rest}
    >
      {children}
    </Link>
  );
}
