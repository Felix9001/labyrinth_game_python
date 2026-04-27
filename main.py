import os
import json
import random
import time
import threading
import uuid
from artless_core import WSGIApp, Request, Response

app = WSGIApp()

# ─── Генератор лабиринта ───

def generate_maze(cols, rows):
    grid = [[[True, True, True, True] for _ in range(cols)] for _ in range(rows)]
    visited = [[False for _ in range(cols)] for _ in range(rows)]

    def carve(cx, cy):
        visited[cy][cx] = True
        dirs = [(0, -1, 0, 2), (1, 0, 1, 3), (0, 1, 2, 0), (-1, 0, 3, 1)]
        random.shuffle(dirs)
        for dx, dy, wall_self, wall_neighbor in dirs:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < cols and 0 <= ny < rows and not visited[ny][nx]:
                grid[cy][cx][wall_self] = False
                grid[ny][nx][wall_neighbor] = False
                carve(nx, ny)

    carve(0, 0)
    return grid

# ─── Состояние игры ───

class GameState:
    def __init__(self):
        self.players = {}
        self.votes = {"up": 0, "right": 0, "down": 0, "left": 0}
        self.vote_version = 0
        self.player_col = 0
        self.player_row = 0
        self.cols = 15
        self.rows = 10
        self.maze = generate_maze(self.cols, self.rows)
        self.game_over = False
        self.round_start = time.time()
        self.rounds_finished = 0
        self.epoch = 0
        self.epoch_names = ["Подземелье", "Лес", "Киберпространство", "Пустыня", "Бездна"]

    def add_player(self):
        pid = str(uuid.uuid4())[:8]
        self.players[pid] = {"vote": None, "last_seen": time.time()}
        print(f"[+] Игрок {pid} зашёл. Всего игроков: {len(self.players)}")
        return pid

    def remove_player(self, player_id):
        if player_id in self.players:
            old_vote = self.players[player_id]["vote"]
            if old_vote:
                self.votes[old_vote] = max(0, self.votes[old_vote] - 1)
            del self.players[player_id]
            print(f"[-] Игрок {player_id} вышел. Всего игроков: {len(self.players)}")

    def heartbeat(self, player_id):
        if player_id in self.players:
            self.players[player_id]["last_seen"] = time.time()

    def set_vote(self, player_id, direction):
        if player_id in self.players and not self.game_over:
            old_vote = self.players[player_id]["vote"]
            if old_vote and old_vote != direction:
                self.votes[old_vote] = max(0, self.votes[old_vote] - 1)
            self.players[player_id]["vote"] = direction
            self.players[player_id]["last_seen"] = time.time()
            if old_vote != direction:
                self.votes[direction] = self.votes.get(direction, 0) + 1
            print(f"[V] {player_id} голосует {direction}. Голоса: {self.votes}")

    def cleanup_inactive(self):
        now = time.time()
        inactive = [pid for pid, p in self.players.items() if now - p["last_seen"] > 30]
        for pid in inactive:
            print(f"[!] Автоочистка неактивного игрока {pid}")
            self.remove_player(pid)

    def count_votes_and_move(self):
        self.cleanup_inactive()
        if self.game_over:
            return

        if not self.players:
            return

        best_dir = max(self.votes, key=self.votes.get)
        best_count = self.votes[best_dir]

        print(f"[G] Подсчёт голосов: {self.votes}, игроков: {len(self.players)}")

        if best_count == 0:
            self.vote_version += 1
            return

        leaders = [d for d, cnt in self.votes.items() if cnt == best_count]
        chosen = random.choice(leaders)

        walls = self.maze[self.player_row][self.player_col]
        moved = False
        if chosen == "up" and not walls[0] and self.player_row > 0:
            self.player_row -= 1
            moved = True
        elif chosen == "right" and not walls[1] and self.player_col < self.cols - 1:
            self.player_col += 1
            moved = True
        elif chosen == "down" and not walls[2] and self.player_row < self.rows - 1:
            self.player_row += 1
            moved = True
        elif chosen == "left" and not walls[3] and self.player_col > 0:
            self.player_col -= 1
            moved = True

        if moved:
            print(f"[>] Аватар двигается {chosen} → ({self.player_col}, {self.player_row})")

        if self.player_col == self.cols - 1 and self.player_row == self.rows - 1:
            self.game_over = True
            print(f"[🏁] ЛАБИРИНТ ПРОЙДЕН! Раунд {self.rounds_finished + 1}")

        self.votes = {"up": 0, "right": 0, "down": 0, "left": 0}
        for p in self.players.values():
            p["vote"] = None
        self.vote_version += 1

        if self.game_over:
            self.rounds_finished += 1
            if self.rounds_finished % 5 == 0:
                self.epoch = (self.epoch + 1) % len(self.epoch_names)
                print(f"[E] Новая эпоха: {self.epoch_names[self.epoch]}")

    def reset_round(self):
        self.maze = generate_maze(self.cols, self.rows)
        self.player_col = 0
        self.player_row = 0
        self.game_over = False
        self.votes = {"up": 0, "right": 0, "down": 0, "left": 0}
        for p in self.players.values():
            p["vote"] = None
        self.vote_version += 1
        self.round_start = time.time()
        print(f"[R] Новый раунд {self.rounds_finished + 1}")

    def to_dict(self, player_id=None):
        return {
            "maze": self.maze,
            "cols": self.cols,
            "rows": self.rows,
            "player_col": self.player_col,
            "player_row": self.player_row,
            "game_over": self.game_over,
            "votes": self.votes,
            "players_count": len(self.players),
            "my_id": player_id,
            "rounds_finished": self.rounds_finished,
            "epoch": self.epoch,
            "epoch_name": self.epoch_names[self.epoch],
            "round_elapsed": int(time.time() - self.round_start),
            "vote_version": self.vote_version,
        }

