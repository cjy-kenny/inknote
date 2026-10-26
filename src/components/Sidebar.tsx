import { memo, useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { Logo, Icon, type IconName } from "./Icon";
import { modLabel } from "../hooks/useTheme";

interface NavItem {
  key: "all" | "favorites" | "recent" | "trash";
  label: string;
  icon: IconName;
  count: number;
}

export const Sidebar = memo(function Sidebar() {
  const view = useAppStore((state) => state.view);
  const notes = useAppStore((state) => state.notes);
  const recentIds = useAppStore((state) => state.recentIds);
  const tags = useAppStore((state) => state.tags);
  const tagFilter = useAppStore((state) => state.tagFilter);
  const collapsed = useAppStore((state) => state.settings.sidebarCollapsed);
  const theme = useAppStore((state) => state.settings.theme);
  const drawerOpen = useAppStore((state) => state.sidebarDrawerOpen);
  const setView = useAppStore((state) => state.setView);
  const setTagFilter = useAppStore((state) => state.setTagFilter);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setShortcutsOpen = useAppStore((state) => state.setShortcutsOpen);
  const setSidebarDrawerOpen = useAppStore((state) => state.setSidebarDrawerOpen);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const items = useMemo<NavItem[]>(() => {
    const live = notes.filter((note) => !note.deletedAt);
    return [
      { key: "all", label: "全部笔记", icon: "layers", count: live.length },
      {
        key: "favorites",
        label: "收藏",
        icon: "star",
        count: live.filter((note) => note.favorite).length,
      },
      {
        key: "recent",
        label: "最近",
        icon: "clock",
        count: recentIds.length || Math.min(live.length, 20),
      },
      {
        key: "trash",
        label: "回收站",
        icon: "trash",
        count: notes.filter((note) => note.deletedAt).length,
      },
    ];
  }, [notes, recentIds]);

  const themeLabel =
    theme === "system" ? "跟随系统" : theme === "light" ? "亮色" : "暗色";
  const ThemeIcon = theme === "system" ? "monitor" : theme === "light" ? "sun" : "moon";

  const cycleTheme = () => {
    const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    updateSettings({ theme: next });
  };

  return (
    <>
      <div
        className="sidebar-scrim"
        data-visible={drawerOpen}
        onClick={() => setSidebarDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        className="sidebar"
        data-collapsed={collapsed}
        data-drawer-open={drawerOpen}
        aria-label="主导航"
      >
        <div className="sidebar-top">
          <button
            className="brand"
            onClick={() => setView("all")}
            title="InkNote"
            aria-label="回到全部笔记"
          >
            <Logo size={30} />
            <span className="brand-text">
              <span className="brand-name">InkNote</span>
              <span className="brand-sub">本地笔记</span>
            </span>
          </button>
          <button
            className="icon-button sidebar-collapse"
            onClick={toggleSidebar}
            title={`${collapsed ? "展开" : "收起"}侧边栏 (${modLabel()}+\\)`}
            aria-label="收起侧边栏"
          >
            <Icon name="panel-left" size={17} />
          </button>
          <button
            className="icon-button sidebar-drawer-close"
            onClick={() => setSidebarDrawerOpen(false)}
            aria-label="关闭导航"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {items.map((item) => (
            <button
              key={item.key}
              className="nav-item"
              data-active={view === item.key}
              onClick={() => {
                setView(item.key);
                setSidebarDrawerOpen(false);
              }}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">
                <Icon
                  name={item.icon}
                  size={17}
                  filled={item.key === "favorites" && view === "favorites"}
                />
              </span>
              <span className="nav-label">{item.label}</span>
              {item.count > 0 && <span className="nav-count">{item.count}</span>}
            </button>
          ))}
        </nav>

        {tags.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <span>标签</span>
              <Icon name="tag" size={13} />
            </div>
            <div className="tag-list">
              {tags.map((tag) => (
                <button
                  key={tag.name}
                  className="tag-item"
                  data-active={tagFilter === tag.name}
                  onClick={() => {
                    if (view === "trash") setView("all");
                    setTagFilter(tagFilter === tag.name ? null : tag.name);
                    setSidebarDrawerOpen(false);
                  }}
                  title={`筛选标签「${tag.name}」`}
                >
                  <span className="tag-hash">#</span>
                  <span className="tag-name">{tag.name}</span>
                  <span className="tag-count">{tag.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sidebar-spacer" />

        <div className="sidebar-foot">
          <button
            className="nav-item"
            onClick={cycleTheme}
            title={collapsed ? `外观：${themeLabel}` : "切换外观"}
          >
            <span className="nav-icon">
              <Icon name={ThemeIcon} size={17} />
            </span>
            <span className="nav-label">{themeLabel}</span>
          </button>
          <button
            className="nav-item"
            onClick={() => setShortcutsOpen(true)}
            title={collapsed ? "快捷键" : undefined}
          >
            <span className="nav-icon">
              <Icon name="keyboard" size={17} />
            </span>
            <span className="nav-label">快捷键</span>
          </button>
          <button
            className="nav-item"
            onClick={() => setSettingsOpen(true)}
            title={collapsed ? "设置" : undefined}
          >
            <span className="nav-icon">
              <Icon name="settings" size={17} />
            </span>
            <span className="nav-label">设置</span>
          </button>
          <div className="local-note">
            <span className="local-dot" />
            <span>仅存于本机</span>
          </div>
        </div>
      </aside>
    </>
  );
});
