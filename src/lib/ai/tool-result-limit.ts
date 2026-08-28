/**
 * Tool-result size guard.
 *
 * Providers cap the size of a single text block in an inbound message
 * (Gonka/MiniMax: 65536). A tool returning the whole org tree easily blows
 * past that and the request is rejected outright:
 *   "content entry: invalid shape: [0].text size 90131 exceeds limit 65536"
 *
 * capToolResult() keeps every tool result inside the budget while staying
 * useful to the model: it returns a first page of records plus totals and an
 * explicit hint on how to fetch the rest. The emitted JSON is always valid —
 * never a string cut in the middle of a structure, which the model would
 * happily misread as complete data.
 */

export const DEFAULT_TOOL_RESULT_MAX_BYTES = 60000;

/** Bytes, not characters: Cyrillic is 2 bytes per char in UTF-8. */
function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

function hintFor(shown: number, total: number, extra?: string): string {
  return (
    `Показаны записи 0..${shown - 1} из ${total}. Данные НЕПОЛНЫЕ. ` +
    `Чтобы получить продолжение, вызовите этот же инструмент с offset=${shown}` +
    (extra ? `, либо сузьте выборку (${extra})` : ", либо сузьте выборку фильтрами") +
    `. Не делай выводов «по всей организации» на этой выборке.`
  );
}

/**
 * Largest N such that JSON.stringify(items.slice(0, N)) fits into `budget`.
 * Binary search — arrays here can be thousands of records.
 */
function fitCount(items: unknown[], budget: number): number {
  if (items.length === 0) return 0;
  if (byteLength(JSON.stringify(items)) <= budget) return items.length;

  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (byteLength(JSON.stringify(items.slice(0, mid))) <= budget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** Truncate free-form text on a line boundary, with a trailing note. */
function capText(raw: string, maxBytes: number): string {
  const totalBytes = byteLength(raw);
  const note = (shownBytes: number) =>
    `\n\n[…усечено: показано ${shownBytes} из ${totalBytes} байт. ` +
    `Данные неполные — уточните запрос, чтобы получить нужную часть.]`;

  const budget = Math.max(1000, maxBytes - byteLength(note(totalBytes)));

  // Cut by characters first (bytes >= chars), then trim to a line boundary.
  let cut = raw.slice(0, budget);
  while (byteLength(cut) > budget) {
    cut = cut.slice(0, Math.floor(cut.length * 0.9));
  }
  const lastNewline = cut.lastIndexOf("\n");
  if (lastNewline > budget * 0.5) cut = cut.slice(0, lastNewline);

  return cut + note(byteLength(cut));
}

/**
 * Cap a tool result to `maxBytes`, preserving valid JSON and telling the model
 * what it is missing. Returns the input untouched when it already fits.
 */
export function capToolResult(
  raw: string,
  maxBytes: number = DEFAULT_TOOL_RESULT_MAX_BYTES
): string {
  if (!raw) return raw;
  const limit = Math.max(4000, maxBytes);
  if (byteLength(raw) <= limit) return raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return capText(raw, limit);
  }

  // --- Top-level array: return a first page ---
  if (Array.isArray(parsed)) {
    const total = parsed.length;
    // Reserve room for the envelope (hint text, counters, JSON syntax).
    const envelope = 1200;
    const shown = fitCount(parsed, Math.max(1000, limit - envelope));
    return JSON.stringify({
      _truncated: true,
      shown,
      total,
      nextOffset: shown,
      _hint: hintFor(shown, total),
      items: parsed.slice(0, shown),
    });
  }

  // --- Object: keep scalars/aggregates, page the heavy arrays ---
  if (parsed && typeof parsed === "object") {
    const src = parsed as Record<string, unknown>;
    const scalars: Record<string, unknown> = {};
    const arrays: Array<[string, unknown[]]> = [];

    for (const [key, value] of Object.entries(src)) {
      if (Array.isArray(value)) arrays.push([key, value]);
      else scalars[key] = value;
    }

    if (arrays.length === 0) {
      // No arrays to trim (one huge string field, deep nesting…) — fall back
      // to text truncation of the serialized object.
      return capText(raw, limit);
    }

    // Heaviest arrays first, so the biggest offender gets trimmed hardest.
    arrays.sort(
      (a, b) =>
        byteLength(JSON.stringify(b[1])) - byteLength(JSON.stringify(a[1]))
    );

    const truncatedKeys: string[] = [];
    const out: Record<string, unknown> = { ...scalars };
    const envelope = 1500;
    let budget = Math.max(1000, limit - envelope - byteLength(JSON.stringify(scalars)));

    // Split the remaining budget across arrays, largest first.
    for (let i = 0; i < arrays.length; i++) {
      const [key, items] = arrays[i];
      const share = Math.max(500, Math.floor(budget / (arrays.length - i)));
      const shown = fitCount(items, share);
      out[key] = items.slice(0, shown);
      if (shown < items.length) {
        truncatedKeys.push(`${key}: ${shown} из ${items.length}`);
      }
      budget -= byteLength(JSON.stringify(items.slice(0, shown)));
      if (budget < 500) budget = 500;
    }

    if (truncatedKeys.length === 0) return raw;

    out._truncated = true;
    out._truncatedFields = truncatedKeys;
    out._hint =
      `Списки урезаны (${truncatedKeys.join("; ")}). Данные НЕПОЛНЫЕ. ` +
      `Запросите продолжение через offset у соответствующего инструмента ` +
      `или сузьте выборку фильтрами. Не делай выводов «по всей организации» на этой выборке.`;

    return JSON.stringify(out);
  }

  // Scalar JSON (string/number) that somehow exceeds the limit.
  return capText(raw, limit);
}
