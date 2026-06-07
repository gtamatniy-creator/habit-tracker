const STORAGE_KEY = "ritm-habit-tracker-v1";
const COLORS = ["#70e1a1", "#7db5ff", "#ffb45f", "#d18cff", "#ff7f8f", "#65dce0"];
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

const defaultState = {
  habits: [
    { id: crypto.randomUUID(), name: "Тренировка", goal: 20, color: COLORS[0], createdAt: dateKey(new Date()) },
    { id: crypto.randomUUID(), name: "Чтение", goal: 25, color: COLORS[1], createdAt: dateKey(new Date()) },
    { id: crypto.randomUUID(), name: "Без сахара", goal: 30, color: COLORS[2], createdAt: dateKey(new Date()) }
  ],
  checks: {}
};

let state = loadState();
let selectedDate = startOfDay(new Date());
let calendarDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
let editingHabitId = null;
let selectedColor = COLORS[0];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.habits && saved?.checks) return saved;
  } catch (_) {}
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
  return defaultState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isChecked(habitId, date = selectedDate) {
  return Boolean(state.checks[dateKey(date)]?.includes(habitId));
}

function toggleHabit(habitId, date = selectedDate) {
  const key = dateKey(date);
  const checks = new Set(state.checks[key] || []);
  checks.has(habitId) ? checks.delete(habitId) : checks.add(habitId);
  state.checks[key] = [...checks];
  if (!state.checks[key].length) delete state.checks[key];
  saveState();
  renderAll();
  navigator.vibrate?.(20);
}

function getMonthCount(habitId, date) {
  const prefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return Object.entries(state.checks).reduce((sum, [key, ids]) => sum + (key.startsWith(prefix) && ids.includes(habitId) ? 1 : 0), 0);
}

function getStreak(habitId, fromDate = new Date()) {
  let streak = 0;
  let cursor = startOfDay(fromDate);
  if (!isCheckedAt(habitId, cursor)) cursor = addDays(cursor, -1);
  while (isCheckedAt(habitId, cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function getBestStreak(habitId) {
  const dates = Object.keys(state.checks).filter(key => state.checks[key].includes(habitId)).sort();
  let best = 0;
  let current = 0;
  let previous = null;
  for (const key of dates) {
    const date = new Date(`${key}T00:00:00`);
    current = previous && Math.round((date - previous) / 86400000) === 1 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = date;
  }
  return best;
}

function isCheckedAt(habitId, date) {
  return Boolean(state.checks[dateKey(date)]?.includes(habitId));
}

function renderDateStrip() {
  const mondayIndex = (selectedDate.getDay() + 6) % 7;
  const monday = addDays(selectedDate, -mondayIndex);
  const todayKey = dateKey(new Date());
  $("#dateStrip").innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    const key = dateKey(date);
    return `<button class="date-chip ${key === dateKey(selectedDate) ? "selected" : ""} ${key === todayKey ? "today" : ""}" data-date="${key}">
      <span>${WEEKDAYS[date.getDay()]}</span><strong>${date.getDate()}</strong>
    </button>`;
  }).join("");
  $$(".date-chip").forEach(button => button.addEventListener("click", () => {
    selectedDate = new Date(`${button.dataset.date}T00:00:00`);
    calendarDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    renderAll();
  }));
}

function renderToday() {
  renderDateStrip();
  const checks = state.checks[dateKey(selectedDate)] || [];
  const done = state.habits.filter(habit => checks.includes(habit.id)).length;
  const percent = state.habits.length ? Math.round(done / state.habits.length * 100) : 0;
  const today = dateKey(selectedDate) === dateKey(new Date());
  $("#selectedDateTitle").textContent = today ? "Сегодня" : `${selectedDate.getDate()} ${MONTHS_GENITIVE[selectedDate.getMonth()]}`;
  $("#summaryText").textContent = `${done} из ${state.habits.length}`;
  $("#progressPercent").textContent = `${percent}%`;
  $("#progressRing").style.setProperty("--progress", `${percent * 3.6}deg`);
  $("#habitList").innerHTML = state.habits.length ? state.habits.map(habit => {
    const doneToday = checks.includes(habit.id);
    const monthCount = getMonthCount(habit.id, selectedDate);
    const goalPercent = Math.min(100, Math.round(monthCount / habit.goal * 100));
    return `<article class="habit-card ${doneToday ? "done" : ""}" style="--habit-color:${habit.color}">
      <button class="check-button" data-toggle="${habit.id}" aria-label="Отметить ${escapeHtml(habit.name)}">✓</button>
      <div><h3>${escapeHtml(habit.name)}</h3><div class="habit-meta"><span>Серия ${getStreak(habit.id, selectedDate)} дн.</span><span>${monthCount}/${habit.goal} в месяце</span></div></div>
      <span class="mini-progress">${goalPercent}%</span>
    </article>`;
  }).join("") : `<div class="empty-state">Добавьте первую привычку кнопкой «+»</div>`;
  $$("[data-toggle]").forEach(button => button.addEventListener("click", () => toggleHabit(button.dataset.toggle)));
}

function renderCalendar() {
  $("#calendarMonth").textContent = MONTHS[calendarDate.getMonth()];
  $("#calendarYear").textContent = calendarDate.getFullYear();
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstDayOffset);
  const todayKey = dateKey(new Date());
  $("#calendarGrid").innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const key = dateKey(date);
    const done = state.checks[key]?.filter(id => state.habits.some(h => h.id === id)).length || 0;
    const progress = state.habits.length ? done / state.habits.length * 100 : 0;
    return `<button class="calendar-day ${date.getMonth() !== month ? "outside" : ""} ${key === todayKey ? "today" : ""} ${key === dateKey(selectedDate) ? "selected" : ""}" data-calendar-date="${key}">
      ${date.getDate()}<span class="day-progress"><i style="width:${progress}%"></i></span>
    </button>`;
  }).join("");
  $$("[data-calendar-date]").forEach(button => button.addEventListener("click", () => {
    selectedDate = new Date(`${button.dataset.calendarDate}T00:00:00`);
    calendarDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    switchScreen("today");
  }));

  let possible = 0;
  let done = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day));
    possible += state.habits.length;
    done += state.checks[key]?.filter(id => state.habits.some(h => h.id === id)).length || 0;
  }
  $("#monthPercent").textContent = `${possible ? Math.round(done / possible * 100) : 0}%`;
  $("#monthDone").textContent = done;
  $("#bestStreak").textContent = Math.max(0, ...state.habits.map(habit => getBestStreak(habit.id)));
}

