(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let cfg = null;

  const startDate = () => new Date(`${cfg.dateISO}T${cfg.time}:00`);

  function bind() {
    document.querySelectorAll('[data-bind]').forEach(el => {
      const v = cfg[el.dataset.bind];
      if (v != null) el.textContent = v;
    });
    const d = startDate();
    $('gregDate').textContent = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
    $('gregLong').textContent = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const q = encodeURIComponent(cfg.mapQuery);
    $('waze').href = `https://waze.com/ul?q=${q}&navigate=yes`;
    $('gmaps').href = `https://www.google.com/maps/search/?api=1&query=${q}`;
    $('mapFrame').src = `https://maps.google.com/maps?q=${q}&hl=he&z=16&output=embed`;

    const fmt = dt => dt.getFullYear() + String(dt.getMonth() + 1).padStart(2, '0') + String(dt.getDate()).padStart(2, '0')
      + 'T' + String(dt.getHours()).padStart(2, '0') + String(dt.getMinutes()).padStart(2, '0') + '00';
    const end = new Date(d.getTime() + 4 * 3600e3);
    const title = `בת מצווה של ${cfg.girlName}`;
    $('gcal').href = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + `&text=${encodeURIComponent(title)}&dates=${fmt(d)}/${fmt(end)}&ctz=Asia/Jerusalem`
      + `&location=${encodeURIComponent(cfg.address)}&details=${encodeURIComponent(cfg.welcomeText)}`;

    $('ics').onclick = () => {
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BatMitzvah//HE', 'BEGIN:VEVENT',
        `UID:${cfg.dateISO}-${Date.now()}@batmitzvah`, `DTSTAMP:${fmt(new Date())}`,
        `DTSTART;TZID=Asia/Jerusalem:${fmt(d)}`, `DTEND;TZID=Asia/Jerusalem:${fmt(end)}`,
        `SUMMARY:${title}`, `LOCATION:${cfg.address}`, `DESCRIPTION:${cfg.welcomeText}`,
        'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', 'DESCRIPTION:תזכורת', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      a.download = 'batmitzvah.ics';
      a.click();
      URL.revokeObjectURL(a.href);
    };

    if (cfg.contactPhone) {
      const c = $('contact');
      c.append('לשאלות: ');
      const a = document.createElement('a');
      a.href = 'tel:' + cfg.contactPhone.replace(/[^\d+]/g, '');
      a.textContent = cfg.contactPhone;
      c.append(a);
    }
    document.title = `הזמנה לבת המצווה של ${cfg.girlName}`;
  }

  function tick() {
    let diff = Math.max(0, startDate() - Date.now());
    const s = Math.floor(diff / 1000);
    $('cd-d').textContent = Math.floor(s / 86400);
    $('cd-h').textContent = String(Math.floor(s % 86400 / 3600)).padStart(2, '0');
    $('cd-m').textContent = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
    $('cd-s').textContent = String(s % 60).padStart(2, '0');
  }

  function petals() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.querySelector('.petals');
    const add = () => {
      const p = document.createElement('i');
      p.className = 'petal';
      p.style.left = Math.random() * 100 + '%';
      p.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
      p.style.animationDuration = 9 + Math.random() * 8 + 's';
      p.style.opacity = .25 + Math.random() * .4;
      const sz = 8 + Math.random() * 12;
      p.style.width = p.style.height = sz + 'px';
      box.appendChild(p);
      setTimeout(() => p.remove(), 18000);
    };
    setInterval(add, 1400);
  }

  function reveal() {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: .12 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  }

  function form() {
    const f = $('rsvpForm'), g = $('guests');
    const max = cfg.maxGuestsPerRsvp || 10;
    const sync = () => {
      const no = f.attending.value === 'no';
      $('guestsField').style.display = no ? 'none' : '';
    };
    f.querySelectorAll('input[name=attending]').forEach(r => r.addEventListener('change', sync));
    $('plus').onclick = () => { g.value = Math.min(max, +g.value + 1); };
    $('minus').onclick = () => { g.value = Math.max(1, +g.value - 1); };

    f.addEventListener('submit', async e => {
      e.preventDefault();
      const err = $('formError'), btn = $('submitBtn');
      err.textContent = '';
      const data = Object.fromEntries(new FormData(f));
      if (data.name.trim().length < 2) return err.textContent = 'נא להזין שם מלא';
      if (data.phone.replace(/\D/g, '').length < 9) return err.textContent = 'נא להזין מספר טלפון תקין';
      btn.disabled = true; btn.textContent = 'שולחים…';
      try {
        const r = await fetch('/api/rsvp', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'שגיאה');
        const first = data.name.trim().split(/\s+/)[0];
        const msgs = {
          yes: ['איזה כיף, ' + first + '! 🎉', `רשמנו ${data.guests} מוזמנים. מחכים לראות אתכם!`],
          maybe: ['תודה ששיתפת, ' + first, 'נשמח אם תעדכנו אותנו כשתדעו בוודאות.'],
          no: ['תודה שעדכנתם, ' + first, 'חבל שלא תוכלו להגיע, תודה על האכפתיות 💛']
        }[data.attending];
        $('thanksTitle').textContent = msgs[0];
        $('thanksText').textContent = msgs[1];
        f.hidden = true; $('thanks').hidden = false;
        $('thanks').scrollIntoView({ behavior: 'smooth', block: 'center' });
        burst();
      } catch (ex) {
        err.textContent = ex.message || 'משהו השתבש, נסו שוב';
      } finally {
        btn.disabled = false; btn.textContent = 'שליחת אישור הגעה';
      }
    });
    $('againBtn').onclick = () => {
      f.reset(); g.value = 1; sync();
      f.hidden = false; $('thanks').hidden = true;
    };
  }

  function burst() {
    const box = document.querySelector('.petals');
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('i');
      p.className = 'petal';
      p.style.left = Math.random() * 100 + '%';
      p.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      p.style.animationDuration = 3 + Math.random() * 3 + 's';
      p.style.opacity = .8;
      p.style.background = ['#e8b4bf', '#c9a35b', '#f7e3e7'][i % 3];
      box.appendChild(p);
      setTimeout(() => p.remove(), 7000);
    }
  }

  fetch('/api/config').then(r => r.json()).then(c => {
    cfg = c; bind(); tick(); setInterval(tick, 1000); form();
  }).catch(() => {});
  petals(); reveal();
})();
