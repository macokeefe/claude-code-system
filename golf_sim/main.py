#!/usr/bin/env python3
"""
Golf Simulator — Garmin Approach R10
Run:  python main.py
Deps: pip install pygame websockets  (or pygame-ce websockets on Python 3.14)
"""
import sys
import random
import pygame

from course_data   import HOLES
from game_state    import GameState
from physics       import process_shot
from renderer_3d   import render_scene
from renderer      import score_color
import r10_server
import audio

AIM_STEP     = 2.0   # degrees per arrow-key press
WIN_W, WIN_H = 1400, 900
FPS          = 60


# ── Notification system ───────────────────────────────────────────────────────
class Notifier:
    def __init__(self):
        self._msgs = []

    def push(self, text: str, ms: int = 3500):
        self._msgs.append([text, pygame.time.get_ticks() + ms])
        if len(self._msgs) > 5:
            self._msgs.pop(0)

    def draw(self, surface: pygame.Surface, font: pygame.font.Font):
        now        = pygame.time.get_ticks()
        self._msgs = [m for m in self._msgs if now < m[1]]
        for i, (text, _) in enumerate(reversed(self._msgs[-4:])):
            s = font.render(text, True, (255, 228, 90))
            surface.blit(s, (10, WIN_H - 52 - i * 22))


def make_test_shot() -> dict:
    return {
        "DeviceID": "TestMode",
        "Units":    "Yards",
        "BallData": {
            "Speed":         random.uniform(90,  162),
            "HLA":           random.gauss(0,  4.5),
            "VLA":           random.uniform(10,  22),
            "CarryDistance": random.uniform(65,  235),
            "TotalSpin":     random.uniform(2000, 7200),
            "BackSpin":      random.uniform(1800, 6400),
            "SideSpin":      random.gauss(0,  580),
        },
        "ShotDataOptions": {
            "ContainsBallData":          True,
            "LaunchMonitorBallDetected": True,
            "IsHeartBeat":               False,
        },
    }


def score_label(shots: int, par: int) -> str:
    diff = shots - par
    names = {-3: "Albatross", -2: "Eagle", -1: "Birdie",
              0: "Par", 1: "Bogey", 2: "Double", 3: "Triple"}
    return names.get(diff, f"+{diff}" if diff > 0 else str(diff))


