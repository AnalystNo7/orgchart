// scripts/generate-business-slides.mjs
// One-shot script: generates 2 business-concept slides as .pptx
// Run: node scripts/generate-business-slides.mjs
//
// Requires: npm i -D pptxgenjs

import PptxGenJS from "pptxgenjs";

// ── Brand constants (extracted from corporate PDF) ──────────────────────
const C = {
  navy:       "0D3B66",
  navyDark:   "003365",
  navyMid:    "1B3A5C",
  blue:       "0078C1",
  cyan:       "2FB4E9",
  lightCyan:  "76C8F7",
  paleCyan:   "C1D4E6",
  teal:       "79C7C5",
  orange:     "FF9A00",
  grey:       "B8BDC0",
  white:      "FFFFFF",
  nearBlack:  "1A1A1A",
  lightGrey:  "F5F6F7",
  tableHeader:"E8EEF4",
};
const FONT_TITLE = "Calibri";
const FONT_BODY  = "Arial Narrow";

// ── Helpers ─────────────────────────────────────────────────────────────
function addBrandHeader(slide, title, subtitle) {
  // Navy bar at top
  slide.addShape("rect", {
    x: 0, y: 0, w: "100%", h: 0.08,
    fill: { color: C.navy },
  });
  // Orange accent line
  slide.addShape("rect", {
    x: 0, y: 0.08, w: "100%", h: 0.04,
    fill: { color: C.orange },
  });
  // Title
  slide.addText(title, {
    x: 0.5, y: 0.3, w: 12.3, h: 0.55,
    fontFace: FONT_TITLE, fontSize: 22, bold: true,
    color: C.navy,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 0.85, w: 12.3, h: 0.35,
      fontFace: FONT_BODY, fontSize: 13, color: "666666",
    });
  }
}

// ── Main ────────────────────────────────────────────────────────────────
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 inches (16:9)
pptx.author = "OrgChart Digital Twin";
pptx.title  = "Бизнес-концепция цифрового двойника организации";

// =====================================================================
// SLIDE 1 — «Почему цифровой двойник»
// =====================================================================
const s1 = pptx.addSlide();
s1.background = { fill: C.white };

addBrandHeader(
  s1,
  "Почему цифровой двойник: от интуиции — к управлению на данных",
  "Системные проблемы, которые делают управление организацией дорогим и медленным"
);

// Table: Problem → Consequence → Solution (4 rows)
const tableRows = [
  // Header row
  [
    { text: "ПРОБЛЕМА", options: { bold: true, color: C.white, fill: { color: C.grey } } },
    { text: "ПОСЛЕДСТВИЕ", options: { bold: true, color: C.white, fill: { color: C.blue } } },
    { text: "РЕШЕНИЕ (ДВОЙНИК)", options: { bold: true, color: C.white, fill: { color: C.navy } } },
  ],
  // Row 1
  [
    { text: "Нет единой классификации подразделений по роли в создании стоимости" },
    { text: "Решения о сокращениях и инвестициях принимаются вслепую: неясно, кто реально приносит деньги" },
    { text: "Авто-категоризация по ШЕТИЛ: карта «кто зарабатывает, кто — центр затрат»" },
  ],
  // Row 2
  [
    { text: "Дисбаланс структуры ПП / ОПП / АУП (производство / обеспечение / администрация)" },
    { text: "Раздутый управленческий overhead съедает маржу; платим за администрирование, а не за результат" },
    { text: "Метрики overhead, span of control, бенчмарки — видно, где штат избыточен" },
  ],
  // Row 3
  [
    { text: "P&L не виден на уровне подразделений; непрозрачное распределение прибыли" },
    { text: "Убыточные центры маскируются в общем результате; ресурсные блоки выглядят «вечно убыточными»" },
    { text: "P&L каждого подразделения в 3 режимах аллокации — настоящая экономика центра" },
  ],
  // Row 4
  [
    { text: "Реорганизация — «чёрный ящик»: эффект нельзя просчитать до внедрения" },
    { text: "Изменения идут месяцами по интуиции; ошибки стоят дорого и необратимы" },
    { text: "Сценарное моделирование as-is / to-be, what-if — эффект в ₽ виден до приказа" },
  ],
];

const tableOpts = {
  x: 0.5, y: 1.35, w: 12.3,
  fontFace: FONT_BODY,
  fontSize: 10.5,
  color: C.nearBlack,
  border: { type: "solid", pt: 0.5, color: C.paleCyan },
  rowH: [0.35, 0.7, 0.7, 0.7, 0.7],
  colW: [4.1, 4.1, 4.1],
  autoPage: false,
  align: "left",
  valign: "top",
  margin: [4, 6, 4, 6],
};

s1.addTable(tableRows, tableOpts);

// Value-strip (orange bar at bottom)
const stripY = 5.4;
s1.addShape("rect", {
  x: 0.5, y: stripY, w: 12.3, h: 0.75,
  fill: { color: C.orange },
  rectRadius: 0.08,
});
s1.addText(
  [
    { text: "Разрозненные данные (1С, Excel, штатки, договоры) → ", options: { bold: false } },
    { text: "единый цифровой двойник организации. ", options: { bold: true } },
    { text: "Анализ, занимавший недели, — за минуты. Решения обоснованы цифрами, а не интуицией.", options: { bold: false } },
  ],
  {
    x: 0.7, y: stripY + 0.05, w: 11.9, h: 0.65,
    fontFace: FONT_BODY, fontSize: 12, color: C.white,
    valign: "middle",
  }
);

// Small brand line at very bottom
s1.addShape("rect", {
  x: 0, y: 7.42, w: "100%", h: 0.08,
  fill: { color: C.navy },
});

