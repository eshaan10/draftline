import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Draftline",
  description: "A docs editor where the writing process is visible to everyone.",
};

const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.dataset.theme='dark';}else if(t==='light'){delete document.documentElement.dataset.theme;}else{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.dataset.theme='dark';}else{delete document.documentElement.dataset.theme;}}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
