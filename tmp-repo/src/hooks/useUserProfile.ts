import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';

export const useUserProfile = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Listen for profile changes
        const unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), 
          async (snapshot) => {
            if (snapshot.exists()) {
              setProfile(snapshot.data() as UserProfile);
              setLoading(false);
            } else {
              // Create default profile for new user
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || (firebaseUser.isAnonymous ? 'invite@local' : ''),
                displayName: firebaseUser.displayName || (firebaseUser.isAnonymous ? 'Invité' : 'Utilisateur'),
                role: 'viewer', // changed to viewer to match App logic
                accessStatus: firebaseUser.isAnonymous ? 'approved' : 'pending',
                status: firebaseUser.isAnonymous ? 'approved' : 'pending',
                createdAt: serverTimestamp(),
              };
              await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
              setProfile(newProfile);
              setLoading(false);
            }
          },
          (err) => {
            console.error("Error fetching user profile:", err);
            setError(err.message);
            setLoading(false);
          }
        );

        return () => unsubscribeProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return { user, profile, loading, error };
};
