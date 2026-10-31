import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validateTelegramData } from "../worker/auth.ts";
const token = "test-only-fake-token";
const now = Date.UTC(2026, 9, 31, 12);
function signed(time = now / 1000) {
  const p = new URLSearchParams({
    auth_date: String(time),
    user: JSON.stringify({ id: 12345, first_name: "Тест" }),
    query_id: "test",
  });
  const check = [...p.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return p.toString();
}
test("accepts signed Telegram initData", async () =>
  assert.equal((await validateTelegramData(signed(), token, now))?.id, 12345));
test("rejects missing, forged, stale and future initData", async () => {
  assert.equal(await validateTelegramData("", token, now), null);
  assert.equal(await validateTelegramData(signed(), "wrong-token", now), null);
  assert.equal(
    await validateTelegramData(signed(now / 1000 - 86401), token, now),
    null,
  );
  assert.equal(
    await validateTelegramData(signed(now / 1000 + 120), token, now),
    null,
  );
});
test("rejects duplicate signed fields and user tampering", async () => {
  assert.equal(
    await validateTelegramData(signed() + "&user=x", token, now),
    null,
  );
  assert.equal(
    await validateTelegramData(signed().replace("12345", "12346"), token, now),
    null,
  );
});
