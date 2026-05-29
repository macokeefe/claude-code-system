"""
Ball flight calculations from Garmin R10 launch monitor data.
All distances in yards, angles in degrees, speeds in mph, spin in RPM.
"""
import math


def process_shot(ball_data: dict, wind_speed: float = 0, wind_dir: float = 0,
                 aim_heading: float = 0.0) -> dict:
    """
    Convert raw R10 BallData dict into a shot result.

    aim_heading: the direction the player is aiming, in degrees clockwise from
    straight ahead (+y, "north"). The shot's absolute bearing is aim + HLA, so
    a dead-straight shot (HLA = 0) flies exactly along the aim line.

    Returns a dict with:
      carry      - carry distance in yards (wind-adjusted), along the shot line
      total      - total distance in yards (carry + roll)
      roll       - roll distance in yards
      curve      - perpendicular drift (yds) from sidespin + crosswind (+ = right)
      lateral    - net side offset from the aim line at landing (display only)
      hla        - horizontal launch angle (degrees, relative to aim)
      vla        - vertical launch angle (degrees)
      speed      - ball speed (mph)
      backspin   - backspin RPM
    """
    carry_raw  = float(ball_data.get("CarryDistance", 150))
    hla        = float(ball_data.get("HLA", 0))       # + = right of aim
    vla        = float(ball_data.get("VLA", 14))
    speed      = float(ball_data.get("Speed", 120))
    backspin   = float(ball_data.get("BackSpin", 3000))
    sidespin   = float(ball_data.get("SideSpin", 0))

    # ── Wind effect ────────────────────────────────────────────────────────
    # wind_dir: degrees clockwise from north = direction wind blows FROM.
    # The shot's absolute bearing is the aim plus the launch angle.
    bearing  = aim_heading + hla
    wind_rad = math.radians(wind_dir - 180 - bearing)

    tailwind  =  math.cos(wind_rad) * wind_speed   # positive = helps carry
    crosswind = -math.sin(wind_rad) * wind_speed   # positive = pushes right

    carry = carry_raw + tailwind * 0.30 * (carry_raw / 200)

    # ── Curve: perpendicular drift from spin + crosswind (NOT from HLA) ─────
    curve_spin = sidespin * 0.003 * (carry / 100)   # ~3 yds /100yd /1000 rpm
    curve_wind = crosswind * 0.18 * (carry / 200)
    curve      = curve_spin + curve_wind

    # ── Roll estimate ─────────────────────────────────────────────────────
    # Lower VLA → more roll; higher backspin → less roll
    roll_factor    = max(0.0, (22 - vla) / 22)
    backspin_scale = max(0.0, 1 - backspin / 7000)
    roll = carry * 0.18 * roll_factor * backspin_scale

    total = carry + roll

    # Net perpendicular offset from the aim line at landing (for the HUD)
    lateral = carry * math.tan(math.radians(hla)) + curve

    return {
        "carry":    round(carry, 1),
        "total":    round(total, 1),
        "roll":     round(roll, 1),
        "curve":    round(curve, 1),
        "lateral":  round(lateral, 1),
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
