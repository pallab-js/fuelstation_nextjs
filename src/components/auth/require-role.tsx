"use client";

import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/misc";
import { useSession, type Role } from "@/lib/session/session-store";

/**
 * Route-level role gate (M3): hides page content from profiles outside
 * `roles`. Complements nav filtering with in-page enforcement so direct
 * URL access matches the documented role matrix.
 */
export function RequireRole({
  roles,
  title = "Access restricted",
  description = "Your profile does not have permission to view this page.",
  children,
}: {
  roles: Role[];
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const role = useSession((s) => s.role);
  if (!role || !roles.includes(role)) {
    return <EmptyState title={title} description={description} />;
  }
  return <>{children}</>;
}
