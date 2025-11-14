const { applyUpsert } = require("../src/uploaders/upsert");

describe("applyUpsert", () => {
  test("appends new rows when sheet is empty", () => {
    const result = applyUpsert([], ["ID", "Value"], [["1", "A"]], ["ID"]);
    expect(result).toEqual([
      ["ID", "Value"],
      ["1", "A"],
    ]);
  });

  test("updates matching keys and appends new ones", () => {
    const existing = [
      ["ID", "Value"],
      ["1", "Old"],
    ];
    const rows = [
      ["1", "Updated"],
      ["2", "New"],
    ];
    const result = applyUpsert(existing, ["ID", "Value"], rows, ["ID"]);
    expect(result).toEqual([
      ["ID", "Value"],
      ["1", "Updated"],
      ["2", "New"],
    ]);
  });
});
