// Firebase web config for online multiplayer.
//
// These values are PUBLIC BY DESIGN — every Firebase web app ships them in its
// client JavaScript. Access is controlled by Realtime Database security rules,
// not by keeping these secret, so it is safe to commit them.
//
// The `databaseURL` field is required — it appears once Realtime Database is
// enabled for the project. When it is present, online mode uses Firebase for
// real cross-device play; otherwise it falls back to a same-device, cross-tab
// backend so the feature stays playable/testable on one machine.
export const firebaseConfig = {
  apiKey: "AIzaSyCbM9w9jsdUh3hqdavErxTxjfc3zPm2LAY",
  authDomain: "battleship-ahmetcan.firebaseapp.com",
  databaseURL: "https://battleship-ahmetcan-default-rtdb.firebaseio.com",
  projectId: "battleship-ahmetcan",
  storageBucket: "battleship-ahmetcan.firebasestorage.app",
  messagingSenderId: "979224246573",
  appId: "1:979224246573:web:e7feff43f88b353891bba4",
  measurementId: "G-9VG8XQWN8C",
};
