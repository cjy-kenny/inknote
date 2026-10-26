import { chromium } from "playwright-core";

const executablePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = process.env.APP_URL ?? "http://127.0.0.1:4173";

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector(".cm-editor");

const seeded = await page.evaluate(() => {
  const raw = localStorage.getItem("inknote.demo.v3");
  if (!raw) return false;
  const state = JSON.parse(raw);
  const base = state.settings.lastNoteId;
  const template = state.notes[base];
  if (!template) return false;
  const count = 10000;
  const notes = {};
  const recent = [];
  const now = Date.now();
  for (let index = 0; index < count; index += 1) {
    const id = `p${index.toString(16).padStart(7, "0")}`;
    const title = `性能测试笔记 ${String(index).padStart(5, "0")}`;
    notes[id] = {
      meta: {
        id,
        title,
        filePath: `notes/2026-10-25-${id}.md`,
        createdAt: now - index * 1000,
        updatedAt: now - index * 1000,
        fileMtime: now - index * 1000,
        favorite: index % 97 === 0,
        deletedAt: null,
        wordCount: 18,
        excerpt: `这是第 ${index} 篇用于验证虚拟列表与搜索性能的本地笔记。`,
        tags: index % 3 === 0 ? ["性能"] : [],
      },
      content: `# ${title}\n\n这是第 ${index} 篇用于验证虚拟列表与搜索性能的本地笔记。\n\n## 搜索词\n\n笔记 ${index}`,
    };
    if (index < 12) recent.push(id);
  }
  state.notes = notes;
  state.settings.lastNoteId = "p0000000";
  localStorage.setItem("inknote.demo.v3", JSON.stringify(state));
  localStorage.setItem("inknote.recent", JSON.stringify(recent));
  return true;
});

if (!seeded) {
  console.error("Could not seed performance data");
  await browser.close();
  process.exit(1);
}

const started = Date.now();
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".note-item", { timeout: 15000 });
const bootMs = Date.now() - started;
const noteCount = await page.locator(".note-item").count();
const totalText = await page.locator(".list-count").innerText();

const scrollStart = Date.now();
for (let step = 0; step < 8; step += 1) {
  await page.locator(".note-list-scroll").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await page.waitForTimeout(40);
}
const scrollMs = Date.now() - scrollStart;

await page.keyboard.press("Control+Shift+F");
await page.waitForSelector(".search-panel");
const searchStart = Date.now();
await page.keyboard.type("笔记 9999");
await page.waitForTimeout(200);
const searchMs = Date.now() - searchStart;
const resultText = await page.locator(".search-meta-row").innerText();

console.log(
  JSON.stringify(
    {
      bootMs,
      totalNotes: totalText,
      renderedRows: noteCount,
      scrollEightFramesMs: scrollMs,
      searchMs,
      searchMeta: resultText.replace(/\s+/g, " ").trim(),
    },
    null,
    2,
  ),
);

await browser.close();
