'use strict';

const $ = selector => document.querySelector(selector);
const login = $('[data-login]');
const workspace = $('[data-workspace]');
const account = $('[data-session]');
const logout = $('[data-logout]');
const selector = $('[data-room]');
const input = $('[data-note]');
const save = $('[data-save]');
const svg = 'http://www.w3.org/2000/svg';
const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' });
const area = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fields = 'request_id,room,author_name,body,created_at';
const drafts = new Map();
let plan;
let room;
let roomRequest = 0;
let recentRequest = 0;
let sessionRequest = 0;

function element(tag, attributes) {
  const node = document.createElementNS(svg, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function title(entry) {
  return '№ ' + (entry[0] === 16 ? '16–18' : entry[0]) + ' · ' + entry[1];
}

function findRoom(id) {
  return plan.rooms.find(entry => entry[0] === Number(id));
}

function result(response) {
  if (response.error) throw response.error;
  return response.data;
}

function byline(note) {
  return note.author_name + ' · ' + date.format(new Date(note.created_at));
}

function clearWorkspace() {
  sessionRequest++;
  roomRequest++;
  recentRequest++;
  workspace.hidden = true;
  $('[data-admin]').hidden = true;
  $('[data-admin-jump]').hidden = true;
  $('[data-admin] details').open = false;
  $('[data-members]').replaceChildren();
  $('[data-member-form]').reset();
  logout.hidden = true;
  login.hidden = false;
  account.textContent = '';
  $('[data-drawing]').removeAttribute('href');
  for (const section of ['[data-shapes]', '[data-labels]', '[data-notes]', '[data-recent]']) $(section).replaceChildren();
  for (const field of ['[data-title]', '[data-details]', '[data-initial]', '[data-admin-status]']) $(field).textContent = '';
  selector.replaceChildren();
  drafts.clear();
  input.value = '';
  plan = undefined;
}

function draw() {
  $('[data-drawing]').setAttribute('href', plan.drawing);
  for (const entry of plan.rooms) {
    const [id, , , , , x, y, points] = entry;
    const shape = element('polygon', { class: 'hit', points, 'data-room-id': id });
    const label = element('title', {});
    label.textContent = title(entry);
    shape.append(label);
    shape.addEventListener('click', () => showRoom(id));
    $('[data-shapes]').append(shape);
    const width = id === 16 ? 62 : 30;
    const plate = element('rect', { class: 'plate', x: x - width / 2, y: y - 13, width, height: 26, rx: 6 });
    const number = element('text', { class: 'number', x, y });
    number.textContent = id === 16 ? '16–18' : id;
    $('[data-labels]').append(plate, number);
    selector.add(new Option(title(entry), String(id)));
  }
}

function showRoom(id) {
  const entry = findRoom(id);
  if (!entry) return;
  room = id;
  selector.value = String(id);
  document.querySelectorAll('[data-room-id]').forEach(shape => shape.classList.toggle('active', Number(shape.dataset.roomId) === id));
  $('[data-title]').textContent = title(entry);
  const details = ['Монтаж ' + area.format(entry[2]) + ' м²'];
  if (entry[3] !== null) details.push('Демонтаж ' + area.format(entry[3]) + ' м²');
  if (plan.floors[entry[4]]) details.push(entry[4] + ' · ' + plan.floors[entry[4]]);
  $('[data-details]').textContent = details.join(' · ');
  const initial = $('[data-initial]');
  initial.hidden = !plan.initial[id];
  initial.textContent = plan.initial[id] ? 'С осмотра: ' + plan.initial[id] : '';
  input.value = drafts.get(id)?.body ?? '';
  $('[data-action-status]').textContent = '';
  $('[data-notes]').replaceChildren();
  $('[data-room-status]').textContent = 'Загрузка заметок…';
  void refreshRoom();
}

async function refreshRoom() {
  if (!plan) return;
  const selected = room;
  const request = ++roomRequest;
  const active = () => plan && room === selected && roomRequest === request;
  try {
    const notes = result(await client.from('olimpiets_notes').select(fields)
      .eq('room', selected).order('created_at', { ascending: false }).limit(200));
    if (!active()) return;
    $('[data-notes]').replaceChildren(...notes.map(note => {
      const item = document.createElement('li');
      const caption = document.createElement('strong');
      const body = document.createElement('p');
      caption.textContent = byline(note);
      body.textContent = note.body;
      item.append(caption, body);
      return item;
    }));
    $('[data-room-status]').textContent = notes.length ? '' : 'Общих заметок пока нет.';
  } catch (_) {
    if (active()) $('[data-room-status]').textContent = 'Заметки не загрузились. Нажмите «Обновить».';
  }
}

async function refreshRecent() {
  if (!plan) return;
  const request = ++recentRequest;
  try {
    const notes = result(await client.from('olimpiets_notes').select(fields)
      .order('created_at', { ascending: false }).limit(20));
    if (!plan || request !== recentRequest) return;
    $('[data-recent]').replaceChildren(...notes.flatMap(note => {
      const entry = findRoom(note.room);
      if (!entry) return [];
      const item = document.createElement('li');
      const button = document.createElement('button');
      const excerpt = document.createElement('p');
      button.type = 'button';
      button.textContent = title(entry) + ' · ' + byline(note);
      button.addEventListener('click', () => {
        showRoom(entry[0]);
        $('[data-title]').scrollIntoView({ block: 'start' });
      });
      excerpt.textContent = note.body.length > 180 ? note.body.slice(0, 180) + '…' : note.body;
      item.append(button, excerpt);
      return [item];
    }));
    $('[data-recent-status]').textContent = notes.length ? '' : 'Новых заметок пока нет.';
  } catch (_) {
    if (plan && request === recentRequest) $('[data-recent-status]').textContent = 'Лента не загрузилась.';
  }
}

async function openWorkspace(session) {
  clearWorkspace();
  if (!session) return;
  const request = sessionRequest;
  login.hidden = true;
  logout.hidden = false;
  account.textContent = 'Проверяю доступ…';
  let accountLabel;
  try {
    const member = result(await client.from('olimpiets_members').select('display_name,member_role')
      .eq('user_id', session.user.id).maybeSingle());
    if (request !== sessionRequest) return;
    if (!member) {
      account.textContent = 'Этот аккаунт ещё не добавлен в команду «Олимпийца».';
      return;
    }
    const admin = member.member_role === 'admin';
    accountLabel = 'Вы вошли как ' + member.display_name + (admin ? ' · администратор' : ' · участник');
    account.textContent = accountLabel;
    if (admin) {
      $('[data-admin]').hidden = false;
      $('[data-admin-jump]').hidden = false;
      void refreshMembers();
    }
    const blob = result(await client.storage.from('olimpiets-private').download('plan.json'));
    const data = JSON.parse(await blob.text());
    if (request !== sessionRequest) return;
    if (!Array.isArray(data.rooms) || !/^data:image\/jpeg;base64,[a-z\d+/=]+$/i.test(data.drawing)) {
      throw new Error('Invalid plan');
    }
    plan = data;
    draw();
    workspace.hidden = false;
    showRoom(findRoom(19)?.[0] ?? plan.rooms[0][0]);
    void refreshRecent();
  } catch (error) {
    if (request !== sessionRequest) return;
    const message = error?.code === 'PGRST205' || error?.code === '42P01'
      ? 'В проекте ещё не настроены таблицы. Обратитесь к владельцу.'
      : 'План не открылся. Проверьте сеть и обратитесь к владельцу, если ошибка повторится.';
    account.textContent = accountLabel ? accountLabel + '. ' + message : message;
  }
}

const client = window.supabase?.createClient(
  'https://nyjxmkyegndngeibsftx.supabase.co',
  'sb_publishable_H2rWel6UdAekl7jQXGQNVg_1oexS-JO',
  { auth: { detectSessionInUrl: false } }
);

if (!client) {
  account.textContent = 'Не загрузился модуль входа. Обновите страницу и проверьте интернет.';
} else {
  login.addEventListener('submit', async event => {
    event.preventDefault();
    const button = login.querySelector('button');
    const values = new FormData(login);
    button.disabled = true;
    account.textContent = 'Проверяю вход…';
    try {
      const data = result(await client.auth.signInWithPassword({
        email: values.get('email').trim(), password: values.get('password')
      }));
      login.reset();
      await openWorkspace(data.session);
    } catch (_) {
      account.textContent = 'Не удалось войти. Проверьте email, пароль и интернет.';
    } finally {
      button.disabled = false;
    }
  });
  logout.addEventListener('click', async () => {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) account.textContent = 'Не удалось выйти. Повторите попытку.';
    else clearWorkspace();
  });
  client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') clearWorkspace(); });
  void client.auth.getSession().then(response => openWorkspace(result(response).session)).catch(() => {
    clearWorkspace();
    account.textContent = 'Войдите, чтобы открыть план.';
  });
}

selector.addEventListener('change', () => showRoom(Number(selector.value)));
$('[data-admin-jump]').addEventListener('click', () => {
  const details = $('[data-admin] details');
  details.open = true;
  details.scrollIntoView({ block: 'start' });
  details.querySelector('summary').focus({ preventScroll: true });
});
$('[data-zoom]').addEventListener('click', event => {
  const enlarged = $('[data-scroll]').classList.toggle('enlarged');
  event.currentTarget.setAttribute('aria-pressed', String(enlarged));
  event.currentTarget.textContent = enlarged ? 'Показать весь план' : 'Увеличить план';
});
input.addEventListener('input', () => drafts.set(room, { body: input.value, id: crypto.randomUUID() }));
save.addEventListener('click', async () => {
  const selected = room;
  const draft = drafts.get(selected);
  if (!draft?.body.trim()) {
    $('[data-action-status]').textContent = 'Введите текст заметки.';
    return;
  }
  save.disabled = true;
  const request = sessionRequest;
  try {
    result(await client.from('olimpiets_notes').upsert({
      room: selected, body: draft.body.trim(), request_id: draft.id
    }, { onConflict: 'request_id', ignoreDuplicates: true }));
    if (request !== sessionRequest) return;
    if (drafts.get(selected)?.id === draft.id) {
      drafts.delete(selected);
      if (room === selected) input.value = '';
    }
    if (room === selected) $('[data-action-status]').textContent = 'Заметка добавлена.';
    await Promise.all([refreshRoom(), refreshRecent()]);
  } catch (_) {
    if (request === sessionRequest) $('[data-action-status]').textContent = 'Заметка не сохранилась. Текст остался в поле, можно повторить.';
  } finally {
    save.disabled = false;
  }
});

function refresh() {
  void refreshRoom();
  void refreshRecent();
}
$('[data-refresh]').addEventListener('click', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(() => { if (!document.hidden) refresh(); }, 15000);

$('[data-export]').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const notes = [];
    const size = 200;
    for (let offset = 0; ; offset += size) {
      const batch = result(await client.from('olimpiets_notes').select(fields)
        .order('created_at').order('request_id').range(offset, offset + size - 1));
      notes.push(...batch);
      if (batch.length < size) break;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify({ project: '820EK26', notes }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'olimpiets-notes.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (_) {
    $('[data-action-status]').textContent = 'Не удалось скачать заметки.';
  } finally {
    button.disabled = false;
  }
});

async function refreshMembers() {
  const request = sessionRequest;
  const status = $('[data-admin-status]');
  try {
    const members = result(await client.rpc('olimpiets_team_list'));
    if (request !== sessionRequest) return;
    $('[data-members]').replaceChildren(...members.map(member => {
      const row = document.createElement('li');
      row.textContent = member.display_name + ' · ' + member.email +
        (member.member_role === 'admin' ? ' · администратор' : '');
      if (member.member_role === 'member') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Закрыть доступ';
        remove.addEventListener('click', async () => {
          if (!confirm('Закрыть доступ для «' + member.display_name + '»? Заметки сохранятся.')) return;
          remove.disabled = true;
          try {
            result(await client.rpc('olimpiets_team_remove', { member_id: member.user_id }));
            status.textContent = 'Доступ закрыт.';
            await refreshMembers();
          } catch (_) {
            status.textContent = 'Не удалось закрыть доступ.';
            remove.disabled = false;
          }
        });
        row.append(document.createTextNode(' '), remove);
      }
      return row;
    }));
  } catch (_) {
    if (request === sessionRequest) status.textContent = 'Список участников не загрузился.';
  }
}

$('[data-member-form]').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const button = form.querySelector('button');
  const status = $('[data-admin-status]');
  button.disabled = true;
  try {
    const added = result(await client.rpc('olimpiets_team_add', {
      member_email: values.get('email').trim(), member_name: values.get('name').trim()
    }));
    status.textContent = added
      ? 'Участник добавлен.'
      : 'Подтверждённый аккаунт не найден. Сначала создайте его в Supabase Authentication.';
    if (added) {
      form.reset();
      await refreshMembers();
    }
  } catch (_) {
    status.textContent = 'Не удалось добавить участника.';
  } finally {
    button.disabled = false;
  }
});
