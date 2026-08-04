/* ============================================================
   Moving Future — record a response directly

   The form posts here immediately after it posts to Netlify Forms, so a
   response lands in the store at the moment it is sent rather than
   whenever the platform gets round to firing its event.

   Why both: submission-created.mjs is a backstop that catches anything
   posted to Netlify Forms by any route, and this is the fast path that
   makes the reading room correct straight away. Both write the same key,
   so whichever runs last simply rewrites the same record.

   Netlify Forms remains the system of record. This store is a mirror of
   it, which is what makes it safe for the write path to be this simple.
   ============================================================ */

import { getStore } from "@netlify/blobs";

const STORE = process.env.MF_BLOB_STORE || "moving-future";

/* Third of three copies of the roster: here, in responses.mjs, and as
   DATA.team in index.html. This one is the write gate, so it has to live
   server-side. Change all three together. */
const ALLOWED = [
  "chris@aspirean.com",
  "brad@aspirean.com",
  "kevin@aspirean.com",
  "caleb@aspirean.com"
];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

export default async req => {
  if (req.method !== "POST") {
    return json({ error: "method", message: "POST only." }, 405);
  }

  /* Only accept writes originating from this site. The real boundary is the
     site's own access control; this just closes off cross-origin posting. */
  const here = req.headers.get("host") || "";
  const from = req.headers.get("origin") || req.headers.get("referer") || "";
  if (from) {
    let fromHost = "";
    try { fromHost = new URL(from).host; } catch (e) { fromHost = ""; }
    if (fromHost && here && fromHost !== here) {
      return json({ error: "origin", message: "Cross-origin submissions are not accepted." }, 403);
    }
  }

  let data = {};
  try {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    for (const [k, v] of params) data[k] = v;
  } catch (err) {
    return json({ error: "unparseable", message: "Could not read the submission body." }, 400);
  }

  delete data["form-name"];
  delete data["bot-field"];

  const email = String(data.email || "").trim().toLowerCase();
  const cycleId = String(data.cycle_id || "").trim();

  if (!email || ALLOWED.indexOf(email) === -1) {
    return json({ error: "unknown_person", message: "That email is not on the Moving Future roster." }, 403);
  }
  if (!cycleId) {
    return json({ error: "no_cycle", message: "The submission carried no cycle id." }, 400);
  }

  data.email = email;

  const record = {
    id: "direct-" + Date.now(),
    created_at: new Date().toISOString(),
    recordedBy: "form",
    data
  };

  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    await store.setJSON(`${cycleId}/${email}`, record);
  } catch (err) {
    /* The response is already safe in Netlify Forms, and the event backstop
       may still land it, so report the failure without pretending it is fatal. */
    return json({
      error: "store",
      message: "Recorded in Netlify Forms, but the reading room copy failed: " + String(err.message || err)
    }, 502);
  }

  return json({ ok: true, cycle: cycleId, email });
};
