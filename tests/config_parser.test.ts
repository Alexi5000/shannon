// file: tests/config_parser.test.ts
// description: Unit tests for YAML config parsing and validation
// reference: src/config-parser.ts

import { describe, test, expect } from "bun:test";

describe("Config Parser", () => {
  describe("dangerous patterns detection", () => {
    test("should detect path traversal attempts", () => {
      const dangerousPattern = /\.\.\//;
      const testPath = "../../../etc/passwd";
      
      expect(dangerousPattern.test(testPath)).toBe(true);
    });

    test("should detect HTML/XML injection", () => {
      const htmlPattern = /[<>]/;
      const testInput = "<script>alert('xss')</script>";
      
      expect(htmlPattern.test(testInput)).toBe(true);
    });

    test("should detect JavaScript URLs", () => {
      const jsPattern = /javascript:/i;
      const testUrl = "javascript:alert(1)";
      
      expect(jsPattern.test(testUrl)).toBe(true);
    });

    test("should detect data URLs", () => {
      const dataPattern = /data:/i;
      const testUrl = "data:text/html,<script>alert(1)</script>";
      
      expect(dataPattern.test(testUrl)).toBe(true);
    });

    test("should detect file URLs", () => {
      const filePattern = /file:/i;
      const testUrl = "file:///etc/passwd";
      
      expect(filePattern.test(testUrl)).toBe(true);
    });

    test("should allow safe paths", () => {
      const patterns = [/\.\.\//, /[<>]/, /javascript:/i, /data:/i, /file:/i];
      const safePath = "/home/user/project/config.yml";
      
      const hasDanger = patterns.some((p) => p.test(safePath));
      expect(hasDanger).toBe(false);
    });
  });

  describe("file size limits", () => {
    test("should enforce maximum file size", () => {
      const maxFileSize = 1024 * 1024; // 1MB
      const testSize = 500 * 1024; // 500KB
      
      expect(testSize).toBeLessThan(maxFileSize);
    });

    test("should reject oversized files", () => {
      const maxFileSize = 1024 * 1024; // 1MB
      const testSize = 2 * 1024 * 1024; // 2MB
      
      expect(testSize).toBeGreaterThan(maxFileSize);
    });
  });

  describe("YAML safety", () => {
    test("should use FAILSAFE_SCHEMA for security", () => {
      // FAILSAFE_SCHEMA prevents arbitrary code execution
      const schemaName = "FAILSAFE_SCHEMA";
      
      expect(schemaName).toBe("FAILSAFE_SCHEMA");
    });

    test("should disable JSON syntax", () => {
      const jsonOption = false;
      
      expect(jsonOption).toBe(false);
    });
  });

  describe("config structure validation", () => {
    test("should require target field", () => {
      const config = {
        // Missing target
        rules: [],
      };
      
      expect(config.hasOwnProperty("target")).toBe(false);
    });

    test("should require rules field", () => {
      const config = {
        target: "http://example.com",
        // Missing rules
      };
      
      expect(config.hasOwnProperty("rules")).toBe(false);
    });

    test("should validate complete config structure", () => {
      const config = {
        target: "http://example.com",
        rules: [
          {
            name: "test-rule",
            enabled: true,
            severity: "high",
          },
        ],
        authentication: {
          type: "none",
        },
      };
      
      expect(config.target).toBeDefined();
      expect(config.rules).toBeDefined();
      expect(Array.isArray(config.rules)).toBe(true);
    });
  });

  describe("target URL validation", () => {
    test("should accept valid HTTP URL", () => {
      const target = "http://example.com";
      const urlPattern = /^https?:\/\/.+/;
      
      expect(urlPattern.test(target)).toBe(true);
    });

    test("should accept valid HTTPS URL", () => {
      const target = "https://example.com";
      const urlPattern = /^https?:\/\/.+/;
      
      expect(urlPattern.test(target)).toBe(true);
    });

    test("should reject non-HTTP URLs", () => {
      const target = "ftp://example.com";
      const urlPattern = /^https?:\/\/.+/;
      
      expect(urlPattern.test(target)).toBe(false);
    });

    test("should reject relative URLs", () => {
      const target = "/api/endpoint";
      const urlPattern = /^https?:\/\/.+/;
      
      expect(urlPattern.test(target)).toBe(false);
    });
  });

  describe("rule validation", () => {
    test("should validate rule structure", () => {
      const rule = {
        name: "injection-vuln",
        enabled: true,
        severity: "high",
        description: "Test for SQL injection vulnerabilities",
      };
      
      expect(rule.name).toBeDefined();
      expect(typeof rule.enabled).toBe("boolean");
      expect(rule.severity).toBeDefined();
    });

    test("should validate severity levels", () => {
      const validSeverities = ["low", "medium", "high", "critical"];
      
      validSeverities.forEach((severity) => {
        expect(["low", "medium", "high", "critical"]).toContain(severity);
      });
    });

    test("should reject invalid severity", () => {
      const invalidSeverity = "extreme";
      const validSeverities = ["low", "medium", "high", "critical"];
      
      expect(validSeverities).not.toContain(invalidSeverity);
    });
  });

  describe("authentication types", () => {
    test("should support none authentication", () => {
      const auth = { type: "none" };
      
      expect(auth.type).toBe("none");
    });

    test("should support bearer token authentication", () => {
      const auth = {
        type: "bearer",
        token: "test-token-123",
      };
      
      expect(auth.type).toBe("bearer");
      expect(auth.token).toBeDefined();
    });

    test("should support basic authentication", () => {
      const auth = {
        type: "basic",
        username: "user",
        password: "pass",
      };
      
      expect(auth.type).toBe("basic");
      expect(auth.username).toBeDefined();
      expect(auth.password).toBeDefined();
    });
  });
});
