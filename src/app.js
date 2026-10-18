import { BOARD_CONFIG, DIFFICULTY_LABELS, generatePuzzle, peersFor } from "./engine.js";

const STORAGE_KEY = "sudoku-yifang-state-v1";
const PREFS_KEY = "sudoku-yifang-prefs-v1";

const elements = {
  board: document.querySelector("#game-board"),
  numberPad: document.querySelector("#number-pad"),
  timer: document.querySelector("#timer"),
  mistakes: document.querySelector("#mistakes"),
  remaining: document.querySelector("#remaining"),
  message: document.querySelector("#game-message"),
  dock: document.querySelector("#play-dock"),
  roundTitle: document.querySelector("#round-title"),
  roundCaption: document.querySelector("#round-caption"),
  newGame: document.querySelector("#new-game-button"),
  undo: document.querySelector("#undo-button"),
  erase: document.querySelector("#erase-button"),
  notes: document.querySelector("#notes-button"),
  hint: document.querySelector("#hint-button"),
  sound: document.querySelector("#sound-toggle"),
  install: document.querySelector("#install-button"),
  settingsToggle: document.querySelector("#settings-toggle"),
  settingsPanel: document.querySelector("#settings-panel"),
  settingsBackdrop: document.querySelector("#settings-backdrop"),
  settingsClose: document.querySelector("#settings-close"),
  shell: document.querySelector(".app-shell"),
  completion: document.querySelector("#completion-banner"),
  completionSummary: document.querySelector("#completion-summary"),
  completionNewGame: document.querySelector("#completion-new-game"),
};

const savedPrefs = readJson(PREFS_KEY, {});
let state = restoreGame() || createEmptyState();
let timerId;
let deferredInstallPrompt = null;
let audioContext = null;

function createEmptyState() {
  return {
    size: 9,
    difficulty: "medium",
    puzzle: [],
    solution: [],
    entries: [],
    notes: [],
    selected: null,
    mistakes: 0,
    hints: 0,
    noteMode: false,
    history: [],
    startedAt: Date.now(),
    completed: false,
    completedElapsed: 0,
    soundOn: savedPrefs.soundOn ?? true,
  };
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function restoreGame() {
  const saved = readJson(STORAGE_KEY, null);
  if (!saved || !BOARD_CONFIG[saved.size]) return null;
  const cellCount = saved.size * saved.size;
  if (saved.puzzle?.length !== cellCount || saved.solution?.length !== cellCount || saved.entries?.length !== cellCount) return null;
  return {
    ...createEmptyState(),
    ...saved,
    notes: Array.from({ length: cellCount }, (_, index) => Array.isArray(saved.notes?.[index]) ? saved.notes[index] : []),
    history: [],
    soundOn: savedPrefs.soundOn ?? true,
  };
}

function saveGame() {
  const { history, ...persisted } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  localStorage.setItem(PREFS_KEY, JSON.stringify({ soundOn: state.soundOn }));
}

function currentElapsed() {
  return state.completed ? state.completedElapsed : Math.max(0, Date.now() - state.startedAt);
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function currentValue(index) {
  return state.puzzle[index] || state.entries[index] || 0;
}

function isCellCorrect(index) {
  return currentValue(index) === state.solution[index];
}

function isGameComplete() {
  return state.solution.length > 0 && state.solution.every((value, index) => currentValue(index) === value);
}

function newGame() {
  elements.newGame.disabled = true;
  elements.board.classList.add("is-generating");
  setMessage("正在铺开一张新题纸…");
  elements.completion.hidden = true;

  window.setTimeout(() => {
    const { puzzle, solution } = generatePuzzle(state.size, state.difficulty);
    const cellCount = state.size * state.size;
    state = {
      ...state,
      puzzle,
      solution,
      entries: Array(cellCount).fill(0),
      notes: Array.from({ length: cellCount }, () => []),
      selected: puzzle.findIndex((value) => value === 0),
      mistakes: 0,
      hints: 0,
      noteMode: false,
      history: [],
      startedAt: Date.now(),
      completed: false,
      completedElapsed: 0,
    };
    elements.newGame.disabled = false;
    elements.board.classList.remove("is-generating");
    setMessage("选择数字，或开启候选模式记录推演");
    renderAll();
    saveGame();
  }, 40);
}

function renderAll() {
  renderControls();
  renderBoard();
  renderNumberPad();
  renderStatus();
}

function renderControls() {
  document.querySelectorAll("[data-size]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.size) === state.size));
  });
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.difficulty === state.difficulty));
  });
  elements.notes.setAttribute("aria-pressed", String(state.noteMode));
  elements.sound.setAttribute("aria-pressed", String(state.soundOn));
  elements.sound.setAttribute("aria-label", state.soundOn ? "关闭声音" : "开启声音");
  elements.sound.classList.toggle("is-muted", !state.soundOn);
  elements.undo.disabled = state.history.length === 0 || state.completed;
  const roundLabel = `${toChineseSize(state.size)}阶 · ${DIFFICULTY_LABELS[state.difficulty]}`;
  elements.roundTitle.textContent = roundLabel;
  elements.roundCaption.textContent = roundLabel;
  elements.dock.classList.toggle("is-note-mode", state.noteMode);
}

