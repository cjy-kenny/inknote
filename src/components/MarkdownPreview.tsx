import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { api } from "../lib/api";

interface Props {
  content: string;
}

marked.setOptions({
  gfm: true,
  breaks: false,
});

export function MarkdownPreview({ content }: Props) {
  const html = useMemo(() => {
    const rendered = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(rendered, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["target"],
    });
  }, [content]);

  return (
    <div className="preview-scroll">
      <article
        className="markdown-body"
        onClick={(event) => {
          const anchor = (event.target as HTMLElement).closest("a");
          if (!anchor) return;
          const href = anchor.getAttribute("href");
          if (!href) return;
          event.preventDefault();
          if (href.startsWith("#")) {
            document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" });
            return;
          }
          void api.openExternal(href).catch(() => {
            // Invalid or blocked links are ignored.
          });
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
