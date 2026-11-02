import { describe, expect, it } from "vitest";
import {
  BADGE_PORTRAIT_IDS,
  lookupBadgeCatalog,
} from "@/lib/progress/badge-catalog";
import { techniqueBadgeCode } from "@/lib/progress/xp";

describe("lookupBadgeCatalog", () => {
  it("milestone debut/steady/deep", () => {
    const debut = lookupBadgeCatalog("debut");
    expect(debut.kind).toBe("milestone");
    expect(debut.scientist).toBe("Архимед");
    expect(debut.portrait).toBe("archimedes");
    expect(debut.fact.length).toBeGreaterThan(20);

    expect(lookupBadgeCatalog("steady").portrait).toBe("euler");
    expect(lookupBadgeCatalog("deep").portrait).toBe("gauss");
  });

  it("technique по slug темы T1…T7", () => {
    const t1 = lookupBadgeCatalog(techniqueBadgeCode("t1-logic"));
    expect(t1.kind).toBe("technique");
    expect(t1.scientist).toBe("Джордж Буль");

    expect(lookupBadgeCatalog(techniqueBadgeCode("t2-parity")).portrait).toBe("noether");
    expect(lookupBadgeCatalog(techniqueBadgeCode("t3-combinatorics")).portrait).toBe(
      "pascal",
    );
    expect(lookupBadgeCatalog(techniqueBadgeCode("t4-divisibility")).portrait).toBe(
      "euclid",
    );
    expect(lookupBadgeCatalog(techniqueBadgeCode("t5-algorithms")).portrait).toBe(
      "khwarizmi",
    );
    expect(lookupBadgeCatalog(techniqueBadgeCode("t6-geometry")).portrait).toBe(
      "pythagoras",
    );
    expect(lookupBadgeCatalog(techniqueBadgeCode("t7-games")).portrait).toBe("nash");
  });

  it("неизвестная technique-тема — fallback kind technique", () => {
    const u = lookupBadgeCatalog(techniqueBadgeCode("t99-future"));
    expect(u.kind).toBe("technique");
    expect(u.portrait).toBe("explorer");
  });

  it("session_reinforced:* → Пойа", () => {
    const r = lookupBadgeCatalog("session_reinforced:pkg-abc");
    expect(r.kind).toBe("reinforce");
    expect(r.scientist).toBe("Дьёрдь Пойа");
    expect(r.title).toBe("Материал закреплён");
  });

  it("неизвестный code → fallback; storedTitle имеет приоритет", () => {
    const u = lookupBadgeCatalog("weird-code", "Особый");
    expect(u.kind).toBe("unknown");
    expect(u.title).toBe("Особый");
    expect(BADGE_PORTRAIT_IDS).toContain(u.portrait as (typeof BADGE_PORTRAIT_IDS)[number]);
  });

  it("storedTitle обогащает milestone без смены учёного", () => {
    const d = lookupBadgeCatalog("debut", "Первый успех");
    expect(d.title).toBe("Первый успех");
    expect(d.scientist).toBe("Архимед");
  });
});