function toChineseSize(size) {
  return { 4: "四", 6: "六", 9: "九" }[size];
}

function renderBoard() {
  if (!state.puzzle.length) return;
  const { boxRows, boxCols } = BOARD_CONFIG[state.size];
  const fragment = document.createDocumentFragment();
  const selectedValue = state.selected === null ? 0 : currentValue(state.selected);
  const selectedPeers = state.selected === null ? new Set() : peersFor(state.selected, state.size);

  elements.board.style.setProperty("--size", state.size);
  elements.board.style.setProperty("--box-cols", boxCols);
  elements.board.style.setProperty("--box-rows", boxRows);
  elements.board.dataset.size = state.size;
  elements.board.setAttribute("aria-rowcount", String(state.size));
  elements.board.setAttribute("aria-colcount", String(state.size));

  for (let index = 0; index < state.size * state.size; index += 1) {
    const row = Math.floor(index / state.size);
    const column = index % state.size;
    const value = currentValue(index);
    const isGiven = state.puzzle[index] !== 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sudoku-cell";
    button.dataset.index = index;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-rowindex", String(row + 1));
    button.setAttribute("aria-colindex", String(column + 1));
    button.setAttribute("aria-selected", String(index === state.selected));
    button.setAttribute("aria-label", cellLabel(index, value, isGiven));
    button.tabIndex = index === state.selected ? 0 : -1;

    if (isGiven) button.classList.add("is-given");
    if (index === state.selected) button.classList.add("is-selected");
    else if (selectedPeers.has(index)) button.classList.add("is-peer");
    if (selectedValue && value === selectedValue) button.classList.add("is-same-value");
    if (!isGiven && value && value !== state.solution[index]) button.classList.add("is-wrong");
    if ((column + 1) % boxCols === 0 && column < state.size - 1) button.classList.add("box-edge-right");
    if ((row + 1) % boxRows === 0 && row < state.size - 1) button.classList.add("box-edge-bottom");
    if (column === state.size - 1) button.classList.add("last-column");
    if (row === state.size - 1) button.classList.add("last-row");

    if (value) {
      const number = document.createElement("span");
      number.className = "cell-value";
      number.textContent = value;
      button.append(number);
    } else if (state.notes[index]?.length) {
      const notes = document.createElement("span");
      notes.className = "cell-notes";
      notes.setAttribute("aria-hidden", "true");
      for (let note = 1; note <= state.size; note += 1) {
        const mark = document.createElement("span");
        mark.textContent = state.notes[index].includes(note) ? note : "";
        notes.append(mark);
      }
      button.append(notes);
    }

    fragment.append(button);
  }

  elements.board.replaceChildren(fragment);
}

function cellLabel(index, value, isGiven) {
  const row = Math.floor(index / state.size) + 1;
  const column = index % state.size + 1;
  if (!value) return `第 ${row} 行第 ${column} 列，空格`;
  if (isGiven) return `第 ${row} 行第 ${column} 列，题目数字 ${value}`;
  if (value !== state.solution[index]) return `第 ${row} 行第 ${column} 列，数字 ${value}，有冲突`;
  return `第 ${row} 行第 ${column} 列，数字 ${value}`;
}

