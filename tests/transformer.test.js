const { transformRecords } = require("../src/transformers/transformer");

describe("transformer", () => {
  test("maps columns and evaluates expressions", () => {
    const transform = {
      columns: [
        { label: "Account", value: "accountName" },
        { label: "Balance", value: "${balance/100}" },
        { label: "Note", value: "=SUM(A1:B1)" },
      ],
    };

    const result = transformRecords(transform, [
      { accountName: "Checking", balance: 12345 },
    ]);

    expect(result.header).toEqual(["Account", "Balance", "Note"]);
    expect(result.rows[0]).toEqual(["Checking", 123.45, "=SUM(A1:B1)"]);
  });
});
