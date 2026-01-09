// =========================
// KONFIGURACJA
// =========================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = 1100;
canvas.height = 700;

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const ROAD_COLOR = "#8C501E";
const GRASS = "#28A028";
const WHITE = "#F0F0F0";
const BLACK = "#0F0F14";
const RED = "#E63C3C";
const GREEN = "#3CDC78";
const BLUE = "#508CFF";
const YELLOW = "#FADC5A";
const GRAY = "#50505A";
const CYAN = "#50DCDC";
const PURPLE = "#B450DC";

const PATH = [
    {x: 0, y: 350}, {x: 200, y: 350}, {x: 200, y: 150},
    {x: 500, y: 150}, {x: 500, y: 550},
    {x: 850, y: 550}, {x: 850, y: 280}, {x: 1100, y: 280}
];

const TOWER_TYPES = [
    {
        name: "Basic",
        cost: 80,
        range: 120,
        damage: 10,
        cd: 25,
        color: BLUE,
        upgrade_cost: 60,
        upgrade_mult: 1.5,
    },
    {
        name: "Rapid",
        cost: 140,
        range: 100,
        damage: 6,
        cd: 8,
        color: GREEN,
        upgrade_cost: 90,
        upgrade_mult: 1.5,
    },
    {
        name: "Heavy",
        cost: 220,
        range: 150,
        damage: 22,
        cd: 40,
        color: RED,
        upgrade_cost: 130,
        upgrade_mult: 1.6,
    },
];

const ENEMY_BASE_HP = 60;
const ENEMY_BASE_SPEED = 1.2;
const ENEMY_HP_GROWTH = 1.18;
const ENEMY_SPEED_GROWTH = 1.03;
const SPAWN_DELAY_BASE = 40;

// =========================
// STAN GRY
// =========================
let money = 300;
let lives = 20;
let wave = 0;

let enemies = [];
let towers = [];

let spawnTimer = 0;
let enemiesToSpawn = 0;
let spawnDelay = SPAWN_DELAY_BASE;

let selectedType = 0;
let message = "";
let msgTimer = 0;

let gameOver = false;
let running = true;

let lastTime = 0;

let mouseX = 0;
let mouseY = 0;
let mouseDownLeft = false;
let mouseDownRight = false;
let prevMouseDownLeft = false;
let prevMouseDownRight = false;

// Zmienne dla menu PPM
let menuTower = null;
let menuPos = {x: 0, y: 0};

// =========================
// KLASY
// =========================
class Enemy {
    constructor(wave) {
        this.x = PATH[0].x;
        this.y = PATH[0].y;
        this.target = 1;
        this.speed = ENEMY_BASE_SPEED * Math.pow(ENEMY_SPEED_GROWTH, wave - 1);
        this.max_hp = Math.floor(ENEMY_BASE_HP * Math.pow(ENEMY_HP_GROWTH, wave - 1));
        this.hp = this.max_hp;
        this.reward = 12 + wave * 2;
        const colors = [BLUE, CYAN, PURPLE];
        this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    move() {
        if (this.target >= PATH.length) {
            return true;
        }
        const tx = PATH[this.target].x;
        const ty = PATH[this.target].y;
        const dx = tx - this.x;
        const dy = ty - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < this.speed) {
            this.target += 1;
        } else {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
        return false;
    }

    draw(ctx) {
        const r = 14;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fill();

        // HP bar
        const barW = 30;
        const barH = 4;
        const bx = this.x - barW / 2;
        const by = this.y - 20;
        ctx.fillStyle = RED;
        ctx.fillRect(bx, by, barW, barH);
        const ratio = Math.max(0, this.hp / this.max_hp);
        ctx.fillStyle = GREEN;
        ctx.fillRect(bx, by, barW * ratio, barH);
    }
}

class Tower {
    constructor(x, y, cfg) {
        this.x = x;
        this.y = y;
        this.range = cfg.range;
        this.damage = cfg.damage;
        this.cd_max = cfg.cd;
        this.cd = 0;
        this.color = cfg.color;
        this.level = 1;
        this.upgrade_cost = cfg.upgrade_cost;
        this.upgrade_mult = cfg.upgrade_mult;
    }

    can_upgrade() {
        return this.level < 5;
    }

    upgrade() {
        if (!this.can_upgrade()) return;
        this.level += 1;
        this.damage = Math.floor(this.damage * this.upgrade_mult);
        this.range = Math.floor(this.range * 1.08);
        this.cd_max = Math.max(4, Math.floor(this.cd_max * 0.9));
        this.upgrade_cost = Math.floor(this.upgrade_cost * 1.4);
    }

