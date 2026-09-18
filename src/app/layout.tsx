import type { Metadata, Viewport } from "next";
// Шрифты self-hosted через fontsource: ни одного запроса к внешним CDN в
// рантайме, сборка не зависит от доступности fonts.googleapis.com, оба
// начертания включают кириллицу.
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppShell } from "@/components/shell/AppShell";
import { CatalogProvider } from "@/components/shell/CatalogProvider";
import { SyncProvider } from "@/components/shell/SyncProvider";
import { loadCatalogForRender } from "@/lib/data/catalog.server";
import { isAuthEnabled } from "@/lib/auth/session";

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* Каталог загружается один раз на запрос и уезжает на клиент пропом, чтобы
     страницы считали подбор синхронно. Без DATABASE_URL это статический срез
     и ни одного обращения к сети — сценарий «попробовать без настройки»
     работает ровно как раньше. */
  const catalog = await loadCatalogForRender();

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="antialiased">
        <CatalogProvider programs={catalog.programs} source={catalog.source}>
          {/* authEnabled приходит с сервера: без базы клиент не делает ни
              одного запроса к /api/auth — гость остаётся полностью офлайн. */}
          <SyncProvider authEnabled={isAuthEnabled()}>
            <AppShell>{children}</AppShell>
          </SyncProvider>
        </CatalogProvider>
      </body>
    </html>
  );
}
