let scoreHistory = [];

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

  switch (type) {
    case 'win': li.classList.add('log-win'); break;
    case 'foul': li.classList.add('log-foul'); break;
    case 'bc': li.classList.add('log-bc'); break;
    default: li.classList.add('log-default');
  }

  logList.appendChild(li);
}

function getPlayerName(id) {
  const playerId = id.toString().startsWith('player') ? id : `player${id}`;
  const input = document.querySelector(`#${playerId} .name`);
  return input ? input.value : playerId;
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
  restoreTurnOrder(savedOrder);
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

  restoreTurnOrder(order);
}

function setFirstTurn(playerId) {
  const playerCount = parseInt(document.getElementById('playerCount').value);
  let order = [];

  if (playerCount === 4) {
    switch (playerId) {
      case 'player1': order = ['player1', 'player4', 'player2', 'player3']; break;
      case 'player2': order = ['player2', 'player1', 'player3', 'player4']; break;
      case 'player3': order = ['player3', 'player2', 'player4', 'player1']; break;
      case 'player4': order = ['player4', 'player3', 'player1', 'player2']; break;
    }
  } else if (playerCount === 3) {
    switch (playerId) {
      case 'player1': order = ['player1', 'player3', 'player2']; break;
      case 'player2': order = ['player2', 'player1', 'player3']; break;
      case 'player3': order = ['player3', 'player2', 'player1']; break;
    }
  }

  restoreTurnOrder(order);
  logAction(`${getPlayerName(playerId)} manually set as FIRST TURN`, 'default');
}

function undoLastAction() {
  const lastAction = scoreHistory.pop();
  if (!lastAction) return;

  // Restore scores first
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

    case 'RUNOUT':
      changeScore(lastAction.winner, -lastAction.value);
      changeScore(lastAction.loser, lastAction.value);
      break;      

    case 'GOLDEN':
      changeScore(lastAction.player, -lastAction.value * lastAction.affected.length);
      lastAction.affected.forEach(p => changeScore(p, lastAction.value));
      break;

    default:
      changeScore(lastAction.playerId, -lastAction.delta);
  }

  // Restore turn order if stored
  if (lastAction.previousOrder && Array.isArray(lastAction.previousOrder)) {
    setTimeout(() => {
      restoreTurnOrder(lastAction.previousOrder);
    }, 0); // Defer to ensure UI is in place
  }

  // Remove the most recent log entry visually
  const logList = document.getElementById('logList');
  if (logList.lastChild) {
    logList.removeChild(logList.lastChild);
  }
}