    attack(enemies) {
        if (this.cd > 0) {
            this.cd -= 1;
            return null;
        }

        let targetEnemy = null;
        let bestProgress = -1;

        for (const e of enemies) {
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            if (dist <= this.range) {
                const progress = e.target + dist / 1000.0;
                if (progress > bestProgress) {
                    bestProgress = progress;
                    targetEnemy = e;
                }
            }
        }

        if (targetEnemy) {
            targetEnemy.hp -= this.damage;
            this.cd = this.cd_max;
            return {from: {x: this.x, y: this.y}, to: {x: targetEnemy.x, y: targetEnemy.y}};
        }
        return null;
    }

    draw(ctx, showRange = false) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 18, 0, Math.PI * 2);
        ctx.stroke();

        if (showRange) {
            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

// =========================
// FUNKCJE POMOCNICZE
// =========================
function is_on_road(x, y) {
    for (let i = 0; i < PATH.length - 1; i++) {
        const x1 = PATH[i].x;
        const y1 = PATH[i].y;
        const x2 = PATH[i + 1].x;
        const y2 = PATH[i + 1].y;

        const A = {x: x - x1, y: y - y1};
        const B = {x: x2 - x1, y: y2 - y1};
        const denom = (B.x * B.x + B.y * B.y);
        if (denom === 0) continue;

        let t = (A.x * B.x + A.y * B.y) / denom;
        t = Math.max(0, Math.min(1, t));
        const px = x1 + t * B.x;
        const py = y1 + t * B.y;

        if (Math.hypot(px - x, py - y) < 40) {
            return true;
        }
    }
    return false;
}

function find_tower_at(mx, my) {
    for (const t of towers) {
        if (Math.hypot(t.x - mx, t.y - my) < 20) {
            return t;
        }
    }
    return null;
}

// =========================
// INPUT
// =========================
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) mouseDownLeft = true;
    if (e.button === 2) mouseDownRight = true;
});

canvas.addEventListener("mouseup", (e) => {
    if (e.button === 0) mouseDownLeft = false;
    if (e.button === 2) mouseDownRight = false;
});

canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

// =========================
// LOGIKA GRY
// =========================
function update(dt) {
    if (!running) return;

    if (!gameOver) {
        // fale
        if (enemiesToSpawn === 0 && enemies.length === 0) {
            wave += 1;
            enemiesToSpawn = 8 + wave * 2;
            spawnDelay = Math.max(12, Math.floor(SPAWN_DELAY_BASE * Math.pow(0.97, wave)));
            spawnTimer = 0;
        }

        spawnTimer += 1;
        if (enemiesToSpawn > 0 && spawnTimer >= spawnDelay) {
            enemies.push(new Enemy(wave));
            enemiesToSpawn -= 1;
            spawnTimer = 0;
        }

        // kliknięcia
        handleMouseActions();

        // ENEMIES
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.move()) {
                lives -= 1;
                enemies.splice(i, 1);
            } else if (e.hp <= 0) {
                money += e.reward;
                enemies.splice(i, 1);
            }
        }

        // TOWERS
        const hoveredTower = find_tower_at(mouseX, mouseY);
        for (const t of towers) {
            const shot = t.attack(enemies);
            t._hovered = (t === hoveredTower || t === menuTower);
            if (shot) {
                if (!t._shots) t._shots = [];
                t._shots.push(shot);
            }
        }

        if (lives <= 0) {
            gameOver = true;
        }
    }

    prevMouseDownLeft = mouseDownLeft;
    prevMouseDownRight = mouseDownRight;
}

function handleMouseActions() {
    const clickLeft = mouseDownLeft && !prevMouseDownLeft;
    const clickRight = mouseDownRight && !prevMouseDownRight;

    if (!clickLeft && !clickRight) return;

    // Obsługa Menu Contextowego (LPM na opcje)
    if (menuTower && clickLeft) {
        const sellRect = {x: menuPos.x, y: menuPos.y, w: 120, h: 30};
        const upgRect = {x: menuPos.x, y: menuPos.y + 30, w: 120, h: 30};

        if (mouseX >= sellRect.x && mouseX <= sellRect.x + sellRect.w && 
            mouseY >= sellRect.y && mouseY <= sellRect.y + sellRect.h) {
            money += 50;
            towers = towers.filter(t => t !== menuTower);
            menuTower = null;
            return;
        } else if (mouseX >= upgRect.x && mouseX <= upgRect.x + upgRect.w && 
                   mouseY >= upgRect.y && mouseY <= upgRect.y + upgRect.h) {
            if (!menuTower.can_upgrade()) {
                showMessage("Maksymalny poziom!");
            } else if (money < menuTower.upgrade_cost) {
                showMessage("Za mało kasy na upgrade!");
            } else {
                money -= menuTower.upgrade_cost;
                menuTower.upgrade();
                showMessage(`Wieża ulepszona do poziomu ${menuTower.level}`);
            }
            menuTower = null;
            return;
        } else {
            menuTower = null; // Zamknij jeśli kliknięto gdzie indziej
        }
    }

    // panel wież
    if (mouseY > HEIGHT - 100) {
        if (clickLeft) {
            const idx = Math.floor(mouseX / 160);
            if (idx >= 0 && idx < TOWER_TYPES.length) {
                selectedType = idx;
            }
        }
        return;
    }

    if (clickLeft) {
        // stawianie wieży
        const cfg = TOWER_TYPES[selectedType];
        if (money < cfg.cost) {
            showMessage("Za mało kasy!");
            return;
        }
        if (is_on_road(mouseX, mouseY)) {
            showMessage("Nie można stawiać na drodze!");
            return;
        }
        for (const t of towers) {
            if (Math.hypot(t.x - mouseX, t.y - mouseY) < 40) {
                showMessage("Za blisko innej wieży!");
                return;
            }
        }
        towers.push(new Tower(mouseX, mouseY, cfg));
        money -= cfg.cost;
    }

    if (clickRight) {
        // Otwieranie menu PPM
        const t = find_tower_at(mouseX, mouseY);
        if (t) {
            menuTower = t;
            menuPos = {x: mouseX, y: mouseY};
        } else {
            menuTower = null;
        }
    }
}

