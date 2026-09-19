import type { Metadata } from "next";
import "./globals.css";
import { MockAuthProvider } from "@/lib/auth";
import { SkipLink, TopBar } from "@/components/layout/Chrome";

export const metadata: Metadata = {
  title: "ElevateMe — Diplomatic Impact",
  description:
    "Student-growth platform: programs, evaluation across ten criteria, insights, and recommendations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <MockAuthProvider>
          <SkipLink />
          <TopBar />
          <main id="main-content" className="flex flex-1 flex-col">{children}</main>
          <footer className="border-t border-gray-200 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-4">
              <p className="em-meta">
                ElevateMe · Phase 1 frontend scaffold (mock data, no backend) · Flat UI, WCAG 2.2 AA target
              </p>
            </div>
          </footer>
        </MockAuthProvider>
      </body>
    </html>
  );
}
