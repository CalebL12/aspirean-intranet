# Aspirean Intranet

Static site plus one serverless function. No build step, no dependencies beyond
Google Fonts. Push to the repo and Netlify redeploys.

```
index.html                     Home, Moving Future, Responses, Archive, Resources
moving-future-intake.html      the reflection form, posts to Netlify Forms
__forms.html                   field blueprint so Netlify detects the form at deploy
netlify/functions/
  submission-created.mjs       runs itself on every submission, mirrors it into Blobs
  responses.mjs                serves the tracker and the reading room
package.json                   one dependency, @netlify/blobs
netlify.toml                   publish root, function dir, /api route, security headers
records/                       cycle records (January 2026 synthesis is in place)
robots.txt                     disallow all
```

## How the pieces fit

Someone fills in `moving-future-intake.html` and presses Finish and send. The page
posts to Netlify Forms as the form named **moving-future**, with the full response
carried two ways: `readable` holds the markdown a human wants to read, and
`payload` holds base64-encoded JSON, including the questions it was answering, so
the reading room never goes stale when the instrument changes.

Netlify then runs `submission-created.mjs` by itself, purely because of the file
name, and it copies the submission into Netlify Blobs. Blobs is zero-configuration
storage: no provisioning, no token, no setting to switch on. That copy is what the
reading room reads, which is why the whole thing needs no credentials to keep
working.

`responses.mjs` serves two views. `view=status` says who has submitted, which
drives the tracker on the Moving Future tab. `view=full` returns everyone's
answers, and refuses unless the person asking has a submission of their own for
the same cycle.

It will read from the Netlify API as well, but only if `NETLIFY_API_TOKEN` happens
to be set, and it merges the two sources with the newest submission per person
winning. That is worth doing once if you want the responses that predate the
mirror, and worth nothing afterwards. A token expires, and every Netlify token is
invalidated if you ever reset your password, so anything that depends on one will
eventually break quietly. The mirror does not.

## Setup, in order

**1. Deploy.** New site from the repo. No build command. Publish directory `.`

**2. Turn on form detection.** Netlify UI, **Forms**, then **Enable form
detection**. This is off by default on new sites and it is the single most common
reason submissions vanish. It only applies to future deploys, so redeploy after
enabling it.

**3. Nothing.** There is no third step. No token, no environment variable. The
mirror and the store configure themselves.

To check the wiring at any time, open **/api/responses?view=diag**. It reports
which source is answering, how many records the mirror holds, how many payloads
decoded, and what to do next. It never returns anyone's answers.

If the only response predating the mirror is your own, the quickest fix is to open
the form and press Send an update: your draft is still in the browser, and the new
submission mirrors normally. Otherwise, to pull in responses submitted before the
mirror existed, set
`NETLIFY_API_TOKEN` in **Project configuration > Environment variables** using a
token from **Applications > Personal access tokens**. Set it in the Netlify UI
rather than `netlify.toml`, since functions cannot read variables declared in the
config file, keep **Functions** in the scope if your plan offers scopes, and start
a new deploy afterwards, because variables only apply to deploys made after they
are set. Remove it again once the backfill has been read; nothing else depends on
it.

**4. Turn on email notification.** **Forms > moving-future > Settings and usage >
Form notifications**, add an email notification. Each submission then arrives with
the readable markdown in the body. Point it at whoever is building the synthesis.

**5. Close the site.** See Access below.

Check it end to end by submitting a response yourself. It should appear in the
Forms tab, in the tracker on the Moving Future tab, and in the reading room.

## Access

The headers keep the site out of search results. That is not privacy, since the
URL still resolves for anyone who has it, including the `*.netlify.app` address.

Set real access control under **Project configuration > General > Visitor access >
Project visibility**. Three states: Public, Password, Private.

- **Private** is the right posture. Each person signs in with their own Netlify
  credentials and you invite them by email, so access can be revoked per person
  when someone leaves. On Free and Personal plans a private project is visible
  only to the Team Owner, so inviting the rest of the team requires Pro.
- **Password** is a single shared secret. Easier, but no per-person revocation.

Set the scope to **Production and previews**. "Previews only" leaves the live site
open to anyone.

This matters more now than it did before the form existed. Identity in the reading
room is asserted, not verified: someone picks their name from a list. That is
reasonable when the only people who can load the page are the four on the roster,
and unreasonable if the site is public. The site's access control is the real
boundary. The submit-first rule is a rule, not a lock.

## Who can read what

Everything a person writes becomes readable by everyone else on the roster once
they submit, including the four standing scores. Health is one of those scores.

If you ever want a private channel back, `PRIVATE_IDS` at the top of
`responses.mjs` takes a list of question ids and strips them server-side before
anything is returned. `"q19"` is the open-ended last question and `"scores"` is
the four measures. Withheld answers still reach whoever gets the notification
email, since that arrives before the function ever sees it.

## Editing

Display content comes from the `DATA` block at the top of the script in
`index.html`. The roster exists in two places that must match: `DATA.team` there,
and `ROSTER` in `responses.mjs`. Email is the key everything joins on.

- **Current cycle** — the first object in `DATA.cycles` with `status: "open"`.
  Dates are `YYYY-MM-DD`. The countdown reads from `due`.
- **Closing a cycle** — set `status: "complete"`, then add the next cycle at the
  top of the array with `status: "open"`. Cycle `id` must match the value in the
  form's cycle dropdown, which is where `cycle_id` on each submission comes from.
- **Roster changes** — edit both lists, then redeploy.
- **Links** — any `url: null` renders as *link not set*.
- **Records** — drop synthesis PDFs into `records/` and point a cycle's `docs`
  entry at the file.

## What the numbers mean

The form reports two things, because they answer different questions. **Answered**
counts questions engaged with at all, out of 23: seventeen bullet questions, the
three-horizon question, keep/start/stop, and the four standing scores. **Depth** is
how close the answers sit to the length each question suggests, so a question
asking for five points and given one reads as answered but thin. The carry-forward
table and the final open question are optional and count toward neither.

The tracker and the reading room show the answered figure. **What's left** in the
status bar lists exactly what is missing and what is thinner than suggested, so
the number never has to be guessed at.

The four score sliders sit at the midpoint until dragged and read **not set** until
then, since a slider that looks answered but isn't was the easiest way to lose four
units without noticing.

## The blob store

Records live under `moving-future` in Netlify Blobs, keyed `cycle-id/email`, so
`2026-07/chris@aspirean.com`. One record per person per cycle, overwritten when
someone sends an update. You can browse them under **Project configuration >
Blobs**. Deleting a record removes it from the reading room but not from the Forms
tab, which stays the system of record.

The mirror only fires for submissions made after it deploys, and only for
submissions Netlify has verified rather than flagged as spam.

## Data handling

Responses sit in Netlify's submission database until someone deletes them. They
contain candid personal material. Netlify's own guidance for forms carrying
personal information is to export and delete on a schedule rather than let it
accumulate, which is worth doing after each cycle's discussion: download the CSV,
file it with the cycle records, then delete the submissions. Brad has the call on
what counts as a firm record and how long it needs to be kept.

Since the mirror exists, the answers live in two places. Clearing the Forms tab
does not clear the blob store and clearing the blob store does not clear the Forms
tab, so a cycle is only actually cleaned up when you have done both. The reading
room reads from Blobs, so that is the one that controls what the team can still
see.
