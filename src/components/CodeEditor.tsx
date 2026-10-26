import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  keymap,
  placeholder,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { Icon } from "./Icon";
import { useClickOutside } from "../hooks/useClickOutside";
import { modLabel } from "../hooks/useTheme";
import {
  formattingShortcuts,
  insertLink,
  toggleHeading,
  toggleInline,
  toggleLinePrefix,
} from "../lib/markdownFormat";

export interface CodeEditorHandle {
  focus: () => void;
  openFind: () => void;
  selectedText: () => string;
}

interface CursorInfo {
  line: number;
  column: number;
}

interface Props {
  noteId: string;
  content: string;
  isDark: boolean;
  readOnly?: boolean;
  onChange: (content: string) => void;
  onCursor?: (cursor: CursorInfo) => void;
  onBlur?: () => void;
}

const editorTheme = (dark: boolean) =>
  EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "transparent",
        color: "var(--editor-text)",
        fontSize: "var(--editor-size)",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": {
        fontFamily: "var(--editor-font)",
        lineHeight: "var(--editor-line-height)",
        overflow: "auto",
        padding: "10px 0 120px",
      },
      ".cm-content": {
        maxWidth: "760px",
        width: "100%",
        margin: "0 auto",
        padding: "0",
        caretColor: "var(--accent)",
        minHeight: "40vh",
      },
      ".cm-line": {
        padding: "0 56px",
        color: "var(--editor-text)",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeft: "2px solid var(--accent)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "var(--selection) !important",
      },
      ".cm-activeLine": { backgroundColor: "transparent" },
      ".cm-placeholder": {
        color: "var(--faint)",
        fontStyle: "italic",
        letterSpacing: "0.01em",
      },
      ".cm-find-match": {
        backgroundColor: "var(--find-bg)",
        borderRadius: "2px",
      },
      ".cm-find-current": {
        backgroundColor: "var(--find-current)",
        outline: "1px solid var(--accent-soft-strong)",
        borderRadius: "2px",
      },
      ".cm-selectionMatch": { backgroundColor: "var(--accent-soft)" },
      "@media (max-width: 1100px)": {
        ".cm-line": { padding: "0 42px" },
      },
      "@media (max-width: 760px)": {
        ".cm-line": { padding: "0 22px" },
        ".cm-scroller": { paddingBottom: "80px" },
      },
    },
    { dark },
  );

const inkHighlight = HighlightStyle.define([
  {
    tag: tags.heading1,
    fontSize: "1.52em",
    fontWeight: "600",
    lineHeight: "1.35",
    letterSpacing: "-0.015em",
    color: "var(--heading)",
  },
  {
    tag: tags.heading2,
    fontSize: "1.25em",
    fontWeight: "600",
    lineHeight: "1.42",
    letterSpacing: "-0.01em",
    color: "var(--heading)",
  },
  {
    tag: tags.heading3,
    fontSize: "1.09em",
    fontWeight: "650",
    lineHeight: "1.5",
    color: "var(--heading)",
  },
  { tag: tags.heading4, fontWeight: "650", color: "var(--heading)" },
  { tag: tags.strong, fontWeight: "650", color: "var(--text-strong)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--muted)" },
  {
    tag: tags.link,
    color: "var(--accent)",
    textDecoration: "underline",
    textDecorationColor: "var(--accent-soft-strong)",
    textUnderlineOffset: "3px",
  },
  { tag: tags.url, color: "var(--muted)" },
  {
    tag: tags.monospace,
    fontFamily: "var(--font-mono)",
    fontSize: "0.86em",
    color: "var(--code-text)",
    backgroundColor: "var(--code-bg)",
  },
  { tag: tags.quote, color: "var(--quote-text)" },
  { tag: tags.list, color: "var(--accent)" },
  { tag: tags.contentSeparator, color: "var(--border-strong)" },
  { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.meta, color: "var(--faint)" },
  {
    tag: tags.processingInstruction,
    color: "var(--faint)",
    fontSize: "0.78em",
    fontFamily: "var(--font-ui)",
  },
  { tag: tags.keyword, color: "var(--accent)" },
  { tag: tags.string, color: "var(--success)" },
  { tag: tags.number, color: "var(--accent)" },
  { tag: tags.bool, color: "var(--accent)" },
]);

