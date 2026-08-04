/* ============================================================
   Moving Future — responses endpoint

   Two views:
     ?view=status&cycle=2026-07
        Who has submitted. Names, roles, percent, timestamp. No answers.
        Safe for anyone who can load the intranet.

     ?view=full&cycle=2026-07&email=chris@aspirean.com
        Everyone's answers for that cycle. Returns 403 unless that email
        has a submission of its own for the same cycle.

     ?view=diag
        Which pieces are wired up. Never returns anyone's answers.

   Two sources, tried in this order and merged:

     Netlify Blobs   written automatically by submission-created.mjs as each
                     submission is verified. No configuration, no token.
                     This is the normal path.

     Netlify API     only used if NETLIFY_API_TOKEN is set. Covers submissions
                     made before the mirror existed, and acts as a check on it.
                     Entirely optional.

   Identity is asserted by the caller, not verified. The real boundary is
   the site's own access control in Netlify. This gate enforces the
   submit-first rule among four known people; it is not authentication.
   ============================================================ */

const API = "https://api.netlify.com/api/v1";

/* Keep this list in step with DATA.team in index.html. */
const ROSTER = [
  { name: "Chris Winkler",    email: "chris@aspirean.com" },
  { name: "Brad Alvarez",     email: "brad@aspirean.com" },
  { name: "Kevin Ostafinski", email: "kevin@aspirean.com" },
  { name: "Caleb",            email: "caleb@aspirean.com" }
];

/* Question ids withheld from the shared reading room. Empty means everything
   is shared. Stripping happens here, on the server, so it cannot be worked
   around from the browser. Candidates if you ever want a private channel back:
     "q19"     what haven't I asked that I should have
     "scores"  the four standing measures, including Health          */
const PRIVATE_IDS = [];

const FORM_NAME = process.env.MF_FORM_NAME || "moving-future";

/* The API takes a site id or any of the site's domains, so there are several
   ways home if SITE_ID is ever absent. */
