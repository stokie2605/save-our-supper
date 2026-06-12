import { Icon } from 'leaflet';
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { Coordinates, Post } from '../lib/posts';

interface FoodMapProps {
  posts: Post[];
  userCoordinates: Coordinates;
  onReservePost: (postId: string) => void;
}

const markerIcon = new Icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function hasValidMarkerCoordinates(post: Post) {
  return Number.isFinite(Number(post.lat)) && Number.isFinite(Number(post.lon));
}

function isCitizenPost(post: Post) {
  return post.board_type === 'citizen_post' || post.category === 'community-update';
}

export function FoodMap({ posts, userCoordinates, onReservePost }: FoodMapProps) {
  const markerPosts = posts.filter(hasValidMarkerCoordinates);

  return (
    <div className="mb-6 min-w-0 overflow-hidden rounded-2xl border border-brand-slateSoft bg-white shadow-xs">
      <MapContainer
        center={[userCoordinates.lat, userCoordinates.lon]}
        zoom={13}
        scrollWheelZoom={false}
        className="h-[360px] w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {markerPosts.map((post) => (
          <Marker key={post.id} position={[Number(post.lat), Number(post.lon)]} icon={markerIcon}>
            <Popup>
              <div className="w-52 max-w-[70vw] min-w-0">
                <h3 className="break-words text-base font-bold leading-snug text-brand-forest">{post.title}</h3>
                <p className="mt-1 break-words text-sm text-slate-600">Area: {post.postcode}</p>
                <p className="break-words text-sm text-slate-600">
                  Expires:{' '}
                  {new Date(post.expiry_time).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                {!isCitizenPost(post) ? (
                  <button
                    type="button"
                    onClick={() => onReservePost(post.id)}
                    className="mt-3 w-full rounded-xl bg-brand-amber px-3 py-2 text-sm font-semibold text-white"
                  >
                    I Can Help
                  </button>
                ) : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
