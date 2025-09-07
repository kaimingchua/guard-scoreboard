(() => {
  "use strict";

  // ---------- State ----------
  let scores = {};
  let order = [1, 2, 3];
  let isFourPlayers = false;

  let historyLog = [];
  let scoreLog = [];
  let orderLog = [];

  const chartInstances = {};
  let actionStats = {
    win:   {1:0,2:0,3:0,4:0},
    foul:  {1:0,2:0,3:0,4:0},
    golden:{1:0,2:0,3:0,4:0},
    bc:    {1:0,2:0,3:0,4:0}
  };

  // ---------- Helpers ----------
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const getRate = (id) => parseInt($(id).value, 10) || 0;
  const WIN  = () => getRate("#winRate");
  const FOUL = () => getRate("#foulRate");
  const BC   = () => getRate("#bcRate");

  const axisColor = () => (document.documentElement.classList.contains("dark") ? "#fff" : "#000");
  //const currentPlayerIds = () => Object.keys(scores).map(k => Number(k));
  const currentPlayerIds = () => (isFourPlayers ? [1,2,3,4] : [1,2,3]).filter(pid => scores[pid] !== undefined);

  const playerLabels = () => currentPlayerIds().map(pid => getPlayerName(pid));
  const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

  const formatTime = (d) => {
    const t = new Date(d);
    let h = t.getHours();
    const m = String(t.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return `${h}:${m}${ampm}`;
  };

  // ---------- Core logic ----------
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

      el.classList.remove("opacity-70");
      void el.offsetWidth;
      el.classList.add("opacity-70");

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

  function updateOrderAfterWin(winner) {
    const idx = order.indexOf(winner);
    if (!isFourPlayers) {
      if (idx === 0) order = [order[0], order[2], order[1]];
      else if (idx === 1) order = [order[1], order[0], order[2]];
      else order = [order[2], order[1], order[0]];
    } else {
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
      const prev = order[(idx - 1 + order.length) % order.length];
      scores[prev] -= pts;
      msg = `${playerName} won ${getPlayerName(prev)}.`;
      actionStats.win[player]++;
      updateOrderAfterWin(player);

    } else if (action === "foul") {
      const pts = FOUL();
      scores[player] -= pts;
      const prev = order[(idx - 1 + order.length) % order.length];
      scores[prev] += pts;
      msg = `${playerName} fouled to ${getPlayerName(prev)}.`;
      actionStats.foul[player]++;

    } else if (action === "bc") {
      const pts = BC();
      const others = order.filter((p) => p !== player);
      let totalLoss = 0;
      for (const p of others) {
        scores[p] -= pts;
        totalLoss += pts;
      }
      scores[player] += totalLoss;
      msg = `${playerName} broke clear!`;
      actionStats.bc[player]++;

    } else if (action === "golden") {
      const pts = WIN();
      const others = order.filter((p) => p !== player);
      let totalLoss = 0;
      for (const p of others) {
        scores[p] -= pts;
        totalLoss += pts;
      }
      scores[player] += totalLoss;
      msg = `${playerName} golden break!`;
      actionStats.golden[player]++;
    }

    logState(msg);
    updateAllScores();
    addLogLine(historyLog[historyLog.length - 1]);
  }

  // ---------- UI ----------
  function playerCardHTML(i) {
    return `
      <div id="card-${i}" class="bg-white/80 dark:bg-gray-800/60 rounded-lg p-4 shadow-md transition-colors">
        <div class="flex flex-col items-center gap-3 text-center">
          <input id="name-${i}" maxlength="20"
            class="w-44 sm:w-56 px-3 py-1 rounded text-black text-base sm:text-lg text-center"
            value="P${i}" />
          <span id="name-label-${i}" class="hidden"></span>
          <div class="leading-none">
            <span id="score-${i}" class="score-text select-none block text-6xl sm:text-7xl md:text-8xl font-extrabold opacity-70">0</span>
            <div class="mt-1 text-xs opacity-70"></div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-md mt-2">
            <button data-action="win" class="px-3 py-2 rounded bg-green-500 text-white">WIN</button>
            <button data-action="foul" class="px-3 py-2 rounded bg-red-500 text-white">FOUL+</button>
            <button data-action="bc" data-special class="px-3 py-2 rounded bg-yellow-500 text-black">BC</button>
            <button data-action="golden" data-special class="px-3 py-2 rounded bg-indigo-600 text-white">GOLDEN</button>
          </div>
        </div>
      </div>`;
  }

  function wirePlayerCard(i) {
    const nameInput = $(`#name-${i}`);
    nameInput.addEventListener("input", () => {
      setPlayerNameLabel(i);
      setTurnOrderText();
      save();
    });

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

    // Decide number of players
    const count = isFourPlayers ? 4 : 3;

    // Build exactly that many
    for (let i = 1; i <= count; i++) {
      if (scores[i] === undefined) scores[i] = 0;
      wrap.insertAdjacentHTML("beforeend", playerCardHTML(i));
      wirePlayerCard(i);
      $(`#score-${i}`).textContent = String(scores[i]);
    }

    // Clean up extra keys (like lingering player 4 in 3-player mode)
    for (let i = count + 1; i <= 4; i++) {
      delete scores[i];
      const ghost = document.getElementById(`card-${i}`);
      if (ghost) ghost.remove();
    }

    setTurnOrderText();
    updateCardStyles();
    updateSpecialActionButtons();
  }

  // ---------- History ----------
  function addLogLine(entry) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="text-gray-500 text-xs">${formatTime(entry.time)}:</span> ${entry.text}`;
    $("#logList").appendChild(li);
  }

  function rebuildHistoryUI() {
    $("#logList").innerHTML = "";
    historyLog.forEach(addLogLine);
  }

  function undoLast() {
    if (historyLog.length <= 1) {
      alert("Nothing to undo.");
      return;
    }
    const undone = scoreLog.pop();
    orderLog.pop();
    historyLog.pop();
    scores = deepCopy(scoreLog[scoreLog.length - 1]);
    order = [...orderLog[orderLog.length - 1]];
    updateAllScores(undone);
    rebuildHistoryUI();
  }

  // ---------- Persistence ----------
  function save() {
    const payload = {
      scores, order, isFourPlayers,
      historyLog, scoreLog, orderLog,
      players: Object.fromEntries(
        (isFourPlayers ? [1,2,3,4] : [1,2,3]).map((i) => [i, getPlayerName(i)])
      ),
      themeDark: document.documentElement.classList.contains("dark") ? 1 : 0,
    };
    localStorage.setItem("wandollah.state", JSON.stringify(payload));
  }

  function restoreState() {
    const raw = localStorage.getItem("wandollah.state");
    if (!raw) return false;
    try {
      const s = JSON.parse(raw);
      scores = s.scores || {};
      order = s.order || [1,2,3];
      isFourPlayers = !!s.isFourPlayers;
      historyLog = s.historyLog || [];
      scoreLog = s.scoreLog || [];
      orderLog = s.orderLog || [];
      if (s.themeDark) document.documentElement.classList.add("dark");
      $("#darkToggle").textContent = document.documentElement.classList.contains("dark") ? "☀️" : "🌙";
      buildPlayers();
      if (s.players) {
        Object.entries(s.players).forEach(([i,name]) => {
          const input = $(`#name-${i}`); if (input) input.value = name;
          setPlayerNameLabel(i);
        });
      }
      $("#togglePlayerCount").textContent = isFourPlayers ? "4 Players Mode" : "3 Players Mode";
      setTurnOrderText(); updateAllScores(); rebuildHistoryUI();
      return true;
    } catch { return false; }
  }

  // ---------- Analytics ----------
  function ensureChart(canvasId, configBuilder) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (chartInstances[canvasId]) { chartInstances[canvasId].destroy(); delete chartInstances[canvasId]; }
    chartInstances[canvasId] = new Chart(ctx, configBuilder());
  }

  function lineChartConfig() {
    return {
      type: "line",
      data: {
        labels: scoreLog.map((_, i) => `Turn ${i}`),
        datasets: currentPlayerIds().map((pid, idx) => ({
          label: getPlayerName(pid),
          data: scoreLog.map(s => (s && s[pid] != null ? s[pid] : 0)),
          borderColor: ["#ef4444","#3b82f6","#22c55e","#f59e0b"][idx % 4],
          fill: false,
          tension: 0.2
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: axisColor() } } },
        scales: {
          y: {
            beginAtZero: false,
            afterDataLimits: (scale) => {
              const range = (scale.max - scale.min) || 1;
              const pad = range * 0.1;
              scale.max += pad;
              scale.min -= pad;
            },
            ticks: { color: axisColor() }
          },
          x: { ticks: { color: axisColor() } }
        }
      }
    };
  }

  function barChartConfig(title, dataObj, color) {
    return {
      type: "bar",
      data: {
        labels: playerLabels(),
        datasets: [{
          label: title,
          data: currentPlayerIds().map(pid => dataObj[pid] || 0),
          backgroundColor: color
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              precision: 0,
              callback: (value) => Number.isInteger(value) ? value : null,
              color: axisColor()
            }
          },
          x: { ticks: { color: axisColor() } }
        }
      }
    };
  }

  function renderChartFor(canvasId) {
    if (canvasId === "scoreChart") {
      ensureChart("scoreChart", lineChartConfig);
    } else if (canvasId === "foulChart") {
      ensureChart("foulChart", () => barChartConfig("Fouls", actionStats.foul, "#ef4444"));
    } else if (canvasId === "winChart") {
      ensureChart("winChart", () => barChartConfig("Wins", actionStats.win, "#22c55e"));
    } else if (canvasId === "goldenChart") {
      ensureChart("goldenChart", () => barChartConfig("Golden Breaks", actionStats.golden, "#6366f1"));
    } else if (canvasId === "bcChart") {
      ensureChart("bcChart", () => barChartConfig("Break Clears", actionStats.bc, "#facc15"));
    }
  }

  function switchAnalyticsTab(targetId) {
    const tabs = $$(".analytics-tab");
    const canvases = $$(".analytics-canvas");
    tabs.forEach(t => t.classList.remove("bg-gray-200","dark:bg-gray-700","font-bold"));
    const activeBtn = Array.from(tabs).find(t => t.dataset.target === targetId);
    if (activeBtn) activeBtn.classList.add("bg-gray-200","dark:bg-gray-700","font-bold");
    canvases.forEach(c => {
      if (c.id === targetId) {
        c.classList.remove("hidden");
      } else {
        c.classList.add("hidden");
        if (chartInstances[c.id]) { chartInstances[c.id].destroy(); delete chartInstances[c.id]; }
      }
    });
    renderChartFor(targetId);
  }

  function initAnalyticsTabs() {
    const tabs = $$(".analytics-tab");
    tabs.forEach(tab => {
      tab._boundClick && tab.removeEventListener("click", tab._boundClick);
      tab._boundClick = () => switchAnalyticsTab(tab.dataset.target);
      tab.addEventListener("click", tab._boundClick);
    });
  }

  function showAnalytics() {
    const popup = $("#analyticsPopup");
    popup.classList.remove("hidden");
    requestAnimationFrame(() => popup.classList.add("opacity-100"));
    initAnalyticsTabs();
    const first = $(".analytics-tab");
    const firstTarget = first ? first.dataset.target : "scoreChart";
    switchAnalyticsTab(firstTarget);
  }

  function hideAnalytics() {
    const popup = $("#analyticsPopup");
    popup.classList.add("hidden");
    popup.classList.remove("opacity-100");
    Object.keys(chartInstances).forEach((key) => {
      const ch = chartInstances[key];
      if (ch && typeof ch.destroy === "function") ch.destroy();
      delete chartInstances[key];
    });
  }

  // ---------- Controls Panel ----------
  function setControlsOpen(open) {
    const panel = document.getElementById("controlsPanel");
    const toggle = document.getElementById("controlsToggle");
    if (!panel || !toggle) return;
    panel.style.maxHeight = open ? (panel.scrollHeight + "px") : "0px";
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
    toggleBtn.addEventListener("click", toggleControls);
    const savedOpen = localStorage.getItem("wandollah.controlsOpen") === "1";
    setControlsOpen(savedOpen);
    window.addEventListener("resize", () => {
      if (toggleBtn.getAttribute("aria-expanded") === "true") {
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    });
  }

  // --------- Share to Facebook --------
  async function shareScoreboardToFacebook() {
    try {
      await document.fonts.ready;
      const node = document.getElementById("playerContainer");
      const bg = document.documentElement.classList.contains("dark") ? "#111827" : "#faf3e0";
      const canvas = await html2canvas(node, {
        backgroundColor: bg,
        scale: window.devicePixelRatio || 2,
        useCORS: true
      });
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];

      // Upload to ImgBB
      const apiKey = "41bca9e040d3b313b1c5534806590902";
      const fd = new FormData();
      fd.append("image", base64);

      const resp = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: "POST",
        body: fd
      });
      const json = await resp.json();
      if (!json.success) throw new Error("Upload failed");

      const imgUrl = json.data.url;

      // Build share page URL
      const sharePage = `https://kaimingchua.github.io/guard-scoreboard/share.html?img=${encodeURIComponent(imgUrl)}`;

      // Open Facebook share dialog
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(sharePage)}`,
        "_blank",
        "width=600,height=500"
      );
    } catch (err) {
      console.error("Share error:", err);
      alert("Failed to share scoreboard. Check console.");
    }
  }

  // ---------- Init ----------
  function bootstrap() {
    if (!restoreState()) {
      isFourPlayers = false;
      scores = { 1: 0, 2: 0, 3: 0 };
      order = [1, 2, 3];
      buildPlayers();
      setTurnOrderText();
      logState("Game Started");
      rebuildHistoryUI();
      updateAllScores();
    }

    ["#winRate", "#foulRate", "#bcRate"].forEach((id) => {
      $(id).addEventListener("change", () => save());
      $(id).addEventListener("input", () => save());
    });

    window.addEventListener("keydown", (e) => {
      if ((e.key === "z" || e.key === "Z") && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        undoLast();
      }
    });

    initControlsCollapsible();
  }

  // ---------- Expose ----------
  window.togglePlayerMode = function() {
    const futureCount = isFourPlayers ? 3 : 4;
    if (!confirm(`Switch to ${futureCount} players?`)) return;
    isFourPlayers = !isFourPlayers;
    order = isFourPlayers ? [1,2,3,4] : [1,2,3];
    $("#togglePlayerCount").textContent = isFourPlayers ? "4 Players Mode" : "3 Players Mode";
    logState(isFourPlayers ? "Switched to 4 players." : "Switched to 3 players.");
    buildPlayers(); updateAllScores(); rebuildHistoryUI();
  };

  window.toggleDarkMode = function() {
    const on = document.documentElement.classList.toggle("dark");
    localStorage.setItem("wandollah.dark", on ? "1" : "0");
    $("#darkToggle").textContent = on ? "☀️" : "🌙";
  };

  window.clearGameData  = function() {
    if (!confirm("Clear all scores and history?")) return;
    scores = {}; order = [1,2,3]; isFourPlayers = false;
    historyLog = []; scoreLog = []; orderLog = [];
    actionStats = { win:{1:0,2:0,3:0,4:0}, foul:{1:0,2:0,3:0,4:0}, golden:{1:0,2:0,3:0,4:0}, bc:{1:0,2:0,3:0,4:0} };
    $("#togglePlayerCount").textContent = "3 Players Mode";
    buildPlayers(); logState("Game Started"); rebuildHistoryUI(); updateAllScores();
  };

  window.fbAsyncInit = function() {
    FB.init({
      appId      : '1217812017056731',
      cookie     : true,
      xfbml      : true,
      version    : 'v19.0'
    });
  };
    
  window.showHelp    = () => { $("#helpPopup").classList.remove("hidden"); requestAnimationFrame(() => $("#helpPopup").classList.add("opacity-100")); };
  window.hideHelp    = () => { $("#helpPopup").classList.add("hidden"); $("#helpPopup").classList.remove("opacity-100"); };
  window.showHistory = () => { rebuildHistoryUI(); $("#historyPopup").classList.remove("hidden"); requestAnimationFrame(() => $("#historyPopup").classList.add("opacity-100")); };
  window.hideHistory = () => { $("#historyPopup").classList.add("hidden"); $("#historyPopup").classList.remove("opacity-100"); };
  window.shareScoreboardToFacebook = shareScoreboardToFacebook;
  window.showAnalytics = showAnalytics;
  window.hideAnalytics = hideAnalytics;

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