interface FindMatch {
  from: number;
  to: number;
}

interface FindState {
  query: string;
  matches: FindMatch[];
  index: number;
}

const emptyFind: FindState = { query: "", matches: [], index: 0 };

const hiddenMarkNames = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
]);

function buildLivePreview(view: EditorView): DecorationSet {
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  const ranges: Range<Decoration>[] = [];
  const visited = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!hiddenMarkNames.has(node.name)) return;
        const line = view.state.doc.lineAt(node.from);
        if (line.number === activeLine) return;
        let end = node.to;
        if (node.name === "HeaderMark" && view.state.sliceDoc(end, end + 1) === " ") {
          end += 1;
        }
        if (end <= node.from) return;
        const key = node.from * 100_000 + end;
        if (visited.has(key)) return;
        visited.add(key);
        ranges.push(Decoration.replace({}).range(node.from, end));
      },
    });
  }
  return Decoration.set(ranges, true);
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreview(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLivePreview(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const setFind = StateEffect.define<{ query: string; index: number }>();

function computeMatches(text: string, query: string): FindMatch[] {
  const needle = query.toLocaleLowerCase();
  if (!needle) return [];
  const haystack = text.toLocaleLowerCase();
  const matches: FindMatch[] = [];
  let cursor = 0;
  while (matches.length < 800) {
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) break;
    matches.push({ from: found, to: found + needle.length });
    cursor = found + Math.max(1, needle.length);
  }
  return matches;
}

function buildDecorations(value: FindState): DecorationSet {
  if (!value.query || !value.matches.length) return Decoration.none;
  const ranges = value.matches
    .map((match, index) =>
      Decoration.mark({
        class: index === value.index ? "cm-find-match cm-find-current" : "cm-find-match",
      }).range(match.from, match.to),
    )
    .sort((a, b) => a.from - b.from);
  return Decoration.set(ranges, true);
}

const findField = StateField.define<FindState>({
  create: () => emptyFind,
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(setFind)) {
        const matches = computeMatches(tr.state.doc.toString(), effect.value.query);
        const index =
          matches.length === 0
            ? 0
            : Math.max(0, Math.min(effect.value.index, matches.length - 1));
        next = { query: effect.value.query, matches, index };
      }
    }
    if (tr.docChanged && next.query) {
      const matches = computeMatches(tr.state.doc.toString(), next.query);
      next = {
        ...next,
        matches,
        index: matches.length ? Math.min(next.index, matches.length - 1) : 0,
      };
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field, buildDecorations),
});