function renderNumberPad() {
  const fragment = document.createDocumentFragment();
  for (let value = 1; value <= state.size; value += 1) {
    const button = document.createElement("button");
    const placed = state.solution.reduce((count, solutionValue, index) => count + (solutionValue === value && isCellCorrect(index) ? 1 : 0), 0);
    button.type = "button";
    button.dataset.value = value;
    button.innerHTML = `<span>${value}</span><small>${state.size - placed}</small>`;
    button.setAttribute("aria-label", `填写数字 ${value}，还需 ${state.size - placed} 个`);
    button.disabled = placed === state.size || state.completed;
    fragment.append(button);
  }
  elements.numberPad.style.setProperty("--size", state.size);
  elements.numberPad.dataset.size = state.size;
  elements.numberPad.replaceChildren(fragment);
}

function renderStatus() {
  const remaining = state.solution.reduce((count, value, index) => count + (currentValue(index) === value ? 0 : 1), 0);
  elements.timer.textContent = formatTime(currentElapsed());
  elements.mistakes.textContent = state.mistakes;
  elements.remaining.textContent = remaining;
}

function setMessage(message) {
  elements.message.textContent = message;
}

function snapshotForUndo() {
  state.history.push({
    entries: [...state.entries],
    notes: state.notes.map((notes) => [...notes]),
    mistakes: state.mistakes,
    hints: state.hints,
  });
  if (state.history.length > 80) state.history.shift();
}

function selectCell(index, shouldFocus = false) {
  if (index < 0 || index >= state.size * state.size) return;
  state.selected = index;
  renderBoard();
  if (shouldFocus) elements.board.querySelector(`[data-index="${index}"]`)?.focus({ preventScroll: true });
}

function placeValue(value) {
  const index = state.selected;
  if (index === null || state.puzzle[index] || state.completed) return;
  const wasBoxComplete = isBoxComplete(index);
  snapshotForUndo();

  if (state.noteMode && !state.entries[index]) {
    const notes = new Set(state.notes[index]);
    notes.has(value) ? notes.delete(value) : notes.add(value);
    state.notes[index] = [...notes].sort((a, b) => a - b);
    playSound("note");
    setMessage(notes.has(value) ? `已记下候选 ${value}` : `已移除候选 ${value}`);
  } else {
    state.entries[index] = value;
    state.notes[index] = [];
    if (value === state.solution[index]) {
      peersFor(index, state.size).forEach((peer) => {
        state.notes[peer] = state.notes[peer].filter((note) => note !== value);
      });
      playSound("correct");
      setMessage("落子正确");
    } else {
      state.mistakes += 1;
      playSound("wrong");
      setMessage("这个数字与当前推演冲突");
    }
  }

  renderAll();
  animateCell(index, value === state.solution[index] ? "cell-pop" : "cell-shake");

  if (!wasBoxComplete && isBoxComplete(index)) {
    animateCompletedBox(index);
    playSound("box");
    setMessage("一宫完成，继续保持");
  }

  if (isGameComplete()) finishGame();
  saveGame();
}

function eraseSelected() {
  const index = state.selected;
  if (index === null || state.puzzle[index] || state.completed) return;
  if (!state.entries[index] && !state.notes[index].length) return;
  snapshotForUndo();
  state.entries[index] = 0;
  state.notes[index] = [];
  setMessage("已擦除当前格");
  playSound("note");
  renderAll();
  saveGame();
}

function undo() {
  const previous = state.history.pop();
  if (!previous || state.completed) return;
  state.entries = previous.entries;
  state.notes = previous.notes;
  state.mistakes = previous.mistakes;
  state.hints = previous.hints;
  setMessage("已撤销一步");
  playSound("note");
  renderAll();
  saveGame();
}

function giveHint() {
  if (state.completed) return;
  let index = state.selected;
  if (index === null || state.puzzle[index] || isCellCorrect(index)) {
    index = state.solution.findIndex((value, candidate) => currentValue(candidate) !== value);
  }
  if (index < 0) return;
  snapshotForUndo();
  state.selected = index;
  state.entries[index] = state.solution[index];
  state.notes[index] = [];
  state.hints += 1;
  peersFor(index, state.size).forEach((peer) => {
    state.notes[peer] = state.notes[peer].filter((note) => note !== state.solution[index]);
  });
  setMessage(`提示已填入数字 ${state.solution[index]}`);
  playSound("correct");
  renderAll();
  animateCell(index, "cell-hint");
  if (isGameComplete()) finishGame();
  saveGame();
}

