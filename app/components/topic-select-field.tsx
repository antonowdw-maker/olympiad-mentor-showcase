"use client";

/**
 * Адаптивный выбор темы вместо native `<select>`:
 * - закрытое поле на всю ширину, название переносится (высота растёт);
 * - открытый список в потоке документа (поле «расширяется»), та же ширина, wrap.
 */
import { useEffect, useId, useRef, useState } from "react";
import { TOUCH_MIN_PX } from "@/lib/ui/mobile";

export type TopicSelectOption = {
  value: string;
  label: string;
};

type Props = {
  label: string;
  ariaLabel: string;
  options: TopicSelectOption[];
  /** Контролируемое значение; для «перейти к теме» можно "" (плейсхолдер). */
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

/** Кнопка выбора: flex + min-h, без truncate / nowrap. */
const triggerClass =
  "box-border flex w-full min-w-0 items-start justify-between gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-left text-sm font-normal leading-snug text-[var(--ink)] disabled:opacity-60";

const optionClass =
  "box-border flex w-full min-w-0 items-start px-3 py-2.5 text-left text-sm font-normal leading-snug";

export function TopicSelectField({
  label,
  ariaLabel,
  options,
  value,
  placeholder = "Выбери тему…",
  disabled = false,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const buttonText = selected?.label ?? placeholder;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="w-full min-w-0">
      <p className="mb-1.5 text-sm text-[var(--muted)]">{label}</p>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        style={{ minHeight: TOUCH_MIN_PX }}
        className={triggerClass}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 flex-1 whitespace-normal break-words [overflow-wrap:anywhere]">
          {buttonText}
        </span>
        <span className="mt-0.5 shrink-0 text-[var(--muted)]" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="mt-1 max-h-[min(70vh,24rem)] w-full min-w-0 overflow-y-auto overscroll-contain rounded-lg border border-[var(--line)] bg-white py-1 shadow-md"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={active} className="min-w-0">
                <button
                  type="button"
                  style={{ minHeight: TOUCH_MIN_PX }}
                  className={`${optionClass} ${
                    active
                      ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                      : "text-[var(--ink)] hover:bg-[var(--brand-soft)]/60"
                  }`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 whitespace-normal break-words [overflow-wrap:anywhere]">
                    {o.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
