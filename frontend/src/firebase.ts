import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCEKi_-ZSslSkCaIyiJGsyTMD5xgj9fgkY",
  authDomain: "icac-1e15d.firebaseapp.com",
  projectId: "icac-1e15d",
  storageBucket: "icac-1e15d.firebasestorage.app",
  messagingSenderId: "617985987088",
  appId: "1:617985987088:web:ac55c58b94a47b3578f095",
  measurementId: "G-GNPTCRNL3X"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export default app;
