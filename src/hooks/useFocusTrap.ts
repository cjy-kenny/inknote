import { useEffect, type RefObject } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFirst = () => {
      const items = Array.from(node.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (item) => item.offsetParent !== null,
      );
      if (!items.length) {
        node.focus();
        return;
      }
      if (!node.contains(document.activeElement)) {
        items[0].focus();
      }
    };

    const timer = window.setTimeout(focusFirst, 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (item) => item.offsetParent !== null,
      );
      if (!items.length) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey) {
        if (current === first || !node.contains(current)) {
          event.preventDefault();
          last.focus();
        }
      } else if (current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      node.removeEventListener("keydown", onKeyDown);
      if (previous && document.contains(previous)) {
        window.setTimeout(() => previous.focus(), 0);
      }
    };
  }, [active, ref]);
}
