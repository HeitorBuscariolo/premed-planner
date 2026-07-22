import { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap,
  Activity,
  Clock,
  CalendarDays,
  Plus,
  AlertTriangle,
  X,
  ClipboardList,
  FlaskConical,
  BookOpen,
  Trash2,
  CalendarClock,
  CalendarPlus,
  LogIn,
  Unplug,
  RefreshCw,
  Calculator,
  Brain,
  LogOut,
  Pencil,
  Search,
  Bell,
  BellOff,
  Stethoscope,
  TrendingUp,
  Upload,
  FileText,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import { upsertCalendarEvent } from './lib/googleCalendar';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID);
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const PRIORITIES = ['URGENT', 'SOON', 'WHENEVER'];

const PRIORITY_STYLE = {
  URGENT: {
    text: 'var(--urgent)',
    bg: 'var(--urgent-bg)',
    border: 'var(--urgent)',
    label: 'Urgent',
  },
  SOON: {
    text: 'var(--soon)',
    bg: 'var(--soon-bg)',
    border: 'var(--soon)',
    label: 'Soon',
  },
  WHENEVER: {
    text: 'var(--whenever)',
    bg: 'var(--whenever-bg)',
    border: 'var(--whenever)',
    label: 'Whenever',
  },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function weekdayLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
  });
}

function monthDayLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const TODAY = todayISO();

const NOTIF_ENABLED_KEY = 'premed-notifications-enabled';
const NOTIF_LAST_DATE_KEY = 'premed-notifications-last-date';

function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

const COLOR_PALETTE = [
  '#9333ea',
  '#0891b2',
  '#c026d3',
  '#4f46e5',
  '#0ea5e9',
  '#ca8a04',
  '#db2777',
  '#65a30d',
];

function nextPaletteColor(existingCourses) {
  const used = new Set(existingCourses.map((c) => c.color));
  return COLOR_PALETTE.find((c) => !used.has(c)) ?? COLOR_PALETTE[0];
}

function priorityForWeight(weight) {
  if (weight >= 30) return 'URGENT';
  if (weight >= 15) return 'SOON';
  return 'WHENEVER';
}

function hoursForWeight(weight) {
  return Math.max(1, Math.round(weight / 10));
}

function gpaPointsForPercent(percent) {
  if (percent >= 93) return 4.0;
  if (percent >= 90) return 3.7;
  if (percent >= 87) return 3.3;
  if (percent >= 83) return 3.0;
  if (percent >= 80) return 2.7;
  if (percent >= 77) return 2.3;
  if (percent >= 73) return 2.0;
  if (percent >= 70) return 1.7;
  if (percent >= 67) return 1.3;
  if (percent >= 63) return 1.0;
  if (percent >= 60) return 0.7;
  return 0.0;
}

function recordedGradeForComponents(components) {
  const graded = components.filter((c) => c.score !== null && c.score !== undefined);
  const gradedWeight = graded.reduce((sum, c) => sum + c.weight, 0);
  if (gradedWeight === 0) return null;
  const weightedSum = graded.reduce((sum, c) => sum + (c.weight * c.score) / 100, 0);
  return (weightedSum / gradedWeight) * 100;
}

const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

function nextReviewDateForBox(boxLevel) {
  const clamped = Math.min(boxLevel, REVIEW_INTERVALS.length - 1);
  return addDays(TODAY, REVIEW_INTERVALS[clamped]);
}

const REVERSE_PLAN_MILESTONES = [
  { label: '3-week review', days: 21, priority: 'WHENEVER', hours: 1.5 },
  { label: '2-week review', days: 14, priority: 'SOON', hours: 2 },
  { label: '1-week review', days: 7, priority: 'URGENT', hours: 2.5 },
];

function buildReversePlanRows(exam, userId) {
  return REVERSE_PLAN_MILESTONES.map((m) => ({
    title: `${exam.name} — ${m.label}`,
    course_id: exam.courseId,
    priority: m.priority,
    time: '09:00',
    date: addDays(exam.date, -m.days),
    hours: m.hours,
    done: false,
    linked_exam_id: exam.id,
    user_id: userId,
  })).filter((row) => row.date >= TODAY);
}

const CHAPTER_STUDY_HOURS = 1.5;

function buildChapterPlanRows(exam, chapterRows, hoursPerDay, userId) {
  const numDays = Math.max(1, daysUntil(exam.date));
  const days = Array.from({ length: numDays }, (_, i) => addDays(TODAY, i));
  const budget = Number(hoursPerDay) || CHAPTER_STUDY_HOURS;

  let dayIndex = 0;
  let hoursUsedToday = 0;

  return chapterRows.map((chapter) => {
    if (
      hoursUsedToday + CHAPTER_STUDY_HOURS > budget &&
      hoursUsedToday > 0 &&
      dayIndex < days.length - 1
    ) {
      dayIndex += 1;
      hoursUsedToday = 0;
    }
    const date = days[Math.min(dayIndex, days.length - 1)];
    const daysLeft = numDays - dayIndex;
    const priority = daysLeft <= 2 ? 'URGENT' : daysLeft <= 5 ? 'SOON' : 'WHENEVER';
    hoursUsedToday += CHAPTER_STUDY_HOURS;

    return {
      title: `Study: ${chapter.name}`,
      course_id: exam.courseId,
      priority,
      time: '18:00',
      date,
      hours: CHAPTER_STUDY_HOURS,
      done: false,
      linked_exam_id: exam.id,
      linked_chapter_id: chapter.id,
      user_id: userId,
    };
  });
}

// --- Small presentational helpers ------------------------------------------

function ClipHeader({ icon: Icon, title, accent, children }) {
  return (
    <div className="relative">
      <div
        className="absolute -top-2.5 left-5 h-1.5 w-14 rounded-full"
        style={{ background: accent }}
      />
      <div className="flex items-center justify-between gap-2 border-b border-[var(--paper-line)] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Icon size={18} style={{ color: accent }} strokeWidth={2} />
          <h2 className="font-mono-chart text-xs font-semibold uppercase tracking-widest text-[var(--ink-soft)]">
            {title}
          </h2>
        </div>
        {children}
      </div>
    </div>
  );
}

function CourseDot({ courses, courseId }) {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return null;
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: course.color }}
      title={course.name}
    />
  );
}

function VitalTile({ label, value, unit, icon: Icon, flag }) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-2xl border border-[var(--paper-line)] bg-white/60 px-4 py-3 shadow-sm shadow-pink-100">
      <Icon
        size={20}
        className="shrink-0"
        style={{ color: flag ? 'var(--urgent)' : 'var(--primary)' }}
      />
      <div className="min-w-0">
        <p className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          {label}
        </p>
        <p className="font-mono-chart text-2xl leading-tight text-[var(--ink)]">
          {value}
          {unit && (
            <span className="ml-1 text-sm text-[var(--ink-soft)]">{unit}</span>
          )}
        </p>
      </div>
    </div>
  );
}

// --- Add task form -----------------------------------------------------------

function AddTaskForm({ courses, onAdd, onClose, defaultDate }) {
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [priority, setPriority] = useState('WHENEVER');
  const [date, setDate] = useState(defaultDate ?? TODAY);
  const [time, setTime] = useState('09:00');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !courseId || !date) return;
    setSaving(true);
    await onAdd({
      title: title.trim(),
      courseId,
      priority,
      time,
      date,
      hours: 1,
      done: false,
    });
    setSaving(false);
    setTitle('');
    setTime('09:00');
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 border-b border-[var(--paper-line)] bg-[var(--paper)] px-5 py-4"
    >
      <div className="flex min-w-[180px] flex-1 flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Task
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Review lipid metabolism"
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Course
        </label>
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Priority
        </label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_STYLE[p].label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Time
        </label>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <Plus size={15} /> {saving ? 'Saving…' : 'Add task'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-2 py-1.5 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Cancel
      </button>
    </form>
  );
}

// --- Course intake form -------------------------------------------------------

function emptyComponent() {
  return {
    key: Math.random().toString(36).slice(2),
    name: '',
    weight: '',
    dueDate: '',
    isExam: false,
  };
}

function CourseIntakeForm({ existingCourses, onSubmit, onClose }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => nextPaletteColor(existingCourses));
  const [credits, setCredits] = useState(3);
  const [components, setComponents] = useState(() => [
    emptyComponent(),
    emptyComponent(),
  ]);
  const [saving, setSaving] = useState(false);

  const totalWeight = components.reduce(
    (sum, c) => sum + (Number(c.weight) || 0),
    0,
  );

  function updateComponent(key, field, value) {
    setComponents((prev) =>
      prev.map((c) => (c.key === key ? { ...c, [field]: value } : c)),
    );
  }

  function addRow() {
    setComponents((prev) => [...prev, emptyComponent()]);
  }

  function removeRow(key) {
    setComponents((prev) =>
      prev.length > 1 ? prev.filter((c) => c.key !== key) : prev,
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const validComponents = components.filter((c) => c.name.trim());
    if (validComponents.length === 0) return;
    setSaving(true);
    await onSubmit({ name: name.trim(), color, credits: Number(credits) || 3 }, validComponents);
    setSaving(false);
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 border-b border-[var(--paper-line)] bg-[var(--paper)] px-5 py-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Course name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cell Biology"
            className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Color
          </label>
          <div className="flex gap-1">
            {COLOR_PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                className="h-6 w-6 rounded-full border-2"
                style={{
                  background: swatch,
                  borderColor: color === swatch ? 'var(--ink)' : 'transparent',
                }}
                aria-label={swatch}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Credits
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            className="w-16 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Grade weights
          </label>
          <span
            className="font-mono-chart text-[10px] uppercase tracking-wide"
            style={{
              color: totalWeight === 100 ? 'var(--whenever)' : 'var(--soon)',
            }}
          >
            Total: {totalWeight}%
          </span>
        </div>
        {components.map((c) => (
          <div key={c.key} className="flex flex-wrap items-center gap-2">
            <input
              value={c.name}
              onChange={(e) => updateComponent(c.key, 'name', e.target.value)}
              placeholder="e.g. Midterm"
              className="w-40 border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
            <input
              type="number"
              min="0"
              max="100"
              value={c.weight}
              onChange={(e) => updateComponent(c.key, 'weight', e.target.value)}
              placeholder="30"
              className="w-20 border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
            <span className="text-xs text-[var(--ink-soft)]">%</span>
            <input
              type="date"
              value={c.dueDate}
              onChange={(e) => updateComponent(c.key, 'dueDate', e.target.value)}
              className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
            <label className="flex items-center gap-1 text-xs text-[var(--ink-soft)]">
              <input
                type="checkbox"
                checked={c.isExam}
                onChange={(e) => updateComponent(c.key, 'isExam', e.target.checked)}
                className="accent-[var(--primary)]"
              />
              Exam
            </label>
            <button
              type="button"
              onClick={() => removeRow(c.key)}
              className="text-[var(--ink-soft)] hover:text-[var(--urgent)]"
              aria-label="Remove component"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="flex w-fit items-center gap-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:underline"
        >
          <Plus size={13} /> Add component
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <GraduationCap size={15} /> {saving ? 'Saving…' : 'Add course'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1.5 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// --- Course edit form -----------------------------------------------------------

function CourseEditForm({ course, onSave, onCancel }) {
  const [name, setName] = useState(course.name);
  const [color, setColor] = useState(course.color);
  const [credits, setCredits] = useState(course.credits ?? 3);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), color, credits: Number(credits) || 3 });
    setSaving(false);
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <div className="flex gap-1">
        {COLOR_PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => setColor(swatch)}
            className="h-5 w-5 rounded-full border-2"
            style={{
              background: swatch,
              borderColor: color === swatch ? 'var(--ink)' : 'transparent',
            }}
            aria-label={swatch}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          step="0.5"
          value={credits}
          onChange={(e) => setCredits(e.target.value)}
          className="w-14 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
        <span className="text-xs text-[var(--ink-soft)]">credits</span>
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={onCancel}
        className="text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Cancel
      </button>
    </div>
  );
}

// --- Editable grade component row -----------------------------------------------

function ComponentRow({ component, onUpdate, onDelete, onScoreCommit }) {
  const [name, setName] = useState(component.name);
  const [weight, setWeight] = useState(component.weight);
  const [dueDate, setDueDate] = useState(component.dueDate ?? '');

  useEffect(() => setName(component.name), [component.name]);
  useEffect(() => setWeight(component.weight), [component.weight]);
  useEffect(() => setDueDate(component.dueDate ?? ''), [component.dueDate]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg px-1 py-1 hover:bg-[var(--paper)]">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name !== component.name) {
            onUpdate(component.id, { name: name.trim() });
          }
        }}
        className="w-28 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-[var(--ink)] outline-none hover:border-[var(--paper-line)] focus:border-[var(--primary)] focus:bg-white"
      />
      <div className="flex items-center gap-0.5">
        <input
          type="number"
          min="0"
          max="100"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => {
            const num = Number(weight) || 0;
            if (num !== component.weight) onUpdate(component.id, { weight: num });
          }}
          className="w-14 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-0.5 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
        <span className="text-[10px] text-[var(--ink-soft)]">%</span>
      </div>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        onBlur={() => {
          if (dueDate !== (component.dueDate ?? '')) {
            onUpdate(component.id, { dueDate });
          }
        }}
        className="rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-0.5 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <label className="flex items-center gap-1 text-[10px] text-[var(--ink-soft)]">
        <input
          type="checkbox"
          checked={component.isExam}
          onChange={(e) => onUpdate(component.id, { isExam: e.target.checked })}
          className="accent-[var(--primary)]"
        />
        Exam
      </label>
      <ScoreInput
        value={component.score}
        onCommit={(text) => onScoreCommit(component.id, text)}
      />
      <button
        onClick={() => {
          if (window.confirm(`Delete "${component.name}"?`)) onDelete(component.id);
        }}
        className="text-[var(--ink-soft)] hover:text-[var(--urgent)]"
        aria-label="Delete component"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// --- Add grade component form ----------------------------------------------------

function AddComponentForm({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isExam, setIsExam] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onAdd({ name: name.trim(), weight, dueDate, isExam });
    setSaving(false);
    setName('');
    setWeight('');
    setDueDate('');
    setIsExam(false);
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--paper-line)] p-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Final exam"
        className="w-28 min-w-0 flex-1 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="number"
        min="0"
        max="100"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="wt %"
        className="w-16 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <label className="flex items-center gap-1 text-[10px] text-[var(--ink-soft)]">
        <input
          type="checkbox"
          checked={isExam}
          onChange={(e) => setIsExam(e.target.checked)}
          className="accent-[var(--primary)]"
        />
        Exam
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Add'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Cancel
      </button>
    </form>
  );
}

