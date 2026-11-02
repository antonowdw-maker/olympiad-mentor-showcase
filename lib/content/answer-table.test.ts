import { describe, expect, it } from "vitest";
import {
  TABLE_INCOMPLETE_ERROR,
  findTableAnswerShapeIssue,
  isTableAnswerComplete,
  normalizeTableAnswer,
  optionsColumnJson,
  parseAnswerTableJson,
  parseTableAnswer,
  serializeTableAnswer,
} from "./answer-table";
import { isAnswerCorrect } from "@/lib/trainer/answer";
import { taskPublicSchema, type AnswerTable, type TaskSeed, type TopicSeed } from "./schemas";
import { validateTopicContent } from "./validate";

/** Таблица 3×2: нейтральный порядок значений (не совпадает с эталоном). */
const TABLE: AnswerTable = {
  rowHeader: "Ребёнок",
  rows: ["Аня", "Боря", "Вика"],
  columns: [
    { title: "Возраст", values: ["7", "8", "9"] },
    { title: "Питомец", values: ["кот", "пёс", "ёж"] },
  ],
};
/** Эталон: Аня 9 ёж; Боря 7 кот; Вика 8 пёс. */
const ANSWER = "9, ёж; 7, кот; 8, пёс";

describe("serialize / parse табличного ответа", () => {
  it("сериализует ячейки в «a, b; c, d» и обратно", () => {
    const cells = [
      ["9", "ёж"],
      ["7", "кот"],
      ["8", "пёс"],
    ];
    expect(serializeTableAnswer(cells)).toBe(ANSWER);
    expect(parseTableAnswer(ANSWER)).toEqual(cells);
  });

  it("пустая строка — пустая таблица", () => {
    expect(parseTableAnswer("   ")).toEqual([]);
  });

  it("нормализация игнорирует регистр, лишние пробелы и ё/е", () => {
    expect(normalizeTableAnswer(" 9 ,ЕЖ ;7,Кот;  8, пес ")).toBe(normalizeTableAnswer(ANSWER));
  });
});

describe("полнота табличного ответа", () => {
  it("полная таблица из значений столбцов — complete", () => {
    expect(isTableAnswerComplete(ANSWER, TABLE)).toBe(true);
  });

  it("пустая ячейка — не complete (kind empty)", () => {
    expect(findTableAnswerShapeIssue("9, ; 7, кот; 8, пёс", TABLE)).toEqual({
      kind: "empty",
      row: 0,
      column: 1,
    });
  });

  it("не хватает строки / ячейки — не complete", () => {
    expect(findTableAnswerShapeIssue("9, ёж; 7, кот", TABLE)?.kind).toBe("rows");
    expect(findTableAnswerShapeIssue("9; 7, кот; 8, пёс", TABLE)?.kind).toBe("cells");
  });

  it("значение не из столбца — не complete (kind value)", () => {
    expect(findTableAnswerShapeIssue("9, ёж; 7, кот; 8, хомяк", TABLE)).toMatchObject({
      kind: "value",
      value: "хомяк",
    });
  });

  it("сообщение для ученика про неполную таблицу", () => {
    expect(TABLE_INCOMPLETE_ERROR).toBe("Заполни все ячейки таблицы");
  });
});

describe("проверка табличного ответа (isAnswerCorrect)", () => {
  it("верная таблица с другим регистром и пробелами — верно", () => {
    expect(isAnswerCorrect("9,ЁЖ;7 , кот;8,Пёс", [ANSWER], "table")).toBe(true);
  });

  it("одна неверная ячейка — неверно целиком", () => {
    expect(isAnswerCorrect("9, ёж; 8, кот; 7, пёс", [ANSWER], "table")).toBe(false);
  });
});

describe("хранение таблицы в колонке options", () => {
  it("table → JSON таблицы; choice → JSON options; иначе null", () => {
    expect(parseAnswerTableJson(optionsColumnJson({ table: TABLE }))).toEqual(TABLE);
    expect(optionsColumnJson({ options: ["а", "б"] })).toBe('["а","б"]');
    expect(optionsColumnJson({})).toBeNull();
  });

  it("битый / нетабличный JSON → null", () => {
    expect(parseAnswerTableJson(null)).toBeNull();
    expect(parseAnswerTableJson("{oops")).toBeNull();
    expect(parseAnswerTableJson('["а","б"]')).toBeNull();
  });

  it("публичный DTO принимает таблицу и не содержит эталон", () => {
    const dto = taskPublicSchema.parse({
      slug: "t",
      title: "T",
      statement: "S",
      answerType: "table",
      table: TABLE,
      acceptedAnswers: [ANSWER],
      difficulty: "6",
      grade: "mid",
      order: 1,
      relatedDocs: [],
      hintSteps: [],
      hintStepsTotal: 3,
      hintsOpenedCount: 0,
      hasMoreHints: true,
      hasSimilarHelp: false,
      articlePreviews: [],
    });
    expect(dto.table).toEqual(TABLE);
    expect(JSON.stringify(dto)).not.toContain("ёж; 7");
  });
});

