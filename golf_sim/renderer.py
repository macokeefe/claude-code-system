"""
Pygame rendering helpers — improved visual style.
"""
import math
import pygame

# ── Palette ───────────────────────────────────────────────────────────────────
C_OB            = (105,  68,  48)   # brownish-red: out-of-bounds
C_OB_STRIPE     = ( 88,  55,  38)
C_ROUGH         = ( 68, 118,  48)
C_ROUGH_EDGE    = ( 54,  96,  38)
C_FAIRWAY       = ( 90, 165,  70)
C_FAIRWAY_EDGE  = ( 70, 135,  56)
C_GREEN         = ( 46, 168,  84)
C_GREEN_MID     = ( 60, 185,  98)
C_GREEN_CTR     = ( 76, 202, 112)
C_GREEN_EDGE    = ( 30, 140,  64)
C_BUNKER        = (222, 206, 142)
C_BUNKER_EDGE   = (186, 170, 108)
C_WATER         = ( 50, 140, 212)
C_WATER_DARK    = ( 34, 112, 175)
C_WATER_SHIMMER = (125, 190, 255)
C_TEE           = (122, 188,  98)
C_PIN_POLE      = ( 38,  38,  38)
C_PIN_FLAG      = (212,  42,  42)
C_BALL          = (255, 255, 255)
C_BALL_SHADOW   = (135, 135, 135)
C_TRACER_ARC    = (255, 192,  48)   # warm gold for flight arc
C_TRACER_SHADOW = ( 75, 105,  55)   # ground shadow under arc
C_TRACER_ROLL   = (192, 192, 108)   # lighter for roll
C_LAND_MARK     = (255, 140,  38)
C_PROX_RING     = (148, 182, 138)
C_PANEL_BG      = ( 18,  28,  18)
C_PANEL_LINE    = ( 44,  65,  44)
C_TEXT          = (210, 216, 190)
C_TEXT_DIM      = (112, 132, 102)
C_HIGHLIGHT     = (255, 220,  50)

# Golf score colors (standard convention)
C_SCORE_EAGLE   = ( 78, 138, 255)
C_SCORE_BIRDIE  = ( 78, 208,  88)
C_SCORE_PAR     = (210, 216, 190)
C_SCORE_BOGEY   = (240, 152,  48)
C_SCORE_DOUBLE  = (238,  75,  75)
C_SCORE_WORSE   = (198,  55,  55)

C_TERRAIN_LABEL = {
    "fairway": ( 90, 212,  90),
    "rough":   (155, 195,  70),
    "bunker":  (222, 195,  70),
    "green":   ( 46, 212, 106),
    "water":   ( 72, 148, 235),
    "ob":      (232,  70,  70),
    "tee":     (132, 195, 106),
}

# ── Club recommendations ──────────────────────────────────────────────────────
_CLUBS = [
    (9999, 230, "Driver"),
    ( 230, 208, "3-wood"),
    ( 208, 190, "5-wood"),
    ( 190, 175, "3-iron"),
    ( 175, 160, "4-iron"),
    ( 160, 147, "5-iron"),
    ( 147, 134, "6-iron"),
    ( 134, 121, "7-iron"),
    ( 121, 108, "8-iron"),
    ( 108,  95, "9-iron"),
    (  95,  82, "PW"),
    (  82,  68, "GW"),
    (  68,  52, "SW"),
    (  52,   0, "LW"),
]

def suggest_club(dist: float) -> str:
    if dist <= 6:
        return "Putter"
    for hi, lo, club in _CLUBS:
        if lo <= dist < hi:
            return club
    return "Driver"


def score_color(diff: int):
    if   diff <= -2: return C_SCORE_EAGLE
    elif diff == -1: return C_SCORE_BIRDIE
    elif diff ==  0: return C_SCORE_PAR
    elif diff ==  1: return C_SCORE_BOGEY
    elif diff ==  2: return C_SCORE_DOUBLE
    else:            return C_SCORE_WORSE


# ── Viewport ──────────────────────────────────────────────────────────────────
class Viewport:
    """Maps world coordinates (yards from tee) to screen pixels."""

    def __init__(self, screen_rect: pygame.Rect, hole: dict):
        margin_x = 35
        margin_y = 42

        bounds   = hole.get("bounds", {"min_x": -70, "max_x": 70})
        world_w  = (bounds["max_x"] - bounds["min_x"]) + 2 * margin_x
        world_h  = hole["total_yards"] + 2 * margin_y

        sx = screen_rect.width  / world_w
        sy = screen_rect.height / world_h
        self.scale = min(sx, sy)

        mid_x  = (bounds["min_x"] + bounds["max_x"]) / 2
        self.ox = screen_rect.centerx - mid_x * self.scale
        self.oy = screen_rect.bottom  + margin_y * self.scale

        self.rect = screen_rect

    def w2s(self, x: float, y: float) -> tuple:
        return (int(self.ox + x * self.scale),
                int(self.oy - y * self.scale))

    def r2s(self, r: float) -> int:
        return max(2, int(r * self.scale))