function showMessage(text) {
    message = text;
    msgTimer = 90;
}

// =========================
// RYSOWANIE
// =========================
function draw() {
    ctx.fillStyle = GRASS;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = ROAD_COLOR;
    ctx.lineWidth = 60;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i++) {
        ctx.lineTo(PATH[i].x, PATH[i].y);
    }
    ctx.stroke();

    for (const e of enemies) { e.draw(ctx); }

    for (const t of towers) {
        if (t._shots) {
            ctx.strokeStyle = WHITE;
            ctx.lineWidth = 2;
            for (const s of t._shots) {
                ctx.beginPath();
                ctx.moveTo(s.from.x, s.from.y);
                ctx.lineTo(s.to.x, s.to.y);
                ctx.stroke();
            }
            t._shots = [];
        }
        t.draw(ctx, t._hovered);
    }

    // Rysowanie Menu Kontextowego
    if (menuTower && !gameOver) {
        ctx.fillStyle = GRAY;
        ctx.fillRect(menuPos.x, menuPos.y, 120, 60);
        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 1;
        ctx.strokeRect(menuPos.x, menuPos.y, 120, 60);
        ctx.beginPath();
        ctx.moveTo(menuPos.x, menuPos.y + 30);
        ctx.lineTo(menuPos.x + 120, menuPos.y + 30);
        ctx.stroke();

        ctx.fillStyle = WHITE;
        ctx.font = "14px Consolas";
        ctx.fillText("SELL (50)", menuPos.x + 5, menuPos.y + 8);
        ctx.fillText(`UPG (${menuTower.upgrade_cost})`, menuPos.x + 5, menuPos.y + 38);
    }

    ctx.fillStyle = BLACK;
    ctx.fillRect(0, HEIGHT - 100, WIDTH, 100);
    ctx.font = "20px Consolas";
    ctx.textBaseline = "top";

    for (let i = 0; i < TOWER_TYPES.length; i++) {
        const cfg = TOWER_TYPES[i];
        const x = i * 160 + 10;
        const y = HEIGHT - 90;
        ctx.fillStyle = (i === selectedType) ? "#646464" : "#3C3C3C";
        ctx.fillRect(x, y, 150, 80);
        ctx.fillStyle = cfg.color;
        ctx.beginPath(); ctx.arc(x + 25, y + 25, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = WHITE; ctx.fillText(cfg.name, x + 50, y + 10);
        ctx.fillStyle = YELLOW; ctx.fillText("$" + cfg.cost, x + 50, y + 40);
    }

    ctx.fillStyle = YELLOW; ctx.fillText("Kasa: $" + money, 20, 20);
    ctx.fillStyle = RED; ctx.fillText("Życia: " + lives, 20, 50);
    ctx.fillStyle = WHITE; ctx.fillText("Fala: " + wave, 20, 80);

    if (msgTimer > 0) {
        ctx.fillStyle = WHITE;
        const text = message;
        const w = ctx.measureText(text).width;
        ctx.fillText(text, WIDTH / 2 - w / 2, 20);
        msgTimer -= 1;
    }

    if (gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = RED; ctx.font = "40px Consolas";
        ctx.fillText("GAME OVER", WIDTH / 2 - ctx.measureText("GAME OVER").width / 2, HEIGHT / 2 - 60);
    }
}

function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    update(dt);
    draw();
    if (running) { requestAnimationFrame(gameLoop); }
}
requestAnimationFrame(gameLoop);
