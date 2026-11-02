# Ceol

Personal chord and tab player: search, transpose, capo, autoscroll, metronome, tap-for-fingerings,
and your own lists. Installs to the home screen on Pixel and iPad. No build step: it's static files.

## 1. Put it online

Upload these files to the root of your GitHub repo (no folders needed): `index.html`, `sw.js`,
`manifest.webmanifest` and the four `.png` icons. Then turn on GitHub Pages (Settings, Pages, branch
`main`, folder `/ (root)`). Your app lives at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

Install it: on iPad open it in Safari, tap Share, then Add to Home Screen. On Pixel open it in Chrome,
tap the menu, then Install app. If you installed it under the old name, remove the old icon and add it
again to pick up the name Ceol. Your songs carry over.

## 2. Using it

- **Search** the box on the library screen searches your own songs. If nothing matches and online search
  is connected (section 4), a button searches Ultimate Guitar. Results are grouped by song with all
  versions underneath, and Load more keeps going through further pages. The filter at the top has All,
  Chords and Tabs, each with a count. All is the default and shows both formats together, each labelled,
  so a song that has chords and a tab shows as one entry. Ceol remembers your choice. If the format you
  pick has nothing on the first page, Ceol checks a few more pages by itself, then offers Load more and
  tells you what else it found (for example Pro or Official tabs, which can't be opened here).
- **Chords** tap any chord to see up to six fingerings (open shapes and barre shapes). They follow your
  transpose and capo.
- **Tabs** show with the string names pinned and the tab scrolling sideways. Tabs are shown as written:
  transpose and capo change chord names only.
- **Controls** the buttons along the top (Key, Capo, Aa, tempo, Spotify) each open a banner at the bottom
  when you tap them. Tap the same button again to hide it, or tap another to swap. The bottom of the
  screen is otherwise just the autoscroll play button and speed.
- **Tempo** when you open a song that has no tempo yet, Ceol looks one up by itself (needs the relay,
  section 4). The tempo button reads Finding BPM... and then shows the number, with a note that it was
  filled in automatically. A tempo written in the chart (for example "Tempo: 96") is used instead and
  nothing is looked up. It only looks once per song, never overwrites a tempo you typed, and never opens
  tabs on its own. If nothing is found the button just says Set BPM.
- **Metronome** tap the tempo button to open it. Type a tempo, tap it in, or use Find BPM to try the lookup
  again. If that finds nothing either (or the relay isn't connected), Find BPM opens a Google search for
  "song artist bpm" in a new tab, and the BPM box is ready for you to type the number in. Pick a time
  signature.
- **Metronome and music** "Play with music" (on by default) lets the click play over Spotify or other
  music, on both iPad and Pixel. On iPad this means the silent switch mutes the click, so flip it off
  or untick the box to play over silent mode (which may pause your music). If you leave the app and come
  back and the click has stopped, tap start again.
- **Lists** tap the list button in the player to add a song to Favourites or any list you make, such as
  To learn or Pub favourites. Lists show as buttons on the library screen, where you can rename,
  delete and reorder them. Open a song from a list and you get next and previous buttons.
- **Open in Spotify** opens the song's page in the Spotify app, one tap from playing. See section 5.
- **Adding by hand** Add song takes pasted chart text (chords above lyrics, or ChordPro). On Pixel you
  can select chart text on a website and Share it to Ceol.

## 3. Optional: sync between devices (free)

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

3. Authentication, then Users, then Add user. Enter an email and password and tick Auto Confirm User.
4. Project Settings, then API: copy the Project URL and the `anon public` key.
5. In Ceol on each device: Settings, Sync. Paste the URL and key, enter the email and password, and
   tap Sign in and sync.

## 4. Optional: online search (Cloudflare Worker, free)

Browsers won't let a web app call other sites directly, so Ceol talks to a tiny private relay that only
your app can use. It fetches one page when you tap, and caches pages so repeat opens don't hit the site
again. Use it within whatever permission you have from the site.

1. At cloudflare.com (free) open Workers & Pages, then Create, then Create Worker. Name it (for example
   `ceol-relay`) and Deploy.
2. Click Edit code, delete what's there, paste in all of `worker.js`, and Deploy.
3. In the Worker's Settings, Variables and Secrets, add:
   - `ACCESS_KEY` (Secret): a long random password you make up.
   - `ALLOWED_ORIGIN` (Text): `https://YOUR-USERNAME.github.io` with no path and no trailing slash.
4. In Ceol: Settings, Online search. Paste the Worker address (it ends in `.workers.dev`) and the access
   key, then tap Save and test.

When `worker.js` changes in a later update, open the Worker, Edit code, paste the new version over the
old one, and Deploy. Your settings stay. If Cloudflare shows the code as read-only, use the version
dropdown at the top to pick the latest version. To check you have the current copy, tap Save and test in
Ceol's Settings: it says Connected when the relay is current (version 4) and says it's out of date
otherwise. An
out-of-date relay can't show tabs or the All filter, and Ceol warns you on the results screen too.

## 5. Optional: Spotify and tempo

These need two extra Worker settings and a free Spotify developer app.

1. Go to developer.spotify.com/dashboard, log in, and create an app. Any name works. For the redirect
   address enter `http://127.0.0.1:3000` (it isn't used). Tick Web API.
2. Open the app's settings and copy the Client ID and Client secret.
3. In your Worker's Variables and Secrets add `SPOTIFY_CLIENT_ID` (Text) and `SPOTIFY_CLIENT_SECRET`
   (Secret), then Deploy.

How it behaves:

- Open in Spotify finds the exact track in the background when you open a song, then launches it in the
  Spotify app. Spotify doesn't let a web app start playback by itself, so you tap play once. If the
  track hasn't been found yet, it opens a Spotify search instead.
- Tempo lookup does not need Spotify. The relay first asks Deezer's public catalogue, which needs no key.
  If you've set Spotify up it also tries a Spotify-based audio-features service as a second source.
  Neither is guaranteed: some songs have no tempo listed, and listed tempos are sometimes half or double
  the feel of the song. Treat any result as a starting point and check it by ear, or tap the tempo in
  yourself. Tempo written in a chart is picked up automatically when you add a song. Tempo written in a chart (for example
  "Tempo: 96") is picked up automatically when you add a song.

## Keeping every device on the newest version

Ceol now loads its newest copy whenever you open it with a connection, and falls back to the saved copy
when you're offline. Settings has a This device section that shows the build number and an Update app
button. If one device behaves differently from another, compare the build numbers first. Update app clears
that device's saved copy of Ceol and loads the newest one. Your songs and settings are kept.

If a device's Settings screen has no This device section, it is still running an older copy. Remove the
Ceol icon from the home screen and add it again (on iPad: open the site in Safari, tap Share, then Add to
Home Screen). If it still looks old, on iPad go to Settings, Safari, Advanced, Website Data, find the site
and remove it, then add it again.

## Updating the app

Edit `index.html`, push to GitHub, and bump `V` in `sw.js` (for example `ceol-v6`) so devices pick up the
new version. Close and reopen the app twice.