function handleButton(action, playerId, el) {
  // const winRate = parseInt(document.getElementById('winRate').value);
  // const foulRate = parseInt(document.getElementById('foulRate').value);
  const bcRate = parseInt(document.getElementById('bcRate').value);
  const allPlayers = [...document.querySelectorAll('.player')];
  syncAllManualScores(); // ensure latest scores are saved before changing

  switch (action) {
    case 'WIN':
      const playerCount = parseInt(document.getElementById('playerCount').value);
      const winRate = parseInt(document.getElementById('winRate').value);
    
      let loserId;
    
      if (playerCount === 4) {
        const loserMap4 = {
          player1: 'player4',
          player2: 'player1',
          player3: 'player2',
          player4: 'player3',
        };
        loserId = loserMap4[playerId];
      } else if (playerCount === 3) {
        const loserMap3 = {
          player1: 'player3',
          player2: 'player1',
          player3: 'player2',
        };
        loserId = loserMap3[playerId];
      }
    
      changeScore(playerId, winRate);
      changeScore(loserId, -winRate);
    
      scoreHistory.push({
        type: 'WIN',
        winner: playerId,
        loser: loserId,
        value: winRate,
        previousOrder: JSON.parse(localStorage.getItem('turnOrder') || '[]')
      });
    
      logAction(`${getPlayerName(playerId)} won against ${getPlayerName(loserId)} (+${winRate} / -${winRate})`, 'win');
    
      updateTurnOrder(playerId);
      break;    
      case 'FOUL+':
        const playerCountFoul = parseInt(document.getElementById('playerCount').value);
        const foulRate = parseInt(document.getElementById('foulRate').value);
      
        let foulTarget;
      
        if (playerCountFoul === 4) {
          const foulMap4 = {
            player1: 'player4',
            player2: 'player1',
            player3: 'player2',
            player4: 'player3',
          };
          foulTarget = foulMap4[playerId];
        } else if (playerCountFoul === 3) {
          const foulMap3 = {
            player1: 'player3',
            player2: 'player1',
            player3: 'player2',
          };
          foulTarget = foulMap3[playerId];
        }
      
        changeScore(playerId, foulRate);
        changeScore(foulTarget, -foulRate);
      
        scoreHistory.push({
          type: 'FOUL',
          source: playerId,
          target: foulTarget,
          value: foulRate,
          previousOrder: JSON.parse(localStorage.getItem('turnOrder') || '[]')
        });
      
        logAction(`Foul: ${getPlayerName(playerId)} gains ${foulRate}, ${getPlayerName(foulTarget)} loses ${foulRate}`, 'foul');
        break;
      
    case 'BC':
      const others = allPlayers.filter(p => p.id !== playerId);
      const bcTotal = bcRate * others.length;

      changeScore(playerId, bcTotal);
      others.forEach(p => changeScore(p.id, -bcRate));

      scoreHistory.push({
        type: 'BC',
        bcPlayer: playerId,
        value: bcRate,
        affected: others.map(p => p.id),
        previousOrder: JSON.parse(localStorage.getItem('turnOrder') || '[]')
      });

      logAction(`BC: ${getPlayerName(playerId)} gains ${bcTotal}, others lose ${bcRate}`, 'bc');
      updateTurnOrder(playerId);
      break;

      case 'RUNOUT':
        const playerCountRunout = parseInt(document.getElementById('playerCount').value);
      
        let runoutTarget = null;
      
        if (playerCountRunout === 4) {
          const runoutMap4 = {
            player1: 'player4',
            player2: 'player1',
            player3: 'player2',
            player4: 'player3',
          };
          runoutTarget = runoutMap4[playerId];
        } else if (playerCountRunout === 3) {
          const runoutMap3 = {
            player1: 'player3',
            player2: 'player1',
            player3: 'player2',
          };
          runoutTarget = runoutMap3[playerId];
        }
      
        if (!runoutTarget || runoutTarget === playerId) {
          alert("Invalid RUNOUT: Cannot run out against yourself or target not found.");
          return;
        }
      
        changeScore(playerId, bcRate);
        changeScore(runoutTarget, -bcRate);
      
        scoreHistory.push({
          type: 'RUNOUT',
          winner: playerId,
          loser: runoutTarget,
          value: bcRate,
          previousOrder: JSON.parse(localStorage.getItem('turnOrder') || '[]')
        });
      
        logAction(`RUNOUT: ${getPlayerName(playerId)} gains ${bcRate}, ${getPlayerName(runoutTarget)} loses ${bcRate}`, 'bc');
      
        // Update turn order just like WIN/FOUL
        updateTurnOrder(playerId);
        break;
        
      case 'GOLDEN':
        const goldenWinRate = parseInt(document.getElementById('winRate').value);
        const goldenOthers = allPlayers.filter(p => p.id !== playerId);
        const goldenBonus = goldenWinRate * goldenOthers.length;
      
        changeScore(playerId, goldenBonus);
        goldenOthers.forEach(p => changeScore(p.id, -goldenWinRate));
      
        scoreHistory.push({
          type: 'GOLDEN',
          player: playerId,
          value: goldenWinRate,
          affected: goldenOthers.map(p => p.id),
          previousOrder: JSON.parse(localStorage.getItem('turnOrder') || '[]')
        });
      
        logAction(`GOLDEN BREAK: ${getPlayerName(playerId)} gains ${goldenBonus}, others lose ${goldenWinRate}`, 'win');
      
        updateTurnOrder(playerId);
        break;
  }
}

function createPlayer(id) {
  return `
    <div class="player" id="player${id}">
      <button class="first-turn-btn" onclick="setFirstTurn('player${id}')">FIRST TURN</button>
      <input class="name" value="Player ${id}" />
      <div class="score" data-score="0" contenteditable="true" onblur="handleManualScoreEdit('${id}')">0</div>
      <div class="turn-indicator">Turn: -</div>
      <div class="controls">
        <button onclick="handleButton('WIN', 'player${id}', this)">WIN</button>
        <button onclick="handleButton('FOUL+', 'player${id}', this)">FOUL+</button>
        <button onclick="handleButton('BC', 'player${id}', this)">BC</button>
        <button onclick="handleButton('RUNOUT', 'player${id}', this)">RUNOUT</button>
        <button onclick="handleButton('GOLDEN', 'player${id}', this)">GOLDEN BREAK</button>
        <button onclick="undoLastAction()">UNDO</button>
      </div>
    </div>
  `;
}

function handleManualScoreEdit(playerId) {
  const player = document.getElementById(playerId);
  const scoreEl = player.querySelector('.score');
  let value = parseInt(scoreEl.textContent.trim(), 10);

  if (isNaN(value)) {
    alert("Please enter a valid number for the score.");
    scoreEl.textContent = scoreEl.dataset.score; // revert to previous
    return;
  }

  // Update dataset so changeScore uses new value
  scoreEl.dataset.score = value;

  // Save to localStorage
  saveScores();

  // Log the edit
  logAction(`${getPlayerName(playerId)} score manually set to ${value}`, 'default');
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

function syncAllManualScores() {
  document.querySelectorAll('.player').forEach(player => {
    const scoreEl = player.querySelector('.score');
    let value = parseInt(scoreEl.textContent.trim(), 10);
    if (!isNaN(value)) {
      scoreEl.dataset.score = value;
    }
  });
}

function clearGameData() {
  localStorage.removeItem('scoreboardData');
  localStorage.removeItem('turnOrder');
  location.reload();
}

window.onload = updatePlayers;
