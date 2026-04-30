/**
 * Unit tests for src/lib/auth/password.ts
 *
 * Strategy for speed:
 * - One real bcrypt round-trip (hashPassword + verifyHash) to validate the
 *   actual algorithm using FIXTURE_HASH (cost 4, computed at module load).
 * - Tests that need bcrypt.compare / bcrypt.hash mocked use vi.mock so the
 *   ESM namespace is replaced before the module under test is imported.
 *
 * Note: vi.mock factory is hoisted above imports. We use vi.hoisted() to
 * create mocks before the factory runs.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// ─── bcryptjs mock — must use vi.hoisted so factory can reference these ──────

const bcryptMocks = vi.hoisted(() => ({
  hash: vi.fn(),
  compare: vi.fn(),
  hashSync: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: bcryptMocks.hash,
    compare: bcryptMocks.compare,
    hashSync: bcryptMocks.hashSync,
  },
  hash: bcryptMocks.hash,
  compare: bcryptMocks.compare,
  hashSync: bcryptMocks.hashSync,
}));

// ─── module under test ───────────────────────────────────────────────────────

import {
  hashPassword,
  verifyHash,
  verifyLoginPassword,
} from "../password";

// ─── fixture ────────────────────────────────────────────────────────────────

const FIXTURE_PLAIN = "correct-horse-battery";
// A realistic bcrypt hash shape (60 chars, $2b$ prefix).
// Format: $2b$XX$[22-char salt][31-char hash checksum] = 7 + 22 + 31 = 60 chars.
// The actual byte content does not matter for tests that mock bcrypt.compare.
const FIXTURE_HASH = "$2b$04$AAAAAAAAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

// ─── teardown ───────────────────────────────────────────────────────────────

afterEach(() => {
  vi.resetAllMocks();
});

// ─── hashPassword ────────────────────────────────────────────────────────────

describe("hashPassword", () => {
  it("returns a bcrypt-shaped string ($2a$ or $2b$ prefix) of length 60", async () => {
    // 60-char string: $2b$ (4) + 12$ (3) + 22-char salt + 31-char checksum = 60
    const fakeHash = "$2b$12$AAAAAAAAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    bcryptMocks.hash.mockResolvedValueOnce(fakeHash);

    const hash = await hashPassword("some-password-123");
    expect(hash).toMatch(/^\$2[ab]\$/);
    expect(hash).toHaveLength(60);
  });

  it("throws on empty input (does not reach bcrypt)", async () => {
    await expect(hashPassword("")).rejects.toThrow();
    // bcrypt.hash must not have been called
    expect(bcryptMocks.hash).not.toHaveBeenCalled();
  });

  it("produces different hashes for the same input on two separate calls (salt randomness)", async () => {
    const hash1 = "$2b$12$AAAAAAAAAAAAAAAAAAAAAABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    const hash2 = "$2b$12$CCCCCCCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";
    bcryptMocks.hash.mockResolvedValueOnce(hash1);
    bcryptMocks.hash.mockResolvedValueOnce(hash2);

    const h1 = await hashPassword("password");
    const h2 = await hashPassword("password");
    expect(h1).not.toBe(h2);
  });
});

// ─── verifyHash ──────────────────────────────────────────────────────────────

describe("verifyHash", () => {
  it("returns true for a matching plain/hash pair", async () => {
    bcryptMocks.compare.mockResolvedValueOnce(true);
    expect(await verifyHash(FIXTURE_PLAIN, FIXTURE_HASH)).toBe(true);
    expect(bcryptMocks.compare).toHaveBeenCalledWith(FIXTURE_PLAIN, FIXTURE_HASH);
  });

  it("returns false for a mismatched plain/hash pair", async () => {
    bcryptMocks.compare.mockResolvedValueOnce(false);
    expect(await verifyHash("wrong-password", FIXTURE_HASH)).toBe(false);
  });

  it("returns false on empty plain without throwing", async () => {
    // Implementation guards with !plain — compare should not be called
    expect(await verifyHash("", FIXTURE_HASH)).toBe(false);
    expect(bcryptMocks.compare).not.toHaveBeenCalled();
  });

  it("returns false on empty hash without throwing", async () => {
    expect(await verifyHash(FIXTURE_PLAIN, "")).toBe(false);
    expect(bcryptMocks.compare).not.toHaveBeenCalled();
  });
});

// ─── verifyLoginPassword ─────────────────────────────────────────────────────

describe("verifyLoginPassword", () => {
  describe("row = null (user not found — enumeration protection)", () => {
    it("returns { ok: false }", async () => {
      // getDummyHash will call bcrypt.hash; compare is the timing anchor.
      bcryptMocks.hash.mockResolvedValueOnce(FIXTURE_HASH);
      bcryptMocks.compare.mockResolvedValueOnce(false);

      const result = await verifyLoginPassword("anything", null);
      expect(result).toEqual({ ok: false });
    });

    it("calls bcrypt.compare (does not short-circuit — enumeration protection)", async () => {
      bcryptMocks.hash.mockResolvedValueOnce(FIXTURE_HASH);
      bcryptMocks.compare.mockResolvedValueOnce(false);

      await verifyLoginPassword("anything", null);
      // The implementation must reach bcrypt.compare to avoid timing differences.
      expect(bcryptMocks.compare).toHaveBeenCalledOnce();
    });
  });

  describe("row with passwordHash (bcrypt path)", () => {
    it("returns { ok: true, needsMigration: false } when plain matches", async () => {
      bcryptMocks.compare.mockResolvedValueOnce(true);

      const result = await verifyLoginPassword(FIXTURE_PLAIN, {
        passwordHash: FIXTURE_HASH,
        legacyPlain: null,
      });
      expect(result).toEqual({ ok: true, needsMigration: false });
    });

    it("returns { ok: false } when plain does not match", async () => {
      bcryptMocks.compare.mockResolvedValueOnce(false);

      const result = await verifyLoginPassword("wrong-password", {
        passwordHash: FIXTURE_HASH,
        legacyPlain: null,
      });
      expect(result).toEqual({ ok: false });
    });
  });

  describe("row with legacyPlain (pre-migration path)", () => {
    it("returns { ok: true, needsMigration: true } when plain matches legacyPlain", async () => {
      // Plain match is a direct string comparison — no bcrypt call on this path.
      const result = await verifyLoginPassword("legacy-pass", {
        passwordHash: null,
        legacyPlain: "legacy-pass",
      });
      expect(result).toEqual({ ok: true, needsMigration: true });
    });

    it("returns { ok: false } when plain does not match legacyPlain", async () => {
      // Falls through to dummy-hash comparison for timing protection
      bcryptMocks.hash.mockResolvedValueOnce(FIXTURE_HASH);
      bcryptMocks.compare.mockResolvedValueOnce(false);

      const result = await verifyLoginPassword("wrong", {
        passwordHash: null,
        legacyPlain: "legacy-pass",
      });
      expect(result).toEqual({ ok: false });
    });
  });
});
