# RoastBoard 🔥

A dark, mobile-first social feed where users upload a photo and the community roasts it.
Built as a React (Vite) + Firebase + Cloudinary app, recreating the static
`roastboard_scroll_feed.html` prototype as a real multi-user product.

## Stack
- **Frontend**: React 18 + Vite, plain CSS (ported from the prototype), React Router
- **Auth / DB / Hosting**: Firebase (Firestore Native mode, Firebase Auth, Firebase Hosting)
- **Image hosting**: Cloudinary (unsigned upload preset — **never** expose the API secret client-side)
- **Icons**: `tabler-icons` (CDN font in `index.css`)

## Setup

### 1. Install
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` → `.env` and fill in the values. The repo ships with the
public Firebase web config + Cloudinary cloud name + unsigned preset already
filled in (these are safe to expose). `.env` is gitignored.

```env
VITE_CLOUDINARY_CLOUD_NAME=iwc15fis
VITE_CLOUDINARY_UPLOAD_PRESET=ml_default
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

### 3. Enable Firebase services
In the [Firebase console](https://console.firebase.google.com/) for project
`roaster-c61e7`:
- **Authentication → Sign-in method**: enable *Email/Password* and *Google*.
- **Firestore → Create database**: start in *Native mode*, pick a region.

### 4. Configure Cloudinary
In your Cloudinary account, create an **unsigned** upload preset named
`ml_default` (or change `VITE_CLOUDINARY_UPLOAD_PRESET` to match yours).
The cloud name is `iwc15fis`.

> **Security**: the *API secret* is **not** shipped to the browser. If you
> later need signed uploads or to delete images from the server, deploy a
> Cloud Function (see `functions/index.js`) that holds `CLOUDINARY_API_KEY` +
> `CLOUDINARY_API_SECRET` in its environment configuration.

### 5. Deploy Firestore rules
```bash
npm i -g firebase-tools
firebase login
firebase use --add   # pick roaster-c61e7
firebase deploy --only firestore:rules
```

### 6. Run locally
```bash
npm run dev
# → http://localhost:5173
```

### 7. Optional: seed demo posts
```bash
npm run seed
# (writes directly to Firestore — point at the emulator to avoid polluting prod)
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed
```

### 8. Deploy
```bash
npm run build
firebase deploy --only hosting
```

## Project structure
```
src/
  App.jsx                   # routes
  main.jsx                  # React entry
  firebase.js               # initializeApp + auth/db
  cloudinary.js             # unsigned upload helper
  utils.js                  # timeAgo, colorFromString, initialsFromName
  context/AuthContext.jsx   # Firebase auth state + profile mirror
  services/db.js            # all Firestore reads/writes (posts, roasts, likes)
  components/
    BottomNav.jsx
    TopBar.jsx
    FilterChips.jsx
    LoginModal.jsx
    PostCard.jsx            # feed card (image, vote bar, top-3 roasts, write box)
  pages/
    HomePage.jsx
    ExplorePage.jsx
    LeaderboardPage.jsx
    ProfilePage.jsx
    UploadPage.jsx
    AuthPage.jsx
  styles/global.css         # all UI (ported from the prototype)
firebase/
  firestore.rules
functions/index.js          # nightly rank recompute + sample signed-delete
scripts/seed.mjs
```

## Data model
- `posts/{postId}` — `{ imageUrl, caption, userId, username, userAvatarColor, userVerified, likes, fireCount, shareCount, roastCount, rank, createdAt }`
- `posts/{postId}/roasts/{roastId}` — `{ text, userId, username, userAvatarColor, upvotes, createdAt }`
- `posts/{postId}/roasts/{roastId}/upvoters/{userId}` — presence = "this user upvoted"
- `posts/{postId}/likes/{userId}` — presence = "this user liked the post"
- `users/{userId}` — `{ username, avatarColor, verified, followerIds[] }`
- `users/{userId}/userLikes/{postId}` — mirror of likes for "my likes" feeds

## Security rules
Anyone can read; only signed-in users can create posts/roasts; users can only
edit/delete their own content; like/upvote counters are kept consistent by
client-side **transactions** in `services/db.js` (see `toggleLike` +
`toggleRoastUpvote`) — these read the existing state inside a transaction
so concurrent writes can't double-count or lose a vote.

## Rank badges
`PostCard` computes the rank client-side from the visible feed
(`#1 today` / `#1 this week` / `Going viral` / `New`). For a production
deployment, `functions/index.js` shows a scheduled Cloud Function that
recomputes and writes `rank` fields every 30 min, so the badge is fast
even on huge feeds.

## Security note
- The **Cloudinary API secret is never in the frontend**. Only the cloud
  name + unsigned upload preset are used in the browser. Anything that
  needs the secret (signed uploads, server-side deletes) lives in a
  Cloud Function with the secret in its runtime env config.
- The Firebase web API key is also public (it's a project identifier
  bound to the authorized domain) — security is enforced by Firestore
  rules, not by hiding the key.
