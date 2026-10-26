import { chromium } from "playwright-core";

const executablePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = process.env.APP_URL ?? "http://127.0.0.1:1420";
const output = process.env.SHOT ?? "shot.png";
const theme = process.env.THEME ?? "light";
const width = Number(process.env.WIDTH ?? 1440);
const height = Number(process.env.HEIGHT ?? 900);
const action = process.env.ACTION ?? "";

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars"],
});
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  colorScheme: theme === "dark" ? "dark" : "light",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${error.stack ?? error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`CONSOLE ${message.text()}`);
});

await page.goto(url, { waitUntil: "networkidle" }).catch((error) => {
  errors.push(`GOTO ${error.message}`);
});
await page.waitForTimeout(1800);

if (action === "palette") {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+P" : "Control+P");
  await page.waitForTimeout(500);
} else if (action === "search") {
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+F" : "Control+Shift+F",
  );
  await page.waitForTimeout(300);
  await page.keyboard.type("本地");
  await page.waitForTimeout(900);
} else if (action === "settings") {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
  await page.waitForTimeout(500);
} else if (action === "history") {
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+H" : "Control+Shift+H",
  );
  await page.waitForTimeout(900);
} else if (action === "preview") {
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+V" : "Control+Shift+V",
  );
  await page.waitForTimeout(500);
} else if (action === "new") {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+N" : "Control+N");
  await page.waitForTimeout(500);
} else if (action === "focus") {
  await page.locator('button[aria-label="进入专注模式"]').click();
  await page.waitForTimeout(500);
} else if (action === "format") {
  await page.locator(".cm-content").click({ button: "right" });
  await page.waitForTimeout(400);
}

const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 800));
const appState = await page.evaluate(() => ({
  root: Boolean(document.querySelector("#root")?.children.length),
  notes: document.querySelectorAll(".note-item").length,
  editor: Boolean(document.querySelector(".cm-editor")),
  title: document.querySelector(".title-input")?.value ?? null,
}));

await page.screenshot({ path: output });
console.log(JSON.stringify({ bodyText, appState, errors }, null, 2));
await browser.close();
