// Isolated demonstration only. Production bookings are handled by PostgreSQL RPC.
export const DEMO_NOW = '2026-11-17T12:00:00+03:00';
const STORE_KEY = 'tutor-calendar-demo-v1';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const TEACHER = { id: 'teacher', name: 'Репетитор', role: 'teacher' };
const id = () => globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const dayInMinsk = time => new Date(time + 3 * HOUR).toISOString().slice(0, 10);

export function createDemoState() {
  const students = [
    { id: 'vlada', name: 'Постоянная ученица', active: true, code: 'VLADA-DEMO' },
    { id: 'vlad', name: 'Ученик (пример)', active: true, code: 'VLAD-DEMO' },
    { id: 'demo', name: 'Маша', active: true, code: 'STUDENT-DEMO' }
  ];
  const main = { 0: ['17:00', '18:05', '19:10'], 2: ['10:00', '11:05'], 3: ['15:15', '16:20'], 4: ['17:55', '19:00', '20:05'] };
  const alina = { 1: ['12:00', '13:00'], 2: ['19:00', '21:00'], 4: ['21:00'], 5: ['12:00', '13:00'], 6: ['19:00', '20:00', '21:00'] };
  const slots = [];
  const add = (teacherId, date, time, studentId = null, recurring = false, closedAfterCancel = false) => {
    const startsAt = new Date(`${date}T${time}:00+03:00`).toISOString();
    slots.push({ id: `${teacherId}-${date}-${time}`, teacherId, date, time, startsAt,
      endsAt: new Date(Date.parse(startsAt) + HOUR).toISOString(), open: true,
      bookingId: studentId ? `booking-${teacherId}-${date}-${time}` : null,
      studentId, recurring, closedAfterCancel });
  };
  for (let day = 17; day <= 30; day++) {
    const date = `2026-11-${day}`;
    const weekday = new Date(`${date}T12:00:00+03:00`).getUTCDay();
    for (const time of main[weekday] || []) {
      const regular = (weekday === 4 && time === '19:00') || (weekday === 0 && time === '17:00');
      add('main', date, time, regular ? 'vlada' : null, regular);
    }
    for (const time of alina[weekday] || []) add('alina', date, time);
  }
  add('main', '2026-11-20', '17:00', 'vlad', false, true);
  return { students, slots, sessions: {}, teacherCode: 'TEACHER-DEMO' };
}

