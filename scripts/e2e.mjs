import { chromium } from "playwright-core";

const executablePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = process.env.APP_URL ?? "http://127.0.0.1:1420";

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.log(`FAIL ${name} ${detail}`);
  else console.log(`PASS ${name}`);
}

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector(".cm-editor", { timeout: 10000 });
check("boots with seeded notes", (await page.locator(".note-item").count()) === 5);
check("editor title is seeded", (await page.locator(".title-input").inputValue()) === "欢迎来到 InkNote");
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "最近" }).click();
await page.waitForTimeout(250);
check("recent view shows first-run history", (await page.locator(".note-item").count()) === 5);
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "全部笔记" }).click();
await page.waitForTimeout(250);

// Focus mode strips the chrome down to the current note.
await page.locator('button[aria-label="进入专注模式"]').click();
await page.waitForTimeout(300);
check(
  "focus mode hides sidebar and list",
  !(await page.locator(".sidebar").isVisible()) &&
    !(await page.locator(".note-list-panel").isVisible()) &&
    (await page.locator(".editor-pane").isVisible()),
);
await page.locator('button[aria-label="退出专注模式"]').click();
await page.waitForTimeout(300);
check("focus mode restores chrome", await page.locator(".note-list-panel").isVisible());

// The list pane is resizable and remembers its width.
const panelBefore = await page.locator(".note-list-panel").boundingBox();
const resizer = await page.locator(".pane-resizer").boundingBox();
if (panelBefore && resizer) {
  await page.mouse.move(resizer.x + 3, resizer.y + 200);
  await page.mouse.down();
  await page.mouse.move(resizer.x + 63, resizer.y + 200, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
const panelAfter = await page.locator(".note-list-panel").boundingBox();
check(
  "list pane can be resized",
  Boolean(panelBefore && panelAfter && panelAfter.width > panelBefore.width + 40),
);
await page.locator(".pane-resizer").dblclick();
await page.waitForTimeout(250);
const panelReset = await page.locator(".note-list-panel").boundingBox();
check("list pane resets with double click", Boolean(panelReset && Math.abs(panelReset.width - 318) < 4));

// Autosave through the real store + browser demo backend.
await page.locator(".title-input").click();
await page.keyboard.press("End");
await page.keyboard.type(" · 测试");
await page.waitForTimeout(1100);
const saved = await page.locator(".save-state").innerText();
check("autosave reports saved", saved.includes("已保存"), saved);
const storedTitle = await page.evaluate(() => {
  const raw = localStorage.getItem("inknote.demo.v3");
  if (!raw) return null;
  const state = JSON.parse(raw);
  return state.notes.a1b2c3d4?.meta?.title ?? null;
});
check("autosave persisted to storage", storedTitle?.includes("测试"), String(storedTitle));

// New note and editing.
await page.keyboard.press("Control+N");
await page.waitForTimeout(500);
await page.keyboard.type("自动化测试笔记");
await page.locator(".cm-content").click();
await page.keyboard.type("这是一段自动化测试内容。\n\n## 小节\n\n- 第一项\n- 第二项");
await page.waitForTimeout(1100);
check("new note created", (await page.locator(".note-item").count()) === 6);
check("new note content persisted", (await page.locator(".save-state").innerText()).includes("已保存"));

// Formatting shortcuts and right-click formatting menu.
await page.locator(".cm-content").click();
await page.keyboard.press("Control+b");
await page.keyboard.type("加粗");
await page.waitForTimeout(900);
const boldContent = await page.evaluate(() => {
  const raw = localStorage.getItem("inknote.demo.v3");
  if (!raw) return "";
  const state = JSON.parse(raw);
  return Object.values(state.notes).find((note) => note.meta.title === "自动化测试笔记")?.content ?? "";
});
check("bold shortcut wraps text", boldContent.includes("**加粗**"), boldContent.slice(-40));
await page.locator(".cm-content").click({ button: "right" });
await page.waitForSelector(".format-menu");
check("formatting menu opens", await page.locator(".format-menu").isVisible());
await page.locator(".format-menu .menu-item").filter({ hasText: "斜体" }).click();
await page.keyboard.type("斜体");
await page.waitForTimeout(900);
const italicContent = await page.evaluate(() => {
  const raw = localStorage.getItem("inknote.demo.v3");
  if (!raw) return "";
  const state = JSON.parse(raw);
  return Object.values(state.notes).find((note) => note.meta.title === "自动化测试笔记")?.content ?? "";
});
check("context menu applies italic", italicContent.includes("*斜体*"), italicContent.slice(-40));

// Command palette.
await page.keyboard.press("Control+P");
await page.waitForSelector(".palette");
check("command palette opens", await page.locator(".palette").isVisible());
await page.locator(".palette input").focus();
await page.keyboard.type("设置");
await page.waitForTimeout(250);
await page.keyboard.press("Enter");
await page.waitForSelector(".settings-modal");
check("palette executes settings command", await page.locator(".settings-modal").isVisible());
for (let index = 0; index < 12; index += 1) await page.keyboard.press("Tab");
check(
  "focus stays inside settings dialog",
  await page.evaluate(() => Boolean(document.activeElement?.closest(".settings-modal"))),
);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// Full-text search.
await page.keyboard.press("Control+Shift+F");
await page.waitForSelector(".search-panel");
await page.locator(".search-panel input").focus();
await page.keyboard.type("本地");
await page.waitForTimeout(800);
const resultCount = await page.locator(".search-result").count();
check("full-text search returns results", resultCount > 0, String(resultCount));
await page.keyboard.press("Escape");

// Theme switch via sidebar.
const themeButton = page.locator(".sidebar-foot .nav-item").filter({ hasText: "跟随系统" }).first();
await themeButton.click();
await page.waitForTimeout(300);
check("light theme applies", (await page.locator("html").getAttribute("data-theme")) === "light");
const lightButton = page.locator(".sidebar-foot .nav-item").filter({ hasText: "亮色" }).first();
await lightButton.click();
await page.waitForTimeout(300);
check("dark theme applies", (await page.locator("html").getAttribute("data-theme")) === "dark");
await page.locator(".sidebar-foot .nav-item").filter({ hasText: "暗色" }).first().click();
await page.waitForTimeout(300);
check("system theme cycles", (await page.locator("html").getAttribute("data-theme")) === "light");

// Version history.
await page.keyboard.press("Control+Shift+H");
await page.waitForSelector(".history-modal");
await page.waitForTimeout(500);
const historyText = await page.locator(".history-modal").innerText();
check("history modal shows snapshot", historyText.includes("版本历史") && historyText.includes("恢复此版本"));
await page.keyboard.press("Escape");

// Trash and restore.
const beforeCount = await page.locator(".note-item").count();
await page.locator(".editor-toolbar-actions .more-wrap > button").click();
await page.waitForSelector(".editor-menu");
await page.locator(".editor-menu .menu-item").filter({ hasText: "移到回收站" }).click();
await page.waitForTimeout(700);
check("trash removes note from list", (await page.locator(".note-item").count()) === beforeCount - 1);
await page.locator(".sidebar-nav .nav-item").filter({ hasText: "回收站" }).click();
await page.waitForTimeout(400);
const trashItems = await page.locator(".note-item").count();
check("trash view contains deleted note", trashItems >= 1, String(trashItems));
await page.locator(".note-item").first().click();
await page.waitForSelector(".banner-trash");
check("trash note is read-only", (await page.locator(".title-input").getAttribute("readonly")) !== null);
const editable = await page.locator(".cm-content").getAttribute("contenteditable");
check("trash body is read-only", editable === "false", String(editable));
await page.locator(".banner-trash .button.solid").click();
await page.waitForTimeout(900);
check("restore returns to all notes", (await page.locator(".sidebar-nav .nav-item").filter({ hasText: "全部笔记" }).first().getAttribute("data-active")) === "true");

// Draft recovery surfaces if a draft is newer than the file.
const draftInjected = await page.evaluate(() => {
  const raw = localStorage.getItem("inknote.demo.v3");
  if (!raw) return false;
  const state = JSON.parse(raw);
  const active = state.settings.lastNoteId;
  const note = state.notes[active];
  if (!note) return false;
  state.drafts[active] = {
    noteId: active,
    content: note.content + "\n\n这是一段崩溃前未保存的草稿。",
    savedAt: Date.now() + 1000,
    baseMtime: note.meta.fileMtime,
  };
  localStorage.setItem("inknote.demo.v3", JSON.stringify(state));
  return true;
});
check("draft fixture injected", draftInjected);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".banner-draft", { timeout: 8000 });
check("draft recovery banner appears", await page.locator(".banner-draft").isVisible());
await page.locator(".banner-draft .button.subtle").click();
await page.waitForTimeout(400);

// External modification conflict: change the demo file mtime behind the UI.
const conflictFixture = await page.evaluate(() => {
  const raw = localStorage.getItem("inknote.demo.v3");
  if (!raw) return false;
  const state = JSON.parse(raw);
  const active = state.settings.lastNoteId;
  const note = state.notes[active];
  if (!note) return false;
  note.meta.fileMtime += 5000;
  localStorage.setItem("inknote.demo.v3", JSON.stringify(state));
  window.dispatchEvent(new Event("inknote:demo-invalidate"));
  return true;
});
check("conflict fixture injected", conflictFixture);
await page.locator(".cm-content").click();
await page.keyboard.type(" 外部冲突");
await page.waitForTimeout(1000);
await page.waitForSelector(".banner-warning", { timeout: 5000 });
check("external conflict banner appears", await page.locator(".banner-warning").isVisible());
await page.locator(".banner-warning .button.subtle").click();
await page.waitForTimeout(700);
check("reload resolves conflict", (await page.locator(".banner-warning").count()) === 0);

// Responsive layout: mobile starts on the list, can open the editor, and returns.
await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".note-item");
check("mobile starts on list", await page.locator(".note-list-panel").isVisible());
check("mobile hides editor initially", !(await page.locator(".editor-pane").isVisible()));
check(
  "mobile has no horizontal overflow",
  (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)),
);
await page.locator(".note-item").first().click();
await page.waitForTimeout(400);
check("mobile opens editor", await page.locator(".editor-pane").isVisible());
await page.locator(".mobile-back").click();
await page.waitForTimeout(300);
check("mobile back returns to list", await page.locator(".note-list-panel").isVisible());
await page.locator(".mobile-menu").click();
await page.waitForTimeout(250);
check("mobile navigation drawer opens", await page.locator(".sidebar").getAttribute("data-drawer-open") === "true");
await page.locator(".sidebar-scrim").click({ position: { x: 360, y: 400 } });
await page.waitForTimeout(200);

check("no runtime errors", errors.length === 0, errors.join("\n"));

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
process.exit(failed.length ? 1 : 0);
