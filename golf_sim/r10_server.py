"""
WebSocket server implementing the GSPro launch monitor API (port 921).
The Garmin Approach R10 (via connector software) sends shot data to this server.

Setup: run your R10 connector app (e.g. "R10 GSPro Connector" on Windows) and
point it to ws://127.0.0.1:921. This server queues incoming shots for the game loop.
"""
import asyncio
import json
import threading
from queue import Queue

shot_queue: Queue = Queue()
_ready = threading.Event()


async def _handler(websocket):
    async for raw in websocket:
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            continue

        opts = data.get("ShotDataOptions", {})

        if opts.get("IsHeartBeat"):
            await websocket.send(json.dumps({"Result": "OK"}))
            continue

        if opts.get("ContainsBallData") and opts.get("LaunchMonitorBallDetected"):
            shot_queue.put(data)
            await websocket.send(json.dumps({"Result": "OK"}))
        elif opts.get("LaunchMonitorIsReady") and not opts.get("IsHeartBeat"):
            # Ready signal — acknowledge it
            await websocket.send(json.dumps({"Result": "OK"}))


async def _serve(port: int):
    import websockets
    async with websockets.serve(_handler, "0.0.0.0", port):
        _ready.set()
        await asyncio.Future()  # run forever


def start(port: int = 921) -> threading.Thread:
    """Start the WebSocket server in a background daemon thread."""
    def _run():
        asyncio.run(_serve(port))

    thread = threading.Thread(target=_run, daemon=True, name="r10-ws-server")
    thread.start()
    _ready.wait(timeout=5)
    return thread
