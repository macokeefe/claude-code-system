"""
Pygame rendering helpers: viewport transform, hole drawing, HUD panel.
"""
import math
import pygame

# ── Palette ───────────────────────────────────────────────────────────────────
C_ROUGH        = ( 72, 120,  52)
C_ROUGH_EDGE   = ( 58, 100,  42)
C_FAIRWAY      = ( 96, 172,  76)
C_FAIRWAY_EDGE = ( 76, 145,  60)
C_GREEN        = ( 52, 180,  92)
C_GREEN_EDGE   = ( 36, 150,  72)
C_BUNKER       = (228, 210, 148)
C_BUNKER_EDGE  = (195, 175, 115)
C_WATER        = ( 56, 152, 220)
C_WATER_EDGE   = ( 38, 120, 185)
C_TEE          = (130, 195, 105)
C_PIN_POLE     = ( 45,  45,  45)
C_PIN_FLAG     = (220,  50,  50)
C_BALL         = (255, 255, 255)
C_BALL_SHADOW  = (160, 160, 160)
C_TRACER_FLY   = (255, 190,  50)
C_TRACER_ROLL  = (200, 200, 130)
C_LAND_MARK    = (255, 140,  40)
C_PANEL_BG     = ( 22,  34,  22)
C_PANEL_LINE   = ( 50,  72,  50)
C_TEXT         = (215, 220, 195)
C_TEXT_DIM     = (120, 140, 110)
C_HIGHLIGHT    = (255, 220,  55)
C_OK           = (100, 230, 110)
C_BAD          = (240,  80,  80)
C_TERRAIN      = {
    "fairway": ( 96, 210,  96),
    "rough":   (165, 200,  75),
    "bunker":  (230, 200,  75),
    "green":   ( 50, 210, 110),
    "water":   ( 80, 155, 240),
    "ob":      (240,  75,  75),
    "tee":     (140, 200, 110),
}


class Viewport:
    """Maps world coordinates (yards from tee) to screen pixels."""

    def __init__(self, screen_rect: pygame.Rect, hole: dict):
        margin_x = 35  # yards of breathing room
        margin_y = 40

        bounds   = hole.get("bounds", {"min_x": -70, "max_x": 70})
        world_w  = (bounds["max_x"] - bounds["min_x"]) + 2 * margin_x
        world_h  = hole["total_yards"] + 2 * margin_y

        sx = screen_rect.width  / world_w
        sy = screen_rect.height / world_h
        self.scale = min(sx, sy)

        mid_x = (bounds["min_x"] + bounds["max_x"]) / 2
        self.ox = screen_rect.centerx - mid_x * self.scale
        self.oy = screen_rect.bottom  + margin_y * self.scale  # tee near bottom

        self.rect = screen_rect

    def w2s(self, x: float, y: float) -> tuple:
        return (int(self.ox + x * self.scale),
                int(self.oy - y * self.scale))

    def r2s(self, r: float) -> int:
        return max(2, int(r * self.scale))


