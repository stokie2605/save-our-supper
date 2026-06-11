import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface Post {
  id: string;
  title: string;
  description: string | null;
  quantity: string;
  expiry_time: string;
  postcode: string;
  lat: number;
  lon: number;
  status: 'available' | 'reserved' | 'claimed' | 'collected';
  donor_id: string;
  receiver_id: string | null;
  created_at: string;
  category?: string;
  urgency?: string;
  board_type?: 'citizen_post' | 'foodbank_broadcast';
}

type PostWithOptionalExpiresAt = Post & {
  expires_at?: string | null;
};

export interface Coordinates {
  lat: number;
  lon: number;
}

export const defaultHubCoordinates: Coordinates = {
  lat: 53.0960000,
  lon: -2.3060000,
};

export async function getCoordinatesFromPostcode(postcode: string): Promise<Coordinates> {
  const cleanPostcode = postcode.trim().replace(/\s+/g, '').toUpperCase();

  if (!cleanPostcode) {
    return defaultHubCoordinates;
  }

  const endpointType = cleanPostcode.length <= 4 ? 'outcodes' : 'postcodes';

  try {
    const response = await fetch(
      `https://api.postcodes.io/${endpointType}/${encodeURIComponent(cleanPostcode)}`,
    );
    const payload = await response.json();

    if (!response.ok || payload.status !== 200 || !payload.result) {
      return defaultHubCoordinates;
    }

    return {
      lat: payload.result.latitude,
      lon: payload.result.longitude,
    };
  } catch (err) {
    console.error('Postcode geocoding failed, using default hub coordinates:', err);
    return defaultHubCoordinates;
  }
}

export async function fetchNearbyPosts(userLat: number, userLon: number, radiusMiles = 5) {
  return supabase.rpc('get_nearby_posts', {
    user_lat: userLat,
    user_lon: userLon,
    radius_miles: radiusMiles,
  });
}

export async function fetchPostsByReceiver(receiverId: string) {
  return supabase
    .from('posts')
    .select('*')
    .eq('receiver_id', receiverId)
    .order('expiry_time', { ascending: true });
}

export async function fetchPostsByDonor(donorId: string) {
  return supabase
    .from('posts')
    .select('*')
    .eq('donor_id', donorId)
    .order('created_at', { ascending: false });
}

function isRenderablePost(post: PostWithOptionalExpiresAt, currentIsoTimestamp: string) {
  const expiryTimestamp = post.expires_at ?? post.expiry_time;

  return post.status === 'available' && Boolean(expiryTimestamp) && expiryTimestamp > currentIsoTimestamp;
}

export function useAvailablePosts(userCoordinates: Coordinates, radiusMiles = 5) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPosts() {
      setLoading(true);
      const { data, error } = await fetchNearbyPosts(userCoordinates.lat, userCoordinates.lon, radiusMiles);

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error('Detailed Feed Error:', error.message, error.details, error.hint);
        setError(error.message);
        setPosts([]);
      } else {
        const nowIso = new Date().toISOString();
        const activePosts = ((data ?? []) as PostWithOptionalExpiresAt[]).filter((post) =>
          isRenderablePost(post, nowIso),
        );

        setError(null);
        setPosts(activePosts);
      }

      setLoading(false);
    }

    void loadPosts();

    const channel = supabase
      .channel('posts-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          void loadPosts();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [radiusMiles, userCoordinates.lat, userCoordinates.lon]);

  return { posts, loading, error, setPosts };
}
