/**
 * Кубок-иконка (общий UI; не чужой IP).
 */
export function CupIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M6 3h12v2h2a2 2 0 0 1 2 2v2a5 5 0 0 1-4.1 4.9A5 5 0 0 1 13 18.9V20h3v2H8v-2h3v-1.1a5 5 0 0 1-4.9-4.9A5 5 0 0 1 2 9V7a2 2 0 0 1 2-2h2V3zm2 2v2H4v2a3 3 0 0 0 3 3h1.1A5 5 0 0 1 8 7V5zm8 0v2a5 5 0 0 1-.1 1H17a3 3 0 0 0 3-3V7h-4z" />
    </svg>
  );
}
