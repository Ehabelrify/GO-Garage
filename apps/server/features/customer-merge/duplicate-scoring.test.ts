import { describe, expect, it } from "vitest";
import { findDuplicatePairs, nameSimilarity, normalizeName, phoneRelation, scorePair, suggestSurvivor, type DuplicateCandidate } from "./duplicate-scoring";

const c = (id: string, extra: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  id, name: `Customer ${id}`, phone: "", phoneNormalized: "", createdAt: "2026-01-01T00:00:00.000Z", branchIds: ["b1"], vehicles: [], bookings: 0, ...extra,
});

describe("name normalisation", () => {
  it("folds Arabic letter variants and the article", () => {
    const withHamza = "أحمد محمود";
    const plain = "احمد محمود";
    expect(normalizeName(withHamza)).toBe(normalizeName(plain));
    expect(nameSimilarity(withHamza, plain).similarity).toBe(1);
    expect(nameSimilarity("Ahmed Mahmoud El-Shazly", "Ahmed Mahmoud Shazly").similarity).toBe(1);
  });
  it("tolerates one typo in a long token only", () => {
    expect(nameSimilarity("Mohamed Hassan", "Mohammed Hassan").matched).toBe(2);
    expect(nameSimilarity("Ali Omar", "Ala Omar").matched).toBe(1);
  });
});

describe("scoring", () => {
  it("scores the same phone written two ways as high confidence", () => {
    expect(phoneRelation("+20 100 123 4567", "0020 100 123 4567")).toBe("suffix");
    expect(phoneRelation("1001234567", "1001234567")).toBe("exact");
    const pair = scorePair(c("a", { phone: "+201001234567", phoneNormalized: "201001234567" }), c("b", { phone: "01001234567", phoneNormalized: "01001234567" }));
    expect(pair?.score).toBeGreaterThanOrEqual(0.85);
    expect(pair?.reasons[0]).toMatchObject({ kind: "phone" });
  });
  it("flags the same plate on different customers", () => {
    const pair = scorePair(c("a", { vehicles: [{ key: "ABC1234", plate: "abc 1234" }] }), c("b", { vehicles: [{ key: "ABC1234", plate: "ABC-1234" }] }));
    expect(pair?.reasons).toEqual([{ kind: "plate", detail: "abc 1234" }]);
    expect(pair?.score).toBe(0.7);
  });
  it("needs two name tokens and a shared branch for a name-only match", () => {
    expect(scorePair(c("a", { name: "Sara Ali" }), c("b", { name: "Sara Ali" }))?.reasons[0]).toMatchObject({ kind: "name" });
    expect(scorePair(c("a", { name: "Sara Ali", branchIds: ["b1"] }), c("b", { name: "Sara Ali", branchIds: ["b2"] }))).toBeNull();
    expect(scorePair(c("a", { name: "Sara" }), c("b", { name: "Sara" }))).toBeNull();
  });
  it("finds pairs through blocking and sorts by score", () => {
    const list = [
      c("a", { name: "Omar Nabil", phone: "01001234567", phoneNormalized: "01001234567", vehicles: [{ key: "XYZ1", plate: "XYZ 1" }] }),
      c("b", { name: "Omar Nabil", phone: "+201001234567", phoneNormalized: "201001234567", vehicles: [{ key: "XYZ1", plate: "XYZ1" }] }),
      c("d", { name: "Laila Samir" }), c("e", { name: "Karim Adel" }),
      c("f", { name: "Dina Hany", vehicles: [{ key: "Q9", plate: "Q9" }] }), c("g", { name: "Other Person", vehicles: [{ key: "Q9", plate: "Q 9" }] }),
    ];
    const pairs = findDuplicatePairs(list);
    expect(pairs.map((p) => p.key)).toEqual(["a:b", "f:g"]);
    expect(pairs[0].band).toBe("high");
    expect(pairs[1].band).toBe("medium");
  });
  it("suggests the record with more history, then the older", () => {
    expect(suggestSurvivor(c("a", { bookings: 1 }), c("b", { bookings: 4 }))).toBe("b");
    expect(suggestSurvivor(c("a", { createdAt: "2026-02-01" }), c("b", { createdAt: "2026-01-01" }))).toBe("b");
  });
});
