"use client";

/**
 * Бейдж с скином по uiTheme.
 * Подсказка — стилизованная (как раньше), fixed + clamp к viewport: не уезжает за край и не рябит скролл.
 */
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { BadgePortrait } from "@/app/components/badge-portrait";
import type { BadgeCatalogEntry } from "@/lib/progress/badge-catalog";
import type { UiTheme } from "@/lib/ui/theme";
import { TOUCH_ICON_BTN_CLASS } from "@/lib/ui/mobile";

type Props = {
  entry: BadgeCatalogEntry;
  theme: UiTheme;
};

type TipPos = { top: number; left: number; width: number };

const TIP_MAX_W = 224; // ~14rem
const TIP_GAP = 8;
const VIEW_PAD = 8;

export function BadgeView({ entry, theme }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const tipDomId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TipPos | null>(null);

  const placeTip = useCallback(() => {
    const btn = btnRef.current;
    if (!btn || typeof window === "undefined") return;
    const r = btn.getBoundingClientRect();
    const maxW = Math.min(TIP_MAX_W, window.innerWidth - VIEW_PAD * 2);
    // Сначала ставим над бейджем по центру; затем clamp по X; если не влезает сверху — снизу.
    let left = r.left + r.width / 2 - maxW / 2;
    left = Math.max(VIEW_PAD, Math.min(left, window.innerWidth - VIEW_PAD - maxW));

    const tipH = tipRef.current?.offsetHeight ?? 72;
    let top = r.top - tipH - TIP_GAP;
    if (top < VIEW_PAD) {
      top = r.bottom + TIP_GAP;
    }
    if (top + tipH > window.innerHeight - VIEW_PAD) {
      top = Math.max(VIEW_PAD, window.innerHeight - VIEW_PAD - tipH);
    }
    setPos({ top, left, width: maxW });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    placeTip();
    const onReposition = () => placeTip();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, placeTip]);

  const show = () => {
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    setPos(null);
  };

  const tipNode = open ? (
    <span
      ref={tipRef}
      id={tipDomId}
      role="tooltip"
      style={
        pos
          ? {
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 80,
            }
          : {
              position: "fixed",
              top: -9999,
              left: 0,
              width: Math.min(TIP_MAX_W, 224),
              zIndex: 80,
              visibility: "hidden",
            }
      }
      className="pointer-events-none rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-2 text-left text-xs leading-snug text-[var(--ink)] shadow-md"
    >
      <span className="font-medium">{entry.title}</span>
      <span className="mt-0.5 block text-[var(--muted)]">
        {entry.scientist}. {entry.fact}
      </span>
    </span>
  ) : null;

  if (theme === "brawl") {
    return (
      <>
        <button
          ref={btnRef}
          type="button"
          aria-label={entry.title}
          aria-describedby={open ? tipDomId : undefined}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          className={`${TOUCH_ICON_BTN_CLASS} relative p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]`}
        >
          <span className="relative block h-12 w-12">
            <svg
              viewBox="0 0 64 64"
              className="h-full w-full drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]"
              aria-hidden
            >
              {brawlShapeForKind(entry.kind)}
              <circle cx="32" cy="32" r="13" fill="#1a1028" stroke="#0a0610" strokeWidth="2.5" />
              {brawlPinGlyph(entry)}
              <ellipse cx="26" cy="24" rx="3.5" ry="2" fill="white" opacity="0.45" />
            </svg>
          </span>
        </button>
        {tipNode}
      </>
    );
  }

  const ringExtra =
    theme === "arcade"
      ? "shadow-[0_4px_0_rgba(30,42,74,0.15)] border-[3px]"
      : theme === "soft"
        ? "border-[var(--badge-ring)] opacity-95"
        : "";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={entry.title}
        aria-describedby={open ? tipDomId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={`${TOUCH_ICON_BTN_CLASS} relative rounded-full border-2 border-[var(--badge-ring)] bg-[var(--badge-face)] p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${ringExtra}`}
      >
        <BadgePortrait portrait={entry.portrait} className="block h-9 w-9" />
      </button>
      {tipNode}
    </>
  );
}

