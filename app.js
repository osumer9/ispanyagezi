const KEY_STORE = 'gezi-key';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const store = {
  get() { try { return localStorage.getItem(KEY_STORE); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY_STORE, v); } catch {} },
  clear() { try { localStorage.removeItem(KEY_STORE); } catch {} },
};

let key, data, tab = 'today', dayNo = 1;
const blobs = new Map();

async function derive(pass, meta) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64(meta.salt), iterations: meta.iter },
    base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
}

async function open(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('net');
  const buf = await res.arrayBuffer();
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
}

async function unlock() {
  data = JSON.parse(new TextDecoder().decode(await open('vault/content.enc')));
  const today = new Date().toLocaleDateString('sv-SE');
  dayNo = (data.days.find((d) => d.iso === today) || data.days[0]).n;
  $('lock').hidden = true;
  $('app').hidden = false;
  render();
}

const ticketBtn = (t) => `<button class="open-btn" data-ticket="${esc(t.id)}">${esc(t.title)} · ${esc(t.time)}</button>`;

function dayCard(d) {
  const tickets = data.tickets.filter((t) => t.day === d.n);
  const stops = d.stops.map(([label, q]) =>
    `<a class="chip" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}">${esc(label)}</a>`).join('');
  return `<article class="card">
    <div class="date">${d.date}</div>
    <h2 class="day-title">${d.title}</h2>
    <div class="where">${d.where}</div>
    <div class="tl">${d.tl}</div>
    ${d.note ? `<div class="note">${d.note}</div>` : ''}
    ${stops ? `<div class="chips">${stops}</div>` : ''}
    ${tickets.map(ticketBtn).join('')}
  </article>`;
}

function dayPicker() {
  return `<div class="day-picker">${data.days.map((d) =>
    `<button data-day="${d.n}" class="${d.n === dayNo ? 'on' : ''}" aria-label="${d.n} Kasım">${d.n}</button>`).join('')}</div>`;
}

const views = {
  today() {
    const d = data.days.find((x) => x.n === dayNo);
    return dayCard(d) + todoFor(d.n);
  },
  program() {
    return dayPicker() + dayCard(data.days.find((x) => x.n === dayNo)) + todoFor(dayNo);
  },
  tickets() {
    const ready = data.tickets.map((t) => `<div class="card"><div class="row">
      <h3>${esc(t.title)}</h3><span class="when">${t.day} Kas ${esc(t.time)}</span>
      <div class="sub">${esc(t.who)} · ${esc(t.note)}<br>${esc(t.refs)}</div></div>
      <button class="open-btn" data-ticket="${esc(t.id)}">Bileti aç</button></div>`).join('');
    const booked = data.bookings.map((b) => `<div class="card"><div class="row">
      <h3>${esc(b.title)}</h3><span class="when">${b.day} Kas</span>
      <div class="sub">${esc(b.detail)}</div></div>
      ${b.phone ? `<a class="chip" href="tel:${esc(b.phone)}">Ara</a>` : ''}</div>`).join('');
    const todo = data.pending.map((p) => `<div class="card"><div class="row">
      <h3>${esc(p.title)}</h3><span class="when">${p.day} Kas ${esc(p.time)}</span>
      <div class="sub"><span class="badge todo">Alınmadı</span></div></div>
      <a class="open-btn" target="_blank" rel="noopener" href="${esc(p.url)}">Resmi site</a></div>`).join('');
    return `<h2 class="section-label">Biletler</h2>${ready}
      <h2 class="section-label">Rezervasyonlar</h2>${booked}
      ${todo ? `<h2 class="section-label">Alınacaklar</h2>${todo}` : ''}`;
  },
  info() {
    return `<h2 class="section-label">Konaklama</h2><div class="card">${data.stay}</div>
      <h2 class="section-label">Pratik bilgiler</h2>${data.info}`;
  },
};

function todoFor(n) {
  const items = data.pending.filter((p) => p.day === n);
  if (!items.length) return '';
  return `<div class="card"><div class="small"><span class="badge todo">Alınmadı</span> ${items.map((p) => esc(p.title)).join(' · ')}</div></div>`;
}

function render() {
  $('view').innerHTML = views[tab]();
  $('top-title').textContent = { today: 'Bugün', program: 'Program', tickets: 'Biletler', info: 'Bilgi' }[tab];
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const on = document.querySelector('.day-picker .on');
  if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

async function showTicket(id) {
  const t = data.tickets.find((x) => x.id === id);
  if (!blobs.has(id)) {
    const [page, qr] = await Promise.all([open(`vault/${t.file}`), t.qrFile ? open(`vault/${t.qrFile}`) : null]);
    blobs.set(id, {
      page: URL.createObjectURL(new Blob([page], { type: 'image/jpeg' })),
      qr: qr && URL.createObjectURL(new Blob([qr], { type: 'image/png' })),
    });
  }
  $('viewer-title').textContent = `${t.title} · ${t.time}`;
  $('viewer-qr').hidden = !blobs.get(id).qr;
  $('viewer-qr').src = blobs.get(id).qr || '';
  $('viewer-img').src = blobs.get(id).page;
  $('viewer').showModal();
  try { await navigator.wakeLock?.request('screen'); } catch {}
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-tab],[data-day],[data-ticket]');
  if (!el) return;
  if (el.dataset.tab) { tab = el.dataset.tab; render(); scrollTo(0, 0); }
  if (el.dataset.day) { dayNo = +el.dataset.day; render(); }
  if (el.dataset.ticket) showTicket(el.dataset.ticket).catch(() => alert('Bilet açılamadı. İnternet bağlantısını kontrol edin.'));
});

$('viewer-close').onclick = () => $('viewer').close();
$('logout').onclick = () => { store.clear(); location.reload(); };

$('lock-form').onsubmit = async (e) => {
  e.preventDefault();
  const msg = $('lock-msg');
  msg.textContent = 'Açılıyor…';
  try {
    const meta = await (await fetch('vault/meta.json')).json();
    key = await derive($('pass').value.trim().toLowerCase(), meta);
    await unlock();
    if ($('remember').checked) {
      store.set(btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', key)))));
    }
    $('pass').value = '';
  } catch (err) {
    msg.textContent = err.message === 'net' ? 'Bağlantı yok.' : 'Parola yanlış.';
  }
};

(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const saved = store.get();
  if (!saved) return;
  try {
    key = await crypto.subtle.importKey('raw', b64(saved), 'AES-GCM', true, ['decrypt']);
    await unlock();
  } catch (err) {
    if (err.message !== 'net') store.clear();
  }
})();
