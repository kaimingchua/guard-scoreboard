window.addEventListener("DOMContentLoaded", () => {
  (function () {
    "use strict";

    // Safety checks
    if (!window.__live || !window.__live.db || !window.__live.fns) {
      console.error(
        "[normal-script] Missing window.__live db/fns. Make sure the module script that initializes Firebase ran before this file."
      );
    }

    const db = window.__live?.db;
    const {
      collection,
      doc,
      setDoc,
      addDoc,
      updateDoc,
      serverTimestamp,
      onSnapshot,
      query,
      where,
      getDocs,
      getDoc,
    } = window.__live?.fns || {};

    // DOM refs
    const els = {
      controlsToggle: document.getElementById("controlsToggle"),
      controlsPanel: document.getElementById("controlsPanel"),

      // join section
      joinInput: document.getElementById("joinInput"),
      joinBtn: document.getElementById("joinBtn"),
      joinError: document.getElementById("joinError"),

      currentCode: document.getElementById("currentCode"),
      legacyHash: document.getElementById("legacyHash"),

      // players and scores
      name1: document.getElementById("name-1"),
      team1: document.getElementById("team-1"),
      score1: document.getElementById("score-1"),
      card1: document.getElementById("card-1"),

      name2: document.getElementById("name-2"),
      team2: document.getElementById("team-2"),
      score2: document.getElementById("score-2"),
      card2: document.getElementById("card-2"),

      // buttons (inside each card via data-action)
      playerContainer: document.getElementById("playerContainer"),

      // header controls
      liveToggle: document.getElementById("liveToggle"),
      zoomSlider: document.getElementById("zoomSlider"),

      // history popup
      historyPopup: document.getElementById("historyPopup"),
      logList: document.getElementById("logList"),
    };

    const LIVE_STORAGE_KEY = "normal.liveGameId";
    const STATE_STORAGE_KEY = "normal.localState";

    // State
    const state = {
      sbRef: null,
      unsub: null,
      joined: false,
      live: false,
      lastSnapshot: null,

      players: { 1: "Player 1", 2: "Player 2" },
      teams: { 1: "Team 1", 2: "Team 2" },
      scores: { 1: 0, 2: 0 },

      actionStats: { foul: { 1: 0, 2: 0 } },

      history: [],
      zoom: 0,
    };

    // Utils
    function clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }
    function setText(el, text) {
      if (el) el.textContent = text;
    }
    function setValue(el, val) {
      if (el) el.value = val;
    }
    function appendHistory(text) {
      const entry = `[${new Date().toLocaleTimeString()}] ${text}`;
      state.history.push(entry);
      if (state.history.length > 200) state.history.shift();
      if (els.logList) {
        const li = document.createElement("li");
        li.textContent = entry;
        els.logList.appendChild(li);
      }
    }
    function applyZoom(percentage) {
      state.zoom = clamp(parseInt(percentage || 0, 10), -100, 100);
      const scale = 1 + state.zoom / 200;
      if (els.playerContainer) {
        els.playerContainer.style.transformOrigin = "top center";
        els.playerContainer.style.transform = `scale(${scale})`;
      }
    }
    function generateScoreboardCode() {
      const n = Math.floor(Math.random() * 10000);
      return String(n).padStart(4, "0");
    }
    function isFirestoreId(str) {
      return !!str && str.length > 6;
    }
    function isFourDigitCode(str) {
      return /^\d{4}$/.test(str);
    }
    function debounce(fn, ms = 300) {
      let t = null;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
      };
    }

    // Local persistence
    function saveLocalState() {
      const payload = {
        players: state.players,
        teams: state.teams,
        scores: state.scores,
        actionStats: state.actionStats,
        currentCode: els.currentCode?.textContent || "----",
        legacyHash: els.legacyHash?.textContent || "------",
      };
      localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(payload));
    }
    function restoreLocalState() {
      try {
        const saved = localStorage.getItem(STATE_STORAGE_KEY);
        if (!saved) return;
        const data = JSON.parse(saved);

        state.players = data.players || state.players;
        state.teams = data.teams || state.teams;
        state.scores = data.scores || state.scores;
        state.actionStats = data.actionStats || state.actionStats;

        setValue(els.name1, state.players[1]);
        setValue(els.name2, state.players[2]);
        setValue(els.team1, state.teams[1]);
        setValue(els.team2, state.teams[2]);
        setText(els.score1, state.scores[1]);
        setText(els.score2, state.scores[2]);
        setText(els.currentCode, data.currentCode || "----");
        setText(els.legacyHash, data.legacyHash || "------");

        appendHistory("Restored scoreboard from local storage.");
      } catch (err) {
        console.warn("[normal-script] restoreLocalState failed", err);
      }
    }

    // Firestore Helpers
    async function createNewScoreboardDoc({ p1, p2, t1, t2 }) {
      const code = generateScoreboardCode();
      const payload = {
        title: "Normal Scoreboard",
        players: { 1: p1, 2: p2 },
        teams: { 1: t1, 2: t2 },
        scores: { 1: 0, 2: 0 },
        actionStats: { foul: { 1: 0, 2: 0 } },
        status: "live",
        scoreboardCode: code,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "normal-match"), payload);
      appendHistory(`Created scoreboard (ID ${code}, hash ...${ref.id.slice(-6)})`);
      return { ref, code };
    }

    async function joinByCodeOrId(codeOrId) {
      if (!codeOrId) throw new Error("Empty code");

      if (isFirestoreId(codeOrId)) {
        const ref = doc(db, "normal-match", codeOrId);
        return ref;
      }
      if (isFourDigitCode(codeOrId)) {
        // First try normal-match
        let q = query(collection(db, "normal-match"), where("scoreboardCode", "==", codeOrId));
        let snap = await getDocs(q);
        if (!snap.empty) return snap.docs[0].ref;

        // Then try tournament-match
        q = query(collection(db, "tournament-match"), where("scoreboardCode", "==", codeOrId));
        snap = await getDocs(q);
        if (!snap.empty) return snap.docs[0].ref;

        throw new Error("No scoreboard found with code " + codeOrId);
      }

      throw new Error("Invalid code format");
    }

    function stopListening() {
      if (state.unsub) {
        state.unsub();
        state.unsub = null;
      }
    }

    function startListening(ref) {
      stopListening();
      state.sbRef = ref;
      state.joined = true;

      state.unsub = onSnapshot(
        ref,
        async (snap) => {
          if (!snap.exists()) return;
          state.lastSnapshot = snap.data();
          const d = state.lastSnapshot;

          if (d.players) {
            state.players[1] = d.players[1];
            state.players[2] = d.players[2];
            setValue(els.name1, state.players[1]);
            setValue(els.name2, state.players[2]);
          }
          if (d.teams) {
            state.teams[1] = d.teams[1];
            state.teams[2] = d.teams[2];
            setValue(els.team1, state.teams[1]);
            setValue(els.team2, state.teams[2]);
          }
          if (d.scores) {
            state.scores[1] = d.scores[1];
            state.scores[2] = d.scores[2];
            setText(els.score1, state.scores[1]);
            setText(els.score2, state.scores[2]);
          }
          if (d.actionStats && d.actionStats.foul) {
            state.actionStats.foul[1] = d.actionStats.foul[1] ?? state.actionStats.foul[1];
            state.actionStats.foul[2] = d.actionStats.foul[2] ?? state.actionStats.foul[2];
          }

          if (typeof d.status === "string") {
            state.live = d.status === "live";
            reflectLiveToggle();
          }
          setText(els.currentCode, d.scoreboardCode || "----");
          setText(els.legacyHash, state.sbRef.id.slice(-6));

          if (d.tournamentId) {
            try {
              const tRef = doc(db, "tournaments", d.tournamentId);
              const tSnap = await getDoc(tRef);
              if (tSnap.exists()) {
                const t = tSnap.data();
                const detailsEl = document.getElementById("tournamentDetails");
                if (detailsEl) {
                  const shortId = d.tournamentId.slice(-4);
                  const raceToMap = t.raceTo || {};
                  const raceVal = raceToMap[d.roundKey] || "--";
                  detailsEl.innerHTML = `
                    <div class="font-bold">${t.name || "Tournament"}</div>
                    <div class="text-sm text-stone-600">Race to ${raceVal}</div>
                    <div class="text-xs text-stone-500">ID: ${shortId}</div>
                  `;
                  detailsEl.classList.remove("hidden");
                }
              }
            } catch (err) {
              console.warn("[normal-script] failed to load tournament details:", err);
            }
          }

          saveLocalState();
        },
        (err) => {
          console.error("[normal-script] Snapshot error", err);
          appendHistory("Snapshot error: " + err.message);
        }
      );
    }

    async function pushUpdate(partial) {
      if (!state.sbRef) return;
      const data = { ...partial, updatedAt: serverTimestamp() };
      await updateDoc(state.sbRef, data);
      saveLocalState();
    }

    const pushPlayersDebounced = debounce(() => {
      pushUpdate({ players: { 1: state.players[1], 2: state.players[2] } });
    }, 300);
    const pushTeamsDebounced = debounce(() => {
      pushUpdate({ teams: { 1: state.teams[1], 2: state.teams[2] } });
    }, 300);
    const pushScoresDebounced = debounce(async () => {
      if (!state.sbRef) return;

      await updateDoc(state.sbRef, {
        scores: { 1: state.scores[1], 2: state.scores[2] },
        updatedAt: serverTimestamp(),
      });

      try {
        const sbSnap = await getDoc(state.sbRef);
        const d = sbSnap.data();
        if (d?.tournamentId && d?.roundKey && typeof d?.matchIndex === "number") {
          const tRef = doc(db, "tournaments", d.tournamentId);
          const tSnap = await getDoc(tRef);
          if (!tSnap.exists()) return;

          const tData = tSnap.data();
          const rounds = tData.rounds || {};
          const round = rounds[d.roundKey];
          if (!round) return;

          const idx = d.matchIndex;
          const existing = round[idx] || {};
          const updatedMatch = {
            ...existing,
            p1: existing.p1 || d.players?.[1] || state.players[1],
            p2: existing.p2 || d.players?.[2] || state.players[2],
            score1: state.scores[1],
            score2: state.scores[2],
            // status not overwritten
          };

          const newRound = round.slice();
          newRound[idx] = updatedMatch;

          await updateDoc(tRef, {
            [`rounds.${d.roundKey}`]: newRound,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn("[normal-script] tournament round update failed:", err);
      }
    }, 120);

    // UI wiring
    if (els.controlsToggle && els.controlsPanel) {
      els.controlsToggle.addEventListener("click", () => {
        const expanded = els.controlsToggle.getAttribute("aria-expanded") === "true";
        const next = !expanded;
        els.controlsToggle.setAttribute("aria-expanded", String(next));
        els.controlsPanel.style.maxHeight = next ? "500px" : "0";
      });
    }

    if (els.zoomSlider) {
      els.zoomSlider.addEventListener("input", (e) => applyZoom(e.target.value));
      applyZoom(els.zoomSlider.value || 0);
    }

    if (els.name1)
      els.name1.addEventListener("input", () => {
        state.players[1] = els.name1.value.trim() || "Player 1";
        pushPlayersDebounced();
        saveLocalState();
      });
    if (els.name2)
      els.name2.addEventListener("input", () => {
        state.players[2] = els.name2.value.trim() || "Player 2";
        pushPlayersDebounced();
        saveLocalState();
      });
    if (els.team1)
      els.team1.addEventListener("input", () => {
        state.teams[1] = els.team1.value.trim() || "Team 1";
        pushTeamsDebounced();
        saveLocalState();
      });
    if (els.team2)
      els.team2.addEventListener("input", () => {
        state.teams[2] = els.team2.value.trim() || "Team 2";
        pushTeamsDebounced();
        saveLocalState();
      });

    if (els.playerContainer) {
      els.playerContainer.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
    
        // Find the nearest player card by id
        const card = btn.closest('[id^="card-"]');
        const who = card ? Number(card.id.split("-")[1]) : 1;
    
        const action = btn.getAttribute("data-action");
        if (action === "plus") changeScore(who, +1);
        else if (action === "minus") changeScore(who, -1);
        else if (action === "foul") onFoul(who, btn);
      });
    }

    if (els.joinBtn && els.joinInput && els.joinError) {
      els.joinBtn.addEventListener("click", async () => {
        const input = els.joinInput.value.trim();
        els.joinError.classList.add("hidden");
        if (!input) {
          els.joinError.textContent = "Please enter a code.";
          els.joinError.classList.remove("hidden");
          return;
        }
        try {
          const ref = await joinByCodeOrId(input);
          startListening(ref);
          setText(
            els.currentCode,
            isFourDigitCode(input)
              ? input
              : state?.lastSnapshot?.scoreboardCode || "----"
          );
          setText(els.legacyHash, ref.id.slice(-6));
          appendHistory(
            `Joined scoreboard (${isFourDigitCode(input) ? "code" : "id"}: ${input})`
          );
          saveLocalState();
        } catch (err) {
          console.error(err);
          els.joinError.textContent = "Match not found.";
          els.joinError.classList.remove("hidden");
          appendHistory("Join failed: " + err.message);
        }
      });
    }

    function reflectLiveToggle() {
      if (!els.liveToggle) return;
      if (state.live) {
        els.liveToggle.textContent = "Live score sharing: ON";
        els.liveToggle.classList.remove("bg-emerald-600");
        els.liveToggle.classList.add("bg-red-600");
      } else {
        els.liveToggle.textContent = "Live score sharing: OFF";
        els.liveToggle.classList.add("bg-emerald-600");
        els.liveToggle.classList.remove("bg-red-600");
      }
    }

    async function toggleLiveSharing() {
      try {
        if (!state.live) {
          if (!state.joined) {
            const { ref, code } = await createNewScoreboardDoc({
              p1: state.players[1],
              p2: state.players[2],
              t1: state.teams[1],
              t2: state.teams[2],
            });
            startListening(ref);
            setText(els.currentCode, code);
            setText(els.legacyHash, ref.id.slice(-6));
            localStorage.setItem(LIVE_STORAGE_KEY, ref.id);
            showLivePopup(code, true);
          } else {
            await pushUpdate({ status: "live" });
          }
          state.live = true;
          reflectLiveToggle();
          appendHistory("Live sharing turned ON");
        } else {
          if (state.joined) await pushUpdate({ status: "ended" });
          state.live = false;
          reflectLiveToggle();
          appendHistory("Live sharing turned OFF");
          localStorage.removeItem(LIVE_STORAGE_KEY);
          showLivePopup(null, false);
        }
        saveLocalState();
      } catch (err) {
        console.error("[normal-script] toggleLiveSharing error", err);
        appendHistory("toggleLiveSharing error: " + err.message);
      }
    }

    function changeScore(who, delta) {
      const before = state.scores[who];
      let after = before + delta;
      if (after < 0) after = 0;
      state.scores[who] = after;
    
      // Dynamically grab the correct score element
      const el = document.getElementById(`score-${who}`);
      if (el) {
        setText(el, after);
        el.style.transform = "scale(1.08)";
        setTimeout(() => (el.style.transform = "scale(1.0)"), 120);
      }
    
      appendHistory(`Score ${who}: ${before} -> ${after}`);
      pushScoresDebounced();
      saveLocalState();
    }    

    function onFoul(who, triggerBtn) {
      const card = who === 1 ? els.card1 : els.card2;
      floatFoulAt(card, triggerBtn);

      state.actionStats.foul[who] = (state.actionStats.foul[who] || 0) + 1;
      appendHistory(`FOUL on Player ${who} (total: ${state.actionStats.foul[who]})`);

      if (state.joined && state.sbRef) {
        pushUpdate({ actionStats: state.actionStats });
      }
      saveLocalState();
    }

    function floatFoulAt(cardEl, triggerBtn) {
      if (!cardEl || !triggerBtn) return;
      const cardRect = cardEl.getBoundingClientRect();
      const btnRect = triggerBtn.getBoundingClientRect();
      const centerX = btnRect.left + btnRect.width / 2 - cardRect.left;
      const topY = btnRect.top - cardRect.top - 6;
      const tag = document.createElement("div");
      tag.className = "foul-float";
      tag.textContent = "+1";
      tag.style.left = `${centerX}px`;
      tag.style.top = `${topY}px`;
      tag.style.color = "#f59e0b";
      tag.style.textShadow = "0 1px 2px rgba(0,0,0,.25)";
      cardEl.appendChild(tag);
      setTimeout(() => tag.remove(), 1100);
    }

    async function clearGame() {
      state.players = { 1: "Player 1", 2: "Player 2" };
      state.teams = { 1: "Team 1", 2: "Team 2" };
      state.scores = { 1: 0, 2: 0 };
      state.actionStats = { foul: { 1: 0, 2: 0 } };

      setValue(els.name1, state.players[1]);
      setValue(els.name2, state.players[2]);
      setValue(els.team1, state.teams[1]);
      setValue(els.team2, state.teams[2]);
      setText(els.score1, "0");
      setText(els.score2, "0");
      setText(els.currentCode, "----");
      setText(els.legacyHash, "------");

      appendHistory("Cleared local game state.");

      localStorage.removeItem(STATE_STORAGE_KEY);
      localStorage.removeItem(LIVE_STORAGE_KEY);

      if (state.joined && state.sbRef) {
        try {
          const snap = await getDoc(state.sbRef);
          if (snap.exists()) {
            await updateDoc(state.sbRef, {
              players: state.players,
              teams: state.teams,
              scores: state.scores,
              actionStats: state.actionStats,
              scoreboardCode: null,
              updatedAt: serverTimestamp(),
            });
            appendHistory("Cleared remote scoreboard.");
          }
        } catch (err) {
          console.error(err);
          appendHistory("Failed to clear remote scoreboard: " + err.message);
        }
      }
    }

    function showHistory() {
      els.historyPopup?.classList.remove("hidden");
    }
    function hideHistory() {
      els.historyPopup?.classList.add("hidden");
    }

    setValue(els.name1, state.players[1]);
    setValue(els.name2, state.players[2]);
    setValue(els.team1, state.teams[1]);
    setValue(els.team2, state.teams[2]);
    setText(els.score1, String(state.scores[1]));
    setText(els.score2, String(state.scores[2]));
    setText(els.currentCode, "----");
    setText(els.legacyHash, "------");

    window.clearGame = clearGame;
    window.toggleLiveSharing = toggleLiveSharing;
    window.showHistory = showHistory;
    window.hideHistory = hideHistory;

    appendHistory("Normal scoreboard loaded.");

    function showLivePopup(code, isOn = true) {
      const popup = document.getElementById("livePopup");
      const codeEl = document.getElementById("liveCodeDisplay");
      const statusEl = document.getElementById("livePopupStatus");
      const titleEl = document.getElementById("livePopupTitle");
      if (popup && codeEl && statusEl && titleEl) {
        titleEl.textContent = "Live Score Sharing";
        if (isOn) {
          statusEl.textContent = "ON";
          statusEl.classList.remove("text-red-600");
          statusEl.classList.add("text-green-600");
          codeEl.textContent = code || "----";
        } else {
          statusEl.textContent = "OFF";
          statusEl.classList.remove("text-green-600");
          statusEl.classList.add("text-red-600");
          codeEl.textContent = "----";
        }
        popup.classList.remove("hidden");
      }
    }
    window.hideLivePopup = () => {
      document.getElementById("livePopup")?.classList.add("hidden");
    };

    function initCopyHandlers() {
      const idEl = document.getElementById("currentCode");
      const popupCodeEl = document.getElementById("liveCodeDisplay");

      function bindCopy(el) {
        if (!el) return;
        el.style.cursor = "pointer";
        el.addEventListener("click", async () => {
          const text = el.textContent.trim();
          if (!text || text === "----") return;
          try {
            await navigator.clipboard.writeText(text);
            const original = el.textContent;
            el.textContent = "Copied!";
            el.style.color = "#16a34a";
            setTimeout(() => {
              el.textContent = original;
              el.style.color = "";
            }, 1000);
          } catch (err) {
            console.error("Clipboard error:", err);
            alert("Failed to copy scoreboard ID.");
          }
        });
      }

      bindCopy(idEl);
      bindCopy(popupCodeEl);
    }

    restoreLocalState();

    (function autoRestoreLiveGame() {
      try {
        const savedId = localStorage.getItem(LIVE_STORAGE_KEY);
        if (!savedId) return;
        const ref = doc(db, "normal-match", savedId);
        startListening(ref);
        appendHistory("Restored ongoing scoreboard from previous session.");
      } catch (err) {
        console.warn("[normal-script] autoRestoreLiveGame failed", err);
      }
    })();

    initCopyHandlers();
  })();
});