/** Жирные пиктограммы в стиле mobile-game badge (не портреты учёных). */
function brawlPinGlyph(entry: BadgeCatalogEntry) {
  const p = entry.portrait;
  const ink =
    entry.kind === "technique"
      ? "#b8ffc0"
      : entry.kind === "reinforce"
        ? "#ffc0e8"
        : "#ffe566";

  if (p === "archimedes" || (entry.kind === "milestone" && p === "archimedes")) {
    return (
      <polygon
        points="32,20 35,28 44,28 37,34 40,43 32,37 24,43 27,34 20,28 29,28"
        fill={ink}
        stroke="#0a0610"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    );
  }
  if (p === "euler" || p === "gauss") {
    return (
      <>
        <circle cx="32" cy="30" r="7" fill={ink} stroke="#0a0610" strokeWidth="2" />
        <path d="M26 38h12v4H26z" fill={ink} stroke="#0a0610" strokeWidth="1.5" />
      </>
    );
  }
  if (p === "boole") {
    return (
      <text
        x="32"
        y="36"
        textAnchor="middle"
        fontSize="14"
        fontWeight="900"
        fill={ink}
        stroke="#0a0610"
        strokeWidth="0.6"
      >
        ∧
      </text>
    );
  }
  if (p === "pascal" || p === "pythagoras") {
    return (
      <polygon
        points="32,21 42,41 22,41"
        fill="none"
        stroke={ink}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    );
  }
  if (p === "euclid" || p === "khwarizmi") {
    return (
      <text
        x="32"
        y="37"
        textAnchor="middle"
        fontSize="11"
        fontWeight="900"
        fill={ink}
        stroke="#0a0610"
        strokeWidth="0.5"
      >
        ÷
      </text>
    );
  }
  if (p === "nash" || p === "polya") {
    return (
      <path
        d="M32 20l10 4v8c0 6-4 10-10 12-6-2-10-6-10-12v-8z"
        fill={ink}
        stroke="#0a0610"
        strokeWidth="2"
      />
    );
  }
  if (p === "noether") {
    return (
      <path
        d="M22 32c0-6 4-10 10-10s10 4 10 10-4 12-10 14c-6-2-10-8-10-14z"
        fill="none"
        stroke={ink}
        strokeWidth="2.5"
      />
    );
  }
  return (
    <>
      <circle cx="27" cy="29" r="2.2" fill={ink} />
      <circle cx="37" cy="29" r="2.2" fill={ink} />
      <path
        d="M25 36c2.5 3.5 11.5 3.5 14 0"
        fill="none"
        stroke={ink}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  );
}

function brawlShapeForKind(kind: BadgeCatalogEntry["kind"]) {
  if (kind === "technique") {
    return (
      <>
        <circle cx="32" cy="32" r="28" fill="#3dff4a" stroke="#0a2a0c" strokeWidth="3" />
        <circle cx="32" cy="14" r="7" fill="#6dff74" stroke="#0a2a0c" strokeWidth="2" />
        <circle cx="32" cy="50" r="7" fill="#22c934" stroke="#0a2a0c" strokeWidth="2" />
        <circle cx="14" cy="32" r="7" fill="#6dff74" stroke="#0a2a0c" strokeWidth="2" />
        <circle cx="50" cy="32" r="7" fill="#22c934" stroke="#0a2a0c" strokeWidth="2" />
        <path d="M18 40 A18 18 0 0 0 46 40" fill="#1f9e2e" opacity="0.45" />
      </>
    );
  }
  if (kind === "reinforce" || kind === "unknown") {
    const fill = kind === "reinforce" ? "#ff4db8" : "#3de0ff";
    const fillDark = kind === "reinforce" ? "#c2187a" : "#1a9bb8";
    return (
      <>
        <polygon
          points="32,4 56,32 32,60 8,32"
          fill={fill}
          stroke="#1a0a12"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <polygon points="32,4 44,32 32,32 20,32" fill="white" opacity="0.25" />
        <polygon points="32,32 56,32 32,60 8,32" fill={fillDark} opacity="0.35" />
      </>
    );
  }
  return (
    <>
      <polygon
        points="32,3 39,22 60,22 43,34 49,54 32,42 15,54 21,34 4,22 25,22"
        fill="#ffb020"
        stroke="#1a0a12"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <polygon points="32,8 37,22 32,22 27,22" fill="#ffe566" opacity="0.9" />
      <polygon points="32,32 49,54 32,42 15,54" fill="#e07800" opacity="0.4" />
    </>
  );
}
