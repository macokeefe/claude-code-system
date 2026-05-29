"""
First-person golf simulator renderer.
Perspective projection from eye level behind the ball looking toward the pin.
Pure Pygame — no OpenGL.
"""
import math
import random
import pygame
from physics import check_terrain as _terrain

# ── Layout ────────────────────────────────────────────────────────────────────
WIN_W, WIN_H = 1400, 900
HORIZON_Y    = int(WIN_H * 0.415)
EYE_H        = 1.65       # eye height in yards (~5 ft)
CAM_BEHIND   = 7.5        # yards behind ball
FOCAL        = WIN_W * 0.70

CLIP_NEAR    = 0.6        # near clip in yards
FAR_CLIP     = 460

MINI_W, MINI_H = 210, 155
MINI_X = WIN_W - MINI_W - 12
MINI_Y = WIN_H - MINI_H - 12

# ── Palette ───────────────────────────────────────────────────────────────────
C_SKY_TOP   = ( 32,  68, 145)
C_SKY_LOW   = ( 82, 145, 215)
C_SKY_HOR   = (172, 215, 244)
C_CLOUD     = (250, 253, 255)
C_CLOUD2    = (235, 245, 255)
C_ROUGH     = ( 63, 105,  40)
C_ROUGH_DK  = ( 50,  85,  32)
C_FAIRWAY   = ( 84, 152,  55)
C_FAIRWAY2  = ( 95, 170,  62)
C_GREEN     = ( 45, 165,  78)
C_GREEN2    = ( 55, 185,  88)
C_BUNKER    = (228, 212, 155)
C_BUNKER2   = (210, 195, 138)
C_WATER     = ( 48, 132, 215)
C_WATER2    = ( 75, 165, 238)
C_TREE_SHD  = ( 16,  36,  14)
C_TREE_DK   = ( 30,  65,  28)
C_TREE_MID  = ( 48, 108,  44)
C_TREE_LT   = ( 70, 142,  56)
C_TRUNK     = ( 74,  50,  30)
C_POLE      = ( 38,  38,  38)
C_FLAG      = (220,  40,  40)
C_BALL      = (255, 255, 255)
C_BALL_SHD  = ( 20,  40,  14)
C_TRAIL     = (255, 198,  52)
C_TRAIL2    = (255, 255, 190)
C_LAND_MK   = (255, 148,  30)
C_DIST_100  = (240, 215,  75)
C_DIST_150  = (240, 242, 240)
C_DIST_200  = ( 85, 192, 248)
C_HUD_BG    = (  8,  16,   8)
C_HUD_LN    = ( 50,  72,  48)
C_HUD_TXT   = (218, 228, 198)
C_HUD_GOLD  = (255, 218,  50)
C_HUD_DIM   = (122, 142, 108)
C_HUD_RED   = (245,  68,  68)
C_HUD_BLU   = (112, 178, 255)
C_TERRAIN   = {
    "fairway": ( 88, 210,  88),
    "rough":   (162, 198,  72),
    "bunker":  (228, 198,  72),
    "green":   ( 48, 208, 108),
    "water":   ( 78, 152, 242),
    "ob":      (242,  72,  72),
    "tee":     (138, 198, 108),
}

_tree_cache: dict = {}   # hole_num → list of (hx, hy, height, rng_seed)
_fonts:      dict = {}   # (size, bold) → Font


def _font(size: int, bold: bool = False) -> pygame.font.Font:
    key = (size, bold)
    if key not in _fonts:
        _fonts[key] = pygame.font.SysFont("monospace", size, bold=bold)
    return _fonts[key]


