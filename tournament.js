import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  doc,
  serverTimestamp,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyC_jSYoQLlsYvyMkE4fZ4bHFz2fkE70shk",
  authDomain: "guard-scoreboard.firebaseapp.com",
  projectId: "guard-scoreboard",
  storageBucket: "guard-scoreboard.appspot.com",
  messagingSenderId: "491028228431",
  appId: "1:491028228431:web:4c92700d264f5b1aae3d3a",
  measurementId: "G-5Z28C6N29L",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// -------------------------------
// UTILITIES
// -------------------------------
function generateScoreboardCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getStageName(roundIdx, totalRounds) {
  if (totalRounds === 3)
    return ["Quarterfinals", "Semifinals", "Finals"][roundIdx];
  if (totalRounds === 4)
    return ["Round of 16", "Quarterfinals", "Semifinals", "Finals"][roundIdx];
  if (totalRounds === 5)
    return [
      "Round of 32",
      "Round of 16",
      "Quarterfinals",
      "Semifinals",
      "Finals",
    ][roundIdx];
  return `Round ${roundIdx + 1}`;
}

function getRoundPrefix(totalRounds, roundIdx) {
  if (totalRounds === 5) return ["R32", "R16", "QF", "SF", "F"][roundIdx];
  if (totalRounds === 4) return ["R16", "QF", "SF", "F"][roundIdx];
  if (totalRounds === 3) return ["QF", "SF", "F"][roundIdx];
  return `R${roundIdx + 1}`;
}

function normalizeRounds(roundsObjOrArray) {
  if (!roundsObjOrArray) return [];
  if (Array.isArray(roundsObjOrArray)) return roundsObjOrArray;
  const keys = Object.keys(roundsObjOrArray).sort((a, b) => {
    const na = parseInt(a.replace(/\D+/g, ""), 10);
    const nb = parseInt(b.replace(/\D+/g, ""), 10);
    return na - nb;
  });
  return keys.map((k) => {
    const val = roundsObjOrArray[k];
    if (Array.isArray(val)) return val;
    return Object.values(val);
  });
}

function toSameShape(originalRound, roundArr) {
  if (Array.isArray(originalRound)) return roundArr;
  const out = {};
  for (let i = 0; i < roundArr.length; i++) out[i] = roundArr[i];
  return out;
}

// -------------------------------
// BRACKET GENERATION
// -------------------------------
function generateBracket(players, size) {
  const rounds = Math.log2(size);
  const matchesPerRound = [];

  while (players.length < size) players.push("(BYE)");
  shuffle(players);

  const round1 = [];
  for (let i = 0; i < size; i += 2) {
    round1.push({
      p1: players[i],
      p2: players[i + 1],
      score1: 0,
      score2: 0,
      winner: null,
      status: "live",
    });
  }
  matchesPerRound.push(round1);

  for (let r = 1; r < rounds; r++) {
    const numMatches = size / Math.pow(2, r + 1);
    const round = [];
    for (let m = 0; m < numMatches; m++) {
      round.push({
        p1: null,
        p2: null,
        score1: 0,
        score2: 0,
        winner: null,
        status: "pending",
      });
    }
    matchesPerRound.push(round);
  }
  return matchesPerRound;
}