def main():
    pygame.init()
    audio.init()

    screen = pygame.display.set_mode((WIN_W, WIN_H))
    pygame.display.set_caption("Golf Sim  |  Garmin Approach R10")
    clock  = pygame.time.Clock()

    font_xl = pygame.font.SysFont("monospace", 30, bold=True)
    font_sm = pygame.font.SysFont("monospace", 13)

    r10_server.start(port=921)
    print("[R10] Listening on ws://0.0.0.0:921")
    print("[R10] Point your R10 connector to ws://127.0.0.1:921")
    print("[INFO] Press T for a test shot.")

    game   = GameState(HOLES)
    notify = Notifier()
    notify.push("Swing away!  (T = test shot  ·  ← → = aim  ·  C = re-aim at pin)")

    # ── Overlay banner (hole complete / score) ────────────────────────────────
    banner_text   = ""
    banner_expiry = 0
    banner_color  = (255, 235, 80)

    def show_banner(text: str, shots: int = 0, par: int = 0, ms: int = 4000):
        nonlocal banner_text, banner_expiry, banner_color
        banner_text   = text
        banner_expiry = pygame.time.get_ticks() + ms
        banner_color  = score_color(shots - par) if shots and par else (255, 235, 80)

    running = True
    while running:
        dt  = clock.tick(FPS) / 1000.0
        now = pygame.time.get_ticks()

        # ── Events ────────────────────────────────────────────────────────────
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

            elif event.type == pygame.KEYDOWN:
                k = event.key

                if k == pygame.K_ESCAPE:
                    running = False

                elif k == pygame.K_t:
                    r10_server.shot_queue.put(make_test_shot())

                elif k == pygame.K_r:
                    game.restart_hole()
                    notify.push(f"Hole {game.current_hole['hole']} restarted")

                elif k == pygame.K_n:
                    if not game.animating:
                        if not game.next_hole():
                            notify.push("All holes done!  Press R to restart.")
                        else:
                            h = game.current_hole
                            notify.push(f"Hole {h['hole']} — Par {h['par']}, {h['total_yards']} yds")

                elif k == pygame.K_h:
                    if not game.animating and game.current_terrain in ("green", "tee"):
                        game.complete_hole()
                        audio.play("holeout")
                        label = score_label(game.shot_count, game.current_hole["par"])
                        show_banner(f"{label}!  {game.shot_count} shots — N for next hole",
                                    game.shot_count, game.current_hole["par"])

                elif k in (pygame.K_LEFT, pygame.K_COMMA):
                    if not game.animating:
                        game.adjust_aim(-AIM_STEP)
                        audio.play("aim", 0.55)

                elif k in (pygame.K_RIGHT, pygame.K_PERIOD):
                    if not game.animating:
                        game.adjust_aim(AIM_STEP)
                        audio.play("aim", 0.55)

                elif k == pygame.K_c:
                    if not game.animating:
                        game.aim_at_pin()
                        notify.push("Aim reset to pin")

        # ── Incoming R10 shots ────────────────────────────────────────────────
        while not r10_server.shot_queue.empty():
            raw = r10_server.shot_queue.get_nowait()
            if game.animating:
                game.anim_progress = 1.0
                game.update_animation(0)

            bd     = raw.get("BallData", {})
            aim    = game.aim_heading
            result = process_shot(bd, game.wind_speed, game.wind_dir,
                                  aim_heading=aim)
            game.apply_shot(result, aim_heading=aim)
            audio.play("hit")

            if game.ob_penalty:
                notify.push("OUT OF BOUNDS — stroke & distance penalty!", 4500)
            else:
                notify.push(
                    f"Carry {result['carry']:.0f} yd  ·  "
                    f"Total {result['total']:.0f} yd  ·  "
                    f"{result['speed']:.0f} mph  ·  "
                    f"{result['backspin']:.0f} rpm"
                )

        # ── Animation + sound ─────────────────────────────────────────────────
        was_anim = game.animating
        game.update_animation(dt)
        if was_anim and not game.animating:
            if game.landed_in_water:
                audio.play("splash")
                notify.push("SPLASH — in the water!", 3500)
            elif game.ob_penalty:
                audio.play("ob")
            elif game.current_terrain == "bunker":
                audio.play("sand")

        # ── Auto-holed ────────────────────────────────────────────────────────
        if game.check_holed():
            game.complete_hole()
            audio.play("holeout")
            label = score_label(game.shot_count, game.current_hole["par"])
            show_banner(f"{label}!  {game.shot_count} shots — N for next hole",
                        game.shot_count, game.current_hole["par"])

        # ── Render ────────────────────────────────────────────────────────────
        anim_data = None
        if game.animating:
            anim_data = (game.anim_start, game.anim_land,
                         game.anim_final, game.anim_progress)

        render_scene(
            surface      = screen,
            hole         = game.current_hole,
            ball_pos     = game.ball_pos,
            aim_heading  = game.aim_heading,
            shot_history = game.shot_history,
            anim_data    = anim_data,
            game         = game,
            tick         = now,
        )

        # Banner overlay
        if banner_text and now < banner_expiry:
            bsurf = font_xl.render(banner_text, True, banner_color)
            bx    = (WIN_W - bsurf.get_width()) // 2
            by    = WIN_H // 2 - 60
            bg    = pygame.Surface((bsurf.get_width() + 32, bsurf.get_height() + 20),
                                    pygame.SRCALPHA)
            bg.fill((0, 0, 0, 180))
            screen.blit(bg, (bx - 16, by - 10))
            screen.blit(bsurf, (bx, by))

        notify.draw(screen, font_sm)

        pygame.display.flip()

    pygame.quit()
    sys.exit(0)


if __name__ == "__main__":
    main()