# ── Public drawing functions ──────────────────────────────────────────────────

def draw_hole(surface: pygame.Surface,
              vp: Viewport,
              hole: dict,
              ball_pos=None,
              shot_history=None):
    """Render the complete hole."""

    # 1. OB background (brownish-red, covers whole viewport)
    pygame.draw.rect(surface, C_OB, vp.rect)

    # 2. In-bounds rough area (lighter green rectangle within bounds)
    bounds    = hole.get("bounds", {"min_x": -70, "max_x": 70})
    rough_pts = [
        vp.w2s(bounds["min_x"], -20),
        vp.w2s(bounds["max_x"], -20),
        vp.w2s(bounds["max_x"], hole["total_yards"] + 25),
        vp.w2s(bounds["min_x"], hole["total_yards"] + 25),
    ]
    pygame.draw.polygon(surface, C_ROUGH, rough_pts)

    # 3. Water hazards (drawn behind fairway)
    for hz in hole.get("hazards", []):
        if hz["type"] == "water":
            pts = [vp.w2s(x, y) for x, y in hz["points"]]
            if len(pts) >= 3:
                pygame.draw.polygon(surface, C_WATER, pts)
                _draw_water_shimmer(surface, vp, hz["points"])
                pygame.draw.polygon(surface, C_WATER_DARK, pts, 2)

    # 4. Fairway
    fw = [vp.w2s(x, y) for x, y in hole["fairway"]]
    if len(fw) >= 3:
        pygame.draw.polygon(surface, C_FAIRWAY, fw)
        pygame.draw.polygon(surface, C_FAIRWAY_EDGE, fw, 2)

    # 5. Bunkers
    for b in hole.get("bunkers", []):
        if b["shape"] == "circle":
            cx, cy = vp.w2s(b["cx"], b["cy"])
            r = vp.r2s(b["r"])
            pygame.draw.circle(surface, C_BUNKER, (cx, cy), r)
            if r > 5:
                pygame.draw.circle(surface, C_BUNKER_EDGE, (cx, cy), r, max(2, r // 5))
            pygame.draw.circle(surface, C_BUNKER_EDGE, (cx, cy), r, 1)

    # 6. Green — concentric ellipses for a gradient-light-center effect
    g    = hole["green"]
    gcx, gcy = vp.w2s(g["cx"], g["cy"])
    grx  = vp.r2s(g["rx"])
    gry  = vp.r2s(g["ry"])
    for shade, scale in [(C_GREEN, 1.0), (C_GREEN_MID, 0.65), (C_GREEN_CTR, 0.35)]:
        erx = max(2, int(grx * scale))
        ery = max(2, int(gry * scale))
        er  = pygame.Rect(gcx - erx, gcy - ery, erx * 2, ery * 2)
        pygame.draw.ellipse(surface, shade, er)
    pygame.draw.ellipse(surface, C_GREEN_EDGE,
                         pygame.Rect(gcx - grx, gcy - gry, grx * 2, gry * 2), 2)

    # 7. Tee box
    tb  = hole["tee_box"]
    tcx, tcy = vp.w2s(tb["cx"], tb["cy"])
    tw  = vp.r2s(tb["w"] / 2)
    th  = vp.r2s(tb["h"] / 2)
    tee_rect = pygame.Rect(tcx - tw, tcy - th, tw * 2, th * 2)
    pygame.draw.rect(surface, C_TEE, tee_rect)
    pygame.draw.rect(surface, C_FAIRWAY_EDGE, tee_rect, 1)

    # 8. Shot tracers
    if shot_history:
        for shot in shot_history:
            _draw_tracer(surface, vp, shot)

    # 9. Yardage ticks along centre
    _draw_yardage_ticks(surface, vp, hole)

    # 10. Proximity rings around the pin
    _draw_proximity_rings(surface, vp, hole["pin"])

    # 11. Pin / flag
    px, py  = vp.w2s(*hole["pin"])
    pole_h  = max(16, int(24 * vp.scale))
    pygame.draw.line(surface, C_PIN_POLE, (px, py), (px, py - pole_h), 2)
    flag_pts = [
        (px, py - pole_h),
        (px + max(9, int(15 * vp.scale)), py - int(pole_h * 0.62)),
        (px, py - int(pole_h * 0.30)),
    ]
    pygame.draw.polygon(surface, C_PIN_FLAG, flag_pts)
    pygame.draw.circle(surface, C_PIN_POLE, (px, py), max(2, int(3 * vp.scale)))

    # 12. Ball and line-to-pin
    if ball_pos:
        _draw_ball(surface, vp, ball_pos)
        _draw_dashed_line(surface, vp, ball_pos, hole["pin"])


def draw_animated_ball(surface: pygame.Surface,
                       vp: Viewport,
                       start, land, end,
                       progress: float):
    """Draw ball in flight (progress 0→1) with a parabolic screen-space arc."""
    CARRY_PHASE = 0.82

    if progress <= CARRY_PHASE:
        t  = progress / CARRY_PHASE
        wx = start[0] + (land[0] - start[0]) * t
        wy = start[1] + (land[1] - start[1]) * t
        sx, sy = vp.w2s(wx, wy)

        # Parabolic arc height in screen pixels
        carry_px = math.hypot(vp.w2s(*land)[0] - vp.w2s(*start)[0],
                               vp.w2s(*land)[1] - vp.w2s(*start)[1])
        arc_h = int(t * (1 - t) * 4 * max(40, carry_px * 0.28))
        sy   -= arc_h

        # Ground shadow (grows as ball rises)
        gx, gy  = vp.w2s(wx, wy)
        sr      = max(2, int((2 + t * (1 - t) * 4) * vp.scale))
        pygame.draw.circle(surface, (20, 38, 18), (gx, gy), sr)
    else:
        t  = (progress - CARRY_PHASE) / (1 - CARRY_PHASE)
        wx = land[0] + (end[0] - land[0]) * t
        wy = land[1] + (end[1] - land[1]) * t
        sx, sy = vp.w2s(wx, wy)

    _draw_ball(surface, vp, None, screen_pos=(sx, sy))


def draw_stats_panel(surface: pygame.Surface,
                     rect: pygame.Rect,
                     game,
                     hole: dict,
                     font_lg: pygame.font.Font,
                     font_md: pygame.font.Font,
                     font_sm: pygame.font.Font,
                     wind_speed: float,
                     wind_dir:   float):
    """Render the right-side info panel."""
    pygame.draw.rect(surface, C_PANEL_BG, rect)
    pygame.draw.line(surface, C_PANEL_LINE, rect.topleft, rect.bottomleft, 2)

    x = rect.left + 14
    y = rect.top  + 14

    def line(txt, font=font_md, color=C_TEXT, gap=5):
        nonlocal y
        surf = font.render(str(txt), True, color)
        surface.blit(surf, (x, y))
        y += surf.get_height() + gap

    def sep(size=10):
        nonlocal y
        pygame.draw.line(surface, C_PANEL_LINE,
                         (x, y + 3), (rect.right - 14, y + 3), 1)
        y += size

    # ── Hole header ────────────────────────────────────────────────────────
    line(f"HOLE {hole['hole']}", font_lg, C_HIGHLIGHT, gap=2)
    line(f"Par {hole['par']}  ·  {hole['total_yards']} yds",
         font_md, (162, 200, 158))
    line(hole.get("description", ""), font_sm, C_TEXT_DIM)
    sep()

    # ── Ball status ────────────────────────────────────────────────────────
    if game.ball_pos:
        pin    = hole["pin"]
        bx, by = game.ball_pos
        dist   = math.hypot(pin[0] - bx, pin[1] - by)
        line(f"To pin:  {int(dist)} yds", font_md, C_HIGHLIGHT)
        terrain = game.current_terrain
        tc = C_TERRAIN_LABEL.get(terrain, C_TEXT)
        line(f"Lie:     {terrain.upper()}", font_md, tc)
        line(f"Club:    {suggest_club(dist)}", font_md, (172, 215, 232))
    sep()

    # ── Wind ──────────────────────────────────────────────────────────────
    line("WIND", font_md, (162, 206, 230))
    if wind_speed < 1:
        line("CALM", font_lg, (186, 214, 250))
    else:
        dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        d    = dirs[int((wind_dir + 22.5) / 45) % 8]
        line(f"{wind_speed:.0f} mph  {d}", font_lg, (190, 216, 255))
    _draw_wind_arrow(surface, x, y, wind_speed, wind_dir)
    y += 36
    sep()

    # ── Last shot ─────────────────────────────────────────────────────────
    if game.last_shot:
        ls = game.last_shot
        line("LAST SHOT", font_md, (170, 205, 170))
        line(f"Ball speed:  {ls['speed']:.0f} mph",    font_sm)
        line(f"Carry:       {ls['carry']:.0f} yds",    font_sm)
        line(f"Total:       {ls['total']:.0f} yds",    font_sm)
        line(f"Launch:      {ls['vla']:.1f} / {ls['hla']:+.1f} deg", font_sm)
        line(f"Backspin:    {ls['backspin']:.0f} rpm", font_sm)
    sep()

    # ── Scorecard ─────────────────────────────────────────────────────────
    line("SCORECARD", font_md, (170, 205, 170))
    for i, h in enumerate(game.all_holes):
        sc    = game.scores[i]
        score = sc.get("score")
        shots = sc.get("shots", 0)
        par   = h["par"]
        if score is not None:
            diff  = score - par
            color = score_color(diff)
            sign  = "+" if diff > 0 else ""
            line(f"H{i+1}: {score}  ({sign}{diff})", font_sm, color, gap=3)
        elif i == game.current_hole_idx:
            line(f"H{i+1}: {shots} shot{'s' if shots != 1 else ''}",
                 font_sm, C_HIGHLIGHT, gap=3)
        else:
            line(f"H{i+1}: --", font_sm, C_TEXT_DIM, gap=3)
    sep()

    # ── Controls ──────────────────────────────────────────────────────────
    for hint in ["T = test shot", "R = restart hole",
                 "N = next hole", "H = hole it", "ESC = quit"]:
        line(hint, font_sm, C_TEXT_DIM, gap=2)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _draw_ball(surface, vp, world_pos, screen_pos=None):
    """Draw ball with drop shadow and specular highlight."""
    if screen_pos is None:
        screen_pos = vp.w2s(*world_pos)
    sx, sy = screen_pos
    r = max(4, int(5 * vp.scale))

    # Drop shadow
    pygame.draw.circle(surface, (22, 38, 18), (sx + 1, sy + 2), r)
    # Ball body
    pygame.draw.circle(surface, C_BALL, (sx, sy), r)
    # Shading ring
    pygame.draw.circle(surface, C_BALL_SHADOW, (sx, sy), r, 1)
    # Specular highlight
    hi_r = max(1, r // 3)
    pygame.draw.circle(surface, (255, 255, 255),
                        (sx - max(1, r // 3), sy - max(1, r // 3)), hi_r)


def _draw_tracer(surface, vp, shot):
    """Draw parabolic flight arc, ground shadow, and roll trace."""
    start  = shot["from"]
    land   = shot["land"]
    end    = shot["to"]

    n = 50

    # Compute arc peak height from carry distance in screen space
    sx0, sy0 = vp.w2s(*start)
    sxl, syl = vp.w2s(*land)
    carry_px = math.hypot(sxl - sx0, syl - sy0)
    peak_px  = max(22, int(carry_px * 0.26))

    # ── Flight arc ────────────────────────────────────────────────────────
    arc_pts = []
    for i in range(n + 1):
        t  = i / n
        wx = start[0] + (land[0] - start[0]) * t
        wy = start[1] + (land[1] - start[1]) * t
        sx, sy = vp.w2s(wx, wy)
        h  = int(t * (1 - t) * 4 * peak_px)
        arc_pts.append((sx, sy - h))

    for i in range(len(arc_pts) - 1):
        t      = i / (len(arc_pts) - 1)
        bright = 0.55 + 0.45 * (1 - abs(2 * t - 1))   # peak brightness at apex
        r = min(255, int(255 * bright))
        g = min(255, int(192 * bright))
        b = min(255, int(46  * bright))
        pygame.draw.line(surface, (r, g, b), arc_pts[i], arc_pts[i + 1], 2)

    # ── Ground shadow under carry (dashed) ────────────────────────────────
    for i in range(0, n, 6):
        t1 = i / n
        t2 = min((i + 3) / n, 1.0)
        p1 = vp.w2s(start[0] + (land[0] - start[0]) * t1,
                     start[1] + (land[1] - start[1]) * t1)
        p2 = vp.w2s(start[0] + (land[0] - start[0]) * t2,
                     start[1] + (land[1] - start[1]) * t2)
        pygame.draw.line(surface, C_TRACER_SHADOW, p1, p2, 1)

    # ── Roll trace ────────────────────────────────────────────────────────
    if math.hypot(end[0] - land[0], end[1] - land[1]) > 0.5:
        roll_pts = [
            vp.w2s(land[0] + (end[0] - land[0]) * i / 20,
                    land[1] + (end[1] - land[1]) * i / 20)
            for i in range(21)
        ]
        if len(roll_pts) >= 2:
            pygame.draw.lines(surface, C_TRACER_ROLL, False, roll_pts, 2)

    # ── Landing marker ────────────────────────────────────────────────────
    lx, ly = vp.w2s(*land)
    pygame.draw.circle(surface, C_LAND_MARK, (lx, ly), 5, 2)
    pygame.draw.circle(surface, (255, 200, 105), (lx, ly), 2)


def _draw_proximity_rings(surface, vp, pin_pos, rings=(10, 20, 30)):
    """Dashed distance rings around the pin."""
    px, py = vp.w2s(*pin_pos)
    font   = pygame.font.SysFont("monospace", 10)
    for dist in rings:
        r = vp.r2s(dist)
        if r < 8:
            continue
        segs = max(32, int(r * 0.55))
        for i in range(segs):
            if i % 4 == 3:   # leave a gap every 4th segment → dashes
                continue
            a1 = 2 * math.pi * i       / segs
            a2 = 2 * math.pi * (i + 1) / segs
            x1 = int(px + r * math.cos(a1))
            y1 = int(py + r * math.sin(a1))
            x2 = int(px + r * math.cos(a2))
            y2 = int(py + r * math.sin(a2))
            pygame.draw.line(surface, C_PROX_RING, (x1, y1), (x2, y2), 1)
        lbl = font.render(f"{dist}y", True, C_PROX_RING)
        surface.blit(lbl, (px + r + 3, py - lbl.get_height() // 2))


def _draw_water_shimmer(surface, vp, points):
    """Horizontal shimmer stripes over a water polygon."""
    if not points:
        return
    min_y = min(y for _, y in points)
    max_y = max(y for _, y in points)
    min_x = min(x for x, _ in points)
    max_x = max(x for x, _ in points)
    span  = max_x - min_x
    if span < 1:
        return

    for yd in range(int(min_y) + 4, int(max_y), 8):
        if (int(yd) // 8) % 2 == 0:
            # Short shimmer segment — random-ish but deterministic per yd
            t     = ((yd * 37) % 100) / 100.0       # pseudo-random 0-1
            seg_x = min_x + span * (0.1 + t * 0.7)
            seg_w = span * (0.12 + ((yd * 53) % 100) / 800.0)
            sx1, sy = vp.w2s(seg_x,          yd)
            sx2, _  = vp.w2s(seg_x + seg_w,  yd)
            # Clip to viewport
            sx1 = max(sx1, vp.rect.left)
            sx2 = min(sx2, vp.rect.right)
            if sx2 > sx1:
                pygame.draw.line(surface, C_WATER_SHIMMER,
                                 (sx1, sy), (sx2, sy),
                                 max(1, int(1.5 * vp.scale)))


def _draw_dashed_line(surface, vp, world_a, world_b):
    ax, ay = vp.w2s(*world_a)
    bx, by = vp.w2s(*world_b)
    total  = math.hypot(bx - ax, by - ay)
    if total < 1:
        return
    dx, dy = (bx - ax) / total, (by - ay) / total
    on, d  = True, 0.0
    while d < total:
        x1 = int(ax + dx * d)
        y1 = int(ay + dy * d)
        d  = min(d + 10, total)
        x2 = int(ax + dx * d)
        y2 = int(ay + dy * d)
        if on:
            pygame.draw.line(surface, (172, 172, 72), (x1, y1), (x2, y2), 1)
        d  += 10
        on  = not on


def _draw_yardage_ticks(surface, vp, hole):
    font = pygame.font.SysFont("monospace", 11)
    for yd in range(50, hole["total_yards"], 50):
        sx, sy = vp.w2s(0, yd)
        if not vp.rect.collidepoint(sx, sy):
            continue
        pygame.draw.line(surface, (172, 205, 152), (sx - 7, sy), (sx + 7, sy), 1)
        lbl = font.render(str(yd), True, (172, 205, 152))
        surface.blit(lbl, (sx + 9, sy - lbl.get_height() // 2))


def _draw_wind_arrow(surface, x, y, speed, direction):
    if speed < 0.5:
        return
    cx, cy = x + 15, y + 15
    length = min(28, int(speed * 1.6))
    angle  = math.radians(direction)
    ex = cx + int(math.sin(angle) * length)
    ey = cy - int(math.cos(angle) * length)
    pygame.draw.line(surface, (190, 216, 255), (cx, cy), (ex, ey), 2)
    for da in (0.44, -0.44):
        hx = ex - int(math.sin(angle + da) * 8)
        hy = ey + int(math.cos(angle + da) * 8)
        pygame.draw.line(surface, (190, 216, 255), (ex, ey), (hx, hy), 2)
