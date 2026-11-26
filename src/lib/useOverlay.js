import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

// Only the topmost overlay reacts to Escape/Tab. Backdrop click handlers still
// belong to each component because they need their own close callback.
const stack = [];

function focusable(node) {
  if (!node) return [];
  return Array.from(node.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 || el === document.activeElement
  );
}

/**
 * Modal behaviour shared by drawers and dialogs:
 * - moves focus inside on open and restores it on close
 * - Escape closes the topmost overlay
 * - Tab stays inside the overlay
 */
export default function useOverlay(onClose, label) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  const labelRef = useRef(label);

  useEffect(() => {
    closeRef.current = onClose;
    labelRef.current = label;
  }, [onClose, label]);

  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement;
    stack.push(node);

    const first = focusable(node)[0];
    if (first) first.focus();
    else if (node) {
      node.setAttribute("tabindex", "-1");
      node.focus();
    }

    const onKey = (event) => {
      if (stack[stack.length - 1] !== node) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (closeRef.current) closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable(node);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      } else if (!node.contains(document.activeElement)) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const at = stack.indexOf(node);
      if (at >= 0) stack.splice(at, 1);
      if (previous && typeof previous.focus === "function" && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  return ref;
}
