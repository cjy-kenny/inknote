import type { SVGProps } from "react";

export type IconName =
  | "plus"
  | "search"
  | "star"
  | "trash"
  | "clock"
  | "layers"
  | "settings"
  | "panel-left"
  | "chevron-down"
  | "chevron-right"
  | "more"
  | "x"
  | "arrow-left"
  | "check"
  | "download"
  | "upload"
  | "history"
  | "eye"
  | "edit"
  | "file"
  | "folder"
  | "keyboard"
  | "tag"
  | "leaf"
  | "external"
  | "restore"
  | "alert"
  | "sun"
  | "moon"
  | "monitor"
  | "command"
  | "corner-down-left"
  | "archive"
  | "book"
  | "sort"
  | "maximize"
  | "minimize"
  | "circle";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  filled?: boolean;
}

const paths: Record<IconName, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  star: (
    <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.9L12 3.6Z" />
  ),
  trash: (
    <>
      <path d="M4.5 7h15M9 7V4.8h6V7M6.7 7l.8 12.2h9l.8-12.2M10 10.5v5M14 10.5v5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3.8 8 4.4-8 4.4-8-4.4 8-4.4Z" />
      <path d="m4 12.4 8 4.4 8-4.4M4 16.6l8 4.4 8-4.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="2.7" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.46V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.46-.97H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 8.84 4.6a1.6 1.6 0 0 0 .97-1.46V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.46.97H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5.97Z" />
    </>
  ),
  "panel-left": (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9 4.5v15" />
    </>
  ),
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
  "arrow-left": <path d="M19 12H5m6-6-6 6 6 6" />,
  check: <path d="m5 12.5 4.2 4.2L19 6.8" />,
  download: <path d="M12 4v11m0 0 4.2-4.2M12 15l-4.2-4.2M5 19.5h14" />,
  upload: <path d="M12 20V9m0 0 4.2 4.2M12 9 7.8 13.2M5 4.5h14" />,
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.1-5.4L4 8.7" />
      <path d="M4 4.5v4.2h4.2M12 8v4.4l3 1.8" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12S6 6.3 12 6.3 21.2 12 21.2 12 18 17.7 12 17.7 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4.2L19.4 8.8a2.3 2.3 0 0 0-3.2-3.2L5 16.8V20Z" />
      <path d="m14.7 7.1 3.2 3.2" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h7l5 5V20.5H6V3.5Z" />
      <path d="M13 3.5v5h5M9 13h6M9 16.5h4" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 7.5A1.8 1.8 0 0 1 5.3 5.7h4l1.8 2h7.6a1.8 1.8 0 0 1 1.8 1.8v8.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8V7.5Z" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.8" y="6" width="18.4" height="12" rx="2" />
      <path d="M6 10h.01M9.4 10h.01M12.8 10h.01M16.2 10h.01M6 13.4h.01M9.4 13.4h.01M12.8 13.4h.01M16.2 13.4h.01M8 16.5h8" />
    </>
  ),
  tag: (
    <>
      <path d="M3.8 12.2V5.2a1.4 1.4 0 0 1 1.4-1.4h7l7.9 7.9a1.6 1.6 0 0 1 0 2.3l-5.7 5.7a1.6 1.6 0 0 1-2.3 0l-8.3-8.3Z" />
      <circle cx="8" cy="8" r="1.2" />
    </>
  ),
  leaf: (
    <>
      <path d="M4.5 19.5C3 12.5 8.5 4.5 20 4.5c0 10.5-7 16.3-13.8 14.4" />
      <path d="M4.5 19.5c2.4-5.5 6.4-9.2 12-12" />
    </>
  ),
  external: <path d="M14 4.5h5.5V10M19.2 4.8l-8 8M18 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" />,
  restore: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.6" />
      <path d="M4 4.5v4.3h4.3" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.8 21 20H3l9-16.2Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.5 8.5 0 1 0 10.4 10.4Z" />,
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="1.6" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
  command: <path d="M9 8V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V8Z" />,
  "corner-down-left": <path d="M20 5v6a3 3 0 0 1-3 3H5m5-5-5 5 5 5" />,
  archive: (
    <>
      <path d="M4 7.5h16V20H4V7.5ZM3 4h18v3.5H3V4Z" />
      <path d="M10 12h4" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.2c3-1 5.4-.5 8 1.3 2.6-1.8 5-2.3 8-1.3v13.6c-3-1-5.4-.5-8 1.3-2.6-1.8-5-2.3-8-1.3V5.2Z" />
      <path d="M12 6.5v13.6" />
    </>
  ),
  sort: <path d="M7 5v14m0 0-3-3m3 3 3-3M17 19V5m0 0-3 3m3-3 3 3" />,
  maximize: <path d="M8.5 3.5H3.5v5M15.5 3.5h5v5M20.5 15.5v5h-5M3.5 15.5v5h5" />,
  minimize: <path d="M9 3.5v5.5H3.5M15 3.5V9h5.5M20.5 15H15v5.5M3.5 15H9v5.5" />,
  circle: <circle cx="12" cy="12" r="7.5" />,
};

export function Icon({ name, size = 18, filled = false, className, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="logo"
    >
      <rect width="32" height="32" rx="8.5" className="logo-ground" />
      <path
        d="M9.4 23V9l13.2 14V9"
        className="logo-stroke"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.4" cy="24.1" r="1.4" className="logo-dot" />
    </svg>
  );
}