function renderManage() {
  $("#manageList").innerHTML = state.habits.length ? state.habits.map(habit =>
    `<button class="manage-card" data-edit="${habit.id}" style="--habit-color:${habit.color}">
      <span class="color-mark"></span>
      <div><h3>${escapeHtml(habit.name)}</h3><span class="muted">Цель: ${habit.goal} дней в месяц</span></div>
      <span class="edit-mark">›</span>
    </button>`
  ).join("") : `<div class="empty-state">Список пока пуст</div>`;
  $$("[data-edit]").forEach(button => button.addEventListener("click", () => openHabitDialog(button.dataset.edit)));
}

function renderStats() {
  const totalDone = Object.values(state.checks).reduce((sum, ids) => sum + ids.filter(id => state.habits.some(h => h.id === id)).length, 0);
  const firstDate = Object.keys(state.checks).sort()[0];
  const trackedDays = firstDate ? Math.max(1, Math.floor((startOfDay(new Date()) - new Date(`${firstDate}T00:00:00`)) / 86400000) + 1) : 1;
  const possible = trackedDays * state.habits.length;
  $("#overallPercent").textContent = `${possible ? Math.min(100, Math.round(totalDone / possible * 100)) : 0}%`;
  $("#statsList").innerHTML = state.habits.length ? state.habits.map(habit => {
    const count = Object.values(state.checks).filter(ids => ids.includes(habit.id)).length;
    const percent = Math.min(100, Math.round(count / trackedDays * 100));
    return `<article class="stat-card" style="--habit-color:${habit.color}">
      <div class="stat-top"><strong>${escapeHtml(habit.name)}</strong><strong>${percent}%</strong></div>
      <div class="bar"><i style="width:${percent}%"></i></div>
      <div class="stat-footer"><span>${count} выполнений</span><span>лучшая серия: ${getBestStreak(habit.id)}</span></div>
    </article>`;
  }).join("") : `<div class="empty-state">Статистика появится после добавления привычек</div>`;
}

