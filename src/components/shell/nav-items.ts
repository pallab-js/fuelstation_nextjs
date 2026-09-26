import {
  Bell,
  FileText,
  Fuel,
  LayoutDashboard,
  Receipt,
  Settings,
  ShoppingCart,
  Warehouse,
  Clock,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/session/session-store";

const RANK: Record<Role, number> = { attendant: 1, manager: 2, owner: 3 };

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  minRole: Role;
  showInPalette?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minRole: "attendant", showInPalette: true },
  { href: "/stations", label: "Stations", icon: Fuel, minRole: "manager", showInPalette: true },
  { href: "/pos", label: "POS", icon: ShoppingCart, minRole: "attendant", showInPalette: true },
  { href: "/shifts", label: "Shifts", icon: Clock, minRole: "attendant", showInPalette: true },
  { href: "/inventory", label: "Inventory", icon: Warehouse, minRole: "attendant", showInPalette: true },
  { href: "/credit", label: "Credit", icon: Users, minRole: "manager", showInPalette: true },
  { href: "/expenses", label: "Expenses", icon: Receipt, minRole: "manager", showInPalette: true },
  { href: "/reports", label: "Reports", icon: FileText, minRole: "attendant", showInPalette: true },
  { href: "/alerts", label: "Alerts", icon: Bell, minRole: "attendant", showInPalette: true },
  { href: "/settings", label: "Settings", icon: Settings, minRole: "owner", showInPalette: true },
];

export function navForRole(role: Role | null): NavItem[] {
  if (!role) return [];
  return NAV.filter((n) => RANK[role] >= RANK[n.minRole]);
}
