/* script.js — Pool guard scoring logic, adapted for your Tailwind UI (no RUNOUT) */
(() => {
  "use strict";

  // ---------- State ----------
  let scores = {};               // {1:0,2:0,3:0,(4:0)}
  let order = [1, 2, 3];         // current shooting order, first = at table
  let isFourPlayers = false;

  // History (for undo)
  let historyLog = [];           // [{text, time}]
  let scoreLog = [];             // deep copies of scores
  let orderLog = [];             // copies of order

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const getRate = (id) => parseInt($(id).value, 10) || 0;
  const WIN = () => getRate("#winRate");
  const FOUL = () => getRate("#foulRate");
  const BC = () => getRate("#bcRate");

  const formatTime = (d) => {
    const t = new Date(d);
    let h = t.getHours();
    const m = String(t.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return `${h}:${m}${ampm}`;
  };

  const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

  function logState(text) {
    historyLog.push({ text, time: new Date().toISOString() });
    scoreLog.push(deepCopy(scores));
    orderLog.push([...order]);
    save();
  }

  function setTurnOrderText() {
    const names = order.map((i) => getPlayerName(i));
    $("#turnOrderDisplay").textContent = `Turn: ${names.join(" → ")}`;
  }

  function getPlayerName(i) {
    const el = $(`#name-${i}`);
    return el?.value?.trim() || `P${i}`;
  }

  function setPlayerNameLabel(i) {
    const label = $(`#name-label-${i}`);
    if (label) label.textContent = getPlayerName(i);
  }

  function updateCardStyles() {
    for (const i of Object.keys(scores)) {
      const card = document.getElementById(`card-${i}`);
      if (!card) continue;
      card.classList.remove("ring-2", "ring-red-600", "ring-green-600");
      if (scores[i] > 0) card.classList.add("ring-2", "ring-green-600");
      else if (scores[i] < 0) card.classList.add("ring-2", "ring-red-600");
    }
  }

  function updateAllScores(prevScores) {
    const old = prevScores || (scoreLog.length > 1 ? scoreLog[scoreLog.length - 2] : {});
    for (const i of Object.keys(scores)) {
      const el = $(`#score-${i}`);
      if (!el) continue;
      const before = old[i] ?? 0;
      const after = scores[i];
      el.textContent = String(after);

      // tiny bump animation via opacity
      el.classList.remove("opacity-70");
      void el.offsetWidth; // reflow
      el.classList.add("opacity-70");

      // quick color flash
      el.style.transition = "color 0.6s ease";
      el.style.color = after > before ? "#22c55e" : after < before ? "#ef4444" : "";
      setTimeout(() => (el.style.color = ""), 600);
    }
    setTurnOrderText();
    updateCardStyles();
    updateSpecialActionButtons();
    save();
  }

  function updateSpecialActionButtons() {
    // Enable BC/GOLDEN only for the current player (order[0])
    const current = order[0];
    for (const i of Object.keys(scores)) {
      const card = document.getElementById(`card-${i}`);
      if (!card) continue;
      const specials = card.querySelectorAll("[data-special]");
      specials.forEach((btn) => {
        btn.disabled = parseInt(i, 10) !== current;
        btn.classList.toggle("opacity-50", btn.disabled);
        btn.classList.toggle("cursor-not-allowed", btn.disabled);
      });
    }
  }

  // ---------- Core guard logic ----------
  function updateOrderAfterWin(winner) {
    const idx = order.indexOf(winner);
    if (!isFourPlayers) {
      // 3-player logic
      if (idx === 0) order = [order[0], order[2], order[1]];
      else if (idx === 1) order = [order[1], order[0], order[2]];
      else order = [order[2], order[1], order[0]];
    } else {
      // 4-player logic
      if (idx === 0) order = [order[0], order[3], order[1], order[2]];
      else if (idx === 1) order = [order[1], order[0], order[2], order[3]];
      else if (idx === 2) order = [order[2], order[1], order[3], order[0]];
      else order = [order[3], order[2], order[0], order[1]];
    }
  }

  function applyAction(player, action) {
    const playerName = getPlayerName(player);
    const idx = order.indexOf(player);
    let msg = "";

    if (action === "win") {
      const pts = WIN();
      scores[player] += pts;
      const prevIdx = (idx - 1 + order.length) % order.length;
      const prev = order[prevIdx];
      scores[prev] -= pts;
      msg = `${playerName} won ${getPlayerName(prev)}.`;
      updateOrderAfterWin(player);
    } else if (action === "foul") {
      const pts = FOUL();
      scores[player] -= pts;
      const prevIdx = (idx - 1 + order.length) % order.length;
      const prev = order[prevIdx];
      scores[prev] += pts;
      msg = `${playerName} fouled to ${getPlayerName(prev)}.`;
    } else if (action === "bc" || action === "golden") {
      // Split pot against all others
      const pts = action === "golden" ? WIN() : BC(); // golden uses WIN; bc uses BC
      const others = order.filter((p) => p !== player);
      let totalLoss = 0;
      for (const p of others) {
        scores[p] -= pts;
        totalLoss += pts;
      }
      scores[player] += totalLoss;
      msg = action === "bc" ? `${playerName} broke clear!` : `${playerName} golden break!`;
    }

    logState(msg);
    updateAllScores();
    addLogLine(historyLog[historyLog.length - 1]);
  }

  // ---------- UI: build player cards ----------
function playerCardHTML(i) {
  return `
    <div id="card-${i}" class="bg-white/80 dark:bg-gray-800/60 rounded-lg p-4 shadow-md transition-colors">
      <div class="flex flex-col items-center gap-3 text-center">
        <!-- Player name -->
        <input
          id="name-${i}"
          maxlength="20"
          class="w-44 sm:w-56 px-3 py-1 rounded text-black text-base sm:text-lg text-center"
          value="P${i}"
        />
        <span id="name-label-${i}" class="hidden"></span>

        <!-- BIG score -->
        <div class="leading-none">
          <span
            id="score-${i}"
            class="select-none block text-6xl sm:text-7xl md:text-8xl font-extrabold opacity-70"
            style="line-height: 0.9;"
          >0</span>
          <div class="mt-1 text-xs opacity-70">Tap score to set manually</div>
        </div>

        <!-- Buttons -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-md mt-2">
          <button data-action="win"
            class="px-3 py-2 rounded bg-green-500 text-white hover:brightness-110">WIN</button>
          <button data-action="foul"
            class="px-3 py-2 rounded bg-red-500 text-white hover:brightness-110">FOUL+</button>
          <button data-action="bc" data-special
            class="px-3 py-2 rounded bg-yellow-500 text-black hover:brightness-110">BC</button>
          <button data-action="golden" data-special
            class="px-3 py-2 rounded bg-indigo-600 text-white hover:brightness-110">GOLDEN</button>
        </div>
      </div>
    </div>
  `;
}

  function wirePlayerCard(i) {
    // Name field: update label + order text on change
    const nameInput = $(`#name-${i}`);
    nameInput.addEventListener("input", () => {
      setPlayerNameLabel(i);
      setTurnOrderText();
      save();
    });

    // Score click to set manually
    const scoreEl = $(`#score-${i}`);
    scoreEl.style.cursor = "pointer";
    scoreEl.addEventListener("click", () => {
      const curr = scores[i] ?? 0;
      const val = prompt(`Enter new score for ${getPlayerName(i)}:`, curr);
      if (val === null) return;
      if (!/^-?\d+$/.test(val.trim())) {
        alert("Please enter a valid integer.");
        return;
      }
      const oldScores = deepCopy(scores);
      scores[i] = parseInt(val, 10);
      const msg = `${getPlayerName(i)}'s score manually set to ${scores[i]}.`;
      logState(msg);
      addLogLine(historyLog[historyLog.length - 1]);
      updateAllScores(oldScores);
    });

    // Buttons
    const card = document.getElementById(`card-${i}`);
    card.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyAction(i, btn.getAttribute("data-action"));
      });
    });
  }

  function buildPlayers() {
    const wrap = $("#playerContainer");
    wrap.innerHTML = "";
    const count = isFourPlayers ? 4 : 3;
    for (let i = 1; i <= count; i++) {
      if (scores[i] === undefined) scores[i] = 0;
      wrap.insertAdjacentHTML("beforeend", playerCardHTML(i));
      wirePlayerCard(i);
      $(`#score-${i}`).textContent = String(scores[i]);
    }
    // remove stray scores when moving from 4 → 3
    if (!isFourPlayers) delete scores[4];

    setTurnOrderText();
    updateCardStyles();
    updateSpecialActionButtons();
  }

  // ---------- History popup ----------
  function addLogLine(entry) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="text-gray-500 text-xs">${formatTime(entry.time)}:</span> ${entry.text}`;
    $("#logList").appendChild(li);
  }

  function rebuildHistoryUI() {
    $("#logList").innerHTML = "";
    historyLog.forEach(addLogLine);
    // Add an Undo button (if possible)
    const footerBtnId = "undoLastBtn";
    let undoBtn = document.getElementById(footerBtnId);
    if (!undoBtn) {
      undoBtn = document.createElement("button");
      undoBtn.id = footerBtnId;
      undoBtn.className = "mt-3 w-full px-3 py-2 rounded bg-purple-600 text-white hover:brightness-110";
      undoBtn.textContent = historyLog.length > 1 ? "Undo Last Action" : "Undo (nothing to undo)";
      $("#historyPopup .bg-white, #historyPopup .dark\\:bg-gray-800")?.appendChild(undoBtn);
      undoBtn.addEventListener("click", undoLast);
    } else {
      undoBtn.textContent = historyLog.length > 1 ? "Undo Last Action" : "Undo (nothing to undo)";
    }
  }

  function undoLast() {
    if (historyLog.length <= 1) {
      alert("Nothing to undo.");
      return;
    }

    // Confirm
    const lastMsg = historyLog[historyLog.length - 1].text;
    if (!confirm(`Undo this?\n\n"${lastMsg}"`)) return;

    const undone = scoreLog.pop();   // current snapshot
    orderLog.pop();
    historyLog.pop();

    const prevScores = scoreLog[scoreLog.length - 1];
    const prevOrder = orderLog[orderLog.length - 1];

    scores = deepCopy(prevScores);
    order = [...prevOrder];

    updateAllScores(undone);
    rebuildHistoryUI();
  }

  // ---------- Mode / theme / persistence ----------
  function togglePlayerMode() {
    const futureCount = isFourPlayers ? 3 : 4;
    if (!confirm(`Switch to ${futureCount} players? This will keep names/scores for common players and drop the rest.`)) return;

    isFourPlayers = !isFourPlayers;
    order = isFourPlayers ? [1, 2, 3, 4] : [1, 2, 3];

    $("#togglePlayerCount").textContent = isFourPlayers ? "4 Players Mode" : "3 Players Mode";

    logState(isFourPlayers ? "Switched to 4 players." : "Switched to 3 players.");
    buildPlayers();
    updateAllScores();
    rebuildHistoryUI();
  }

  function toggleDarkMode() {
    const html = document.documentElement;
    const on = html.classList.toggle("dark");
    localStorage.setItem("wandollah.dark", on ? "1" : "0");
    $("#darkToggle").textContent = on ? "☀️" : "🌙";
  }

  function clearGameData() {
    if (!confirm("Clear all scores and history?")) return;
    scores = {};
    order = [1, 2, 3];
    isFourPlayers = false;
    historyLog = [];
    scoreLog = [];
    orderLog = [];
    $("#togglePlayerCount").textContent = "3 Players Mode";

    // Rebuild baseline
    buildPlayers();
    // push initial "Game Started"
    logState("Game Started");
    rebuildHistoryUI();
    updateAllScores();
  }

  function showHelp() {
    $("#helpPopup").classList.remove("hidden");
    requestAnimationFrame(() => $("#helpPopup").classList.add("opacity-100"));
  }
  function hideHelp() {
    $("#helpPopup").classList.add("hidden");
    $("#helpPopup").classList.remove("opacity-100");
  }

  function showHistory() {
    rebuildHistoryUI();
    $("#historyPopup").classList.remove("hidden");
    requestAnimationFrame(() => $("#historyPopup").classList.add("opacity-100"));
  }
  function hideHistory() {
    $("#historyPopup").classList.add("hidden");
    $("#historyPopup").classList.remove("opacity-100");
  }

  function save() {
    const payload = {
      scores,
      order,
      isFourPlayers,
      historyLog,
      scoreLog,
      orderLog,
      players: Object.fromEntries(
        (isFourPlayers ? [1, 2, 3, 4] : [1, 2, 3]).map((i) => [i, getPlayerName(i)])
      ),
      themeDark: document.documentElement.classList.contains("dark") ? 1 : 0,
    };
    localStorage.setItem("wandollah.state", JSON.stringify(payload));
  }

  function load() {
    const raw = localStorage.getItem("wandollah.state");
    if (!raw) return false;
    try {
      const s = JSON.parse(raw);

      scores = s.scores || {};
      order = s.order || [1, 2, 3];
      isFourPlayers = !!s.isFourPlayers;
      historyLog = s.historyLog || [];
      scoreLog = s.scoreLog || [];
      orderLog = s.orderLog || [];

      // theme
      if (s.themeDark) document.documentElement.classList.add("dark");
      $("#darkToggle").textContent = document.documentElement.classList.contains("dark") ? "☀️" : "🌙";

      // Build UI before putting names back
      buildPlayers();

      if (s.players) {
        Object.entries(s.players).forEach(([i, name]) => {
          const input = $(`#name-${i}`);
          if (input) input.value = name;
          setPlayerNameLabel(i);
        });
      }

      $("#togglePlayerCount").textContent = isFourPlayers ? "4 Players Mode" : "3 Players Mode";
      setTurnOrderText();
      updateAllScores();
      rebuildHistoryUI();
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Expose functions your HTML calls ----------
  window.togglePlayerMode = togglePlayerMode;
  window.toggleDarkMode = toggleDarkMode;
  window.clearGameData = clearGameData;
  window.showHelp = showHelp;
  window.hideHelp = hideHelp;
  window.showHistory = showHistory;
  window.hideHistory = hideHistory;


  // --- Collapsible controls panel ---
  function setControlsOpen(open) {
    const panel = document.getElementById("controlsPanel");
    const toggle = document.getElementById("controlsToggle");
    if (!panel || !toggle) return;

    // Animate max-height to content height
    if (open) {
      panel.style.maxHeight = panel.scrollHeight + "px";
    } else {
      panel.style.maxHeight = "0px";
    }
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    localStorage.setItem("wandollah.controlsOpen", open ? "1" : "0");
  }

  function toggleControls() {
    const toggle = document.getElementById("controlsToggle");
    const expanded = toggle?.getAttribute("aria-expanded") === "true";
    setControlsOpen(!expanded);
  }

  function initControlsCollapsible() {
    const toggleBtn = document.getElementById("controlsToggle");
    const panel = document.getElementById("controlsPanel");
    if (!toggleBtn || !panel) return;

    // Click to toggle
    toggleBtn.addEventListener("click", toggleControls);

    // Restore last state
    const savedOpen = localStorage.getItem("wandollah.controlsOpen") === "1";
    // Set once to correct height; if open, recalc after layout changes
    setControlsOpen(savedOpen);

    // Recompute height on resize when open so wrapping rows don't clip
    const recompute = () => {
      if (toggleBtn.getAttribute("aria-expanded") === "true") {
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    };
    window.addEventListener("resize", recompute);
  }

  // ---------- Init ----------
  function bootstrap() {
    // Ensure default 3p if brand new
    if (!load()) {
      isFourPlayers = false;
      scores = { 1: 0, 2: 0, 3: 0 };
      order = [1, 2, 3];
      buildPlayers();
      setTurnOrderText();
      logState("Game Started");
      rebuildHistoryUI();
      updateAllScores();
    }

    // Rates — persist on change
    ["#winRate", "#foulRate", "#bcRate"].forEach((id) => {
      $(id).addEventListener("change", () => save());
      $(id).addEventListener("input", () => save());
    });

    // Keyboard: Z = undo
    window.addEventListener("keydown", (e) => {
      if ((e.key === "z" || e.key === "Z") && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        undoLast();
      }
    });


    // controls panel
    initControlsCollapsible();    
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