function isBoxComplete(index) {
  const { boxRows, boxCols } = BOARD_CONFIG[state.size];
  const row = Math.floor(index / state.size);
  const column = index % state.size;
  const startRow = Math.floor(row / boxRows) * boxRows;
  const startColumn = Math.floor(column / boxCols) * boxCols;
  for (let rowOffset = 0; rowOffset < boxRows; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < boxCols; columnOffset += 1) {
      const cell = (startRow + rowOffset) * state.size + startColumn + columnOffset;
      if (!isCellCorrect(cell)) return false;
    }
  }
  return true;
}

function animateCell(index, className) {
  requestAnimationFrame(() => {
    const cell = elements.board.querySelector(`[data-index="${index}"]`);
    if (!cell) return;
    cell.classList.add(className);
    cell.addEventListener("animationend", () => cell.classList.remove(className), { once: true });
  });
}

function animateCompletedBox(index) {
  const { boxRows, boxCols } = BOARD_CONFIG[state.size];
  const row = Math.floor(index / state.size);
  const column = index % state.size;
  const startRow = Math.floor(row / boxRows) * boxRows;
  const startColumn = Math.floor(column / boxCols) * boxCols;
  for (let rowOffset = 0; rowOffset < boxRows; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < boxCols; columnOffset += 1) {
      const cellIndex = (startRow + rowOffset) * state.size + startColumn + columnOffset;
      const cell = elements.board.querySelector(`[data-index="${cellIndex}"]`);
      cell?.classList.add("box-complete");
      window.setTimeout(() => cell?.classList.remove("box-complete"), 620);
    }
  }
}

function finishGame() {
  state.completed = true;
  state.completedElapsed = Date.now() - state.startedAt;
  playSound("complete");
  renderAll();
  elements.completionSummary.textContent = `用时 ${formatTime(state.completedElapsed)}，${state.mistakes} 次错误，使用 ${state.hints} 次提示。`;
  elements.completion.hidden = false;
  createCelebration();
  window.setTimeout(() => elements.completionNewGame.focus(), 40);
  saveGame();
}

function createCelebration() {
  elements.completion.querySelectorAll(".celebration-piece").forEach((piece) => piece.remove());
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let index = 0; index < 18; index += 1) {
    const piece = document.createElement("span");
    piece.className = "celebration-piece";
    piece.style.setProperty("--x", `${8 + Math.random() * 84}%`);
    piece.style.setProperty("--delay", `${Math.random() * 220}ms`);
    piece.style.setProperty("--drift", `${-32 + Math.random() * 64}px`);
    elements.completion.append(piece);
  }
}

function moveSelection(rowDelta, columnDelta) {
  const index = state.selected ?? 0;
  const row = (Math.floor(index / state.size) + rowDelta + state.size) % state.size;
  const column = (index % state.size + columnDelta + state.size) % state.size;
  selectCell(row * state.size + column, true);
}

function toggleNotes() {
  state.noteMode = !state.noteMode;
  setMessage(state.noteMode ? "候选模式已开启" : "候选模式已关闭");
  playSound("note");
  renderControls();
  saveGame();
}

function isSettingsOpen() {
  return elements.settingsPanel.classList.contains("is-open");
}

function openSettings() {
  if (isSettingsOpen() || elements.completion.hidden === false) return;
  elements.settingsBackdrop.hidden = false;
  elements.settingsPanel.inert = false;
  elements.settingsPanel.setAttribute("aria-hidden", "false");
  elements.settingsToggle.setAttribute("aria-expanded", "true");
  elements.settingsPanel.classList.add("is-open");
  elements.shell.inert = true;
  requestAnimationFrame(() => elements.settingsBackdrop.classList.add("is-visible"));
  elements.settingsClose.focus({ preventScroll: true });
}

function closeSettings() {
  if (!isSettingsOpen()) return;
  elements.settingsPanel.classList.remove("is-open");
  elements.settingsBackdrop.classList.remove("is-visible");
  elements.settingsToggle.setAttribute("aria-expanded", "false");
  elements.shell.inert = false;
  elements.settingsToggle.focus({ preventScroll: true });
  elements.settingsPanel.setAttribute("aria-hidden", "true");
  elements.settingsPanel.inert = true;
  window.setTimeout(() => {
    if (!isSettingsOpen()) elements.settingsBackdrop.hidden = true;
  }, 260);
}

