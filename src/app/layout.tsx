import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Draftline",
  description: "A docs editor where the writing process is visible to everyone.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
