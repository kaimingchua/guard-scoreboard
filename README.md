# 🎯 Guard Scoreboard App!

A responsive, animated, and mobile-optimized scoreboard for 3–4 players. Tailored for Singapore Guard games.

---

## ✨ Features

- ✅ **Responsive layout** (dynamic grid that adjusts for 3 or 4 players)  
- ✅ **Mobile-first design** — Works beautifully on iPhones, Android, and desktops  
- ✅ **Dark Mode Toggle** 🌙☀️  
  - Smooth background and font color transitions  

### 🎱 Game Actions Supported
- `WIN`: Add/subtract configurable Win Rate between winner and previous player  
- `FOUL+`: Subtract Foul Rate from shooter, add to previous player  
- `BC` (Break Clear): Shooter gains, all others lose configurable BC points  
- `GOLDEN`: Golden Break (uses Win Rate, distributed among all others)  
- `UNDO`: Revert last action with turn order restored

### ⚙️ Input Controls
- Configure:
  - Win Rate  
  - Foul Rate  
  - Break Clear Rate (BC)
  - Score History
  - Score Analytics
  - Live Score Sharing ON & OFF Toggle

### 💾 Persistent Scoring
- All data stored in **localStorage**:
  - Player names  
  - Scores  
  - Turn order  

### 📜 Score History Log
- Timestamped, color-coded action log  
- Undo button to roll back last action  

### ℹ️ Animated Help Popup
- Smooth fade-in/out instructions modal  

### 🔄 Auto-updated Turn Order
- Correct 3-player and 4-player rotation logic  

### 🧑‍🤝‍🧑 Clean Player Interface
- Editable player names  
- Animated score updates with green/red flashes  
- Dark/light mode friendly  

### 📊 Score Analytics Dashboard
- Line chart of scores over turns  
- Bar charts for:
  - Total Fouls  
  - Total Wins  
  - Golden Breaks  
  - Break Clears  
- Tabbed view — easily switch between analytics types  

### 📡 Live Score Sharing (Firebase)
- **Start/stop Live Score Sharing** from the controls  
- Populates scores of current game session to `live.html` to share with others  
- Viewers can see the following at `live.html` page:
  - Real-time scores of all guard sessions happening
  - Player names  
  - Analytics (fouls, wins, golden breaks, break clears)  
  - Ongoing timer showing how long the game has been live  

### 📲 Social Sharing
- **Share to Facebook**: Generate a screenshot of the scoreboard and share it with friends  
  - Uses ImgBB for image hosting  
  - Posts include scoreboard image + link to game  

---
