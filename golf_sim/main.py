#!/usr/bin/env python3
"""
Golf Simulator — Garmin Approach R10
Run:  python main.py
Deps: pip install pygame websockets
"""
import sys
import math
import random
import pygame

from course_data import HOLES
from game_state  import GameState
from physics     import process_shot
from renderer    import (Viewport, draw_hole, draw_animated_ball,
                          draw_stats_panel, score_color)
import r10_server

# ── Layout ────────────────────────────────────────────────────────────────────
WIN_W, WIN_H = 1400, 900
PANEL_W      = 320
COURSE_W     = WIN_W - PANEL_W
FPS          = 60

# ── Notification system ───────────────────────────────────────────────────────
class Notifier:
    def __init__(self, font):
        self.font  = font
        self._msgs = []   # [(text, expire_ms)]

    def push(self, text: str, ms: int = 3500):
        expire = pygame.time.get_ticks() + ms
        self._msgs.append((text, expire))
        # Cap history
        if len(self._msgs) > 5:
            self._msgs.pop(0)

    def draw(self, surface: pygame.Surface, bottom_y: int):
        now  = pygame.time.get_ticks()
        self._msgs = [(t, e) for t, e in self._msgs if now < e]
        for i, (text, _) in enumerate(reversed(self._msgs[-4:])):
            surf = self.font.render(text, True, (255, 228, 90))
            surface.blit(surf, (10, bottom_y - 26 - i * 23))


def make_test_shot() -> dict:
    """Inject a plausible random shot for testing without the R10."""
    return {
        "DeviceID": "TestMode",
        "Units": "Yards",
        "BallData": {
            "Speed":         random.uniform(90,  160),
            "HLA":           random.gauss(0,  5),
            "VLA":           random.uniform(10,  22),
            "CarryDistance": random.uniform(70,  230),
            "TotalSpin":     random.uniform(2000, 7000),
            "BackSpin":      random.uniform(1800, 6200),
            "SideSpin":      random.gauss(0,  600),
        },
        "ShotDataOptions": {
            "ContainsBallData":        True,
            "LaunchMonitorBallDetected": True,
            "IsHeartBeat":             False,
        },
    }


def score_label(shots: int, par: int) -> str:
    diff = shots - par
    names = {-3: "Albatross", -2: "Eagle", -1: "Birdie",
              0: "Par", 1: "Bogey", 2: "Double", 3: "Triple"}
    return names.get(diff, f"+{diff}" if diff > 0 else str(diff))


