(() => {
  "use strict";

  // ---------- State ----------
  let scores = { 1: 0, 2: 0 };
  let historyLog = [];
  let scoreLog = [];
  let orderLog = [];
  let actionStats = { foul: { 1: 0, 2: 0 } }; // fouls per player (analytics only)

  const live = { enabled: false, gameId: null, ref: null, unsub: null, joinCode: null };
  const LIVE_STORAGE_KEY = "normal.liveGameId";
  const CODE_STORAGE_KEY = "normal.joinCode";

  if (!localStorage.getItem("normal.clientId")) {
    localStorage.setItem("normal.clientId", crypto.randomUUID());
  }
  live.clientId = localStorage.getItem("normal.clientId");

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

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
    return el?.value?.trim() || `Player ${i}`;
  }
  function getTeamName(i) {
    const el = $(`#team-${i}`);
    return el?.value?.trim() || `Team ${i}`;
  }
  function formatTime(d) {
    const t = new Date(d);
    let h = t.getHours();
    const m = String(t.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return `${h}:${m}${ampm}`;
  }

  function setCurrentCodeUI(code, hash) {
    const codeEl = $("#currentCode");
    const hashEl = $("#legacyHash");
    if (codeEl) codeEl.textContent = code || "----";
    if (hashEl) hashEl.textContent = hash || "------";
  }

  function stableStringify(obj) {
    const seen = new WeakSet();
    const s = (x) => {
      if (x && typeof x === "object") {
        if (seen.has(x)) return '"[Circular]"';
        seen.add(x);
        if (Array.isArray(x)) return "[" + x.map(s).join(",") + "]";
        const keys = Object.keys(x).sort();
        return "{" + keys.map(k => JSON.stringify(k) + ":" + s(x[k])).join(",") + "}";
      }
      return JSON.stringify(x);
    };
    return s(obj);
  }

  // Small flash helper for + / − visual feedback
  function flashScore(i, type /* "plus" | "minus" */) {
    const el = $(`#score-${i}`);
    if (!el) return;
    el.style.transition = "color 500ms ease";
    el.style.color = type === "plus" ? "#16a34a" : "#dc2626"; // green / red
    requestAnimationFrame(() => {
      setTimeout(() => {
        el.style.color = ""; // back to default
      }, 500);
    });
  }

  // ---------- History / Persistence ----------
  function logState(text) {
    historyLog.push({ text, time: new Date().toISOString() });
    scoreLog.push(deepCopy(scores));
    orderLog.push([1, 2]); // fixed two players
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
      scores,
      historyLog,
      scoreLog,
      orderLog,
      players: { 1: getPlayerName(1), 2: getPlayerName(2) },
      teams: { 1: getTeamName(1), 2: getTeamName(2) },
      actionStats,
    };
    localStorage.setItem("normal.state", JSON.stringify(payload));
  }

  function restoreState() {
    const raw = localStorage.getItem("normal.state");
    if (!raw) return false;
    try {
      const s = JSON.parse(raw);
      scores = s.scores || { 1: 0, 2: 0 };
      historyLog = s.historyLog || [];
      scoreLog = s.scoreLog || [];
      orderLog = s.orderLog || [];
      actionStats = s.actionStats || { foul: { 1: 0, 2: 0 } };

      // populate inputs
      if (s.players) {
        Object.entries(s.players).forEach(([i, name]) => {
          const input = $(`#name-${i}`);
          if (input) input.value = name;
        });
      }
      if (s.teams) {
        Object.entries(s.teams).forEach(([i, name]) => {
          const input = $(`#team-${i}`);
          if (input) input.value = name;
        });
      }

      // scores
      [1, 2].forEach((i) => {
        const el = $(`#score-${i}`);
        if (el) el.textContent = String(scores[i] ?? 0);
      });

      rebuildHistoryUI();
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Core logic ----------
  function updateAllScores() {
    [1, 2].forEach((i) => {
      const el = $(`#score-${i}`);
      if (el) el.textContent = String(scores[i]);
    });
    save();
    onStateChanged();
  }

  function applyAction(player, action) {
    if (action === "plus") {
      scores[player] += 1;
      logState(`${getPlayerName(player)} +1 point`);
      updateAllScores();
      addLogLine(historyLog[historyLog.length - 1]);
      flashScore(player, "plus");
    } else if (action === "minus") {
      scores[player] -= 1;
      logState(`${getPlayerName(player)} -1 point`);
      updateAllScores();
      addLogLine(historyLog[historyLog.length - 1]);
      flashScore(player, "minus");
    } else if (action === "foul") {
      // Analytics only (no score change)
      actionStats.foul[player] = (actionStats.foul[player] || 0) + 1;
      logState(`${getPlayerName(player)} committed a foul`);
      save();
      onStateChanged();
      addLogLine(historyLog[historyLog.length - 1]);

      // Floating +1 animation
      const btn = document.querySelector(`#card-${player} [data-action='foul']`);
      if (btn) {
        const float = document.createElement("div");
        float.textContent = "+1";
        float.className = "foul-float";
        float.style.color = "#ca8a04";
        float.style.left = "50%";
        float.style.top = "0";
        float.style.transform = "translateX(-50%)";
        float.style.position = "absolute";

        btn.style.position = "relative";
        btn.appendChild(float);
        setTimeout(() => float.remove(), 1000);
      }
    }
  }

  // ---------- Live sharing to Firestore ----------
  function buildLivePayload() {
    return {
      title: "Normal Scoreboard",
      players: { 1: getPlayerName(1), 2: getPlayerName(2) },
      teams: { 1: getTeamName(1), 2: getTeamName(2) },
      scores,
      actionStats,
      status: "live",
      joinCode: live.joinCode || null,
      lastWriteBy: live.clientId || "unknown"
    };
  }

  function minimalStateForHash(payload) {
    return {
      players: payload.players,
      teams: payload.teams,
      scores: payload.scores,
      actionStats: payload.actionStats,
      status: payload.status,
      joinCode: payload.joinCode
    };
  }

  // Prevent loops / spam
  let suppressSyncUntil = 0;

  const debouncedSyncLive = (() => {
    let t;
    return function () {
      if (!live.enabled || !live.ref) return;
      if (Date.now() < suppressSyncUntil) return; // ignore during suppression window
      clearTimeout(t);
      t = setTimeout(async () => {
        try {
          const { fns } = window.__live || {};
          if (!fns) return;
          const payload = buildLivePayload();
          const newHash = stableStringify(minimalStateForHash(payload));
          if (live.lastWrittenHash === newHash) return;
          live.lastWrittenHash = newHash;

          await fns.updateDoc(live.ref, {
            ...payload,
            updatedAt: fns.serverTimestamp(),
          });
        } catch (e) {
          console.warn("live sync failed", e);
        }
      }, 200);
    };
  })();

  function onStateChanged() {
    debouncedSyncLive();
  }

  function applyRemoteState(data) {
    if (!data) return;
    if (data.lastWriteBy && data.lastWriteBy === live.clientId) return;

    const meaningful = minimalStateForHash(data);
    const incomingHash = stableStringify(meaningful);
    if (live.lastAppliedHash === incomingHash) return;

    live.lastAppliedHash = incomingHash;

    // Apply state
    scores = data.scores || { 1: 0, 2: 0 };
    actionStats = data.actionStats || { foul: { 1: 0, 2: 0 } };

    // Update names/teams
    if (data.players) {
      Object.entries(data.players).forEach(([i, name]) => {
        const input = $(`#name-${i}`);
        if (input) input.value = name;
      });
    }
    if (data.teams) {
      Object.entries(data.teams).forEach(([i, name]) => {
        const input = $(`#team-${i}`);
        if (input) input.value = name;
      });
    }

    // Update UI scores
    [1, 2].forEach((i) => {
      const el = $(`#score-${i}`);
      if (el) el.textContent = String(scores[i] ?? 0);
    });

    // Show code/hash
    live.joinCode = data.joinCode || live.joinCode || null;
    setCurrentCodeUI(live.joinCode || "----", live.gameId ? `#${live.gameId.slice(-6)}` : "------");

    // Suppress our own immediate sync for 700ms to avoid flicker/loop
    suppressSyncUntil = Date.now() + 700;
  }

  function attachLiveListener(ref) {
    // Clean previous
    if (live.unsub) {
      try { live.unsub(); } catch {}
      live.unsub = null;
    }

    const { fns } = window.__live || {};
    if (!fns) return;

    live.unsub = fns.onSnapshot(ref, (doc) => {
      const data = doc.data();
      if (data) applyRemoteState(data);
    }, (err) => {
      console.warn("live onSnapshot error:", err);
    });
  }

  async function generateUnique4DigitCode(colName) {
    const { db, fns } = window.__live;
    let attempts = 0;
    while (attempts < 15) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const q = fns.query(fns.collection(db, colName), fns.where("joinCode", "==", code));
      const snap = await fns.getDocs(q);
      if (snap.empty) return code;
      attempts++;
    }
    throw new Error("Unable to allocate a unique 4-digit code.");
  }

  window.toggleLiveSharing = async function toggleLiveSharing() {
    if (!window.__live?.db) {
      alert("Live sharing not available (Firebase not initialized).");
      return;
    }
    if (live.enabled) {
      // stop
      try {
        if (live.ref) {
          await window.__live.fns.updateDoc(live.ref, {
            status: "ended",
            updatedAt: window.__live.fns.serverTimestamp()
          });
        }
      } catch {}
      live.enabled = false;
      live.ref = null;
      live.gameId = null;
      live.joinCode = null;
      localStorage.removeItem(LIVE_STORAGE_KEY);
      localStorage.removeItem(CODE_STORAGE_KEY);
      $("#liveToggle").textContent = "Live score sharing: OFF";
      setCurrentCodeUI("----", "------");
      alert("Live sharing stopped.");
    } else {
      await startLiveGame();
    }
  };

  async function startLiveGame() {
    const { db, fns } = window.__live;
    const gamesCol = fns.collection(db, "normal-games");

    // Create a new unique 4-digit joinCode
    const code = await generateUnique4DigitCode("normal-games");
    live.joinCode = code;

    const initial = buildLivePayload();
    initial.createdAt = fns.serverTimestamp();
    initial.updatedAt = fns.serverTimestamp();

    const ref = await fns.addDoc(gamesCol, initial);
    live.ref = ref;
    live.gameId = ref.id;
    live.enabled = true;

    localStorage.setItem(LIVE_STORAGE_KEY, ref.id);
    localStorage.setItem(CODE_STORAGE_KEY, code);

    $("#liveToggle").textContent = "Live score sharing: ON";
    setCurrentCodeUI(code, `#${ref.id.slice(-6)}`);

    attachLiveListener(ref);

    const liveUrl = `normal-live-score.html`;
    alert(`Live sharing started!\nScoreboard ID: ${code}\nShare this link with viewers:\n${liveUrl}`);

    debouncedSyncLive();
  }

  // ---------- Join by 4-digit Scoreboard ID ----------
  async function joinByCode() {
    const input = $("#joinInput");
    const errEl = $("#joinError");
    if (!input) return;
    const code = (input.value || "").trim();
    if (!code) return;

    if (!window.__live?.db) {
      errEl.textContent = "Firebase not initialized.";
      errEl.classList.remove("hidden");
      return;
    }

    try {
      const { db, fns } = window.__live;
      const q = fns.query(fns.collection(db, "normal-games"), fns.where("joinCode", "==", code));
      const snap = await fns.getDocs(q);

      if (snap.empty) {
        errEl.textContent = "Match not found! Please check if your ID is correct.";
        errEl.classList.remove("hidden");
        return;
      }

      errEl.classList.add("hidden");
      const doc = snap.docs[0];
      const ref = fns.doc(db, "normal-games", doc.id);

      // attach and enable writing
      live.ref = ref;
      live.gameId = doc.id;
      live.joinCode = code;
      live.enabled = true;

      localStorage.setItem(LIVE_STORAGE_KEY, doc.id);
      localStorage.setItem(CODE_STORAGE_KEY, code);

      $("#liveToggle").textContent = "Live score sharing: ON";
      setCurrentCodeUI(code, `#${doc.id.slice(-6)}`);

      attachLiveListener(ref);
      // first sync with remote (write our minimal changes after snapshot if needed)
      debouncedSyncLive();
    } catch (e) {
      console.error("Join error:", e);
      errEl.textContent = "Error checking session. Try again.";
      errEl.classList.remove("hidden");
    }
  }

  // ---------- Controls Panel ----------
  function setControlsOpen(open) {
    const panel = $("#controlsPanel");
    const toggle = $("#controlsToggle");
    if (!panel || !toggle) return;

    panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    localStorage.setItem("normal.controlsOpen", open ? "1" : "0");
  }

  function toggleControls() {
    const toggle = $("#controlsToggle");
    const expanded = toggle?.getAttribute("aria-expanded") === "true";
    setControlsOpen(!expanded);
  }

  function initControlsCollapsible() {
    const toggleBtn = $("#controlsToggle");
    const panel = $("#controlsPanel");
    if (!toggleBtn || !panel) return;

    toggleBtn.addEventListener("click", toggleControls);

    const savedOpen = localStorage.getItem("normal.controlsOpen") === "1";
    setControlsOpen(savedOpen);

    // Resize recompute
    window.addEventListener("resize", () => {
      if (toggleBtn.getAttribute("aria-expanded") === "true") {
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    });
  }

  // ---------- Public UI actions ----------
  window.clearGame = function clearGame() {
    if (!confirm("Clear all scores and history?")) return;
    scores = { 1: 0, 2: 0 };
    historyLog = [];
    scoreLog = [];
    orderLog = [];
    actionStats = { foul: { 1: 0, 2: 0 } };

    [1, 2].forEach((i) => {
      const el = $(`#score-${i}`);
      if (el) el.textContent = "0";
    });

    save();
    rebuildHistoryUI();
    onStateChanged();
  };

  window.showHistory = function showHistory() {
    rebuildHistoryUI();
    const popup = $("#historyPopup");
    if (!popup) return;
    popup.classList.remove("hidden");
    requestAnimationFrame(() => popup.classList.add("opacity-100"));
  };

  window.hideHistory = function hideHistory() {
    const popup = $("#historyPopup");
    if (!popup) return;
    popup.classList.add("hidden");
    popup.classList.remove("opacity-100");
  };

  // ---------- Wiring ----------
  function wirePlayerCard(i) {
    const nameInput = $(`#name-${i}`);
    const teamInput = $(`#team-${i}`);
    const scoreEl = $(`#score-${i}`);
    const card = $(`#card-${i}`);

    if (!card || !scoreEl) return;

    [nameInput, teamInput].forEach((input) => {
      if (!input) return;
      input.addEventListener("input", () => {
        save();
        onStateChanged();
      });
    });

    scoreEl.style.cursor = "pointer";
    scoreEl.addEventListener("click", () => {
      const curr = scores[i] ?? 0;
      const val = prompt(`Enter new score for ${getPlayerName(i)}:`, curr);
      if (val === null) return;
      if (!/^-?\d+$/.test(val.trim())) {
        alert("Please enter a valid integer.");
        return;
      }
      scores[i] = parseInt(val, 10);
      logState(`${getPlayerName(i)}'s score manually set to ${scores[i]}.`);
      updateAllScores();
      addLogLine(historyLog[historyLog.length - 1]);
    });

    card.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        applyAction(i, action);
      });
    });
  }

  function wirePlayers() {
    [1, 2].forEach((i) => wirePlayerCard(i));
  }

  // ---------- Init ----------
  function bootstrap() {
    // Wire controls panel and players
    initControlsCollapsible();
    wirePlayers();

    // Restore or init
    if (!restoreState()) {
      scores = { 1: 0, 2: 0 };
      [1, 2].forEach((i) => {
        const el = $(`#score-${i}`);
        if (el) el.textContent = "0";
      });
      logState("Game Started");
      rebuildHistoryUI();
      save();
    }

    // Keyboard: Z = undo (optional)
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "z" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (historyLog.length <= 1) return;
        scoreLog.pop();
        orderLog.pop();
        historyLog.pop();
        scores = deepCopy(scoreLog[scoreLog.length - 1] || { 1: 0, 2: 0 });
        updateAllScores();
        rebuildHistoryUI();
      }
    });

    // Join by code
    $("#joinBtn")?.addEventListener("click", joinByCode);
    $("#joinInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") joinByCode();
    });

    // Auto-attach if we have a saved game id
    if (window.__live?.db) {
      const { db, fns } = window.__live;
      const savedId = localStorage.getItem(LIVE_STORAGE_KEY);
      const savedCode = localStorage.getItem(CODE_STORAGE_KEY);
      if (savedId) {
        const ref = fns.doc(db, "normal-games", savedId);
        live.ref = ref;
        live.gameId = savedId;
        live.joinCode = savedCode || null;
        live.enabled = true;
        $("#liveToggle").textContent = "Live score sharing: ON";
        setCurrentCodeUI(savedCode || "----", `#${savedId.slice(-6)}`);
        attachLiveListener(ref);
      } else {
        setCurrentCodeUI("----", "------");
      }
    }
  }
  initZoomFeature("#playerContainer");
  document.addEventListener("DOMContentLoaded", bootstrap);
})();
