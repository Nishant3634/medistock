// firebase-config.js — MediStock Pro
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDaMf3KjBlHcCAYHLujIcQXCYfWls7b6wg",
  authDomain: "medistock-b5f51.firebaseapp.com",
  projectId: "medistock-b5f51",
  storageBucket: "medistock-b5f51.firebasestorage.app",
  messagingSenderId: "1084685857067",
  appId: "1:1084685857067:web:b2d344bef22655d32d156e",
  measurementId: "G-JM6MQVWBSH"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
