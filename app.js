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
  checks: {},
  tasks: {},
  notes: {},
  notified: {},
  hideCompletedHabits: false
};

let state = loadState();
let selectedDate = startOfDay(new Date());
let calendarDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
let editingHabitId = null;
let editingTaskId = null;
let selectedColor = COLORS[0];
let editingScheduleMonth = null;
let selectedScheduleDays = new Set();

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
    if (saved?.habits && saved?.checks) return migrateState(saved);
  } catch (_) {}
  const migrated = migrateState(defaultState);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  return migrated;
}

function migrateState(saved) {
  return {
    ...saved,
    habits: (saved.habits || []).map(habit => ({
      ...habit,
      schedules: habit.schedules && typeof habit.schedules === "object" ? habit.schedules : {}
    })),
    checks: saved.checks || {},
    tasks: saved.tasks || {},
    notes: saved.notes || {},
    notified: saved.notified || {},
    hideCompletedHabits: Boolean(saved.hideCompletedHabits)
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function allDaysForMonth(date) {
  return Array.from({ length: daysInMonth(date) }, (_, index) => index + 1);
}

function isHabitCreatedOn(habit, date) {
  return !habit.createdAt || habit.createdAt <= dateKey(date);
}

function previousMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function normalizeSchedule(habit, date, persist = true) {
  habit.schedules ||= {};
  const key = monthKey(date);
  const max = daysInMonth(date);
  if (Array.isArray(habit.schedules[key])) {
    const clean = [...new Set(habit.schedules[key].map(Number).filter(day => day >= 1 && day <= max))].sort((a, b) => a - b);
    habit.schedules[key] = clean;
    return clean;
  }
  const prevDate = previousMonth(date);
  const prevKey = monthKey(prevDate);
  let days;
  if (Array.isArray(habit.schedules[prevKey])) {
    const selectedWeekdays = new Set(habit.schedules[prevKey].map(day => new Date(prevDate.getFullYear(), prevDate.getMonth(), day).getDay()));
    days = allDaysForMonth(date).filter(day => selectedWeekdays.has(new Date(date.getFullYear(), date.getMonth(), day).getDay()));
  } else {
    days = allDaysForMonth(date);
  }
  if (persist) habit.schedules[key] = days;
  return days;
}

function ensureMonthSchedule(habit, date) {
  const days = normalizeSchedule(habit, date, true);
  saveState();
  return days;
}

function isHabitScheduledOn(habit, date, persist = false) {
  return isHabitCreatedOn(habit, date) && normalizeSchedule(habit, date, persist).includes(date.getDate());
}

function getScheduledHabits(date, persist = false) {
  return state.habits.filter(habit => isHabitScheduledOn(habit, date, persist));
}

function getPlannedDatesInMonth(habit, date, throughDay = daysInMonth(date), persist = false) {
  return normalizeSchedule(habit, date, persist)
    .filter(day => day <= throughDay)
    .map(day => new Date(date.getFullYear(), date.getMonth(), day))
    .filter(dayDate => isHabitCreatedOn(habit, dayDate));
}

function getPreviousPlannedDate(habit, date) {
  let cursor = addDays(startOfDay(date), -1);
  for (let guard = 0; guard < 3700; guard++) {
    if (isHabitCreatedOn(habit, cursor) && isHabitScheduledOn(habit, cursor)) return cursor;
    if (habit.createdAt && dateKey(cursor) < habit.createdAt) return null;
    cursor = addDays(cursor, -1);
  }
  return null;
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

function getTasks(date = selectedDate) {
  return state.tasks[dateKey(date)] || [];
}

function saveTasks(date, tasks) {
  const key = dateKey(date);
  if (tasks.length) state.tasks[key] = tasks;
  else delete state.tasks[key];
  saveState();
}

function toggleTask(taskId) {
  const tasks = getTasks().map(task => task.id === taskId ? { ...task, done: !task.done } : task);
  saveTasks(selectedDate, tasks);
  renderToday();
  navigator.vibrate?.(20);
}

function getHabitMonthStats(habit, date, throughDay = daysInMonth(date), persist = false) {
  const plannedDates = getPlannedDatesInMonth(habit, date, throughDay, persist);
  const done = plannedDates.filter(dayDate => isCheckedAt(habit.id, dayDate)).length;
  return { done, planned: plannedDates.length, percent: plannedDates.length ? Math.round(done / plannedDates.length * 100) : 0 };
}

function getStreak(habitId, fromDate = new Date()) {
  const habit = state.habits.find(item => item.id === habitId);
  if (!habit) return 0;
  let cursor = startOfDay(fromDate);
  if (!isHabitScheduledOn(habit, cursor) || !isCheckedAt(habitId, cursor)) cursor = getPreviousPlannedDate(habit, cursor);
  let streak = 0;
  while (cursor && isCheckedAt(habitId, cursor)) {
    streak += 1;
    cursor = getPreviousPlannedDate(habit, cursor);
  }
  return streak;
}

function getBestStreak(habitId) {
  const habit = state.habits.find(item => item.id === habitId);
  if (!habit) return 0;
  const today = startOfDay(new Date());
  let cursor = habit.createdAt ? new Date(`${habit.createdAt}T00:00:00`) : today;
  let best = 0;
  let current = 0;
  while (cursor <= today) {
    if (isHabitScheduledOn(habit, cursor)) {
      if (isCheckedAt(habitId, cursor)) {
        current += 1;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    }
    cursor = addDays(cursor, 1);
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
  state.habits.forEach(habit => ensureMonthSchedule(habit, selectedDate));
  const checks = state.checks[dateKey(selectedDate)] || [];
  const scheduledHabits = getScheduledHabits(selectedDate).sort((a, b) => {
    const aDone = checks.includes(a.id);
    const bDone = checks.includes(b.id);
    if (aDone === bDone) return 0;
    return aDone ? 1 : -1;
  });
  const done = scheduledHabits.filter(habit => checks.includes(habit.id)).length;
  const percent = scheduledHabits.length ? Math.round(done / scheduledHabits.length * 100) : 0;
  const visibleHabits = state.hideCompletedHabits ? scheduledHabits.filter(habit => !checks.includes(habit.id)) : scheduledHabits;
  const today = dateKey(selectedDate) === dateKey(new Date());
  $("#selectedDateTitle").textContent = today ? "Сегодня" : `${selectedDate.getDate()} ${MONTHS_GENITIVE[selectedDate.getMonth()]}`;
  $("#summaryText").textContent = `${done} из ${scheduledHabits.length}`;
  $("#progressPercent").textContent = `${percent}%`;
  $("#progressRing").style.setProperty("--progress", `${percent * 3.6}deg`);
  $("#habitList").innerHTML = visibleHabits.length ? visibleHabits.map(habit => {
    const doneToday = checks.includes(habit.id);
    const monthStats = getHabitMonthStats(habit, selectedDate, selectedDate.getDate());
    return `<article class="habit-card ${doneToday ? "done" : ""}" style="--habit-color:${habit.color}">
      <button class="check-button" data-toggle="${habit.id}" aria-label="Отметить ${escapeHtml(habit.name)}">✓</button>
      <div><h3>${escapeHtml(habit.name)}</h3><div class="habit-meta"><span>Серия: ${getStreak(habit.id, selectedDate)} дней</span><span>${monthStats.done} / ${monthStats.planned} запланированных</span></div></div>
      <span class="mini-progress">${monthStats.percent}%</span>
    </article>`;
  }).join("") : `<div class="empty-state">${scheduledHabits.length ? "Все запланированные привычки выполнены" : (state.habits.length ? "На эту дату привычки не запланированы" : "Добавьте первую привычку кнопкой «+»")}</div>`;
  $$("[data-toggle]").forEach(button => button.addEventListener("click", () => toggleHabit(button.dataset.toggle)));
  renderTasks();
  renderNote();
}

function renderTasks() {
  const tasks = getTasks().sort((a, b) => {
  if (a.done === b.done) return 0;
  return a.done ? 1 : -1;
});
  $("#taskList").innerHTML = tasks.length ? tasks.map(task => `
    <article class="task-card ${task.done ? "done" : ""}">
      <button class="task-check" data-task-toggle="${task.id}" aria-label="${task.done ? "Вернуть" : "Выполнить"} ${escapeHtml(task.name)}">✓</button>
      <div class="task-content">
        <strong class="task-name">${escapeHtml(task.name)}</strong>
        ${task.reminderEnabled ? `<span class="task-reminder">Напоминание в ${escapeHtml(task.reminderTime || "09:00")}</span>` : ""}
      </div>
      <button class="task-edit" data-task-edit="${task.id}" aria-label="Изменить ${escapeHtml(task.name)}">•••</button>
    </article>
  `).join("") : `<div class="empty-state compact">На этот день важных дел нет</div>`;
  $$("[data-task-toggle]").forEach(button => button.addEventListener("click", () => toggleTask(button.dataset.taskToggle)));
  $$("[data-task-edit]").forEach(button => button.addEventListener("click", () => openTaskDialog(button.dataset.taskEdit)));
}

function renderNote() {
  const key = dateKey(selectedDate);
  if ($("#dayNote").dataset.date !== key) {
    $("#dayNote").value = state.notes[key] || "";
    $("#dayNote").dataset.date = key;
    $("#noteSaveStatus").textContent = "";
  }
}

function renderCalendar() {
  $("#calendarMonth").textContent = MONTHS[calendarDate.getMonth()];
  $("#calendarYear").textContent = calendarDate.getFullYear();
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  state.habits.forEach(habit => ensureMonthSchedule(habit, calendarDate));
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstDayOffset);
  const todayKey = dateKey(new Date());
  $("#calendarGrid").innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const key = dateKey(date);
    const scheduledHabits = getScheduledHabits(date, date.getFullYear() === year && date.getMonth() === month);
    const done = state.checks[key]?.filter(id => scheduledHabits.some(h => h.id === id)).length || 0;
    const progress = scheduledHabits.length ? done / scheduledHabits.length * 100 : 0;
    return `<button class="calendar-day ${date.getMonth() !== month ? "outside" : ""} ${key === todayKey ? "today" : ""} ${key === dateKey(selectedDate) ? "selected" : ""}" data-calendar-date="${key}">
      ${date.getDate()}<span class="day-progress"><i style="width:${progress}%"></i></span>
    </button>`;
  }).join("");
  $$("[data-calendar-date]").forEach(button => button.addEventListener("click", () => {
    selectedDate = new Date(`${button.dataset.calendarDate}T00:00:00`);
    calendarDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    renderToday();
    switchScreen("today");
  }));
  let possible = 0;
  let done = 0;
  const totalDays = daysInMonth(calendarDate);
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day);
    const key = dateKey(date);
    const scheduledHabits = getScheduledHabits(date);
    possible += scheduledHabits.length;
    done += state.checks[key]?.filter(id => scheduledHabits.some(h => h.id === id)).length || 0;
  }
  $("#monthPercent").textContent = `${possible ? Math.round(done / possible * 100) : 0}%`;
  $("#monthDone").textContent = done;
  $("#bestStreak").textContent = Math.max(0, ...state.habits.map(habit => getBestStreak(habit.id)));
}

