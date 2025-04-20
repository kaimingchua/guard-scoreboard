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
  logAction(`${getPlayerName(playerId)} ${delta > 0 ? 'gained' : 'lost'} ${Math.abs(delta)} point(s)`, 'default');
}

function logAction(text, type = 'default') {
    const logList = document.getElementById('logList');
    const li = document.createElement('li');
  
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-GB', { hour12: false });
    li.textContent = `[${timeString}] ${text}`;
  
    // Add class based on type
    switch (type) {
      case 'win': li.classList.add('log-win'); break;
      case 'foul': li.classList.add('log-foul'); break;
      case 'bc': li.classList.add('log-bc'); break;
      default: li.classList.add('log-default');
    }
  
    logList.appendChild(li);
}

function getPlayerName(id) {
  const input = document.querySelector(`#${id} .name`);
  return input ? input.value : id;
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

  const savedOrder = JSON.parse(localStorage.getItem('turnOrder') || '[]');
  const labels = ['FIRST', 'SECOND', 'THIRD', 'FOURTH'];
  
  savedOrder.forEach((id, i) => {
    const indicator = document.querySelector(`#${id} .turn-indicator`);
    if (indicator) {
      indicator.textContent = `Turn: ${labels[i]}`;
    }
  });  
}

function updateTurnOrder(winnerId) {
    const playerCount = parseInt(document.getElementById('playerCount').value);
    let order = [];
  
    if (playerCount === 4) {
      switch (winnerId) {
        case 'player1': order = ['player1', 'player4', 'player2', 'player3']; break;
        case 'player2': order = ['player2', 'player1', 'player3', 'player4']; break;
        case 'player3': order = ['player3', 'player2', 'player4', 'player1']; break;
        case 'player4': order = ['player4', 'player3', 'player1', 'player2']; break;
      }
    } else if (playerCount === 3) {
      switch (winnerId) {
        case 'player1': order = ['player1', 'player3', 'player2']; break;
        case 'player2': order = ['player2', 'player1', 'player3']; break;
        case 'player3': order = ['player3', 'player2', 'player1']; break;
      }
    }
  
    const labels = ['FIRST', 'SECOND', 'THIRD', 'FOURTH'];
  
    order.forEach((id, i) => {
      const indicator = document.querySelector(`#${id} .turn-indicator`);
      if (indicator) {
        indicator.textContent = `Turn: ${labels[i]}`;
      }
    });
  
    // Save to localStorage
    localStorage.setItem('turnOrder', JSON.stringify(order));
}

function restoreTurnOrder(order) {
    const labels = ['FIRST', 'SECOND', 'THIRD', 'FOURTH'];
    order.forEach((id, i) => {
      const indicator = document.querySelector(`#${id} .turn-indicator`);
      if (indicator) {
        indicator.textContent = `Turn: ${labels[i]}`;
      }
    });
    localStorage.setItem('turnOrder', JSON.stringify(order));
}  

function undoLastAction() {
    const lastAction = scoreHistory.pop();
    if (!lastAction) return;
  
    const logList = document.getElementById('logList');
    if (logList.lastChild) {
      logList.removeChild(logList.lastChild);
    }
  
    switch (lastAction.type) {
      case 'WIN':
        changeScore(lastAction.winner, -lastAction.value);
        changeScore(lastAction.loser, lastAction.value);
        if (lastAction.previousOrder) restoreTurnOrder(lastAction.previousOrder);
        break;
  
      case 'FOUL':
        changeScore(lastAction.source, -lastAction.value);
        changeScore(lastAction.target, lastAction.value);
        break;
  
      case 'BC':
        changeScore(lastAction.bcPlayer, -lastAction.value * lastAction.affected.length);
        lastAction.affected.forEach(p => changeScore(p, lastAction.value));
        if (lastAction.previousOrder) restoreTurnOrder(lastAction.previousOrder);
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

  switch (action) {
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
            value: winRate,
            previousOrder: JSON.parse(localStorage.getItem('turnOrder') || '[]') // store before updating
          });
        logAction(`${getPlayerName(winPlayer)} won against ${getPlayerName(playerId)} (+${winRate} / -${winRate})`, 'win');
        updateTurnOrder(winPlayer, playerId);
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

        logAction(`Foul: ${getPlayerName(source)} ⇄ ${getPlayerName(target)} (${value > 0 ? '+' : '-'}${Math.abs(value)})`, 'foul');
        document.querySelectorAll('button.active').forEach(btn => btn.classList.remove('active'));
        foulAction = null;
        foulPlayer = null;
      }
      break;

    case 'BC':
        const others = allPlayers.filter(p => p.id !== playerId);
        const bcTotal = bcRate * others.length;
        
        // Update scores
        changeScore(playerId, bcTotal);
        others.forEach(p => changeScore(p.id, -bcRate));
        
        // Track history
        scoreHistory.push({
            type: 'BC',
            bcPlayer: playerId,
            value: bcRate,
            affected: others.map(p => p.id),
            previousOrder: JSON.parse(localStorage.getItem('turnOrder') || '[]')
        });
        
        // Log
        logAction(`BC: ${getPlayerName(playerId)} gains ${bcTotal}, others lose ${bcRate}`, 'bc');
        
        // Treat BC as a win for turn order
        updateTurnOrder(playerId);
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

function clearGameData() {
    localStorage.removeItem('scoreboardData');
    localStorage.removeItem('turnOrder');
    location.reload();
}