function resolveSite(req) {
  if (process.env.MF_SITE_ID) return { id: process.env.MF_SITE_ID, source: "MF_SITE_ID" };
  if (process.env.SITE_ID) return { id: process.env.SITE_ID, source: "SITE_ID" };
  if (process.env.URL) {
    try { return { id: new URL(process.env.URL).hostname, source: "URL" }; } catch (e) {}
  }
  const host = req.headers.get("host");
  if (host) return { id: host.split(":")[0], source: "request host" };
  return { id: "", source: "none" };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

async function call(path, token) {
  const res = await fetch(API + path, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "aspirean-intranet"
    }
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Netlify API returned ${res.status} for ${path}. ${detail.slice(0, 200)}`);
  }
  return res.json();
}

function fromBase64(b64) {
  const bin = atob(String(b64 || "").replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const toNum = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function shape(sub) {
  const d = sub.data || {};
  let parsed = null;
  try {
    parsed = JSON.parse(fromBase64(d.payload));
  } catch (e) {
    parsed = null;
  }
  return {
    email: String(d.email || "").trim().toLowerCase(),
    person: d.person || "",
    role: d.role || "",
    cycle: d.cycle || "",
    cycleId: d.cycle_id || "",
    percent: toNum(d.percent),
    scores: {
      work: toNum(d.score_work),
      health: toNum(d.score_health),
      life: toNum(d.score_life),
      align: toNum(d.score_align)
    },
    submitted: sub.created_at,
    answers: parsed ? parsed.answers || null : null,
    schema: parsed ? parsed.schema || null : null,
    scoreMeta: parsed ? parsed.scoreMeta || null : null,
    horizonMeta: parsed ? parsed.horizonMeta || null : null,
    parsed: !!parsed
  };
}

async function loadAll(token, siteId) {
  const forms = await call(`/sites/${encodeURIComponent(siteId)}/forms`, token);
  const form = (forms || []).find(f => f.name === FORM_NAME);
  if (!form) return { form: null, subs: [] };

  let subs = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await call(`/forms/${form.id}/submissions?per_page=100&page=${page}`, token);
    if (!Array.isArray(batch) || !batch.length) break;
    subs = subs.concat(batch);
    if (batch.length < 100) break;
  }
  return { form, subs: subs.map(shape) };
}

const BLOB_STORE = process.env.MF_BLOB_STORE || "moving-future";

/* Imported lazily so a missing package or an unconfigured environment
   degrades to the API path instead of taking the whole function down. */
async function loadFromBlobs(cycleId) {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({ name: BLOB_STORE, consistency: "strong" });
    const listed = await store.list({ prefix: cycleId ? cycleId + "/" : "" });
    const keys = ((listed && listed.blobs) || []).map(b => b.key);
    const subs = [];
    for (const key of keys) {
      const rec = await store.get(key, { type: "json" });
      if (rec) subs.push(shape(rec));
    }
    return { ok: true, subs };
  } catch (err) {
    return { ok: false, subs: [], error: String(err.message || err) };
  }
}

/* Newest submission wins, one per person per cycle. */
function latestByEmail(subs, cycleId) {
  const scoped = cycleId ? subs.filter(s => s.cycleId === cycleId) : subs;
  const sorted = scoped.slice().sort((a, b) => new Date(b.submitted) - new Date(a.submitted));
  const out = new Map();
  for (const s of sorted) if (s.email && !out.has(s.email)) out.set(s.email, s);
  return out;
}

function stripPrivate(record) {
  if (!PRIVATE_IDS.length) return record;
  const answers = { ...(record.answers || {}) };
  PRIVATE_IDS.forEach(id => delete answers[id]);
  const schema = (record.schema || []).filter(q => !PRIVATE_IDS.includes(q.id));
  const scores = PRIVATE_IDS.includes("scores")
    ? { work: null, health: null, life: null, align: null }
    : record.scores;
  return { ...record, answers, schema, scores };
}

export default async req => {
  const token = process.env.NETLIFY_API_TOKEN;
  const site = resolveSite(req);
  const url = new URL(req.url);
  const view = (url.searchParams.get("view") || "status").toLowerCase();
  const cycleId = (url.searchParams.get("cycle") || "").trim();
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();

  /* The normal path. No configuration required. */
  const blobs = await loadFromBlobs(cycleId);

  /* Optional second source. Only attempted if a token exists. */
  let api = { ok: false, subs: [], error: null, formFound: null };
  if (token && site.id) {
    try {
      const loaded = await loadAll(token, site.id);
      api = { ok: true, subs: loaded.subs, error: null, formFound: !!loaded.form };
    } catch (err) {
      api = { ok: false, subs: [], error: String(err.message || err), formFound: null };
    }
  }

  const source = blobs.ok && api.ok ? "blobs + api" : blobs.ok ? "blobs" : api.ok ? "api" : "none";
  const merged = blobs.subs.concat(api.subs);

  if (view === "diag") {
    const out = {
      wiredUp: blobs.ok || api.ok,
      source,
      blobs: blobs.ok
        ? { store: BLOB_STORE, records: blobs.subs.length }
        : { store: BLOB_STORE, unavailable: blobs.error },
      api: !token
        ? "no token set, which is expected once the mirror is live"
        : api.ok
          ? { siteResolvedFrom: site.source, formFound: api.formFound, submissions: api.subs.length }
          : { siteResolvedFrom: site.source, failed: api.error },
      formName: FORM_NAME,
      roster: ROSTER.length,
      withheldQuestions: PRIVATE_IDS,
      payloadsReadable: `${merged.filter(x => x.parsed).length} of ${merged.length}`
    };
    const seen = {};
    merged.forEach(x => {
      const k = x.cycleId || "(no cycle id)";
      seen[k] = (seen[k] || 0) + 1;
    });
    out.cycles = seen;
    out.nextStep = blobs.ok || api.ok
      ? "Wired up."
      : "Neither source answered. Redeploy so submission-created.mjs is live, or set NETLIFY_API_TOKEN to read through the API instead.";
    return json(out, 200);
  }

  if (!blobs.ok && !api.ok) {
    return json({
      error: "config",
      message: token
        ? `Neither source answered. The API said: ${api.error || "nothing"}. Blobs said: ${blobs.error || "nothing"}.`
        : "No source is available yet. Redeploy so submission-created.mjs is live and submissions mirror into Netlify Blobs. Setting NETLIFY_API_TOKEN is the alternative, not a requirement."
    }, 503);
  }

  const latest = latestByEmail(merged, cycleId);
  const nothingAnywhere = !latest.size && api.formFound === false && !blobs.subs.length;

  if (view === "status") {
    return json({
      cycle: cycleId,
      source,
      formFound: !nothingAnywhere,
      message: nothingAnywhere
        ? `No form named "${FORM_NAME}" exists on this site yet. Enable form detection under Forms, then redeploy so the blueprint in __forms.html is picked up.`
        : "",
      roster: ROSTER.map(p => {
        const s = latest.get(p.email);
        return {
          name: p.name,
          email: p.email,
          submitted: s ? s.submitted : null,
          percent: s ? s.percent : null,
          role: s ? s.role : null
        };
      }),
      submitted: latest.size,
      total: ROSTER.length
    });
  }

  if (view === "full") {
    if (!ROSTER.some(p => p.email === email)) {
      return json({
        error: "unknown_person",
        message: "That email is not on the Moving Future roster."
      }, 403);
    }
    if (!latest.has(email)) {
      return json({
        error: "not_submitted",
        message: "Everyone's responses open up once your own is in.",
        cycle: cycleId
      }, 403);
    }

    const responses = ROSTER
      .map(p => latest.get(p.email))
      .filter(Boolean)
      .map(stripPrivate)
      .map(r => ({
        person: r.person,
        email: r.email,
        role: r.role,
        cycle: r.cycle,
        percent: r.percent,
        submitted: r.submitted,
        scores: r.scores,
        answers: r.answers,
        parsed: r.parsed
      }));

    const withSchema = [...latest.values()].find(r => r.schema && r.schema.length);

    return json({
      cycle: cycleId,
      you: email,
      source,
      responses,
      schema: withSchema ? stripPrivate(withSchema).schema : [],
      scoreMeta: withSchema ? withSchema.scoreMeta : null,
      horizonMeta: withSchema ? withSchema.horizonMeta : null,
      waiting: ROSTER.filter(p => !latest.has(p.email)).map(p => p.name),
      withheld: PRIVATE_IDS
    });
  }

  return json({ error: "bad_view", message: "Use view=status, view=full, or view=diag." }, 400);
};
