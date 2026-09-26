import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-soft-stone px-6 text-center">
      <p className="mono-label text-muted">FuelOps</p>
      <h1 className="display-tight text-[40px] text-primary">You&apos;re offline</h1>
      <p className="max-w-sm text-[15px] text-body-muted">
        This page isn&apos;t cached yet. Your dashboard data is safe in this browser —
        head back to a page you already opened.
      </p>
      <Link
        href="/dashboard"
        className="rounded-pill border border-primary bg-primary px-6 py-3 text-[14px] text-on-primary transition-colors hover:bg-white hover:text-primary"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
