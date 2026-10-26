import { describe, expect, it } from "vitest";
import {
  cleanSnippet,
  countWords,
  excerptOf,
  fuzzyScore,
  highlightMatches,
  stripMarkdown,
} from "./text";

describe("countWords", () => {
  it("counts CJK characters and latin words", () => {
    expect(countWords("hello 世界 world")).toBe(4);
    expect(countWords("2026 年 10 月")).toBe(4);
  });

  it("ignores punctuation", () => {
    expect(countWords("……——，。！？")).toBe(0);
  });
});

describe("stripMarkdown", () => {
  it("removes headings, list markers and checkboxes", () => {
    const source = "# 标题\n\n- [x] 已完成\n- [ ] 未完成\n\n> 引用";
    expect(stripMarkdown(source)).toBe("标题 已完成 未完成 引用");
  });

  it("unwraps links and inline code", () => {
    expect(stripMarkdown("这是 [链接](https://example.com) 和 `code`。")).toBe(
      "这是 链接 和 code。",
    );
  });

  it("removes fenced code blocks", () => {
    expect(stripMarkdown("前文\n```js\nconst a = 1;\n```\n后文")).toBe("前文 后文");
  });
});

describe("excerptOf", () => {
  it("limits by characters and appends an ellipsis", () => {
    const value = excerptOf("一二三四五六七八九十", 5);
    expect(value).toBe("一二三四五…");
  });
});

describe("highlightMatches", () => {
  it("escapes markup and marks query terms", () => {
    expect(highlightMatches("<本地> & note", "本地")).toBe(
      "&lt;<mark>本地</mark>&gt; &amp; note",
    );
  });

  it("returns escaped text without a query", () => {
    expect(highlightMatches("<a>", "")).toBe("&lt;a&gt;");
  });
});

describe("fuzzyScore", () => {
  it("prefers direct substring matches", () => {
    expect(fuzzyScore("本地笔记", "本地")).toBeGreaterThan(0);
    expect(fuzzyScore("本地笔记", "地记")).toBeGreaterThan(0);
    expect(fuzzyScore("本地笔记", "云端")).toBeNull();
  });
});

describe("cleanSnippet", () => {
  it("removes markdown noise but keeps mark tags", () => {
    const html = "## 标题 **<mark>本地</mark>** `搜索`";
    expect(cleanSnippet(html)).toBe("标题 <mark>本地</mark> 搜索");
  });
});
