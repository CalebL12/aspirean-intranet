/* ============================================================
   Aspirean Intranet — shared page behaviour
   Netlify Forms submission, roster, and the modal/toast furniture.
   No external libraries: everything here is small enough that a CDN
   would add a failure mode without adding capability.
   ============================================================ */

/* Roster for the person pickers. Display only, so this is not the
   gate on anything. The lists that matter are in the functions. */
const ROSTER = [
  { name: "Chris Winkler",    email: "chris@aspirean.com" },
  { name: "Brad Alvarez",     email: "brad@aspirean.com" },
  { name: "Kevin Ostafinski", email: "kevin@aspirean.com" },
  { name: "Caleb",            email: "caleb@aspirean.com" }
];

const FORM_ACTION = "/__forms.html";
const IDENTITY_KEY = "aspirean_mf_identity";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v == null ? "" : v)
  .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const money = n => "$" + (Number(n) || 0).toLocaleString("en-US", {
  minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* 'YYYY-MM-DD' without the timezone shift a bare Date parse would cause. */
function toDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
const toISO = d => d
  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  : "";
function longDate(iso) {
  const d = toDate(iso);
  return d ? d.toLocaleDateString("en-US",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
}
function shortDate(iso) {
  const d = toDate(iso);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

/* ---------- furniture, injected so pages do not repeat it ---------- */
function mountChrome() {
  if ($("#scrim")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="scrim" id="scrim" role="dialog" aria-modal="true" aria-labelledby="mTitle" hidden>
      <div class="modal">
        <h3 id="mTitle"></h3>
        <p class="sub" id="mSub"></p>
        <div class="body" id="mBody"></div>
        <div class="foot" id="mFoot"></div>
      </div>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);

  $("#scrim").addEventListener("click", e => { if (e.target.id === "scrim") closeModal(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && $("#scrim").classList.contains("show")) closeModal();
  });
}

let lastFocus = null;
function modal(title, sub, html, buttons) {
  mountChrome();
  lastFocus = document.activeElement;
  $("#mTitle").textContent = title;
  $("#mSub").textContent = sub || "";
  $("#mBody").innerHTML = html || "";
  const foot = $("#mFoot");
  foot.innerHTML = "";
  (buttons || [{ label: "Close", primary: true, fn: closeModal }]).forEach(b => {
    const el = document.createElement("button");
    el.className = "btn " + (b.primary ? "primary" : "quiet");
    el.textContent = b.label;
    el.addEventListener("click", b.fn);
    foot.appendChild(el);
  });
  const s = $("#scrim");
  s.hidden = false;
  s.classList.add("show");
  const first = foot.querySelector("button");
  if (first) first.focus();
}

function closeModal() {
  const s = $("#scrim");
  if (!s) return;
  s.classList.remove("show");
  s.hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

let toastTimer = null;
function toast(msg) {
  mountChrome();
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
}

/* ---------- people ---------- */
function fillPeople(select, preselect) {
  let known = preselect || "";
  if (!known) {
    try {
      const id = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null");
      if (id && id.email) known = String(id.email).toLowerCase();
    } catch (e) {}
  }
  select.innerHTML = `<option value="">Choose your name</option>` +
    ROSTER.map(p => `<option value="${esc(p.email)}"${p.email === known ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  return known;
}
const nameFor = email => {
  const hit = ROSTER.find(p => p.email === email);
  return hit ? hit.name : "";
};

/* ---------- submission ---------- */
/* Netlify detects fields from the static blueprint in __forms.html at deploy
   time, so anything sent here has to exist there too. */
async function submitToNetlify(formName, data) {
  const body = new URLSearchParams();
  body.set("form-name", formName);
  body.set("bot-field", "");
  Object.keys(data).forEach(k => body.set(k, data[k] == null ? "" : String(data[k])));

  const res = await fetch(FORM_ACTION, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString()
  });
  if (!res.ok) throw new Error("Netlify answered " + res.status);
  return true;
}

function submitFailed(err) {
  modal("That did not send", "Nothing was lost. Your entries are still on the page.",
    `<p>${esc(String(err && err.message ? err.message : err))}</p>
     <p>A 404 usually means form detection is off in Netlify, or the site has not been
     redeployed since this form was added. Opening the page from a local file rather than
     the live site will do it too.</p>`,
    [{ label: "Back to the form", primary: true, fn: closeModal }]);
}

function setBusy(btn, on, restLabel) {
  btn.disabled = !!on;
  btn.textContent = on ? "Sending…" : restLabel;
}

document.addEventListener("DOMContentLoaded", mountChrome);
