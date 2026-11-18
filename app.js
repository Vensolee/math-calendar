import {DemoApi} from './demo-api.js';

const config = window.TUTOR_CONFIG || {};
const demo = !config.supabaseUrl && !config.supabasePublishableKey;
const demoApi = demo ? new DemoApi() : null;
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const SESSION = `math-time-session-${demo ? 'demo' : 'live'}`;
const HOUR = 3600000;
const week = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const startDate = '2026-11-17';
const endDate = '2027-05-31';
let choosingTeacher = true;
const monthNames = ['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
let token = '';
try { token = sessionStorage.getItem(SESSION) || ''; } catch {}
let data = null, teacher = 'main', selected = '2026-11-18', section = 'calendar';
let role = new URLSearchParams(location.search).get('view') === 'teacher' ? 'teacher' : 'student';
let moving = null, busy = false, serverOffset = 0, toastTimer;

const paths = {
  arrow:'M5 12h14m-5-5 5 5-5 5', left:'m14 6-6 6 6 6', right:'m10 6 6 6-6 6',
  calendar:'M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z',
  clock:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  lock:'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',
  check:'m5 12 4 4L19 6', close:'m6 6 12 12M6 18 18 6', plus:'M12 5v14M5 12h14',
  user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3',
  users:'M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 21v-3a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v3M17 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3',
  key:'M14 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0Zm-1 4 8 8m-4-4 3-3',
  copy:'M8 8h13v13H8zM16 8V3H3v13h5', download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  move:'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4', leaf:'M20 3C8 2 2 8 5 15c4 8 15 3 15-12ZM5 20 16 8',
  logout:'M9 3H3v18h6m5-14 5 5-5 5M8 12h13', settings:'M4 7h16M4 17h16M8 4v6m8 4v6', link:'m10 14 4-4M9 17l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0 8a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1',
  ban:'m5 5 14 14M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.calendar}"/></svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isTeacher = () => data?.user.role === 'teacher';
const now = () => demo && data ? Date.parse(data.serverNow) : Date.now() + serverOffset;
const today = () => new Date(now() + 3 * HOUR).toISOString().slice(0,10);
const dateObj = date => new Date(`${date}T12:00:00+03:00`);
const dateLabel = (date, opts = {day:'numeric',month:'long'}) => dateObj(date).toLocaleDateString('ru-RU',{timeZone:'Europe/Minsk',...opts});
const clockLabel = time => new Date(time).toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
const teacherName = id => id === 'alina' ? 'Алина' : 'София';
const groupClass = id => id === 'alina' ? 'group-alina' : 'group-sofia';
const portraitUrl = id => data?.portraits?.[id] || (id === 'main' ? './sofia.jpg' : './alina.jpg');
const teacherEventName = id => id === 'alina' ? 'Занятие с Алиной' : 'Занятие с Софией';
const endTime = s => new Date(s.endsAt).toLocaleTimeString('ru-RU',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'});
const slotById = id => data.slots.find(s => s.id === id);
const bookingById = id => data.slots.find(s => s.bookingId === id);
const canChange = s => isTeacher() || Date.parse(s.startsAt) - now() >= 2 * HOUR;
const pluralWindows = n => n % 10 === 1 && n % 100 !== 11 ? 'окошко' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'окошка' : 'окошек';
function canBook(s) {
  return s.status === 'free' && s.date <= endDate && Date.parse(s.startsAt) > now()
    && (isTeacher() || (s.date > today() && Date.parse(s.startsAt) <= now() + 168 * HOUR));
}

async function api(action,payload = {}) {
  if (demo) return demoApi.call(action,payload,token);
  let base;
  try { base = new URL(config.supabaseUrl); } catch { throw new Error('Укажите правильный адрес проекта Supabase в config.js.'); }
  if (base.protocol !== 'https:' || !config.supabasePublishableKey) throw new Error('Проверьте адрес Supabase и открытый ключ в config.js.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(),18000);
  let response;
  try {
    response = await fetch(`${base.origin}/rest/v1/rpc/tutor_api`, {
      method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabasePublishableKey},
      body:JSON.stringify({action,payload,session_token:token || null}),signal:controller.signal,cache:'no-store'
    });
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'Сервер долго не отвечает. Попробуйте ещё раз.' : 'Не удалось связаться с расписанием. Проверьте интернет и настройки сайта.'); }
  finally { clearTimeout(timeout); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(result.error || result.message || 'Не удалось выполнить действие. Обновите расписание.');
  return result;
}
function toast(message,error = false) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.className = `toast visible${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'),6500);
}
async function refresh(renderView = true) {
  data = await api('state'); serverOffset = Date.parse(data.serverNow) - Date.now();
  if (renderView) render();
}
function brand() { return `<div class="brand"><div class="brand-mark">м</div><div>Время математики<small>Всё начинается с понимания</small></div></div>`; }
function topbar(logged = false) {
  return `<header class="topbar">${brand()}<div class="top-links"><span class="top-note"><i class="pill-dot"></i>Занятия в вашем ритме</span>${logged ? `<div class="account"><div class="avatar ${isTeacher() ? '' : groupClass(data.user.owner)}">${isTeacher() ? icon('leaf') : esc(data.user.name.slice(0,1))}</div><span>${isTeacher() ? 'Кабинет репетиторов' : esc(data.user.name)}</span><button class="btn ghost small" data-action="logout" title="Выйти">${icon('logout')}<span>Выйти</span></button></div>` : `<span class="top-note">Время Минска</span>`}</div></header>`;
}
function demoBanner() { return demo ? `<div class="demo-banner"><strong>Демонстрация сайта.</strong> Пример на 17 ноября 2026, 12:00. Записи хранятся только в этой вкладке. Для настоящей записи подключите базу по инструкции.</div>` : ''; }
function loginView() {
  document.body.classList.remove('alina-theme');
  app.innerHTML = `${demoBanner()}${topbar()}<main class="login"><section><div class="eyebrow">Математика без пробелов</div><h1>Для знаний<br>найдётся <em>время.</em></h1><p class="login-copy">Выберите удобное занятие в календаре.<br>Спокойно, самостоятельно, в своём ритме.</p><div class="login-art" aria-hidden="true"><span class="formula">a² + b² = c²</span><i class="art-line"></i><i class="art-leaf"></i><i class="art-leaf two"></i><i class="art-leaf three"></i></div><div class="login-caption"><span><i class="icon">${icon('clock')}</i>60 минут на понимание</span><span><i class="icon">${icon('leaf')}</i>Два преподавателя</span></div></section><section class="login-card"><h2>Добро пожаловать</h2><p>${role === 'teacher' ? 'Войдите, чтобы управлять расписанием и кодами учеников.' : 'Ваше расписание начинается с личного кода.'}</p><div class="segmented" aria-label="Тип входа"><button data-action="role" data-role="student" class="${role === 'student' ? 'active' : ''}">Я ученик</button><button data-action="role" data-role="teacher" class="${role === 'teacher' ? 'active' : ''}">Я репетитор</button></div><form id="login-form"><label class="section-label" for="login-code">${role === 'teacher' ? 'Пароль репетиторов' : 'Индивидуальный код'}</label><input id="login-code" name="code" type="password" autocomplete="current-password" spellcheck="false" placeholder="${role === 'teacher' ? 'Введите пароль' : 'Введите ваш личный код'}" required maxlength="150" class="login-input"><p class="small-note">${role === 'teacher' ? 'Один общий пароль для двух репетиторов.' : 'Получите свой код у репетитора. Он открывает оба расписания.'}</p><div id="login-error" class="inline-error hidden" role="alert"></div><button class="btn full" type="submit" style="margin-top:24px">Войти в расписание ${icon('arrow')}</button></form><div class="security-note">${icon('lock')}<span>Личный код защищает ваши записи. Другие ученики не видят ваше имя и не могут менять ваши занятия.</span></div>${demo ? `<div class="login-demo">Посмотрите, как всё устроено, на примере.<br><button class="btn secondary full small" data-action="demo-login">Открыть ${role === 'teacher' ? 'кабинет репетитора' : 'календарь ученика'} ${icon('arrow')}</button></div>` : ''}</section></main>`;
}
function calendarView() {
  const [year, month] = selected.split('-').map(Number);
  const prefix = selected.slice(0, 8);
  const first = new Date(Date.UTC(year,month-1,1));
  const offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(year,month,0)).getUTCDate();
  const cells = Array.from({length:offset},() => '<div aria-hidden="true"></div>');
  for(let n=1;n<=last;n++) {
    const date = prefix + String(n).padStart(2,'0');
    const slots = data.slots.filter(s => s.teacherId === teacher && s.date === date);
    const available = slots.filter(canBook).length;
    const booked = slots.filter(s => s.status === 'booked').length;
    const past = date < today();
    const label = `${dateLabel(date,{weekday:'long',day:'numeric',month:'long'})}, свободно ${available}, занято ${booked}`;
    cells.push(`<button class="day${date === selected ? ' selected' : ''}${past ? ' past' : ''}${date === today() ? ' today' : ''}" data-action="date" data-date="${date}" aria-pressed="${date === selected}" aria-label="${esc(label)}"><span class="day-number">${n}</span>${available ? `<span class="day-count">${available} своб.</span>` : `<span class="day-dots">${slots.slice(0,5).map(s => `<i class="${s.status === 'booked' ? 'booked' : 'locked'}"></i>`).join('')}</span>`}</button>`);
  }
  return `<section class="card calendar" aria-label="Календарь"><div class="card-heading"><h2>${monthNames[month]} <span class="year">${year}</span></h2><div class="month-controls"><span class="month-label">Выберите дату</span><button class="square-btn" data-action="month" data-step="-1" ${prefix === startDate.slice(0,8) ? 'disabled' : ''} aria-label="Предыдущий месяц">${icon('left')}</button><button class="square-btn" data-action="month" data-step="1" ${prefix === endDate.slice(0,8) ? 'disabled' : ''} aria-label="Следующий месяц">${icon('right')}</button></div></div><div class="weekdays">${week.map(d => `<span>${d}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div><div class="calendar-legend"><span><i class="pill-dot"></i> Есть свободные</span><span><i class="pill-dot" style="background:#b2a7b9"></i> Занято</span><span><i class="pill-dot" style="background:#ced6cf"></i> Запись закрыта</span></div></section>`;
}
function slotRow(s) {
  const available = canBook(s);
  const passed = Date.parse(s.startsAt) <= now();
  let label = 'Свободно', control = '', kind = available ? 'free' : '';
  if (s.status === 'booked') {
    kind = s.own ? 'own' : 'booked';
    label = isTeacher() ? s.studentName + (s.recurring ? ' · постоянное время' : '') : s.own ? 'Ваша запись' : 'Занято';
    control = `${icon('lock')}`;
    if ((isTeacher() || s.own) && !moving && !passed) control = `<div class="booked-actions"><button data-action="ics" data-id="${esc(s.id)}" title="Добавить в календарь">${icon('download')}</button><button data-action="move" data-id="${esc(s.id)}" ${canChange(s) ? '' : 'disabled'}>Перенести</button><button data-action="cancel" data-id="${esc(s.id)}" ${canChange(s) ? '' : 'disabled'} title="Отменить">${icon('close')}</button></div>`;
  } else if (s.status === 'closed') { label = 'Окошко закрыто'; control = icon('lock'); }
  else if (available) control = `<button class="btn small" data-action="book" data-id="${esc(s.id)}">${moving ? 'Выбрать' : 'Записаться'} ${icon('plus')}</button>`;
  else { label = passed ? 'Время прошло' : s.date <= today() ? 'На сегодня запись закрыта' : `Откроется ${clockLabel(Date.parse(s.startsAt) - 168 * HOUR)}`; control = icon('lock'); }
  return `<div class="slot ${kind}"><div><div class="slot-time">${esc(s.time)} <span>— ${endTime(s)}</span></div><div class="slot-label">${esc(label)}</div></div><div class="${control.includes('button') ? '' : 'icon'}" style="color:var(--muted)">${control}</div></div>${isTeacher() && s.status !== 'booked' && !passed ? `<div class="admin-switches"><button class="text-button" style="font-size:9px" data-action="slot-open" data-id="${esc(s.id)}" data-open="${s.status === 'closed'}">${s.status === 'closed' ? 'Открыть это окошко' : 'Закрыть это окошко'}</button></div>` : ''}`;
}
function slotsView() {
  const slots = data.slots.filter(s => s.date === selected && s.teacherId === teacher);
  const count = slots.filter(canBook).length;
  const empty = 'На этот день окошек пока нет';
  const detail = isTeacher() ? 'Вы можете добавить время для записи.' : 'Выберите другой день или преподавателя.';
  return `<section class="card slots-panel" aria-live="polite"><div class="card-heading"><h2>${dateLabel(selected)}</h2><span class="count-badge">${count} ${pluralWindows(count)} свободно</span></div><p class="day-subtitle">${dateLabel(selected,{weekday:'long'})} · время Минска · 60 минут</p>${slots.length ? slots.map(slotRow).join('') : `<div class="empty-state"><div class="empty-icon">${icon('calendar')}</div><h3>${empty}</h3><p>${detail}</p>${`<button class="btn secondary small" data-action="teacher" data-teacher="${teacher === 'main' ? 'alina' : 'main'}">Другой преподаватель ${icon('arrow')}</button>`}</div>`}${teacher === 'main' ? `<div class="alt-note">Если нет возможности записаться ко мне, вы можете позаниматься с <button class="text-button" data-action="teacher" data-teacher="alina">Алиной</button> и не растить пробелы в знаниях.</div>` : `<div class="alt-note">Личный код открывает оба расписания. Вы можете выбирать удобные занятия у любого преподавателя.</div>`}${isTeacher() && selected <= endDate && selected >= today() ? `<button class="btn secondary full small" style="margin-top:16px" data-action="add-slot">${icon('plus')} Добавить окошко</button>` : ''}</section>`;
}
function upcomingView() {
  const bookings = data.slots.filter(s => s.bookingId && (isTeacher() || s.own) && Date.parse(s.endsAt) > now()).sort((a,b) => a.startsAt.localeCompare(b.startsAt));
  return `<section class="card upcoming"><div class="card-heading"><h2>${isTeacher() ? 'Ближайшие занятия' : 'Мои занятия'}</h2><span class="count-badge">${bookings.length}</span></div>${bookings.length ? `<div class="upcoming-list">${bookings.map(s => `<article class="booking-card"><div class="date-tile"><b>${dateObj(s.date).getUTCDate()}</b><span>${dateLabel(s.date,{month:'short'})}</span></div><div class="booking-info"><h3>${esc(s.time)} — ${endTime(s)}</h3><p>${teacherEventName(s.teacherId)}${isTeacher() ? `<br>${esc(s.studentName)}${s.recurring ? ' · постоянное время' : ''}` : ''}</p><div class="booking-actions"><button data-action="ics" data-id="${esc(s.id)}">${icon('download')} Добавить в календарь</button><button data-action="move" data-id="${esc(s.id)}" ${canChange(s) ? '' : 'disabled'}>${icon('move')} Перенести</button><button class="cancel" data-action="cancel" data-id="${esc(s.id)}" ${canChange(s) ? '' : 'disabled'}>Отменить</button></div>${!canChange(s) ? `<p style="margin-top:8px">До занятия меньше 2 часов. Для изменений обратитесь к репетитору.</p>` : ''}</div></article>`).join('')}</div>` : `<p class="mini-empty">Пока занятий нет. Выберите преподавателя, дату и удобное свободное время.</p>`}</section>`;
}
function studentsView() {
  return `<section class="card admin-panel"><div class="card-heading"><h2>Ученики и личные коды</h2><button class="btn small" data-action="add-student">${icon('plus')} Добавить ученика</button></div><p class="admin-help">У каждого ученика свой код. Он даёт доступ к обоим расписаниям и только к собственным записям. Созданный код показывается один раз — сохраните его и передайте ученику лично.</p><div class="student-grid">${(data.students || []).map(s => `<article class="student-item"><div class="avatar ${groupClass(s.owner)}">${esc(s.name.slice(0,1))}</div><div class="student-details"><b>${esc(s.name)}</b><p>Репетитор · ${teacherName(s.owner)}</p><p>${!s.active ? 'Доступ отключён' : s.hasCode === false ? 'Нужно выдать код' : 'Доступ активен'}</p></div><div class="student-controls"><button data-action="reset-code" data-id="${esc(s.id)}" title="Выдать новый код">${icon('key')}</button><button data-action="student-active" data-id="${esc(s.id)}" title="${s.active ? 'Отключить доступ' : 'Включить доступ'}">${icon(s.active ? 'ban' : 'check')}</button></div></article>`).join('')}</div></section>`;
}
function linkFor(view) {
  const url = new URL(location.href); url.search = ''; url.hash = '';
  if (view === 'teacher') url.searchParams.set('view','teacher');
  return url.href;
}
function portraitSettings() {
  const controls = ['main','alina'].map(id => `<div class="profile-edit" data-teacher="${id}">
    <img src="${esc(portraitUrl(id))}" alt=""><div><strong>${teacherName(id)}</strong>
    <label class="upload-photo">Заменить фотографию<input type="file" accept="image/jpeg,image/png,image/webp" data-photo="${id}" aria-label="Заменить фотографию: ${teacherName(id)}"></label></div></div>`);
  return `<section class="card admin-panel"><h2>Фотографии репетиторов</h2>${controls.join('')}</section>`;
}
async function portraitData(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 16 * 1024 * 1024)
    throw new Error('Выберите JPG, PNG или WebP до 16 МБ.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = Math.min(image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 384;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,384,384);
    ctx.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,384,384);
    return canvas.toDataURL('image/jpeg',0.82);
  } finally { URL.revokeObjectURL(url); }
}
document.addEventListener('change',async event => {
  const input = event.target;
  if (!input.matches('input[data-photo]') || !input.files.length || !isTeacher() || busy) return;
  busy = true;
  try {
    const photo = await portraitData(input.files[0]);
    await mutate('set_portrait',{teacherId:input.dataset.photo,photo},'Фотография обновлена');
  } catch (error) { toast(error.message,true); }
  finally { busy=false; input.value=''; }
});
function settingsView() {
  return `${portraitSettings()}<section class="card admin-panel"><div class="card-heading"><h2>Ссылки и доступ</h2></div><div class="links-grid"><div class="link-box"><h3>Ссылка для учеников</h3><code>${esc(linkFor('student'))}</code><p>Отправьте ученику эту ссылку и отдельно его личный код. Ссылка одна для всех учеников.</p><button class="btn secondary small" data-action="copy-link" data-view="student">${icon('copy')} Скопировать ссылку</button></div><div class="link-box"><h3>Ссылка для репетиторов</h3><code>${esc(linkFor('teacher'))}</code><p>Вы с Алиной входите по общему паролю. Сама ссылка не открывает управление расписанием.</p><button class="btn secondary small" data-action="copy-link" data-view="teacher">${icon('copy')} Скопировать ссылку</button></div></div><div class="security-note">${icon('lock')}<span>Пароль репетиторов нельзя передавать ученикам. Если ученик потерял свой код, выдайте новый во вкладке «Ученики». Старый код и старые сеансы перестанут работать.</span></div><button class="btn secondary small" style="margin-top:20px" data-action="password">${icon('key')} Сменить общий пароль</button></section>`;
}
function welcomeView() {
  const cards = ['main', 'alina'].map(id => {
    const name = teacherName(id);
    const photo = portraitUrl(id);
    return `<button class="tutor-choice" data-action="teacher" data-teacher="${id}">
      <span class="portrait" aria-hidden="true"><span>${id === 'main' ? 'С' : 'А'}</span><img src="${esc(photo)}" alt="" hidden></span>
      <span>${name}</span>${icon('right')}</button>`;
  });
  app.innerHTML = `${demoBanner()}${topbar(true)}<main class="welcome">
    <div class="abc" aria-hidden="true">A · B · C</div>
    <h1>Добро пожаловать<span>, ${esc(data.user.name)}</span>!</h1>
    <p>Выберите репетитора, к которому вы хотите записаться.</p>
    <div class="tutor-list">${cards.join('')}</div></main>`;
  for (const image of app.querySelectorAll('.portrait img')) {
    const reveal = () => { if (image.naturalWidth) image.hidden = false; };
    image.addEventListener('load', reveal, {once:true});
    reveal();
  }
}
function selectInitialDate() {
  selected = data.slots.find(s => s.teacherId === teacher && canBook(s))?.date
    || (today() < startDate ? startDate : today() > endDate ? endDate : today());
}
function render() {
  if (!data) return loginView();
  document.body.classList.toggle('alina-theme',teacher === 'alina');
  const me = isTeacher();
  if (!me && choosingTeacher) return welcomeView();
  app.innerHTML = `${demoBanner()}${topbar(true)}<main class="shell"><div class="page-heading"><h1>${me ? 'Ваше расписание' : teacherName(teacher)}</h1>${me ? '' : '<button class="btn secondary small" data-action="choose-teacher">Сменить репетитора</button>'}</div>${me ? `<nav class="teacher-tabs" aria-label="Расписание преподавателя">${['main','alina'].map(id => `<button class="teacher-tab ${teacher === id ? 'active' : ''}" data-action="teacher" data-teacher="${id}" aria-pressed="${teacher === id}">${teacherName(id)}</button>`).join('')}</nav>` : ''}${me ? `<nav class="subnav" aria-label="Управление"><button data-action="section" data-section="calendar" class="${section === 'calendar' ? 'active' : ''}">Расписание</button><button data-action="section" data-section="students" class="${section === 'students' ? 'active' : ''}">Ученики</button><button data-action="section" data-section="settings" class="${section === 'settings' ? 'active' : ''}">Ссылки и доступ</button></nav>` : ''}${section === 'students' && me ? studentsView() : section === 'settings' && me ? settingsView() : `<div class="rule-strip"><span class="rule-item">${icon('calendar')}Запись на 7 суток вперёд</span><span class="rule-item">${icon('clock')}Отмена и перенос за 2 часа</span><span class="rule-item">${icon('lock')}На сегодня запись закрыта</span><span class="rule-item">${icon('leaf')}Время Минска · 60 минут</span></div>${moving ? `<div class="move-banner"><span><strong>Перенос занятия ${dateLabel(moving.date)}, ${esc(moving.time)}.</strong><br>Выберите новое свободное время у любого преподавателя. До подтверждения старая запись сохраняется.</span><button class="btn secondary small" data-action="stop-move">Не переносить</button></div>` : ''}<div class="workspace">${calendarView()}${slotsView()}</div><p class="selected-note">${me ? 'Репетиторы могут управлять всем расписанием до 31 мая 2027 года. Ограничения записи и 2 часов действуют для учеников.' : `Сейчас запись доступна с завтрашнего дня до ${clockLabel(Math.min(now() + 168 * HOUR,Date.parse(endDate + 'T23:59:59+03:00')))} включительно. На более поздние часы запись откроется ровно за 7 суток.`}</p>${upcomingView()}`}<footer class="footer"><span>Время математики</span><span>Спокойный ритм. Уверенные знания.</span><span>Время Минска · UTC+3</span></footer></main>`;
}
function openModal(title,content) {
  modal.innerHTML = `<div class="dialog-top"><h2 id="modal-title">${title}</h2><button class="close-btn" data-action="close-modal" aria-label="Закрыть">${icon('close')}</button></div>${content}`;
  if (!modal.open) modal.showModal();
}
function summary(s) { return `<div class="dialog-summary"><span>${teacherEventName(s.teacherId)}</span><b>${dateLabel(s.date)}, ${esc(s.time)}</b><span>${dateLabel(s.date,{weekday:'long'})} · до ${endTime(s)} · время Минска</span></div>`; }
function bookDialog(s) {
  if (!canBook(s)) return toast('Это время уже недоступно. Обновите расписание.',true);
  if (moving && !canChange(moving)) { moving=null; render(); return toast('До исходного занятия осталось меньше двух часов. Перенос закрыт.',true); }
  openModal(moving ? 'Перенести занятие?' : 'Записаться на занятие?',`${summary(s)}${moving ? `<p class="dialog-copy">Ваша запись ${dateLabel(moving.date)}, ${esc(moving.time)} будет перенесена сюда. Старое окошко автоматически освободится.</p>` : '<p class="dialog-copy">Занятие длится 60 минут. Отменить или перенести запись можно не позднее чем за 2 часа до начала.</p>'}<form id="book-form" data-id="${esc(s.id)}">${isTeacher() && !moving ? `<label class="section-label" for="booking-student">Ученик</label><select id="booking-student" name="studentId" required><option value="">Выберите ученика</option>${data.students.filter(st => st.active).map(st => `<option value="${esc(st.id)}">${esc(st.name)}</option>`).join('')}</select>` : ''}<div class="dialog-buttons"><button class="btn secondary" type="button" data-action="close-modal">Назад</button><button class="btn" type="submit">${icon('check')} Подтвердить ${moving ? 'перенос' : 'запись'}</button></div></form>`);
}
function cancelDialog(s) {
  if (!canChange(s)) return toast('Отмена возможна не позднее чем за 2 часа.',true);
  openModal('Отменить занятие?',`${summary(s)}<p class="dialog-copy">${s.recurring ? 'Отменится только эта дата. Остальные постоянные занятия сохранятся.' : 'Окошко освободится после подтверждения.'}</p><div class="dialog-buttons"><button class="btn secondary" data-action="close-modal">Оставить запись</button><button class="btn danger" data-action="confirm-cancel" data-id="${esc(s.id)}">Отменить занятие</button></div>`);
}
function addStudentDialog() {
  openModal('Новый ученик',`<p class="dialog-copy">Имя видно только самому ученику и репетиторам.</p><form id="student-form"><label class="section-label" for="student-name">Имя ученика</label><input id="student-name" name="name" required maxlength="80" placeholder="Например, Саша"><label class="section-label" for="group-owner">Чей ученик?</label><select id="group-owner" name="owner"><option value="main">София · бирюзовый</option><option value="alina">Алина · красный</option></select><div class="dialog-buttons"><button class="btn" type="submit">Создать личный код ${icon('key')}</button></div></form>`);
}
function showCode(code,name) {
  openModal('Личный код готов',`<p class="dialog-copy">Код для ученика <strong>${esc(name)}</strong>. Скопируйте и передайте его лично. Повторно посмотреть код нельзя, но можно создать новый.</p><div class="secret-code">${esc(code)}</div><div class="dialog-buttons"><button class="btn secondary" data-action="close-modal">Готово</button><button class="btn" data-action="copy-code" data-code="${esc(code)}">${icon('copy')} Скопировать</button></div>`);
}
function addSlotDialog() {
  openModal('Добавить окошко',`<p class="dialog-copy">Новое занятие длится 60 минут. Добавляется только выбранная дата.</p><form id="slot-form"><label class="section-label" for="slot-teacher">Преподаватель</label><select id="slot-teacher" name="teacherId"><option value="main" ${teacher === 'main' ? 'selected' : ''}>София</option><option value="alina" ${teacher === 'alina' ? 'selected' : ''}>Алина</option></select><div class="split-fields" style="margin-top:18px"><div><label class="section-label" for="slot-date">Дата</label><input type="date" id="slot-date" name="date" min="${today()}" max="${endDate}" value="${selected}" required></div><div><label class="section-label" for="slot-time">Начало</label><input type="time" id="slot-time" name="time" value="12:00" max="23:00" required></div></div><div class="dialog-buttons"><button class="btn" type="submit">${icon('plus')} Добавить</button></div></form>`);
}
async function copy(value) {
  try { await navigator.clipboard.writeText(value); toast('Скопировано'); }
  catch { openModal('Скопируйте текст',`<p class="dialog-copy">Выделите текст и скопируйте его вручную.</p><div class="secret-code" style="font-size:14px">${esc(value)}</div><div class="dialog-buttons"><button class="btn" data-action="close-modal">Готово</button></div>`); }
}
function downloadCalendar(s) {
  const stamp = value => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const escapeIcs = value => String(value).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const fold = line => { let out='', bytes=0; for(const char of line) {const size=new TextEncoder().encode(char).length;if(bytes+size>74){out+='\r\n ';bytes=1;}out+=char;bytes+=size;}return out; };
  const title = teacherEventName(s.teacherId) + (isTeacher() && s.studentName ? ` · ${s.studentName}` : '');
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Math Time//Lessons//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${s.bookingId || s.id}@math-time.local`,`DTSTAMP:${stamp(now())}`,`DTSTART:${stamp(s.startsAt)}`,`DTEND:${stamp(s.endsAt)}`,`SUMMARY:${escapeIcs(title)}`,`DESCRIPTION:${escapeIcs('Занятие по математике. Время указано по Минску. Изменяйте запись на сайте расписания.')}`,'END:VEVENT','END:VCALENDAR'];
  const blob = new Blob([lines.map(fold).join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `matematika-${s.date}-${s.time.replace(':','')}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  toast('Файл календаря скачан. Откройте его, чтобы добавить занятие. После переноса скачайте новое событие.');
}
async function mutate(action,payload,message) {
  const result = await api(action,payload); await refresh(); if(message) toast(message); return result;
}
async function logout() {
  try { await api('logout'); } catch {}
  token=''; data=null; moving=null; section='calendar';
  try { sessionStorage.removeItem(SESSION); } catch {}
  render();
}
async function login(code) {
  const result = await api('login',{code,role}); token=result.token;
  try { sessionStorage.setItem(SESSION,token); } catch {}
  await refresh(false); section='calendar';
  teacher = 'main'; choosingTeacher = true; selectInitialDate();
  render();
}

document.addEventListener('click',async event => {
  const button = event.target.closest('[data-action]'); if(!button || button.disabled) return;
  const action = button.dataset.action, id = button.dataset.id;
  if(action === 'close-modal') { modal.close(); return; }
  if(action === 'role') { role=button.dataset.role; loginView(); return; }
  if(action === 'choose-teacher') { choosingTeacher=true; render(); return; }
  if(action === 'teacher') { teacher=button.dataset.teacher; if (choosingTeacher && !isTeacher() && !moving) selectInitialDate(); choosingTeacher=false; section='calendar'; render(); return; }
  if(action === 'section') { section=button.dataset.section; render(); return; }
  if(action === 'date') { selected=button.dataset.date; render(); return; }
  if(action === 'month') { const [year, month] = selected.split('-').map(Number); selected=new Date(Date.UTC(year, month-1+Number(button.dataset.step), 1)).toISOString().slice(0,10); render(); return; }
  if(action === 'stop-move') { moving=null; render(); return; }
  if(action === 'copy-link') return copy(linkFor(button.dataset.view));
  if(action === 'copy-code') return copy(button.dataset.code);
  if(action === 'ics') return downloadCalendar(slotById(id));
  if(action === 'book') return bookDialog(slotById(id));
  if(action === 'cancel') return cancelDialog(slotById(id));
  if(action === 'move') {
    const s=slotById(id); if(!canChange(s)) return toast('Перенос закрыт: осталось меньше двух часов.',true);
    moving={...s}; section='calendar'; teacher=s.teacherId; selected=s.date; render(); window.scrollTo({top:0,behavior:'smooth'}); return;
  }
  if(action === 'add-student') return addStudentDialog();
  if(action === 'add-slot') return addSlotDialog();
  if(action === 'password') return openModal('Сменить общий пароль',`<p class="dialog-copy">Новый пароль будет общим для вас и Алины. Остальные сеансы репетиторов завершатся.</p><form id="password-form"><label class="section-label" for="old-password">Текущий пароль</label><input type="password" id="old-password" name="currentPassword" autocomplete="current-password" required><label class="section-label" for="new-password" style="margin-top:20px">Новый пароль · 16–64 латинских символа</label><input type="password" id="new-password" name="newPassword" autocomplete="new-password" minlength="16" maxlength="64" required><div class="dialog-buttons"><button class="btn" type="submit">Сохранить пароль</button></div></form>`);
  if(action === 'reset-code') {
    const st=data.students.find(s=>s.id===id);
    return openModal('Выдать новый код?',`<p class="dialog-copy">Ученик <strong>${esc(st.name)}</strong> получит новый личный код. Старый код и старые сеансы входа перестанут работать. Все занятия сохранятся.</p><div class="dialog-buttons"><button class="btn secondary" data-action="close-modal">Назад</button><button class="btn" data-action="confirm-reset" data-id="${esc(id)}">Создать код</button></div>`);
  }
  if(action === 'student-active') {
    const st=data.students.find(s=>s.id===id);
    return openModal(st.active ? 'Отключить доступ?' : 'Включить доступ?',`<p class="dialog-copy">${esc(st.name)}: ${st.active ? 'ученик не сможет входить и менять занятия. Существующие записи сохранятся.' : 'ученик снова сможет входить по своему коду.'}</p><div class="dialog-buttons"><button class="btn secondary" data-action="close-modal">Назад</button><button class="btn" data-action="confirm-active" data-id="${esc(id)}" data-active="${!st.active}">Подтвердить</button></div>`);
  }
  if(busy) return; busy=true; button.disabled=true;
  try {
    if(action === 'logout') await logout();
    else if(action === 'demo-login') await login(role === 'teacher' ? 'TEACHER-DEMO' : 'STUDENT-DEMO');
    else if(action === 'confirm-cancel') { const s=slotById(id); await mutate('cancel',{bookingId:s.bookingId},'Занятие отменено'); modal.close(); }
    else if(action === 'confirm-reset') { const name=data.students.find(s=>s.id===id).name; const result=await api('reset_code',{studentId:id}); showCode(result.code,name); await refresh(); }
    else if(action === 'confirm-active') { await mutate('set_student_active',{studentId:id,active:button.dataset.active==='true'},'Доступ обновлён'); modal.close(); }
    else if(action === 'slot-open') await mutate('set_slot_open',{slotId:id,open:button.dataset.open==='true'},'Окошко обновлено');
  } catch(e) { toast(e.message,true); } finally { busy=false; button.disabled=false; }
});
document.addEventListener('submit',async event => {
  const form=event.target; if(!['login-form','book-form','student-form','slot-form','password-form'].includes(form.id)) return;
  event.preventDefault(); if(busy) return; busy=true;
  const button=form.querySelector('[type="submit"]'); button.disabled=true;
  const values=Object.fromEntries(new FormData(form));
  try {
    if(form.id === 'login-form') await login(role === 'teacher' ? values.code : values.code.trim());
    else if(form.id === 'book-form') {
      const s=slotById(form.dataset.id);
      await api(moving ? 'move' : 'book',moving ? {bookingId:moving.bookingId,slotId:s.id} : {slotId:s.id,...(isTeacher()?{studentId:values.studentId}:{})});
      const wasMoving=!!moving; moving=null; await refresh();
      const booked=slotById(s.id);
      openModal(wasMoving ? 'Занятие перенесено' : 'Вы записаны!',`${summary(booked)}<p class="dialog-copy">${wasMoving ? 'Старая запись освобождена. Обновите событие в своём календаре.' : 'Добавьте занятие в свой календарь, чтобы не забыть о нём.'}</p><div class="dialog-buttons"><button class="btn secondary" data-action="close-modal">Готово</button><button class="btn" data-action="ics" data-id="${esc(s.id)}">${icon('download')} Добавить в календарь</button></div>`);
    } else if(form.id === 'student-form') { const name=values.name.trim(); const result=await api('add_student',{name,owner:values.owner}); showCode(result.code,name); await refresh(); }
    else if(form.id === 'slot-form') { await api('add_slot',values); selected=values.date; teacher=values.teacherId; await refresh(); toast('Свободное окошко добавлено'); modal.close(); }
    else if(form.id === 'password-form') { if(new TextEncoder().encode(values.newPassword).length > 64) throw new Error('Пароль должен занимать не более 64 байт. Используйте 16–64 латинских буквы, цифры или знака.'); await api('change_password',values); modal.close(); await logout(); toast('Общий пароль изменён. Войдите с новым паролем.'); }
  } catch(e) {
    if(form.id === 'login-form') { const error=document.querySelector('#login-error'); if(error){error.textContent=e.message;error.classList.remove('hidden');} }
    else toast(e.message,true);
  } finally { busy=false; button.disabled=false; }
});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
function handleRefreshError(error,quiet = false) {
  if(/войдите|срок входа|код ученика отключ|время сеанса истекло/i.test(error.message)) {
    data=null;token='';moving=null;section='calendar';modal.close();
    try{sessionStorage.removeItem(SESSION);}catch{}
    render();toast('Сеанс завершён. Войдите по своему коду ещё раз.',true);
  } else if(!quiet) toast(error.message,true);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden && data && !busy && !modal.open) refresh().catch(e=>handleRefreshError(e));});
setInterval(()=>{if(data && !busy && !modal.open && !document.hidden) refresh().catch(e=>handleRefreshError(e,true));},30000);
async function init() {
  if(token) {
    try { await refresh(false); if(role==='teacher' && !isTeacher()) {data=null;token='';} else {role=data.user.role; selectInitialDate();} }
    catch {token='';data=null;try{sessionStorage.removeItem(SESSION);}catch{}}
  }
  render();
}
init();