function renderManage() {
  $("#manageList").innerHTML = state.habits.length ? state.habits.map(habit =>
    `<article class="manage-card" style="--habit-color:${habit.color}">
      <button class="manage-card-main" data-edit="${habit.id}" aria-label="Изменить ${escapeHtml(habit.name)}">
        <span class="color-mark"></span>
        <div><h3>${escapeHtml(habit.name)}</h3><span class="muted">Цель: ${habit.goal} дней${habit.reminderEnabled ? ` · напомнить в ${escapeHtml(habit.reminderTime || "20:00")}` : ""}</span></div>
        <span class="edit-mark">›</span>
      </button>
      <button class="inline-delete" data-delete-habit="${habit.id}" aria-label="Удалить ${escapeHtml(habit.name)}">×</button>
    </article>`
  ).join("") : `<div class="empty-state">Список пока пуст</div>`;
  $$("[data-edit]").forEach(button => button.addEventListener("click", () => openHabitDialog(button.dataset.edit)));
  $$("[data-delete-habit]").forEach(button => button.addEventListener("click", () => deleteHabit(button.dataset.deleteHabit)));
}

function renderStats() {
  const today = startOfDay(new Date());
  let totalDone = 0;
  let totalPlanned = 0;
  const habitStats = state.habits.map(habit => {
    let cursor = habit.createdAt ? new Date(`${habit.createdAt}T00:00:00`) : today;
    let done = 0;
    let planned = 0;
    while (cursor <= today) {
      if (isHabitScheduledOn(habit, cursor)) {
        planned += 1;
        if (isCheckedAt(habit.id, cursor)) done += 1;
      }
      cursor = addDays(cursor, 1);
    }
    totalDone += done;
    totalPlanned += planned;
    return { habit, done, planned, percent: planned ? Math.round(done / planned * 100) : 0 };
  });
  $("#overallPercent").textContent = `${totalPlanned ? Math.round(totalDone / totalPlanned * 100) : 0}%`;
  $("#statsList").innerHTML = habitStats.length ? habitStats.map(({ habit, done, planned, percent }) => `
    <article class="stat-card" style="--habit-color:${habit.color}">
      <div class="stat-top"><strong>${escapeHtml(habit.name)}</strong><strong>${percent}%</strong></div>
      <div class="bar"><i style="width:${percent}%"></i></div>
      <div class="stat-footer"><span>${done} / ${planned} запланированных</span><span>лучшая серия: ${getBestStreak(habit.id)}</span></div>
    </article>`
  ).join("") : `<div class="empty-state">Статистика появится после добавления привычек</div>`;
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

function renderSchedulePicker() {
  if (!editingScheduleMonth) editingScheduleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const year = editingScheduleMonth.getFullYear();
  const month = editingScheduleMonth.getMonth();
  $("#scheduleMonthTitle").textContent = `${MONTHS[month][0].toUpperCase()}${MONTHS[month].slice(1)} ${year}`;
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const blanks = Array.from({ length: offset }, () => `<span class="schedule-blank"></span>`).join("");
  const days = allDaysForMonth(editingScheduleMonth).map(day => `<button type="button" class="schedule-day ${selectedScheduleDays.has(day) ? "selected" : ""}" data-schedule-day="${day}">${day}</button>`).join("");
  $("#scheduleGrid").innerHTML = blanks + days;
  $("#scheduleCount").textContent = `Выбрано дней: ${selectedScheduleDays.size}`;
  $$("[data-schedule-day]").forEach(button => button.addEventListener("click", () => {
    const day = Number(button.dataset.scheduleDay);
    selectedScheduleDays.has(day) ? selectedScheduleDays.delete(day) : selectedScheduleDays.add(day);
    renderSchedulePicker();
  }));
}

function setScheduleDays(days) {
  selectedScheduleDays = new Set(days);
  renderSchedulePicker();
}

function scheduleForFormHabit(habit) {
  const draft = habit || { schedules: {} };
  const days = normalizeSchedule(draft, editingScheduleMonth, Boolean(habit));
  return new Set(days);
}

function openHabitDialog(id = null) {
  editingHabitId = id;
  const habit = state.habits.find(item => item.id === id);
  $("#dialogEyebrow").textContent = habit ? "РЕДАКТИРОВАНИЕ" : "НОВАЯ ПРИВЫЧКА";
  $("#dialogTitle").textContent = habit ? "Изменить привычку" : "Добавить привычку";
  $("#habitName").value = habit?.name || "";
  $("#habitGoal").value = habit?.goal || 20;
  $("#habitReminderEnabled").checked = Boolean(habit?.reminderEnabled);
  $("#habitReminderTime").value = habit?.reminderTime || "20:00";
  $("#habitReminderTimeRow").classList.toggle("hidden", !habit?.reminderEnabled);
  editingScheduleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  selectedScheduleDays = scheduleForFormHabit(habit);
  renderSchedulePicker();
  selectedColor = habit?.color || COLORS[0];
  $("#deleteHabitButton").classList.toggle("hidden", !habit);
  renderColors();
  $("#habitDialog").showModal();
  setTimeout(() => $("#habitName").focus(), 100);
}

function openTaskDialog(id = null) {
  editingTaskId = id;
  const task = getTasks().find(item => item.id === id);
  $("#taskDialogEyebrow").textContent = task ? "РЕДАКТИРОВАНИЕ" : "ВАЖНОЕ ДЕЛО";
  $("#taskDialogTitle").textContent = task ? "Изменить дело" : "Добавить дело";
  $("#taskName").value = task?.name || "";
  $("#taskReminderEnabled").checked = Boolean(task?.reminderEnabled);
  $("#taskReminderTime").value = task?.reminderTime || "09:00";
  $("#taskReminderTimeRow").classList.toggle("hidden", !task?.reminderEnabled);
  $("#deleteTaskButton").classList.toggle("hidden", !task);
  $("#taskDialog").showModal();
  setTimeout(() => $("#taskName").focus(), 100);
}

function deleteHabit(id) {
  const habit = state.habits.find(item => item.id === id);
  if (!habit || !confirm(`Удалить привычку «${habit.name}» и все её отметки?`)) return;
  state.habits = state.habits.filter(item => item.id !== id);
  for (const key of Object.keys(state.checks)) {
    state.checks[key] = state.checks[key].filter(itemId => itemId !== id);
    if (!state.checks[key].length) delete state.checks[key];
  }
  saveState();
  if ($("#habitDialog").open) $("#habitDialog").close();
  renderAll();
  showToast("Привычка удалена");
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

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    showToast("Уведомления не поддерживаются этим браузером");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    showToast("Разрешите уведомления в настройках браузера");
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") showToast("Уведомления не разрешены");
  return permission === "granted";
}

async function showReminder(title, body, tag) {
  if (Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker?.ready;
  if (registration) {
    registration.showNotification(title, { body, tag, icon: "icon.svg", badge: "icon.svg" });
  } else {
    new Notification(title, { body, tag, icon: "icon.svg" });
  }
}

function checkReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const key = dateKey(now);
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  let changed = false;

  getScheduledHabits(now).forEach(habit => {
    const reminderKey = `${key}:habit:${habit.id}:${habit.reminderTime}`;
    if (habit.reminderEnabled && habit.reminderTime === currentTime && !isCheckedAt(habit.id, now) && !state.notified[reminderKey]) {
      showReminder("Пора вернуться в ритм", habit.name, reminderKey);
      state.notified[reminderKey] = true;
      changed = true;
    }
  });

  (state.tasks[key] || []).forEach(task => {
    const reminderKey = `${key}:task:${task.id}:${task.reminderTime}`;
    if (task.reminderEnabled && task.reminderTime === currentTime && !task.done && !state.notified[reminderKey]) {
      showReminder("Важное дело", task.name, reminderKey);
      state.notified[reminderKey] = true;
      changed = true;
    }
  });

  if (changed) saveState();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function isValidBackup(value) {
  return Boolean(value && Array.isArray(value.habits) && value.checks && typeof value.checks === "object" &&
    value.habits.every(habit => typeof habit.id === "string" && typeof habit.name === "string" &&
      Number.isFinite(Number(habit.goal)) && typeof habit.color === "string" &&
      (!habit.schedules || typeof habit.schedules === "object")) &&
    Object.values(value.checks).every(ids => Array.isArray(ids) && ids.every(id => typeof id === "string")));
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ritm-backup-${dateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Резервная копия создана");
}

async function importData(file) {
  try {
    const backup = JSON.parse(await file.text());
    if (!isValidBackup(backup)) throw new Error("invalid backup");
    state = migrateState({
      habits: backup.habits.map(habit => ({
        ...habit,
        goal: Math.max(1, Math.min(31, Number(habit.goal))),
        createdAt: habit.createdAt || dateKey(new Date())
      })),
      checks: backup.checks,
      tasks: backup.tasks && typeof backup.tasks === "object" ? backup.tasks : {},
      notes: backup.notes && typeof backup.notes === "object" ? backup.notes : {},
      notified: {},
      hideCompletedHabits: Boolean(backup.hideCompletedHabits)
    });
    saveState();
    renderAll();
    showToast("Данные восстановлены");
  } catch (_) {
    showToast("Не удалось прочитать резервную копию");
  }
}

$("#addHabitButton").addEventListener("click", () => openHabitDialog());
$("#addTaskButton").addEventListener("click", () => openTaskDialog());
$("#habitReminderEnabled").addEventListener("change", event => {
  $("#habitReminderTimeRow").classList.toggle("hidden", !event.target.checked);
  if (event.target.checked) requestNotificationPermission();
});
$("#taskReminderEnabled").addEventListener("change", event => {
  $("#taskReminderTimeRow").classList.toggle("hidden", !event.target.checked);
  if (event.target.checked) requestNotificationPermission();
});
$("#fillScheduleButton").addEventListener("click", () => setScheduleDays(allDaysForMonth(editingScheduleMonth || selectedDate)));
$("#clearScheduleButton").addEventListener("click", () => setScheduleDays([]));
$("#exportDataButton").addEventListener("click", exportData);
$("#importDataButton").addEventListener("click", () => $("#importDataInput").click());
$("#importDataInput").addEventListener("change", event => {
  const [file] = event.target.files;
  if (file && confirm("Заменить текущие привычки и отметки данными из резервной копии?")) importData(file);
  event.target.value = "";
});
$("#habitForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#habitName").value.trim();
  const goal = Math.max(1, Math.min(31, Number($("#habitGoal").value)));
  const reminderEnabled = $("#habitReminderEnabled").checked;
  const reminderTime = $("#habitReminderTime").value || "20:00";
  if (!name) return;
  const scheduleKey = monthKey(editingScheduleMonth || selectedDate);
  const scheduleDays = [...selectedScheduleDays].sort((a, b) => a - b);
  if (editingHabitId) {
    const habit = state.habits.find(item => item.id === editingHabitId);
    Object.assign(habit, { name, goal, color: selectedColor, reminderEnabled, reminderTime });
    habit.schedules ||= {};
    habit.schedules[scheduleKey] = scheduleDays;
    showToast("Привычка изменена");
  } else {
    state.habits.push({ id: crypto.randomUUID(), name, goal, color: selectedColor, createdAt: dateKey(new Date()), reminderEnabled, reminderTime, schedules: { [scheduleKey]: scheduleDays } });
    showToast("Привычка добавлена");
  }
  saveState();
  $("#habitDialog").close();
  renderAll();
});

$("#deleteHabitButton").addEventListener("click", () => {
  if (editingHabitId) deleteHabit(editingHabitId);
});

$("#taskForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#taskName").value.trim();
  if (!name) return;
  const reminderEnabled = $("#taskReminderEnabled").checked;
  const reminderTime = $("#taskReminderTime").value || "09:00";
  const tasks = getTasks();
  if (editingTaskId) {
    const task = tasks.find(item => item.id === editingTaskId);
    Object.assign(task, { name, reminderEnabled, reminderTime });
    showToast("Дело изменено");
  } else {
    tasks.push({ id: crypto.randomUUID(), name, done: false, reminderEnabled, reminderTime });
    showToast("Дело добавлено");
  }
  saveTasks(selectedDate, tasks);
  $("#taskDialog").close();
  renderToday();
});