export class DemoApi {
  constructor({ storage, now = () => Date.parse(DEMO_NOW) } = {}) {
    this.storage = storage;
    if (storage === undefined) {
      try { this.storage = globalThis.sessionStorage; } catch { this.storage = null; }
    }
    this.now = now;
    try { this.data = JSON.parse(this.storage?.getItem(STORE_KEY)) || createDemoState(); }
    catch { this.data = createDemoState(); }
  }
  save() { try { this.storage?.setItem(STORE_KEY, JSON.stringify(this.data)); } catch { /* Private browsing may disable storage. */ } }
  user(token) {
    const session = this.data.sessions[token];
    if (!session || session.expiresAt <= this.now()) throw new Error('Войдите заново: время сеанса истекло.');
    if (session.user.role === 'student' && !this.data.students.find(s => s.id === session.user.id)?.active) throw new Error('Ваш код отключён. Обратитесь к репетитору.');
    return session.user;
  }
  requireTeacher(user) { if (user.role !== 'teacher') throw new Error('Это действие доступно только репетитору.'); }
  slot(slotId) {
    const slot = this.data.slots.find(s => s.id === slotId);
    if (!slot) throw new Error('Окошко не найдено.');
    return slot;
  }
  booking(bookingId, user) {
    const slot = this.data.slots.find(s => s.bookingId === bookingId);
    if (!slot) throw new Error('Запись уже отменена или перенесена.');
    if (user.role !== 'teacher' && slot.studentId !== user.id) throw new Error('Можно менять только свои записи.');
    if (user.role !== 'teacher' && Date.parse(slot.startsAt) - this.now() < 2 * HOUR) throw new Error('Отменить или перенести занятие можно не позднее чем за 2 часа.');
    return slot;
  }
  checkNew(slot, user, studentId, excludeSlot = null) {
    if (!slot.open || slot.bookingId) throw new Error('Это окошко уже занято или закрыто.');
    const start = Date.parse(slot.startsAt);
    if (start <= this.now()) throw new Error('Это время уже прошло.');
    if (slot.date > '2026-11-30') throw new Error('Запись открыта только до 30 ноября.');
    if (user.role !== 'teacher') {
      if (slot.date <= dayInMinsk(this.now())) throw new Error('На сегодня запись закрыта. Выберите завтрашний день или позднее.');
      if (start > this.now() + 7 * DAY) throw new Error('Запись открывается ровно за 7 суток до начала занятия.');
    }
    if (!this.data.students.find(s => s.id === studentId && s.active)) throw new Error('Ученик не найден или его код отключён.');
    const overlaps = this.data.slots.some(s => s !== excludeSlot && s.studentId === studentId && s.bookingId && Date.parse(s.startsAt) < Date.parse(slot.endsAt) && Date.parse(s.endsAt) > start);
    if (overlaps) throw new Error('У ученика уже есть занятие в это время.');
  }
  publicState(user) {
    const result = { serverNow: new Date(this.now()).toISOString(), user: clone(user),
      slots: this.data.slots.map(slot => {
        const own = slot.studentId === user.id;
        const visible = user.role === 'teacher' || own;
        const out = { id: slot.id, teacherId: slot.teacherId, date: slot.date, time: slot.time,
          startsAt: slot.startsAt, endsAt: slot.endsAt, status: slot.bookingId ? 'booked' : slot.open ? 'free' : 'closed',
          bookingId: visible ? slot.bookingId : null, own, recurring: slot.recurring };
        if (visible && slot.studentId) out.studentName = this.data.students.find(s => s.id === slot.studentId)?.name || 'Ученик';
        if (user.role === 'teacher') out.studentId = slot.studentId;
        return out;
      }).sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.teacherId.localeCompare(b.teacherId)) };
    if (user.role === 'teacher') result.students = this.data.students.map(({ id, name, active }) => ({ id, name, active }));
    return result;
  }
  async call(action, payload = {}, session_token = null) {
    if (action === 'login') {
      const code = String(payload.code || '').trim();
      let user;
      if (payload.role === 'teacher' && code === this.data.teacherCode) user = TEACHER;
      if (payload.role === 'student') {
        const student = this.data.students.find(s => s.active && s.code === code);
        if (student) user = { id: student.id, name: student.name, role: 'student' };
      }
      if (!user) throw new Error('Неверный код или пароль. Проверьте ввод.');
      const token = id();
      const expiresAt = this.now() + DAY;
      this.data.sessions[token] = { user: clone(user), expiresAt };
      this.save();
      return { token, user: clone(user), expiresAt: new Date(expiresAt).toISOString() };
    }
    const user = this.user(session_token);
    if (action === 'state') return this.publicState(user);
    if (action === 'logout') { delete this.data.sessions[session_token]; this.save(); return { ok: true }; }
    let result = { ok: true };
    if (action === 'book') {
      const slot = this.slot(payload.slotId);
      const studentId = user.role === 'teacher' ? payload.studentId : user.id;
      this.checkNew(slot, user, studentId);
      slot.bookingId = id(); slot.studentId = studentId;
    } else if (action === 'cancel') {
      const old = this.booking(payload.bookingId, user);
      old.bookingId = null; old.studentId = null;
      if (old.closedAfterCancel) old.open = false;
    } else if (action === 'move') {
      const old = this.booking(payload.bookingId, user);
      const target = this.slot(payload.slotId);
      this.checkNew(target, user, old.studentId, old);
      target.bookingId = id(); target.studentId = old.studentId;
      old.bookingId = null; old.studentId = null;
      if (old.closedAfterCancel) old.open = false;
    } else if (action === 'add_student') {
      this.requireTeacher(user);
      const name = String(payload.name || '').trim();
      if (name.length < 1 || name.length > 80) throw new Error('Введите имя ученика, не более 80 символов.');
      const student = { id: id(), name, active: true, code: `DEMO-${id().slice(0, 8).toUpperCase()}` };
      this.data.students.push(student);
      result = { student: { id: student.id, name, active: true }, code: student.code };
    } else if (action === 'reset_code') {
      this.requireTeacher(user);
      const student = this.data.students.find(s => s.id === payload.studentId);
      if (!student) throw new Error('Ученик не найден.');
      student.code = `DEMO-${id().slice(0, 8).toUpperCase()}`;
      for (const [token, session] of Object.entries(this.data.sessions)) if (session.user.id === student.id) delete this.data.sessions[token];
      result = { code: student.code };
    } else if (action === 'set_student_active') {
      this.requireTeacher(user);
      const student = this.data.students.find(s => s.id === payload.studentId);
      if (!student) throw new Error('Ученик не найден.');
      student.active = Boolean(payload.active);
      if (!student.active) for (const [token, session] of Object.entries(this.data.sessions)) if (session.user.id === student.id) delete this.data.sessions[token];
    } else if (action === 'add_slot') {
      this.requireTeacher(user);
      if (!['main', 'alina'].includes(payload.teacherId) || !/^2026-11-(1[7-9]|2\d|30)$/.test(payload.date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.time || '')) throw new Error('Проверьте преподавателя, дату и время. Доступно 17–30 ноября.');
      const start = Date.parse(`${payload.date}T${payload.time}:00+03:00`);
      if (start <= this.now()) throw new Error('Нельзя добавить прошедшее время.');
      if (this.data.slots.some(s => s.teacherId === payload.teacherId && Date.parse(s.startsAt) < start + HOUR && Date.parse(s.endsAt) > start)) throw new Error('Время пересекается с другим занятием этого преподавателя.');
      this.data.slots.push({ id: id(), teacherId: payload.teacherId, date: payload.date, time: payload.time,
        startsAt: new Date(start).toISOString(), endsAt: new Date(start + HOUR).toISOString(), open: true,
        bookingId: null, studentId: null, recurring: false });
    } else if (action === 'set_slot_open') {
      this.requireTeacher(user);
      const slot = this.slot(payload.slotId);
      if (slot.bookingId) throw new Error('Сначала отмените запись ученика.');
      slot.open = Boolean(payload.open);
    } else if (action === 'change_password') {
      this.requireTeacher(user);
      if (payload.currentPassword !== this.data.teacherCode) throw new Error('Текущий пароль неверен.');
      if (String(payload.newPassword || '').length < 12) throw new Error('Новый пароль должен содержать не менее 12 символов.');
      this.data.teacherCode = payload.newPassword;
      for (const [token, session] of Object.entries(this.data.sessions)) if (session.user.role === 'teacher' && token !== session_token) delete this.data.sessions[token];
    } else throw new Error('Неизвестное действие.');
    this.save();
    return result;
  }
}
