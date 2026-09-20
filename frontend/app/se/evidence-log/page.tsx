"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Evidence } from "@/lib/types";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export default function EvidenceLogPage() {
  const { data: evidence, isLoading, error } = useQuery<Evidence[]>({
    queryKey: ["my-evidence"],
    queryFn: () => api.get("/me/evidence").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-600 text-center py-10">Failed to load evidence log.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Evidence log</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          History of photographic site evidence uploads with geofence verification status.
        </p>
      </div>

      {!evidence || evidence.length === 0 ? (
        <EmptyState
          title="No evidence records"
          description="No evidence has been uploaded yet. Upload evidence from assigned tasks."
        />
      ) : (
        <div className="border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <th className="text-left px-4 py-2.5 font-medium">Task</th>
                <th className="text-left px-4 py-2.5 font-medium">Geofence verification</th>
                <th className="text-left px-4 py-2.5 font-medium">Distance from site</th>
                <th className="text-left px-4 py-2.5 font-medium">Coordinates</th>
                <th className="text-left px-4 py-2.5 font-medium">Uploaded by</th>
                <th className="text-left px-4 py-2.5 font-medium">Captured at</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((ev) => (
                <tr key={ev.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {ev.task_name || ev.task_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2.5">
                    {ev.geo_verified ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        Geo-verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                        Outside geofence
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">
                    {ev.distance_from_site_m !== null && ev.distance_from_site_m !== undefined
                      ? `${ev.distance_from_site_m.toFixed(1)} m`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                    {ev.lat.toFixed(4)}, {ev.lng.toFixed(4)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">
                    {ev.uploaded_by_name || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {ev.captured_at ? ev.captured_at.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
