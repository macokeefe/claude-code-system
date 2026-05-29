"""
Ball flight calculations from Garmin R10 launch monitor data.
All distances in yards, angles in degrees, speeds in mph, spin in RPM.
"""
import math


def process_shot(ball_data: dict, wind_speed: float = 0, wind_dir: float = 0) -> dict:
    """
    Convert raw R10 BallData dict into a shot result.

    Returns a dict with:
      carry      - carry distance in yards (wind-adjusted)
      total      - total distance in yards (carry + roll)
      lateral    - left/right offset in yards (+ = right)
      roll       - roll distance in yards
      hla        - horizontal launch angle (degrees)
      vla        - vertical launch angle (degrees)
      speed      - ball speed (mph)
      backspin   - backspin RPM
    """
    carry_raw  = float(ball_data.get("CarryDistance", 150))
    hla        = float(ball_data.get("HLA", 0))       # + = right
    vla        = float(ball_data.get("VLA", 14))
    speed      = float(ball_data.get("Speed", 120))
    backspin   = float(ball_data.get("BackSpin", 3000))
    sidespin   = float(ball_data.get("SideSpin", 0))  # + = draw for RH

    # ── Wind effect ────────────────────────────────────────────────────────
    # wind_dir: degrees clockwise from north = direction wind blows FROM
    # shot direction is along the y-axis (0 deg), so headwind = 180 deg wind
    shot_bearing = hla  # simplified: shot heading equals HLA off center
    wind_rad = math.radians(wind_dir - 180 - shot_bearing)

    tailwind  =  math.cos(wind_rad) * wind_speed   # positive = helps carry
    crosswind = -math.sin(wind_rad) * wind_speed   # positive = pushes right

    carry = carry_raw + tailwind * 0.30 * (carry_raw / 200)
    lateral_wind = crosswind * 0.18 * (carry / 200)

    # ── Lateral offset (HLA + sidespin + wind) ────────────────────────────
    lateral_hla  = carry * math.tan(math.radians(hla))
    lateral_spin = sidespin * 0.003 * (carry / 100)   # ~3 yds per 100yd carry per 1000 rpm
    lateral = lateral_hla + lateral_spin + lateral_wind

    # ── Roll estimate ─────────────────────────────────────────────────────
    # Lower VLA → more roll; higher backspin → less roll
    roll_factor    = max(0.0, (22 - vla) / 22)
    backspin_scale = max(0.0, 1 - backspin / 7000)
    roll = carry * 0.18 * roll_factor * backspin_scale

    total = carry + roll

    return {
        "carry":    round(carry, 1),
        "total":    round(total, 1),
        "lateral":  round(lateral, 1),
        "roll":     round(roll, 1),
        "hla":      round(hla, 1),
        "vla":      round(vla, 1),
        "speed":    round(speed, 1),
        "backspin": round(backspin, 0),
    }


def check_terrain(x: float, y: float, hole: dict) -> str:
    """Return terrain type at world position (x, y)."""
    # Green (highest priority)
    g  = hole["green"]
    dx = (x - g["cx"]) / g["rx"]
    dy = (y - g["cy"]) / g["ry"]
    if dx * dx + dy * dy <= 1.0:
        return "green"

    # Bunkers
    for b in hole.get("bunkers", []):
        if b["shape"] == "circle":
            if math.hypot(x - b["cx"], y - b["cy"]) <= b["r"]:
                return "bunker"
        elif b["shape"] == "polygon":
            if _point_in_polygon(x, y, b["points"]):
                return "bunker"

    # Water hazards
    for h in hole.get("hazards", []):
        if h.get("type") == "water" and _point_in_polygon(x, y, h["points"]):
            return "water"

    # Fairway
    if _point_in_polygon(x, y, hole["fairway"]):
        return "fairway"

    # OB check
    bounds = hole.get("bounds", {"min_x": -80, "max_x": 80})
    if x < bounds["min_x"] or x > bounds["max_x"] or y < -20 or y > hole["total_yards"] + 25:
        return "ob"

    return "rough"


def _point_in_polygon(x: float, y: float, polygon: list) -> bool:
    """Ray-casting point-in-polygon test."""
    n      = len(polygon)
    inside = False
    j      = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside
