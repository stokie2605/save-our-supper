import { FoodCard } from './FoodCard';
import type { Post } from '../lib/posts';

interface FoodFeedProps {
  posts: Post[];
  loading: boolean;
  error?: string | null;
  currentUserId?: string;
  onReservePost: (postId: string) => void;
}

export function FoodFeed({ posts, loading, error, currentUserId, onReservePost }: FoodFeedProps) {
  if (loading) {
    return <div className="text-center py-12 text-slate-400 font-medium">Loading live feed...</div>;
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl text-center py-12 px-4">
        <p className="text-red-600 font-semibold">Could not load the live food feed.</p>
        <p className="text-slate-400 text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-white border border-dashed border-slate-300 rounded-2xl text-center py-16 px-4">
        <p className="text-slate-400 font-medium text-lg">No active food posts found.</p>
        <p className="text-slate-400 text-sm mt-1">Your connection to Supabase is active and waiting for data.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <FoodCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          onReserve={onReservePost}
        />
      ))}
    </div>
  );
}
