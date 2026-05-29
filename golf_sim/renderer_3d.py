"""
First-person golf simulator renderer — high-fidelity graphics.
Pure Pygame — no OpenGL, no numpy required.
"""
import math
import random
import pygame
from physics import check_terrain as _terrain

# ── Layout ────────────────────────────────────────────────────────────────────
WIN_W, WIN_H = 1400, 900
HORIZON_Y    = int(WIN_H * 0.415)   # 373
EYE_H        = 1.65                  # eye height in yards (~5 ft)
CAM_BEHIND   = 7.5                   # yards behind ball
FOCAL        = WIN_W * 0.70          # 980
CLIP_NEAR    = 0.6
FAR_CLIP     = 460

MINI_W, MINI_H = 210, 155
MINI_X = WIN_W - MINI_W - 12
MINI_Y = WIN_H - MINI_H - 12

SUN_SX = int(WIN_W * 0.73)          # sun screen position (fixed)
SUN_SY = int(HORIZON_Y * 0.30)

# ── Palette ───────────────────────────────────────────────────────────────────
C_SKY_ZEN    = ( 12,  36,  98)
C_SKY_MID    = ( 42,  95, 190)
C_SKY_LOW    = ( 88, 155, 238)
C_SKY_HOR    = (170, 215, 252)      # horizon — also used for fog blending
C_SUN_CORE   = (255, 255, 215)
C_SUN_GLOW1  = (255, 240, 160)
C_SUN_GLOW2  = (255, 228, 120)
C_CLOUD_LT   = (252, 255, 255)
C_CLOUD_MID  = (235, 245, 252)
C_CLOUD_SHD  = (210, 225, 245)
C_HAZE       = (195, 225, 210)      # green-tinted horizon haze

C_ROUGH_N    = ( 48,  85,  30)      # rough near camera
C_ROUGH_F    = ( 65, 105,  42)      # rough far (fog blends this toward C_SKY_HOR)
C_ROUGH_DK   = ( 38,  68,  22)      # dark rough accent stripe

C_FAIRWAY    = ( 72, 140,  46)
C_FAIRWAY2   = ( 88, 162,  56)      # lighter mowing stripe
C_GREEN      = ( 32, 150,  60)
C_GREEN2     = ( 45, 172,  75)
C_GREEN_CTR  = ( 58, 192,  88)

C_BUNKER     = (230, 215, 155)
C_BUNKER2    = (215, 198, 138)
C_BUNKER_SHD = (195, 175, 115)

C_WATER      = ( 32, 112, 200)
C_WATER_MID  = ( 55, 148, 228)
C_WATER_SHIN = (145, 210, 255)

C_TREE_SHD   = ( 10,  25,   8)
C_TREE_DK    = ( 20,  52,  18)
C_TREE_MID   = ( 36,  92,  32)
C_TREE_LT    = ( 58, 125,  46)
C_TREE_EDGE  = ( 80, 148,  55)      # sunlit highlight edge
C_DEC_DK     = ( 32,  75,  18)      # deciduous dark
C_DEC_MD     = ( 52, 115,  30)
C_DEC_LT     = ( 82, 152,  45)
C_DEC_EDGE   = (102, 168,  52)
C_TRUNK      = ( 72,  50,  28)
C_TRUNK_LT   = ( 98,  70,  40)

C_POLE       = ( 38,  38,  38)
C_FLAG       = (222,  38,  38)
C_FLAG_LT    = (255,  95,  80)
C_FLAG_SHD   = (155,  22,  22)
C_BALL       = (255, 255, 255)
C_BALL_SHD   = ( 16,  35,  10)
C_TRAIL      = (255, 202,  55)
C_TRAIL2     = (255, 255, 192)
C_LAND_MK    = (255, 148,  30)

C_DIST_100   = (240, 215,  75)
C_DIST_150   = (240, 242, 240)
C_DIST_200   = ( 85, 192, 248)
C_HUD_BG     = (  8,  16,   8)
C_HUD_LN     = ( 50,  72,  48)
C_HUD_TXT    = (218, 228, 198)
C_HUD_GOLD   = (255, 218,  50)
C_HUD_DIM    = (122, 142, 108)
C_HUD_RED    = (245,  68,  68)
C_HUD_BLU    = (112, 178, 255)
C_TERRAIN    = {
    "fairway": ( 88, 210,  88),
    "rough":   (162, 198,  72),
    "bunker":  (228, 198,  72),
    "green":   ( 48, 208, 108),
    "water":   ( 78, 152, 242),
    "ob":      (242,  72,  72),
    "tee":     (138, 198, 108),
}

# ── Caches ────────────────────────────────────────────────────────────────────
_tree_cache:    dict = {}
_fonts:         dict = {}
_sky_surface:   object = None        # cached sky gradient (regenerated once)
_ground_surf:   object = None        # cached ground scanline gradient
_horiz_pts:     list = []            # pre-computed horizon silhouette polygon


def _font(size: int, bold: bool = False) -> pygame.font.Font:
    key = (size, bold)
    if key not in _fonts:
        _fonts[key] = pygame.font.SysFont("monospace", size, bold=bold)
    return _fonts[key]


# ── Colour helpers ────────────────────────────────────────────────────────────
def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _lerp3(ca, cb, t):
    return (int(_lerp(ca[0], cb[0], t)),
            int(_lerp(ca[1], cb[1], t)),
            int(_lerp(ca[2], cb[2], t)))


def _clamp(v) -> int:
    return max(0, min(255, int(v)))


def _fog_blend(base_col, fog_t):
    """Blend base_col toward horizon sky colour."""
    return (_clamp(_lerp(base_col[0], C_SKY_HOR[0], fog_t)),
            _clamp(_lerp(base_col[1], C_SKY_HOR[1], fog_t)),
            _clamp(_lerp(base_col[2], C_SKY_HOR[2], fog_t)))


