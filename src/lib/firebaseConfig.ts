import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDFH64LDmuFQFQLaoLk4vBFcGKnpM-0ZDc',
  authDomain: 'save-our-supper.firebaseapp.com',
  projectId: 'save-our-supper',
  storageBucket: 'save-our-supper.firebasestorage.app',
  messagingSenderId: '263838534519',
  appId: '1:263838534519:web:1e5c8680e857c26170af72',
  measurementId: 'G-P7TQ0PDQZR',
};

const app = initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
export const db = getFirestore(app);
