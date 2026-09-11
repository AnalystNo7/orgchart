/* Перегенерировать src/app/icon.svg из BrandMark после правки геометрии знака. */
import { writeFileSync } from "node:fs";
import { brandMarkSvg } from "@/components/layout/BrandMark";
const header = "<!-- Сгенерировано из src/components/layout/BrandMark.tsx (brandMarkSvg). Не править руками: npx tsx scripts/brand-icon-sync.ts -->\n";
writeFileSync("src/app/icon.svg", header + brandMarkSvg({ tile: true }) + "\n");
console.log("icon.svg written");
