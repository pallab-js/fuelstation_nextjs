"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Topbar } from "./topbar";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const togglePalette = useCallback(() => setPaletteOpen((v) => !v), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePalette]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <div className="no-print">
        <Topbar onOpenMenu={() => setMenuOpen(true)} onOpenPalette={togglePalette} />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="no-print hidden lg:flex lg:shrink-0">
          <Sidebar />
        </div>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
      </div>

      {menuOpen && (
        <div
          className="no-print fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div
            className="absolute inset-0 bg-primary/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-hairline bg-white">
            <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
              <span className="display-tight text-[20px] text-primary">FuelOps</span>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMenuOpen(false)}
                className="size-9 cursor-pointer rounded-pill border border-hairline"
              >
                ✕
              </button>
            </div>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