def main():
    pygame.init()
    screen = pygame.display.set_mode((WIN_W, WIN_H))
    pygame.display.set_caption("Golf Sim  |  Garmin Approach R10")
    clock  = pygame.time.Clock()

    font_xl = pygame.font.SysFont("monospace", 30, bold=True)
    font_lg = pygame.font.SysFont("monospace", 20, bold=True)
    font_md = pygame.font.SysFont("monospace", 15)
    font_sm = pygame.font.SysFont("monospace", 13)

    # Start R10 WebSocket server (GSPro protocol, port 921)
    r10_server.start(port=921)
    print("[R10] Listening on ws://0.0.0.0:921")
    print("[R10] Point your R10 connector app to ws://127.0.0.1:921")
    print("[INFO] Press T for a test shot, ESC to quit.")

    game   = GameState(HOLES)
    notify = Notifier(font_sm)

    course_rect = pygame.Rect(0,        0, COURSE_W, WIN_H)
    panel_rect  = pygame.Rect(COURSE_W, 0, PANEL_W,  WIN_H)

    def refresh_viewport():
        return Viewport(course_rect, game.current_hole)

    vp = refresh_viewport()
    notify.push("Ready!  Connect R10 and swing, or press T for a test shot.")

    # ── Overlay banner (hole complete etc.) ───────────────────────────────────
    banner_text   = ""
    banner_expiry = 0
    banner_color  = (255, 235, 80)

    def show_banner(text: str, shots: int = 0, par: int = 0, ms: int = 4000):
        nonlocal banner_text, banner_expiry, banner_color
        banner_text   = text
        banner_expiry = pygame.time.get_ticks() + ms
        if shots and par:
            banner_color = score_color(shots - par)
        else:
            banner_color = (255, 235, 80)

    running = True
    while running:
        dt  = clock.tick(FPS) / 1000.0
        now = pygame.time.get_ticks()

        # ── Events ────────────────────────────────────────────────────────────
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False

                elif event.key == pygame.K_t:
                    r10_server.shot_queue.put(make_test_shot())

                elif event.key == pygame.K_r:
                    game.restart_hole()
                    vp = refresh_viewport()
                    notify.push(f"Hole {game.current_hole['hole']} restarted")

                elif event.key == pygame.K_n:
                    if not game.animating:
                        if not game.next_hole():
                            notify.push("All holes complete!  Press R to restart.")
                        else:
                            vp = refresh_viewport()
                            h  = game.current_hole
                            notify.push(f"Hole {h['hole']} — Par {h['par']}, {h['total_yards']} yds")

                elif event.key == pygame.K_h:
                    # Manual "holed" (useful when on the green)
                    if not game.animating and game.current_terrain in ("green", "tee"):
                        game.complete_hole()
                        label = score_label(game.shot_count,
                                            game.current_hole["par"])
                        show_banner(f"{label}!  {game.shot_count} shots — Press N for next hole",
                                    game.shot_count, game.current_hole["par"])

        # ── Incoming shots ─────────────────────────────────────────────────
        while not r10_server.shot_queue.empty():
            raw = r10_server.shot_queue.get_nowait()
            if game.animating:
                # Finish animation instantly before applying next shot
                game.anim_progress = 1.0
                game.update_animation(0)

            bd     = raw.get("BallData", {})
            result = process_shot(bd, game.wind_speed, game.wind_dir)
            game.apply_shot(result)

            if game.ob_penalty:
                notify.push("OUT OF BOUNDS — stroke & distance penalty!", 4500)
            else:
                notify.push(
                    f"Carry {result['carry']:.0f} yd  |  "
                    f"Total {result['total']:.0f} yd  |  "
                    f"{result['speed']:.0f} mph  |  "
                    f"{result['backspin']:.0f} rpm"
                )

        # ── Animation tick ─────────────────────────────────────────────────
        game.update_animation(dt)

        # ── Auto-holed check ───────────────────────────────────────────────
        if game.check_holed():
            game.complete_hole()
            label = score_label(game.shot_count, game.current_hole["par"])
            show_banner(f"{label}!  {game.shot_count} shots — Press N for next hole",
                        game.shot_count, game.current_hole["par"])

        # ── Draw ───────────────────────────────────────────────────────────
        screen.fill((15, 25, 15))

        # Course view
        draw_hole(screen, vp, game.current_hole,
                  ball_pos    = (None if game.animating else game.ball_pos),
                  shot_history= game.shot_history)

        if game.animating:
            draw_animated_ball(screen, vp,
                               game.anim_start, game.anim_land,
                               game.anim_final, game.anim_progress)

        # Stats panel
        draw_stats_panel(screen, panel_rect, game, game.current_hole,
                         font_lg, font_md, font_sm,
                         game.wind_speed, game.wind_dir)

        # Top header bar
        hole = game.current_hole
        hdr  = font_xl.render(
            f"Hole {hole['hole']}   Par {hole['par']}   {hole['total_yards']} yds",
            True, (220, 232, 205))
        screen.blit(hdr, (10, 8))

        # Shot counter
        shot_txt = font_lg.render(
            f"Shot {game.shot_count + 1}", True, (180, 205, 170))
        screen.blit(shot_txt, (10, 46))

        # R10 status dot
        connected = not r10_server.shot_queue.empty() or game.shot_count > 0
        dot_color = (80, 220, 80) if connected else (200, 80, 80)
        pygame.draw.circle(screen, dot_color, (COURSE_W - 16, 16), 7)
        status_lbl = font_sm.render(
            "R10 READY" if connected else "WAITING FOR R10",
            True, (160, 180, 160))
        screen.blit(status_lbl, (COURSE_W - 130, 9))

        # Banner overlay
        if banner_text and now < banner_expiry:
            bsurf = font_xl.render(banner_text, True, banner_color)
            bx    = (COURSE_W - bsurf.get_width()) // 2
            by    = WIN_H // 2 - bsurf.get_height() // 2
            bg    = pygame.Surface((bsurf.get_width() + 30, bsurf.get_height() + 18),
                                    pygame.SRCALPHA)
            bg.fill((0, 0, 0, 172))
            screen.blit(bg, (bx - 15, by - 9))
            screen.blit(bsurf, (bx, by))

        notify.draw(screen, WIN_H)

        pygame.display.flip()

    pygame.quit()
    sys.exit(0)


if __name__ == "__main__":
    main()
