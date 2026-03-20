import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAAUp2wzRadRZ_mVVcb4yqE1yt32Sa9pKE",
  authDomain: "work-tracker-bf5e2.firebaseapp.com",
  projectId: "work-tracker-bf5e2",
  storageBucket: "work-tracker-bf5e2.firebasestorage.app",
  messagingSenderId: "139520447155",
  appId: "1:139520447155:web:dfcb736fa618a04ef716c6"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
