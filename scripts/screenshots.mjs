import { chromium } from "playwright";

const OUT = process.env.SHOT_DIR ?? "./screenshots";
const BASE = "http://localhost:3000";

const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function shoot(name, path, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1280, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: opts.dark ? "dark" : "light",
  });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  if (opts.before) await opts.before(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.full ?? false });
  await ctx.close();
}

// 1. Лендинг
await shoot("01-intro", "/");

// Загружаем демо-профиль и идём по пути
const seed = async (page) => {
  await page.goto(BASE + "/");
  await page.getByRole("button", { name: /демо-профиле/i }).click();
  await page.waitForURL("**/diagnosis");
  await page.waitForTimeout(1200);
};

// 2. Диагностика
await shoot("02-diagnosis", "/", { before: seed, full: true });

// 3. Рекомендации
await shoot("03-matches", "/", {
  before: async (page) => {
    await seed(page);
    await page.goto(BASE + "/matches");
    await page.waitForTimeout(900);
  },
});

// 3b. Рекомендации — раскрытый разбор факторов
await shoot("04-matches-factors", "/", {
  before: async (page) => {
    await seed(page);
    await page.goto(BASE + "/matches");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /Разбор по семи факторам/ }).first().click();
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 700);
  },
});

// 3c. Панель живой настройки
await shoot("05-tweak", "/", {
  before: async (page) => {
    await seed(page);
    await page.goto(BASE + "/matches");
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /Живая настройка/ }).click();
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 380);
  },
});

// 4. Сравнение
await shoot("06-compare", "/", {
  before: async (page) => {
    await seed(page);
    await page.goto(BASE + "/matches");
    await page.waitForTimeout(700);
    const buttons = await page.getByRole("button", { name: "Сравнить" }).all();
    await buttons[0].click();
    await buttons[1].click();
    await page.goto(BASE + "/compare");
    await page.waitForTimeout(700);
  },
  full: true,
});

// 5. Маршрут
await shoot("07-roadmap", "/", {
  before: async (page) => {
    await seed(page);
    await page.goto(BASE + "/matches");
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Построить маршрут" }).first().click();
    await page.waitForURL("**/roadmap");
    await page.waitForTimeout(800);
  },
});

// 6. Маршрут — таймлайн ниже
await shoot("08-roadmap-timeline", "/", {
  before: async (page) => {
    await seed(page);
    await page.goto(BASE + "/matches");
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Построить маршрут" }).first().click();
    await page.waitForURL("**/roadmap");
    await page.waitForTimeout(700);
    await page.mouse.wheel(0, 1100);
  },
});

// 7. Анкета
await shoot("09-profile", "/profile");

// 8. Тёмная тема — рекомендации
await shoot("10-dark-matches", "/", {
  dark: true,
  before: async (page) => {
    await seed(page);
    await page.goto(BASE + "/matches");
    await page.waitForTimeout(900);
  },
});

// 9. Мобильный — маршрут
await shoot("11-mobile-roadmap", "/", {
  mobile: true,
  before: async (page) => {
    await seed(page);
    await page.goto(BASE + "/matches");
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Построить маршрут" }).first().click();
    await page.waitForURL("**/roadmap");
    await page.waitForTimeout(800);
  },
});

// 10. Мобильный — рекомендации
await shoot("12-mobile-matches", "/", {
  mobile: true,
  before: async (page) => {
    await seed(page);
    await page.goto(BASE + "/matches");
    await page.waitForTimeout(900);
  },
});

await browser.close();
console.log("done");
