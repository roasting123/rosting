// scripts/seed.mjs — populate a few demo posts + roasts for testing.
//
// Usage:
//   1. Fill .env (or copy from .env.example).
//   2. Have the Firebase emulators running OR point at your real project.
//   3. `npm run seed`
//
// SECURITY: the Firebase Web SDK API key is public and safe to embed, but
// seeding writes to your actual Firestore. Run against the Firestore emulator
// (set FIRESTORE_EMULATOR_HOST=localhost:8080) unless you really want this
// in production.

import { initializeApp } from 'firebase/app'
import {
  getFirestore, collection, addDoc, doc, setDoc, serverTimestamp
} from 'firebase/firestore'

const cfg = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
}
const app = initializeApp(cfg)
const db = getFirestore(app)

const USERS = [
  { id: 'seed-rahul',  username: 'Rahul_Meme',      avatarColor: '#1f3a6e', verified: true  },
  { id: 'seed-priya',  username: 'Priya_Chaos',     avatarColor: '#3a1a5e', verified: false },
  { id: 'seed-ankit',  username: 'Ankit_Bhai',      avatarColor: '#0f3a20', verified: true  },
  { id: 'seed-ravi',   username: 'SavageRavi',      avatarColor: '#7a3a00', verified: false },
  { id: 'seed-king',   username: 'RoastKing99',     avatarColor: '#1f3a6e', verified: false },
  { id: 'seed-desi',   username: 'DesiComedian',    avatarColor: '#2a0a2e', verified: false },
  { id: 'seed-bomb',   username: 'LaughterBomb',    avatarColor: '#1a3a1a', verified: false },
  { id: 'seed-pun',    username: 'PunMaster_07',    avatarColor: '#1a1a3e', verified: false },
  { id: 'seed-fire',   username: 'FireRoaster',     avatarColor: '#3a1010', verified: true  },
  { id: 'seed-shyam',  username: 'Savage_Shyam',    avatarColor: '#1a2e3a', verified: false },
  { id: 'seed-meme',   username: 'MemeKing',        avatarColor: '#2e2a00', verified: false }
]

async function ensureUsers() {
  for (const u of USERS) {
    await setDoc(doc(db, 'users', u.id), {
      username: u.username,
      avatarColor: u.avatarColor,
      verified: u.verified,
      followerIds: [],
      createdAt: serverTimestamp()
    })
  }
  console.log(`✓ seeded ${USERS.length} users`)
}

const POSTS = [
  {
    id: 'seed-post-1',
    owner: 'seed-rahul', caption: "Bro's 'professional' photoshoot 😭",
    likes: 312, fireCount: 47, shareCount: 23, roastCount: 3,
    minutesAgo: 120
  },
  {
    id: 'seed-post-2',
    owner: 'seed-priya', caption: 'Gym selfie gone very wrong 💪',
    likes: 178, fireCount: 23, shareCount: 11, roastCount: 2,
    minutesAgo: 300
  },
  {
    id: 'seed-post-3',
    owner: 'seed-ankit', caption: "What even happened at my friend's wedding 🎉",
    likes: 521, fireCount: 89, shareCount: 34, roastCount: 3,
    minutesAgo: 60 * 26
  }
]

const ROASTS = {
  'seed-post-1': [
    { user: 'seed-ravi', upvotes: 89, text: '"Not a helmet — that\'s a pressure cooker on his head. His food is gone and so is the photo 💀"' },
    { user: 'seed-king', upvotes: 67, text: '"Photographer said smile — and he actually started crying 😂"' },
    { user: 'seed-desi', upvotes: 45, text: '"Even the cow in the background is judging him 🐄"' }
  ],
  'seed-post-2': [
    { user: 'seed-bomb', upvotes: 61, text: '"He won\'t lift dumbbells, but he invested in a selfie stick. Muscles aren\'t growing — only the filters are 😂"' },
    { user: 'seed-pun',  upvotes: 38, text: '"Posed hard in front of the mirror — and the mirror clapped back straight to his face 😭"' }
  ],
  'seed-post-3': [
    { user: 'seed-fire',  upvotes: 143, text: '"Groom\'s staring at the camera, this guy\'s staring at the bride, and the bride is staring at the exit 👀"' },
    { user: 'seed-shyam', upvotes: 97,  text: '"He isn\'t happy about the wedding — he\'s just tracking the bride\'s delivery like a parcel, bro 😂"' },
    { user: 'seed-meme',  upvotes: 74,  text: '"Photographer took a group photo and this guy stood at a weird angle in the frame like a detective 🕵️"' }
  ]
}

async function ensurePosts() {
  for (const p of POSTS) {
    const owner = USERS.find(u => u.id === p.owner)
    const ref = doc(db, 'posts', p.id)
    const createdAt = new Date(Date.now() - p.minutesAgo * 60 * 1000)
    await setDoc(ref, {
      imageUrl: null,            // no real image — UI shows emoji fallback
      caption: p.caption,
      userId: owner.id,
      username: owner.username,
      userAvatarColor: owner.avatarColor,
      userVerified: owner.verified,
      likes: p.likes,
      fireCount: p.fireCount,
      shareCount: p.shareCount,
      roastCount: p.roastCount,
      rank: null,
      createdAt                  // serverTimestamp() is recommended in prod;
                                 // a fixed Date is fine for seeding demos.
    })
    // Seed roasts subcollection.
    for (const r of (ROASTS[p.id] || [])) {
      const u = USERS.find(x => x.id === r.user)
      await addDoc(collection(db, 'posts', p.id, 'roasts'), {
        text: r.text,
        userId: u.id,
        username: u.username,
        userAvatarColor: u.avatarColor,
        upvotes: r.upvotes,
        createdAt
      })
    }
  }
  console.log(`✓ seeded ${POSTS.length} posts + roasts`)
}

await ensureUsers()
await ensurePosts()
console.log('Done.')
process.exit(0)