# ── Camera ────────────────────────────────────────────────────────────────────
class Camera3D:
    __slots__ = ("hx", "hy", "sinθ", "cosθ")

    def __init__(self, ball_pos: tuple, aim_heading: float):
        bx, by   = ball_pos
        θ        = math.radians(aim_heading)
        self.hx  = bx - CAM_BEHIND * math.sin(θ)
        self.hy  = by - CAM_BEHIND * math.cos(θ)
        self.sinθ = math.sin(θ)
        self.cosθ = math.cos(θ)

    def to_cam(self, hx: float, hy: float, hz: float = 0.0) -> tuple:
        dx   = hx - self.hx
        dy   = hy - self.hy
        cx   = dx * self.cosθ - dy * self.sinθ
        cy   = dx * self.sinθ + dy * self.cosθ
        cz   = hz - EYE_H
        return cx, cy, cz

    def project(self, hx: float, hy: float, hz: float = 0.0):
        cx, cy, cz = self.to_cam(hx, hy, hz)
        if cy < CLIP_NEAR:
            return None
        return (int(WIN_W // 2 + cx / cy * FOCAL),
                int(HORIZON_Y  - cz / cy * FOCAL))

    def depth(self, hx: float, hy: float) -> float:
        _, cy, _ = self.to_cam(hx, hy)
        return cy


def _clip(verts: list, near: float = CLIP_NEAR) -> list:
    """Sutherland-Hodgman near-plane clip for camera-space (cx,cy,cz) vertices."""
    out = []
    n   = len(verts)
    for i in range(n):
        a    = verts[i]
        b    = verts[(i + 1) % n]
        a_in = a[1] >= near
        b_in = b[1] >= near
        if a_in:
            out.append(a)
        if a_in != b_in:
            t  = (near - a[1]) / (b[1] - a[1])
            out.append((
                a[0] + t * (b[0] - a[0]),
                near,
                a[2] + t * (b[2] - a[2]),
            ))
    return out


def _project_poly(cam: Camera3D, world_pts: list) -> list:
    """World polygon → screen polygon (clips + projects). Returns [] if invisible."""
    cam_pts = [cam.to_cam(x, y) for x, y in world_pts]
    clipped = _clip(cam_pts)
    if len(clipped) < 3:
        return []
    result = []
    for cx, cy, cz in clipped:
        result.append((int(WIN_W // 2 + cx / cy * FOCAL),
                       int(HORIZON_Y  - cz / cy * FOCAL)))
    return result


def _ellipse_pts(cx, cy, rx, ry, n=24) -> list:
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        pts.append((cx + rx * math.cos(a), cy + ry * math.sin(a)))
    return pts


def _circle_pts(cx, cy, r, n=16) -> list:
    return _ellipse_pts(cx, cy, r, r, n)


def _fairway_x_at_y(poly: list, y: float):
    """Return (min_x, max_x) where the polygon spans at world-y, or None."""
    xs = []
    n  = len(poly)
    for i in range(n):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % n]
        if (y0 <= y < y1) or (y1 <= y < y0):
            t = (y - y0) / (y1 - y0)
            xs.append(x0 + t * (x1 - x0))
    return (min(xs), max(xs)) if len(xs) >= 2 else None


# ── Sky ───────────────────────────────────────────────────────────────────────
def _render_sky(surface: pygame.Surface, tick: int):
    for y in range(HORIZON_Y + 2):
        t  = (y / HORIZON_Y) ** 1.6
        r  = int(C_SKY_TOP[0] + (C_SKY_HOR[0] - C_SKY_TOP[0]) * t)
        g  = int(C_SKY_TOP[1] + (C_SKY_HOR[1] - C_SKY_TOP[1]) * t)
        b  = int(C_SKY_TOP[2] + (C_SKY_HOR[2] - C_SKY_TOP[2]) * t)
        pygame.draw.line(surface, (r, g, b), (0, y), (WIN_W, y))

    # Slow-drifting cloud puffs
    off = (tick // 4000) % WIN_W
    clouds = [
        (280, 72, 165, 34, 0.88),
        (680, 52, 225, 42, 0.92),
        (970, 88, 135, 28, 0.85),
        (1230, 62, 175, 38, 0.90),
    ]
    for cx, cy, rx, ry, alpha in clouds:
        sx = int((cx - off) % WIN_W)
        for col, dr in [(C_CLOUD2, 6), (C_CLOUD, 0)]:
            r = pygame.Rect(sx - rx + dr, cy - ry + dr, (rx - dr) * 2, (ry - dr) * 2)
            pygame.draw.ellipse(surface, col, r)


# ── Ground / terrain ──────────────────────────────────────────────────────────
def _render_ground(surface: pygame.Surface, cam: Camera3D, hole: dict):
    # Rough fill below horizon
    pygame.draw.rect(surface, C_ROUGH,
                     (0, HORIZON_Y, WIN_W, WIN_H - HORIZON_Y))
    pygame.draw.rect(surface, C_ROUGH_DK,
                     (0, HORIZON_Y, WIN_W, 3))

    # Water
    for hz in hole.get("hazards", []):
        if hz["type"] == "water":
            pts = _project_poly(cam, hz["points"])
            if len(pts) >= 3:
                pygame.draw.polygon(surface, C_WATER, pts)
                pygame.draw.polygon(surface, C_WATER2, pts, 2)

    # Fairway with mowing stripes
    fw     = hole["fairway"]
    min_fy = min(y for _, y in fw)
    max_fy = max(y for _, y in fw)

    # Draw base fairway polygon
    base_pts = _project_poly(cam, fw)
    if len(base_pts) >= 3:
        pygame.draw.polygon(surface, C_FAIRWAY, base_pts)

    # Mowing stripes as alternating trapezoid bands (every 8 yards)
    STRIPE = 8
    y = min_fy + (STRIPE - min_fy % STRIPE) % STRIPE
    i = 0
    while y <= max_fy:
        b0 = _fairway_x_at_y(fw, y)
        b1 = _fairway_x_at_y(fw, y + STRIPE)
        if b0 and b1 and i % 2 == 0:
            pts = _project_poly(cam, [
                (b0[0], y), (b0[1], y),
                (b1[1], y + STRIPE), (b1[0], y + STRIPE),
            ])
            if len(pts) >= 3:
                pygame.draw.polygon(surface, C_FAIRWAY2, pts)
        y += STRIPE
        i += 1

    # Bunkers
    for b in hole.get("bunkers", []):
        if b["shape"] == "circle":
            pts = _project_poly(cam, _circle_pts(b["cx"], b["cy"], b["r"]))
            if len(pts) >= 3:
                pygame.draw.polygon(surface, C_BUNKER, pts)
                pygame.draw.polygon(surface, C_BUNKER2, pts, 2)

    # Green (two layers for gradient)
    g    = hole["green"]
    gpts = _project_poly(cam, _ellipse_pts(g["cx"], g["cy"], g["rx"], g["ry"]))
    if len(gpts) >= 3:
        pygame.draw.polygon(surface, C_GREEN, gpts)
    gpts2 = _project_poly(cam, _ellipse_pts(g["cx"], g["cy"],
                                              g["rx"] * 0.55, g["ry"] * 0.55, 16))
    if len(gpts2) >= 3:
        pygame.draw.polygon(surface, C_GREEN2, gpts2)

    # Tee box
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
    """Return cached tree list for this hole."""
    key = hole["hole"]
    if key not in _tree_cache:
        rng    = random.Random(key * 1337 + 17)
        bounds = hole.get("bounds", {"min_x": -70, "max_x": 70})
        trees  = []
        y      = 8.0
        while y < hole["total_yards"] - 8:
            for side in (-1, 1):
                edge = bounds["min_x"] if side < 0 else bounds["max_x"]
                for _ in range(rng.randint(1, 3)):
                    inw = rng.uniform(1, 18)
                    x   = edge + inw if side < 0 else edge - inw
                    ty  = y + rng.uniform(-5, 5)
                    if _terrain(x, ty, hole) == "rough":
                        h = rng.uniform(4.2, 9.0)
                        trees.append((x, ty, h))
            y += rng.uniform(9, 18)
        _tree_cache[key] = trees
    return _tree_cache[key]


def _draw_tree(surface: pygame.Surface, sx: int, base_sy: int,
               apex_sy: int, hw: int):
    total_h = max(4, base_sy - apex_sy)
    if total_h < 4 or hw < 2:
        return
    # Ground shadow
    shd_r = pygame.Rect(sx - hw // 2, base_sy - 2, hw, 5)
    pygame.draw.ellipse(surface, C_TREE_SHD, shd_r)
    # Trunk
    tk = max(1, hw // 7)
    th = max(2, total_h // 5)
    pygame.draw.rect(surface, C_TRUNK, (sx - tk, base_sy - th, tk * 2, th))
    # 3 crown tiers — each is a triangle, larger at base
    tiers = [
        (0.00, 0.44, 1.00, C_TREE_DK),
        (0.28, 0.70, 0.74, C_TREE_MID),
        (0.55, 1.00, 0.46, C_TREE_LT),
    ]
    for t0, t1, wf, col in tiers:
        ty0 = int(apex_sy + total_h * (1 - t1))
        ty1 = int(apex_sy + total_h * (1 - t0))
        w   = max(2, int(hw * wf))
        pygame.draw.polygon(surface, col,
                             [(sx, ty0), (sx - w, ty1), (sx + w, ty1)])


def _render_trees(surface: pygame.Surface, cam: Camera3D, hole: dict):
    trees   = _get_trees(hole)
    visible = []
    for hx, hy, height in trees:
        d = cam.depth(hx, hy)
        if CLIP_NEAR < d < FAR_CLIP:
            visible.append((d, hx, hy, height))
    visible.sort(reverse=True)  # far → near (painter's algorithm)

    for d, hx, hy, height in visible:
        base = cam.project(hx, hy, 0.0)
        apex = cam.project(hx, hy, height)
        if base is None or apex is None:
            continue
        sx,  base_sy = base
        _,   apex_sy = apex
        hw = max(2, int(height * 0.38 / d * FOCAL))
        _draw_tree(surface, sx, base_sy, apex_sy, hw)


# ── Distance markers ──────────────────────────────────────────────────────────
def _render_distance_markers(surface: pygame.Surface, cam: Camera3D, hole: dict):
    """Draw coloured poles at 100/150/200 yards from the pin along the centreline."""
    pin_x, pin_y = hole["pin"]
    tee_x, tee_y = hole["tee"]
    dx = tee_x - pin_x
    dy = tee_y - pin_y
    dl = math.hypot(dx, dy)
    if dl < 1:
        return
    ux, uy = dx / dl, dy / dl   # unit vector from pin toward tee
    lx, ly = -uy, ux            # left perpendicular

    POLE_H  = 1.8   # yards
    markers = [(100, C_DIST_100), (150, C_DIST_150), (200, C_DIST_200)]
    for yards, col in markers:
        if yards >= dl:
            continue
        mx = pin_x + ux * yards + lx * 5.5
        my = pin_y + uy * yards + ly * 5.5
        base = cam.project(mx, my, 0)
        top  = cam.project(mx, my, POLE_H)
        if base is None or top is None:
            continue
        d = cam.depth(mx, my)
        if d > FAR_CLIP or d < CLIP_NEAR:
            continue
        bx, by_s = base
        tx, ty_s = top
        lw = max(1, int(4 / d * FOCAL))
        pygame.draw.line(surface, C_POLE, (bx, by_s), (tx, ty_s), max(1, lw))
        # Coloured cap
        cap_r = max(2, lw + 1)
        pygame.draw.circle(surface, col, (tx, ty_s), cap_r)
        # Yardage label if close enough
        if d < 120:
            lbl = _font(max(10, int(18 / d * FOCAL))).render(str(yards), True, col)
            surface.blit(lbl, (tx + cap_r + 2, ty_s - lbl.get_height() // 2))


# ── Pin ───────────────────────────────────────────────────────────────────────
def _render_pin(surface: pygame.Surface, cam: Camera3D, hole: dict):
    px, py   = hole["pin"]
    POLE_HT  = 2.28   # yards (7 ft)
    FLAG_H   = 0.60
    FLAG_W   = 0.55

    d = cam.depth(px, py)
    if d < CLIP_NEAR or d > FAR_CLIP:
        return

    base  = cam.project(px, py, 0.0)
    top   = cam.project(px, py, POLE_HT)
    flag1 = cam.project(px, py, POLE_HT)
    flag2 = cam.project(px + FLAG_W, py, POLE_HT - FLAG_H * 0.5)
    flag3 = cam.project(px, py, POLE_HT - FLAG_H)

    if base is None or top is None:
        return

    lw = max(1, int(3 / d * FOCAL))
    pygame.draw.line(surface, C_POLE, base, top, lw)

    if flag1 and flag2 and flag3:
        pygame.draw.polygon(surface, C_FLAG, [flag1, flag2, flag3])

    # Hole cup — small dark circle on the green
    pygame.draw.circle(surface, (25, 25, 25), base, max(2, int(2.5 / d * FOCAL)))


# ── Ball ──────────────────────────────────────────────────────────────────────
def _render_ball_static(surface: pygame.Surface, cam: Camera3D, ball_pos: tuple):
    d   = cam.depth(*ball_pos)
    if d < CLIP_NEAR or d > FAR_CLIP:
        return
    sp  = cam.project(*ball_pos, 0.0)
    if sp is None:
        return
    sx, sy = sp
    r  = max(4, int(0.22 / d * FOCAL))
    # Shadow
    pygame.draw.circle(surface, C_BALL_SHD, (sx + 1, sy + 1), r)
    # Ball
    pygame.draw.circle(surface, C_BALL, (sx, sy), r)
    # Specular
    pygame.draw.circle(surface, (255, 255, 255),
                       (sx - max(1, r // 3), sy - max(1, r // 3)),
                       max(1, r // 3))


def _ball_world_pos(start, land, final, progress):
    """Return (wx, wy, wz) of ball at given animation progress."""
    CARRY = 0.82
    if progress <= CARRY:
        t  = progress / CARRY
        wx = start[0] + (land[0] - start[0]) * t
        wy = start[1] + (land[1] - start[1]) * t
        carry_d = math.hypot(land[0] - start[0], land[1] - start[1])
        max_h   = max(carry_d * 0.11, 2.5)
        wz      = t * (1 - t) * 4 * max_h
    else:
        t  = (progress - CARRY) / (1 - CARRY)
        wx = land[0] + (final[0] - land[0]) * t
        wy = land[1] + (final[1] - land[1]) * t
        wz = 0.0
    return wx, wy, wz


def _render_ball_flight(surface: pygame.Surface, cam: Camera3D,
                        start, land, final, progress: float):
    # Trail (ghost dots behind ball)
    for k in range(1, 8):
        tp = progress - k * 0.016
        if tp <= 0:
            break
        wx, wy, wz = _ball_world_pos(start, land, final, tp)
        sp = cam.project(wx, wy, wz)
        if sp is None:
            continue
        d  = cam.depth(wx, wy)
        r  = max(2, int(0.18 / max(d, 0.1) * FOCAL) - k)
        alpha = max(0, int(110 * (1 - k / 8)))
        col   = C_TRAIL if k <= 4 else C_TRAIL2
        ts    = pygame.Surface((r * 2 + 2, r * 2 + 2), pygame.SRCALPHA)
        pygame.draw.circle(ts, (*col, alpha), (r + 1, r + 1), r)
        surface.blit(ts, (sp[0] - r - 1, sp[1] - r - 1))

    # Ball
    wx, wy, wz = _ball_world_pos(start, land, final, progress)
    d   = cam.depth(wx, wy)
    sp  = cam.project(wx, wy, wz)
    if sp is None:
        return
    sx, sy = sp

    # Ground shadow (projects to ground level)
    gsp = cam.project(wx, wy, 0.0)
    if gsp and wz > 0.05:
        gx, gy = gsp
        sr = max(2, int(0.25 / max(d, 0.1) * FOCAL))
        shd = pygame.Surface((sr * 4, sr * 2), pygame.SRCALPHA)
        alpha_s = int(120 * (1 - min(wz / 8, 1.0)))
        pygame.draw.ellipse(shd, (0, 0, 0, alpha_s),
                            (0, 0, sr * 4, sr * 2))
        surface.blit(shd, (gx - sr * 2, gy - sr))

    r = max(4, int(0.22 / max(d, 0.1) * FOCAL))
    pygame.draw.circle(surface, C_BALL_SHD, (sx + 1, sy + 1), r)
    pygame.draw.circle(surface, C_BALL, (sx, sy), r)
    pygame.draw.circle(surface, (255, 255, 255),
                       (sx - max(1, r // 3), sy - max(1, r // 3)),
                       max(1, r // 3))


# ── Aim line ──────────────────────────────────────────────────────────────────
def _render_aim_line(surface: pygame.Surface, cam: Camera3D,
                     ball_pos: tuple, hole: dict):
    """Dashed aim line on the ground + reticle at the target."""
    bx, by   = ball_pos
    px, py   = hole["pin"]
    pin_dist = math.hypot(px - bx, py - by)
    # Project 30 points along aim direction
    steps  = 30
    length = max(20.0, min(pin_dist, 280.0))
    pts    = []
    for i in range(steps + 1):
        t      = i / steps
        wx     = bx + (px - bx) / pin_dist * length * t
        wy     = by + (py - by) / pin_dist * length * t
        sp     = cam.project(wx, wy, 0.0)
        if sp:
            pts.append((sp, t))

    # Draw dashes
    for j in range(len(pts) - 1):
        sp0, t0 = pts[j]
        sp1, t1 = pts[j + 1]
        if int(t0 * 20) % 2 == 0:
            alpha = int(200 - t0 * 100)
            col   = (255, 255, 255, alpha)
            ts    = pygame.Surface((abs(sp1[0]-sp0[0])+2, abs(sp1[1]-sp0[1])+2),
                                    pygame.SRCALPHA)
            pygame.draw.line(ts, col,
                             (1, 1),
                             (sp1[0]-sp0[0]+1, sp1[1]-sp0[1]+1), 1)
            surface.blit(ts, (min(sp0[0], sp1[0]), min(sp0[1], sp1[1])))

    # Reticle at end
    end = cam.project(bx + (px - bx) / pin_dist * length,
                      by + (py - by) / pin_dist * length,
                      0.0)
    if end:
        ex, ey = end
        rr = 6
        pygame.draw.circle(surface, (255, 80, 80), (ex, ey), rr, 1)
        pygame.draw.line(surface, (255, 80, 80), (ex - rr - 3, ey), (ex + rr + 3, ey), 1)
        pygame.draw.line(surface, (255, 80, 80), (ex, ey - rr - 3), (ex, ey + rr + 3), 1)


# ── HUD ───────────────────────────────────────────────────────────────────────
def _hud_box(surface, x, y, w, h, alpha=185):
    bg = pygame.Surface((w, h), pygame.SRCALPHA)
    bg.fill((*C_HUD_BG, alpha))
    surface.blit(bg, (x, y))
    pygame.draw.rect(surface, C_HUD_LN, (x, y, w, h), 1)


def _render_hud(surface: pygame.Surface, game, hole: dict, tick: int):
    # ── Top-left info box ─────────────────────────────────────────────────────
    f_lg = _font(20, True)
    f_md = _font(15)
    f_sm = _font(13)

    lines = []
    lines.append((f"HOLE {hole['hole']}  ·  PAR {hole['par']}  ·  {hole['total_yards']} yds",
                  f_lg, C_HUD_GOLD))

    if game and game.ball_pos:
        px, py   = hole["pin"]
        bx, by   = game.ball_pos
        dist     = math.hypot(px - bx, py - by)
        terrain  = game.current_terrain
        tc       = C_TERRAIN.get(terrain, C_HUD_TXT)
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

    # Size box to content
    pad = 10
    box_w = max(s.render(t, True, (0,0,0)).get_width() for t, s, _ in lines) + pad * 2
    box_h = sum(s.get_height() + 4 for _, s, _ in lines) + pad * 2
    _hud_box(surface, 12, 12, box_w, box_h)
    cy = 12 + pad
    for text, fnt, col in lines:
        surf = fnt.render(text, True, col)
        surface.blit(surf, (12 + pad, cy))
        cy += surf.get_height() + 4

    # ── Shot counter ──────────────────────────────────────────────────────────
    if game:
        sc_surf = f_lg.render(f"Shot {game.shot_count + 1}", True, C_HUD_TXT)
        sx = 12
        sy = 12 + box_h + 6
        _hud_box(surface, sx, sy, sc_surf.get_width() + 20, sc_surf.get_height() + 10)
        surface.blit(sc_surf, (sx + 10, sy + 5))

    # ── Wind box (top right) ──────────────────────────────────────────────────
    if game:
        ws = game.wind_speed
        wd = game.wind_dir
        dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        dir_lbl = dirs[int((wd + 22.5) / 45) % 8]
        wind_txt = "CALM" if ws < 1 else f"{ws:.0f} mph  {dir_lbl}"
        wsurf = f_md.render(f"WIND  {wind_txt}", True, C_HUD_BLU)
        wx_pos = WIN_W - wsurf.get_width() - 35
        wy_pos = 12
        _hud_box(surface, wx_pos - 10, wy_pos, wsurf.get_width() + 20,
                 wsurf.get_height() + 42)
        surface.blit(wsurf, (wx_pos, wy_pos + 6))
        _draw_wind_arrow(surface, wx_pos + wsurf.get_width() // 2,
                         wy_pos + 32, ws, wd)

    # ── Scorecard (top right below wind) ─────────────────────────────────────
    if game:
        sc_x = WIN_W - 195
        sc_y = 80
        _hud_box(surface, sc_x - 8, sc_y, 185, (len(game.all_holes) + 1) * 18 + 16)
        surface.blit(f_sm.render("SCORECARD", True, C_HUD_TXT), (sc_x, sc_y + 6))
        for i, h in enumerate(game.all_holes):
            sc_data = game.scores[i]
            score   = sc_data.get("score")
            par     = h["par"]
            yy      = sc_y + 24 + i * 17
            if score is not None:
                diff  = score - par
                col   = C_HUD_RED if diff > 0 else (100, 230, 100) if diff < 0 else C_HUD_TXT
                sign  = "+" if diff > 0 else ""
                surface.blit(f_sm.render(f"H{i+1}: {score}  ({sign}{diff})", True, col),
                             (sc_x, yy))
            elif i == game.current_hole_idx:
                surface.blit(f_sm.render(f"H{i+1}: {game.shot_count} →", True, C_HUD_GOLD),
                             (sc_x, yy))
            else:
                surface.blit(f_sm.render(f"H{i+1}: --", True, C_HUD_DIM), (sc_x, yy))

    # ── R10 status ────────────────────────────────────────────────────────────
    import r10_server as _r10
    r10_on = (not _r10.shot_queue.empty()) or (game and game.shot_count > 0)
    dot_c  = (70, 220, 70) if r10_on else (200, 75, 75)
    pygame.draw.circle(surface, dot_c, (WIN_W - 18, WIN_H - 18), 7)
    rlbl = f_sm.render("R10" if r10_on else "NO R10", True, dot_c)
    surface.blit(rlbl, (WIN_W - 18 - rlbl.get_width() - 6, WIN_H - 18 - rlbl.get_height() // 2))

    # ── Controls bar at bottom ────────────────────────────────────────────────
    hints = "← → AIM   T SWING   C CENTER   H HOLE OUT   N NEXT   R RESTART"
    hint_surf = f_sm.render(hints, True, C_HUD_DIM)
    hx_pos = (WIN_W - hint_surf.get_width()) // 2
    hy_pos = WIN_H - hint_surf.get_height() - 8
    _hud_box(surface, hx_pos - 8, hy_pos - 4,
             hint_surf.get_width() + 16, hint_surf.get_height() + 8, alpha=130)
    surface.blit(hint_surf, (hx_pos, hy_pos))


def _draw_wind_arrow(surface, cx, cy, speed, direction):
    if speed < 0.5:
        lbl = _font(11).render("CALM", True, C_HUD_BLU)
        surface.blit(lbl, (cx - lbl.get_width() // 2, cy - lbl.get_height() // 2))
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

    mini = pygame.Surface((MINI_W, MINI_H))
    mini_rect = pygame.Rect(0, 0, MINI_W, MINI_H)
    vp = Viewport(mini_rect, hole)
    draw_hole(mini, vp, hole,
              ball_pos=ball_pos,
              shot_history=shot_history,
              aim_heading=aim_heading)

    # Border + label
    pygame.draw.rect(mini, (80, 110, 72), mini_rect, 2)
    lbl = _font(11).render("MAP", True, (170, 200, 150))
    mini.blit(lbl, (4, 3))

    # Dim overlay
    dim = pygame.Surface((MINI_W, MINI_H), pygame.SRCALPHA)
    dim.fill((0, 0, 0, 30))
    mini.blit(dim, (0, 0))

    surface.blit(mini, (MINI_X, MINI_Y))
    pygame.draw.rect(surface, (60, 90, 55), (MINI_X, MINI_Y, MINI_W, MINI_H), 2)


# ── Public entry point ────────────────────────────────────────────────────────
def render_scene(
    surface:       pygame.Surface,
    hole:          dict,
    ball_pos:      tuple,
    aim_heading:   float,
    shot_history:  list,
    anim_data=None,    # (start, land, final, progress) or None
    game=None,
    tick:          int = 0,
):
    """Render one frame of the 3D golf simulator view."""
    cam = Camera3D(ball_pos, aim_heading)

    _render_sky(surface, tick)
    _render_ground(surface, cam, hole)
    _render_trees(surface, cam, hole)
    _render_distance_markers(surface, cam, hole)
    _render_pin(surface, cam, hole)

    # Shot landing marks
    for shot in shot_history:
        sp = cam.project(*shot["land"], 0.0)
        if sp:
            d = cam.depth(*shot["land"])
            r = max(2, int(0.18 / max(d, 0.1) * FOCAL))
            pygame.draw.circle(surface, C_LAND_MK, sp, r, 1)

    # Aim line (not shown while animating)
    if anim_data is None:
        _render_aim_line(surface, cam, ball_pos, hole)

    # Ball
    if anim_data:
        start, land, final, progress = anim_data
        _render_ball_flight(surface, cam, start, land, final, progress)
    else:
        _render_ball_static(surface, cam, ball_pos)

    # HUD overlays
    _render_hud(surface, game, hole, tick)
    _render_mini_map(surface, hole,
                     ball_pos     = (None if anim_data else ball_pos),
                     shot_history = shot_history,
                     aim_heading  = (None if anim_data else aim_heading))
