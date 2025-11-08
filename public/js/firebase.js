// public/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, setDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: (typeof FIREBASE_API_KEY !== 'undefined') ? FIREBASE_API_KEY : "AIzaSyC7cAN-mrE2PvmlQ11zLKAdHBhN7nUFjHw",
  authDomain: (typeof FIREBASE_AUTH_DOMAIN !== 'undefined') ? FIREBASE_AUTH_DOMAIN : "fir-u-c-students-web.firebaseapp.com",
  projectId: (typeof FIREBASE_PROJECT_ID !== 'undefined') ? FIREBASE_PROJECT_ID : "fir-u-c-students-web",
  storageBucket: (typeof FIREBASE_STORAGE_BUCKET !== 'undefined') ? FIREBASE_STORAGE_BUCKET : "fir-u-c-students-web.firebasestorage.app",
  messagingSenderId: (typeof FIREBASE_MESSAGING_SENDER_ID !== 'undefined') ? FIREBASE_MESSAGING_SENDER_ID : "113569186739",
  appId: (typeof FIREBASE_APP_ID !== 'undefined') ? FIREBASE_APP_ID : "1:113569186739:web:d8daf21059f43a79e841c6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);

export async function googleLogin() { await signInWithPopup(auth, provider); }
export async function googleLogout() { await signOut(auth); }
export function onAuth(cb) { onAuthStateChanged(auth, cb); }
