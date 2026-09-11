/**
 * Знак приложения «дерево узлов»: корень и три дочерних узла, один из них
 * оранжевый (фокус анализа). Фирменная палитра: Pantone 300 / Pantone 1655.
 *
 * Единственный источник формы. Отсюда читают:
 * - <BrandMark/> — шапка боковой панели (без плитки, белый глиф на синем);
 * - brandMarkSvg() — строка SVG для src/app/icon.svg (генерируется скриптом)
 *   и для PNG-иконок src/app/icon.tsx / apple-icon.tsx (через data-URL).
 * Правя геометрию, перегенерируй icon.svg: см. комментарий в нём.
 */

export const BRAND_BLUE = "#0079C2";
export const BRAND_ORANGE = "#FF6919";

export const BRAND_MARK = {
  viewBox: "0 0 64 64",
  tileRadius: 14,
  /** Связи корня с тремя дочерними узлами. */
  links: "M32 24V32M14 32H50M14 32V41M32 32V41M50 32V41",
  strokeWidth: 2.6,
  nodes: [
    { cx: 32, cy: 18, r: 6.5, fill: "#fff" },
    { cx: 14, cy: 46, r: 5.2, fill: "#fff" },
    { cx: 32, cy: 46, r: 5.2, fill: "#fff" },
    { cx: 50, cy: 46, r: 5.2, fill: BRAND_ORANGE },
  ],
} as const;

/** SVG-разметка знака строкой — для файла icon.svg и PNG-генераторов. */
export function brandMarkSvg({ tile = true, size }: { tile?: boolean; size?: number } = {}): string {
  const dim = size ? ` width="${size}" height="${size}"` : "";
  const tileRect = tile
    ? `<rect width="64" height="64" rx="${BRAND_MARK.tileRadius}" fill="${BRAND_BLUE}"/>`
    : "";
  const nodes = BRAND_MARK.nodes
    .map((n) => `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" fill="${n.fill}"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BRAND_MARK.viewBox}"${dim}>` +
    tileRect +
    `<path d="${BRAND_MARK.links}" stroke="#fff" stroke-width="${BRAND_MARK.strokeWidth}" stroke-linecap="round" fill="none"/>` +
    nodes +
    `</svg>`
  );
}

/** Знак как React-компонент. По умолчанию без плитки — для синей шапки панели. */
export function BrandMark({
  size = 28,
  tile = false,
  className,
}: {
  size?: number;
  tile?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={BRAND_MARK.viewBox}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {tile && <rect width="64" height="64" rx={BRAND_MARK.tileRadius} fill={BRAND_BLUE} />}
      <path
        d={BRAND_MARK.links}
        stroke="#fff"
        strokeWidth={BRAND_MARK.strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      {BRAND_MARK.nodes.map((n) => (
        <circle key={`${n.cx}-${n.cy}`} cx={n.cx} cy={n.cy} r={n.r} fill={n.fill} />
      ))}
    </svg>
  );
}
