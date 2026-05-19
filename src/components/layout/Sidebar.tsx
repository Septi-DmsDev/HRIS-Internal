"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  ListChecks,
  Ticket,
  Clock3,
  ClipboardCheck,
  Fingerprint,
  FileCheck,
  CreditCard,
  TrendingUp,
  Database,
  History,
  Building2,
  Settings,
  UserCog,
  LogOut,
  CalendarDays,
  CalendarCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import { logoutAction } from "@/server/actions/auth";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: UserRole[];
  group: "main" | "admin";
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["SUPER_ADMIN", "HRD", "KABAG", "FINANCE", "SPV", "TEAMWORK", "MANAGERIAL", "PAYROLL_VIEWER"],
    group: "main",
  },
  {
    label: "Karyawan",
    href: "/employees",
    icon: Users,
    roles: ["SUPER_ADMIN", "HRD", "KABAG", "FINANCE"],
    group: "main",
  },
  {
    label: "Penempatan",
    href: "/positioning",
    icon: Building2,
    roles: ["SUPER_ADMIN", "HRD"],
    group: "main",
  },
  {
    label: "Performa",
    href: "/performance",
    icon: BarChart3,
    roles: ["SUPER_ADMIN", "HRD", "KABAG", "SPV", "TEAMWORK", "MANAGERIAL"],
    group: "main",
  },
  {
    label: "Team Performance",
    href: "/teamperformance",
    icon: ListChecks,
    roles: ["SUPER_ADMIN", "HRD", "KABAG", "SPV"],
    group: "main",
  },
  {
    label: "Ticketing",
    href: "/tickets",
    icon: Ticket,
    roles: ["SUPER_ADMIN", "KABAG", "SPV", "TEAMWORK", "MANAGERIAL", "PAYROLL_VIEWER"],
    group: "main",
  },
  {
    label: "Overtime",
    href: "/overtime",
    icon: Clock3,
    roles: ["SUPER_ADMIN", "HRD", "SPV", "TEAMWORK", "MANAGERIAL"],
    group: "main",
  },
  {
    label: "Approval Izin",
    href: "/ticketingapproval",
    icon: ClipboardCheck,
    roles: ["SUPER_ADMIN", "HRD", "KABAG", "SPV"],
    group: "main",
  },
  {
    label: "Jadwal",
    href: "/schedule",
    icon: CalendarDays,
    roles: ["SUPER_ADMIN", "HRD", "KABAG", "SPV", "TEAMWORK", "MANAGERIAL"],
    group: "main",
  },
  {
    label: "Atur Jadwal",
    href: "/scheduler",
    icon: CalendarCog,
    roles: ["SUPER_ADMIN", "HRD", "KABAG", "SPV"],
    group: "main",
  },
  {
    label: "Absensi",
    href: "/absensi",
    icon: Fingerprint,
    roles: ["SUPER_ADMIN", "HRD"],
    group: "main",
  },
  {
    label: "Review",
    href: "/reviews",
    icon: FileCheck,
    roles: ["SUPER_ADMIN", "HRD", "KABAG", "SPV"],
    group: "main",
  },
  {
    label: "Payroll",
    href: "/payroll",
    icon: CreditCard,
    roles: ["SUPER_ADMIN", "FINANCE", "PAYROLL_VIEWER"],
    group: "main",
  },
  {
    label: "Finance",
    href: "/finance",
    icon: TrendingUp,
    roles: ["SUPER_ADMIN", "FINANCE", "PAYROLL_VIEWER"],
    group: "main",
  },
  {
    label: "History",
    href: "/history",
    icon: History,
    roles: ["SUPER_ADMIN", "HRD"],
    group: "admin",
  },
  {
    label: "Pengguna",
    href: "/users",
    icon: UserCog,
    roles: ["SUPER_ADMIN", "HRD"],
    group: "admin",
  },
  {
    label: "Master Data",
    href: "/master",
    icon: Database,
    roles: ["SUPER_ADMIN", "HRD"],
    group: "admin",
  },
  {
    label: "Pengaturan",
    href: "/settings",
    icon: Settings,
    roles: ["SUPER_ADMIN", "HRD", "KABAG", "FINANCE", "SPV", "TEAMWORK", "MANAGERIAL", "PAYROLL_VIEWER"],
    group: "admin",
  },
];

type SidebarProps = {
  userRole: UserRole;
};

function NavLink({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-teal-500/[0.13] text-white"
          : "text-white/45 hover:text-white/80 hover:bg-white/[0.06]"
      )}
    >
      <Icon
        size={16}
        className={cn(
          "shrink-0 transition-colors",
          isActive ? "text-teal-400" : "text-white/35"
        )}
      />
      {item.label}
    </Link>
  );
}

export default function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();

  const visible = NAV_ITEMS.filter((item) => item.roles.includes(userRole));
  const mainItems = visible.filter((i) => i.group === "main");
  const adminItems = visible.filter((i) => i.group === "admin");

  function isActive(item: NavItem) {
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  return (
    <aside className="fixed left-0 top-0 z-40 w-60 h-screen bg-[#0f172a] flex flex-col shrink-0 border-r border-white/[0.05]">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center shrink-0 text-white text-xs font-black"
            style={{ boxShadow: "0 0 16px rgba(20,184,166,0.35)" }}
          >
            HR
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight leading-none">
              HRIS Internal
            </h1>
            <p className="text-[10px] text-white/30 mt-1 uppercase tracking-widest font-medium">
              Human Resource
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto sidebar-scrollbar-hidden py-4 px-3 space-y-0.5">
        {mainItems.length > 0 && (
          <div className="space-y-0.5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/25">
              Menu Utama
            </p>
            {mainItems.map((item) => (
              <NavLink key={item.href} item={item} isActive={isActive(item)} />
            ))}
          </div>
        )}

        {adminItems.length > 0 && (
          <div className="space-y-0.5 pt-5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-white/25">
              Administrasi
            </p>
            {adminItems.map((item) => (
              <NavLink key={item.href} item={item} isActive={isActive(item)} />
            ))}
          </div>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-white/[0.07]">
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-red-200 hover:bg-red-500/10 rounded-lg transition-colors duration-150 font-medium border border-white/10"
          >
            <LogOut size={14} />
            <span>Keluar</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
