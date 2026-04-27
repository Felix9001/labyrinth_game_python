let playerId = null;
let gameState = null;
let cellSize, offsetX, offsetY;
let cols, rows;
let currentVote = null;
let lastVoteVersion = -1;
let gameStarted = false;   // флаг: начал ли игрок игру
let canvasReady = false;

function setup() {
    createCanvas(windowWidth, windowHeight);
    canvasReady = true;
    fetch('/api/join')
        .then(r => r.json())
        .then(data => {
            playerId = data.player_id;
            console.log("Мой ID:", playerId);
            setTimeout(() => {
                pollState();
                setInterval(pollState, 500);
                setInterval(() => {
                    if (playerId) fetch(`/api/ping?player_id=${playerId}`);
                }, 10000);
            }, 300);
        });

    window.addEventListener("beforeunload", () => {
        if (playerId) {
            fetch(`/api/leave?player_id=${playerId}`, { keepalive: true });
        }
    });
}

function pollState() {
    fetch('/api/state')
        .then(r => r.json())
        .then(data => {
            gameState = data;
            cols = data.cols;
            rows = data.rows;
            cellSize = min(width / cols, height / rows);
            offsetX = (width - cols * cellSize) / 2;
            offsetY = (height - rows * cellSize) / 2;

            if (data.vote_version !== lastVoteVersion) {
                lastVoteVersion = data.vote_version;
                currentVote = null;
            }

            updateUI();
            redraw();
        });
}

// ─── Управление клавиатурой ───

function keyPressed() {
    if (!gameStarted || !gameState || gameState.game_over) return;

    let validDirs = getValidDirections();
    let dir = null;

    if (keyCode === UP_ARROW && validDirs.includes("up")) dir = "up";
    if (keyCode === RIGHT_ARROW && validDirs.includes("right")) dir = "right";
    if (keyCode === DOWN_ARROW && validDirs.includes("down")) dir = "down";
    if (keyCode === LEFT_ARROW && validDirs.includes("left")) dir = "left";

    if (dir) vote(dir);
}

// ─── Доступные направления ───

function getValidDirections() {
    if (!gameState) return [];
    let walls = gameState.maze[gameState.player_row][gameState.player_col];
    let dirs = [];
    if (!walls[0] && gameState.player_row > 0) dirs.push("up");
    if (!walls[1] && gameState.player_col < cols - 1) dirs.push("right");
    if (!walls[2] && gameState.player_row < rows - 1) dirs.push("down");
    if (!walls[3] && gameState.player_col > 0) dirs.push("left");
    return dirs;
}

// ─── Отрисовка ───

function draw() {
    background(20);

    // Экран правил (до начала игры)
    if (!gameStarted || !gameState) {
        drawStartScreen();
        return;
    }

    let maze = gameState.maze;
    let pc = gameState.player_col;
    let pr = gameState.player_row;

    // Лабиринт
    stroke(200); strokeWeight(2); noFill();
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let x = offsetX + col * cellSize;
            let y = offsetY + row * cellSize;
            let w = maze[row][col];
            if (w[0]) line(x, y, x + cellSize, y);
            if (w[1]) line(x + cellSize, y, x + cellSize, y + cellSize);
            if (w[2]) line(x, y + cellSize, x + cellSize, y + cellSize);
            if (w[3]) line(x, y, x, y + cellSize);
        }
    }

    // Подсказки на соседних клетках
    let validDirs = getValidDirections();
    textAlign(CENTER, CENTER);
    textSize(cellSize * 0.4);

    for (let dir of validDirs) {
        let ex = pc, ey = pr;
        let arrow = "";
        if (dir === "up")    { ey = pr - 1; arrow = "▲"; }
        if (dir === "right") { ex = pc + 1; arrow = "►"; }
        if (dir === "down")  { ey = pr + 1; arrow = "▼"; }
        if (dir === "left")  { ex = pc - 1; arrow = "◄"; }

        let cx = offsetX + ex * cellSize + cellSize / 2;
        let cy = offsetY + ey * cellSize + cellSize / 2;

        fill(255, 255, 0, 40);
        noStroke();
        rect(offsetX + ex * cellSize, offsetY + ey * cellSize, cellSize, cellSize);

        fill(255, 255, 0, 180);
        text(arrow, cx, cy);
    }

    // Финиш
    fill(255, 0, 0); noStroke();
    rect(offsetX + (cols - 1) * cellSize + 4, offsetY + (rows - 1) * cellSize + 4, cellSize - 8, cellSize - 8);

    // Аватар
    fill(0, 255, 0);
    rect(offsetX + pc * cellSize + 4, offsetY + pr * cellSize + 4, cellSize - 8, cellSize - 8);

    // Статистика голосов (слева сверху)
    drawVoteStats();

    // Победа
    if (gameState.game_over) {
        fill(0, 150, 0, 180); noStroke(); rectMode(CENTER);
        rect(width / 2, height / 2, 350, 120, 20);
        fill(255); textAlign(CENTER, CENTER); textSize(30);
        text("ЛАБИРИНТ ПРОЙДЕН!", width / 2, height / 2 - 10);
        textSize(16);
        text("Новый раунд через несколько секунд...", width / 2, height / 2 + 30);
        rectMode(CORNER);
    }
}

// ─── Стартовый экран ───

