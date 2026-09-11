import { ImageResponse } from "next/og";
import { brandMarkSvg } from "@/components/layout/BrandMark";

/**
 * PNG-значок 32×32 для браузеров без поддержки SVG-favicon (Safari) и для
 * закладок. Форма — из BrandMark, векторная версия рядом: icon.svg.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  const svg = brandMarkSvg({ tile: true });
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          width={size.width}
          height={size.height}
          alt=""
        />
      </div>
    ),
    size,
  );
}
