import { describe, expect, test } from "bun:test";
import {
  createWalletSessionChallenge,
  createWalletSessionCookie,
  readWalletSessionCookie,
  verifyWalletSessionChallenge,
} from "../app/api/backend/read-token/lib";

describe("wallet session read-token helpers", () => {
  test("creates a signed wallet-session challenge for login-level auth", () => {
    const now = new Date("2026-06-25T00:00:00.000Z");
    const challenge = createWalletSessionChallenge({
      accountId: "buyer.testnet",
      recipient: "clawhouse.test",
      secret: "test-secret",
      now,
    });

    const verified = verifyWalletSessionChallenge(challenge.challenge, "test-secret", now);
    const message = JSON.parse(verified.message) as Record<string, unknown>;

    expect(verified.accountId).toBe("buyer.testnet");
    expect(verified.recipient).toBe("clawhouse.test");
    expect(message.purpose).toBe("wallet_session");
    expect(message.account_id).toBe("buyer.testnet");
    expect(message.wallet_session_expires_at).toBe("2026-07-25T00:00:00.000Z");
  });

  test("reads a valid 30-day wallet-session cookie", () => {
    const now = new Date("2026-06-25T00:00:00.000Z");
    const cookie = createWalletSessionCookie({
      accountId: "buyer.testnet",
      publicKey: "ed25519:11111111111111111111111111111111",
      secret: "test-secret",
      now,
    });
    const request = new Request("http://clawhouse.test", {
      headers: {
        cookie: `clawhouse_wallet_session=${encodeURIComponent(cookie.cookie)}`,
      },
    });

    const session = readWalletSessionCookie(request, "test-secret", now);

    expect(session?.accountId).toBe("buyer.testnet");
    expect(session?.expiresAt).toBe("2026-07-25T00:00:00.000Z");
  });
});
