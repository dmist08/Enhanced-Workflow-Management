"""
Geofence Engine — Pure Function
==================================
Haversine distance between two lat/lng points in metres.
No DB calls.
"""

import math


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Returns the great-circle distance in metres between two GPS coordinates.
    Uses the Haversine formula.
    """
    R = 6_371_000  # Earth radius in metres

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def is_within_geofence(
    evidence_lat: float,
    evidence_lng: float,
    site_lat: float,
    site_lng: float,
    geofence_radius_m: float,
) -> tuple[float, bool]:
    """
    Returns (distance_m, geo_verified).
    geo_verified is True if distance <= geofence_radius_m.
    """
    dist = haversine(evidence_lat, evidence_lng, site_lat, site_lng)
    return dist, dist <= geofence_radius_m


if __name__ == "__main__":
    # Mumbai Gateway of India (18.9220, 72.8347) vs ~50m away
    dist, verified = is_within_geofence(18.9220, 72.8347, 18.9221, 72.8348, 200)
    assert verified, f"Should be within 200m, got {dist:.1f}m"

    # ~5km away — should fail 200m geofence
    dist2, verified2 = is_within_geofence(18.9220, 72.8347, 18.9700, 72.8900, 200)
    assert not verified2, f"Should be outside 200m, got {dist2:.1f}m"

    print(f"✅ Geofence tests passed. Close={dist:.1f}m, Far={dist2:.1f}m")
