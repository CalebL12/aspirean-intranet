/* ============================================================
   Moving Future — submission mirror

   Netlify runs this automatically every time a form submission is
   verified, because of the file name. Nothing to configure and no
   token involved: it copies each submission into Netlify Blobs, which
   is the store the reading room reads from.

   The record written here is deliberately the same shape Netlify's own
   API returns for a submission, so responses.mjs can treat both sources
   identically and needs only one decoder.
   ============================================================ */

import { getStore } from "@netlify/blobs";

const STORE = process.env.MF_BLOB_STORE || "moving-future";

export const handler = async event => {
  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}").payload || {};
  } catch (err) {
    console.log("moving-future: could not parse the event body");
    return { statusCode: 400, body: "unparseable event" };
  }

  const data = payload.data || {};
  const email = String(data.email || "").trim().toLowerCase();
  const cycleId = String(data.cycle_id || "").trim();

  /* Anything without both keys cannot be filed, so let it live in the
     Forms tab only rather than writing a record nobody can find. */
  if (!email || !cycleId) {
    console.log("moving-future: skipped a submission with no email or cycle id");
    return { statusCode: 200, body: "skipped" };
  }

  const record = {
    id: payload.id || null,
    created_at: payload.created_at || new Date().toISOString(),
    data
  };

  try {
    const store = getStore({ name: STORE, consistency: "strong" });
    await store.setJSON(`${cycleId}/${email}`, record);
    console.log(`moving-future: stored ${cycleId}/${email}`);
    return { statusCode: 200, body: "stored" };
  } catch (err) {
    /* Returning 200 keeps Netlify from retrying in a loop. The submission
       itself is already safe in the Forms tab either way. */
    console.log("moving-future: blob write failed —", String(err.message || err));
    return { statusCode: 200, body: "not stored" };
  }
};
