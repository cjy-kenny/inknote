import { describe, expect, it } from "vitest";
import { dateStamp, listTime, relativeTime } from "./time";

describe("relativeTime", () => {
  const now = new Date("2026-10-25T19:00:00+08:00").getTime();

  it("describes very recent edits", () => {
    expect(relativeTime(now - 10_000, now)).toBe("刚刚");
  });

  it("describes edits within the hour", () => {
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 分钟前");
  });

  it("uses a clock time for earlier today", () => {
    expect(relativeTime(now - 3 * 60 * 60_000, now)).toMatch(/\d{2}:\d{2}/);
  });
});

describe("dateStamp", () => {
  it("formats a local calendar day", () => {
    expect(dateStamp(new Date("2026-10-25T12:00:00+08:00").getTime())).toBe("2026-10-25");
  });
});

describe("listTime", () => {
  it("uses relative text for the last hour", () => {
    const now = Date.now();
    expect(listTime(now - 12 * 60_000, now)).toContain("分钟前");
  });
});
