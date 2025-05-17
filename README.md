# 🎯 WanDollah Scoreboard App

A responsive, animated, and mobile-optimized scoreboard for 3–4 players. Tailored for pool games like SG Guard or other cue sports.

Built with **Tailwind CSS**, **HTML**, and **vanilla JavaScript** — no build tools or frameworks required.

---

## ✨ Features

- ✅ **Responsive layout** (dynamic grid that adjusts for 3 or 4 players)
- ✅ **Mobile-first design** — Works beautifully on iPhones, Android, and desktops
- ✅ **Dark Mode Toggle** 🌙☀️
  - Smooth background and font color transitions
- ✅ **Game Actions Supported**:
  - `WIN`: Add/subtract configurable Win Rate between winner and previous player
  - `FOUL+`: Adds Foul Rate to selected player, subtracts from previous
  - `BC`: Adds Break Clear points to one player, subtracts from all others
  - `RUNOUT` and `GOLDEN`: Treated like advanced BC/WIN combos
  - `UNDO`: Revert last action with turn order restored
- ✅ **Input controls** to configure:
  - Win Rate
  - Foul Rate
  - Break Clear Rate (BC)
- ✅ **Persistent scoring** with `localStorage` for:
  - Player names
  - Scores
  - Turn order
- ✅ **Score History Log**:
  - Timestamped, color-coded history of scoring actions
- ✅ **Animated Help Popup**:
  - Smooth fade-in/out instructions modal
- ✅ **Auto-updated Turn Order** logic
  - Updates after each win according to 3P/4P logic
- ✅ **Clean player interface**:
  - Editable player names with light/dark mode transitions
  - No unnecessary clutter like turn indicators under scores
- ✅ **"WanDollah" Branding**:
  - Title permanently visible at the top left

---

## 🚀 Getting Started

### 1. Clone or download the project

```bash
git clone https://github.com/yourusername/wandollah-scoreboard.git
