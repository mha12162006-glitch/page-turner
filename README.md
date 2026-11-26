# Manhwa Tracker

A small personal tracking app for manhwa, manga and manhua. Track reading
status and chapters, organise a custom list order, share a read-only link,
add friends, recommend series, and collect translator recommendations.

## Features

- Reading status tabs, hype stars, priority picks, chapters and reviews.
- Recently added by default, with a **Recently added / Custom order** switch.
  Dragging a card or using the ↑ ↓ buttons saves `position` and switches to
  Custom order automatically.
- AniList search for synopsis, cover, genres and characters. **Reading links
  are never auto-filled** — you add your own http(s) link in the drawer.
- Trigger warnings, genres and tropes with permanent custom chips.
- Spoiler blur for reviews, friend notes and spoiler-tagged comments.
- Friend requests, friend lists with live status filters, outgoing and
  incoming recommendations, and hidden series.
- Private or shared footnotes (`series_notes`).
- Translator recommendations shared between accepted friends.
- Installable PWA with an offline-capable service worker.

## Setup

### 1. Install and run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`).

### 2. Configure Supabase

1. Create a Supabase project.
2. In **Project Settings → API**, copy the **Project URL** and the
   **publishable (anon) key**.
3. Copy `public/config.js.example` to `public/config.js` if you do not already
   have one, then fill in:

   ```js
   window.MT_CONFIG = {
     SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
     SUPABASE_KEY: "YOUR_PUBLISHABLE_KEY"
   };
   ```

   `public/config.js` is intentionally not bundled by Vite so the same build
   can be deployed to different projects. It is git-ignored if your checkout
   includes one.
4. Enable email sign-up in **Authentication → Providers**. For a private app,
   turn off "Allow new users to sign up" after creating your accounts.
5. Add your deployed domain (and `http://localhost:5173` for development) to
   **Authentication → URL Configuration → Redirect URLs**.

### 3. SQL run order

Run each file once in **Supabase → SQL Editor → New query**, in this order.
All files are safe to re-run.

| Order | File | Purpose |
| ----- | ---- | ------- |
| 00 | `schema.sql` | Base tables, columns, RLS and realtime publication for a fresh project. If you have an older database that already had characters, `stage2.sql` is also safe to run. |
| 01 | `supabase/01_reconcile_and_fix.sql` | Reconciles older schemas and installs the friend-only RLS/privacy policies (`is_hidden`, accepted-friend checks). This is the privacy migration: it replaces all policies on profiles, series, characters, friendships and recommendations. |
| 02 | `supabase/03_translator_recs.sql` | Translator recommendations table, RLS, uniqueness and realtime. Safe to run before the frontend deploy; older frontends ignore it. |
| 03 | **Deploy the frontend first**, then run `supabase/02_after_frontend_deploy.sql` | Moves footnotes into `public.series_notes` and drops `public.series.notes`. **Must be last** because the final step removes the old column that the previous frontend still writes to. |

If you applied a separate privacy migration in an earlier stage, re-run
`01_reconcile_and_fix.sql` afterwards: it drops and recreates the policies, so
the strict friend/hidden rules are guaranteed to be in place.

Enable Realtime for the tables if you want live updates across tabs/devices:
`series`, `series_notes`, `friendships`, `recommendations` and
`translator_recs`. The SQL files add them to the `supabase_realtime`
publication where possible.

## Deployment

1. Set `public/config.js` to the production Supabase URL and publishable key.
2. Build:

   ```bash
   npm run build
   ```

   The output is in `dist/`. The warning about `config.js` not being bundled
   is expected — the file is copied as-is so configuration can stay
   environment-specific.

3. Upload the **contents** of `dist/` to your static host (Netlify, Vercel,
   GitHub Pages, Cloudflare Pages, etc.). For a subpath deployment, Vite's
   relative `base` and the `%BASE_URL%` links in `index.html` keep assets,
   manifest and service worker scoped correctly.
4. Ensure `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`,
   `icon-maskable-512.png` and `apple-touch-icon.png` are served from the site
   root with `Content-Type: application/manifest+json` for the manifest and
   `application/javascript` for the service worker.
5. After the new frontend is live, run
   `supabase/02_after_frontend_deploy.sql` if you have not run it yet.
6. **Service worker updates:** `public/sw.js` has a `VERSION` constant. Bump it
   for every deploy (e.g. `v2` → `v3`). The install handler deletes older
   `manhwa-tracker-v*` caches, so returning visitors get the new build on the
   next page load. Verify installability with Lighthouse (PWA category) and
   confirm a second load fetches the new assets.

## Accessibility

- `Esc` closes the drawer and every dialog; focus moves into the overlay on
  open and returns to the button that opened it on close.
- `Tab` is trapped inside the open overlay and `aria-modal="true"` plus a
  descriptive `aria-label` are set on each panel.
- Icon-only controls (close, move up/down, withdraw, add/remove custom chip,
  edit/delete translator entry) have `aria-label`s.
- Card reordering works with mouse drag on desktop and explicit ↑ ↓ buttons
  on touch devices.

## Testing

```bash
npm test        # unit tests
npm run build   # production build
```

The browser smoke harness lives in the temporary verification folder used
during development (`stage7-smoke.cjs` and the Stage 8 three-account harness).
It mocks Supabase and AniList in the browser, so no real account is touched.

## List ordering

The default order is **Recently added** (`created_at` descending). The
**Order** selector next to the filters lets you switch back and forth:

- **Recently added** — newest series first, regardless of `position`.
- **Custom order** — your saved `position` order.

Dragging a card or pressing a card's ↑ ↓ button writes the new `position`
values to `public.series` and switches the selector to Custom order, so your
manual arrangement is never overwritten by a later reload.

## Privacy notes

- Hidden series are filtered out of every friend-facing view, friend status
  filters, recommendations and share links.
- Friend recommendations are only visible to the sender and recipient.
- Translator recommendations follow the visibility of their parent series and
  are never exposed to public share links.
- Footnotes are shared with friends by default; switch off "Visible to
  friends" in the drawer to keep an individual footnote private. Public share
  links never show footnotes.
