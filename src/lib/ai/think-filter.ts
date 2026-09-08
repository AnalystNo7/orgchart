/**
 * Стрим-фильтр размышлений модели.
 *
 * DeepSeek-совместимые шлюзы (и часть reasoning-моделей через OpenAI-совместимый
 * API) кладут рассуждения прямо в текст между `<think>…</think>`. Фильтр
 * режет поток дельт на две ленты: `text` — ответ пользователю, `reasoning` —
 * ход рассуждений. Ни одна из лент не содержит самих тегов.
 *
 * Тег может прийти разрезанным границей дельт («<thi» + «nk>»), поэтому
 * фильтр удерживает хвост, который всё ещё может оказаться началом тега,
 * и отдаёт его только когда становится ясно, что это обычный текст.
 * Удерживается не больше длины самого длинного тега (`</thinking>`), и
 * только пока хвост посимвольно совпадает с началом тега — `<b>` в ответе
 * задержится на один шаг и выйдет как есть. flush() отдаёт остаток.
 *
 * Незакрытый блок на flush целиком уходит в reasoning: показывать обрывок
 * рассуждений как ответ хуже, чем не показывать его вовсе.
 *
 * По образцу createToolNameFilter (tool-labels.ts): чистая функция без
 * состояния снаружи — проверяется скриптом без LLM.
 */

export interface ThinkFilterOutput {
  text: string;
  reasoning: string;
}

const OPEN_TAG = /<think(?:ing)?>/i;
const CLOSE_TAG = /<\/think(?:ing)?>/i;
const OPEN_LONGEST = "<thinking>";
const CLOSE_LONGEST = "</thinking>";

/** Хвост после последнего `<`, если он ещё может дорасти до тега `full`. */
function heldPrefix(buf: string, full: string): string {
  const lt = buf.lastIndexOf("<");
  if (lt === -1) return "";
  const candidate = buf.slice(lt);
  if (candidate.length >= full.length) return "";
  return full.startsWith(candidate.toLowerCase()) ? candidate : "";
}

export function createThinkFilter(): {
  push: (delta: string) => ThinkFilterOutput;
  flush: () => ThinkFilterOutput;
} {
  let inside = false;
  let tail = "";
  // После `</think>` модель почти всегда ставит пустую строку перед ответом —
  // в тексте ответа (и в базе) ей не место.
  let trimLeading = false;

  const emitText = (chunk: string, out: ThinkFilterOutput) => {
    if (trimLeading) {
      chunk = chunk.replace(/^\s+/, "");
      if (chunk) trimLeading = false;
    }
    out.text += chunk;
  };

  return {
    push(delta: string): ThinkFilterOutput {
      const out: ThinkFilterOutput = { text: "", reasoning: "" };
      let buf = tail + delta;
      tail = "";

      for (;;) {
        if (!inside) {
          const m = OPEN_TAG.exec(buf);
          if (m) {
            emitText(buf.slice(0, m.index), out);
            buf = buf.slice(m.index + m[0].length);
            inside = true;
            continue;
          }
          const held = heldPrefix(buf, OPEN_LONGEST);
          emitText(held ? buf.slice(0, -held.length) : buf, out);
          tail = held;
          return out;
        }

        const m = CLOSE_TAG.exec(buf);
        if (m) {
          out.reasoning += buf.slice(0, m.index);
          buf = buf.slice(m.index + m[0].length);
          inside = false;
          trimLeading = true;
          continue;
        }
        const held = heldPrefix(buf, CLOSE_LONGEST);
        out.reasoning += held ? buf.slice(0, -held.length) : buf;
        tail = held;
        return out;
      }
    },

    flush(): ThinkFilterOutput {
      const out: ThinkFilterOutput = { text: "", reasoning: "" };
      if (inside) out.reasoning = tail;
      else emitText(tail, out);
      tail = "";
      inside = false;
      return out;
    },
  };
}

/**
 * Защитный разбор для бесед, сохранённых до появления фильтра: закрытые
 * блоки `<think>…</think>` внутри уже готового текста выносятся в reasoning.
 * Используется на клиенте при отрисовке — базу не мигрируем.
 */
export function splitLegacyThink(content: string): ThinkFilterOutput {
  const re = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
  if (!re.test(content)) return { text: content, reasoning: "" };
  re.lastIndex = 0;
  const parts: string[] = [];
  const text = content.replace(re, (_m, inner: string) => {
    parts.push(inner.trim());
    return "";
  });
  return { text: text.replace(/^\s+/, ""), reasoning: parts.join("\n\n") };
}