// -------------------------------
// WINNER ADVANCEMENT
// -------------------------------
async function advanceWinnerIfReady(tournamentId, tData, matchDoc) {
  try {
    if (!tData?.rounds) return;

    const d = matchDoc.data();
    const { roundKey, matchIndex, scores, players, status } = d || {};
    if (roundKey == null || matchIndex == null) return;

    const rounds = tData.rounds;
    let currentRound = rounds[roundKey];
    if (!currentRound) return;

    const currentIsArray = Array.isArray(currentRound);
    const currentArr = currentIsArray
      ? currentRound.slice()
      : Object.keys(currentRound)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => currentRound[k]);

    const m = currentArr[matchIndex] || {};
    const s1 = scores?.[1] ?? m.score1 ?? 0;
    const s2 = scores?.[2] ?? m.score2 ?? 0;

    const race = tData?.raceTo?.[roundKey];
    const isEndedFlag = status === "ended";
    const reachedRace =
      typeof race === "number" &&
      race > 0 &&
      (s1 >= race || s2 >= race) &&
      s1 !== s2;

    if (!isEndedFlag && !reachedRace) return;

    const p1Name = players?.[1] ?? m.p1 ?? "TBD";
    const p2Name = players?.[2] ?? m.p2 ?? "TBD";
    if (p1Name === "TBD" && p2Name === "TBD") return;

    const winnerSide = s1 > s2 ? "p1" : "p2";
    const winnerName = s1 > s2 ? p1Name : p2Name;

    const updatedCurrent = {
      ...m,
      p1: p1Name,
      p2: p2Name,
      score1: s1,
      score2: s2,
      winner: winnerSide,
      status: "ended",
    };
    currentArr[matchIndex] = updatedCurrent;

    const currentRoundNum = parseInt(roundKey.replace(/\D+/g, ""), 10);
    const nextRoundNum = currentRoundNum + 1;
    const nextRoundKey = `round${nextRoundNum}`;
    const nextRound = rounds[nextRoundKey];
    if (!nextRound) {
      const tRef = doc(db, "tournaments", tournamentId);
      await updateDoc(tRef, {
        [`rounds.${roundKey}`]: toSameShape(currentRound, currentArr),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const nextIsArray = Array.isArray(nextRound);
    const nextArr = nextIsArray
      ? nextRound.slice()
      : Object.keys(nextRound)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => nextRound[k]);

    const targetIndex = Math.floor(matchIndex / 2);
    const targetSide = matchIndex % 2 === 0 ? "p1" : "p2";
    const targetMatch = nextArr[targetIndex] || {
      p1: null,
      p2: null,
      score1: 0,
      score2: 0,
      winner: null,
      status: "pending",
    };

    const placed = { ...targetMatch, [targetSide]: winnerName };
    placed.status = placed.p1 && placed.p2 ? "live" : "pending";
    nextArr[targetIndex] = placed;

    const tRef = doc(db, "tournaments", tournamentId);
    await updateDoc(tRef, {
      [`rounds.${roundKey}`]: toSameShape(currentRound, currentArr),
      [`rounds.${nextRoundKey}`]: toSameShape(nextRound, nextArr),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[tournament] advanceWinnerIfReady error:", err);
  }
}

// -------------------------------
// RENDERING
// -------------------------------
let currentData = null;

function renderBracket(container, roundsArray, tData, tournamentId) {
  container.innerHTML = "";
  currentData = tData;

  const totalRounds = roundsArray.length;
  const colSpacing = 400;
  const cardWidth = 220;
  const cardHeight = 300;
  const firstRoundMatches = roundsArray[0]?.length || 1;
  const rowSpacing = Math.max(140, 600 / firstRoundMatches);

  const cardPositions = [];

  // --- HEADER ROW (stage + race to) ---
  const headerRow = document.createElement("div");
  headerRow.className = "flex items-start gap-[180px] mb-6";

  for (let r = 0; r < totalRounds; r++) {
    const roundKey = `round${r + 1}`;
    const raceToValue = tData?.raceTo?.[roundKey] ?? "";

    const colHeader = document.createElement("div");
    colHeader.className = "flex flex-col items-center w-[220px]";

    const stageLabel = document.createElement("div");
    stageLabel.className = "text-center font-bold text-white text-lg mb-1";
    stageLabel.textContent = getStageName(r, totalRounds);

    const raceDiv = document.createElement("div");
    raceDiv.className = "text-center";
    raceDiv.innerHTML = `
      <label class="text-xs font-medium text-gray-300">Race to:</label>
      <input type="number" min="1" value="${raceToValue}"
        class="race-input glass-input w-16 text-center ml-2"
        data-round="${roundKey}" />
    `;

    colHeader.appendChild(stageLabel);
    colHeader.appendChild(raceDiv);
    headerRow.appendChild(colHeader);
  }
  container.appendChild(headerRow);

  const bracketLayer = document.createElement("div");
  bracketLayer.className = "relative";
  container.appendChild(bracketLayer);

  roundsArray.forEach((round, roundIdx) => {
    cardPositions[roundIdx] = [];
    const safeRound = Array.isArray(round) ? round : Object.values(round);
    const prefix = getRoundPrefix(totalRounds, roundIdx);

    safeRound.forEach((match, idx) => {
      const card = document.createElement("div");
      card.className = "bracket-card";
      card.id = `card-${roundIdx}-${idx}`;

      const left = roundIdx * colSpacing;
      let top;
      if (roundIdx === 0) {
        top = idx * rowSpacing;
      } else {
        const feeder1 = cardPositions[roundIdx - 1][idx * 2];
        const feeder2 = cardPositions[roundIdx - 1][idx * 2 + 1];
        top = (feeder1 + feeder2) / 2;
      }

      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      cardPositions[roundIdx][idx] = top;

      // --- HEADER (round tag + scoreboard ID) ---
      const header = document.createElement("div");
      header.className = "card-header";
      const leftTag = document.createElement("span");
      leftTag.className = "stage-tag";
      leftTag.textContent = `${prefix}${idx + 1}`;
      const rightTag = document.createElement("span");
      rightTag.textContent = match?.scoreboardCode
        ? `ID: ${match.scoreboardCode}`
        : "";
      header.appendChild(leftTag);
      header.appendChild(rightTag);
      card.appendChild(header);

      // Players
      const decided = !!match?.winner;
      const p1Win = decided && match.winner === "p1";
      const p2Win = decided && match.winner === "p2";

      const p1 = document.createElement("div");
      p1.className = `flex justify-between ${p1Win ? "winner" : decided ? "loser" : ""}`;
      p1.innerHTML = `<span>${match.p1 ?? "TBD"}</span><span>${match.score1 ?? 0}</span>`;

      const p2 = document.createElement("div");
      p2.className = `flex justify-between ${p2Win ? "winner" : decided ? "loser" : ""}`;
      p2.innerHTML = `<span>${match.p2 ?? "TBD"}</span><span>${match.score2 ?? 0}</span>`;

      card.appendChild(p1);
      card.appendChild(p2);

      bracketLayer.appendChild(card);
    });
  });

  // DRAW CONNECTORS
  requestAnimationFrame(() => {
    drawConnectors(cardPositions, colSpacing, cardWidth, cardHeight);

    const bracketWrap = document.getElementById("bracketWrap");

    const viewportHeight = window.innerHeight - 220; // padding for header + controls
    const viewportWidth = window.innerWidth - 80; // padding for controls
    const bracketHeight = bracketWrap.scrollHeight;
    const bracketWidth = bracketWrap.scrollWidth;

    let scale = 1;
    if (bracketHeight > viewportHeight || bracketWidth > viewportWidth) {
      const scaleH = viewportHeight / bracketHeight;
      const scaleW = viewportWidth / bracketWidth;
      scale = Math.min(scaleH, scaleW);
    }

    bracketWrap.style.transform = `scale(${scale})`;
    bracketWrap.style.transformOrigin = "top left";
  });

  container.querySelectorAll(".race-input").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const val = parseInt(e.target.value, 10);
      const rKey = e.target.dataset.round;
      if (!tournamentId) return;
      try {
        await updateDoc(doc(db, "tournaments", tournamentId), {
          [`raceTo.${rKey}`]: isNaN(val) ? null : val,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Failed to update raceTo:", err);
      }
    });
  });
}

function drawConnectors(cardPositions, colSpacing, cardWidth, cardHeight) {
  const svg = document.getElementById("bracketLines");
  const wrap = document.getElementById("bracketWrap");

  svg.setAttribute("width", wrap.scrollWidth);
  svg.setAttribute("height", wrap.scrollHeight);

  const defs = svg.querySelector("defs");
  const defsHTML = defs ? defs.outerHTML : "";
  svg.innerHTML = defsHTML;

  const PUSH_RIGHT = 15;

  for (let r = 0; r < cardPositions.length - 1; r++) {
    for (let i = 0; i < cardPositions[r].length; i += 2) {
      const targetIdx = Math.floor(i / 2);

      const x2 = (r + 1) * colSpacing + PUSH_RIGHT;
      const y2 = cardPositions[r + 1][targetIdx] + cardHeight / 2;

      [i, i + 1].forEach((j) => {
        if (j >= cardPositions[r].length) return;

        const LEFT_OFFSET = 20;
        const x1 = r * colSpacing + cardWidth + LEFT_OFFSET;
        const y1 = cardPositions[r][j] + cardHeight / 2;
        const midX = (x1 + x2) / 2;

        const pathData = `M${x1},${y1} H${midX} V${y2} H${x2}`;
        const el = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        el.setAttribute("d", pathData);
        el.setAttribute("fill", "none");

        const match = currentData?.rounds?.[`round${r + 1}`]?.[j];
        if (match?.status === "live") el.classList.add("flow-path-live");
        else if (match?.status === "ended") el.classList.add("flow-path-ended");
        else el.classList.add("flow-path-pending");

        svg.appendChild(el);
      });
    }
  }
}

// -------------------------------
// MAIN FLOW
// -------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const genBtn = document.getElementById("generate");
  const endBtn = document.getElementById("endTournament");
  const bracketEl = document.getElementById("bracket");
  const playerCountEl = document.getElementById("playerCount");
  const formatEl = document.getElementById("format");
  const playerNamesEl = document.getElementById("playerNames");
  const tournamentNameEl = document.getElementById("tournamentName");
  const tournamentDateEl = document.getElementById("tournamentDate");

  const zoomControls = document.getElementById("zoomControls");
  const zoomRange = document.getElementById("zoomRange");
  const zoomValue = document.getElementById("zoomValue");
  const bracketWrap = document.getElementById("bracketWrap");

  zoomRange?.addEventListener("input", () => {
    const scale = parseFloat(zoomRange.value);
    bracketWrap.style.transform = `scale(${scale})`;
    bracketWrap.style.transformOrigin = "top left";
    zoomValue.textContent = `${Math.round(scale * 100)}%`;
  });

  function showZoomControls() {
    zoomControls.classList.remove("hidden");
  }

  let currentTournamentId = null;
  let unsubscribeMatches = null;

  function listenTournament(tournamentId) {
    if (!tournamentId) return;
    currentTournamentId = tournamentId;

    onSnapshot(doc(db, "tournaments", tournamentId), async (snap) => {
      if (!snap.exists()) return;
      const tData = snap.data();

      // Render using absolute positioning and draw connectors
      renderBracket(
        bracketEl,
        normalizeRounds(tData.rounds),
        tData,
        tournamentId,
      );

      // --- NOTICE BOARD ---
      const noticeContent = document.getElementById("noticeContent");
      const noticeHeader = document.getElementById("noticeHeader");
      const toggleNotice = document.getElementById("toggleNotice");
      const noticeInput = document.getElementById("noticeInput");
      const sendNotice = document.getElementById("sendNotice");

      let collapsed = false;
      noticeHeader.onclick = () => {
        collapsed = !collapsed;
        noticeContent.style.display = collapsed ? "none" : "block";
        toggleNotice.textContent = collapsed ? "+" : "−";
      };

      // LIVE UPDATES
      onSnapshot(
        query(
          collection(db, "tournaments", tournamentId, "notices"),
          orderBy("createdAt", "desc"),
        ),
        (snap) => {
          noticeContent.innerHTML = "";
          snap.forEach((docSnap) => {
            const n = docSnap.data();
            const ts = n.createdAt?.toDate?.() || new Date();
            const timeStr =
              ts.toLocaleDateString("en-GB") +
              " " +
              ts.toLocaleTimeString("en-GB");
            const item = document.createElement("div");
            item.className = "notice-item";
            item.innerHTML = `<div>${n.message}</div><div class="notice-time">${timeStr}</div>`;
            noticeContent.appendChild(item);
          });
        },
      );

      // SENDING NOTICES
      sendNotice.onclick = async () => {
        const msg = noticeInput.value.trim();
        if (!msg) return;
        try {
          await addDoc(collection(db, "tournaments", tournamentId, "notices"), {
            message: msg,
            createdAt: serverTimestamp(),
          });
          noticeInput.value = "";
        } catch (err) {
          console.error("Failed to send notice:", err);
          alert("Error sending notice: " + err.message);
        }
      };

      // END BUTTON
      endBtn.classList.remove("hidden");
      endBtn.onclick = async () => {
        if (!confirm("Would you like to end the tournament?")) return;
        try {
          await updateDoc(doc(db, "tournaments", tournamentId), {
            status: "ended",
            updatedAt: serverTimestamp(),
          });
          const qLive = query(
            collection(db, "tournament-match"),
            where("tournamentId", "==", tournamentId),
            where("status", "==", "live"),
          );
          const liveSnap = await getDocs(qLive);
          for (const m of liveSnap.docs) {
            await updateDoc(m.ref, {
              status: "ended",
              updatedAt: serverTimestamp(),
            });
          }
          alert("Tournament ended successfully.");
        } catch (err) {
          console.error("Failed to end tournament:", err);
          alert("Error ending tournament: " + err.message);
        }
      };

      // Auto-create scoreboard sessions when both players exist
      for (const [roundKey, matches] of Object.entries(tData.rounds || {})) {
        const safeRound = Array.isArray(matches)
          ? matches
          : Object.values(matches);

        for (let idx = 0; idx < safeRound.length; idx++) {
          const match = safeRound[idx];
          const hasPlayers =
            match?.p1 && match?.p2 && match.p1 !== "TBD" && match.p2 !== "TBD";

          if (
            hasPlayers &&
            !match.scoreboardId &&
            !match.scoreboardCode &&
            (match.status === "live" || match.status === "pending")
          ) {
            try {
              const qExisting = query(
                collection(db, "tournament-match"),
                where("tournamentId", "==", tournamentId),
                where("roundKey", "==", roundKey),
                where("matchIndex", "==", idx),
              );
              const existingSnap = await getDocs(qExisting);
              if (!existingSnap.empty) {
                continue;
              }

              const codeStr = generateScoreboardCode();
              const payload = {
                title: "Tournament Match",
                players: { 1: match.p1, 2: match.p2 },
                scores: { 1: 0, 2: 0 },
                status: "live",
                scoreboardCode: codeStr,
                tournamentId,
                roundKey,
                matchIndex: idx,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              };
              const sbRef = await addDoc(
                collection(db, "tournament-match"),
                payload,
              );

              const updatedMatches = [...safeRound];
              updatedMatches[idx] = {
                ...match,
                scoreboardId: sbRef.id,
                scoreboardCode: codeStr,
              };

              await updateDoc(doc(db, "tournaments", tournamentId), {
                [`rounds.${roundKey}`]: toSameShape(matches, updatedMatches),
                updatedAt: serverTimestamp(),
              });
            } catch (err) {
              console.error(
                "[tournament] Failed to auto-create scoreboard:",
                err,
              );
            }
          }
        }
      }
    });

    // React to scoreboard score/status updates
    if (unsubscribeMatches) unsubscribeMatches();
    const qMatches = query(
      collection(db, "tournament-match"),
      where("tournamentId", "==", tournamentId),
    );
    unsubscribeMatches = onSnapshot(qMatches, async (snap) => {
      const tSnap = await getDoc(doc(db, "tournaments", tournamentId));
      if (!tSnap.exists()) return;
      const tData = tSnap.data();

      snap.docChanges().forEach(async (change) => {
        const mDoc = change.doc;
        const data = mDoc.data() || {};
        const rKey = data.roundKey;
        const s1 = data.scores?.[1] ?? 0;
        const s2 = data.scores?.[2] ?? 0;
        const race = tData?.raceTo?.[rKey];
        const raceReached =
          typeof race === "number" &&
          race > 0 &&
          (s1 >= race || s2 >= race) &&
          s1 !== s2;

        if (data.status === "ended" || raceReached) {
          await advanceWinnerIfReady(tournamentId, tData, mDoc);
        }
      });
    });
  }

  const lastTournamentId = localStorage.getItem("lastTournamentId");
  if (lastTournamentId) {
    listenTournament(lastTournamentId);
    showZoomControls();
  }

  genBtn.addEventListener("click", async () => {
    const size = parseInt(playerCountEl.value, 10);
    const format = formatEl.value;
    const namesRaw = (playerNamesEl.value || "").trim();
    const tournamentName = tournamentNameEl.value.trim();
    const tournamentDate = tournamentDateEl.value.trim();

    const players = namesRaw
      ? namesRaw
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean)
      : [];
    const bracketArray = generateBracket(players, size);

    try {
      const tournamentRef = await addDoc(collection(db, "tournaments"), {
        name: tournamentName,
        date: tournamentDate,
        size,
        format,
        players,
        raceTo: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const roundsObj = {};
      const totalRounds = bracketArray.length;

      for (let r = 0; r < totalRounds; r++) {
        const roundKey = `round${r + 1}`;
        const roundArray = [];

        for (let m = 0; m < bracketArray[r].length; m++) {
          const match = bracketArray[r][m];

          let scoreboardId = null;
          let scoreboardCode = null;
          let status = r === 0 ? "live" : "pending";

          const validP1 = match.p1 && match.p1 !== "(BYE)";
          const validP2 = match.p2 && match.p2 !== "(BYE)";

          if (r === 0 && validP1 && validP2) {
            const codeStr = generateScoreboardCode();
            const payload = {
              title: "Tournament Match",
              players: { 1: match.p1, 2: match.p2 },
              scores: { 1: 0, 2: 0 },
              status: "live",
              scoreboardCode: codeStr,
              tournamentId: tournamentRef.id,
              roundKey,
              matchIndex: m,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            const sbRef = await addDoc(
              collection(db, "tournament-match"),
              payload,
            );
            scoreboardId = sbRef.id;
            scoreboardCode = codeStr;
          }

          roundArray.push({
            p1: match.p1 ?? null,
            p2: match.p2 ?? null,
            score1: match.score1 ?? 0,
            score2: match.score2 ?? 0,
            winner: null,
            scoreboardId,
            scoreboardCode,
            status,
          });
        }

        roundsObj[roundKey] = roundArray;
      }

      await setDoc(doc(db, "tournaments", tournamentRef.id), {
        name: tournamentName,
        date: tournamentDate,
        size,
        format,
        players,
        rounds: roundsObj,
        raceTo: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      localStorage.setItem("lastTournamentId", tournamentRef.id);
      listenTournament(tournamentRef.id);
      showZoomControls();
    } catch (err) {
      console.error("[tournament] Error generating tournament:", err);
      alert("Failed to generate tournament: " + (err?.message || err));
    }
  });
});
