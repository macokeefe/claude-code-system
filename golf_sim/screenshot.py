"""Render one frame per hole and save as PNG screenshots."""
import os, sys
os.environ["SDL_VIDEODRIVER"] = "offscreen"
os.environ["SDL_AUDIODRIVER"] = "dummy"

import pygame
pygame.init()

from course_data import HOLES
from game_state  import GameState
from renderer_3d import render_scene

WIN_W, WIN_H = 1400, 900
screen = pygame.display.set_mode((WIN_W, WIN_H))

game = GameState(HOLES)

out_dir = "/tmp/golf_shots"
os.makedirs(out_dir, exist_ok=True)

for hole_idx in range(len(HOLES)):
    # Reset to this hole
    game.current_hole_idx = hole_idx
    game._reset_hole()

    hole = game.current_hole
    render_scene(
        surface      = screen,
        hole         = hole,
        ball_pos     = game.ball_pos,
        aim_heading  = game.aim_heading,
        shot_history = [],
        anim_data    = None,
        game         = game,
        tick         = 5000,   # mid-tick so clouds show
    )
    path = f"{out_dir}/hole_{hole_idx+1}.png"
    pygame.image.save(screen, path)
    print(f"Saved {path}")

pygame.quit()
print("Done.")
