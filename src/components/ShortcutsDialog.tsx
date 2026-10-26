import { useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { modLabel } from "../hooks/useTheme";
import { Icon } from "./Icon";

interface Shortcut {
  label: string;
  keys: string[];
  note?: string;
}

interface Group {
  title: string;
  items: Shortcut[];
}

export function ShortcutsDialog() {
  const open = useAppStore((state) => state.shortcutsOpen);
  const setOpen = useAppStore((state) => state.setShortcutsOpen);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef);

  if (!open) return null;

  const mod = modLabel();
  const groups: Group[] = [
    {
      title: "笔记",
      items: [
        { label: "新建笔记", keys: [mod, "N"] },
        { label: "保存", keys: [mod, "S"] },
        { label: "聚焦标题", keys: [mod, "Shift", "E"] },
        { label: "切换到最近笔记（macOS 用 Ctrl）", keys: ["Ctrl", "Tab"] },
        { label: "移到回收站", keys: ["右键菜单"] },
      ],
    },
    {
      title: "格式化",
      items: [
        { label: "粗体", keys: [mod, "B"] },
        { label: "斜体", keys: [mod, "I"] },
        { label: "链接", keys: [mod, "K"] },
        { label: "删除线", keys: [mod, "Shift", "X"] },
        { label: "标题 / 引用 / 列表", keys: ["右键菜单"] },
      ],
    },
    {
      title: "搜索与跳转",
      items: [
        { label: "在当前笔记中查找", keys: [mod, "F"] },
        { label: "全局全文搜索", keys: [mod, "Shift", "F"] },
        { label: "命令面板", keys: [mod, "P"] },
        { label: "筛选当前列表", keys: [mod, "Shift", "L"] },
      ],
    },
    {
      title: "视图",
      items: [
        { label: "折叠 / 展开侧边栏", keys: [mod, "\\"] },
        { label: "切换 Markdown 预览", keys: [mod, "Shift", "V"] },
        { label: "专注模式", keys: [mod, "Shift", "Enter"] },
        { label: "版本历史", keys: [mod, "Shift", "H"] },
        { label: "设置", keys: [mod, ","] },
        { label: "快捷键一览", keys: ["?"] },
      ],
    },
  ];

  return (
    <div className="overlay modal-overlay" onMouseDown={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className="modal shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-label="快捷键"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="modal-eyebrow">Keyboard</p>
            <h2>快捷键</h2>
          </div>
          <button className="icon-button" onClick={() => setOpen(false)} aria-label="关闭快捷键">
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="modal-body shortcuts-body">
          {groups.map((group) => (
            <section key={group.title} className="shortcut-group">
              <h3>{group.title}</h3>
              <div className="shortcut-list">
                {group.items.map((item) => (
                  <div key={item.label} className="shortcut-row">
                    <span>{item.label}</span>
                    <span className="shortcut-keys">
                      {item.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="modal-footer">
          <span className="modal-footnote">命令面板里也能找到所有操作</span>
          <button className="button solid" onClick={() => setOpen(false)}>
            知道了
          </button>
        </footer>
      </div>
    </div>
  );
}
