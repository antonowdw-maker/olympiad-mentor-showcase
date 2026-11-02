/**
 * Абстрактные SVG-портреты бейджей (без чужих IP/фото).
 * Разные «лица» через форму причёски / аксессуара + цвет кольца из темы.
 */
import type { ReactNode } from "react";
import type { BadgePortraitId } from "@/lib/progress/badge-catalog";

type Props = {
  portrait: string;
  className?: string;
};

function FaceBase({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <circle cx="32" cy="32" r="30" fill="var(--badge-face)" />
      <circle cx="32" cy="34" r="18" fill="color-mix(in srgb, var(--ink) 8%, white)" />
      {/* глаза */}
      <circle cx="25" cy="32" r="2.2" fill="var(--ink)" />
      <circle cx="39" cy="32" r="2.2" fill="var(--ink)" />
      {/* улыбка */}
      <path
        d="M24 40c3 4 13 4 16 0"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {children}
    </svg>
  );
}

/** Простая вариация силуэта по ключу портрета. */
export function BadgePortrait({ portrait, className }: Props) {
  const id = (portrait || "explorer") as BadgePortraitId | string;

  let accent: ReactNode = null;
  switch (id) {
    case "archimedes":
      accent = <path d="M16 18h32l-4 8H20z" fill="var(--badge-ring)" opacity="0.85" />;
      break;
    case "euler":
      accent = (
        <>
          <ellipse cx="32" cy="16" rx="14" ry="6" fill="var(--badge-ring)" opacity="0.7" />
          <rect x="28" y="44" width="8" height="10" rx="2" fill="var(--badge-ring)" opacity="0.5" />
        </>
      );
      break;
    case "gauss":
      accent = (
        <path
          d="M18 22c4-10 24-10 28 0-6 4-16 4-28 0z"
          fill="var(--badge-ring)"
          opacity="0.75"
        />
      );
      break;
    case "boole":
      accent = (
        <text x="32" y="18" textAnchor="middle" fontSize="10" fill="var(--badge-ring)" fontWeight="700">
          ∧
        </text>
      );
      break;
    case "noether":
      accent = (
        <path
          d="M20 14c6 2 18 2 24 0v6c-6 3-18 3-24 0z"
          fill="var(--badge-ring)"
          opacity="0.8"
        />
      );
      break;
    case "pascal":
      accent = (
        <polygon
          points="32,10 40,22 24,22"
          fill="var(--badge-ring)"
          opacity="0.85"
        />
      );
      break;
    case "euclid":
      accent = (
        <rect
          x="22"
          y="10"
          width="20"
          height="12"
          rx="2"
          fill="none"
          stroke="var(--badge-ring)"
          strokeWidth="2"
        />
      );
      break;
    case "khwarizmi":
      accent = (
        <text x="32" y="18" textAnchor="middle" fontSize="9" fill="var(--badge-ring)" fontWeight="700">
          1·2
        </text>
      );
      break;
    case "pythagoras":
      accent = (
        <polygon
          points="32,8 44,28 20,28"
          fill="none"
          stroke="var(--badge-ring)"
          strokeWidth="2"
        />
      );
      break;
    case "nash":
      accent = (
        <circle
          cx="32"
          cy="14"
          r="6"
          fill="none"
          stroke="var(--badge-ring)"
          strokeWidth="2"
        />
      );
      break;
    case "polya":
      accent = (
        <path
          d="M22 16h20M32 12v10"
          stroke="var(--badge-ring)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      );
      break;
    default:
      accent = (
        <circle cx="32" cy="14" r="5" fill="var(--badge-ring)" opacity="0.65" />
      );
  }

  return (
    <span className={className}>
      <FaceBase>{accent}</FaceBase>
    </span>
  );
}
