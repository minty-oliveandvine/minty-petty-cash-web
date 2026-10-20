import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/ui/AppSidebar";

import "./globals.css";

// The face every Minty app sets (minty-web's and minty-payment-request-web's app/layout.tsx):
// a page here must read as one of theirs, with only the contents differing.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Petty Cash",
  description: "Petty Cash - the daily closing, the reports and the cash.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// The sidebar, with My Profile as its sheet (@minty/shared/profile, wired in AppSidebar).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="m-0 min-w-0 overflow-x-clip antialiased">
        <AppSidebar>{children}</AppSidebar>
      </body>
    </html>
  );
}