// --- Reminder notifications toggle -----------------------------------------------

function ReminderToggle({ enabled, permission, onToggle }) {
  if (!notificationsSupported()) return null;

  if (permission === 'denied') {
    return (
      <span
        className="flex items-center gap-1.5 font-mono-chart text-[10px] uppercase tracking-wide text-[var(--ink-soft)]"
        title="Notifications are blocked in your browser settings"
      >
        <BellOff size={13} /> Blocked
      </span>
    );
  }

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono-chart text-xs uppercase tracking-wide ${
        enabled
          ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
          : 'border-[var(--paper-line)] text-[var(--ink-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
      }`}
    >
      {enabled ? <Bell size={13} /> : <BellOff size={13} />}
      {enabled ? 'Reminders on' : 'Enable reminders'}
    </button>
  );
}

// --- Recorded score input -----------------------------------------------------

function ScoreInput({ value, onCommit }) {
  const [text, setText] = useState(value ?? '');

  useEffect(() => {
    setText(value ?? '');
  }, [value]);

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="0"
        max="100"
        placeholder="score"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const normalized = text === '' ? null : Number(text);
          if (normalized !== (value ?? null)) onCommit(text);
        }}
        className="w-16 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-0.5 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <span className="text-[10px] text-[var(--ink-soft)]">%</span>
    </div>
  );
}

// --- What-if grade calculator --------------------------------------------------

function GradeCalculator({ components }) {
  const [whatIfs, setWhatIfs] = useState({});

  function scoreFor(component) {
    if (component.score !== null && component.score !== undefined) return component.score;
    const raw = whatIfs[component.id];
    return raw === undefined || raw === '' ? null : Number(raw);
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const accounted = components.filter((c) => scoreFor(c) !== null);
  const accountedWeight = accounted.reduce((sum, c) => sum + c.weight, 0);
  const weightedSum = accounted.reduce(
    (sum, c) => sum + (c.weight * scoreFor(c)) / 100,
    0,
  );
  const currentGrade = accountedWeight > 0 ? (weightedSum / accountedWeight) * 100 : null;
  const allAccounted = totalWeight > 0 && accountedWeight >= totalWeight;

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-[var(--paper-line)] bg-[var(--paper)] p-3">
      {components.map((c) => {
        const recorded = c.score !== null && c.score !== undefined;
        return (
          <div key={c.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-[var(--ink)]">
              {c.name} <span className="text-[var(--ink-soft)]">({c.weight}%)</span>
            </span>
            {recorded ? (
              <span className="font-mono-chart text-xs text-[var(--whenever)]">
                Recorded: {c.score}%
              </span>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="what if?"
                  value={whatIfs[c.id] ?? ''}
                  onChange={(e) =>
                    setWhatIfs((prev) => ({ ...prev, [c.id]: e.target.value }))
                  }
                  className="w-20 border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
                />
                <span className="text-xs text-[var(--ink-soft)]">%</span>
              </div>
            )}
          </div>
        );
      })}
      <div className="mt-2 border-t border-[var(--paper-line)] pt-2">
        {currentGrade === null ? (
          <p className="text-xs italic text-[var(--ink-soft)]">
            Enter a score to see your grade.
          </p>
        ) : allAccounted ? (
          <p className="font-mono-chart text-sm font-bold text-[var(--ink)]">
            Projected final grade: {currentGrade.toFixed(1)}%
          </p>
        ) : (
          <p className="font-mono-chart text-xs text-[var(--ink-soft)]">
            Grade so far: {currentGrade.toFixed(1)}%{' '}
            <span className="italic">
              (based on {accountedWeight}% of course weight — fill in the rest to
              see your projected final grade)
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

// --- Semester GPA calculator -----------------------------------------------------

function SemesterGPA({ courses, gradeComponents }) {
  const rows = courses.map((course) => {
    const components = gradeComponents.filter((c) => c.courseId === course.id);
    const percent = recordedGradeForComponents(components);
    const credits = Number(course.credits) || 3;
    const points = percent !== null ? gpaPointsForPercent(percent) : null;
    return { course, percent, credits, points };
  });

  const graded = rows.filter((r) => r.percent !== null);
  const totalCredits = graded.reduce((sum, r) => sum + r.credits, 0);
  const weightedPoints = graded.reduce((sum, r) => sum + r.points * r.credits, 0);
  const gpa = totalCredits > 0 ? weightedPoints / totalCredits : null;
  const allCredits = rows.reduce((sum, r) => sum + r.credits, 0);

  return (
    <section className="rounded-2xl border border-[var(--paper-line)] bg-white/60 shadow-sm shadow-pink-100">
      <ClipHeader icon={Calculator} title="Semester GPA" accent="#9333ea" />
      <div className="px-5 py-4">
        {rows.length === 0 ? (
          <p className="text-center text-xs italic text-[var(--ink-soft)]">
            Add a course to see your semester GPA
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {rows.map(({ course, percent, credits, points }) => (
                <div
                  key={course.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: course.color }}
                    />
                    <span className="min-w-0 truncate text-[var(--ink)]">{course.name}</span>
                    <span className="shrink-0 text-xs text-[var(--ink-soft)]">
                      ({credits} cr)
                    </span>
                  </div>
                  <div className="shrink-0 font-mono-chart text-xs text-[var(--ink-soft)]">
                    {percent !== null
                      ? `${percent.toFixed(1)}% · ${points.toFixed(1)} pts`
                      : 'No grades yet'}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-[var(--paper-line)] pt-3">
              {gpa !== null ? (
                <p className="font-mono-chart text-sm font-bold text-[var(--ink)]">
                  Semester GPA so far: {gpa.toFixed(2)}{' '}
                  <span className="font-normal text-[var(--ink-soft)]">
                    (based on {totalCredits} of {allCredits} credits with recorded grades)
                  </span>
                </p>
              ) : (
                <p className="text-xs italic text-[var(--ink-soft)]">
                  Record at least one grade to see your GPA.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// --- Course chart (roster + intake) -------------------------------------------

function CourseChart({
  courses,
  gradeComponents,
  onAddCourse,
  onUpdateScore,
  onUpdateCourse,
  onDeleteCourse,
  onUpdateComponent,
  onDeleteComponent,
  onAddComponent,
}) {
  const [showForm, setShowForm] = useState(false);
  const [openCalculators, setOpenCalculators] = useState({});
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [addingComponentFor, setAddingComponentFor] = useState(null);

  function toggleCalculator(courseId) {
    setOpenCalculators((prev) => ({ ...prev, [courseId]: !prev[courseId] }));
  }

  return (
    <section className="rounded-2xl border border-[var(--paper-line)] bg-white/60 shadow-sm shadow-pink-100">
      <ClipHeader icon={BookOpen} title="My Courses" accent="var(--primary-soft)">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Close' : 'New course'}
        </button>
      </ClipHeader>

      {showForm && (
        <CourseIntakeForm
          existingCourses={courses}
          onSubmit={onAddCourse}
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="divide-y divide-[var(--paper-line)]">
        {courses.length === 0 && (
          <p className="px-5 py-4 text-center text-xs italic text-[var(--ink-soft)]">
            No courses yet — add your first one!
          </p>
        )}
        {courses.map((course) => {
          const components = gradeComponents
            .filter((c) => c.courseId === course.id)
            .sort((a, b) => b.weight - a.weight);
          const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
          const isEditing = editingCourseId === course.id;
          return (
            <div key={course.id} className="px-5 py-3">
              {isEditing ? (
                <CourseEditForm
                  course={course}
                  onSave={async (updates) => {
                    await onUpdateCourse(course.id, updates);
                    setEditingCourseId(null);
                  }}
                  onCancel={() => setEditingCourseId(null)}
                />
              ) : (
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: course.color }}
                    />
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {course.name}
                    </p>
                    <button
                      onClick={() => setEditingCourseId(course.id)}
                      className="text-[var(--ink-soft)] hover:text-[var(--primary)]"
                      aria-label="Edit course"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${course.name}" and all its grade weights? Tasks and exams already created will stay, just unlinked from this course.`,
                          )
                        ) {
                          onDeleteCourse(course.id);
                        }
                      }}
                      className="text-[var(--ink-soft)] hover:text-[var(--urgent)]"
                      aria-label="Delete course"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-mono-chart text-[10px] uppercase tracking-wide text-[var(--ink-soft)]">
                      {course.credits ?? 3} cr · {totalWeight}% tracked
                    </p>
                    {components.length > 0 && (
                      <button
                        onClick={() => toggleCalculator(course.id)}
                        className="flex items-center gap-1 font-mono-chart text-[10px] uppercase tracking-wide text-[var(--primary)] hover:underline"
                      >
                        <Calculator size={12} />
                        {openCalculators[course.id] ? 'Hide' : 'Calculate grade'}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {components.length > 0 && (
                <div className="flex h-2 overflow-hidden rounded-sm border border-[var(--paper-line)]">
                  {components.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        width: `${c.weight}%`,
                        background: course.color,
                        opacity: 0.4 + (0.6 * c.weight) / 100,
                      }}
                      title={`${c.name} · ${c.weight}%`}
                    />
                  ))}
                </div>
              )}
              {components.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {components.map((c) => (
                    <ComponentRow
                      key={c.id}
                      component={c}
                      onUpdate={onUpdateComponent}
                      onDelete={onDeleteComponent}
                      onScoreCommit={onUpdateScore}
                    />
                  ))}
                </div>
              )}
              {addingComponentFor === course.id ? (
                <AddComponentForm
                  onAdd={(component) => onAddComponent(course.id, course.name, component)}
                  onClose={() => setAddingComponentFor(null)}
                />
              ) : (
                <button
                  onClick={() => setAddingComponentFor(course.id)}
                  className="mt-2 flex items-center gap-1 font-mono-chart text-[10px] uppercase tracking-wide text-[var(--primary)] hover:underline"
                >
                  <Plus size={12} /> Add grade item
                </button>
              )}
              {openCalculators[course.id] && components.length > 0 && (
                <GradeCalculator components={components} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- Task edit form -------------------------------------------------------------

function TaskEditForm({ task, courses, onSave, onCancel }) {
  const [title, setTitle] = useState(task.title);
  const [courseId, setCourseId] = useState(task.courseId ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [time, setTime] = useState(task.time);
  const [date, setDate] = useState(task.date);
  const [hours, setHours] = useState(task.hours);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      courseId: courseId || null,
      priority,
      time,
      date,
      hours,
    });
    setSaving(false);
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-1.5">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <select
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        className="rounded-md border border-[var(--paper-line)] bg-white px-1 py-1 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      >
        <option value="">No course</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="rounded-md border border-[var(--paper-line)] bg-white px-1 py-1 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_STYLE[p].label}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-md border border-[var(--paper-line)] bg-white px-1 py-1 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="rounded-md border border-[var(--paper-line)] bg-white px-1 py-1 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="number"
        min="0"
        step="0.5"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        className="w-14 rounded-md border border-[var(--paper-line)] bg-white px-1 py-1 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <button
        onClick={save}
        disabled={saving}
        className="rounded-full bg-[var(--primary)] px-2.5 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={onCancel}
        className="text-[10px] text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Cancel
      </button>
    </div>
  );
}

