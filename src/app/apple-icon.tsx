import { ImageResponse } from "next/og";
import { brandMarkSvg } from "@/components/layout/BrandMark";

/**
 * apple-touch-icon 180×180: закладка на домашнем экране iOS/Android.
 * Плитка уже со скруглением, iOS скруглит ещё раз по своей маске — это норма.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
