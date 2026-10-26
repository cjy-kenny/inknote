import { useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { useFocusTrap } from "../hooks/useFocusTrap";
import type { AccentName, EditorFont, ThemeMode } from "../types";
import { Icon, type IconName } from "./Icon";
import { modLabel } from "../hooks/useTheme";

const themes: Array<{ value: ThemeMode; label: string; icon: IconName }> = [
  { value: "system", label: "跟随系统", icon: "monitor" },
  { value: "light", label: "亮色", icon: "sun" },
  { value: "dark", label: "暗色", icon: "moon" },
];

const accents: Array<{ value: AccentName; label: string; color: string }> = [
  { value: "slate", label: "蓝灰", color: "#55707c" },
  { value: "moss", label: "墨绿", color: "#55705a" },
  { value: "amber", label: "暖橙", color: "#a4653f" },
];

const fonts: Array<{ value: EditorFont; label: string; sample: string }> = [
  { value: "serif", label: "衬线", sample: "永" },
  { value: "sans", label: "黑体", sample: "永" },
  { value: "mono", label: "等宽", sample: "永" },
];

export function SettingsDialog() {
  const open = useAppStore((state) => state.settingsOpen);
  const setOpen = useAppStore((state) => state.setSettingsOpen);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const dataDir = useAppStore((state) => state.dataDir);
  const version = useAppStore((state) => state.version);
  const notes = useAppStore((state) => state.notes);
  const openDataDir = useAppStore((state) => state.openDataDir);
  const importNotes = useAppStore((state) => state.importNotes);
  const exportAll = useAppStore((state) => state.exportAll);
  const setShortcutsOpen = useAppStore((state) => state.setShortcutsOpen);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef);

  if (!open) return null;

  const live = notes.filter((note) => !note.deletedAt);
  const words = live.reduce((sum, note) => sum + note.wordCount, 0);

  return (
    <div className="overlay modal-overlay" onMouseDown={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="modal-eyebrow">Preferences</p>
            <h2>设置</h2>
          </div>
          <button className="icon-button" onClick={() => setOpen(false)} aria-label="关闭设置">
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="modal-body settings-body">
          <section className="settings-section">
            <div className="settings-section-head">
              <h3>外观</h3>
              <span>克制、安静，长时间阅读不累。</span>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <span>主题</span>
                <small>跟随系统会随桌面明暗自动切换</small>
              </div>
              <div className="segmented">
                {themes.map((item) => (
                  <button
                    key={item.value}
                    data-active={settings.theme === item.value}
                    onClick={() => updateSettings({ theme: item.value })}
                  >
                    <Icon name={item.icon} size={15} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <span>强调色</span>
                <small>只用于光标、选中与少量提示</small>
              </div>
              <div className="accent-row">
                {accents.map((accent) => (
                  <button
                    key={accent.value}
                    className="accent-choice"
                    data-active={settings.accent === accent.value}
                    onClick={() => updateSettings({ accent: accent.value })}
                    title={accent.label}
                  >
                    <span className="accent-swatch" style={{ background: accent.color }} />
                    {accent.label}
                    {settings.accent === accent.value && <Icon name="check" size={13} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <span>编辑字体</span>
                <small>正文使用你偏好的字形</small>
              </div>
              <div className="segmented font-segmented">
                {fonts.map((font) => (
                  <button
                    key={font.value}
                    data-active={settings.editorFont === font.value}
                    data-font={font.value}
                    onClick={() => updateSettings({ editorFont: font.value })}
                  >
                    <span className="font-sample">{font.sample}</span>
                    {font.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-label">
                <span>行距</span>
                <small>{settings.lineHeight.toFixed(2)} · 舒展一些，眼睛更轻松</small>
              </div>
              <div className="range-wrap">
                <span className="range-min">紧凑</span>
                <input
                  type="range"
                  min={1.5}
                  max={2.15}
                  step={0.05}
                  value={settings.lineHeight}
                  onChange={(event) =>
                    updateSettings({ lineHeight: Number(event.target.value) })
                  }
                  aria-label="编辑区行距"
                />
                <span className="range-max">舒展</span>
              </div>
            </div>

            <div className="type-sample" data-font={settings.editorFont}>
              <p>写作是把散落的想法，安静地放回纸面。</p>
              <span>InkNote · 本地 Markdown 笔记</span>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <h3>数据</h3>
              <span>正文是普通文件，索引只是副本。</span>
            </div>
            <div className="data-path-card">
              <div className="data-path-icon">
                <Icon name="folder" size={18} />
              </div>
              <div className="data-path-copy">
                <span>笔记目录</span>
                <code title={dataDir}>{dataDir || "~/Documents/InkNote"}</code>
              </div>
              <button className="button subtle" onClick={() => void openDataDir()}>
                <Icon name="external" size={14} />
                打开目录
              </button>
            </div>
            <div className="data-stats">
              <span>
                <strong>{live.length}</strong> 篇笔记
              </span>
              <span>
                <strong>{words.toLocaleString("zh-CN")}</strong> 字
              </span>
              <span>
                <strong>{notes.filter((note) => note.deletedAt).length}</strong> 篇在回收站
              </span>
            </div>
            <div className="data-actions">
              <button className="button subtle" onClick={() => void importNotes()}>
                <Icon name="upload" size={15} />
                导入 .md / .txt
              </button>
              <button className="button subtle" onClick={() => void exportAll()}>
                <Icon name="download" size={15} />
                导出全部笔记
              </button>
            </div>
            <p className="settings-note">
              所有内容默认保存在本机，不会上传。直接复制 notes 文件夹即可迁移到另一台电脑；
              应用下次启动时会自动重新建立索引。
            </p>
          </section>

          <section className="settings-section about-section">
            <div className="settings-section-head">
              <h3>关于</h3>
              <span>InkNote {version || "0.1.0"}</span>
            </div>
            <div className="about-card">
              <div className="about-mark">
                <Icon name="leaf" size={18} />
              </div>
              <p>
                <strong>一个安静的本地记事本。</strong>
                无账号、无同步、无遥测。只有 Markdown 文件和你的想法。
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setOpen(false);
                  setShortcutsOpen(true);
                }}
              >
                <Icon name="keyboard" size={14} />
                查看快捷键（{modLabel()} + ?）
              </button>
            </div>
          </section>
        </div>

        <footer className="modal-footer">
          <span className="modal-footnote">设置会自动保存</span>
          <button className="button solid" onClick={() => setOpen(false)}>
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}
