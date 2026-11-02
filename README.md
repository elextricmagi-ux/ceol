# Chordstand

Personal chord-sheet app: search your library, transpose, capo, autoscroll, favorites, setlists.
Installs to the home screen on Pixel and iPad. No build step, no dependencies: it's static files.

## 1. Put it online (about 5 minutes)

1. Create a new GitHub repo and upload everything in this folder (keep the `icons` folder).
2. Go to Netlify (or Vercel, or GitHub Pages) and import that repo. Build command: none. Publish directory: the repo root.
3. Open your new https URL on each device.

## 2. Install it like an app

- **iPad:** open the URL in Safari, tap Share, then Add to Home Screen.
- **Pixel:** open the URL in Chrome, tap the menu (three dots), then Install app.

## 3. Add songs

Copy the chart text from any chord site and paste it into Add song. Chordstand cleans up the
formatting, fills in title and artist when it can, estimates the key, and stores it in your library.
It understands chords-above-lyrics and ChordPro `[C]inline` styles.

Tap any chord in a song to see fingerings. You get up to six voicings, from open shapes to barre
chords higher up the neck, drawn as diagrams for standard tuning. They follow your transpose and capo
settings, so you always see the shapes you're actually playing. Voicings are computed from the chord's
notes (and checked against them), so unusual chords like `F#m7b5`, `Dsus2` or `G/B` work too.

Pixel shortcut: on a chord site, select the chart text and choose Share, then Chordstand.
(Sharing a page link only passes the link, not the chart.)

## 4. Optional: sync between devices (free)

Your library is stored on each device by default. To sync:

1. Create a free project at supabase.com.
2. In the SQL editor, run:

```sql
create table library (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table library enable row level security;
create policy "own row" on library for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

3. Authentication, then Users, then Add user. Enter your email and a password and tick Auto Confirm User.
4. Project Settings, then API: copy the Project URL and the `anon public` key.
5. In Chordstand on each device: Settings, Sync, paste URL and key, enter the email and password, Sign in and sync.

The anon key is designed to be public. Row-level security means only your signed-in account can read your row.
Edits sync a few seconds after you make them and whenever you reopen the app. If two devices edit the same
song, the newest edit wins.

## Updating the app

Edit `index.html`, push to GitHub, and bump `V` in `sw.js` (for example `chordstand-v2`) so devices pick it up.