function renderAll() {
  renderToday();
  renderCalendar();
  renderManage();
  renderStats();
}

function renderColors() {
  $("#colorOptions").innerHTML = COLORS.map(color =>
    `<button type="button" class="color-option ${color === selectedColor ? "selected" : ""}" style="--color:${color}" data-color="${color}" aria-label="Выбрать цвет"></button>`
  ).join("");
  $$("[data-color]").forEach(button => button.addEventListener("click", () => {
    selectedColor = button.dataset.color;
    renderColors();
  }));
}

function openHabitDialog(id = null) {
  editingHabitId = id;
  const habit = state.habits.find(item => item.id === id);
  $("#dialogEyebrow").textContent = habit ? "РЕДАКТИРОВАНИЕ" : "НОВАЯ ПРИВЫЧКА";
  $("#dialogTitle").textContent = habit ? "Изменить привычку" : "Добавить привычку";
  $("#habitName").value = habit?.name || "";
  $("#habitGoal").value = habit?.goal || 20;
  selectedColor = habit?.color || COLORS[0];
  $("#deleteHabitButton").classList.toggle("hidden", !habit);
  renderColors();
  $("#habitDialog").showModal();
  setTimeout(() => $("#habitName").focus(), 100);
}

function switchScreen(screen) {
  $$(".screen").forEach(item => item.classList.toggle("active", item.id === `${screen}Screen`));
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.screen === screen));
  const titles = { today: "Сегодня", calendar: "Календарь", habits: "Привычки", stats: "Статистика" };
  $("#screenTitle").textContent = titles[screen];
}

function showToast(text) {
  const toast = $("#toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

$("#addHabitButton").addEventListener("click", () => openHabitDialog());
$("#habitForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#habitName").value.trim();
  const goal = Math.max(1, Math.min(31, Number($("#habitGoal").value)));
  if (!name) return;
  if (editingHabitId) {
    const habit = state.habits.find(item => item.id === editingHabitId);
    Object.assign(habit, { name, goal, color: selectedColor });
    showToast("Привычка изменена для всех дат");
  } else {
    state.habits.push({ id: crypto.randomUUID(), name, goal, color: selectedColor, createdAt: dateKey(new Date()) });
    showToast("Привычка добавлена");
  }
  saveState();
  $("#habitDialog").close();
  renderAll();
});

$("#deleteHabitButton").addEventListener("click", () => {
  if (!editingHabitId || !confirm("Удалить привычку и все её отметки?")) return;
  state.habits = state.habits.filter(habit => habit.id !== editingHabitId);
  for (const key of Object.keys(state.checks)) {
    state.checks[key] = state.checks[key].filter(id => id !== editingHabitId);
    if (!state.checks[key].length) delete state.checks[key];
  }
  saveState();
  $("#habitDialog").close();
  renderAll();
  showToast("Привычка удалена");
});

$$(".nav-item").forEach(button => button.addEventListener("click", () => switchScreen(button.dataset.screen)));
$("#jumpTodayButton").addEventListener("click", () => {
  selectedDate = startOfDay(new Date());
  calendarDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  renderAll();
});
$("#previousMonth").addEventListener("click", () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
  renderCalendar();
});
$("#nextMonth").addEventListener("click", () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
  renderCalendar();
});

MONTHS.forEach((month, index) => $("#monthSelect").add(new Option(month[0].toUpperCase() + month.slice(1), index)));
for (let year = new Date().getFullYear() - 5; year <= new Date().getFullYear() + 10; year++) {
  $("#yearSelect").add(new Option(year, year));
}
$("#monthPickerButton").addEventListener("click", () => {
  $("#monthSelect").value = calendarDate.getMonth();
  $("#yearSelect").value = calendarDate.getFullYear();
  $("#monthDialog").showModal();
});
$("#applyMonth").addEventListener("click", event => {
  event.preventDefault();
  calendarDate = new Date(Number($("#yearSelect").value), Number($("#monthSelect").value), 1);
  $("#monthDialog").close();
  renderCalendar();
});

renderAll();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
