const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const timeFormat = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const monthDayFormat = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
});

const fullFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 45_000) return "刚刚";
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MINUTE))} 分钟前`;
  const date = new Date(ts);
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return timeFormat.format(date);
  if (diff < 2 * DAY) return `昨天 ${timeFormat.format(date)}`;
  if (date.getFullYear() === today.getFullYear()) return monthDayFormat.format(date);
  return fullFormat.format(date);
}

export function listTime(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < MINUTE) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  const date = new Date(ts);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return timeFormat.format(date);
  if (date.getFullYear() === today.getFullYear()) return monthDayFormat.format(date);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function fullTime(ts: number): string {
  return fullFormat.format(new Date(ts));
}

export function dateStamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function headingForView(view: string): string {
  switch (view) {
    case "favorites":
      return "收藏";
    case "recent":
      return "最近";
    case "trash":
      return "回收站";
    default:
      return "全部笔记";
  }
}
