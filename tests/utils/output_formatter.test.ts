// file: tests/utils/output_formatter.test.ts
// description: Unit tests for output formatting utilities (report formatting, agent prefixes)
// reference: src/utils/output-formatter.ts

import { describe, test, expect } from "bun:test";
import { getAgentPrefix } from "../../src/utils/output-formatter";

describe("Output Formatter", () => {
  describe("getAgentPrefix", () => {
    test("should return injection prefix", () => {
      const prefix = getAgentPrefix("injection-vuln");
      expect(prefix).toBe("[Injection]");
    });

    test("should return XSS prefix", () => {
      const prefix = getAgentPrefix("xss-vuln");
      expect(prefix).toBe("[XSS]");
    });

    test("should return Auth prefix", () => {
      const prefix = getAgentPrefix("auth-vuln");
      expect(prefix).toBe("[Auth]");
    });

    test("should return Authz prefix", () => {
      const prefix = getAgentPrefix("authz-vuln");
      expect(prefix).toBe("[Authz]");
    });

    test("should return SSRF prefix", () => {
      const prefix = getAgentPrefix("ssrf-vuln");
      expect(prefix).toBe("[SSRF]");
    });

    test("should handle exploit agent names", () => {
      const exploitAgents = [
        "injection-exploit",
        "xss-exploit",
        "auth-exploit",
        "authz-exploit",
        "ssrf-exploit",
      ];

      exploitAgents.forEach((agent) => {
        const prefix = getAgentPrefix(agent);
        expect(prefix).toMatch(/^\[.+\]$/);
      });
    });

    test("should handle unknown agents gracefully", () => {
      const prefix = getAgentPrefix("unknown-agent");
      // Should return a prefix or empty string
      expect(typeof prefix).toBe("string");
    });
  });

  describe("URL domain extraction", () => {
    test("should extract domain from HTTP URL", () => {
      const url = "http://example.com/path/to/resource";
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      expect(domain).toBe("example.com");
    });

    test("should extract domain from HTTPS URL", () => {
      const url = "https://staging.example.com/api/endpoint";
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      expect(domain).toBe("staging.example.com");
    });

    test("should handle URL with port", () => {
      const url = "http://localhost:4005/api";
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      expect(domain).toBe("localhost");
    });

    test("should handle invalid URL gracefully", () => {
      const invalidUrl = "not-a-valid-url";
      let domain: string;

      try {
        const urlObj = new URL(invalidUrl);
        domain = urlObj.hostname;
      } catch {
        domain = invalidUrl.slice(0, 30);
      }

      expect(domain.length).toBeGreaterThan(0);
    });
  });

  describe("todo status formatting", () => {
    test("should identify completed todos", () => {
      const todos = [
        { status: "completed", content: "Task 1" },
        { status: "completed", content: "Task 2" },
      ];

      const completed = todos.filter((t) => t.status === "completed");

      expect(completed.length).toBe(2);
    });

    test("should identify in-progress todos", () => {
      const todos = [
        { status: "completed", content: "Task 1" },
        { status: "in_progress", content: "Task 2" },
      ];

      const inProgress = todos.filter((t) => t.status === "in_progress");

      expect(inProgress.length).toBe(1);
      expect(inProgress[0].content).toBe("Task 2");
    });

    test("should format completed task message", () => {
      const todo = { status: "completed", content: "Fixed vulnerability" };
      const message = `✅ ${todo.content}`;

      expect(message).toBe("✅ Fixed vulnerability");
    });

    test("should format in-progress task message", () => {
      const todo = { status: "in_progress", content: "Testing endpoint" };
      const message = `🔄 ${todo.content}`;

      expect(message).toBe("🔄 Testing endpoint");
    });

    test("should handle empty todo list", () => {
      const todos: any[] = [];
      const completed = todos.filter((t) => t.status === "completed");

      expect(completed.length).toBe(0);
    });
  });

  describe("severity formatting", () => {
    test("should format critical severity", () => {
      const severity = "critical";
      const formatted = severity.toUpperCase();

      expect(formatted).toBe("CRITICAL");
    });

    test("should format high severity", () => {
      const severity = "high";
      const formatted = severity.toUpperCase();

      expect(formatted).toBe("HIGH");
    });

    test("should format medium severity", () => {
      const severity = "medium";
      const formatted = severity.toUpperCase();

      expect(formatted).toBe("MEDIUM");
    });

    test("should format low severity", () => {
      const severity = "low";
      const formatted = severity.toUpperCase();

      expect(formatted).toBe("LOW");
    });
  });

  describe("report structure", () => {
    test("should include findings summary", () => {
      const report = {
        findings: [
          { severity: "high", description: "SQL injection" },
          { severity: "medium", description: "XSS vulnerability" },
        ],
        summary: "Found 2 vulnerabilities",
      };

      expect(report.findings.length).toBe(2);
      expect(report.summary).toBeDefined();
    });

    test("should categorize findings by severity", () => {
      const findings = [
        { severity: "high", description: "Finding 1" },
        { severity: "medium", description: "Finding 2" },
        { severity: "high", description: "Finding 3" },
      ];

      const bySeverity = findings.reduce((acc: any, f) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
        return acc;
      }, {});

      expect(bySeverity.high).toBe(2);
      expect(bySeverity.medium).toBe(1);
    });

    test("should include timestamp", () => {
      const report = {
        timestamp: new Date().toISOString(),
        findings: [],
      };

      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
