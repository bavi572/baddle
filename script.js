
const KEYBOARD_ROWS = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["Enter","z","x","c","v","b","n","m","⌫"]
];

const COLOR_PALETTE = [
  "#e74c3c",
  "#27ae60",
  "#2980b9",
  "#8e44ad",
  "#e67e22",
  "#16a085",
  "#f39c12",
  "#2c3e50",
  "#c0392b",
  "#d35400",
];

function setRandomColors() {
  const pool = [...COLOR_PALETTE];
  const picked = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  const root = document.documentElement.style;
  root.setProperty('--color-wrong',     picked[0]);
  root.setProperty('--color-misplaced', picked[1]);
  root.setProperty('--color-correct',   picked[2]);
}

setRandomColors();

// Stats
function loadStats() {
  return JSON.parse(localStorage.getItem('wordleStats') || JSON.stringify({
    played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0,0,0,0,0,0]
  }));
}

function saveStats(stats) {
  localStorage.setItem('wordleStats', JSON.stringify(stats));
}

function recordResult(won, row) {
  const stats = loadStats();
  stats.played++;
  if (won) {
    stats.wins++;
    stats.streak++;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    stats.dist[row]++;
  } else {
    stats.streak = 0;
  }
  saveStats(stats);
  return stats;
}

function showStats(stats, wonRow) {
  document.getElementById('stat-played').textContent   = stats.played;
  document.getElementById('stat-winpct').textContent   = stats.played ? Math.round(stats.wins / stats.played * 100) : 0;
  document.getElementById('stat-streak').textContent   = stats.streak;
  document.getElementById('stat-maxstreak').textContent = stats.maxStreak;

  const max = Math.max(...stats.dist, 1);
  const dist = document.getElementById('guess-dist');
  dist.innerHTML = '';
  stats.dist.forEach((count, i) => {
    const pct = Math.round(count / max * 100);
    dist.innerHTML += `
      <div class="dist-row">
        <span>${i + 1}</span>
        <div class="dist-bar-wrap">
          <div class="dist-bar ${wonRow === i ? 'highlight' : ''}" style="width:${pct}%">${count}</div>
        </div>
      </div>`;
  });

  setTimeout(() => document.getElementById('stats-overlay').classList.add('show'), 1800);
}

document.getElementById('stats-close').addEventListener('click', () =>
  document.getElementById('stats-overlay').classList.remove('show')
);

document.getElementById('play-again').addEventListener('click', () => location.reload());


let answer = '';

fetch('https://wordlehintstoday.org/api/v1/wordle/answers/latest?')
  .then(r => r.json())
  .then(data => { answer = data.answer.toLowerCase(); })
  .catch(() => { answer = ''; });

let currentRow = 0;
let currentCol = 0;
let currentGuess = [];
let gameOver = false;

// Build board
const board = document.getElementById('board');
const tiles = [];
for (let r = 0; r < 6; r++) {
  tiles[r] = [];
  for (let c = 0; c < 5; c++) {
    const tile = document.createElement('div');
    tile.classList.add('tile');
    board.appendChild(tile);
    tiles[r][c] = tile;
  }
}

// Build keyboard
const keyMap = {};
const keyboard = document.getElementById('keyboard');
KEYBOARD_ROWS.forEach(row => {
  const rowEl = document.createElement('div');
  rowEl.classList.add('key-row');
  row.forEach(k => {
    const btn = document.createElement('button');
    btn.classList.add('key');
    btn.textContent = k;
    if (k === 'Enter' || k === '⌫') btn.classList.add('wide');
    btn.addEventListener('click', () => handleKey(k));
    rowEl.appendChild(btn);
    keyMap[k] = btn;
  });
  keyboard.appendChild(rowEl);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleKey('Enter');
  else if (e.key === 'Backspace') handleKey('⌫');
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toLowerCase());
});

function handleKey(key) {
  if (gameOver) return;
  if (key === '⌫') {
    if (currentCol > 0) {
      currentCol--;
      currentGuess.pop();
      tiles[currentRow][currentCol].textContent = '';
      tiles[currentRow][currentCol].classList.remove('filled');
    }
  } else if (key === 'Enter') {
    submitGuess();
  } else if (currentCol < 5) {
    tiles[currentRow][currentCol].textContent = key;
    tiles[currentRow][currentCol].classList.add('filled');
    currentGuess.push(key);
    currentCol++;
  }
}

async function submitGuess() {
  if (currentCol < 5) {
    showMessage("Not enough letters");
    shakeRow(currentRow);
    return;
  }
  const guess = currentGuess.join('');

  const valid = await isWordValid(guess);
  if (!valid) {
    showMessage("Not in word list");
    shakeRow(currentRow);
    return;
  }

  const result = getResult(guess, answer);
  result.forEach((state, i) => {
    setTimeout(() => {
      tiles[currentRow][i].classList.add('flip');
      setTimeout(() => {
        tiles[currentRow][i].classList.add(state);
        tiles[currentRow][i].classList.remove('flip');
      }, 250);
    }, i * 150);

    const keyEl = keyMap[guess[i]];
    const priority = { correct: 3, misplaced: 2, wrong: 1 };
    const current = priority[keyEl.dataset.state] || 0;
    if (priority[state] > current) {
      setTimeout(() => {
        keyEl.classList.remove('wrong', 'misplaced', 'correct');
        keyEl.classList.add(state);
        keyEl.dataset.state = state;
      }, i * 150 + 250);
    }
  });

  const totalDelay = 5 * 150 + 250;

  if (guess === answer) {
    setTimeout(() => {
      showMessage("🎉 Brilliant!");
      gameOver = true;
      const stats = recordResult(true, currentRow);
      showStats(stats, currentRow);
    }, totalDelay);
    return;
  }

  setTimeout(() => {
    currentRow++;
    currentCol = 0;
    currentGuess = [];

    if (currentRow === 6) {
      showMessage(answer.toUpperCase(), 3000);
      gameOver = true;
      const stats = recordResult(false, -1);
      showStats(stats, -1);
    }
  }, totalDelay);
}

function getResult(guess, answer) {
  const result = Array(5).fill('wrong');
  const answerArr = answer.split('');

  guess.split('').forEach((l, i) => {
    if (l === answerArr[i]) { result[i] = 'correct'; answerArr[i] = null; }
  });
  guess.split('').forEach((l, i) => {
    if (result[i] === 'correct') return;
    const j = answerArr.indexOf(l);
    if (j !== -1) { result[i] = 'misplaced'; answerArr[j] = null; }
  });

  return result;
}

async function isWordValid(word) {
  try {
    const safe = word.replace(/[^a-z]/g, '');
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${safe}`);
    return r.ok;
  } catch {
    return true;
  }
}

function shakeRow(row) {
  tiles[row].forEach(t => t.classList.add('shake'));
  setTimeout(() => tiles[row].forEach(t => t.classList.remove('shake')), 400);
}

function showMessage(msg, duration = 1500) {
  const el = document.getElementById('message');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}
