import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Observation } from '../types';

export const useObservations = (userId: string | undefined, isAdmin: boolean) => {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setObservations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Base query: only non-deleted observations
    let q = query(
      collection(db, 'observations'),
      where('isDeletedByCreator', '==', false),
      orderBy('capturedAt', 'desc'),
      limit(100)
    );

    // If not admin, only show user's own observations
    if (!isAdmin) {
      q = query(
        collection(db, 'observations'),
        where('userId', '==', userId),
        where('isDeletedByCreator', '==', false),
        orderBy('capturedAt', 'desc'),
        limit(100)
      );
    }

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const obsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Observation[];
        setObservations(obsData);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching observations:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, isAdmin]);

  return { observations, loading, error };
};
