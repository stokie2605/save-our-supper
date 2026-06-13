export interface Post {
  id: string;
  title: string;
  description: string | null;
  quantity: string;
  expiry_time: string;
  postcode: string;
  lat: number;
  lon: number;
  status: 'available' | 'claimed' | 'completed';
  donor_id: string;
  receiver_id: string | null;
  created_at: string;
  category?: string;
  urgency?: string;
  board_type?: 'citizen_post' | 'foodbank_broadcast';
}

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