// --- Triage Board ------------------------------------------------------------

function TriageBoard({ tasks, exams, courses, onAdd, onToggle, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCourseId, setFilterCourseId] = useState('');
  const hasActiveFilter = Boolean(search.trim() || filterCourseId);
  const todayTasks = tasks
    .filter((t) => t.date === TODAY)
    .filter((t) => !filterCourseId || t.courseId === filterCourseId)
    .filter(
      (t) =>
        !search.trim() ||
        t.title.toLowerCase().includes(search.trim().toLowerCase()),
    );
  const todayExams = exams.filter((e) => e.date === TODAY);

  return (
    <section className="rounded-2xl border border-[var(--paper-line)] bg-white/60 shadow-sm shadow-pink-100">
      <ClipHeader icon={ClipboardList} title="Today's List" accent="var(--primary)">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Close' : 'Add task'}
        </button>
      </ClipHeader>

      {showForm && (
        <AddTaskForm courses={courses} onAdd={onAdd} onClose={() => setShowForm(false)} />
      )}

      {todayExams.length > 0 && (
        <div className="flex items-center gap-2 border-b border-[var(--paper-line)] bg-[var(--urgent-bg)] px-5 py-2 font-mono-chart text-xs uppercase tracking-wide text-[var(--urgent)]">
          <AlertTriangle size={14} />
          Exam today: {todayExams.map((e) => e.name).join(', ')}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--paper-line)] px-5 py-2">
        <div className="relative flex min-w-[140px] flex-1 items-center">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 text-[var(--ink-soft)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search today's tasks…"
            className="w-full rounded-full border border-[var(--paper-line)] bg-white py-1 pl-7 pr-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <select
          value={filterCourseId}
          onChange={(e) => setFilterCourseId(e.target.value)}
          className="rounded-full border border-[var(--paper-line)] bg-white px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 divide-y divide-[var(--paper-line)] md:grid-cols-3 md:divide-x md:divide-y-0">
        {PRIORITIES.map((priority) => {
          const style = PRIORITY_STYLE[priority];
          const items = todayTasks
            .filter((t) => t.priority === priority)
            .sort((a, b) => a.time.localeCompare(b.time));
          return (
            <div key={priority} className="flex flex-col">
              <div
                className="border-b px-4 py-2 font-mono-chart text-xs font-bold uppercase tracking-widest"
                style={{
                  color: style.text,
                  background: style.bg,
                  borderColor: style.border,
                }}
              >
                {style.label} · {items.length}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                {items.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs italic text-[var(--ink-soft)]">
                    {hasActiveFilter ? 'No matches' : 'Nothing here yet!'}
                  </p>
                )}
                {items.map((task) => {
                  const course = courses.find((c) => c.id === task.courseId);
                  const isEditing = editingTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      className={`flex items-start gap-2 rounded-xl border-l-4 bg-white px-3 py-2 shadow-sm ${
                        !isEditing && task.done ? 'opacity-50' : ''
                      }`}
                      style={{ borderColor: course?.color }}
                    >
                      {isEditing ? (
                        <TaskEditForm
                          task={task}
                          courses={courses}
                          onSave={async (updates) => {
                            await onUpdate(task.id, updates);
                            setEditingTaskId(null);
                          }}
                          onCancel={() => setEditingTaskId(null)}
                        />
                      ) : (
                        <>
                          <label className="flex flex-1 cursor-pointer items-start gap-2">
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => onToggle(task)}
                              className="mt-1 accent-[var(--primary)]"
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-sm leading-snug text-[var(--ink)] ${
                                  task.done ? 'line-through' : ''
                                }`}
                              >
                                {task.title}
                              </p>
                              <div className="mt-1 flex items-center gap-2 font-mono-chart text-[10px] uppercase tracking-wide text-[var(--ink-soft)]">
                                <CourseDot courses={courses} courseId={task.courseId} />
                                {course?.name}
                                <span>·</span>
                                <Clock size={10} />
                                {task.time}
                              </div>
                            </div>
                          </label>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => setEditingTaskId(task.id)}
                              className="text-[var(--ink-soft)] hover:text-[var(--primary)]"
                              aria-label="Edit task"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Delete "${task.title}"?`)) {
                                  onDelete(task.id);
                                }
                              }}
                              className="text-[var(--ink-soft)] hover:text-[var(--urgent)]"
                              aria-label="Delete task"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- Week view ----------------------------------------------------------------

function WeekView({ tasks, exams, courses, onToggle, onUpdate, onDelete, onAdd }) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(TODAY, i)),
    [],
  );
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const selectedTasks = selectedDate
    ? [...tasks]
        .filter((t) => t.date === selectedDate)
        .sort((a, b) => a.time.localeCompare(b.time))
    : [];
  const selectedExams = selectedDate ? exams.filter((e) => e.date === selectedDate) : [];

  return (
    <section className="rounded-2xl border border-[var(--paper-line)] bg-white/60 shadow-sm shadow-pink-100">
      <ClipHeader icon={CalendarDays} title="This Week" accent="#c026d3" />
      <div className="overflow-x-auto">
      <div className="grid min-w-[560px] grid-cols-7 divide-x divide-[var(--paper-line)]">
        {days.map((date) => {
          const dayTasks = tasks.filter((t) => t.date === date);
          const dayExams = exams.filter((e) => e.date === date);
          const isToday = date === TODAY;
          const isSelected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              onClick={() => {
                setSelectedDate((prev) => (prev === date ? null : date));
                setShowAddForm(false);
              }}
              className={`flex flex-col gap-2 px-2 py-3 text-left transition-colors hover:bg-[var(--paper)] ${
                isToday ? 'bg-[var(--paper)]' : ''
              } ${isSelected ? 'ring-2 ring-inset ring-[var(--primary)]' : ''}`}
            >
              <div className="text-center">
                <p className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
                  {weekdayLabel(date)}
                </p>
                <p
                  className={`font-mono-chart text-sm ${
                    isToday ? 'font-bold text-[var(--primary)]' : 'text-[var(--ink)]'
                  }`}
                >
                  {monthDayLabel(date)}
                </p>
              </div>

              {dayExams.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-1 rounded-full bg-[var(--urgent-bg)] px-1.5 py-0.5 text-center font-mono-chart text-[9px] uppercase tracking-wide text-[var(--urgent)]"
                  title={e.name}
                >
                  <AlertTriangle size={10} className="shrink-0" />
                  <span className="truncate">Exam</span>
                </div>
              ))}

              <div className="flex flex-wrap justify-center gap-1">
                {dayTasks.length === 0 ? (
                  <span className="text-[10px] text-[var(--ink-soft)]">—</span>
                ) : (
                  dayTasks.map((t) => (
                    <span
                      key={t.id}
                      className="h-2 w-2 rounded-full"
                      style={{ background: courses.find((c) => c.id === t.courseId)?.color }}
                      title={t.title}
                    />
                  ))
                )}
              </div>
              <p className="text-center font-mono-chart text-[10px] text-[var(--ink-soft)]">
                {dayTasks.length} task{dayTasks.length === 1 ? '' : 's'}
              </p>
            </button>
          );
        })}
      </div>
      </div>

      {selectedDate && (
        <div className="border-t border-[var(--paper-line)] px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono-chart text-xs uppercase tracking-widest text-[var(--ink-soft)]">
              {weekdayLabel(selectedDate)}, {monthDayLabel(selectedDate)}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddForm((s) => !s)}
                className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
              >
                {showAddForm ? <X size={13} /> : <Plus size={13} />}
                {showAddForm ? 'Close' : 'Add task'}
              </button>
              <button
                onClick={() => setSelectedDate(null)}
                className="text-[var(--ink-soft)] hover:text-[var(--ink)]"
                aria-label="Close day view"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {showAddForm && (
            <div className="mb-3 rounded-xl border border-[var(--paper-line)]">
              <AddTaskForm
                courses={courses}
                onAdd={onAdd}
                onClose={() => setShowAddForm(false)}
                defaultDate={selectedDate}
              />
            </div>
          )}

          {selectedExams.length > 0 && (
            <div className="mb-2 flex items-center gap-2 rounded-full bg-[var(--urgent-bg)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--urgent)]">
              <AlertTriangle size={13} />
              Exam: {selectedExams.map((e) => e.name).join(', ')}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {selectedTasks.length === 0 && (
              <p className="text-center text-xs italic text-[var(--ink-soft)]">
                Nothing scheduled this day
              </p>
            )}
            {selectedTasks.map((task) => {
              const course = courses.find((c) => c.id === task.courseId);
              const isEditing = editingTaskId === task.id;
              return (
                <div
                  key={task.id}
                  className={`flex items-start gap-2 rounded-xl border-l-4 bg-white px-3 py-2 shadow-sm ${
                    !isEditing && task.done ? 'opacity-50' : ''
                  }`}
                  style={{ borderColor: course?.color }}
                >
                  {isEditing ? (
                    <TaskEditForm
                      task={task}
                      courses={courses}
                      onSave={async (updates) => {
                        await onUpdate(task.id, updates);
                        setEditingTaskId(null);
                      }}
                      onCancel={() => setEditingTaskId(null)}
                    />
                  ) : (
                    <>
                      <label className="flex flex-1 cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => onToggle(task)}
                          className="mt-1 accent-[var(--primary)]"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm leading-snug text-[var(--ink)] ${
                              task.done ? 'line-through' : ''
                            }`}
                          >
                            {task.title}
                          </p>
                          <div className="mt-1 flex items-center gap-2 font-mono-chart text-[10px] uppercase tracking-wide text-[var(--ink-soft)]">
                            <CourseDot courses={courses} courseId={task.courseId} />
                            {course?.name}
                            <span>·</span>
                            <Clock size={10} />
                            {task.time}
                          </div>
                        </div>
                      </label>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setEditingTaskId(task.id)}
                          className="text-[var(--ink-soft)] hover:text-[var(--primary)]"
                          aria-label="Edit task"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete "${task.title}"?`)) onDelete(task.id);
                          }}
                          className="text-[var(--ink-soft)] hover:text-[var(--urgent)]"
                          aria-label="Delete task"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// --- Exam Docket (reverse-planning) -------------------------------------------

function AddExamForm({ courses, onAdd, onClose }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !date || !courseId) return;
    setSaving(true);
    await onAdd(courseId, name.trim(), date);
    setSaving(false);
    setName('');
    setDate('');
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 border-b border-[var(--paper-line)] bg-[var(--paper)] px-5 py-4"
    >
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Course
        </label>
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-[180px] flex-1 flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Exam name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Final exam"
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <Plus size={15} /> {saving ? 'Saving…' : 'Add exam'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-2 py-1.5 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Cancel
      </button>
    </form>
  );
}

function ExamEditForm({ exam, onSave, onCancel }) {
  const [name, setName] = useState(exam.name);
  const [date, setDate] = useState(exam.date);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !date) return;
    setSaving(true);
    await onSave({ name: name.trim(), date });
    setSaving(false);
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <button
        onClick={save}
        disabled={saving}
        className="rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={onCancel}
        className="text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Cancel
      </button>
    </div>
  );
}

function ChapterPlanForm({ exam, onUploadFile, onBuildPlan, onClose }) {
  const [chapters, setChapters] = useState(['', '']);
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const numDays = Math.max(1, daysUntil(exam.date));
  const validChapters = chapters.filter((c) => c.trim());
  const totalHoursNeeded = validChapters.length * CHAPTER_STUDY_HOURS;
  const totalHoursAvailable = numDays * (Number(hoursPerDay) || 0);
  const tight = validChapters.length > 0 && totalHoursNeeded > totalHoursAvailable;

  function updateChapter(i, value) {
    setChapters((prev) => prev.map((c, idx) => (idx === i ? value : c)));
  }
  function addRow() {
    setChapters((prev) => [...prev, '']);
  }
  function removeRow(i) {
    setChapters((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    for (const file of files) {
      await onUploadFile(file);
    }
    if (validChapters.length > 0) {
      await onBuildPlan(validChapters, Number(hoursPerDay) || CHAPTER_STUDY_HOURS);
    }
    setSaving(false);
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-dashed border-[var(--paper-line)] bg-[var(--paper)] p-3"
    >
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Slides / notes (optional, just for your reference)
        </label>
        <input
          type="file"
          multiple
          accept=".pptx,.ppt,.pdf,.doc,.docx"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-xs text-[var(--ink)]"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Chapters / topics on the exam
        </label>
        {chapters.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={c}
              onChange={(e) => updateChapter(i, e.target.value)}
              placeholder={`e.g. Chapter ${i + 1}`}
              className="flex-1 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-[var(--ink-soft)] hover:text-[var(--urgent)]"
              aria-label="Remove chapter"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="flex w-fit items-center gap-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:underline"
        >
          <Plus size={13} /> Add chapter
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Hours/day you can study
          </label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(e.target.value)}
            className="w-20 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        {validChapters.length > 0 && (
          <p
            className={`text-xs ${tight ? 'font-medium text-[var(--urgent)]' : 'text-[var(--ink-soft)]'}`}
          >
            ~{totalHoursNeeded}h of material over {numDays} day{numDays === 1 ? '' : 's'}
            {tight
              ? ` — that's tight at ${hoursPerDay}h/day, consider studying more each day.`
              : '.'}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <CalendarClock size={15} /> {saving ? 'Building…' : 'Build study plan'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1.5 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ExamDocket({
  exams,
  courses,
  tasks,
  examChapters,
  examMaterials,
  onPlanBackward,
  onAddExam,
  onUpdateExam,
  onDeleteExam,
  onUploadMaterial,
  onDownloadMaterial,
  onDeleteMaterial,
  onBuildPlan,
  onClearPlan,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingExamId, setEditingExamId] = useState(null);
  const [chapterFormOpenId, setChapterFormOpenId] = useState(null);
  const sorted = [...exams].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="rounded-2xl border border-[var(--paper-line)] bg-white/60 shadow-sm shadow-pink-100">
      <ClipHeader icon={CalendarClock} title="Exam Countdown" accent="#4f46e5">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Close' : 'Add exam'}
        </button>
      </ClipHeader>

      {showForm && (
        <AddExamForm
          courses={courses}
          onAdd={onAddExam}
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="divide-y divide-[var(--paper-line)]">
        {sorted.length === 0 && (
          <p className="px-5 py-4 text-center text-xs italic text-[var(--ink-soft)]">
            No exams on the calendar yet
          </p>
        )}
        {sorted.map((exam) => {
          const course = courses.find((c) => c.id === exam.courseId);
          const days = daysUntil(exam.date);
          const chapters = examChapters
            .filter((c) => c.examId === exam.id)
            .sort((a, b) => a.position - b.position);
          const materials = examMaterials.filter((m) => m.examId === exam.id);
          const hasChapterPlan = chapters.length > 0;
          const planned = tasks.some((t) => t.linkedExamId === exam.id && !t.linkedChapterId);
          const tooSoon = days < 7;
          const isEditing = editingExamId === exam.id;
          const isAddingPlan = chapterFormOpenId === exam.id;
          return (
            <div key={exam.id} className="flex flex-col gap-2 px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                {isEditing ? (
                  <ExamEditForm
                    exam={exam}
                    onSave={async (updates) => {
                      await onUpdateExam(exam.id, updates);
                      setEditingExamId(null);
                    }}
                    onCancel={() => setEditingExamId(null)}
                  />
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: course?.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--ink)]">{exam.name}</p>
                        <p className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
                          {monthDayLabel(exam.date)} · {days <= 0 ? 'Today' : `${days}d`}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {hasChapterPlan ? (
                        <span className="font-mono-chart rounded-full border border-[var(--whenever)] bg-[var(--whenever-bg)] px-3 py-1 text-center text-xs font-bold uppercase tracking-wide text-[var(--whenever)]">
                          {chapters.length}-chapter plan
                        </span>
                      ) : planned ? (
                        <span className="font-mono-chart rounded-full border border-[var(--whenever)] bg-[var(--whenever-bg)] px-3 py-1 text-center text-xs font-bold uppercase tracking-wide text-[var(--whenever)]">
                          All set!
                        </span>
                      ) : (
                        <button
                          onClick={() => onPlanBackward(exam)}
                          disabled={tooSoon}
                          title={tooSoon ? 'Exam is less than a week away' : undefined}
                          className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white disabled:cursor-not-allowed disabled:border-[var(--paper-line)] disabled:text-[var(--ink-soft)] disabled:hover:bg-transparent"
                        >
                          <CalendarClock size={13} />
                          {tooSoon ? 'Too soon to plan' : 'Plan my studying'}
                        </button>
                      )}
                      {!hasChapterPlan && (
                        <button
                          onClick={() =>
                            setChapterFormOpenId(isAddingPlan ? null : exam.id)
                          }
                          className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
                        >
                          <Upload size={13} />
                          {isAddingPlan ? 'Close' : 'Add chapters'}
                        </button>
                      )}
                      <button
                        onClick={() => setEditingExamId(exam.id)}
                        className="text-[var(--ink-soft)] hover:text-[var(--primary)]"
                        aria-label="Edit exam"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete "${exam.name}"?`)) onDeleteExam(exam.id);
                        }}
                        className="text-[var(--ink-soft)] hover:text-[var(--urgent)]"
                        aria-label="Delete exam"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {materials.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {materials.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-1 rounded-full border border-[var(--paper-line)] bg-white px-2 py-0.5 text-[10px] text-[var(--ink-soft)]"
                    >
                      <FileText size={11} className="shrink-0" />
                      <button
                        onClick={() => onDownloadMaterial(m)}
                        className="max-w-[140px] truncate hover:text-[var(--primary)] hover:underline"
                        title={m.fileName}
                      >
                        {m.fileName}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove "${m.fileName}"?`)) onDeleteMaterial(m);
                        }}
                        className="hover:text-[var(--urgent)]"
                        aria-label="Remove file"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {hasChapterPlan && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-xs text-[var(--ink-soft)]">
                    {chapters.map((c) => c.name).join(' · ')}
                  </p>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          'Clear this chapter plan? The chapters and their generated study tasks will be removed.',
                        )
                      ) {
                        onClearPlan(exam.id);
                      }
                    }}
                    className="shrink-0 text-xs text-[var(--ink-soft)] underline hover:text-[var(--urgent)]"
                  >
                    Clear plan
                  </button>
                </div>
              )}

              {isAddingPlan && (
                <ChapterPlanForm
                  exam={exam}
                  onUploadFile={(file) => onUploadMaterial(exam.id, file)}
                  onBuildPlan={(chapterNames, hoursPerDay) =>
                    onBuildPlan(exam, chapterNames, hoursPerDay)
                  }
                  onClose={() => setChapterFormOpenId(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- Flashcard reviews (spaced repetition) ------------------------------------

function AddReviewTopicForm({ courses, onAdd, onClose }) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !courseId) return;
    setSaving(true);
    await onAdd(courseId, name.trim(), notes.trim());
    setSaving(false);
    setName('');
    setNotes('');
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border-b border-[var(--paper-line)] bg-[var(--paper)] px-5 py-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Topic
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cranial nerves I-XII"
            className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Course
          </label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Back of card (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What you need to remember about this topic…"
          rows={2}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={15} /> {saving ? 'Saving…' : 'Add topic'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1.5 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReviewTopicEditForm({ topic, courses, onSave, onCancel }) {
  const [name, setName] = useState(topic.name);
  const [notes, setNotes] = useState(topic.notes ?? '');
  const [courseId, setCourseId] = useState(topic.courseId ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), notes: notes.trim(), courseId });
    setSaving(false);
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Back of card…"
        rows={2}
        className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FlashcardReviews({ reviewTopics, courses, onAddTopic, onUpdateTopic, onDeleteTopic }) {
  const [showForm, setShowForm] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState(null);
  const [expandedTopicId, setExpandedTopicId] = useState(null);
  const sorted = [...reviewTopics].sort((a, b) =>
    a.nextReviewDate.localeCompare(b.nextReviewDate),
  );
  const dueCount = reviewTopics.filter((t) => daysUntil(t.nextReviewDate) <= 0).length;

  return (
    <section className="rounded-2xl border border-[var(--paper-line)] bg-white/60 shadow-sm shadow-pink-100">
      <ClipHeader icon={Brain} title="Flashcard Reviews" accent="#be185d">
        <div className="flex items-center gap-2">
          {dueCount > 0 && (
            <span className="font-mono-chart rounded-full border border-[var(--urgent)] bg-[var(--urgent-bg)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--urgent)]">
              {dueCount} due
            </span>
          )}
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
          >
            {showForm ? <X size={13} /> : <Plus size={13} />}
            {showForm ? 'Close' : 'Add topic'}
          </button>
        </div>
      </ClipHeader>

      {showForm && (
        <AddReviewTopicForm
          courses={courses}
          onAdd={onAddTopic}
          onClose={() => setShowForm(false)}
        />
      )}

      <div className="divide-y divide-[var(--paper-line)]">
        {sorted.length === 0 && (
          <p className="px-5 py-4 text-center text-xs italic text-[var(--ink-soft)]">
            No review topics yet
          </p>
        )}
        {sorted.map((topic) => {
          const course = courses.find((c) => c.id === topic.courseId);
          const days = daysUntil(topic.nextReviewDate);
          const due = days <= 0;
          const interval =
            REVIEW_INTERVALS[Math.min(topic.boxLevel, REVIEW_INTERVALS.length - 1)];
          const isEditing = editingTopicId === topic.id;
          const isExpanded = expandedTopicId === topic.id;
          return (
            <div
              key={topic.id}
              className={`flex flex-col gap-2 px-5 py-3 ${due ? 'bg-[var(--urgent-bg)]/30' : ''}`}
            >
              {isEditing ? (
                <ReviewTopicEditForm
                  topic={topic}
                  courses={courses}
                  onSave={async (updates) => {
                    await onUpdateTopic(topic.id, updates);
                    setEditingTopicId(null);
                  }}
                  onCancel={() => setEditingTopicId(null)}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() =>
                        setExpandedTopicId((prev) => (prev === topic.id ? null : topic.id))
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      disabled={!topic.notes}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: course?.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--ink)]">{topic.name}</p>
                        <p className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
                          Box {topic.boxLevel + 1}/{REVIEW_INTERVALS.length} · {interval}-day
                          interval
                        </p>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <div
                        className="font-mono-chart rounded-full border border-[var(--paper-line)] px-3 py-1 text-center text-xs uppercase tracking-wide text-[var(--ink-soft)]"
                        style={
                          due
                            ? {
                                color: 'var(--urgent)',
                                borderColor: 'var(--urgent)',
                                background: 'var(--urgent-bg)',
                              }
                            : undefined
                        }
                      >
                        {due ? 'Due now' : `${monthDayLabel(topic.nextReviewDate)} · ${days}d`}
                      </div>
                      <button
                        onClick={() => setEditingTopicId(topic.id)}
                        className="text-[var(--ink-soft)] hover:text-[var(--primary)]"
                        aria-label="Edit topic"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete "${topic.name}"?`)) onDeleteTopic(topic.id);
                        }}
                        className="text-[var(--ink-soft)] hover:text-[var(--urgent)]"
                        aria-label="Delete topic"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {isExpanded && topic.notes && (
                    <p className="rounded-lg bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)]">
                      {topic.notes}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- Long-Range Chart -----------------------------------------------------------

const LONG_RANGE_CATEGORIES = ['MCAT', 'Application', 'Shadowing', 'LOR', 'Other'];

function AddLongRangeForm({ onAdd, onClose }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState(LONG_RANGE_CATEGORIES[0]);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setSaving(true);
    await onAdd(title.trim(), date, category);
    setSaving(false);
    setTitle('');
    setDate('');
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 border-b border-[var(--paper-line)] bg-[var(--paper)] px-5 py-4"
    >
      <div className="flex min-w-[200px] flex-1 flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Deadline
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. MCAT registration closes"
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        >
          {LONG_RANGE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <Plus size={15} /> {saving ? 'Saving…' : 'Add deadline'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-2 py-1.5 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Cancel
      </button>
    </form>
  );
}

function LongRangeEditForm({ item, onSave, onCancel }) {
  const [title, setTitle] = useState(item.title);
  const [date, setDate] = useState(item.date);
  const [category, setCategory] = useState(item.category);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || !date) return;
    setSaving(true);
    await onSave({ title: title.trim(), date, category });
    setSaving(false);
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      >
        {LONG_RANGE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <button
        onClick={save}
        disabled={saving}
        className="rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={onCancel}
        className="text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Cancel
      </button>
    </div>
  );
}

function LongRangeChart({ items, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="rounded-2xl border border-[var(--paper-line)] bg-white/60 shadow-sm shadow-pink-100">
      <ClipHeader icon={FlaskConical} title="Big Deadlines" accent="var(--urgent)">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Close' : 'Add deadline'}
        </button>
      </ClipHeader>

      {showForm && <AddLongRangeForm onAdd={onAdd} onClose={() => setShowForm(false)} />}

      <div className="divide-y divide-[var(--paper-line)]">
        {sorted.length === 0 && (
          <p className="px-5 py-4 text-center text-xs italic text-[var(--ink-soft)]">
            No big deadlines yet
          </p>
        )}
        {sorted.map((item) => {
          const days = daysUntil(item.date);
          const urgent = days <= 7;
          const isEditing = editingItemId === item.id;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              {isEditing ? (
                <LongRangeEditForm
                  item={item}
                  onSave={async (updates) => {
                    await onUpdate(item.id, updates);
                    setEditingItemId(null);
                  }}
                  onCancel={() => setEditingItemId(null)}
                />
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--ink)]">{item.title}</p>
                    <p className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
                      {item.category} · {monthDayLabel(item.date)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div
                      className="font-mono-chart rounded-full border px-3 py-1 text-center text-xs font-bold uppercase tracking-wide"
                      style={{
                        color: urgent ? 'var(--urgent)' : 'var(--whenever)',
                        borderColor: urgent ? 'var(--urgent)' : 'var(--whenever)',
                        background: urgent ? 'var(--urgent-bg)' : 'var(--whenever-bg)',
                      }}
                    >
                      {days === 0 ? 'Today' : `${days}d`}
                    </div>
                    <button
                      onClick={() => setEditingItemId(item.id)}
                      className="text-[var(--ink-soft)] hover:text-[var(--primary)]"
                      aria-label="Edit deadline"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete "${item.title}"?`)) onDelete(item.id);
                      }}
                      className="text-[var(--ink-soft)] hover:text-[var(--urgent)]"
                      aria-label="Delete deadline"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- Shadowing hours tracker -----------------------------------------------------

function AddShadowingLogForm({ onAdd, onClose }) {
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(TODAY);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!hours || Number(hours) <= 0 || !date) return;
    setSaving(true);
    await onAdd(hours, date, note.trim());
    setSaving(false);
    setHours('');
    setNote('');
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-3 border-b border-[var(--paper-line)] bg-[var(--paper)] px-5 py-4"
    >
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Hours
        </label>
        <input
          autoFocus
          type="number"
          min="0"
          step="0.5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="4"
          className="w-20 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <div className="flex min-w-[160px] flex-1 flex-col gap-1">
        <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
          Note (optional)
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Dr. Patel, cardiology"
          className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <Plus size={15} /> {saving ? 'Saving…' : 'Log hours'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-2 py-1.5 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Cancel
      </button>
    </form>
  );
}

function ShadowingTracker({ logs, goal, onAddLog, onDeleteLog, onUpdateGoal }) {
  const [showForm, setShowForm] = useState(false);
  const [goalInput, setGoalInput] = useState(goal ?? '');
  const totalHours = logs.reduce((sum, l) => sum + l.hours, 0);
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const pct = goal ? Math.min(100, (totalHours / goal) * 100) : null;

  useEffect(() => {
    setGoalInput(goal ?? '');
  }, [goal]);

  return (
    <section className="rounded-2xl border border-[var(--paper-line)] bg-white/60 shadow-sm shadow-pink-100">
      <ClipHeader icon={Stethoscope} title="Shadowing Hours" accent="#0d9488">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Close' : 'Log hours'}
        </button>
      </ClipHeader>

      {showForm && (
        <AddShadowingLogForm onAdd={onAddLog} onClose={() => setShowForm(false)} />
      )}

      <div className="flex flex-col gap-2 border-b border-[var(--paper-line)] px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--ink)]">
            <span className="font-mono-chart text-lg font-bold">{totalHours}</span> hours
            logged
          </p>
          <div className="flex items-center gap-1.5">
            <span className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
              Goal
            </span>
            <input
              type="number"
              min="0"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onBlur={() => {
                const normalized = goalInput === '' ? null : Number(goalInput);
                if (normalized !== (goal ?? null)) onUpdateGoal(goalInput);
              }}
              placeholder="e.g. 100"
              className="w-16 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-0.5 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>
        {goal > 0 && (
          <div className="h-2 overflow-hidden rounded-full bg-[var(--paper-line)]">
            <div
              className="h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="divide-y divide-[var(--paper-line)]">
        {sorted.length === 0 && (
          <p className="px-5 py-4 text-center text-xs italic text-[var(--ink-soft)]">
            No hours logged yet
          </p>
        )}
        {sorted.map((log) => (
          <div key={log.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-[var(--ink)]">
                {log.hours}h{log.note ? ` · ${log.note}` : ''}
              </p>
              <p className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
                {monthDayLabel(log.date)}
              </p>
            </div>
            <button
              onClick={() => {
                if (window.confirm('Delete this log entry?')) onDeleteLog(log.id);
              }}
              className="shrink-0 text-[var(--ink-soft)] hover:text-[var(--urgent)]"
              aria-label="Delete log entry"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- MCAT practice test log -------------------------------------------------------

function AddPracticeTestForm({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [testDate, setTestDate] = useState(TODAY);
  const [totalScore, setTotalScore] = useState('');
  const [chemPhys, setChemPhys] = useState('');
  const [cars, setCars] = useState('');
  const [bioBiochem, setBioBiochem] = useState('');
  const [psychSoc, setPsychSoc] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !testDate) return;
    setSaving(true);
    await onAdd({ name: name.trim(), testDate, totalScore, chemPhys, cars, bioBiochem, psychSoc });
    setSaving(false);
    setName('');
    setTotalScore('');
    setChemPhys('');
    setCars('');
    setBioBiochem('');
    setPsychSoc('');
    onClose();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border-b border-[var(--paper-line)] bg-[var(--paper)] px-5 py-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[160px] flex-1 flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Test name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. AAMC FL1"
            className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Date
          </label>
          <input
            type="date"
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
            className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Total
          </label>
          <input
            type="number"
            min="472"
            max="528"
            value={totalScore}
            onChange={(e) => setTotalScore(e.target.value)}
            placeholder="510"
            className="w-20 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Chem/Phys
          </label>
          <input
            type="number"
            min="118"
            max="132"
            value={chemPhys}
            onChange={(e) => setChemPhys(e.target.value)}
            className="w-16 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            CARS
          </label>
          <input
            type="number"
            min="118"
            max="132"
            value={cars}
            onChange={(e) => setCars(e.target.value)}
            className="w-16 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Bio/Biochem
          </label>
          <input
            type="number"
            min="118"
            max="132"
            value={bioBiochem}
            onChange={(e) => setBioBiochem(e.target.value)}
            className="w-16 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Psych/Soc
          </label>
          <input
            type="number"
            min="118"
            max="132"
            value={psychSoc}
            onChange={(e) => setPsychSoc(e.target.value)}
            className="w-16 rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={15} /> {saving ? 'Saving…' : 'Add test'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1.5 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PracticeTestEditForm({ test, onSave, onCancel }) {
  const [name, setName] = useState(test.name);
  const [testDate, setTestDate] = useState(test.testDate);
  const [totalScore, setTotalScore] = useState(test.totalScore ?? '');
  const [chemPhys, setChemPhys] = useState(test.chemPhys ?? '');
  const [cars, setCars] = useState(test.cars ?? '');
  const [bioBiochem, setBioBiochem] = useState(test.bioBiochem ?? '');
  const [psychSoc, setPsychSoc] = useState(test.psychSoc ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !testDate) return;
    setSaving(true);
    await onSave({ name: name.trim(), testDate, totalScore, chemPhys, cars, bioBiochem, psychSoc });
    setSaving(false);
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="date"
        value={testDate}
        onChange={(e) => setTestDate(e.target.value)}
        className="rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="number"
        value={totalScore}
        onChange={(e) => setTotalScore(e.target.value)}
        placeholder="total"
        className="w-14 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="number"
        value={chemPhys}
        onChange={(e) => setChemPhys(e.target.value)}
        placeholder="C/P"
        className="w-12 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="number"
        value={cars}
        onChange={(e) => setCars(e.target.value)}
        placeholder="CARS"
        className="w-12 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="number"
        value={bioBiochem}
        onChange={(e) => setBioBiochem(e.target.value)}
        placeholder="B/B"
        className="w-12 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <input
        type="number"
        value={psychSoc}
        onChange={(e) => setPsychSoc(e.target.value)}
        placeholder="P/S"
        className="w-12 rounded-md border border-[var(--paper-line)] bg-white px-1.5 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      />
      <button
        onClick={save}
        disabled={saving}
        className="rounded-full bg-[var(--primary)] px-2.5 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={onCancel}
        className="text-[10px] text-[var(--ink-soft)] hover:text-[var(--ink)]"
      >
        Cancel
      </button>
    </div>
  );
}

function PracticeTestLog({ tests, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingTestId, setEditingTestId] = useState(null);
  const sorted = [...tests].sort((a, b) => a.testDate.localeCompare(b.testDate));

  return (
    <section className="rounded-2xl border border-[var(--paper-line)] bg-white/60 shadow-sm shadow-pink-100">
      <ClipHeader icon={TrendingUp} title="MCAT Practice Tests" accent="#7c3aed">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
        >
          {showForm ? <X size={13} /> : <Plus size={13} />}
          {showForm ? 'Close' : 'Add test'}
        </button>
      </ClipHeader>

      {showForm && <AddPracticeTestForm onAdd={onAdd} onClose={() => setShowForm(false)} />}

      <div className="divide-y divide-[var(--paper-line)]">
        {sorted.length === 0 && (
          <p className="px-5 py-4 text-center text-xs italic text-[var(--ink-soft)]">
            No practice tests logged yet
          </p>
        )}
        {sorted.map((test, i) => {
          const prev = sorted[i - 1];
          const delta =
            prev && test.totalScore != null && prev.totalScore != null
              ? test.totalScore - prev.totalScore
              : null;
          const isEditing = editingTestId === test.id;
          const hasSections =
            test.chemPhys != null || test.cars != null || test.bioBiochem != null || test.psychSoc != null;
          return (
            <div key={test.id} className="flex items-center justify-between gap-3 px-5 py-3">
              {isEditing ? (
                <PracticeTestEditForm
                  test={test}
                  onSave={async (updates) => {
                    await onUpdate(test.id, updates);
                    setEditingTestId(null);
                  }}
                  onCancel={() => setEditingTestId(null)}
                />
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--ink)]">{test.name}</p>
                    <p className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
                      {monthDayLabel(test.testDate)}
                      {hasSections &&
                        ` · C/P ${test.chemPhys ?? '—'} · CARS ${test.cars ?? '—'} · B/B ${
                          test.bioBiochem ?? '—'
                        } · P/S ${test.psychSoc ?? '—'}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {test.totalScore != null && (
                      <div className="font-mono-chart flex items-center gap-1 rounded-full border border-[var(--paper-line)] px-3 py-1 text-center text-sm font-bold text-[var(--ink)]">
                        {test.totalScore}
                        {delta !== null && delta !== 0 && (
                          <span
                            className="text-[10px] font-normal"
                            style={{ color: delta > 0 ? 'var(--whenever)' : 'var(--urgent)' }}
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => setEditingTestId(test.id)}
                      className="text-[var(--ink-soft)] hover:text-[var(--primary)]"
                      aria-label="Edit test"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete "${test.name}"?`)) onDelete(test.id);
                      }}
                      className="text-[var(--ink-soft)] hover:text-[var(--urgent)]"
                      aria-label="Delete test"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- Calendar sync ------------------------------------------------------------

function CalendarSync({ connected, syncing, lastSyncedAt, onConnect, onDisconnect, onSyncNow }) {
  return (
    <section className="rounded-2xl border border-[var(--paper-line)] bg-white/60 shadow-sm shadow-pink-100">
      <ClipHeader icon={CalendarPlus} title="Calendar Sync" accent="#0891b2">
        {isGoogleConfigured ? (
          connected ? (
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1.5 border border-[var(--paper-line)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--ink-soft)] hover:border-[var(--urgent)] hover:text-[var(--urgent)]"
            >
              <Unplug size={13} /> Disconnect
            </button>
          ) : (
            <button
              onClick={onConnect}
              className="flex items-center gap-1.5 rounded-full border border-[var(--primary)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"
            >
              <LogIn size={13} /> Connect Google Calendar
            </button>
          )
        ) : (
          <span className="font-mono-chart text-[10px] uppercase tracking-wide text-[var(--ink-soft)]">
            Not configured
          </span>
        )}
      </ClipHeader>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <p className="text-xs text-[var(--ink-soft)]">
          {!isGoogleConfigured
            ? 'Add VITE_GOOGLE_CLIENT_ID to .env.local to enable calendar sync.'
            : connected
              ? lastSyncedAt
                ? `Last synced ${lastSyncedAt.toLocaleTimeString()}`
                : 'Connected — not yet synced.'
              : 'Push exam dates and long-range deadlines to your Google Calendar.'}
        </p>
        {connected && (
          <button
            onClick={onSyncNow}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
    </section>
  );
}

// --- Vitals strip -----------------------------------------------------------

function VitalsStrip({ tasks, exams }) {
  const openToday = tasks.filter((t) => t.date === TODAY && !t.done).length;
  const upcomingExams = exams
    .map((e) => daysUntil(e.date))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const nextExamDays = upcomingExams[0];
  const weekEnd = addDays(TODAY, 6);
  const studyHours = tasks
    .filter((t) => t.date >= TODAY && t.date <= weekEnd)
    .reduce((sum, t) => sum + Number(t.hours), 0);

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <VitalTile
        label="Tasks left today"
        value={openToday}
        icon={Activity}
        flag={openToday > 4}
      />
      <VitalTile
        label="Next exam in"
        value={nextExamDays ?? '—'}
        unit={nextExamDays !== undefined ? 'd' : ''}
        icon={AlertTriangle}
        flag={nextExamDays !== undefined && nextExamDays <= 3}
      />
      <VitalTile
        label="Study hours this week"
        value={studyHours}
        unit="hrs"
        icon={Clock}
      />
    </div>
  );
}

// --- Data mapping helpers ----------------------------------------------------

function mapTaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    courseId: row.course_id,
    priority: row.priority,
    time: row.time,
    date: row.date,
    hours: row.hours,
    done: row.done,
    linkedExamId: row.linked_exam_id,
    linkedReviewTopicId: row.linked_review_topic_id,
    linkedChapterId: row.linked_chapter_id,
  };
}

function mapReviewTopicRow(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    notes: row.notes,
    boxLevel: row.box_level,
    nextReviewDate: row.next_review_date,
  };
}

function mapShadowingLogRow(row) {
  return {
    id: row.id,
    hours: Number(row.hours),
    date: row.date,
    note: row.note,
  };
}

function mapPracticeTestRow(row) {
  return {
    id: row.id,
    name: row.name,
    testDate: row.test_date,
    totalScore: row.total_score,
    chemPhys: row.chem_phys,
    cars: row.cars,
    bioBiochem: row.bio_biochem,
    psychSoc: row.psych_soc,
  };
}

function mapExamChapterRow(row) {
  return {
    id: row.id,
    examId: row.exam_id,
    name: row.name,
    position: row.position,
  };
}

function mapExamMaterialRow(row) {
  return {
    id: row.id,
    examId: row.exam_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
  };
}

function mapExamRow(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    date: row.date,
    googleEventId: row.google_event_id,
  };
}

function mapLongRangeRow(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    category: row.category,
    googleEventId: row.google_event_id,
  };
}

function mapGradeComponentRow(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    weight: Number(row.weight),
    dueDate: row.due_date,
    isExam: row.is_exam,
    score: row.score === null || row.score === undefined ? null : Number(row.score),
  };
}

// --- Setup banner (shown until Supabase env vars are provided) --------------

function SetupBanner() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <GraduationCap size={32} className="mx-auto mb-4 text-[var(--primary)]" />
      <h1 className="mb-2 text-xl font-semibold text-[var(--ink)]">
        Connect Supabase to continue
      </h1>
      <p className="mb-4 text-sm text-[var(--ink-soft)]">
        Copy <code className="font-mono-chart">.env.example</code> to{' '}
        <code className="font-mono-chart">.env.local</code>, fill in your
        Supabase project URL and anon key from Project Settings → API, then
        restart the dev server.
      </p>
    </div>
  );
}

// --- Auth gate ---------------------------------------------------------------

function AuthGate() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    if (mode === 'signin') {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) setError(signInError.message);
    } else {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setInfo('Account created — check your email to confirm, then sign in.');
      }
    }
    setSubmitting(false);
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-24">
      <div className="text-center">
        <GraduationCap size={32} className="mx-auto mb-3 text-[var(--primary)]" />
        <h1 className="text-xl font-semibold text-[var(--ink)]">My Study Planner</h1>
        <p className="font-mono-chart text-xs uppercase tracking-widest text-[var(--ink-soft)]">
          {mode === 'signin' ? 'Welcome back!' : "Let's get you set up"}
        </p>
      </div>
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-2xl border border-[var(--paper-line)] bg-white/60 p-5 shadow-sm shadow-pink-100"
      >
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)]">
            Password
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-[var(--paper-line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]"
          />
        </div>
        {error && <p className="text-xs text-[var(--urgent)]">{error}</p>}
        {info && <p className="text-xs text-[var(--whenever)]">{info}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
          setInfo(null);
        }}
        className="text-center text-xs text-[var(--ink-soft)] hover:text-[var(--primary)] hover:underline"
      >
        {mode === 'signin'
          ? "Don't have an account? Create one"
          : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}

// --- Root component -----------------------------------------------------------

export default function PremedPlanner() {
  const [courses, setCourses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [exams, setExams] = useState([]);
  const [longRange, setLongRange] = useState([]);
  const [gradeComponents, setGradeComponents] = useState([]);
  const [reviewTopics, setReviewTopics] = useState([]);
  const [shadowingLogs, setShadowingLogs] = useState([]);
  const [shadowingGoal, setShadowingGoal] = useState(null);
  const [practiceTests, setPracticeTests] = useState([]);
  const [examChapters, setExamChapters] = useState([]);
  const [examMaterials, setExamMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [googleToken, setGoogleToken] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(
    () => notificationsSupported() && localStorage.getItem(NOTIF_ENABLED_KEY) === 'true',
  );
  const [notifPermission, setNotifPermission] = useState(() =>
    notificationsSupported() ? Notification.permission : 'unsupported',
  );

  async function toggleNotifications() {
    if (!notificationsSupported()) return;
    if (!notifEnabled) {
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
        setNotifPermission(permission);
      }
      if (permission === 'granted') {
        localStorage.setItem(NOTIF_ENABLED_KEY, 'true');
        setNotifEnabled(true);
      }
    } else {
      localStorage.setItem(NOTIF_ENABLED_KEY, 'false');
      setNotifEnabled(false);
    }
  }

  useEffect(() => {
    if (!notifEnabled || notifPermission !== 'granted' || loading) return;
    const lastNotified = localStorage.getItem(NOTIF_LAST_DATE_KEY);
    if (lastNotified === TODAY) return;

    const dueToday = tasks.filter((t) => t.date === TODAY && !t.done);
    const soonExams = exams.filter((e) => {
      const d = daysUntil(e.date);
      return d >= 0 && d <= 2;
    });
    if (dueToday.length === 0 && soonExams.length === 0) return;

    const parts = [];
    if (dueToday.length > 0) {
      parts.push(`${dueToday.length} task${dueToday.length === 1 ? '' : 's'} due today`);
    }
    if (soonExams.length > 0) {
      parts.push(
        `${soonExams.length} exam${soonExams.length === 1 ? '' : 's'} coming up: ${soonExams
          .map((e) => e.name)
          .join(', ')}`,
      );
    }
    new Notification('My Study Planner', { body: parts.join(' · ') });
    localStorage.setItem(NOTIF_LAST_DATE_KEY, TODAY);
  }, [notifEnabled, notifPermission, loading, tasks, exams]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !session) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      const [
        coursesRes,
        tasksRes,
        examsRes,
        longRangeRes,
        gradeComponentsRes,
        reviewTopicsRes,
        shadowingLogsRes,
        settingsRes,
        practiceTestsRes,
        examChaptersRes,
        examMaterialsRes,
      ] = await Promise.all([
        supabase.from('courses').select('*').order('name'),
        supabase.from('tasks').select('*'),
        supabase.from('exams').select('*'),
        supabase.from('long_range_items').select('*'),
        supabase.from('grade_components').select('*'),
        supabase.from('review_topics').select('*'),
        supabase.from('shadowing_logs').select('*'),
        supabase.from('settings').select('*').maybeSingle(),
        supabase.from('practice_tests').select('*'),
        supabase.from('exam_chapters').select('*'),
        supabase.from('exam_materials').select('*'),
      ]);

      if (cancelled) return;

      const firstError =
        coursesRes.error ||
        tasksRes.error ||
        examsRes.error ||
        longRangeRes.error ||
        gradeComponentsRes.error ||
        reviewTopicsRes.error ||
        shadowingLogsRes.error ||
        settingsRes.error ||
        practiceTestsRes.error ||
        examChaptersRes.error ||
        examMaterialsRes.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      setCourses(coursesRes.data ?? []);
      setTasks((tasksRes.data ?? []).map(mapTaskRow));
      setExams((examsRes.data ?? []).map(mapExamRow));
      setLongRange((longRangeRes.data ?? []).map(mapLongRangeRow));
      setGradeComponents((gradeComponentsRes.data ?? []).map(mapGradeComponentRow));
      setReviewTopics((reviewTopicsRes.data ?? []).map(mapReviewTopicRow));
      setShadowingLogs((shadowingLogsRes.data ?? []).map(mapShadowingLogRow));
      setShadowingGoal(settingsRes.data?.shadowing_goal_hours ?? null);
      setPracticeTests((practiceTestsRes.data ?? []).map(mapPracticeTestRow));
      setExamChapters((examChaptersRes.data ?? []).map(mapExamChapterRow));
      setExamMaterials((examMaterialsRes.data ?? []).map(mapExamMaterialRow));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function addTask(task) {
    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        title: task.title,
        course_id: task.courseId,
        priority: task.priority,
        time: task.time,
        date: task.date,
        hours: task.hours,
        done: task.done,
        user_id: session.user.id,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTasks((prev) => [...prev, mapTaskRow(data)]);
  }

  async function toggleTask(task) {
    const nextDone = !task.done;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, done: nextDone } : t)),
    );
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ done: nextDone })
      .eq('id', task.id);
    if (updateError) {
      setError(updateError.message);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, done: task.done } : t)),
      );
      return;
    }
    if (nextDone && task.linkedReviewTopicId) {
      await advanceReviewTopic(task.linkedReviewTopicId);
    }
  }

  async function updateTask(taskId, updates) {
    const payload = {};
    const localUpdates = {};
    if (updates.title !== undefined) {
      payload.title = updates.title;
      localUpdates.title = updates.title;
    }
    if (updates.courseId !== undefined) {
      payload.course_id = updates.courseId || null;
      localUpdates.courseId = updates.courseId || null;
    }
    if (updates.priority !== undefined) {
      payload.priority = updates.priority;
      localUpdates.priority = updates.priority;
    }
    if (updates.time !== undefined) {
      payload.time = updates.time;
      localUpdates.time = updates.time;
    }
    if (updates.date !== undefined) {
      payload.date = updates.date;
      localUpdates.date = updates.date;
    }
    if (updates.hours !== undefined) {
      const hours = Number(updates.hours) || 0;
      payload.hours = hours;
      localUpdates.hours = hours;
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...localUpdates } : t)),
    );
    const { error: updateError } = await supabase
      .from('tasks')
      .update(payload)
      .eq('id', taskId);
    if (updateError) setError(updateError.message);
  }

  async function deleteTask(taskId) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);
    if (deleteError) setError(deleteError.message);
  }

  async function addReviewTopic(courseId, name, notes) {
    const userId = session.user.id;
    const nextDate = nextReviewDateForBox(0);
    const { data: topicRow, error: topicError } = await supabase
      .from('review_topics')
      .insert({
        course_id: courseId,
        name,
        notes: notes || null,
        box_level: 0,
        next_review_date: nextDate,
        user_id: userId,
      })
      .select()
      .single();
    if (topicError) {
      setError(topicError.message);
      return;
    }

    const { data: taskRow, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title: `Review: ${name}`,
        course_id: courseId,
        priority: 'WHENEVER',
        time: '20:00',
        date: nextDate,
        hours: 0.5,
        done: false,
        linked_review_topic_id: topicRow.id,
        user_id: userId,
      })
      .select()
      .single();
    if (taskError) {
      setError(taskError.message);
      return;
    }

    setReviewTopics((prev) => [...prev, mapReviewTopicRow(topicRow)]);
    setTasks((prev) => [...prev, mapTaskRow(taskRow)]);
  }

  async function advanceReviewTopic(topicId) {
    const topic = reviewTopics.find((t) => t.id === topicId);
    if (!topic) return;
    const nextBoxLevel = Math.min(topic.boxLevel + 1, REVIEW_INTERVALS.length - 1);
    const nextDate = nextReviewDateForBox(nextBoxLevel);

    const { data: updatedTopic, error: topicError } = await supabase
      .from('review_topics')
      .update({ box_level: nextBoxLevel, next_review_date: nextDate })
      .eq('id', topicId)
      .select()
      .single();
    if (topicError) {
      setError(topicError.message);
      return;
    }

    const { data: taskRow, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title: `Review: ${topic.name}`,
        course_id: topic.courseId,
        priority: 'WHENEVER',
        time: '20:00',
        date: nextDate,
        hours: 0.5,
        done: false,
        linked_review_topic_id: topicId,
        user_id: session.user.id,
      })
      .select()
      .single();
    if (taskError) {
      setError(taskError.message);
      return;
    }

    setReviewTopics((prev) =>
      prev.map((t) => (t.id === topicId ? mapReviewTopicRow(updatedTopic) : t)),
    );
    setTasks((prev) => [...prev, mapTaskRow(taskRow)]);
  }

  async function updateReviewTopic(topicId, updates) {
    const payload = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.notes !== undefined) payload.notes = updates.notes || null;
    if (updates.courseId !== undefined) payload.course_id = updates.courseId;

    setReviewTopics((prev) =>
      prev.map((t) => (t.id === topicId ? { ...t, ...updates } : t)),
    );
    const { error: updateError } = await supabase
      .from('review_topics')
      .update(payload)
      .eq('id', topicId);
    if (updateError) setError(updateError.message);
  }

  async function deleteReviewTopic(topicId) {
    setReviewTopics((prev) => prev.filter((t) => t.id !== topicId));
    const { error: deleteError } = await supabase
      .from('review_topics')
      .delete()
      .eq('id', topicId);
    if (deleteError) setError(deleteError.message);
  }

  async function addShadowingLog(hours, date, note) {
    const { data, error: insertError } = await supabase
      .from('shadowing_logs')
      .insert({
        hours: Number(hours) || 0,
        date,
        note: note || null,
        user_id: session.user.id,
      })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setShadowingLogs((prev) => [...prev, mapShadowingLogRow(data)]);
  }

  async function deleteShadowingLog(logId) {
    setShadowingLogs((prev) => prev.filter((l) => l.id !== logId));
    const { error: deleteError } = await supabase
      .from('shadowing_logs')
      .delete()
      .eq('id', logId);
    if (deleteError) setError(deleteError.message);
  }

  async function updateShadowingGoal(hours) {
    const value = hours === '' ? null : Number(hours);
    setShadowingGoal(value);
    const { error: upsertError } = await supabase
      .from('settings')
      .upsert({ user_id: session.user.id, shadowing_goal_hours: value });
    if (upsertError) setError(upsertError.message);
  }

  async function addPracticeTest(test) {
    const { data, error: insertError } = await supabase
      .from('practice_tests')
      .insert({
        name: test.name,
        test_date: test.testDate,
        total_score: test.totalScore === '' ? null : Number(test.totalScore),
        chem_phys: test.chemPhys === '' ? null : Number(test.chemPhys),
        cars: test.cars === '' ? null : Number(test.cars),
        bio_biochem: test.bioBiochem === '' ? null : Number(test.bioBiochem),
        psych_soc: test.psychSoc === '' ? null : Number(test.psychSoc),
        user_id: session.user.id,
      })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setPracticeTests((prev) => [...prev, mapPracticeTestRow(data)]);
  }

  async function updatePracticeTest(testId, updates) {
    const payload = {};
    const localUpdates = {};
    if (updates.name !== undefined) {
      payload.name = updates.name;
      localUpdates.name = updates.name;
    }
    if (updates.testDate !== undefined) {
      payload.test_date = updates.testDate;
      localUpdates.testDate = updates.testDate;
    }
    if (updates.totalScore !== undefined) {
      const v = updates.totalScore === '' ? null : Number(updates.totalScore);
      payload.total_score = v;
      localUpdates.totalScore = v;
    }
    if (updates.chemPhys !== undefined) {
      const v = updates.chemPhys === '' ? null : Number(updates.chemPhys);
      payload.chem_phys = v;
      localUpdates.chemPhys = v;
    }
    if (updates.cars !== undefined) {
      const v = updates.cars === '' ? null : Number(updates.cars);
      payload.cars = v;
      localUpdates.cars = v;
    }
    if (updates.bioBiochem !== undefined) {
      const v = updates.bioBiochem === '' ? null : Number(updates.bioBiochem);
      payload.bio_biochem = v;
      localUpdates.bioBiochem = v;
    }
    if (updates.psychSoc !== undefined) {
      const v = updates.psychSoc === '' ? null : Number(updates.psychSoc);
      payload.psych_soc = v;
      localUpdates.psychSoc = v;
    }

    setPracticeTests((prev) =>
      prev.map((t) => (t.id === testId ? { ...t, ...localUpdates } : t)),
    );
    const { error: updateError } = await supabase
      .from('practice_tests')
      .update(payload)
      .eq('id', testId);
    if (updateError) setError(updateError.message);
  }

  async function deletePracticeTest(testId) {
    setPracticeTests((prev) => prev.filter((t) => t.id !== testId));
    const { error: deleteError } = await supabase
      .from('practice_tests')
      .delete()
      .eq('id', testId);
    if (deleteError) setError(deleteError.message);
  }

  async function addCourse(courseInput, components) {
    const userId = session.user.id;
    const { data: courseRow, error: courseError } = await supabase
      .from('courses')
      .insert({
        name: courseInput.name,
        color: courseInput.color,
        credits: courseInput.credits ?? 3,
        user_id: userId,
      })
      .select()
      .single();
    if (courseError) {
      setError(courseError.message);
      return;
    }

    const componentRows = components.map((c) => ({
      course_id: courseRow.id,
      name: c.name,
      weight: Number(c.weight) || 0,
      due_date: c.dueDate || null,
      is_exam: c.isExam,
      user_id: userId,
    }));

    const { data: insertedComponents, error: componentsError } = await supabase
      .from('grade_components')
      .insert(componentRows)
      .select();
    if (componentsError) {
      setError(componentsError.message);
      return;
    }

    const dueComponents = (insertedComponents ?? []).filter((c) => c.due_date);
    const examComponents = dueComponents.filter((c) => c.is_exam);
    const nonExamComponents = dueComponents.filter((c) => !c.is_exam);

    const examRows = examComponents.map((c) => ({
      course_id: courseRow.id,
      name: `${courseInput.name} ${c.name}`,
      date: c.due_date,
      user_id: userId,
    }));

    const { data: insertedExams, error: examsError } = examRows.length
      ? await supabase.from('exams').insert(examRows).select()
      : { data: [], error: null };
    if (examsError) setError(examsError.message);

    const reversePlanRows = (insertedExams ?? []).flatMap((examRow) =>
      buildReversePlanRows(
        {
          id: examRow.id,
          courseId: examRow.course_id,
          name: examRow.name,
          date: examRow.date,
        },
        userId,
      ),
    );

    const prepTaskRows = nonExamComponents.map((c) => ({
      title: `${c.name} — prep`,
      course_id: courseRow.id,
      priority: priorityForWeight(Number(c.weight)),
      time: '09:00',
      date: c.due_date,
      hours: hoursForWeight(Number(c.weight)),
      done: false,
      user_id: userId,
    }));

    const allTaskRows = [...reversePlanRows, ...prepTaskRows];
    const { data: insertedTasks, error: tasksError } = allTaskRows.length
      ? await supabase.from('tasks').insert(allTaskRows).select()
      : { data: [], error: null };
    if (tasksError) setError(tasksError.message);

    setCourses((prev) => [...prev, courseRow]);
    setGradeComponents((prev) => [
      ...prev,
      ...(insertedComponents ?? []).map(mapGradeComponentRow),
    ]);
    setExams((prev) => [...prev, ...(insertedExams ?? []).map(mapExamRow)]);
    setTasks((prev) => [...prev, ...(insertedTasks ?? []).map(mapTaskRow)]);
  }

  async function updateComponentScore(componentId, rawValue) {
    const value = rawValue === '' ? null : Number(rawValue);
    setGradeComponents((prev) =>
      prev.map((c) => (c.id === componentId ? { ...c, score: value } : c)),
    );
    const { error: updateError } = await supabase
      .from('grade_components')
      .update({ score: value })
      .eq('id', componentId);
    if (updateError) setError(updateError.message);
  }

  async function updateCourse(courseId, updates) {
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, ...updates } : c)),
    );
    const { error: updateError } = await supabase
      .from('courses')
      .update(updates)
      .eq('id', courseId);
    if (updateError) setError(updateError.message);
  }

  async function deleteCourse(courseId) {
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
    setGradeComponents((prev) => prev.filter((c) => c.courseId !== courseId));
    const { error: deleteError } = await supabase
      .from('courses')
      .delete()
      .eq('id', courseId);
    if (deleteError) setError(deleteError.message);
  }

  async function updateGradeComponent(componentId, updates) {
    const payload = {};
    const localUpdates = {};
    if (updates.name !== undefined) {
      payload.name = updates.name;
      localUpdates.name = updates.name;
    }
    if (updates.weight !== undefined) {
      const weight = Number(updates.weight) || 0;
      payload.weight = weight;
      localUpdates.weight = weight;
    }
    if (updates.dueDate !== undefined) {
      payload.due_date = updates.dueDate || null;
      localUpdates.dueDate = updates.dueDate || null;
    }
    if (updates.isExam !== undefined) {
      payload.is_exam = updates.isExam;
      localUpdates.isExam = updates.isExam;
    }

    setGradeComponents((prev) =>
      prev.map((c) => (c.id === componentId ? { ...c, ...localUpdates } : c)),
    );
    const { error: updateError } = await supabase
      .from('grade_components')
      .update(payload)
      .eq('id', componentId);
    if (updateError) setError(updateError.message);
  }

  async function deleteGradeComponent(componentId) {
    setGradeComponents((prev) => prev.filter((c) => c.id !== componentId));
    const { error: deleteError } = await supabase
      .from('grade_components')
      .delete()
      .eq('id', componentId);
    if (deleteError) setError(deleteError.message);
  }

  async function addGradeComponent(courseId, courseName, component) {
    const userId = session.user.id;
    const { data: componentRow, error: componentError } = await supabase
      .from('grade_components')
      .insert({
        course_id: courseId,
        name: component.name,
        weight: Number(component.weight) || 0,
        due_date: component.dueDate || null,
        is_exam: component.isExam,
        user_id: userId,
      })
      .select()
      .single();
    if (componentError) {
      setError(componentError.message);
      return;
    }
    setGradeComponents((prev) => [...prev, mapGradeComponentRow(componentRow)]);

    if (!componentRow.due_date) return;

    if (componentRow.is_exam) {
      const { data: examRow, error: examError } = await supabase
        .from('exams')
        .insert({
          course_id: courseId,
          name: `${courseName} ${componentRow.name}`,
          date: componentRow.due_date,
          user_id: userId,
        })
        .select()
        .single();
      if (examError) {
        setError(examError.message);
        return;
      }
      setExams((prev) => [...prev, mapExamRow(examRow)]);

      const rows = buildReversePlanRows(
        {
          id: examRow.id,
          courseId: examRow.course_id,
          name: examRow.name,
          date: examRow.date,
        },
        userId,
      );
      if (rows.length > 0) {
        const { data: taskRows, error: tasksError } = await supabase
          .from('tasks')
          .insert(rows)
          .select();
        if (tasksError) {
          setError(tasksError.message);
          return;
        }
        setTasks((prev) => [...prev, ...(taskRows ?? []).map(mapTaskRow)]);
      }
    } else {
      const { data: taskRow, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: `${componentRow.name} — prep`,
          course_id: courseId,
          priority: priorityForWeight(Number(componentRow.weight)),
          time: '09:00',
          date: componentRow.due_date,
          hours: hoursForWeight(Number(componentRow.weight)),
          done: false,
          user_id: userId,
        })
        .select()
        .single();
      if (taskError) {
        setError(taskError.message);
        return;
      }
      setTasks((prev) => [...prev, mapTaskRow(taskRow)]);
    }
  }

  async function addExam(courseId, name, date) {
    const { data, error: insertError } = await supabase
      .from('exams')
      .insert({ course_id: courseId, name, date, user_id: session.user.id })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setExams((prev) => [...prev, mapExamRow(data)]);
  }

  async function updateExam(examId, updates) {
    setExams((prev) => prev.map((e) => (e.id === examId ? { ...e, ...updates } : e)));
    const { error: updateError } = await supabase
      .from('exams')
      .update(updates)
      .eq('id', examId);
    if (updateError) setError(updateError.message);
  }

  async function deleteExam(examId) {
    setExams((prev) => prev.filter((e) => e.id !== examId));
    const { error: deleteError } = await supabase
      .from('exams')
      .delete()
      .eq('id', examId);
    if (deleteError) setError(deleteError.message);
  }

  async function addLongRangeItem(title, date, category) {
    const { data, error: insertError } = await supabase
      .from('long_range_items')
      .insert({ title, date, category, user_id: session.user.id })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setLongRange((prev) => [...prev, mapLongRangeRow(data)]);
  }

  async function updateLongRangeItem(itemId, updates) {
    setLongRange((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
    const { error: updateError } = await supabase
      .from('long_range_items')
      .update(updates)
      .eq('id', itemId);
    if (updateError) setError(updateError.message);
  }

  async function deleteLongRangeItem(itemId) {
    setLongRange((prev) => prev.filter((item) => item.id !== itemId));
    const { error: deleteError } = await supabase
      .from('long_range_items')
      .delete()
      .eq('id', itemId);
    if (deleteError) setError(deleteError.message);
  }

  async function planExamBackward(exam) {
    const rows = buildReversePlanRows(exam, session.user.id);
    if (rows.length === 0) return;
    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert(rows)
      .select();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTasks((prev) => [...prev, ...(data ?? []).map(mapTaskRow)]);
  }

  async function uploadExamMaterial(examId, file) {
    const userId = session.user.id;
    const path = `${userId}/${examId}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('exam-materials')
      .upload(path, file, { upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      return;
    }
    const { data, error: insertError } = await supabase
      .from('exam_materials')
      .insert({ exam_id: examId, file_name: file.name, storage_path: path, user_id: userId })
      .select()
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setExamMaterials((prev) => [...prev, mapExamMaterialRow(data)]);
  }

  async function downloadExamMaterial(material) {
    const { data, error: urlError } = await supabase.storage
      .from('exam-materials')
      .createSignedUrl(material.storagePath, 60);
    if (urlError) {
      setError(urlError.message);
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  async function deleteExamMaterial(material) {
    setExamMaterials((prev) => prev.filter((m) => m.id !== material.id));
    await supabase.storage.from('exam-materials').remove([material.storagePath]);
    const { error: deleteError } = await supabase
      .from('exam_materials')
      .delete()
      .eq('id', material.id);
    if (deleteError) setError(deleteError.message);
  }

  async function buildExamChapterPlan(exam, chapterNames, hoursPerDay) {
    const userId = session.user.id;
    const chapterInserts = chapterNames.map((name, i) => ({
      exam_id: exam.id,
      name,
      position: i,
      user_id: userId,
    }));
    const { data: chapterRows, error: chapterError } = await supabase
      .from('exam_chapters')
      .insert(chapterInserts)
      .select();
    if (chapterError) {
      setError(chapterError.message);
      return;
    }
    setExamChapters((prev) => [...prev, ...chapterRows.map(mapExamChapterRow)]);

    const sortedChapterRows = [...chapterRows].sort((a, b) => a.position - b.position);
    const taskRows = buildChapterPlanRows(exam, sortedChapterRows, hoursPerDay, userId);
    const { data: insertedTasks, error: tasksError } = await supabase
      .from('tasks')
      .insert(taskRows)
      .select();
    if (tasksError) {
      setError(tasksError.message);
      return;
    }
    setTasks((prev) => [...prev, ...(insertedTasks ?? []).map(mapTaskRow)]);
  }

  async function clearExamChapterPlan(examId) {
    const chapterIds = examChapters.filter((c) => c.examId === examId).map((c) => c.id);
    setExamChapters((prev) => prev.filter((c) => c.examId !== examId));
    setTasks((prev) => prev.filter((t) => !chapterIds.includes(t.linkedChapterId)));
    if (chapterIds.length > 0) {
      const { error: tasksError } = await supabase
        .from('tasks')
        .delete()
        .in('linked_chapter_id', chapterIds);
      if (tasksError) setError(tasksError.message);
    }
    const { error: chaptersError } = await supabase
      .from('exam_chapters')
      .delete()
      .eq('exam_id', examId);
    if (chaptersError) setError(chaptersError.message);
  }

  function connectGoogleCalendar() {
    if (!window.google?.accounts?.oauth2) {
      setError('Google sign-in is still loading — try again in a moment.');
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: (response) => {
        if (response.error) {
          setError(`Google sign-in failed: ${response.error}`);
          return;
        }
        setGoogleToken(response.access_token);
      },
    });
    client.requestAccessToken();
  }

  function disconnectGoogleCalendar() {
    if (googleToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(googleToken, () => {});
    }
    setGoogleToken(null);
    setLastSyncedAt(null);
  }

  async function syncToGoogleCalendar() {
    if (!googleToken) return;
    setSyncing(true);
    setError(null);
    try {
      for (const exam of exams) {
        const event = await upsertCalendarEvent(googleToken, exam.googleEventId, {
          summary: `Exam: ${exam.name}`,
          startDate: exam.date,
          endDate: addDays(exam.date, 1),
        });
        if (event.id !== exam.googleEventId) {
          await supabase
            .from('exams')
            .update({ google_event_id: event.id })
            .eq('id', exam.id);
          setExams((prev) =>
            prev.map((e) => (e.id === exam.id ? { ...e, googleEventId: event.id } : e)),
          );
        }
      }

      for (const item of longRange) {
        const event = await upsertCalendarEvent(googleToken, item.googleEventId, {
          summary: item.title,
          startDate: item.date,
          endDate: addDays(item.date, 1),
        });
        if (event.id !== item.googleEventId) {
          await supabase
            .from('long_range_items')
            .update({ google_event_id: event.id })
            .eq('id', item.id);
          setLongRange((prev) =>
            prev.map((l) => (l.id === item.id ? { ...l, googleEventId: event.id } : l)),
          );
        }
      }

      setLastSyncedAt(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupBanner />;
  }

  if (authLoading) {
    return (
      <p className="mx-auto max-w-6xl px-4 py-8 font-mono-chart text-sm text-[var(--ink-soft)]">
        Loading…
      </p>
    );
  }

  if (!session) {
    return <AuthGate />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--primary)] pb-4">
        <div className="flex items-center gap-3">
          <GraduationCap size={28} className="shrink-0 text-[var(--primary)]" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-[var(--ink)] sm:text-2xl">
              My Study Planner
            </h1>
            <p className="font-mono-chart text-[10px] uppercase tracking-widest text-[var(--ink-soft)] sm:text-xs">
              Hi, {session.user.email}! Let's get it done ✨
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono-chart text-xs text-[var(--ink-soft)] sm:text-sm">
            {new Date(TODAY + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <ReminderToggle
            enabled={notifEnabled}
            permission={notifPermission}
            onToggle={toggleNotifications}
          />
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 border border-[var(--paper-line)] px-3 py-1 font-mono-chart text-xs uppercase tracking-wide text-[var(--ink-soft)] hover:border-[var(--urgent)] hover:text-[var(--urgent)]"
          >
            <LogOut size={13} /> Log out
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-[var(--urgent)] bg-[var(--urgent-bg)] px-4 py-2 text-sm text-[var(--urgent)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="font-mono-chart text-sm text-[var(--ink-soft)]">
          Loading your planner…
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <VitalsStrip tasks={tasks} exams={exams} />
          <SemesterGPA courses={courses} gradeComponents={gradeComponents} />
          <CourseChart
            courses={courses}
            gradeComponents={gradeComponents}
            onAddCourse={addCourse}
            onUpdateScore={updateComponentScore}
            onUpdateCourse={updateCourse}
            onDeleteCourse={deleteCourse}
            onUpdateComponent={updateGradeComponent}
            onDeleteComponent={deleteGradeComponent}
            onAddComponent={addGradeComponent}
          />
          <TriageBoard
            tasks={tasks}
            exams={exams}
            courses={courses}
            onAdd={addTask}
            onToggle={toggleTask}
            onUpdate={updateTask}
            onDelete={deleteTask}
          />
          <WeekView
            tasks={tasks}
            exams={exams}
            courses={courses}
            onToggle={toggleTask}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onAdd={addTask}
          />
          <ExamDocket
            exams={exams}
            courses={courses}
            tasks={tasks}
            examChapters={examChapters}
            examMaterials={examMaterials}
            onPlanBackward={planExamBackward}
            onAddExam={addExam}
            onUpdateExam={updateExam}
            onDeleteExam={deleteExam}
            onUploadMaterial={uploadExamMaterial}
            onDownloadMaterial={downloadExamMaterial}
            onDeleteMaterial={deleteExamMaterial}
            onBuildPlan={buildExamChapterPlan}
            onClearPlan={clearExamChapterPlan}
          />
          <FlashcardReviews
            reviewTopics={reviewTopics}
            courses={courses}
            onAddTopic={addReviewTopic}
            onUpdateTopic={updateReviewTopic}
            onDeleteTopic={deleteReviewTopic}
          />
          <LongRangeChart
            items={longRange}
            onAdd={addLongRangeItem}
            onUpdate={updateLongRangeItem}
            onDelete={deleteLongRangeItem}
          />
          <ShadowingTracker
            logs={shadowingLogs}
            goal={shadowingGoal}
            onAddLog={addShadowingLog}
            onDeleteLog={deleteShadowingLog}
            onUpdateGoal={updateShadowingGoal}
          />
          <PracticeTestLog
            tests={practiceTests}
            onAdd={addPracticeTest}
            onUpdate={updatePracticeTest}
            onDelete={deletePracticeTest}
          />
          <CalendarSync
            connected={Boolean(googleToken)}
            syncing={syncing}
            lastSyncedAt={lastSyncedAt}
            onConnect={connectGoogleCalendar}
            onDisconnect={disconnectGoogleCalendar}
            onSyncNow={syncToGoogleCalendar}
          />
        </div>
      )}
    </div>
  );
}
