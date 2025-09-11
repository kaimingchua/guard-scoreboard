(() => {
    "use strict";
  
    // ---------- State ----------
    let scores = { 1: 0, 2: 0 };
    let historyLog = [];
    let scoreLog = [];
    let orderLog = [];
    let actionStats = { foul: { 1: 0, 2: 0 } }; // fouls per player (analytics only, no score change)
  
    const live = { enabled: false, gameId: null, ref: null };
    const LIVE_STORAGE_KEY = "normal.liveGameId";
  
    // ---------- Helpers ----------
    const $ = (sel) => document.querySelector(sel);
  
    const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));
  
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
        // Optional small yellow flash to indicate event occurred
        const card = $(`#card-${player}`);
        if (card) {
          card.style.transition = "box-shadow 400ms ease";
          const prev = card.style.boxShadow;
          card.style.boxShadow = "0 0 0 3px rgba(234,179,8,0.6)"; // amber-400 ring-like glow
          setTimeout(() => (card.style.boxShadow = prev), 400);
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
      };
    }
  
    const debouncedSyncLive = (() => {
      let t;
      return function () {
        if (!live.enabled || !live.ref) return;
        clearTimeout(t);
        t = setTimeout(async () => {
          try {
            const { fns } = window.__live || {};
            if (!fns) return;
            await fns.updateDoc(live.ref, {
              ...buildLivePayload(),
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
        localStorage.removeItem(LIVE_STORAGE_KEY);
        $("#liveToggle").textContent = "Live score sharing: OFF";
        alert("Live sharing stopped.");
      } else {
        await startLiveGame();
      }
    };
  
    async function startLiveGame() {
      const { db, fns } = window.__live;
      const gamesCol = fns.collection(db, "normal-games");
      const initial = buildLivePayload();
      initial.createdAt = fns.serverTimestamp();
      initial.updatedAt = fns.serverTimestamp();
  
      const ref = await fns.addDoc(gamesCol, initial);
      live.ref = ref;
      live.gameId = ref.id;
      live.enabled = true;
      localStorage.setItem(LIVE_STORAGE_KEY, ref.id);
  
      $("#liveToggle").textContent = "Live score sharing: ON";
  
      const liveUrl = `normal-live-score.html`;
      alert(`Live sharing started!\nShare this link with viewers:\n${liveUrl}`);
  
      debouncedSyncLive();
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
  
      // Safety checks
      if (!card || !scoreEl) return;
  
      // Name / Team changes persist + live sync
      [nameInput, teamInput].forEach((input) => {
        if (!input) return;
        input.addEventListener("input", () => {
          save();
          onStateChanged();
        });
      });
  
      // Manual score edit on click (prompt)
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
  
      // Buttons (+ / − / FOUL)
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
          // Simple undo: restore previous scores snapshot if available
          if (historyLog.length <= 1) return;
          scoreLog.pop();
          orderLog.pop();
          const undone = historyLog.pop();
          scores = deepCopy(scoreLog[scoreLog.length - 1] || { 1: 0, 2: 0 });
          updateAllScores();
          rebuildHistoryUI();
        }
      });
    }
  
    document.addEventListener("DOMContentLoaded", bootstrap);
  })();
  