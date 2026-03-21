const { httpExtractor } = require("../src/extractors/http");

describe("http extractor", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    const testEnvVars = {
      TEST_API_URL: process.env.TEST_API_URL,
      TEST_API_TOKEN: process.env.TEST_API_TOKEN,
    };
    process.env = { ...originalEnv };
    Object.assign(process.env, testEnvVars);
    jest.resetModules();
  });

  test("requires url option", async () => {
    await expect(httpExtractor(null, {})).rejects.toThrow(
      "http extractor requires 'url' option",
    );
  });

  test("fetches JSON array from URL", async () => {
    const data = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];
    const mockResponse = {
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: jest.fn().mockResolvedValue(data),
    };

    jest.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    const result = await httpExtractor(null, {
      url: "https://api.example.com/data",
    });

    expect(result).toEqual([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({ headers: {} }),
    );
  });

  test("extracts nested array using JSONPath", async () => {
    const data = {
      data: {
        users: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      },
    };
    const mockResponse = {
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: jest.fn().mockResolvedValue(data),
    };

    jest.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    const result = await httpExtractor(null, {
      url: "https://api.example.com/data",
      extract: "$.data.users",
    });

    expect(result).toEqual([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
  });

  test("passes custom headers", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: jest.fn().mockResolvedValue([{ name: "Test" }]),
    };

    jest.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    await httpExtractor(null, {
      url: "https://api.example.com/data",
      headers: {
        Authorization: "Bearer secret-token",
        "X-Custom-Header": "custom-value",
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer secret-token",
          "X-Custom-Header": "custom-value",
        },
      }),
    );
  });

  test("resolves env vars in URL and headers", async () => {
    jest.resetModules();
    process.env.TEST_API_URL = "https://api.example.com/env-data";
    process.env.TEST_API_TOKEN = "env-secret-token";

    const { httpExtractor: freshExtractor } = require("../src/extractors/http");

    const mockResponse = {
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: jest.fn().mockResolvedValue([{ data: "from env" }]),
    };

    jest.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    await freshExtractor(null, {
      url: "${env:TEST_API_URL}",
      headers: {
        Authorization: "Bearer ${env:TEST_API_TOKEN}",
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/env-data",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer env-secret-token",
        },
      }),
    );
  });

  test("throws on non-JSON response", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: {
        get: () => "text/html",
      },
      text: jest.fn().mockResolvedValue("<html>Not JSON</html>"),
    };

    jest.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    await expect(
      httpExtractor(null, { url: "https://api.example.com/html" }),
    ).rejects.toThrow("Expected JSON response, got text/html");
  });

  test("throws on HTTP error", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: {
        get: () => "application/json",
      },
      text: jest.fn().mockResolvedValue('{"error": "Invalid token"}'),
    };

    jest.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    await expect(
      httpExtractor(null, { url: "https://api.example.com/protected" }),
    ).rejects.toThrow("HTTP 401 Unauthorized");
  });

  test("wraps single object response in array", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: jest.fn().mockResolvedValue({ count: 42 }),
    };

    jest.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    const result = await httpExtractor(null, {
      url: "https://api.example.com/count",
    });

    expect(result).toEqual([{ count: 42 }]);
  });

  test("wraps single object in array", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: {
        get: () => "application/json",
      },
      json: jest.fn().mockResolvedValue({ id: 1, name: "Single" }),
    };

    jest.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    const result = await httpExtractor(null, {
      url: "https://api.example.com/single",
      extract: "$.",
    });

    expect(result).toEqual([{ id: 1, name: "Single" }]);
  });
});
