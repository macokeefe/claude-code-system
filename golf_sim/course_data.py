"""
Course definitions — 5 holes, all distances in yards, coordinates in (x, y)
where x = lateral offset from centerline (+ = right) and y = distance from tee.
"""

HOLES = []

# ── Hole 1 — Par 4, 382 yds ─ Straight opener ────────────────────────────────
HOLES.append({
    "hole": 1,
    "par": 4,
    "total_yards": 382,
    "handicap": 9,
    "description": "Straight opener. Avoid the right fairway bunker.",
    "tee": (0, 0),
    "pin": (5, 370),
    "fairway": [
        (-24, 0),  (24, 0),
        (28, 80),  (32, 180), (30, 280), (24, 340), (18, 362),
        (10, 370), (-2, 372), (-14, 364), (-22, 345),
        (-26, 280), (-28, 180), (-26, 80),
    ],
    "green": {"cx": 5, "cy": 370, "rx": 16, "ry": 14},
    "tee_box": {"cx": 0, "cy": 0, "w": 20, "h": 8},
    "bunkers": [
        {"shape": "circle", "cx": 38,  "cy": 230, "r": 16},
        {"shape": "circle", "cx": -22, "cy": 352, "r": 12},
        {"shape": "circle", "cx": 26,  "cy": 358, "r": 11},
    ],
    "hazards": [],
    "bounds": {"min_x": -65, "max_x": 65},
})

# ── Hole 2 — Par 3, 163 yds ─ Island-green concept ───────────────────────────
HOLES.append({
    "hole": 2,
    "par": 3,
    "total_yards": 163,
    "handicap": 15,
    "description": "Short par 3 — water on three sides. Hit it straight.",
    "tee": (0, 0),
    "pin": (-4, 152),
    "fairway": [
        (-6, 0), (6, 0),
        (7, 8),  (7, 160),
        (-16, 160), (-18, 145), (-16, 8),
    ],
    "green": {"cx": -4, "cy": 152, "rx": 14, "ry": 12},
    "tee_box": {"cx": 0, "cy": 0, "w": 12, "h": 6},
    "bunkers": [
        {"shape": "circle", "cx": 19,  "cy": 148, "r": 10},
        {"shape": "circle", "cx": -22, "cy": 155, "r":  8},
    ],
    "hazards": [
        {"type": "water", "points": [
            (-70, -5), (70, -5), (70, 170),
            (9, 170),  (9, 4),   (-9, 4),
            (-9, 170), (-70, 170),
        ]},
    ],
    "bounds": {"min_x": -75, "max_x": 75},
})

# ── Hole 3 — Par 5, 518 yds ─ Dogleg right ───────────────────────────────────
HOLES.append({
    "hole": 3,
    "par": 5,
    "total_yards": 518,
    "handicap": 1,
    "description": "Big par 5 with a dogleg right at 250 yds. Lay up or go for it.",
    "tee": (0, 0),
    "pin": (46, 506),
    "fairway": [
        (-24, 0),  (24, 0),
        (27, 140), (22, 230),
        # dogleg corner
        (38, 268), (55, 305), (65, 360), (68, 430), (65, 490),
        (60, 506), (42, 514), (28, 506), (24, 488),
        (20, 430), (16, 360), (12, 305), (4, 268),
        (-8, 250), (-22, 200), (-26, 140),
    ],
    "green": {"cx": 46, "cy": 506, "rx": 20, "ry": 16},
    "tee_box": {"cx": 0, "cy": 0, "w": 22, "h": 8},
    "bunkers": [
        {"shape": "circle", "cx": 52,  "cy": 262, "r": 18},
        {"shape": "circle", "cx": -10, "cy": 258, "r": 12},
        {"shape": "circle", "cx": 64,  "cy": 488, "r": 14},
        {"shape": "circle", "cx": 28,  "cy": 494, "r": 10},
    ],
    "hazards": [
        {"type": "water", "points": [
            (28, 165), (82, 165), (82, 244), (28, 244),
        ]},
    ],
    "bounds": {"min_x": -65, "max_x": 105},
})

# ── Hole 4 — Par 4, 428 yds ─ Water left ─────────────────────────────────────
HOLES.append({
    "hole": 4,
    "par": 4,
    "total_yards": 428,
    "handicap": 3,
    "description": "Water down the entire left side. Favor right off the tee.",
    "tee": (12, 0),
    "pin": (8, 418),
    "fairway": [
        (-4, 0),   (30, 0),
        (36, 100), (38, 200), (34, 310), (28, 385), (22, 410),
        (14, 420), (4, 420),  (-5, 414), (-8, 400), (-4, 350),
        (0, 250),  (0, 150),  (-4, 80),
    ],
    "green": {"cx": 8, "cy": 418, "rx": 18, "ry": 14},
    "tee_box": {"cx": 12, "cy": 0, "w": 20, "h": 8},
    "bunkers": [
        {"shape": "circle", "cx": 40, "cy": 390, "r": 14},
        {"shape": "circle", "cx": 22, "cy": 175, "r": 12},
    ],
    "hazards": [
        {"type": "water", "points": [
            (-65, 40), (-8, 40), (-8, 425), (-65, 425),
        ]},
    ],
    "bounds": {"min_x": -75, "max_x": 70},
})

# ── Hole 5 — Par 4, 356 yds ─ Tight driving hole ─────────────────────────────
HOLES.append({
    "hole": 5,
    "par": 4,
    "total_yards": 356,
    "handicap": 11,
    "description": "Tight fairway lined with bunkers both sides. Hit it straight!",
    "tee": (0, 0),
    "pin": (2, 346),
    "fairway": [
        (-18, 0), (18, 0),
        (20, 80),  (18, 180), (15, 280), (13, 330),
        (11, 344), (6, 350),  (-3, 350), (-10, 344),
        (-13, 330), (-15, 280), (-18, 180), (-20, 80),
    ],
    "green": {"cx": 2, "cy": 346, "rx": 15, "ry": 13},
    "tee_box": {"cx": 0, "cy": 0, "w": 16, "h": 8},
    "bunkers": [
        {"shape": "circle", "cx": -30, "cy": 150, "r": 14},
        {"shape": "circle", "cx":  30, "cy": 150, "r": 14},
        {"shape": "circle", "cx": -28, "cy": 220, "r": 12},
        {"shape": "circle", "cx":  28, "cy": 220, "r": 12},
        {"shape": "circle", "cx": -16, "cy": 338, "r": 10},
        {"shape": "circle", "cx":  16, "cy": 338, "r": 10},
    ],
    "hazards": [],
    "bounds": {"min_x": -60, "max_x": 60},
})
