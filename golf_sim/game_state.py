"""
Game state: ball position, shot history, animation, scoring.
"""
import math
import random
from physics import check_terrain


class GameState:
    def __init__(self, holes: list):
        self.all_holes        = holes
        self.current_hole_idx = 0
        self.scores           = [{} for _ in holes]
        self._reset_hole()

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def current_hole(self) -> dict:
        return self.all_holes[self.current_hole_idx]

    # ── Reset / navigation ────────────────────────────────────────────────────

    def _reset_hole(self):
        hole                  = self.current_hole
        self.ball_pos         = tuple(hole["tee"])
        self.current_terrain  = "tee"
        self.shot_count       = 0
        self.shot_history     = []
        self.last_shot        = None
        self.wind_speed       = random.uniform(0, 20)
        self.wind_dir         = random.uniform(0, 360)
        self.animating        = False
        self.anim_progress    = 0.0
        self.anim_start       = None
        self.anim_land        = None
        self.anim_final       = None
        self.ob_penalty       = False

    def restart_hole(self):
        self._reset_hole()

    def next_hole(self) -> bool:
        if self.current_hole_idx < len(self.all_holes) - 1:
            self.current_hole_idx += 1
            self._reset_hole()
            return True
        return False

    # ── Shot application ──────────────────────────────────────────────────────

    def apply_shot(self, shot_result: dict):
        """Compute ball's landing/final position from a shot result and start animation."""
        if self.animating:
            return

        hole      = self.current_hole
        bx, by    = self.ball_pos
        carry     = shot_result["carry"]
        total     = shot_result["total"]
        lateral   = shot_result["lateral"]

        # Where the ball lands (end of carry)
        if total > 0:
            land_x = bx + lateral * (carry / total)
        else:
            land_x = bx + lateral
        land_y = by + carry

        # Where it stops (after roll)
        final_x = bx + lateral
        final_y = by + total

        land_terrain  = check_terrain(land_x, land_y,   hole)
        final_terrain = check_terrain(final_x, final_y, hole)

        # Water: walk back toward tee until out of water, then drop there
        if final_terrain == "water":
            drop_x, drop_y = land_x, land_y
            for step in range(1, int(land_y - by) + 5):
                tx = land_x * (1 - step / max(land_y, 1))
                ty = land_y - step
                if ty < by:
                    tx, ty = bx, by   # back to tee
                    break
                if check_terrain(tx, ty, hole) not in ("water", "ob"):
                    drop_x, drop_y = tx, ty
                    break
            else:
                drop_x, drop_y = bx, by   # fall back to tee
            final_x, final_y = drop_x, drop_y

        # OB: no roll (flag for penalty message)
        if final_terrain == "ob":
            final_x = land_x
            final_y = land_y
            self.ob_penalty = True
        else:
            self.ob_penalty = False

        # Bunker: no roll
        if land_terrain == "bunker":
            final_x = land_x
            final_y = land_y

        self.anim_start    = self.ball_pos
        self.anim_land     = (land_x, land_y)
        self.anim_final    = (final_x, final_y)
        self.anim_progress = 0.0
        self.animating     = True

        self.shot_history.append({
            "from": self.ball_pos,
            "land": (land_x, land_y),
            "to":   (final_x, final_y),
        })
        self.last_shot  = shot_result
        self.shot_count += 1

    def update_animation(self, dt: float):
        """Advance animation. dt in seconds. Animation lasts ~2 s."""
        if not self.animating:
            return

        self.anim_progress += dt / 2.0

        if self.anim_progress >= 1.0:
            self.anim_progress   = 1.0
            self.animating       = False
            self.ball_pos        = self.anim_final
            self.current_terrain = check_terrain(*self.ball_pos, self.current_hole)

    # ── Hole completion ───────────────────────────────────────────────────────

    def check_holed(self) -> bool:
        """Return True if the ball is within 2 yards of the pin."""
        if self.ball_pos is None or self.animating:
            return False
        pin  = self.current_hole["pin"]
        dist = math.hypot(pin[0] - self.ball_pos[0], pin[1] - self.ball_pos[1])
        return dist < 2.0

    def complete_hole(self):
        self.scores[self.current_hole_idx] = {
            "score": self.shot_count,
            "shots": self.shot_count,
        }

    def total_vs_par(self) -> int:
        shots = sum(s.get("score", 0) for s in self.scores)
        par   = sum(h["par"] for h in self.all_holes)
        return shots - par
