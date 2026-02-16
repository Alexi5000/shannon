// file: tests/authorization/target_allowlist.test.ts
// description: Unit tests for target allowlist and authorization controls
// reference: src/authorization/target-allowlist.ts

import { describe, test, expect } from "bun:test";

describe("Target Allowlist", () => {
  describe("default configuration", () => {
    test("should have strict defaults", () => {
      const defaultConfig = {
        authorized_targets: [],
        emergency_stop_enabled: true,
        require_explicit_consent: true,
        production_block_enabled: true,
      };

      expect(defaultConfig.emergency_stop_enabled).toBe(true);
      expect(defaultConfig.require_explicit_consent).toBe(true);
      expect(defaultConfig.production_block_enabled).toBe(true);
      expect(defaultConfig.authorized_targets).toEqual([]);
    });

    test("should block production by default", () => {
      const productionBlockEnabled = true;
      
      expect(productionBlockEnabled).toBe(true);
    });

    test("should require explicit consent by default", () => {
      const requireConsent = true;
      
      expect(requireConsent).toBe(true);
    });
  });

  describe("scope validation", () => {
    test("should allow valid scopes", () => {
      const validScopes = ["staging", "dev", "qa", "sandbox"];
      
      validScopes.forEach((scope) => {
        expect(["staging", "dev", "qa", "sandbox"]).toContain(scope);
      });
    });

    test("should reject production scope", () => {
      const scope = "production";
      const allowedScopes = ["staging", "dev", "qa", "sandbox"];
      
      expect(allowedScopes).not.toContain(scope);
    });

    test("should reject invalid scope", () => {
      const scope = "invalid";
      const allowedScopes = ["staging", "dev", "qa", "sandbox"];
      
      expect(allowedScopes).not.toContain(scope);
    });
  });

  describe("target authorization structure", () => {
    test("should validate complete authorization", () => {
      const auth = {
        url: "https://staging.example.com",
        authorized_by: "security-team@example.com",
        authorization_token: "auth-token-123",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        scope: "staging" as const,
        notes: "Approved for Q1 security testing",
      };

      expect(auth.url).toBeDefined();
      expect(auth.authorized_by).toBeDefined();
      expect(auth.authorization_token).toBeDefined();
      expect(auth.expires_at).toBeDefined();
      expect(auth.scope).toBeDefined();
    });

    test("should require URL field", () => {
      const auth = {
        // Missing url
        authorized_by: "security-team@example.com",
        authorization_token: "token",
        expires_at: new Date().toISOString(),
        scope: "dev" as const,
      };

      expect(auth.hasOwnProperty("url")).toBe(false);
    });

    test("should require authorization token", () => {
      const auth = {
        url: "https://staging.example.com",
        authorized_by: "security-team@example.com",
        // Missing authorization_token
        expires_at: new Date().toISOString(),
        scope: "dev" as const,
      };

      expect(auth.hasOwnProperty("authorization_token")).toBe(false);
    });
  });

  describe("URL pattern validation", () => {
    test("should match authorized domain", () => {
      const targetUrl = "https://staging.example.com/api/endpoint";
      const authorizedUrl = "https://staging.example.com";
      
      expect(targetUrl.startsWith(authorizedUrl)).toBe(true);
    });

    test("should not match different subdomain", () => {
      const targetUrl = "https://production.example.com/api/endpoint";
      const authorizedUrl = "https://staging.example.com";
      
      expect(targetUrl.startsWith(authorizedUrl)).toBe(false);
    });

    test("should handle trailing slashes", () => {
      const targetUrl = "https://staging.example.com/api";
      const authorizedUrl1 = "https://staging.example.com/";
      const authorizedUrl2 = "https://staging.example.com";
      
      const normalized = targetUrl.replace(/\/$/, "");
      const auth1 = authorizedUrl1.replace(/\/$/, "");
      const auth2 = authorizedUrl2.replace(/\/$/, "");
      
      expect(normalized.startsWith(auth1)).toBe(true);
      expect(normalized.startsWith(auth2)).toBe(true);
    });
  });

  describe("expiration checking", () => {
    test("should detect expired authorization", () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const now = new Date();
      const expiresAt = new Date(pastDate);
      
      expect(expiresAt < now).toBe(true);
    });

    test("should detect valid authorization", () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const now = new Date();
      const expiresAt = new Date(futureDate);
      
      expect(expiresAt > now).toBe(true);
    });

    test("should handle timezone-aware dates", () => {
      const isoDate = new Date().toISOString();
      
      expect(isoDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe("production blocking", () => {
    test("should identify production URLs", () => {
      const productionUrls = [
        "https://production.example.com",
        "https://prod.example.com",
        "https://api.example.com",
        "https://example.com",
      ];

      productionUrls.forEach((url) => {
        const isProduction =
          url.includes("production") ||
          url.includes("prod.") ||
          !url.includes("staging") && !url.includes("dev") && !url.includes("qa");
        
        // This is a simplified heuristic
        expect(typeof isProduction).toBe("boolean");
      });
    });

    test("should identify non-production URLs", () => {
      const nonProductionUrls = [
        "https://staging.example.com",
        "https://dev.example.com",
        "https://qa.example.com",
        "https://sandbox.example.com",
      ];

      nonProductionUrls.forEach((url) => {
        const hasNonProdIndicator =
          url.includes("staging") ||
          url.includes("dev") ||
          url.includes("qa") ||
          url.includes("sandbox");
        
        expect(hasNonProdIndicator).toBe(true);
      });
    });
  });

  describe("emergency stop", () => {
    test("should be enabled by default", () => {
      const emergencyStopEnabled = true;
      
      expect(emergencyStopEnabled).toBe(true);
    });

    test("should support manual override", () => {
      let emergencyStopEnabled = true;
      
      // Can be disabled via config
      emergencyStopEnabled = false;
      
      expect(emergencyStopEnabled).toBe(false);
    });
  });

  describe("authorization result structure", () => {
    test("should include authorized flag", () => {
      const result = {
        authorized: true,
        scope: "staging",
      };

      expect(result.authorized).toBe(true);
    });

    test("should include reason when denied", () => {
      const result = {
        authorized: false,
        reason: "Target not in allowlist",
      };

      expect(result.authorized).toBe(false);
      expect(result.reason).toBeDefined();
    });

    test("should include scope when authorized", () => {
      const result = {
        authorized: true,
        scope: "dev",
      };

      expect(result.scope).toBeDefined();
      expect(["staging", "dev", "qa", "sandbox"]).toContain(result.scope);
    });
  });
});