// =====================================================================
// SLIDE 2 — «Кейсы по слоям»
// =====================================================================
const s2 = pptx.addSlide();
s2.background = { fill: C.white };

addBrandHeader(
  s2,
  "Что система решает уже сейчас: примеры кейсов по слоям",
  null
);

// ── Flagship card: ОРГДИЗАЙН ────────────────────────────────────────
const flagX = 0.5, flagY = 1.0, flagW = 12.3, flagH = 2.5;

// Card background
s2.addShape("rect", {
  x: flagX, y: flagY, w: flagW, h: flagH,
  fill: { color: C.lightGrey },
  line: { color: C.navy, width: 1.5 },
  rectRadius: 0.08,
});

// Card header bar
s2.addShape("rect", {
  x: flagX, y: flagY, w: flagW, h: 0.4,
  fill: { color: C.navy },
  rectRadius: 0.08,
});
// Cover bottom corners of header (rectRadius applies to all corners)
s2.addShape("rect", {
  x: flagX, y: flagY + 0.25, w: flagW, h: 0.15,
  fill: { color: C.navy },
});

s2.addText("🏗  ОРГДИЗАЙН", {
  x: flagX + 0.15, y: flagY + 0.02, w: flagW - 0.3, h: 0.38,
  fontFace: FONT_TITLE, fontSize: 14, bold: true, color: C.white,
  valign: "middle",
});

// Flagship content
const fBody = [
  { label: "Кейс:", value: "Оптимизация структуры as-is → to-be — снизить overhead и ускорить принятие решений" },
  { label: "Система:", value: "Моделирует целевую структуру to-be; находит лишние уровни иерархии, низкий span of control, дисбаланс ПП/ОПП/АУП; сравнивает сценарии as-is / to-be бок о бок" },
  { label: "Результат:", value: "Рекомендуемая to-be структура + оценка эффекта (экономия ФОТ, сокращение уровней управления, рост доли производственного штата)" },
];

let fyOff = flagY + 0.55;
for (const item of fBody) {
  s2.addText(
    [
      { text: item.label + " ", options: { bold: true, color: C.navy } },
      { text: item.value, options: { bold: false, color: C.nearBlack } },
    ],
    {
      x: flagX + 0.2, y: fyOff, w: flagW - 0.4, h: 0.55,
      fontFace: FONT_BODY, fontSize: 11, valign: "top",
    }
  );
  fyOff += 0.6;
}

// ── Three smaller cards row ─────────────────────────────────────────
const cards = [
  {
    icon: "💰", title: "ФИНАНСЫ",
    kase: "Вскрытие убыточных подразделений",
    system: "P&L по каждому подразделению в 3 режимах аллокации; трансфертные цены вскрывают реальный вклад ресурсных центров; находит причину убытка",
    result: "Загрузка / пересмотр тарифа / объединение / вывод на аутсорс",
    accent: C.teal,
  },
  {
    icon: "📁", title: "ПРОЕКТЫ",
    kase: "Балансировка загрузки на проекты и договоры",
    system: "Связывает людей с договорами (FTE по периодам), видит перегруз и простой, дефицит ресурсов под контракты",
    result: "Карта загрузки — где не хватает людей, кого переключить, кто на «скамейке»",
    accent: C.blue,
  },
  {
    icon: "👥", title: "КОМПЕТЕНЦИИ / HR",
    kase: "Критичные компетенции и риск ключевых людей",
    system: "Матрица компетенций, skill gap по подразделениям, succession-риски (ключевые люди без замены)",
    result: "Карта дефицитов + план закрытия (найм / обучение / ротация)",
    accent: C.cyan,
  },
];

const cardY = 3.7;
const cardW = 3.9;
const cardH = 3.3;
const cardGap = 0.25;

cards.forEach((card, i) => {
  const cx = 0.5 + i * (cardW + cardGap);

  // Card bg
  s2.addShape("rect", {
    x: cx, y: cardY, w: cardW, h: cardH,
    fill: { color: C.lightGrey },
    line: { color: card.accent, width: 1 },
    rectRadius: 0.06,
  });

  // Header bar
  s2.addShape("rect", {
    x: cx, y: cardY, w: cardW, h: 0.35,
    fill: { color: card.accent },
    rectRadius: 0.06,
  });
  s2.addShape("rect", {
    x: cx, y: cardY + 0.2, w: cardW, h: 0.15,
    fill: { color: card.accent },
  });

  s2.addText(`${card.icon}  ${card.title}`, {
    x: cx + 0.1, y: cardY + 0.01, w: cardW - 0.2, h: 0.33,
    fontFace: FONT_TITLE, fontSize: 11, bold: true, color: C.white,
    valign: "middle",
  });

  // Body
  const bodyItems = [
    { label: "Кейс:", value: card.kase },
    { label: "Система:", value: card.system },
    { label: "Результат:", value: card.result },
  ];

  let byOff = cardY + 0.45;
  for (const item of bodyItems) {
    s2.addText(
      [
        { text: item.label + " ", options: { bold: true, color: C.navy } },
        { text: item.value, options: { bold: false, color: C.nearBlack } },
      ],
      {
        x: cx + 0.1, y: byOff, w: cardW - 0.2, h: 0.85,
        fontFace: FONT_BODY, fontSize: 9.5, valign: "top",
      }
    );
    byOff += 0.9;
  }
});

// Bottom brand line
s2.addShape("rect", {
  x: 0, y: 7.42, w: "100%", h: 0.08,
  fill: { color: C.navy },
});

// ── Write file ──────────────────────────────────────────────────────
const outPath = "docs/business-concept-slides.pptx";
await pptx.writeFile({ fileName: outPath });
console.log(`✓ Generated: ${outPath}`);
