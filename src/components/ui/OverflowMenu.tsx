import { useCallback, useEffect, useId, useRef, useState } from "react";

export type OverflowMenuItem = {
  id: string;
  label: string;
  onSelect?: () => void;
  href?: string;
  target?: string;
  critical?: boolean;
};

type OverflowMenuProps = {
  /** Accessible name for the ⋯ trigger (e.g. "More actions for Ring"). */
  label: string;
  items: OverflowMenuItem[];
  disabled?: boolean;
};

/**
 * Compact table overflow menu: one ⋯ trigger, fixed-position panel so table
 * overflow does not clip the items (same approach as Prompt Configuration).
 */
export default function OverflowMenu({ label, items, disabled }: OverflowMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  const placeMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 200;
    const estimatedHeight = Math.max(44, items.length * 36 + 16);
    const gap = 6;
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8,
    );
    let top = rect.top - estimatedHeight - gap;
    if (top < 8) {
      top = rect.bottom + gap;
    }
    setPos({ top, left });
  }, [items.length]);

  const toggle = useCallback(() => {
    if (disabled || items.length === 0) return;
    setOpen((wasOpen) => {
      if (wasOpen) {
        setPos(null);
        return false;
      }
      // Position on next paint after open so the trigger rect is current.
      requestAnimationFrame(() => placeMenu());
      return true;
    });
  }, [disabled, items.length, placeMenu]);

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onReposition = () => placeMenu();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, close, placeMenu]);

  if (items.length === 0) return null;

  return (
    <div className="aone-overflow-menu">
      <button
        ref={triggerRef}
        type="button"
        className="aone-icon-btn aone-overflow-trigger"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={toggle}
      >
        ⋯
      </button>
      {open && pos ? (
        <div
          ref={panelRef}
          id={menuId}
          className="aone-overflow-panel aone-overflow-panel-fixed"
          role="menu"
          style={{ top: pos.top, left: pos.left }}
        >
          {items.map((item) => {
            const className = `aone-overflow-item${item.critical ? " is-critical" : ""}`;
            if (item.href) {
              return (
                <a
                  key={item.id}
                  className={className}
                  role="menuitem"
                  href={item.href}
                  target={item.target}
                  rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
                  onClick={() => {
                    item.onSelect?.();
                    close();
                  }}
                >
                  {item.label}
                </a>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                className={className}
                role="menuitem"
                onClick={() => {
                  close();
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
