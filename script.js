(() => {
  "use strict";

  // =========================
  // Global State
  // =========================
  let scores = {};
  let order = [1, 2, 3];
  let isFourPlayers = false;

  let historyLog = [];
  let scoreLog = [];
  let orderLog = [];

  let actionStats = {
    win:   {1:0,2:0,3:0,4:0},
    foul:  {1:0,2:0,3:0,4:0},
    golden:{1:0,2:0,3:0,4:0},
    bc:    {1:0,2:0,3:0,4:0}
  };

  const chartInstances = {};

  // Live / Collaboration
  const live = { enabled: false, gameId: null, ref: null, unsub: null };
  const LIVE_STORAGE_KEY = "guard.liveGameId";

  // NEW: guard flags/hashes to prevent feedback loops & needless updates
  let suppressSync = false;              // when true, local writes are suppressed (during remote apply)
  live.lastAppliedHash = "";             // hash of last applied remote state
  live.lastWrittenHash = "";             // hash of last written local state

  // =========================
  // Helpers
  // =========================
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

  // NEW: stable stringify to ensure deterministic hashing (keys sorted)
  function stableStringify(value) {
    const seen = new WeakSet();
    const helper = (v) => {
      if (v && typeof v === "object") {
        if (seen.has(v)) return null;
        seen.add(v);
        if (Array.isArray(v)) {
          return v.map(helper);
        } else {
          const out = {};
          Object.keys(v).sort().forEach(k => {
            out[k] = helper(v[k]);
          });
          return out;
        }
      }
      return v;
    };
    return JSON.stringify(helper(value));
  }

  const getRate = (id) => parseInt($(id)?.value, 10) || 0;
  const WIN  = () => getRate("#winRate");
  const FOUL = () => getRate("#foulRate");
  const BC   = () => getRate("#bcRate");

  const axisColor = () => (document.documentElement.classList.contains("dark") ? "#fff" : "#000");
  const currentPlayerIds = () => Object.keys(scores).map(k => Number(k));
  const playerLabels = () => currentPlayerIds().map(pid => getPlayerName(pid));

  const formatTime = (d) => {
    const t = new Date(d);
    let h = t.getHours();
    const m = String(t.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return `${h}:${m}${ampm}`;
  };

  if (!localStorage.getItem("guard.clientId")) {
    localStorage.setItem("guard.clientId", (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()));
  }
  live.clientId = localStorage.getItem("guard.clientId");

  function initZoomFeature(containerSelector) {
    const slider = document.getElementById("zoomSlider");
    const container = document.querySelector(containerSelector);
  
    if (!slider || !container) return;
  
    // Load saved zoom
    const savedZoom = parseInt(localStorage.getItem("scoreboard.zoom") || "0", 10);
    slider.value = savedZoom;
  
    const applyZoom = (val) => {
      // Scale from 0.5x to 2x
      let scale = 1 + (val / 100);
      if (scale < 0.5) scale = 0.5;
      if (scale > 2) scale = 2;
  
      container.style.transform = `scale(${scale})`;
      container.style.transformOrigin = "top center";
    };
  
    applyZoom(savedZoom);
  
    slider.addEventListener("input", () => {
      const zoom = parseInt(slider.value, 10);
      applyZoom(zoom);
      localStorage.setItem("scoreboard.zoom", zoom);
    });
  }  

  function getPlayerName(i) {
    const el = $(`#name-${i}`);
    return el?.value?.trim() || `P${i}`;
  }

  function setPlayerNameLabel(i) {
    const label = $(`#name-label-${i}`);
    if (label) label.textContent = getPlayerName(i);
  }

  function setTurnOrderText() {
    const names = order.map((i) => getPlayerName(i));
    const el = $("#turnOrderDisplay");
    if (el) el.textContent = `Turn: ${names.join(" → ")}`;
  }

  // =========================
  // History / Persistence
  // =========================
  function logState(text) {
    historyLog.push({ text, time: new Date().toISOString() });
    scoreLog.push(deepCopy(scores));
    orderLog.push([...order]);
    save();
    onStateChanged();
  }

  function addLogLine(entry) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="text-gray-500 text-xs">${formatTime(entry.time)}:</span> ${entry.text}`;
    $("#logList")?.appendChild(li);
  }

  function rebuildHistoryUI() {
    const list = $("#logList");
    if (!list) return;
    list.innerHTML = "";
    historyLog.forEach(addLogLine);
  }

  function save() {
    const payload = {
      scores, order, isFourPlayers,
      historyLog, scoreLog, orderLog,
      players: Object.fromEntries(
        (isFourPlayers ? [1,2,3,4] : [1,2,3]).map((i) => [i, getPlayerName(i)])
      ),
      actionStats,
      rates: { win: WIN(), foul: FOUL(), bc: BC() },
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
      actionStats = s.actionStats || actionStats;
      if (s.rates) {
        const winEl  = $("#winRate");
        const foulEl = $("#foulRate");
        const bcEl   = $("#bcRate");
        if (winEl)  winEl.value  = s.rates.win;
        if (foulEl) foulEl.value = s.rates.foul;
        if (bcEl)   bcEl.value   = s.rates.bc;
      }
      buildPlayers();
      if (s.players) {
        Object.entries(s.players).forEach(([i,name]) => {
          const input = $(`#name-${i}`); if (input) input.value = name;
          setPlayerNameLabel(Number(i));
        });
      }
      setTurnOrderText();
      updateAllScores();
      rebuildHistoryUI();
      return true;
    } catch {
      return false;
    }
  }

  // =========================
  // UI build / wiring
  // =========================
  function updateCardStyles() {
    for (const i of Object.keys(scores)) {
      const card = document.getElementById(`card-${i}`);
      if (!card) continue;
      card.classList.remove("ring-2", "ring-red-600", "ring-green-600");
      if (scores[i] > 0) card.classList.add("ring-2", "ring-green-600");
      else if (scores[i] < 0) card.classList.add("ring-2", "ring-red-600");
    }
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
    // Only trigger sync if we're not applying a remote state
    if (!suppressSync) {
      onStateChanged();
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

  function playerCardHTML(i) {
    return `
      <div id="card-${i}" class="bg-white/80 dark:bg-gray-800/60 rounded-lg p-4 shadow-md transition-colors">
        <div class="flex flex-col items-center gap-3 text-center">
          <input id="name-${i}" maxlength="20"
            class="w-44 sm:w-56 px-3 py-1 rounded text-black text-base sm:text-lg text-center"
            value="${getPlayerName(i)}" />
          <span id="name-label-${i}" class="hidden"></span>
          <div class="leading-none">
            <span id="score-${i}"
              class="score-text select-none block text-6xl sm:text-7xl md:text-8xl font-extrabold opacity-70"
              style="line-height: 0.9;">${scores[i] ?? 0}</span>
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
    if (nameInput) {
      nameInput.addEventListener("input", () => {
        setPlayerNameLabel(i);
        setTurnOrderText();
        save();
        onStateChanged();
      });
    }

    const scoreEl = $(`#score-${i}`);
    if (scoreEl) {
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
    }

    const card = document.getElementById(`card-${i}`);
    if (card) {
      card.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          applyAction(i, btn.getAttribute("data-action"));
        });
      });
    }
  }

  function buildPlayers() {
    const wrap = $("#playerContainer");
    if (!wrap) return;
    wrap.innerHTML = "";

    const count = isFourPlayers ? 4 : 3;

    for (let i = 1; i <= count; i++) {
      if (scores[i] === undefined) scores[i] = 0;
      wrap.insertAdjacentHTML("beforeend", playerCardHTML(i));
      wirePlayerCard(i);
    }
    if (!isFourPlayers) delete scores[4];

    setTurnOrderText();
    updateCardStyles();
    updateSpecialActionButtons();
  }

  // =========================
  // Analytics (Charts)
  // =========================
  function ensureChart(canvasId, configBuilder) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
      delete chartInstances[canvasId];
    }
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

  // =========================
  // Firestore Sync (collab)
  // =========================
  function buildLivePayload() {
    const playerIds = Object.keys(scores).map(n => Number(n));
    const players = {};
    playerIds.forEach(pid => { players[pid] = getPlayerName(pid); });
  
    const safeOrderLog  = orderLog.map(arr => [...arr]);
    const safeScoreLog  = scoreLog.map(obj => ({ ...obj }));
    const safeHistoryLog = historyLog.map(h => ({ ...h }));
  
    return {
      title: "Guard Scoreboard",
      players,
      isFourPlayers,
      scores: { ...scores },
      actionStats: { ...actionStats },
      order: [...order],
      historyLog: safeHistoryLog,
      scoreLog: safeScoreLog,
      orderLog: safeOrderLog.map(arr => arr.join(",")),
      rates: {
        win: WIN(),
        foul: FOUL(),
        bc: BC(),
      },
      status: "live",
      lastWriteBy: live.clientId || "unknown",
    };
  }

  function applyRemoteState(data) {
    if (!data) return;
    // Ignore our own writes
    if (data.lastWriteBy && data.lastWriteBy === live.clientId) return;

    // Build normalized "meaningful" snapshot
    const meaningful = {
      scores: data.scores || {},
      order: data.order || [1,2,3],
      isFourPlayers: !!data.isFourPlayers,
      historyLog: data.historyLog || [],
      scoreLog: data.scoreLog || [],
      orderLog: (data.orderLog || []).map(item =>
        Array.isArray(item) ? item.join(",") : String(item)
      ),
      actionStats: data.actionStats || {},
      players: data.players || {},
      rates: data.rates || {},
    };

    const newHash = stableStringify(meaningful);
    if (live.lastAppliedHash === newHash) {
      // Nothing meaningful changed → skip UI update
      return;
    }
    live.lastAppliedHash = newHash;

    // Apply remote state with sync suppression to avoid loops
    suppressSync = true;
    try {
      scores        = data.scores      || {};
      order         = data.order       || [1, 2, 3];
      isFourPlayers = !!data.isFourPlayers;
      historyLog    = data.historyLog  || [];
      scoreLog      = data.scoreLog    || [];
      orderLog      = (data.orderLog || []).map(item =>
        typeof item === "string" ? item.split(",").map(Number) : item
      );
      actionStats   = data.actionStats || actionStats;

      buildPlayers();

      if (data.players) {
        Object.entries(data.players).forEach(([i, name]) => {
          const input = $(`#name-${i}`);
          if (input) input.value = name;
          setPlayerNameLabel(Number(i));
        });
      }

      if (data.rates) {
        if ($("#winRate"))  $("#winRate").value  = data.rates.win ?? $("#winRate").value;
        if ($("#foulRate")) $("#foulRate").value = data.rates.foul ?? $("#foulRate").value;
        if ($("#bcRate"))   $("#bcRate").value   = data.rates.bc ?? $("#bcRate").value;
      }

      setTurnOrderText();
      updateAllScores();
      rebuildHistoryUI();

      // If analytics popup is open, refresh charts
      const analyticsPopup = $("#analyticsPopup");
      if (analyticsPopup && !analyticsPopup.classList.contains("hidden")) {
        const active = $(".analytics-tab.bg-gray-200");
        const target = active ? active.dataset.target : "scoreChart";
        switchAnalyticsTab(target);
      }
    } finally {
      suppressSync = false;
    }
  }  

  const debouncedSyncLive = (() => {
    let t;
    return function () {
      if (!live.enabled || !live.ref) return;
      clearTimeout(t);
  
      t = setTimeout(async () => {
        try {
          const { fns } = window.__live;
          const newPayload = buildLivePayload();
  
          // Build a "minimal state" object (ignore updatedAt/lastWriteBy/status)
          const minimalPayload = {
            scores: newPayload.scores,
            order: newPayload.order,
            isFourPlayers: newPayload.isFourPlayers,
            historyLog: newPayload.historyLog,
            scoreLog: newPayload.scoreLog,
            orderLog: newPayload.orderLog,
            actionStats: newPayload.actionStats,
            players: newPayload.players,
            rates: newPayload.rates,
          };
  
          const newHash = stableStringify(minimalPayload);
  
          // Only write if this differs from the last write
          if (live.lastWrittenHash === newHash) {
            return; // nothing meaningful changed
          }
          live.lastWrittenHash = newHash;
  
          await fns.updateDoc(live.ref, {
            ...newPayload,
            status: "live",
            updatedAt: fns.serverTimestamp(),
            lastWriteBy: live.clientId,
          });
        } catch (e) {
          console.warn("live sync failed", e);
        }
      }, 500); // slightly longer debounce to reduce churn
    };
  })();  

  function onStateChanged() {
    // Only write if we have a ref and we want to collaborate (both creator and joiners write)
    debouncedSyncLive();
  }

  function attachLiveListener(ref) {
    // Clean up previous
    if (live.unsub) { try { live.unsub(); } catch {} live.unsub = null; }

    const { fns } = window.__live;
    live.unsub = fns.onSnapshot(ref, (doc) => {
      const data = doc.data();
      if (data) applyRemoteState(data);
    }, (err) => {
      console.warn("live onSnapshot error:", err);
    });
  }

  // =========================
  // Controls Panel
  // =========================
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

  // =========================
  // Public UI Actions (exposed)
  // =========================
  window.togglePlayerMode = function() {
    const futureCount = isFourPlayers ? 3 : 4;
    if (!confirm(`Switch to ${futureCount} players?`)) return;

    // Preserve names before we toggle
    const prevPlayers = {};
    (isFourPlayers ? [1,2,3,4] : [1,2,3]).forEach(i => prevPlayers[i] = getPlayerName(i));

    isFourPlayers = !isFourPlayers;
    order = isFourPlayers ? [1,2,3,4] : [1,2,3];

    buildPlayers();

    // Refill preserved names into new inputs
    const nowPlayers = isFourPlayers ? [1,2,3,4] : [1,2,3];
    nowPlayers.forEach(i => {
      const input = $(`#name-${i}`);
      if (input && prevPlayers[i]) input.value = prevPlayers[i];
      setPlayerNameLabel(i);
    });

    setTurnOrderText();
    logState(isFourPlayers ? "Switched to 4 players." : "Switched to 3 players.");
    rebuildHistoryUI();
    updateAllScores();
  };

  window.toggleDarkMode = function() {
    const on = document.documentElement.classList.toggle("dark");
    localStorage.setItem("wandollah.dark", on ? "1" : "0");
    const btn = $("#darkToggle");
    if (btn) btn.textContent = on ? "☀️" : "🌙";
  };

  window.clearGameData = function() {
    if (!confirm("Clear all scores and history?")) return;
    scores = {};
    order = [1,2,3];
    isFourPlayers = false;
    historyLog = [];
    scoreLog = [];
    orderLog = [];
    actionStats = { win:{1:0,2:0,3:0,4:0}, foul:{1:0,2:0,3:0,4:0}, golden:{1:0,2:0,3:0,4:0}, bc:{1:0,2:0,3:0,4:0} };
    buildPlayers();
    setTurnOrderText();
    logState("Game Started");
    rebuildHistoryUI();
    updateAllScores();
  };

  window.showHelp = () => { $("#helpPopup")?.classList.remove("hidden"); };
  window.hideHelp = () => { $("#helpPopup")?.classList.add("hidden"); };

  window.showHistory = () => { rebuildHistoryUI(); $("#historyPopup")?.classList.remove("hidden"); };
  window.hideHistory = () => { $("#historyPopup")?.classList.add("hidden"); };

  window.showAnalytics = () => {
    const popup = $("#analyticsPopup");
    if (!popup) return;
    popup.classList.remove("hidden");
    initAnalyticsTabs();
    const first = $(".analytics-tab");
    const firstTarget = first ? first.dataset.target : "scoreChart";
    switchAnalyticsTab(firstTarget);
  };
  window.hideAnalytics = () => {
    $("#analyticsPopup")?.classList.add("hidden");
    Object.keys(chartInstances).forEach((key) => {
      const ch = chartInstances[key];
      if (ch && typeof ch.destroy === "function") ch.destroy();
      delete chartInstances[key];
    });
  };

  // ---- Facebook Share (real) ----
  window.shareScoreboardToFacebook = async function() {
    try {
      await document.fonts.ready;
      const node = document.getElementById("playerContainer");
      const bg = document.documentElement.classList.contains("dark") ? "#111827" : "#faf3e0";
      const canvas = await html2canvas(node, { backgroundColor: bg, scale: 2 });
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];

      // Upload to ImgBB (simple anonymous host)
      const apiKey = "41bca9e040d3b313b1c5534806590902";
      const fd = new FormData();
      fd.append("image", base64);

      const resp = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, { method: "POST", body: fd });
      const json = await resp.json();
      if (!json.success) throw new Error("Upload failed");

      const imgUrl = json.data.url;
      const sharePage = `https://kaimingchua.github.io/guard-scoreboard/share.html?img=${encodeURIComponent(imgUrl)}`;

      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(sharePage)}`,
        "_blank",
        "width=600,height=500"
      );
    } catch (err) {
      console.error("Share error:", err);
      alert("Failed to share scoreboard. Check console.");
    }
  };

  // ---- Live sharing / collaboration ----
  window.toggleLiveSharing = async function toggleLiveSharing() {
    if (!window.__live?.db) {
      alert("Live sharing not available (Firebase not initialized).");
      return;
    }
    const { db, fns } = window.__live;

    if (live.enabled && live.ref) {
      // Stop (set status ended but keep doc for history)
      try {
        await fns.updateDoc(live.ref, { status: "ended", updatedAt: fns.serverTimestamp() });
      } catch {}
      live.enabled = false;
      live.ref = null;
      live.gameId = null;
      if (live.unsub) { try { live.unsub(); } catch {} live.unsub = null; }
      localStorage.removeItem(LIVE_STORAGE_KEY);
      const btn = $("#liveToggle");
      if (btn) {
        btn.textContent = "Live score sharing: OFF";
        btn.classList.remove("bg-red-600");
        btn.classList.add("bg-emerald-600");
      }
      alert("Live sharing stopped.");
    } else {
      // Start new OR continue existing from local
      const existingId = localStorage.getItem(LIVE_STORAGE_KEY);
      if (existingId) {
        const ref = fns.doc(db, "games", existingId);
        live.ref = ref;
        live.gameId = existingId;
        live.enabled = true;
    
        // Fetch existing to get joinCode
        const snap = await fns.getDoc(ref);
        let joinCode = snap.exists() ? snap.data().joinCode : null;
        if (!joinCode) {
          joinCode = Math.floor(1000 + Math.random() * 9000).toString(); // new 4-digit
        }
    
        await fns.setDoc(ref, { 
          ...buildLivePayload(), 
          joinCode,
          updatedAt: fns.serverTimestamp() 
        }, { merge: true });
    
        attachLiveListener(ref);
    
        alert(`Live sharing resumed.\nShare this Scoreboard ID: ${joinCode}`);
      } else {
        const gamesCol = fns.collection(db, "games");
        const initial = buildLivePayload();
    
        // Create new 4-digit join code
        const joinCode = Math.floor(1000 + Math.random() * 9000).toString();
        initial.joinCode = joinCode;
        initial.createdAt = fns.serverTimestamp();
        initial.updatedAt = fns.serverTimestamp();
    
        const ref = await fns.addDoc(gamesCol, initial);
        live.ref = ref;
        live.gameId = ref.id;
        live.enabled = true;
        localStorage.setItem(LIVE_STORAGE_KEY, ref.id);
    
        attachLiveListener(ref);
    
        alert(`Live sharing started.\nShare this Scoreboard ID: ${joinCode}`);
      }
    }
  };

  // =========================
  // Join Session (by last 6 chars or your UI code)
  // =========================
  function openJoinPopup() {
    $("#joinError")?.classList.add("hidden");
    $("#joinPopup")?.classList.remove("hidden");
  }
  function closeJoinPopup() {
    $("#joinPopup")?.classList.add("hidden");
  }

  async function joinSession() {
    const input = $("#joinInput");
    const code = (input?.value || "").trim();
    const errEl = $("#joinError");
    if (!code) return;
  
    if (!window.__live?.db) {
      if (errEl) { errEl.textContent = "Firebase not initialized."; errEl.classList.remove("hidden"); }
      return;
    }
  
    try {
      const { db, fns } = window.__live;
  
      // Query games by joinCode
      const q = fns.query(fns.collection(db, "games"), fns.where("joinCode", "==", code));
      const snap = await fns.getDocs(q);
  
      if (!snap.empty) {
        const doc = snap.docs[0];
        const found = doc.id;
  
        // Save, attach, and enable collaboration for this doc
        localStorage.setItem(LIVE_STORAGE_KEY, found);
        const ref = fns.doc(db, "games", found);
        live.ref = ref;
        live.gameId = found;
        live.enabled = true; // enable writes from this client too
        attachLiveListener(ref);
        closeJoinPopup();
  
        // UI feedback
        const btn = $("#liveToggle");
        if (btn) {
          btn.textContent = "Live score sharing: ON";
          btn.classList.remove("bg-emerald-600");
          btn.classList.add("bg-red-600");
        }
      } else {
        if (errEl) {
          errEl.textContent = "Match not found! Please check if your ID is correct.";
          errEl.classList.remove("hidden");
        }
      }
    } catch (e) {
      console.error("Join session error:", e);
      if (errEl) {
        errEl.textContent = "Error checking session. Try again.";
        errEl.classList.remove("hidden");
      }
    }
  }  

  // =========================
  // Bootstrap
  // =========================
  function bootstrap() {
    // Restore local dark theme toggle icon
    const darkPref = localStorage.getItem("wandollah.dark") === "1";
    if (darkPref) document.documentElement.classList.add("dark");
    const darkBtn = $("#darkToggle");
    if (darkBtn) darkBtn.textContent = document.documentElement.classList.contains("dark") ? "☀️" : "🌙";

    // Initial state
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

    // Rates save + live sync
    ["#winRate", "#foulRate", "#bcRate"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("change", () => { save(); onStateChanged(); });
      el.addEventListener("input",  () => { save(); onStateChanged(); });
    });

    // Undo (z)
    window.addEventListener("keydown", (e) => {
      if ((e.key === "z" || e.key === "Z") && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        // Simple undo: restore previous scores snapshot if available
        if (historyLog.length <= 1) return;
        const undone = scoreLog.pop();
        orderLog.pop();
        historyLog.pop();
        scores = deepCopy(scoreLog[scoreLog.length - 1] || {1:0,2:0,3:0});
        order = [...(orderLog[orderLog.length - 1] || [1,2,3])];
        updateAllScores(undone);
        rebuildHistoryUI();
      }
    });

    initControlsCollapsible();

    // Join Session UI
    const joinBtn = $("#joinSessionBtn");
    if (joinBtn) joinBtn.addEventListener("click", openJoinPopup);
    const joinInput = $("#joinInput");
    if (joinInput) joinInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") joinSession();
    });

    // If a session id already saved (joined or created earlier), attach listener and enable writes
    if (window.__live?.db) {
      const { db, fns } = window.__live;
      const savedId = localStorage.getItem(LIVE_STORAGE_KEY);
      if (savedId) {
        const ref = fns.doc(db, "games", savedId);
        live.ref = ref;
        live.gameId = savedId;
        live.enabled = true; // allow collaborative edits
        attachLiveListener(ref);
        const btn = $("#liveToggle");
        if (btn) {
          btn.textContent = "Live score sharing: ON";
          btn.classList.remove("bg-emerald-600");
          btn.classList.add("bg-red-600");
        }
      }
    }
  }
  initZoomFeature("#playerContainer");
  document.addEventListener("DOMContentLoaded", bootstrap);
  
  // Expose join popup helpers globally (used by HTML onclick)
  window.openJoinPopup = openJoinPopup;
  window.closeJoinPopup = closeJoinPopup;
  window.joinSession = joinSession;

})();