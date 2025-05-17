let scoreHistory = [];

function togglePlayerMode() {
  const current = parseInt(document.getElementById('playerCount').value);
  const newCount = current === 4 ? 3 : 4;
  document.getElementById('playerCount').value = newCount;
  document.getElementById('togglePlayerCount').textContent = newCount === 4 ? '3 Players Mode' : '4 Players Mode';
  updatePlayers();
}

function toggleDarkMode() {
  const root = document.documentElement;
  const isDark = root.classList.toggle('dark');
  document.getElementById('darkToggle').textContent = isDark ? '☀️' : '🌙';
}

function showHelp() {
  const popup = document.getElementById('helpPopup');
  if (popup) {
    popup.classList.remove('hidden');
    popup.style.opacity = 0;
    setTimeout(() => (popup.style.opacity = 1), 10);
  }
}

function hideHelp() {
  const popup = document.getElementById('helpPopup');
  if (popup) {
    popup.style.opacity = 0;
    setTimeout(() => popup.classList.add('hidden'), 300);
  }
}

function getPlayerName(id) {
  const el = document.querySelector(`#${id} .name`);
  return el?.value?.trim() || id;
}

function logAction(text) {
  const log = document.getElementById('logList');
  if (log) {
    const li = document.createElement('li');
    li.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    log.appendChild(li);
  }
}

function restoreTurnOrder(order) {
  const display = document.getElementById('turnOrderDisplay');
  if (!order || !display) return;
  const names = order.map(getPlayerName);
  display.textContent = `Turn: ${names.join(' > ')}`;
  localStorage.setItem('turnOrder', JSON.stringify(order));
}

function updateInitialTurnOrder() {
  const ids = [...document.querySelectorAll('.player')].map(p => p.id);
  restoreTurnOrder(ids);
}

function updateTurnOrder(winner) {
  const order = JSON.parse(localStorage.getItem('turnOrder') || '[]');
  if (order.length === 3) {
    const [a, b, c] = order;
    if (winner === a) restoreTurnOrder([a, c, b]);
    if (winner === b) restoreTurnOrder([b, a, c]);
    if (winner === c) restoreTurnOrder([c, b, a]);
  } else {
    const [a, b, c, d] = order;
    if (winner === a) restoreTurnOrder([a, d, b, c]);
    if (winner === b) restoreTurnOrder([b, a, c, d]);
    if (winner === c) restoreTurnOrder([c, b, d, a]);
    if (winner === d) restoreTurnOrder([d, c, a, b]);
  }
}

function changeScore(id, delta) {
  const el = document.getElementById(id)?.querySelector('.score');
  if (!el) return;
  const current = parseInt(el.dataset.score || "0");
  const updated = current + delta;
  el.dataset.score = updated;
  el.textContent = updated;
}

function handleButton(action, id) {
  const players = [...document.querySelectorAll('.player')];
  const order = JSON.parse(localStorage.getItem('turnOrder') || '[]');
  const win = parseInt(document.getElementById('winRate').value);
  const foul = parseInt(document.getElementById('foulRate').value);
  const bc = parseInt(document.getElementById('bcRate').value);

  const index = order.indexOf(id);
  const loser = order[(index - 1 + order.length) % order.length];

  switch (action) {
    case 'WIN':
      changeScore(id, win);
      changeScore(loser, -win);
      updateTurnOrder(id);
      logAction(`${getPlayerName(id)} won against ${getPlayerName(loser)}`);
      break;
    case 'FOUL+':
      changeScore(id, foul);
      changeScore(loser, -foul);
      logAction(`${getPlayerName(id)} fouled ${getPlayerName(loser)}`);
      break;
    case 'BC':
      const others = players.filter(p => p.id !== id);
      changeScore(id, bc * others.length);
      others.forEach(p => changeScore(p.id, -bc));
      updateTurnOrder(id);
      logAction(`${getPlayerName(id)} BC all others`);
      break;
    case 'RUNOUT':
      changeScore(id, bc);
      changeScore(loser, -bc);
      updateTurnOrder(id);
      logAction(`${getPlayerName(id)} runout vs ${getPlayerName(loser)}`);
      break;
    case 'GOLDEN':
      const opps = players.filter(p => p.id !== id);
      changeScore(id, win * opps.length);
      opps.forEach(p => changeScore(p.id, -win));
      updateTurnOrder(id);
      logAction(`${getPlayerName(id)} golden break!`);
      break;
  }
}

function createPlayer(id) {
  return `
    <div id="player${id}" class="player bg-white dark:bg-gray-100 rounded-lg p-4 shadow-md flex flex-col items-center space-y-2 transition-colors">
      <input class="name text-lg font-bold text-center w-full border-b text-black transition-colors" value="Player ${id}" oninput="updateInitialTurnOrder()" />
      <div class="score text-6xl text-blue-600 font-bold" data-score="0" contenteditable="true">0</div>
      <div class="controls flex flex-wrap gap-2 justify-center">
        <button onclick="handleButton('WIN', 'player${id}')" class="bg-green-600 text-white px-3 py-1 rounded">WIN</button>
        <button onclick="handleButton('FOUL+', 'player${id}')" class="bg-red-600 text-white px-3 py-1 rounded">FOUL+</button>
        <button onclick="handleButton('BC', 'player${id}')" class="bg-yellow-500 text-white px-3 py-1 rounded">BC</button>
        <button onclick="handleButton('RUNOUT', 'player${id}')" class="bg-purple-600 text-white px-3 py-1 rounded">RUNOUT</button>
        <button onclick="handleButton('GOLDEN', 'player${id}')" class="bg-blue-600 text-white px-3 py-1 rounded">GOLDEN</button>
        <button onclick="undoLastAction()" class="bg-gray-600 text-white px-3 py-1 rounded">UNDO</button>
      </div>
    </div>
  `;
}

function updatePlayers() {
  const count = parseInt(document.getElementById('playerCount').value);
  const container = document.getElementById('playerContainer');
  let html = '';
  for (let i = 1; i <= count; i++) html += createPlayer(i);
  container.innerHTML = html;
  updateInitialTurnOrder();
}

function clearGameData() {
  localStorage.clear();
  location.reload();
}

function showHistory() {
    const popup = document.getElementById('historyPopup');
    if (popup) {
      popup.classList.remove('hidden');
      popup.style.opacity = 0;
      setTimeout(() => popup.style.opacity = 1, 10);
    }
  }
  
  function hideHistory() {
    const popup = document.getElementById('historyPopup');
    if (popup) {
      popup.style.opacity = 0;
      setTimeout(() => popup.classList.add('hidden'), 300);
    }
  }

window.addEventListener('DOMContentLoaded', updatePlayers);
