/*
 * Юнит-проверка очереди src/lib/ai/run-queue.ts без БД и провайдера:
 * позиции, отмена по AbortSignal, таймаут, отсутствие утечки слота.
 * Запуск: npx tsx scripts/ai-retry-check/queue-unit.ts
 */
import { acquireRunSlot, getRunQueueSnapshot, QueueTimeoutError } from "@/lib/ai/run-queue";
let failed = 0;
const check = (n: string, c: boolean, i = "") => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${i ? "  (" + i + ")" : ""}`); if (!c) failed++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("### очередь max=1: A держит, B и C ждут, B отменяется, C получает слот после A");
  const a = await acquireRunSlot({ max: 1, timeoutMs: 5000 });
  const posB: string[] = []; const posC: string[] = [];
  const ac = new AbortController();
  const pB = acquireRunSlot({ max: 1, timeoutMs: 5000, signal: ac.signal, onWait: (p, ah) => posB.push(`${p}/${ah}`) }).then(() => "got", (e: Error) => e.message);
  const pC = acquireRunSlot({ max: 1, timeoutMs: 5000, onWait: (p, ah) => posC.push(`${p}/${ah}`) });
  await sleep(50);
  check("B: позиция 1, впереди 1", posB[0] === "1/1", posB.join(","));
  check("C: позиция 2, впереди 2", posC[0] === "2/2", posC.join(","));
  check("снимок: active=1, waiting=2", JSON.stringify(getRunQueueSnapshot()) === '{"active":1,"waiting":2}', JSON.stringify(getRunQueueSnapshot()));
  ac.abort();
  const bRes = await pB;
  await sleep(20);
  check("B отменён с понятным текстом", bRes.includes("отменён"), bRes);
  check("C сдвинулся на позицию 1", posC[posC.length - 1] === "1/1", posC.join(","));
  a.release(); a.release(); // идемпотентно
  const c = await pC;
  check("C получил слот после release A, waitedMs > 0", c.waitedMs > 0, `${c.waitedMs} мс`);
  check("снимок: active=1, waiting=0", JSON.stringify(getRunQueueSnapshot()) === '{"active":1,"waiting":0}');
  c.release();
  check("после release C: active=0", getRunQueueSnapshot().active === 0);

  console.log("### таймаут ожидания");
  const h = await acquireRunSlot({ max: 1, timeoutMs: 5000 });
  const t0 = Date.now();
  const err = await acquireRunSlot({ max: 1, timeoutMs: 300 }).then(() => null, (e: unknown) => e);
  check("QueueTimeoutError через ~300 мс", err instanceof QueueTimeoutError && Date.now() - t0 >= 280, String((err as Error)?.message));
  check("ожидающий снят: waiting=0", getRunQueueSnapshot().waiting === 0);
  h.release();
  check("слот свободен", getRunQueueSnapshot().active === 0);

  console.log("### max=2: два сразу, третий ждёт");
  const x = await acquireRunSlot({ max: 2, timeoutMs: 1000 });
  const y = await acquireRunSlot({ max: 2, timeoutMs: 1000 });
  let zWaited = false;
  const pz = acquireRunSlot({ max: 2, timeoutMs: 1000, onWait: () => { zWaited = true; } });
  await sleep(20);
  check("третий ждёт", zWaited && getRunQueueSnapshot().waiting === 1);
  x.release(); const z = await pz; check("третий вошёл после release", z.waitedMs >= 0 && getRunQueueSnapshot().active === 2);
  y.release(); z.release();
  check("всё освобождено", JSON.stringify(getRunQueueSnapshot()) === '{"active":0,"waiting":0}');
  console.log(`=== ${failed === 0 ? "очередь: все проверки пройдены" : failed + " провалено"} ===`);
  process.exit(failed ? 1 : 0);
}
main();
