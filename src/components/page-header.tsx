import type { ReactNode } from "react";

export function PageHeader({
  crumbs,
  title,
  sub,
  actions,
}: {
  crumbs?: ReactNode;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && <p className="mono-label mb-2 text-muted uppercase">{crumbs}</p>}
        <h1 className="display-tight text-[34px] text-primary md:text-[40px]">{title}</h1>
        {sub && <p className="mt-2 text-[15px] text-body-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