$("#deleteTaskButton").addEventListener("click", () => {
  const task = getTasks().find(item => item.id === editingTaskId);
  if (!task || !confirm(`Удалить дело «${task.name}»?`)) return;
  saveTasks(selectedDate, getTasks().filter(item => item.id !== editingTaskId));
  $("#taskDialog").close();
  renderToday();
  showToast("Дело удалено");
});

$("#dayNote").addEventListener("input", event => {
  const key = event.target.dataset.date || dateKey(selectedDate);
  const text = event.target.value;
  clearTimeout($("#dayNote").saveTimer);
  $("#noteSaveStatus").textContent = "Сохранение...";
  $("#dayNote").saveTimer = setTimeout(() => {
    if (text.trim()) state.notes[key] = text;
    else delete state.notes[key];
    saveState();
    $("#noteSaveStatus").textContent = "Сохранено";
  }, 350);
});

$$('.close-button').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  button.closest('dialog')?.close();
}));
$$(".nav-item").forEach(button => button.addEventListener("click", () => switchScreen(button.dataset.screen)));
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
$("#hideCompletedHabits").checked = state.hideCompletedHabits;

$("#hideCompletedHabits").addEventListener("change", event => {
  state.hideCompletedHabits = event.target.checked;
  saveState();
  renderToday();
});

renderAll();

if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("service-worker.js"));

setInterval(checkReminders, 30000);
window.addEventListener("focus", checkReminders);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkReminders();
});
checkReminders();





