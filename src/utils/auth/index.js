import { useAuth, useRequireAuth } from './useAuth';
export { useUser } from './useUser';
import { initializeApp } from 'firebase/app';

// Paste your config object here
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// You can now import and use other Firebase services, e.g., import { getFirestore } from 'firebase/firestore';

export { useAuth, useRequireAuth };
export default useAuth;