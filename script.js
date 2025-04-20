// Paste all the JavaScript logic from the <script> in index.html
// Includes: changeScore, saveScores, loadScores, undoLastAction, etc.

let scoreHistory = [];
let winPlayer = null;
let foulAction = null;
let foulPlayer = null;

function changeScore(playerId, delta) {
    const player = document.getElementById(playerId);
    const scoreEl = player.querySelector('.score');
    let score = parseInt(scoreEl.dataset.score, 10);
    score += delta;
    scoreEl.dataset.score = score;
    scoreEl.textContent = score;
  
    const flashClass = delta > 0 ? 'score-up' : 'score-down';
    player.classList.add(flashClass);
    setTimeout(() => player.classList.remove(flashClass), 500);
  
    saveScores();
}

function changeScoreWithHistory(playerId, delta) {
    changeScore(playerId, delta);
    scoreHistory.push({ playerId, delta });
}

function saveScores() {
  const data = {};
  document.querySelectorAll('.player').forEach(player => {
    const id = player.id;
    const score = parseInt(player.querySelector('.score').dataset.score, 10);
    const name = player.querySelector('.name').value;
    data[id] = { score, name };
  });
  localStorage.setItem('scoreboardData', JSON.stringify(data));
}

function loadScores() {
  const data = JSON.parse(localStorage.getItem('scoreboardData') || '{}');
  Object.keys(data).forEach(id => {
    const player = document.getElementById(id);
    if (player) {
      const score = data[id].score;
      const name = data[id].name;
      const scoreEl = player.querySelector('.score');
      scoreEl.dataset.score = score;
      scoreEl.textContent = score;
      player.querySelector('.name').value = name;
    }
  });
}

function undoLastAction() {
    const lastAction = scoreHistory.pop();
    if (!lastAction) return;
  
    switch (lastAction.type) {
      case 'WIN':
        changeScore(lastAction.winner, -lastAction.value);
        changeScore(lastAction.loser, lastAction.value);
        break;
  
      case 'FOUL':
        changeScore(lastAction.source, -lastAction.value);
        changeScore(lastAction.target, lastAction.value);
        break;
  
      case 'BC':
        changeScore(lastAction.bcPlayer, -lastAction.value * lastAction.affected.length);
        lastAction.affected.forEach(p => changeScore(p, lastAction.value));
        break;
  
      default:
        changeScore(lastAction.playerId, -lastAction.delta);
    }
}

function handleButton(action, playerId, el) {
  const winRate = parseInt(document.getElementById('winRate').value);
  const foulRate = parseInt(document.getElementById('foulRate').value);
  const bcRate = parseInt(document.getElementById('bcRate').value);
  const allPlayers = [...document.querySelectorAll('.player')];

  switch(action) {
    case 'WIN':
        winPlayer = playerId;
        break;
    case 'LOSE':
    if (winPlayer && winPlayer !== playerId) {
        changeScore(winPlayer, winRate);
        changeScore(playerId, -winRate);
        scoreHistory.push({
        type: 'WIN',
        winner: winPlayer,
        loser: playerId,
        value: winRate
        });
        winPlayer = null;
    }
    break;
    case 'FOUL+':
    case 'FOUL-':
    if (!foulAction) {
        foulAction = action;
        foulPlayer = playerId;
        el.classList.add('active');
    } else if (foulAction !== action && foulPlayer !== playerId) {
        const source = foulPlayer;
        const target = playerId;
        const value = foulRate;
        if (foulAction === 'FOUL+') {
        changeScore(source, value);
        changeScore(target, -value);
        scoreHistory.push({
            type: 'FOUL',
            source,
            target,
            value: value
        });
        } else {
        changeScore(source, -value);
        changeScore(target, value);
        scoreHistory.push({
            type: 'FOUL',
            source,
            target,
            value: -value
        });
        }
        document.querySelectorAll('button.active').forEach(btn => btn.classList.remove('active'));
        foulAction = null;
        foulPlayer = null;
    }
    break;
    case 'BC':
    const others = allPlayers.filter(p => p.id !== playerId);
    changeScore(playerId, bcRate * others.length);
    others.forEach(p => changeScore(p.id, -bcRate));
    scoreHistory.push({
        type: 'BC',
        bcPlayer: playerId,
        value: bcRate,
        affected: others.map(p => p.id) // record affected players
    });
    break;
  }
}

function createPlayer(id) {
  return `
    <div class="player" id="player${id}">
      <input class="name" value="Player ${id}" />
      <div class="score" data-score="0">0</div>
      <div class="turn-indicator">Turn: -</div>
      <div class="controls">
        <button onclick="handleButton('WIN', 'player${id}', this)">WIN</button>
        <button onclick="handleButton('LOSE', 'player${id}', this)">LOSE</button>
        <button onclick="handleButton('FOUL+', 'player${id}', this)">FOUL+</button>
        <button onclick="handleButton('FOUL-', 'player${id}', this)">FOUL-</button>
        <button onclick="handleButton('BC', 'player${id}', this)">BC</button>
        <button onclick="undoLastAction()">UNDO</button>
      </div>
    </div>
  `;
}

function updatePlayers() {
  const container = document.getElementById('playerContainer');
  const count = parseInt(document.getElementById('playerCount').value);
  let html = '';
  for (let i = 1; i <= count; i++) {
    html += createPlayer(i);
  }
  container.innerHTML = html;
  loadScores();
}

window.onload = updatePlayers;