def _fog_t(cam_depth: float) -> float:
    return min(1.0, (max(0.0, cam_depth) / 260.0) ** 1.2)


def _world_hash(xi: int, yi: int) -> float:
    """Deterministic noise in [0,1] for world grid cell (xi, yi)."""
    v = (xi * 2731 + yi * 1367 + 19) & 0xFFFFFF
    v = ((v >> 4) ^ v) * 0x45D9F3
    return ((v >> 6) & 0xFFFF) / 65535.0


# ── Camera ────────────────────────────────────────────────────────────────────
class Camera3D:
    __slots__ = ("hx", "hy", "sinθ", "cosθ")

    def __init__(self, ball_pos: tuple, aim_heading: float):
        bx, by    = ball_pos
        θ         = math.radians(aim_heading)
        self.hx   = bx - CAM_BEHIND * math.sin(θ)
        self.hy   = by - CAM_BEHIND * math.cos(θ)
        self.sinθ = math.sin(θ)
        self.cosθ = math.cos(θ)

    def to_cam(self, hx: float, hy: float, hz: float = 0.0):
        dx = hx - self.hx;  dy = hy - self.hy
        cx = dx * self.cosθ - dy * self.sinθ
        cy = dx * self.sinθ + dy * self.cosθ
        return cx, cy, hz - EYE_H

    def project(self, hx: float, hy: float, hz: float = 0.0):
        cx, cy, cz = self.to_cam(hx, hy, hz)
        if cy < CLIP_NEAR:
            return None
        return (int(WIN_W // 2 + cx / cy * FOCAL),
                int(HORIZON_Y  - cz / cy * FOCAL))

    def depth(self, hx: float, hy: float) -> float:
        _, cy, _ = self.to_cam(hx, hy)
        return cy

    def unproject_ground(self, sx: int, sy: int):
        """Screen pixel → world (hx, hy) at ground level."""
        if sy <= HORIZON_Y:
            return None
        cy = EYE_H * FOCAL / (sy - HORIZON_Y)
        cx = (sx - WIN_W // 2) * cy / FOCAL
        return (self.hx + cx * self.cosθ + cy * self.sinθ,
                self.hy - cx * self.sinθ + cy * self.cosθ)


def _clip(verts: list, near: float = CLIP_NEAR) -> list:
    """Sutherland-Hodgman near-plane clip on (cx,cy,cz) vertices."""
    out = [];  n = len(verts)
    for i in range(n):
        a = verts[i];  b = verts[(i + 1) % n]
        a_in = a[1] >= near;  b_in = b[1] >= near
        if a_in:
            out.append(a)
        if a_in != b_in:
            t = (near - a[1]) / (b[1] - a[1])
            out.append((a[0] + t*(b[0]-a[0]), near, a[2] + t*(b[2]-a[2])))
    return out


def _project_poly(cam: Camera3D, world_pts: list) -> list:
    cam_pts = [cam.to_cam(x, y) for x, y in world_pts]
    clipped = _clip(cam_pts)
    if len(clipped) < 3:
        return []
    return [(int(WIN_W//2 + cx/cy*FOCAL), int(HORIZON_Y - cz/cy*FOCAL))
            for cx, cy, cz in clipped]


def _ellipse_pts(cx, cy, rx, ry, n=24) -> list:
    return [(cx + rx*math.cos(2*math.pi*i/n),
             cy + ry*math.sin(2*math.pi*i/n)) for i in range(n)]


def _circle_pts(cx, cy, r, n=16) -> list:
    return _ellipse_pts(cx, cy, r, r, n)


def _fairway_x_at_y(poly: list, y: float):
    xs = []
    n  = len(poly)
    for i in range(n):
        x0, y0 = poly[i];  x1, y1 = poly[(i+1) % n]
        if (y0 <= y < y1) or (y1 <= y < y0):
            t = (y - y0) / (y1 - y0)
            xs.append(x0 + t*(x1-x0))
    return (min(xs), max(xs)) if len(xs) >= 2 else None


# ── Sky ───────────────────────────────────────────────────────────────────────
def _build_sky_surface() -> pygame.Surface:
    """Pre-render the static sky gradient (no clouds or sun — those animate)."""
    surf = pygame.Surface((WIN_W, HORIZON_Y + 4))
    stops = [
        (0.00, C_SKY_ZEN),
        (0.48, C_SKY_MID),
        (0.78, C_SKY_LOW),
        (1.00, C_SKY_HOR),
    ]
    for sy in range(HORIZON_Y + 4):
        t = sy / HORIZON_Y
        col = stops[0][1]
        for i in range(len(stops) - 1):
            t0, c0 = stops[i];  t1, c1 = stops[i+1]
            if t0 <= t <= t1:
                s = (t - t0) / (t1 - t0)
                col = _lerp3(c0, c1, s)
                break
        surf.fill(col, (0, sy, WIN_W, 1))
    return surf


def _draw_cloud_cluster(surface: pygame.Surface, cx: int, cy: int,
                         rx: int, ry: int):
    """Draw a soft, multi-puff cloud at (cx,cy)."""
    puffs = [
        (  0,       0,      rx,     ry,     C_CLOUD_MID),
        ( rx//3,   -ry//5,  rx*5//8, ry*3//5, C_CLOUD_LT),
        (-rx//4,   -ry//8,  rx*6//10, ry*7//10, C_CLOUD_LT),
        (  0,       ry//5,  rx*7//8, ry//2,  C_CLOUD_MID),
        ( rx//5,    0,      rx*9//10, ry,     C_CLOUD_SHD),
    ]
    for ox, oy, prx, pry, col in puffs:
        if prx > 0 and pry > 0:
            pygame.draw.ellipse(surface, col,
                                (cx + ox - prx, cy + oy - pry, prx*2, pry*2))
    # Bright top highlight
    hl_rx = max(2, rx // 3);  hl_ry = max(1, ry // 3)
    pygame.draw.ellipse(surface, (255, 255, 255),
                        (cx - hl_rx, cy - ry*3//4, hl_rx*2, hl_ry*2))


def _render_sky(surface: pygame.Surface, tick: int):
    global _sky_surface
    if _sky_surface is None:
        _sky_surface = _build_sky_surface()

    surface.blit(_sky_surface, (0, 0))

    # Sun glow halos (largest first → painter's)
    for radius, col, alpha in [(90, C_SUN_GLOW2, 35), (58, C_SUN_GLOW1, 65),
                                (36, C_SUN_GLOW1, 110), (22, C_SUN_CORE, 200),
                                (14, (255,255,240), 255)]:
        glow = pygame.Surface((radius*2, radius*2), pygame.SRCALPHA)
        pygame.draw.circle(glow, (*col, alpha), (radius, radius), radius)
        surface.blit(glow, (SUN_SX - radius, SUN_SY - radius))

    # Drifting cloud clusters
    drift = (tick // 3500) % WIN_W
    cloud_defs = [
        (285,  62, 148, 32),
        (660,  48, 198, 40),
        (945,  74, 168, 35),
        (1210, 55, 175, 38),
        (480,  88, 120, 26),
        (1080, 40, 145, 30),
    ]
    for bx, by, rx, ry in cloud_defs:
        sx = int((bx - drift) % WIN_W)
        _draw_cloud_cluster(surface, sx, by, rx, ry)

    # Horizon haze strip
    haze = pygame.Surface((WIN_W, 18), pygame.SRCALPHA)
    for i in range(18):
        a = int(55 * (1 - i / 18) ** 2)
        haze.fill((*C_HAZE, a), (0, i, WIN_W, 1))
    surface.blit(haze, (0, HORIZON_Y - 16))


# ── Ground scanlines with atmospheric fog ─────────────────────────────────────
def _build_ground_surface() -> pygame.Surface:
    """Pre-render rough ground gradient (no world-position dependency)."""
    h    = WIN_H - HORIZON_Y
    surf = pygame.Surface((WIN_W, h))
    for i in range(0, h, 2):
        sy       = i + 1
        cy_depth = EYE_H * FOCAL / max(sy, 0.5)
        fog      = min(1.0, (cy_depth / 260.0) ** 1.2)
        # Subtle stripe pattern in world depth
        stripe   = 1 + (int(cy_depth * 0.5) % 2) * 0.055
        base     = _lerp3(C_ROUGH_N, C_ROUGH_F, min(1.0, cy_depth / 80.0))
        r = _clamp(base[0] * stripe * (1-fog) + C_SKY_HOR[0] * fog)
        g = _clamp(base[1] * stripe * (1-fog) + C_SKY_HOR[1] * fog)
        b = _clamp(base[2] * stripe * (1-fog) + C_SKY_HOR[2] * fog)
        surf.fill((r, g, b), (0, i, WIN_W, 2))
    return surf


def _horizon_silhouette() -> list:
    """Jagged distant tree-line polygon just at the horizon (screen space)."""
    rng = random.Random(999)
    pts = [(0, HORIZON_Y + 3)]
    x   = 0
    while x < WIN_W:
        ht = rng.randint(4, 20)
        ww = rng.randint(7, 24)
        pts.append((x + ww // 2, HORIZON_Y + 3 - ht))
        pts.append((x + ww,      HORIZON_Y + 3))
        x += ww + rng.randint(1, 7)
    pts.append((WIN_W, HORIZON_Y + 3))
    pts.append((WIN_W, HORIZON_Y + 25))
    pts.append((0,     HORIZON_Y + 25))
    return pts


# ── Ground / terrain ──────────────────────────────────────────────────────────
def _render_ground(surface: pygame.Surface, cam: Camera3D, hole: dict, tick: int):
    global _ground_surf, _horiz_pts
    if _ground_surf is None:
        _ground_surf = _build_ground_surface()
    if not _horiz_pts:
        _horiz_pts = _horizon_silhouette()

    # Fog gradient rough ground
    surface.blit(_ground_surf, (0, HORIZON_Y))

    # Horizon tree silhouette (very dark green band just below horizon)
    pygame.draw.polygon(surface, (18, 42, 14), _horiz_pts)

    # ── Water with animated shimmer ───────────────────────────────────────────
    phase = tick * 0.0028
    for hz in hole.get("hazards", []):
        if hz["type"] != "water":
            continue
        pts = _project_poly(cam, hz["points"])
        if len(pts) < 3:
            continue
        pygame.draw.polygon(surface, C_WATER, pts)

        # Shimmer bands
        by_min = max(HORIZON_Y, min(p[1] for p in pts))
        by_max = min(WIN_H,     max(p[1] for p in pts))
        bx_min = max(0,         min(p[0] for p in pts))
        bx_max = min(WIN_W,     max(p[0] for p in pts))
        band_w = max(1, bx_max - bx_min)
        row = 0
        for sy in range(by_min + 2, by_max - 1, 8):
            t     = math.sin(phase + sy * 0.06 + row * 0.8) * 0.5 + 0.5
            alpha = int(18 + t * 45)
            x1    = bx_min + int(t * band_w * 0.18)
            x2    = bx_max - int(t * band_w * 0.18)
            if x2 > x1:
                sl = pygame.Surface((x2 - x1, 3), pygame.SRCALPHA)
                sl.fill((*C_WATER_SHIN, alpha))
                surface.blit(sl, (x1, sy))
            row += 1

        pygame.draw.polygon(surface, C_WATER_MID, pts, 2)

    # ── Fairway with fog-tinted mowing stripes ────────────────────────────────
    fw     = hole["fairway"]
    min_fy = min(y for _, y in fw)
    max_fy = max(y for _, y in fw)
    fw_cx  = sum(x for x, _ in fw) / len(fw)   # rough centroid x

    base_pts = _project_poly(cam, fw)
    if len(base_pts) >= 3:
        pygame.draw.polygon(surface, C_FAIRWAY, base_pts)

    STRIPE = 8
    y = min_fy + (STRIPE - min_fy % STRIPE) % STRIPE
    i = 0
    while y <= max_fy:
        mid_y  = y + STRIPE * 0.5
        depth  = cam.depth(fw_cx, mid_y)
        fog    = _fog_t(depth)
        c1     = _fog_blend(C_FAIRWAY,  fog)
        c2     = _fog_blend(C_FAIRWAY2, fog)
        b0 = _fairway_x_at_y(fw, y)
        b1 = _fairway_x_at_y(fw, y + STRIPE)
        if b0 and b1:
            col = c2 if i % 2 == 0 else c1
            pts = _project_poly(cam, [
                (b0[0], y),          (b0[1], y),
                (b1[1], y + STRIPE), (b1[0], y + STRIPE),
            ])
            if len(pts) >= 3:
                pygame.draw.polygon(surface, col, pts)
        y += STRIPE;  i += 1

    # ── Bunkers with sand texture ─────────────────────────────────────────────
    for b in hole.get("bunkers", []):
        if b["shape"] == "circle":
            bpts = _project_poly(cam, _circle_pts(b["cx"], b["cy"], b["r"]))
            if len(bpts) < 3:
                continue
            depth = cam.depth(b["cx"], b["cy"])
            fog   = _fog_t(depth)
            pygame.draw.polygon(surface, _fog_blend(C_BUNKER,    fog), bpts)
            pygame.draw.polygon(surface, _fog_blend(C_BUNKER_SHD, fog), bpts, 2)
            # Inner highlight ring
            ipts = _project_poly(cam, _circle_pts(b["cx"], b["cy"], b["r"] * 0.65))
            if len(ipts) >= 3:
                pygame.draw.polygon(surface, _fog_blend(C_BUNKER2, fog), ipts, 1)

    # ── Green with radial gradient ────────────────────────────────────────────
    g    = hole["green"]
    depth_g = cam.depth(g["cx"], g["cy"])
    fog_g   = _fog_t(depth_g)
    for rx_f, ry_f, col in [
        (1.00, 1.00, _fog_blend(C_GREEN,     fog_g)),
        (0.68, 0.68, _fog_blend(C_GREEN2,    fog_g)),
        (0.35, 0.35, _fog_blend(C_GREEN_CTR, fog_g)),
    ]:
        pts = _project_poly(cam, _ellipse_pts(g["cx"], g["cy"],
                                              g["rx"]*rx_f, g["ry"]*ry_f))
        if len(pts) >= 3:
            pygame.draw.polygon(surface, col, pts)

    # ── Tee box ───────────────────────────────────────────────────────────────
    tb  = hole["tee_box"]
    tee_pts = _project_poly(cam, [
        (tb["cx"] - tb["w"]/2, tb["cy"] - tb["h"]/2),
        (tb["cx"] + tb["w"]/2, tb["cy"] - tb["h"]/2),
        (tb["cx"] + tb["w"]/2, tb["cy"] + tb["h"]/2),
        (tb["cx"] - tb["w"]/2, tb["cy"] + tb["h"]/2),
    ])
    if len(tee_pts) >= 3:
        pygame.draw.polygon(surface, C_FAIRWAY2, tee_pts)


# ── Trees ─────────────────────────────────────────────────────────────────────
def _get_trees(hole: dict) -> list:
    key = hole["hole"]
    if key not in _tree_cache:
        rng    = random.Random(key * 1337 + 17)
        bounds = hole.get("bounds", {"min_x": -70, "max_x": 70})
        trees  = []
        y      = 6.0
        while y < hole["total_yards"] - 6:
            for side in (-1, 1):
                edge = bounds["min_x"] if side < 0 else bounds["max_x"]
                for _ in range(rng.randint(1, 3)):
                    inw  = rng.uniform(0.5, 20)
                    x    = edge + inw if side < 0 else edge - inw
                    ty   = y + rng.uniform(-5, 5)
                    if _terrain(x, ty, hole) == "rough":
                        h   = rng.uniform(4.5, 10.5)
                        dec = rng.random() < 0.28  # 28% deciduous
                        trees.append((x, ty, h, dec))
            y += rng.uniform(8, 16)
        _tree_cache[key] = trees
    return _tree_cache[key]


def _draw_conifer(surface: pygame.Surface, sx: int, base_sy: int,
                  apex_sy: int, hw: int, seed: int):
    total_h = max(4, base_sy - apex_sy)
    if hw < 2:
        return
    rng = random.Random(seed)

    # Ground shadow ellipse
    shd_surf = pygame.Surface((hw * 3, hw + 4), pygame.SRCALPHA)
    pygame.draw.ellipse(shd_surf, (0, 0, 0, 70),
                        (0, 0, hw * 3, hw + 4))
    surface.blit(shd_surf, (sx - hw*3//2, base_sy - (hw+4)//2))

    # Trunk
    tk = max(1, hw // 6)
    th = max(2, total_h // 5)
    pygame.draw.rect(surface, C_TRUNK_LT, (sx - tk + 1, base_sy - th, tk, th))
    pygame.draw.rect(surface, C_TRUNK,    (sx - tk,     base_sy - th, tk, th))

    # 3 triangle tiers (dark centre → lighter edges, sunlit right side)
    tiers = [
        (0.00, 0.50, 1.00, C_TREE_DK,  C_TREE_MID),
        (0.25, 0.72, 0.72, C_TREE_MID, C_TREE_LT),
        (0.52, 1.00, 0.44, C_TREE_LT,  C_TREE_EDGE),
    ]
    for t0, t1, wf, col_dk, col_lt in tiers:
        ty0 = int(apex_sy + total_h * (1 - t1))
        ty1 = int(apex_sy + total_h * (1 - t0))
        w   = max(2, int(hw * wf))
        # Dark (shadow) triangle
        pygame.draw.polygon(surface, col_dk,
                            [(sx, ty0), (sx - w, ty1), (sx + w, ty1)])
        # Sunlit right-edge highlight (thin sliver)
        hi = max(1, w // 4)
        pygame.draw.polygon(surface, col_lt,
                            [(sx, ty0), (sx + w - hi, ty1), (sx + w, ty1)])


def _draw_deciduous(surface: pygame.Surface, sx: int, base_sy: int,
                    apex_sy: int, hw: int, seed: int):
    total_h = max(4, base_sy - apex_sy)
    if hw < 3:
        return
    rng = random.Random(seed + 500)
    cy  = (base_sy + apex_sy) // 2
    rx  = max(3, hw)
    ry  = max(3, total_h // 2)

    # Ground shadow
    shd = pygame.Surface((rx * 3, rx + 4), pygame.SRCALPHA)
    pygame.draw.ellipse(shd, (0, 0, 0, 65), (0, 0, rx * 3, rx + 4))
    surface.blit(shd, (sx - rx*3//2, base_sy - (rx+4)//2))

    # Trunk
    tk = max(1, hw // 7)
    th = max(2, total_h // 3)
    pygame.draw.rect(surface, C_TRUNK, (sx - tk, base_sy - th, tk*2, th))

    # Blob crown — several overlapping ellipses
    blobs = [
        (  0,         0,        rx,     ry,     C_DEC_DK),
        (  rx//3,    -ry//4,   rx*3//4, ry*3//4, C_DEC_MD),
        ( -rx//4,    -ry//5,   rx*2//3, ry*3//5, C_DEC_MD),
        (  rx//6,     ry//6,   rx*4//5, ry*2//5, C_DEC_DK),
    ]
    for ox, oy, brx, bry, col in blobs:
        bsurface = pygame.Surface((brx*2, bry*2), pygame.SRCALPHA)
        pygame.draw.ellipse(bsurface, (*col, 255), (0, 0, brx*2, bry*2))
        surface.blit(bsurface, (sx + ox - brx, cy + oy - bry))

    # Sunlit edge highlights
    for _ in range(3):
        ox = rng.randint(-rx, rx // 2)
        oy = rng.randint(-ry, ry // 4)
        sr = rng.randint(max(2, hw//5), max(3, hw//3))
        pygame.draw.circle(surface, C_DEC_LT, (sx + ox, cy + oy), sr)
    pygame.draw.circle(surface, C_DEC_EDGE,
                       (sx + rx//3, cy - ry//3), max(2, hw//4))


def _render_trees(surface: pygame.Surface, cam: Camera3D, hole: dict):
    trees   = _get_trees(hole)
    visible = []
    for hx, hy, height, dec in trees:
        d = cam.depth(hx, hy)
        if CLIP_NEAR < d < FAR_CLIP:
            visible.append((d, hx, hy, height, dec))
    visible.sort(reverse=True)

    for d, hx, hy, height, dec in visible:
        fog = _fog_t(d)
        if fog > 0.96:
            continue
        base = cam.project(hx, hy, 0.0)
        apex = cam.project(hx, hy, height)
        if base is None or apex is None:
            continue
        sx,  base_sy = base
        _,   apex_sy = apex
        hw   = max(2, int(height * 0.40 / d * FOCAL))
        seed = int(hx * 317 + hy * 197)
        if dec:
            _draw_deciduous(surface, sx, base_sy, apex_sy, hw, seed)
        else:
            _draw_conifer(surface, sx, base_sy, apex_sy, hw, seed)


# ── Distance markers ──────────────────────────────────────────────────────────
def _render_distance_markers(surface: pygame.Surface, cam: Camera3D, hole: dict):
    pin_x, pin_y = hole["pin"]
    tee_x, tee_y = hole["tee"]
    dx = tee_x - pin_x;  dy = tee_y - pin_y
    dl = math.hypot(dx, dy)
    if dl < 1:
        return
    ux, uy = dx/dl, dy/dl
    lx, ly = -uy, ux

    POLE_H  = 1.8
    markers = [(100, C_DIST_100), (150, C_DIST_150), (200, C_DIST_200)]
    for yards, col in markers:
        if yards >= dl:
            continue
        mx = pin_x + ux*yards + lx*5.5
        my = pin_y + uy*yards + ly*5.5
        d  = cam.depth(mx, my)
        if not (CLIP_NEAR < d < FAR_CLIP):
            continue
        base = cam.project(mx, my, 0)
        top  = cam.project(mx, my, POLE_H)
        if base is None or top is None:
            continue
        bx, by_s = base;  tx, ty_s = top
        lw = max(1, int(0.04 / d * FOCAL))   # ~4 cm pole diameter
        pygame.draw.line(surface, C_POLE, (bx, by_s), (tx, ty_s), lw)
        # Coloured disc cap (~10 cm radius, always at least 4 px so it's clickable)
        cap_r = max(4, int(0.10 / d * FOCAL))
        pygame.draw.circle(surface, (20, 20, 20), (tx, ty_s), cap_r + 1)
        pygame.draw.circle(surface, col, (tx, ty_s), cap_r)
        if d < 180:
            lbl = _font(max(10, min(22, int(1.8 / d * FOCAL)))).render(str(yards), True, col)
            surface.blit(lbl, (tx + cap_r + 2, ty_s - lbl.get_height()//2))


# ── Pin / flag ────────────────────────────────────────────────────────────────
def _render_pin(surface: pygame.Surface, cam: Camera3D,
                hole: dict, tick: int):
    px, py  = hole["pin"]
    POLE_HT = 2.28
    FLAG_H  = 0.62
    FLAG_W  = 0.58

    d = cam.depth(px, py)
    if not (CLIP_NEAR < d < FAR_CLIP):
        return

    base  = cam.project(px, py, 0.0)
    top   = cam.project(px, py, POLE_HT)
    if base is None or top is None:
        return

    lw = max(1, int(0.035 / d * FOCAL))   # ~3.5 cm flagstick diameter
    # Pole with slight 3D roundness
    pygame.draw.line(surface, (22, 22, 22), base, top, max(1, lw + 1))
    pygame.draw.line(surface, C_POLE,       base, top, lw)

    # Waving flag using sine wave offset
    wave = math.sin(tick * 0.006) * 0.04
    wave2 = math.sin(tick * 0.006 + 1.0) * 0.035
    fp = [
        cam.project(px,               py,           POLE_HT),
        cam.project(px + FLAG_W*0.5  + wave,  py,   POLE_HT - FLAG_H*0.25),
        cam.project(px + FLAG_W      + wave2, py,   POLE_HT - FLAG_H*0.5),
        cam.project(px + FLAG_W*0.5  + wave,  py,   POLE_HT - FLAG_H*0.75),
        cam.project(px,               py,           POLE_HT - FLAG_H),
    ]
    fp = [p for p in fp if p is not None]
    if len(fp) >= 3:
        pygame.draw.polygon(surface, C_FLAG_SHD, fp)
        # Shift slightly for 3D effect
        fp_lt = [(p[0]-1, p[1]) for p in fp]
        pygame.draw.polygon(surface, C_FLAG,     fp_lt)
        pygame.draw.polygon(surface, C_FLAG_LT,  fp_lt, 1)

    # Hole cup — regulation 4.25 inch (0.118 yd) diameter, min 3 px
    cup_r = max(3, int(0.06 / d * FOCAL))
    pygame.draw.circle(surface, (15, 15, 15), base, cup_r)
    pygame.draw.circle(surface, (55, 55, 55), base, cup_r, 1)


# ── Ball ──────────────────────────────────────────────────────────────────────
def _render_ball_static(surface: pygame.Surface, cam: Camera3D, ball_pos: tuple):
    d  = cam.depth(*ball_pos)
    if not (CLIP_NEAR < d < FAR_CLIP):
        return
    sp = cam.project(*ball_pos, 0.0)
    if sp is None:
        return
    sx, sy = sp
    r = max(4, int(0.24 / d * FOCAL))

    # Drop shadow
    shd = pygame.Surface((r*4, r*2), pygame.SRCALPHA)
    pygame.draw.ellipse(shd, (0, 0, 0, 90), (0, 0, r*4, r*2))
    surface.blit(shd, (sx - r*2, sy - r//2 + r//3))

    # Ball with subsurface-scatter-style shading
    pygame.draw.circle(surface, C_BALL_SHD, (sx+1, sy+1), r)
    pygame.draw.circle(surface, (245, 245, 245), (sx, sy), r)
    pygame.draw.circle(surface, (255, 255, 255), (sx, sy), max(1, r - 1))
    # Specular highlight
    sr = max(1, r // 3)
    pygame.draw.circle(surface, (255, 255, 255),
                       (sx - max(1, r//3), sy - max(1, r//3)), sr)
    # Rim shadow
    pygame.draw.circle(surface, (200, 205, 195), (sx, sy), r, 1)


def _ball_world_pos(start, land, final, progress):
    CARRY = 0.82
    if progress <= CARRY:
        t  = progress / CARRY
        wx = start[0] + (land[0] - start[0]) * t
        wy = start[1] + (land[1] - start[1]) * t
        carry_d = math.hypot(land[0]-start[0], land[1]-start[1])
        max_h   = max(carry_d * 0.12, 3.0)
        wz      = t * (1 - t) * 4 * max_h
    else:
        t  = (progress - CARRY) / (1 - CARRY)
        wx = land[0] + (final[0] - land[0]) * t
        wy = land[1] + (final[1] - land[1]) * t
        wz = 0.0
    return wx, wy, wz


def _render_ball_flight(surface: pygame.Surface, cam: Camera3D,
                        start, land, final, progress: float):
    # Trail ghost dots
    for k in range(1, 10):
        tp = progress - k * 0.014
        if tp <= 0:
            break
        wx, wy, wz = _ball_world_pos(start, land, final, tp)
        sp = cam.project(wx, wy, wz)
        if sp is None:
            continue
        d = cam.depth(wx, wy)
        r = max(2, int(0.20 / max(d, 0.1) * FOCAL) - k // 2)
        alpha = max(0, int(120 * (1 - k / 10)))
        col   = C_TRAIL if k <= 5 else C_TRAIL2
        ts    = pygame.Surface((r*2+2, r*2+2), pygame.SRCALPHA)
        pygame.draw.circle(ts, (*col, alpha), (r+1, r+1), r)
        surface.blit(ts, (sp[0]-r-1, sp[1]-r-1))

    wx, wy, wz = _ball_world_pos(start, land, final, progress)
    d  = cam.depth(wx, wy)
    sp = cam.project(wx, wy, wz)
    if sp is None:
        return
    sx, sy = sp

    # Ground shadow (becomes transparent when ball is high)
    gsp = cam.project(wx, wy, 0.0)
    if gsp and wz > 0.08:
        gx, gy = gsp
        sr = max(2, int(0.28 / max(d, 0.1) * FOCAL))
        shd = pygame.Surface((sr*4, sr*2), pygame.SRCALPHA)
        a = int(110 * (1 - min(wz / 9, 1.0)))
        pygame.draw.ellipse(shd, (0, 0, 0, a), (0, 0, sr*4, sr*2))
        surface.blit(shd, (gx - sr*2, gy - sr))

    r = max(4, int(0.24 / max(d, 0.1) * FOCAL))
    pygame.draw.circle(surface, C_BALL_SHD, (sx+1, sy+1), r)
    pygame.draw.circle(surface, (255, 255, 255), (sx, sy), r)
    sr = max(1, r // 3)
    pygame.draw.circle(surface, (255, 255, 255),
                       (sx - max(1, r//3), sy - max(1, r//3)), sr)
    pygame.draw.circle(surface, (200, 205, 195), (sx, sy), r, 1)


# ── Aim line ──────────────────────────────────────────────────────────────────
def _render_aim_line(surface: pygame.Surface, cam: Camera3D,
                     ball_pos: tuple, hole: dict):
    bx, by   = ball_pos
    px, py   = hole["pin"]
    pin_dist = math.hypot(px-bx, py-by)
    if pin_dist < 0.5:
        return
    length = max(18.0, min(pin_dist, 280.0))
    steps  = 32
    pts    = []
    for i in range(steps + 1):
        t  = i / steps
        wx = bx + (px - bx) / pin_dist * length * t
        wy = by + (py - by) / pin_dist * length * t
        sp = cam.project(wx, wy, 0.02)
        if sp:
            pts.append((sp, t))

    for j in range(len(pts) - 1):
        sp0, t0 = pts[j]
        sp1, _  = pts[j+1]
        if int(t0 * 22) % 2 == 0:
            alpha = int(210 - t0 * 120)
            ts    = pygame.Surface((abs(sp1[0]-sp0[0])+2, abs(sp1[1]-sp0[1])+2),
                                   pygame.SRCALPHA)
            pygame.draw.line(ts, (255, 255, 255, alpha),
                             (1,1), (sp1[0]-sp0[0]+1, sp1[1]-sp0[1]+1), 1)
            surface.blit(ts, (min(sp0[0], sp1[0]), min(sp0[1], sp1[1])))

    # Reticle at aim end
    ex_w = bx + (px - bx) / pin_dist * length
    ey_w = by + (py - by) / pin_dist * length
    end  = cam.project(ex_w, ey_w, 0.02)
    if end:
        ex, ey = end
        rr = 7
        pygame.draw.circle(surface, (255, 70, 70), (ex, ey), rr + 2, 1)
        pygame.draw.circle(surface, (255, 70, 70), (ex, ey), rr,     1)
        pygame.draw.line(surface, (255, 70, 70), (ex - rr - 4, ey), (ex + rr + 4, ey), 1)
        pygame.draw.line(surface, (255, 70, 70), (ex, ey - rr - 4), (ex, ey + rr + 4), 1)


# ── HUD ───────────────────────────────────────────────────────────────────────
def _hud_box(surface, x, y, w, h, alpha=188):
    bg = pygame.Surface((w, h), pygame.SRCALPHA)
    bg.fill((*C_HUD_BG, alpha))
    surface.blit(bg, (x, y))
    pygame.draw.rect(surface, C_HUD_LN, (x, y, w, h), 1)


def _render_hud(surface: pygame.Surface, game, hole: dict, tick: int):
    f_lg = _font(20, True)
    f_md = _font(15)
    f_sm = _font(13)

    lines = [(f"HOLE {hole['hole']}  ·  PAR {hole['par']}  ·  {hole['total_yards']} yds",
              f_lg, C_HUD_GOLD)]

    if game and game.ball_pos:
        px, py  = hole["pin"]
        bx, by  = game.ball_pos
        dist    = math.hypot(px - bx, py - by)
        terrain = game.current_terrain
        tc      = C_TERRAIN.get(terrain, C_HUD_TXT)
        from renderer import suggest_club
        lines.append((f"To pin  {int(dist)} yds", f_md, C_HUD_GOLD))
        lines.append((f"Lie     {terrain.upper()}", f_md, tc))
        lines.append((f"Club    {suggest_club(dist)}", f_md, C_HUD_BLU))
        off = game.aim_offset_deg()
        if abs(off) < 0.5:
            lines.append(("Aim     ↑ AT PIN", f_md, C_HUD_TXT))
        else:
            arrow = "→" if off > 0 else "←"
            lines.append((f"Aim     {arrow} {abs(off):.0f}°", f_md, (255, 175, 175)))

    pad   = 10
    box_w = max(s.render(t, True, (0,0,0)).get_width() for t, s, _ in lines) + pad*2
    box_h = sum(s.get_height() + 4 for _, s, _ in lines) + pad*2
    _hud_box(surface, 12, 12, box_w, box_h)
    cy = 12 + pad
    for text, fnt, col in lines:
        surf = fnt.render(text, True, col)
        surface.blit(surf, (12 + pad, cy))
        cy += surf.get_height() + 4

    if game:
        sc_surf = f_lg.render(f"Shot {game.shot_count + 1}", True, C_HUD_TXT)
        sy      = 12 + box_h + 6
        _hud_box(surface, 12, sy, sc_surf.get_width() + 20, sc_surf.get_height() + 10)
        surface.blit(sc_surf, (22, sy + 5))

    if game:
        ws  = game.wind_speed
        wd  = game.wind_dir
        dirs = ["N","NE","E","SE","S","SW","W","NW"]
        dlbl = dirs[int((wd + 22.5) / 45) % 8]
        wtxt = "CALM" if ws < 1 else f"{ws:.0f} mph  {dlbl}"
        wsurf = f_md.render(f"WIND  {wtxt}", True, C_HUD_BLU)
        wx_p  = WIN_W - wsurf.get_width() - 35
        wy_p  = 12
        _hud_box(surface, wx_p - 10, wy_p, wsurf.get_width() + 20,
                 wsurf.get_height() + 42)
        surface.blit(wsurf, (wx_p, wy_p + 6))
        _draw_wind_arrow(surface, wx_p + wsurf.get_width()//2, wy_p + 32, ws, wd)

    if game:
        sc_x = WIN_W - 195;  sc_y = 80
        _hud_box(surface, sc_x - 8, sc_y, 185, (len(game.all_holes)+1)*18 + 16)
        surface.blit(f_sm.render("SCORECARD", True, C_HUD_TXT), (sc_x, sc_y + 6))
        for i, h in enumerate(game.all_holes):
            sc_data = game.scores[i]
            score   = sc_data.get("score")
            par     = h["par"]
            yy      = sc_y + 24 + i*17
            if score is not None:
                diff = score - par
                col  = C_HUD_RED if diff > 0 else (100,230,100) if diff < 0 else C_HUD_TXT
                sign = "+" if diff > 0 else ""
                surface.blit(f_sm.render(f"H{i+1}: {score}  ({sign}{diff})", True, col),
                             (sc_x, yy))
            elif i == game.current_hole_idx:
                surface.blit(f_sm.render(f"H{i+1}: {game.shot_count} →", True, C_HUD_GOLD),
                             (sc_x, yy))
            else:
                surface.blit(f_sm.render(f"H{i+1}: --", True, C_HUD_DIM), (sc_x, yy))

    import r10_server as _r10
    r10_on = (not _r10.shot_queue.empty()) or (game and game.shot_count > 0)
    dot_c  = (70, 220, 70) if r10_on else (200, 75, 75)
    pygame.draw.circle(surface, dot_c, (WIN_W - 18, WIN_H - 18), 7)
    rlbl = f_sm.render("R10" if r10_on else "NO R10", True, dot_c)
    surface.blit(rlbl, (WIN_W - 18 - rlbl.get_width() - 6,
                        WIN_H - 18 - rlbl.get_height()//2))

    hints   = "← → AIM   T SWING   C CENTER   H HOLE OUT   N NEXT   R RESTART"
    hsurf   = f_sm.render(hints, True, C_HUD_DIM)
    hx_pos  = (WIN_W - hsurf.get_width()) // 2
    hy_pos  = WIN_H - hsurf.get_height() - 8
    _hud_box(surface, hx_pos - 8, hy_pos - 4,
             hsurf.get_width() + 16, hsurf.get_height() + 8, alpha=130)
    surface.blit(hsurf, (hx_pos, hy_pos))


def _draw_wind_arrow(surface, cx, cy, speed, direction):
    if speed < 0.5:
        lbl = _font(11).render("CALM", True, C_HUD_BLU)
        surface.blit(lbl, (cx - lbl.get_width()//2, cy - lbl.get_height()//2))
        return
    length = min(18, int(speed * 1.2))
    angle  = math.radians(direction)
    ex = cx + int(math.sin(angle) * length)
    ey = cy - int(math.cos(angle) * length)
    pygame.draw.line(surface, C_HUD_BLU, (cx, cy), (ex, ey), 2)
    for da in (0.5, -0.5):
        hx = ex - int(math.sin(angle + da) * 6)
        hy = ey + int(math.cos(angle + da) * 6)
        pygame.draw.line(surface, C_HUD_BLU, (ex, ey), (hx, hy), 2)


# ── Mini-map ──────────────────────────────────────────────────────────────────
def _render_mini_map(surface: pygame.Surface, hole: dict,
                     ball_pos, shot_history, aim_heading):
    from renderer import Viewport, draw_hole
    mini      = pygame.Surface((MINI_W, MINI_H))
    mini_rect = pygame.Rect(0, 0, MINI_W, MINI_H)
    vp = Viewport(mini_rect, hole)
    draw_hole(mini, vp, hole,
              ball_pos=ball_pos, shot_history=shot_history,
              aim_heading=aim_heading)
    pygame.draw.rect(mini, (80, 110, 72), mini_rect, 2)
    mini.blit(_font(11).render("MAP", True, (170, 200, 150)), (4, 3))
    dim = pygame.Surface((MINI_W, MINI_H), pygame.SRCALPHA)
    dim.fill((0, 0, 0, 28))
    mini.blit(dim, (0, 0))
    surface.blit(mini, (MINI_X, MINI_Y))
    pygame.draw.rect(surface, (60, 90, 55), (MINI_X, MINI_Y, MINI_W, MINI_H), 2)


# ── Public entry point ────────────────────────────────────────────────────────
def render_scene(
    surface:      pygame.Surface,
    hole:         dict,
    ball_pos:     tuple,
    aim_heading:  float,
    shot_history: list,
    anim_data=None,
    game=None,
    tick:         int = 0,
):
    cam = Camera3D(ball_pos, aim_heading)

    _render_sky(surface, tick)
    _render_ground(surface, cam, hole, tick)
    _render_trees(surface, cam, hole)
    _render_distance_markers(surface, cam, hole)
    _render_pin(surface, cam, hole, tick)

    # Shot landing marks
    for shot in shot_history:
        sp = cam.project(*shot["land"], 0.0)
        if sp:
            d = cam.depth(*shot["land"])
            r = max(2, int(0.18 / max(d, 0.1) * FOCAL))
            pygame.draw.circle(surface, C_LAND_MK, sp, r, 1)

    if anim_data is None:
        _render_aim_line(surface, cam, ball_pos, hole)

    if anim_data:
        start, land, final, progress = anim_data
        _render_ball_flight(surface, cam, start, land, final, progress)
    else:
        _render_ball_static(surface, cam, ball_pos)

    _render_hud(surface, game, hole, tick)
    _render_mini_map(surface, hole,
                     ball_pos     = (None if anim_data else ball_pos),
                     shot_history = shot_history,
                     aim_heading  = (None if anim_data else aim_heading))
