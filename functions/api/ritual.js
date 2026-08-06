const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS
  });
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function clientIdForRequest(request, secret) {
  const ip = request.headers.get("CF-Connecting-IP")?.trim();
  if (!ip) throw new Error("Client IP is unavailable");
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("IP_HASH_SECRET is not configured");
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(ip));
  return toHex(signature);
}

function countersFromBatch(batch, personalIndex, globalIndex) {
  const personal = batch[personalIndex]?.results?.[0];
  const global = batch[globalIndex]?.results?.[0];
  if (!personal || !global) throw new Error("Counter query returned no rows");
  return {
    personal: {
      merit: Number(personal.merit),
      release: Number(personal.release)
    },
    global: {
      merit: Number(global.merit),
      release: Number(global.release)
    },
    identity: {
      strategy: "hmac-sha256-ip-v1",
      rawIpStored: false
    }
  };
}

async function readCounters(db, clientId) {
  const batch = await db.batch([
    db.prepare(
      "INSERT OR IGNORE INTO ritual_users (id, merit, release) VALUES (?, 0, 0)"
    ).bind(clientId),
    db.prepare(
      "INSERT OR IGNORE INTO ritual_totals (id, merit, release) VALUES (1, 0, 0)"
    ),
    db.prepare(
      "SELECT merit, release FROM ritual_users WHERE id = ?"
    ).bind(clientId),
    db.prepare(
      "SELECT merit, release FROM ritual_totals WHERE id = 1"
    )
  ]);
  return countersFromBatch(batch, 2, 3);
}

async function applyAction(db, clientId, eventId, action) {
  const column = action === "merit" ? "merit" : "release";
  const batch = await db.batch([
    db.prepare(
      "INSERT OR IGNORE INTO ritual_users (id, merit, release) VALUES (?, 0, 0)"
    ).bind(clientId),
    db.prepare(
      "INSERT OR IGNORE INTO ritual_totals (id, merit, release) VALUES (1, 0, 0)"
    ),
    db.prepare(
      "INSERT OR IGNORE INTO ritual_events (event_id, user_id, action, applied) VALUES (?, ?, ?, 0)"
    ).bind(eventId, clientId, action),
    db.prepare(
      `UPDATE ritual_users
       SET ${column} = ${column} + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND EXISTS (
           SELECT 1 FROM ritual_events
           WHERE event_id = ? AND user_id = ? AND applied = 0
         )`
    ).bind(clientId, eventId, clientId),
    db.prepare(
      `UPDATE ritual_totals
       SET ${column} = ${column} + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
         AND EXISTS (
           SELECT 1 FROM ritual_events
           WHERE event_id = ? AND user_id = ? AND applied = 0
         )`
    ).bind(eventId, clientId),
    db.prepare(
      "UPDATE ritual_events SET applied = 1 WHERE event_id = ? AND user_id = ? AND applied = 0"
    ).bind(eventId, clientId),
    db.prepare(
      "SELECT merit, release FROM ritual_users WHERE id = ?"
    ).bind(clientId),
    db.prepare(
      "SELECT merit, release FROM ritual_totals WHERE id = 1"
    )
  ]);
  return countersFromBatch(batch, 6, 7);
}

function validateEventId(value) {
  return typeof value === "string"
    && value.length >= 8
    && value.length <= 80
    && /^[a-zA-Z0-9-]+$/.test(value);
}

export async function onRequest({ request, env }) {
  if (!env.DB) return json({ error: "D1 binding DB is not configured" }, 503);

  const requestUrl = new URL(request.url);
  if (request.method === "POST") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== requestUrl.origin) {
      return json({ error: "Cross-origin updates are not allowed" }, 403);
    }
  }

  try {
    const clientId = await clientIdForRequest(request, env.IP_HASH_SECRET);
    if (request.method === "GET") {
      return json(await readCounters(env.DB, clientId));
    }
    if (request.method === "POST") {
      const payload = await request.json();
      if (payload?.action !== "merit" && payload?.action !== "release") {
        return json({ error: "action must be merit or release" }, 400);
      }
      if (!validateEventId(payload?.eventId)) {
        return json({ error: "eventId is invalid" }, 400);
      }
      return json(
        await applyAction(env.DB, clientId, payload.eventId, payload.action)
      );
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Ritual API error", error);
    return json({ error: "Ritual counters are temporarily unavailable" }, 503);
  }
}
