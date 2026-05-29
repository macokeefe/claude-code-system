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
        self.landed_in_water  = False
        self.aim_heading      = 0.0
        self.aim_at_pin()

    # ── Aiming ──────────────────────────────────────────────────────────────

    def aim_at_pin(self):
        """Point the aim line straight at the pin from the current ball position."""
        bx, by = self.ball_pos
        px, py = self.current_hole["pin"]
        self.aim_heading = math.degrees(math.atan2(px - bx, py - by))

    def adjust_aim(self, delta_deg: float):
        self.aim_heading += delta_deg

    def aim_offset_deg(self) -> float:
        """Aim direction relative to the straight-at-pin line (+ = right)."""
        bx, by = self.ball_pos
        px, py = self.current_hole["pin"]
        pin_heading = math.degrees(math.atan2(px - bx, py - by))
        d = self.aim_heading - pin_heading
        while d > 180:
            d -= 360
        while d < -180:
            d += 360
        return d

    def restart_hole(self):
        self._reset_hole()

    def next_hole(self) -> bool:
        if self.current_hole_idx < len(self.all_holes) - 1:
            self.current_hole_idx += 1
            self._reset_hole()
            return True
        return False

    # ── Shot application ──────────────────────────────────────────────────────

    def apply_shot(self, shot_result: dict, aim_heading: float = None):
        """Compute ball's landing/final position from a shot result and start animation."""
        if self.animating:
            return

        if aim_heading is None:
            aim_heading = self.aim_heading

        hole      = self.current_hole
        bx, by    = self.ball_pos
        carry     = shot_result["carry"]
        total     = shot_result["total"]
        curve     = shot_result.get("curve", 0.0)
        hla       = shot_result["hla"]

        # Direction the ball actually flies: aim + launch angle
        shot_rad = math.radians(aim_heading + hla)
        fx, fy   = math.sin(shot_rad),  math.cos(shot_rad)   # forward unit vector
        rx, ry   = math.cos(shot_rad), -math.sin(shot_rad)   # right-perp unit vector

        # Landing point (carry along shot line + perpendicular curve)
        land_x = bx + fx * carry + rx * curve
        land_y = by + fy * carry + ry * curve

        # Roll continues forward along the shot line
        roll    = max(0.0, total - carry)
        final_x = land_x + fx * roll
        final_y = land_y + fy * roll

        land_terrain  = check_terrain(land_x, land_y,   hole)
        final_terrain = check_terrain(final_x, final_y, hole)
        self.landed_in_water = (final_terrain == "water")

        # Water: walk back from landing toward the ball until out of water
        if final_terrain == "water":
            drop_x, drop_y = bx, by
            steps = 48
            for s in range(1, steps + 1):
                f  = 1 - s / steps
                tx = bx + (land_x - bx) * f
                ty = by + (land_y - by) * f
                if check_terrain(tx, ty, hole) not in ("water", "ob"):
                    drop_x, drop_y = tx, ty
                    break
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
            self.aim_at_pin()   # re-aim at the pin from the new position

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