function trapSettingsFocus(event) {
  const focusable = [...elements.settingsPanel.querySelectorAll("button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
    .filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getAudioContext() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioContext = new AudioContext();
  }
  if (audioContext?.state === "suspended") audioContext.resume();
  return audioContext;
}

function playSound(kind) {
  if (!state.soundOn) return;
  const context = getAudioContext();
  if (!context) return;
  const now = context.currentTime;
  const sounds = {
    note: [[420, 0, 0.045, "sine", 0.025]],
    correct: [[520, 0, 0.07, "sine", 0.045], [690, 0.055, 0.09, "sine", 0.035]],
    wrong: [[150, 0, 0.11, "triangle", 0.045]],
    box: [[440, 0, 0.08, "sine", 0.035], [554, 0.065, 0.08, "sine", 0.03], [659, 0.13, 0.12, "sine", 0.025]],
    complete: [[392, 0, 0.12, "sine", 0.04], [494, 0.1, 0.12, "sine", 0.04], [587, 0.2, 0.12, "sine", 0.04], [784, 0.31, 0.28, "sine", 0.05]],
  };

  for (const [frequency, delay, duration, type, volume] of sounds[kind] || sounds.note) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now + delay);
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(volume, now + delay + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + duration + 0.02);
  }
}

elements.board.addEventListener("click", (event) => {
  const cell = event.target.closest(".sudoku-cell");
  if (cell) selectCell(Number(cell.dataset.index));
});

elements.numberPad.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-value]");
  if (button) placeValue(Number(button.dataset.value));
});

document.querySelector("#size-options").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-size]");
  if (!button) return;
  state.size = Number(button.dataset.size);
  closeSettings();
  newGame();
});

document.querySelector("#difficulty-options").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-difficulty]");
  if (!button) return;
  state.difficulty = button.dataset.difficulty;
  closeSettings();
  newGame();
});

elements.newGame.addEventListener("click", () => {
  closeSettings();
  newGame();
});
elements.completionNewGame.addEventListener("click", newGame);
elements.undo.addEventListener("click", undo);
elements.erase.addEventListener("click", eraseSelected);
elements.notes.addEventListener("click", toggleNotes);
elements.hint.addEventListener("click", giveHint);
elements.settingsToggle.addEventListener("click", openSettings);
elements.settingsClose.addEventListener("click", closeSettings);
elements.settingsBackdrop.addEventListener("click", closeSettings);

elements.sound.addEventListener("click", () => {
  state.soundOn = !state.soundOn;
  if (state.soundOn) playSound("correct");
  renderControls();
  saveGame();
});

document.addEventListener("keydown", (event) => {
  if (isSettingsOpen()) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSettings();
    } else if (event.key === "Tab") {
      trapSettingsFocus(event);
    }
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey || elements.completion.hidden === false) return;
  const numericValue = Number(event.key);
  if (numericValue >= 1 && numericValue <= state.size) {
    event.preventDefault();
    placeValue(numericValue);
    return;
  }
  const actions = {
    ArrowUp: () => moveSelection(-1, 0),
    ArrowDown: () => moveSelection(1, 0),
    ArrowLeft: () => moveSelection(0, -1),
    ArrowRight: () => moveSelection(0, 1),
    Backspace: eraseSelected,
    Delete: eraseSelected,
    n: toggleNotes,
    N: toggleNotes,
    s: openSettings,
    S: openSettings,
    h: giveHint,
    H: giveHint,
  };
  if (actions[event.key]) {
    event.preventDefault();
    actions[event.key]();
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.install.hidden = false;
});

elements.install.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.install.hidden = true;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  elements.install.hidden = true;
  setMessage("应用已安装，可离线使用");
});

window.addEventListener("pagehide", saveGame);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

if (!state.puzzle.length || state.completed) {
  newGame();
} else {
  renderAll();
  setMessage("已恢复上次进度");
}

clearInterval(timerId);
timerId = window.setInterval(renderStatus, 1000);