const HINTS = [
  { text: "Составь таблицу", docSlug: "doc-1" },
  { text: "Отметь крестиками невозможное", docSlug: "doc-1" },
  { text: "Иди от самого жёсткого условия", docSlug: "doc-1" },
];

function topicWith(patch: Partial<TaskSeed>): TopicSeed {
  const base: TaskSeed = {
    slug: "task-table",
    title: "Таблица",
    statement: "Кто сколько лет и чей питомец?",
    acceptedAnswers: [ANSWER],
    answerType: "table",
    table: TABLE,
    difficulty: "6",
    grade: "mid",
    order: 1,
    relatedDocSlugs: ["doc-1"],
    hintSteps: HINTS,
    sourceHint: "original · test",
  };
  return {
    slug: "t-table",
    title: "Тест",
    description: "Описание",
    order: 1,
    classLevels: ["6"],
    articles: [{ slug: "doc-1", title: "Статья", body: "Текст", order: 1 }],
    tasks: [{ ...base, ...patch }],
  };
}

function codes(topic: TopicSeed): string[] {
  return validateTopicContent(topic, { minTasks: 1 }).issues.map((i) => i.code);
}

describe("валидатор: табличные задачи", () => {
  it("корректная табличная задача проходит", () => {
    const res = validateTopicContent(topicWith({}), { minTasks: 1 });
    expect(res.issues.filter((i) => i.severity !== "warn")).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("TABLE_REQUIRED — answerType table без table", () => {
    expect(codes(topicWith({ table: undefined }))).toContain("TABLE_REQUIRED");
  });

  it("TABLE_FORBIDDEN — table у нетабличной задачи", () => {
    expect(codes(topicWith({ answerType: "text", acceptedAnswers: ["кот"] }))).toContain(
      "TABLE_FORBIDDEN",
    );
  });

  it("TABLE_OPTIONS_FORBIDDEN — options у табличной задачи", () => {
    expect(codes(topicWith({ options: ["а", "б"] }))).toContain("TABLE_OPTIONS_FORBIDDEN");
  });

  it("TABLE_ANSWER_VALUE — эталон со значением не из столбца", () => {
    expect(codes(topicWith({ acceptedAnswers: ["9, ёж; 7, кот; 8, хомяк"] }))).toContain(
      "TABLE_ANSWER_VALUE",
    );
  });

  it("TABLE_ANSWER_SHAPE — эталон не той формы", () => {
    expect(codes(topicWith({ acceptedAnswers: ["9, ёж; 7, кот"] }))).toContain(
      "TABLE_ANSWER_SHAPE",
    );
  });

  it("TABLE_VALUE_SEPARATOR — запятая внутри значения", () => {
    const table = {
      ...TABLE,
      columns: [TABLE.columns[0]!, { title: "Питомец", values: ["кот, рыжий", "пёс", "ёж"] }],
    };
    expect(codes(topicWith({ table }))).toContain("TABLE_VALUE_SEPARATOR");
  });

  it("TABLE_VALUES_DUP — дубли значений в столбце", () => {
    const table = {
      ...TABLE,
      columns: [{ title: "Возраст", values: ["7", "8", "8", "9"] }, TABLE.columns[1]!],
    };
    expect(codes(topicWith({ table }))).toContain("TABLE_VALUES_DUP");
  });

  it("TABLE_OPTIONS_SPOIL — порядок значений столбца совпадает с эталоном", () => {
    const table = {
      ...TABLE,
      columns: [{ title: "Возраст", values: ["9", "7", "8"] }, TABLE.columns[1]!],
    };
    expect(codes(topicWith({ table }))).toContain("TABLE_OPTIONS_SPOIL");
  });

  it("INSTANCE_TABLE_* — вариант со своей таблицей проверяется отдельно", () => {
    const own: AnswerTable = {
      rowHeader: "Ученик",
      rows: ["Гоша", "Дина", "Женя"],
      columns: [{ title: "Класс", values: ["5", "6", "7"] }],
    };
    const res = codes(
      topicWith({
        instances: [
          { slug: "i0", order: 0, statement: "С", acceptedAnswers: [ANSWER], hintSteps: HINTS },
          { slug: "i1", order: 1, statement: "С1", acceptedAnswers: ["6; 7; 5"], table: own, hintSteps: HINTS },
          { slug: "i2", order: 2, statement: "С2", acceptedAnswers: ["5; 6; 7"], table: own, hintSteps: HINTS },
        ],
      }),
    );
    expect(res).toContain("INSTANCE_TABLE_OPTIONS_SPOIL");
    expect(res.filter((c) => c.startsWith("INSTANCE_TABLE_"))).toEqual([
      "INSTANCE_TABLE_OPTIONS_SPOIL",
    ]);
  });
});
