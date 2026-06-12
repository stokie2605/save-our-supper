import { useState, useEffect } from 'react';
import { db } from '../lib/firebaseConfig'; // Pointed to your existing firebase initialization path
import { supabase } from '../lib/supabase'; // Matched perfectly to your App.tsx path
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Session } from '@supabase/supabase-js'; // Imported explicit types for the auth listener

interface Post {
  id: string;
  title: string;
  category: string;
  postcode: string;
  status: 'available' | 'claimed' | 'completed';
}

export default function AdminPanel() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  
  const ADMIN_EMAIL = 'stokie2605@gmail.com';

  useEffect(() => {
    const checkUserSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAdmin(session?.user?.email === ADMIN_EMAIL);
    };

    checkUserSession();

    // Explicitly typed the params to fix the ts(7006) 'any' errors
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setIsAdmin(session?.user?.email === ADMIN_EMAIL);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    // Double check that 'db' is correctly exported from your firebase setup
    const postsRef = collection(db, 'posts');
    const unsubscribe = onSnapshot(postsRef, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];
      
      setPosts(postsData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore read blocked or failed:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const handleStatusChange = async (postId: string, newStatus: Post['status']) => {
    try {
      const postDocRef = doc(db, 'posts', postId);
      await updateDoc(postDocRef, { status: newStatus });
    } catch (error) {
      alert("Database mutation rejected by security rules: " + error);
    }
  };

  const handleDeletePost = async (postId: string, title: string) => {
    if (window.confirm(`Are you absolutely sure you want to permanently delete "${title}"?`)) {
      try {
        const postDocRef = doc(db, 'posts', postId);
        await deleteDoc(postDocRef);
      } catch (error) {
        alert("Database deletion rejected by security rules: " + error);
      }
    }
  };

  if (isAdmin === false) {
    return (
      <div className="p-8 text-center max-w-md mx-auto my-12 bg-red-50 border border-red-200 rounded-xl shadow-sm">
        <h2 className="text-xl font-bold text-red-700 mb-2">Access Denied</h2>
        <p className="text-sm text-red-600">Administrator privileges are required to view this management console.</p>
      </div>
    );
  }

  if (loading && isAdmin === true) {
    return <div className="p-8 text-center text-gray-500 font-medium">Loading master admin registry...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 my-6">
      <div className="mb-6 flex justify-between items-center border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Administration</h1>
          <p className="text-sm text-gray-500">Global CRUD management dashboard for local food inventory</p>
        </div>
        <span className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-200">
          Secure Server Guard Active
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-3">Listing Title</th>
              <th className="px-6 py-3">Category</th>
              <th className="px-6 py-3">Postcode</th>
              <th className="px-6 py-3">Lifecycle Status</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 text-gray-700">
            {posts.map((post) => (
              <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-semibold text-gray-900">{post.title}</td>
                <td className="px-6 py-4 capitalize text-gray-600">{post.category}</td>
                <td className="px-6 py-4 uppercase font-mono text-xs text-gray-500">{post.postcode}</td>
                <td className="px-6 py-4">
                  <select
                    value={post.status || 'available'}
                    onChange={(e) => handleStatusChange(post.id, e.target.value as Post['status'])}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-1.5 font-medium"
                  >
                    <option value="available">Available</option>
                    <option value="claimed">Claimed</option>
                    <option value="completed">Completed</option>
                  </select>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleDeletePost(post.id, post.title)}
                    className="text-red-600 hover:text-red-900 font-semibold text-xs bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md border border-red-200 transition-colors"
                  >
                    Delete Post
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}