def draw_hole(surface: pygame.Surface,
              vp: Viewport,
              hole: dict,
              ball_pos=None,
              shot_history=None):
    """Render the full hole into surface."""
    pygame.draw.rect(surface, C_ROUGH, vp.rect)

    # Water (behind fairway)
    for hz in hole.get("hazards", []):
        if hz["type"] == "water":
            pts = [vp.w2s(x, y) for x, y in hz["points"]]
            if len(pts) >= 3:
                pygame.draw.polygon(surface, C_WATER, pts)
                pygame.draw.polygon(surface, C_WATER_EDGE, pts, 2)

    # Fairway
    fw = [vp.w2s(x, y) for x, y in hole["fairway"]]
    if len(fw) >= 3:
        pygame.draw.polygon(surface, C_FAIRWAY, fw)
        pygame.draw.polygon(surface, C_FAIRWAY_EDGE, fw, 2)

    # Bunkers
    for b in hole.get("bunkers", []):
        if b["shape"] == "circle":
            cx, cy = vp.w2s(b["cx"], b["cy"])
            r = vp.r2s(b["r"])
            pygame.draw.circle(surface, C_BUNKER, (cx, cy), r)
            pygame.draw.circle(surface, C_BUNKER_EDGE, (cx, cy), r, 2)

    # Green
    g   = hole["green"]
    gcx, gcy = vp.w2s(g["cx"], g["cy"])
    grx = vp.r2s(g["rx"])
    gry = vp.r2s(g["ry"])
    green_rect = pygame.Rect(gcx - grx, gcy - gry, grx * 2, gry * 2)
    pygame.draw.ellipse(surface, C_GREEN, green_rect)
    pygame.draw.ellipse(surface, C_GREEN_EDGE, green_rect, 2)

    # Tee box
    tb  = hole["tee_box"]
    tcx, tcy = vp.w2s(tb["cx"], tb["cy"])
    tw  = vp.r2s(tb["w"] / 2)
    th  = vp.r2s(tb["h"] / 2)
    tee_rect = pygame.Rect(tcx - tw, tcy - th, tw * 2, th * 2)
    pygame.draw.rect(surface, C_TEE, tee_rect)
    pygame.draw.rect(surface, C_FAIRWAY_EDGE, tee_rect, 1)

    # Shot tracers
    if shot_history:
        for shot in shot_history:
            _draw_tracer(surface, vp, shot["from"], shot["land"], shot["to"])

    # Yardage tick marks along center line
    _draw_yardage_ticks(surface, vp, hole)

    # Pin / flag
    px, py = vp.w2s(*hole["pin"])
    pole_h = max(14, int(20 * vp.scale))
    pygame.draw.line(surface, C_PIN_POLE, (px, py), (px, py - pole_h), 2)
    flag = [(px, py - pole_h),
            (px + max(8, int(12 * vp.scale)), py - int(pole_h * 0.65)),
            (px, py - int(pole_h * 0.35))]
    pygame.draw.polygon(surface, C_PIN_FLAG, flag)
    pygame.draw.circle(surface, C_PIN_POLE, (px, py), max(2, int(3 * vp.scale)))

    # Ball
    if ball_pos:
        _draw_ball(surface, vp, ball_pos)

        # Dashed line from ball to pin
        _draw_dashed_line(surface, vp, ball_pos, hole["pin"])


def draw_animated_ball(surface: pygame.Surface,
                       vp: Viewport,
                       start, land, end,
                       progress: float):
    """Draw ball in flight (progress 0→1) with a parabolic screen arc."""
    CARRY_PHASE = 0.82

    if progress <= CARRY_PHASE:
        t  = progress / CARRY_PHASE
        wx = start[0] + (land[0] - start[0]) * t
        wy = start[1] + (land[1] - start[1]) * t
        sx, sy = vp.w2s(wx, wy)
        # parabolic lift in screen space
        arc_height = int(t * (1 - t) * 4 * max(50, 80 * vp.scale))
        sy -= arc_height

        # shadow on ground
        gx, gy = vp.w2s(wx, wy)
        pygame.draw.circle(surface, (30, 50, 30), (gx, gy),
                            max(2, int(3 * vp.scale)))
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
                     wind_dir: float):
    """Render the right-side info panel."""
    pygame.draw.rect(surface, C_PANEL_BG, rect)
    pygame.draw.line(surface, C_PANEL_LINE, rect.topleft, rect.bottomleft, 2)

    x  = rect.left + 14
    y  = rect.top  + 14

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

    # Hole header
    line(f"HOLE {hole['hole']}", font_lg, C_HIGHLIGHT, gap=2)
    line(f"Par {hole['par']}   {hole['total_yards']} yds", font_md, (170, 205, 165))
    line(hole.get("description", ""), font_sm, C_TEXT_DIM)
    sep()

    # Ball status
    if game.ball_pos:
        pin   = hole["pin"]
        bx, by = game.ball_pos
        dist  = math.hypot(pin[0] - bx, pin[1] - by)
        line(f"To pin:  {int(dist)} yds", font_md, C_HIGHLIGHT)
        terrain = game.current_terrain
        tc = C_TERRAIN.get(terrain, C_TEXT)
        line(f"Lie:  {terrain.upper()}", font_md, tc)
    sep()

    # Wind
    line("WIND", font_md, (170, 210, 235))
    if wind_speed < 1:
        line("CALM", font_lg, (190, 215, 250))
    else:
        dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        d    = dirs[int((wind_dir + 22.5) / 45) % 8]
        line(f"{wind_speed:.0f} mph  FROM {d}", font_lg, (195, 220, 255))
    _draw_wind_arrow(surface, rect.left + 14, y, wind_speed, wind_dir, font_sm)
    y += 34
    sep()

    # Last shot stats
    if game.last_shot:
        ls = game.last_shot
        line("LAST SHOT", font_md, (175, 210, 175))
        line(f"Ball speed:  {ls['speed']:.0f} mph",      font_sm)
        line(f"Carry:       {ls['carry']:.0f} yds",      font_sm)
        line(f"Total:       {ls['total']:.0f} yds",      font_sm)
        line(f"Launch:      {ls['vla']:.1f}° / {ls['hla']:+.1f}°", font_sm)
        line(f"Backspin:    {ls['backspin']:.0f} rpm",   font_sm)
    sep()

    # Scorecard
    line("SCORECARD", font_md, (175, 210, 175))
    total_vs_par = 0
    for i, h in enumerate(game.all_holes):
        sc    = game.scores[i]
        score = sc.get("score")
        shots = sc.get("shots", 0)
        par   = h["par"]
        if score is not None:
            diff  = score - par
            total_vs_par += diff
            color = C_BAD if diff > 0 else C_OK if diff < 0 else C_TEXT
            sign  = "+" if diff > 0 else ""
            line(f"H{i+1}: {score}  ({sign}{diff})", font_sm, color, gap=3)
        elif i == game.current_hole_idx:
            line(f"H{i+1}: {shots} shot{'s' if shots != 1 else ''}",
                 font_sm, C_HIGHLIGHT, gap=3)
        else:
            line(f"H{i+1}: --", font_sm, C_TEXT_DIM, gap=3)

    sep()

    # Controls
    for hint in ["T = test shot", "R = restart hole",
                 "N = next hole", "H = hole it (on green)", "ESC = quit"]:
        line(hint, font_sm, C_TEXT_DIM, gap=2)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _draw_ball(surface, vp, world_pos, screen_pos=None):
    if screen_pos is None:
        screen_pos = vp.w2s(*world_pos)
    r = max(4, int(5 * vp.scale))
    pygame.draw.circle(surface, C_BALL,        screen_pos, r)
    pygame.draw.circle(surface, C_BALL_SHADOW, screen_pos, r, 1)


