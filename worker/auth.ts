import type { TelegramUser } from "../src/types.ts";
const enc = new TextEncoder();
export async function validateTelegramData(
  data: string,
  botToken: string,
  now = Date.now(),
): Promise<TelegramUser | null> {
  try {
    if (!data || data.length > 12000) return null;
    const params = new URLSearchParams(data);
    if (new Set([...params.keys()]).size !== [...params.keys()].length)
      return null;
    const hash = params.get("hash");
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
    const authDate = Number(params.get("auth_date"));
    if (
      !authDate ||
      authDate > now / 1000 + 60 ||
      now / 1000 - authDate > 86400
    )
      return null;
    params.delete("hash");
    const check = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const secret = await crypto.subtle.sign("HMAC", key, enc.encode(botToken));
    const hmac = await crypto.subtle.importKey(
      "raw",
      secret,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const bytes = Uint8Array.from(hash.match(/.{2}/g)!, (x) => parseInt(x, 16));
    if (!(await crypto.subtle.verify("HMAC", hmac, bytes, enc.encode(check))))
      return null;
    const user = JSON.parse(
      params.get("user") || "null",
    ) as TelegramUser | null;
    if (
      !user ||
      !Number.isSafeInteger(user.id) ||
      user.id <= 0 ||
      typeof user.first_name !== "string"
    )
      return null;
    return user;
  } catch {
    return null;
  }
}
