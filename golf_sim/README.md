# Golf Sim — Garmin Approach R10

A Python/Pygame top-down golf simulator that receives live shot data from your
Garmin Approach R10 launch monitor and shows you exactly where the ball lands
on a rendered 2D course.

## Requirements

- Python 3.10+
- A Garmin Approach R10
- Windows laptop (R10 connects via Bluetooth to a connector app)

## Quick start

```bash
pip install pygame websockets
python main.py
```

## Connecting the R10

The R10 doesn't talk directly to a Python script — it uses Bluetooth and a
connector app that bridges it to the **GSPro API** (a standard WebSocket
protocol used by golf simulators). This game implements that server.

**Steps:**

1. Install the **R10 GSPro Connector** app on your Windows laptop.
   (Search "Garmin R10 GSPro connector" — several free options exist.)

2. Open the connector app, pair it with your R10 via Bluetooth.

3. In the connector app settings, set the **server address** to:
   ```
   ws://127.0.0.1:921
   ```

4. Launch this game (`python main.py`), then click "Connect" in the connector.

5. Hit a ball into your screen — shot data arrives automatically.

> **Tip:** Press **T** in-game at any time to inject a random test shot without
> the R10 connected. Great for exploring the game before setup.

## Controls

| Key | Action |
|-----|--------|
| T   | Inject a random test shot |
| R   | Restart current hole |
| N   | Advance to next hole |
| H   | Mark ball as holed (use when on the green) |
| ESC | Quit |

## What the simulator uses from the R10

| R10 Data      | Used for                        |
|---------------|---------------------------------|
| Ball Speed    | Display only                    |
| Carry Distance| Primary distance calculation    |
| HLA           | Left/right direction            |
| VLA           | Roll estimate                   |
| Backspin      | Roll and stopping power         |
| Sidespin      | Additional curve                |

Wind is randomised per hole and affects both carry and direction.

## Terrain rules

- **Fairway** — normal roll
- **Rough** — ball plays from landing spot (shown on panel)
- **Bunker** — no roll, ball stops at landing spot
- **Water** — ball drops near entry point (1 stroke penalty)
- **OB** — stroke and distance (play again from same spot)
- **Green** — approach the pin; press H when close enough to hole out

## Course layout

Five unique holes are included:

| Hole | Par | Yds | Character |
|------|-----|-----|-----------|
| 1    | 4   | 382 | Straight opener, right fairway bunker |
| 2    | 3   | 163 | Island green, water on three sides |
| 3    | 5   | 518 | Dogleg right at 250 yds, water in corner |
| 4    | 4   | 428 | Water entire left side |
| 5    | 4   | 356 | Tight fairway, 6 bunkers |

## Architecture

```
main.py        — game loop, event handling, rendering orchestration
game_state.py  — ball position, shot application, scoring
physics.py     — R10 data → carry/roll/lateral calculation + terrain check
renderer.py    — Pygame drawing: course, ball, tracers, HUD panel
course_data.py — 5 hole definitions (fairway polygons, bunkers, hazards)
r10_server.py  — async WebSocket server (GSPro protocol, port 921)
```
