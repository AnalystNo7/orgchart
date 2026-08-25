/**
 * Знак продукта: узел оргструктуры с двумя подчинёнными.
 * Собственный нейтральный символ — чужая фирменная символика не используется.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="shrink-0"
    >
      <rect x="1" y="1" width="30" height="30" rx="8" fill="rgba(255,255,255,0.14)" />
      <rect x="11" y="6" width="10" height="7" rx="2" fill="#fff" />
      <rect x="4" y="19" width="10" height="7" rx="2" fill="var(--gpc-orange)" />
      <rect x="18" y="19" width="10" height="7" rx="2" fill="rgba(255,255,255,0.72)" />
      <path
        d="M16 13v3.5M9 19v-2.5h14V19"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}