state = GameState()

# ─── Игровой цикл ───

def game_loop():
    while True:
        time.sleep(3)
        state.count_votes_and_move()
        if state.game_over and time.time() - state.round_start > 8:
            state.reset_round()

threading.Thread(target=game_loop, daemon=True).start()

# ─── Обработчики ───

def handle_request(request: Request) -> Response:
    url = request.url
    path = url.split("?")[0] if "?" in url else url

    def get_params():
        query = url.split("?")[1] if "?" in url else ""
        params = {}
        for pair in query.split("&"):
            if "=" in pair:
                k, v = pair.split("=", 1)
                params[k] = v
        return params

    if path == "/api/join":
        pid = state.add_player()
        data = json.dumps({"player_id": pid})
        resp = Response()
        resp.body = data.encode("utf-8")
        resp.headers = {"Content-Type": "application/json"}
        return resp

    if path == "/api/ping":
        params = get_params()
        pid = params.get("player_id")
        if pid:
            state.heartbeat(pid)
        resp = Response()
        resp.body = b'{"ok": true}'
        resp.headers = {"Content-Type": "application/json"}
        return resp

    if path == "/api/leave":
        params = get_params()
        pid = params.get("player_id")
        if pid:
            state.remove_player(pid)
        resp = Response()
        resp.body = b'{"ok": true}'
        resp.headers = {"Content-Type": "application/json"}
        return resp

    if path == "/api/vote":
        params = get_params()
        pid = params.get("player_id")
        direction = params.get("dir")
        if pid and direction in ("up", "right", "down", "left"):
            state.set_vote(pid, direction)
        resp = Response()
        resp.body = b'{"ok": true}'
        resp.headers = {"Content-Type": "application/json"}
        return resp

    if path == "/api/state":
        data = json.dumps(state.to_dict())
        resp = Response()
        resp.body = data.encode("utf-8")
        resp.headers = {"Content-Type": "application/json"}
        return resp

    if "/static/" in path:
        filename = path.split("/")[-1]
        static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
        filepath = os.path.join(static_dir, filename)
        resp = Response()
        if os.path.exists(filepath):
            with open(filepath, "rb") as f:
                resp.body = f.read()
            ct = "application/javascript" if filename.endswith(".js") else "text/css"
            resp.headers = {"Content-Type": ct}
        else:
            resp.status = 404
            resp.body = b"Not found"
        return resp

    html = """<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <title>Лабиринт Теней</title>
    <style>
        body {
            margin: 0; overflow: hidden; background: #0a0a0a;
            font-family: sans-serif; user-select: none; touch-action: manipulation;
        }
        canvas { display: block; }
        #controls {
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            display: grid; grid-template-areas:
                ". up ."
                "left . right"
                ". down .";
            gap: 10px; z-index: 10;
        }
        #controls button {
            width: 70px; height: 70px; font-size: 32px;
            background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.3);
            color: white; border-radius: 15px; cursor: pointer;
            transition: background 0.2s;
        }
        #controls button:active { background: rgba(255,255,255,0.3); }
        #controls button.voted { background: rgba(0,255,0,0.3); border-color: #0f0; }
        #btn-up { grid-area: up; }
        #btn-left { grid-area: left; }
        #btn-right { grid-area: right; }
        #btn-down { grid-area: down; }
        #info {
            position: fixed; top: 15px; left: 50%; transform: translateX(-50%);
            color: white; font-size: 16px; z-index: 10;
            background: rgba(0,0,0,0.6); padding: 8px 16px; border-radius: 10px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div id="info">Игроков: 0 | Эпоха: Подземелье | Раунд: 1</div>
    <div id="controls" style="display: none;">
        <button id="btn-up">▲</button>
        <button id="btn-left">◄</button>
        <button id="btn-right">►</button>
        <button id="btn-down">▼</button>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/p5@1.11.13/lib/p5.min.js"></script>
    <script src="/static/sketch.js"></script>
</body>
</html>"""
    resp = Response()
    resp.body = html.encode("utf-8")
    resp.headers = {"Content-Type": "text/html; charset=utf-8"}
    return resp

app.routes = [("GET", r"^/.*$", handle_request)]

# ─── WSGI-приложение для gunicorn ───
application = app

# ─── Локальный запуск ───
if __name__ == "__main__":
    import sys
    from wsgiref.simple_server import make_server

    host = sys.argv[1] if len(sys.argv) > 1 else "0.0.0.0"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000

    print(f"Сервер на http://{host}:{port}")
    with make_server(host, port, app) as httpd:
        httpd.serve_forever()
