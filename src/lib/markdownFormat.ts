import type { EditorView } from "@codemirror/view";

function canEdit(view: EditorView): boolean {
  return view.contentDOM.isContentEditable;
}

export function selectedText(view: EditorView): string {
  const range = view.state.selection.main;
  return view.state.sliceDoc(range.from, range.to);
}

export function toggleInline(view: EditorView, marker: string): void {
  if (!canEdit(view)) return;
  const range = view.state.selection.main;
  const doc = view.state.doc;

  if (range.empty) {
    const insert = `${marker}${marker}`;
    view.dispatch({
      changes: { from: range.from, insert },
      selection: { anchor: range.from + marker.length },
    });
    view.focus();
    return;
  }

  const before =
    range.from >= marker.length
      ? doc.sliceString(range.from - marker.length, range.from)
      : "";
  const after = doc.sliceString(range.to, range.to + marker.length);
  if (before === marker && after === marker) {
    view.dispatch({
      changes: [
        { from: range.from - marker.length, to: range.from },
        { from: range.to, to: range.to + marker.length },
      ],
      selection: {
        anchor: range.from - marker.length,
        head: range.to - marker.length,
      },
    });
    view.focus();
    return;
  }

  const text = doc.sliceString(range.from, range.to);
  if (
    text.length >= marker.length * 2 &&
    text.startsWith(marker) &&
    text.endsWith(marker)
  ) {
    const inner = text.slice(marker.length, -marker.length);
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: inner },
      selection: { anchor: range.from, head: range.from + inner.length },
    });
    view.focus();
    return;
  }

  view.dispatch({
    changes: [
      { from: range.from, insert: marker },
      { from: range.to, insert: marker },
    ],
    selection: {
      anchor: range.from + marker.length,
      head: range.to + marker.length,
    },
  });
  view.focus();
}

export function toggleLinePrefix(view: EditorView, prefix: string): void {
  if (!canEdit(view)) return;
  const state = view.state;
  const range = state.selection.main;
  const startLine = state.doc.lineAt(range.from);
  const endLine = state.doc.lineAt(range.to);
  const lines = [];
  for (let number = startLine.number; number <= endLine.number; number += 1) {
    lines.push(state.doc.line(number));
  }
  const allPrefixed = lines.every((line) => line.text.startsWith(prefix));
  const changes = lines.map((line) =>
    allPrefixed
      ? { from: line.from, to: line.from + prefix.length }
      : { from: line.from, insert: prefix },
  );
  view.dispatch({ changes });
  view.focus();
}

export function toggleHeading(view: EditorView): void {
  if (!canEdit(view)) return;
  const state = view.state;
  const range = state.selection.main;
  const startLine = state.doc.lineAt(range.from);
  const endLine = state.doc.lineAt(range.to);
  const lines = [];
  for (let number = startLine.number; number <= endLine.number; number += 1) {
    lines.push(state.doc.line(number));
  }
  const headingPattern = /^(#{1,3})\s+/;
  const hasHeading = lines.some((line) => headingPattern.test(line.text));
  const changes: Array<{ from: number; to?: number; insert?: string }> = [];
  for (const line of lines) {
    const match = line.text.match(headingPattern);
    if (hasHeading && match) {
      changes.push({ from: line.from, to: line.from + match[0].length });
    } else if (!hasHeading) {
      changes.push({ from: line.from, insert: "## " });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

export function insertLink(view: EditorView): void {
  if (!canEdit(view)) return;
  const range = view.state.selection.main;
  const text = view.state.sliceDoc(range.from, range.to);
  const label = text || "链接文字";
  const insert = `[${label}](url)`;
  const labelStart = range.from + 1;
  const labelEnd = labelStart + label.length;
  const urlStart = labelEnd + 2;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: text
      ? { anchor: urlStart, head: urlStart + 3 }
      : { anchor: labelStart, head: labelEnd },
  });
  view.focus();
}

export const formattingShortcuts = [
  { key: "Mod-b", run: (view: EditorView) => (toggleInline(view, "**"), true) },
  { key: "Mod-i", run: (view: EditorView) => (toggleInline(view, "*"), true) },
  { key: "Mod-Shift-x", run: (view: EditorView) => (toggleInline(view, "~~"), true) },
  { key: "Mod-k", run: (view: EditorView) => (insertLink(view), true) },
];
