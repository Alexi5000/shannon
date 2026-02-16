// file: tests/utils/functional.test.ts
// description: Unit tests for functional programming utilities (async pipeline)
// reference: src/utils/functional.ts

import { describe, test, expect } from "bun:test";
import { asyncPipe } from "../../src/utils/functional";

describe("Functional Utils", () => {
  describe("asyncPipe", () => {
    test("should pass value through single function", async () => {
      const result = await asyncPipe(
        10,
        (x) => x * 2
      );

      expect(result).toBe(20);
    });

    test("should pass value through multiple functions", async () => {
      const result = await asyncPipe(
        5,
        (x) => x * 2,
        (x) => x + 3,
        (x) => x / 2
      );

      // ((5 * 2) + 3) / 2 = 13 / 2 = 6.5
      expect(result).toBe(6.5);
    });

    test("should handle async functions", async () => {
      const result = await asyncPipe(
        "hello",
        async (x) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return x.toUpperCase();
        },
        async (x) => x + " WORLD"
      );

      expect(result).toBe("HELLO WORLD");
    });

    test("should handle mix of sync and async functions", async () => {
      const result = await asyncPipe(
        10,
        (x) => x * 2, // Sync
        async (x) => {
          // Async
          await new Promise((resolve) => setTimeout(resolve, 5));
          return x + 5;
        },
        (x) => x - 10 // Sync
      );

      // ((10 * 2) + 5) - 10 = 15
      expect(result).toBe(15);
    });

    test("should handle empty pipeline", async () => {
      const result = await asyncPipe(42);

      expect(result).toBe(42);
    });

    test("should handle string transformations", async () => {
      const result = await asyncPipe(
        "test",
        (x) => x.toUpperCase(),
        (x) => x + "-SUFFIX",
        (x) => x.toLowerCase()
      );

      expect(result).toBe("test-suffix");
    });

    test("should handle object transformations", async () => {
      const result = await asyncPipe(
        { value: 10 },
        (obj) => ({ ...obj, doubled: obj.value * 2 }),
        (obj) => ({ ...obj, tripled: obj.value * 3 })
      );

      expect(result.value).toBe(10);
      expect(result.doubled).toBe(20);
      expect(result.tripled).toBe(30);
    });

    test("should handle array transformations", async () => {
      const result = await asyncPipe(
        [1, 2, 3],
        (arr) => arr.map((x) => x * 2),
        (arr) => arr.filter((x) => x > 2),
        (arr) => arr.reduce((sum, x) => sum + x, 0)
      );

      // [1,2,3] -> [2,4,6] -> [4,6] -> 10
      expect(result).toBe(10);
    });

    test("should propagate errors", async () => {
      await expect(
        asyncPipe(
          10,
          (x) => x * 2,
          (x) => {
            throw new Error("Pipeline error");
          }
        )
      ).rejects.toThrow("Pipeline error");
    });

    test("should handle async error propagation", async () => {
      await expect(
        asyncPipe(
          10,
          async (x) => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            throw new Error("Async error");
          }
        )
      ).rejects.toThrow("Async error");
    });

    test("should type-check result", async () => {
      const result = await asyncPipe<number>(
        "10",
        (x) => parseInt(x as string),
        (x) => x * 2
      );

      expect(typeof result).toBe("number");
      expect(result).toBe(20);
    });

    test("should handle complex transformations", async () => {
      interface Data {
        text: string;
        processed?: boolean;
        length?: number;
      }

      const result = await asyncPipe<Data>(
        { text: "hello" },
        async (data: Data) => ({
          ...data,
          processed: true,
        }),
        (data: Data) => ({
          ...data,
          length: data.text.length,
        })
      );

      expect(result.processed).toBe(true);
      expect(result.length).toBe(5);
    });
  });
});