function drawStartScreen() {
    fill(30);
    noStroke();
    rect(0, 0, width, height);

    textAlign(CENTER, CENTER);
    fill(255);

    // Заголовок
    textSize(min(width, height) * 0.06);
    text("ЛАБИРИНТ ТЕНЕЙ", width / 2, height * 0.15);

    // Правила
    textSize(min(width, height) * 0.024);
    let rules = [
        "Это кооперативно-соревновательная игра.",
        "",
        "Все игроки управляют ОДНИМ аватаром.",
        "Аватар движется туда, куда проголосовало БОЛЬШИНСТВО.",
        "При ничьей — случайное направление из лидеров.",
        "",
        "Голосование длится 3 секунды.",
        "Голосуйте стрелками на клавиатуре или кнопками внизу.",
        "",
        "Цель: довести аватар до красного финиша!",
        "",
        "Каждые 5 раундов меняется эпоха и визуальный стиль.",
    ];

    let yStart = height * 0.28;
    for (let i = 0; i < rules.length; i++) {
        if (rules[i] === "") {
            fill(255, 120);
        } else {
            fill(255, 220);
        }
        text(rules[i], width / 2, yStart + i * (height * 0.04));
    }

    // Кнопка "Начать игру"
    let btnW = min(280, width * 0.4);
    let btnH = min(60, height * 0.08);
    let btnX = width / 2 - btnW / 2;
    let btnY = height * 0.78;

    // Проверка наведения мыши
    let hover = mouseX > btnX && mouseX < btnX + btnW && mouseY > btnY && mouseY < btnY + btnH;

    fill(hover ? 100 : 60, hover ? 255 : 200, hover ? 100 : 60, 200);
    stroke(0, 255, 0);
    strokeWeight(2);
    rect(btnX, btnY, btnW, btnH, 15);

    noStroke();
    fill(255);
    textSize(min(btnH * 0.4, 24));
    text("НАЧАТЬ ИГРУ", width / 2, btnY + btnH / 2);
}

function mousePressed() {
    if (gameStarted) return;

    let btnW = min(280, width * 0.4);
    let btnH = min(60, height * 0.08);
    let btnX = width / 2 - btnW / 2;
    let btnY = height * 0.78;

    if (mouseX > btnX && mouseX < btnX + btnW && mouseY > btnY && mouseY < btnY + btnH) {
        gameStarted = true;
        // Показываем кнопки управления
        document.getElementById("controls").style.display = "grid";
    }
}

// ─── Статистика голосов ───

function drawVoteStats() {
    if (!gameState || gameState.game_over) return;

    let panelX = 15;
    let panelY = 15;
    let panelW = 160;
    let panelH = 130;

    // Панелька
    fill(0, 0, 0, 160);
    noStroke();
    rect(panelX, panelY, panelW, panelH, 12);

    let votes = gameState.votes;
    let totalVotes = votes.up + votes.right + votes.down + votes.left;
    let maxVotes = Math.max(1, totalVotes, gameState.players_count);

    fill(255);
    textAlign(LEFT, TOP);
    textSize(13);
    text("ГОЛОСА", panelX + 12, panelY + 8);

    let barX = panelX + 12;
    let barW = panelW - 24;
    let barY = panelY + 30;
    let barH = 14;
    let gap = 20;

    drawVoteBar(barX, barY, barW, barH, "▲ Вверх", votes.up, maxVotes, color(255, 200, 50));
    drawVoteBar(barX, barY + gap, barW, barH, "► Вправо", votes.right, maxVotes, color(50, 200, 255));
    drawVoteBar(barX, barY + gap * 2, barW, barH, "▼ Вниз", votes.down, maxVotes, color(255, 100, 100));
    drawVoteBar(barX, barY + gap * 3, barW, barH, "◄ Влево", votes.left, maxVotes, color(150, 255, 100));

    textSize(11);
    fill(200);
    text(`Всего голосов: ${totalVotes}`, panelX + 12, panelY + panelH - 18);
}

function drawVoteBar(x, y, w, h, label, count, maxVal, col) {
    // Фон
    fill(40);
    noStroke();
    rect(x, y, w, h, 4);

    // Заполнение
    if (count > 0) {
        let fillW = (count / maxVal) * w;
        fill(col);
        rect(x, y, fillW, h, 4);
    }

    // Подпись
    fill(255);
    noStroke();
    textAlign(LEFT, CENTER);
    textSize(11);
    text(`${label}: ${count}`, x + 6, y + h / 2);
}

// ─── UI ───

function updateUI() {
    if (gameState) {
        document.getElementById("info").textContent =
            `Игроков: ${gameState.players_count} | Эпоха: ${gameState.epoch_name} | Раунд: ${gameState.rounds_finished + 1}`;
    }

    document.querySelectorAll("#controls button").forEach(b => b.classList.remove("voted"));
    if (currentVote) {
        let btn = document.getElementById("btn-" + currentVote);
        if (btn) btn.classList.add("voted");
    }
}

document.getElementById("btn-up").addEventListener("click", () => vote("up"));
document.getElementById("btn-right").addEventListener("click", () => vote("right"));
document.getElementById("btn-down").addEventListener("click", () => vote("down"));
document.getElementById("btn-left").addEventListener("click", () => vote("left"));

function vote(dir) {
    if (!playerId || !gameStarted || (gameState && gameState.game_over)) return;
    currentVote = dir;
    fetch(`/api/vote?player_id=${playerId}&dir=${dir}`);
    updateUI();
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    if (gameState) {
        cellSize = min(width / cols, height / rows);
        offsetX = (width - cols * cellSize) / 2;
        offsetY = (height - rows * cellSize) / 2;
    }
}