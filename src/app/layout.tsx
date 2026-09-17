import type { Metadata, Viewport } from "next";
// Шрифты self-hosted через fontsource: ни одного запроса к внешним CDN в
// рантайме, сборка не зависит от доступности fonts.googleapis.com, оба
// начертания включают кириллицу.
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "Bagyt — персональный маршрут поступления",
  description:
    "Короткая анкета превращается в разбор профиля, объяснённые рекомендации университетов и пошаговый план поступления.",
  applicationName: "Bagyt",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f12" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Ставит тему до первой отрисовки — без вспышки светлой темы. */
const themeBootstrap = `
(function(){
  try {
    var t = localStorage.getItem('bagyt-theme');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
