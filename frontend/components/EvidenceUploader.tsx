"use client";
import { useState, useRef } from "react";
import api from "@/lib/api";

interface Props {
  taskId: string;
  onSuccess: () => void;
}

export default function EvidenceUploader({ taskId, onSuccess }: Props) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{ geo_verified: boolean; distance_from_site_m: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoData(reader.result as string);
    reader.readAsDataURL(file);
  }

  function getLocation() {
    setGeoStatus("Requesting location…");
    if (!navigator.geolocation) {
      setGeoStatus("Geolocation not supported. Enter coordinates manually.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGeoStatus("Location captured.");
      },
      () => {
        setGeoStatus("Location denied. Enter coordinates manually.");
      }
    );
  }

  async function submit() {
    setError(null);
    if (!lat || !lng) { setError("Latitude and longitude are required."); return; }
    if (!photoData) { setError("A photo is required."); return; }
    setUploading(true);
    try {
      const res = await api.post(`/tasks/${taskId}/evidence`, {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        photo_data: photoData,
      });
      setResult(res.data);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Photo */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Photo</label>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="text-xs text-gray-700" />
      </div>

      {/* Geolocation */}
      <div>
        <button
          type="button"
          onClick={getLocation}
          className="text-xs text-gray-600 underline underline-offset-2 hover:text-gray-900"
        >
          Use my location
        </button>
        {geoStatus && <p className="text-xs text-gray-400 mt-0.5">{geoStatus}</p>}
      </div>

      {/* Manual lat/lng */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-0.5">Latitude</label>
          <input
            type="number"
            step="any"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="e.g. 19.0176"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-0.5">Longitude</label>
          <input
            type="number"
            step="any"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="e.g. 72.8562"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-gray-600"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={uploading}
        className="bg-gray-900 text-white text-xs font-medium px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {uploading ? "Uploading…" : "Upload evidence"}
      </button>

      {result && (
        <p className={`text-xs font-medium ${result.geo_verified ? "text-green-700" : "text-orange-600"}`}>
          {result.geo_verified
            ? `Geo-verified (${result.distance_from_site_m.toFixed(0)}m from site)`
            : `Outside geofence (${result.distance_from_site_m.toFixed(0)}m — flagged for review)`}
        </p>
      )}
    </div>
  );
}