def _draw_tracer(surface, vp, start, land, end):
    n = 32
    pts = []
    for i in range(n + 1):
        t  = i / n
        wx = start[0] + (end[0] - start[0]) * t
        wy = start[1] + (end[1] - start[1]) * t
        pts.append(vp.w2s(wx, wy))

    for i in range(len(pts) - 1):
        t     = i / (len(pts) - 1)
        color = C_TRACER_FLY if t < 0.82 else C_TRACER_ROLL
        pygame.draw.line(surface, color, pts[i], pts[i + 1], 2)

    # Landing marker
    lx, ly = vp.w2s(*land)
    pygame.draw.circle(surface, C_LAND_MARK, (lx, ly), 4, 2)


def _draw_dashed_line(surface, vp, world_a, world_b):
    ax, ay = vp.w2s(*world_a)
    bx, by = vp.w2s(*world_b)
    total  = math.hypot(bx - ax, by - ay)
    if total < 1:
        return
    dx, dy  = (bx - ax) / total, (by - ay) / total
    step, on = 10, True
    d       = 0.0
    while d < total:
        x1 = int(ax + dx * d)
        y1 = int(ay + dy * d)
        d  = min(d + step, total)
        x2 = int(ax + dx * d)
        y2 = int(ay + dy * d)
        if on:
            pygame.draw.line(surface, (180, 180, 80), (x1, y1), (x2, y2), 1)
        d   += step
        on   = not on


def _draw_yardage_ticks(surface, vp, hole):
    font = pygame.font.SysFont("monospace", 11)
    for yd in range(50, hole["total_yards"], 50):
        sx, sy = vp.w2s(0, yd)
        if not vp.rect.collidepoint(sx, sy):
            continue
        pygame.draw.line(surface, (180, 210, 160), (sx - 6, sy), (sx + 6, sy), 1)
        lbl = font.render(str(yd), True, (180, 210, 160))
        surface.blit(lbl, (sx + 8, sy - lbl.get_height() // 2))


def _draw_wind_arrow(surface, x, y, speed, direction, font):
    if speed < 0.5:
        return
    cx, cy = x + 14, y + 14
    length = min(26, int(speed * 1.6))
    angle  = math.radians(direction)  # FROM direction
    # Arrow points INTO the wind direction (toward target)
    ex = cx + int(math.sin(angle) * length)
    ey = cy - int(math.cos(angle) * length)
    pygame.draw.line(surface, (195, 220, 255), (cx, cy), (ex, ey), 2)
    # Arrowhead
    for da in (0.5, -0.5):
        hx = ex - int(math.sin(angle + da) * 7)
        hy = ey + int(math.cos(angle + da) * 7)
        pygame.draw.line(surface, (195, 220, 255), (ex, ey), (hx, hy), 2)