export const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor(
  { noteId, content, isDark, readOnly = false, onChange, onCursor, onBlur },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formatMenuRef = useRef<HTMLDivElement>(null);
  const suppressRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursor);
  const onBlurRef = useRef(onBlur);
  const findOpenRef = useRef(false);

  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchInfo, setMatchInfo] = useState({ count: 0, index: 0 });
  const [formatMenu, setFormatMenu] = useState<{ x: number; y: number } | null>(null);

  useClickOutside(formatMenuRef, () => setFormatMenu(null), Boolean(formatMenu));

  onChangeRef.current = onChange;
  onCursorRef.current = onCursor;
  onBlurRef.current = onBlur;

  const appearance = useRef(new Compartment()).current;
  const editable = useRef(new Compartment()).current;

  useEffect(() => {
    if (!hostRef.current) return;
    const startState = EditorState.create({
      doc: content,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, addKeymap: false }),
        syntaxHighlighting(inkHighlight),
        appearance.of(editorTheme(isDark)),
        editable.of(EditorView.editable.of(!readOnly)),
        keymap.of([
          ...formattingShortcuts,
          ...markdownKeymap,
          ...defaultKeymap,
          indentWithTab,
          ...historyKeymap,
        ]),
        placeholder("从这里开始写。"),
        EditorState.tabSize.of(2),
        EditorView.contentAttributes.of({
          "aria-label": "笔记正文",
          spellcheck: "false",
          autocapitalize: "off",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            if (!suppressRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (findOpenRef.current) {
              const field = update.state.field(findField);
              setMatchInfo({ count: field.matches.length, index: field.index });
            }
          }
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            onCursorRef.current?.({
              line: line.number,
              column: head - line.from + 1,
            });
          }
        }),
        findField,
        livePreview,
        EditorView.domEventHandlers({
          blur: () => {
            onBlurRef.current?.();
          },
        }),
      ],
    });
    const view = new EditorView({ state: startState, parent: hostRef.current });
    viewRef.current = view;
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    onCursorRef.current?.({ line: line.number, column: head - line.from + 1 });
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is created once; prop changes are applied through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: appearance.reconfigure(editorTheme(isDark)),
    });
  }, [appearance, isDark]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editable.reconfigure(EditorView.editable.of(!readOnly)),
    });
  }, [editable, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (content === view.state.doc.toString()) return;
    suppressRef.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      selection: { anchor: 0 },
    });
    suppressRef.current = false;
  }, [content]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    closeFind();
    setFormatMenu(null);
    view.dispatch({
      selection: { anchor: 0 },
      effects: EditorView.scrollIntoView(0, { y: "start" }),
    });
    view.focus();
    // Reset the find state only when switching notes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    if (!formatMenu) return;
    const close = () => setFormatMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [formatMenu]);

  const selectMatch = (index: number) => {
    const view = viewRef.current;
    if (!view) return;
    const field = view.state.field(findField);
    if (!field.matches.length) return;
    const normalized = ((index % field.matches.length) + field.matches.length) % field.matches.length;
    const match = field.matches[normalized];
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      effects: [
        setFind.of({ query: field.query, index: normalized }),
        EditorView.scrollIntoView(match.from, { y: "center" }),
      ],
    });
    setMatchInfo({ count: field.matches.length, index: normalized });
  };

  const runFind = (value: string, index = 0) => {
    const view = viewRef.current;
    if (!view) return;
    if (!value) {
      view.dispatch({ effects: setFind.of({ query: "", index: 0 }) });
      setMatchInfo({ count: 0, index: 0 });
      return;
    }
    view.dispatch({ effects: setFind.of({ query: value, index }) });
    const field = view.state.field(findField);
    if (!field.matches.length) {
      setMatchInfo({ count: 0, index: 0 });
      return;
    }
    const target = ((index % field.matches.length) + field.matches.length) % field.matches.length;
    const match = field.matches[target];
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      effects: [
        setFind.of({ query: value, index: target }),
        EditorView.scrollIntoView(match.from, { y: "center" }),
      ],
    });
    setMatchInfo({ count: field.matches.length, index: target });
  };

  const step = (delta: number) => {
    const view = viewRef.current;
    if (!view) return;
    const field = view.state.field(findField);
    if (!field.matches.length) return;
    selectMatch(field.index + delta);
  };

  const openFind = () => {
    const view = viewRef.current;
    if (!view) return;
    findOpenRef.current = true;
    setFindOpen(true);
    const selection = view.state.selection.main;
    const selected = selection.empty
      ? ""
      : view.state.sliceDoc(selection.from, selection.to).replace(/\n/g, " ");
    const value = selected && selected.length < 60 ? selected : query;
    setQuery(value);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
      if (value) runFind(value, 0);
    }, 10);
  };

  const closeFind = () => {
    findOpenRef.current = false;
    setFindOpen(false);
    setMatchInfo({ count: 0, index: 0 });
    const view = viewRef.current;
    if (view) {
      view.dispatch({ effects: setFind.of({ query: "", index: 0 }) });
      view.focus();
    }
  };

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    openFind,
    selectedText: () => {
      const view = viewRef.current;
      if (!view) return "";
      const selection = view.state.selection.main;
      return selection.empty ? "" : view.state.sliceDoc(selection.from, selection.to);
    },
  }));

  const onFindKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFind();
    } else if (event.key === "Enter") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    }
  };

  const applyFormat = (action: (view: EditorView) => void) => {
    const view = viewRef.current;
    setFormatMenu(null);
    if (view) action(view);
  };

  const onEditorContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const target = event.target as HTMLElement;
    if (!target.closest(".cm-editor")) return;
    event.preventDefault();
    setFormatMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 210)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 334)),
    });
  };

  const mod = modLabel();

  return (
    <div
      className="code-editor"
      data-find={findOpen}
      ref={hostRef}
      onContextMenu={onEditorContextMenu}
    >
      {findOpen && (
        <div className="find-bar" role="search">
          <Icon name="search" size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              runFind(event.target.value, 0);
            }}
            onKeyDown={onFindKeyDown}
            placeholder="在当前笔记中查找"
            aria-label="在当前笔记中查找"
            spellCheck={false}
          />
          <span className="find-count">
            {matchInfo.count ? `${matchInfo.index + 1} / ${matchInfo.count}` : query ? "无结果" : ""}
          </span>
          <button
            className="find-step"
            onClick={() => step(-1)}
            disabled={!matchInfo.count}
            title="上一个 (Shift + Enter)"
            aria-label="上一个匹配"
          >
            <Icon name="chevron-down" size={15} style={{ transform: "rotate(180deg)" }} />
          </button>
          <button
            className="find-step"
            onClick={() => step(1)}
            disabled={!matchInfo.count}
            title="下一个 (Enter)"
            aria-label="下一个匹配"
          >
            <Icon name="chevron-down" size={15} />
          </button>
          <button className="find-step" onClick={closeFind} title="关闭 (Esc)" aria-label="关闭查找">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      {formatMenu && (
        <div
          ref={formatMenuRef}
          className="context-menu format-menu"
          role="menu"
          aria-label="Markdown 格式化"
          style={{ left: formatMenu.x, top: formatMenu.y }}
          onMouseDown={(event) => event.preventDefault()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => applyFormat((view) => toggleInline(view, "**"))}
          >
            <span className="format-glyph format-bold">B</span>
            <span>粗体</span>
            <span className="menu-shortcut">{mod}+B</span>
          </button>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => applyFormat((view) => toggleInline(view, "*"))}
          >
            <span className="format-glyph format-italic">I</span>
            <span>斜体</span>
            <span className="menu-shortcut">{mod}+I</span>
          </button>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => applyFormat((view) => toggleInline(view, "~~"))}
          >
            <span className="format-glyph">S</span>
            <span>删除线</span>
            <span className="menu-shortcut">{mod}+Shift+X</span>
          </button>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => applyFormat((view) => toggleInline(view, "`"))}
          >
            <span className="format-glyph format-code">&lt;/&gt;</span>
            <span>行内代码</span>
          </button>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => applyFormat(insertLink)}
          >
            <span className="format-glyph">↗</span>
            <span>链接</span>
            <span className="menu-shortcut">{mod}+K</span>
          </button>
          <div className="menu-separator" />
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => applyFormat(toggleHeading)}
          >
            <span className="format-glyph">H</span>
            <span>标题</span>
            <span className="menu-shortcut">##</span>
          </button>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => applyFormat((view) => toggleLinePrefix(view, "> "))}
          >
            <span className="format-glyph">“</span>
            <span>引用</span>
          </button>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => applyFormat((view) => toggleLinePrefix(view, "- "))}
          >
            <span className="format-glyph">•</span>
            <span>无序列表</span>
          </button>
          <button
            className="menu-item"
            role="menuitem"
            onClick={() => applyFormat((view) => toggleLinePrefix(view, "- [ ] "))}
          >
            <span className="format-glyph">☑</span>
            <span>任务列表</span>
          </button>
        </div>
      )}
    </div>
  );
});
