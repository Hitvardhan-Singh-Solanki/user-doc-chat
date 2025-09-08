
// Tests for LowContentSchema
// Testing library/framework note:
// - These tests are written to work with Jest or Vitest (both support describe/it/expect).
// - If using Vitest, no changes are needed; if using Jest, ensure ts-jest or Babel is configured.

describe("LowContentSchema", () => {
  it("parses a valid array of strings (happy path)", () => {
    const input = ["alpha", "beta", "gamma"];
    const result = LowContentSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("returns [] by default when input is undefined", () => {
    const result = LowContentSchema.parse(undefined as any);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it("accepts an empty array explicitly", () => {
    const result = LowContentSchema.parse([]);
    expect(result).toEqual([]);
  });

  it("allows strings with whitespace and preserves them", () => {
    const input = ["  leading", "trailing  ", "  both  ", "\t tabs \t", "\n newlines \n"];
    const result = LowContentSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("fails when array contains non-string values", () => {
    const badInputs: any[] = [
      [1, 2, 3],
      ["ok", 2],
      [{ a: 1 }],
      [null],
      [undefined],
      [Symbol("x")],
    ];
    for (const bi of badInputs) {
      const parsed = LowContentSchema.safeParse(bi);
      expect(parsed.success).toBe(false);
    }
  });

  it("fails when input is not an array", () => {
    const notArrays: any[] = [null, 42, "string", {}, true, () => {}];
    for (const value of notArrays) {
      const parsed = LowContentSchema.safeParse(value);
      expect(parsed.success).toBe(false);
    }
  });

  it("does not coerce numbers to strings", () => {
    const parsed = LowContentSchema.safeParse([123 as any]);
    expect(parsed.success).toBe(false);
  });

  it("handles large arrays of strings", () => {
    const input = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
    const result = LowContentSchema.parse(input);
    expect(result.length).toBe(1000);
    expect(result[0]).toBe("item-0");
    expect(result[999]).toBe("item-999");
  });

  it("produces a default array that can be used independently", () => {
    // Verify defaulting behavior yields an array instance that can be read and written without throwing.
    const result = LowContentSchema.parse(undefined as any);
    result.push("x");
    expect(result).toContain("x");
    // Note: We do not assert identity across parses to avoid locking in internal library behavior.
  });
});