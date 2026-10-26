import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { NoteMeta } from "../types";
import { Icon, type IconName } from "./Icon";
import { useClickOutside } from "../hooks/useClickOutside";

interface Props {
  note: NoteMeta;
  x: number;
  y: number;
  onClose: () => void;
  onExport: () => void | Promise<void>;
}

interface Item {
  label: string;
  icon: IconName;
  run: () => void | Promise<void>;
  danger?: boolean;
}

export function NoteContextMenu({ note, x, y, onClose, onExport }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const openNote = useAppStore((state) => state.openNote);
  const trashActive = useAppStore((state) => state.trashActive);
  const restoreNote = useAppStore((state) => state.restoreNote);
  const purgeNote = useAppStore((state) => state.purgeNote);
  const setHistoryOpen = useAppStore((state) => state.setHistoryOpen);
  const activeId = useAppStore((state) => state.activeId);

  useClickOutside(ref, onClose);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    setPosition({ left, top });
  }, [x, y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const items: Item[] = note.deletedAt
    ? [
        {
          label: "恢复这篇笔记",
          icon: "restore",
          run: async () => {
            onClose();
            await restoreNote(note.id);
          },
        },
        {
          label: "永久删除",
          icon: "trash",
          danger: true,
          run: async () => {
            onClose();
            if (window.confirm(`永久删除「${note.title}」？这个操作无法撤销。`)) {
              await purgeNote(note.id);
            }
          },
        },
      ]
    : [
        {
          label: "打开",
          icon: "edit",
          run: async () => {
            onClose();
            await openNote(note.id);
          },
        },
        {
          label: note.favorite ? "取消收藏" : "加入收藏",
          icon: "star",
          run: async () => {
            onClose();
            if (activeId !== note.id) await openNote(note.id);
            await useAppStore.getState().toggleFavorite();
          },
        },
        {
          label: "版本历史",
          icon: "history",
          run: async () => {
            onClose();
            if (activeId !== note.id) await openNote(note.id);
            setHistoryOpen(true);
          },
        },
        {
          label: "导出 Markdown",
          icon: "download",
          run: async () => {
            onClose();
            await onExport();
          },
        },
        {
          label: "移到回收站",
          icon: "trash",
          danger: true,
          run: async () => {
            onClose();
            if (activeId !== note.id) {
              await openNote(note.id);
            }
            await trashActive();
          },
        },
      ];

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: position.left, top: position.top }}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) => (
        <div key={item.label}>
          {index === items.length - 1 && !note.deletedAt && <div className="menu-separator" />}
          <button
            role="menuitem"
            className="menu-item"
            data-danger={item.danger}
            onClick={() => void item.run()}
          >
            <Icon name={item.icon} size={15} />
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
