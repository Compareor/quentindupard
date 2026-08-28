/* ==========================================================
   /admin — content editor.

   Edits two arrays: the fort's folders and the inbox. The page seeds from the
   defaults shipped in content.js, overlays whatever is stored in KV, and PUTs
   the whole thing back. Nothing here is incremental — the store is small and a
   whole-document save has no merge conflicts to get wrong.

   Re-render happens on STRUCTURAL change only (add, delete, move, kind swap).
   Typing writes straight to the model, because re-rendering on input would
   pull focus out of the field on every keystroke.
   ========================================================== */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const clone = v => JSON.parse(JSON.stringify(v));

  const DEFAULTS = {
    desktop: clone(window.QD_DESKTOP || []),
    mailbox: clone(window.QD_MAILBOX || [])
  };

  const KINDS = [
    ['page', 'Page (on site)'],
    ['link', 'Link (new tab)'],
    ['pdf',  'PDF (download)'],
    ['note', 'Note (window)']
  ];

  let model = clone(DEFAULTS);
  let dirty = false;
  let tab = 'desktop';

  /* ── Chrome ─────────────────────────────────────────────── */

  function setState(msg, isDirty) {
    const el = $('#state');
    el.textContent = msg;
    el.classList.toggle('is-dirty', !!isDirty);
  }

  function touch() {
    dirty = true;
    setState('Unsaved changes', true);
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function input(value, placeholder, onInput, type) {
    const n = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type && type !== 'textarea') n.type = type;
    n.value = value == null ? '' : value;
    if (placeholder) n.placeholder = placeholder;
    n.addEventListener('input', () => { onInput(n.value); touch(); });
    return n;
  }

  function iconBtn(label, title, onClick, danger) {
    const b = el('button', 'icon-btn' + (danger ? ' is-danger' : ''), label);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  }

  function move(list, i, delta) {
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    const [item] = list.splice(i, 1);
    list.splice(j, 0, item);
    touch();
    render();
  }

  function orderControls(list, i, onDelete) {
    const g = el('div', 'btn-group');
    g.append(
      iconBtn('↑', 'Move up',   () => move(list, i, -1)),
      iconBtn('↓', 'Move down', () => move(list, i,  1)),
      iconBtn('✕', 'Delete',    () => { list.splice(i, 1); onDelete && onDelete(); touch(); render(); }, true)
    );
    return g;
  }

  /* ── Folders ────────────────────────────────────────────── */

  function itemRow(items, i) {
    const item = items[i];
    const isNote = item.kind === 'note';

    const kind = document.createElement('select');
    KINDS.forEach(([value, label]) => {
      const o = el('option', null, label);
      o.value = value;
      kind.appendChild(o);
    });
    kind.value = item.kind || 'link';
    kind.addEventListener('change', () => {
      item.kind = kind.value;
      // The two shapes are mutually exclusive: a note has a body, everything
      // else has a destination. Swapping kind without this leaves the old
      // field behind and the server drops the record on save.
      if (item.kind === 'note') {
        if (!Array.isArray(item.body)) item.body = [''];
        delete item.href;
      } else {
        if (typeof item.href !== 'string') item.href = '';
        delete item.body;
      }
      touch();
      render();
    });

    const row = el('div', isNote ? 'row row-note' : 'row');
    row.append(
      kind,
      input(item.name, 'Name', v => { item.name = v; }, 'text')
    );
    if (!isNote) row.appendChild(input(item.href, '/path or https://…', v => { item.href = v; }, 'text'));
    row.append(
      input(item.meta, 'Caption', v => { item.meta = v; }, 'text'),
      orderControls(items, i)
    );

    if (!isNote) return row;

    const holder = el('div', 'stack');
    holder.append(row, input(
      (item.body || []).join('\n\n'),
      'The note. One paragraph per blank line.',
      v => { item.body = v.split(/\n{2,}/).map(p => p.trim()).filter(Boolean); },
      'textarea'
    ));
    return holder;
  }

  function folderCard(folders, i) {
    const folder = folders[i];
    const card = el('div', 'card');

    const head = el('div', 'card-head');
    head.appendChild(input(folder.name, 'Folder name', v => { folder.name = v; }, 'text'));
    head.appendChild(orderControls(folders, i));
    card.appendChild(head);

    const body = el('div', 'card-body');
    if (!Array.isArray(folder.items)) folder.items = [];
    folder.items.forEach((_, j) => body.appendChild(itemRow(folder.items, j)));

    const add = el('button', 'add', '+ Add item');
    add.type = 'button';
    add.addEventListener('click', () => {
      folder.items.push({ name: '', kind: 'link', href: '', meta: '' });
      touch();
      render();
    });
    body.appendChild(add);

    card.appendChild(body);
    return card;
  }

  function renderDesktop() {
    const pane = $('#pane-desktop');
    pane.textContent = '';

    pane.appendChild(el('p', 'pane-note',
      'These are the folders on the Mac desktop in “The fort”. Page items open on this site, PDFs download, notes open in a window, links open in a new tab. Files themselves live in the repo under /assets/docs — this controls what points at them.'));

    if (!Array.isArray(model.desktop)) model.desktop = [];
    model.desktop.forEach((_, i) => pane.appendChild(folderCard(model.desktop, i)));

    const add = el('button', 'add', '+ Add folder');
    add.type = 'button';
    add.addEventListener('click', () => {
      model.desktop.push({ id: 'folder-' + (model.desktop.length + 1), name: 'New folder', kind: 'folder', items: [] });
      touch();
      render();
    });
    pane.appendChild(add);
  }

  /* ── Inbox ──────────────────────────────────────────────── */

  function mailCard(list, i) {
    const m = list[i];
    const card = el('div', 'card');

    const head = el('div', 'card-head');
    head.appendChild(input(m.subject, 'Subject', v => { m.subject = v; }, 'text'));
    head.appendChild(orderControls(list, i));
    card.appendChild(head);

    const body = el('div', 'card-body');

    const grid = el('div', 'mail-grid');
    grid.append(
      input(m.from, 'From — name', v => { m.from = v; }, 'text'),
      input(m.role, 'Role and company', v => { m.role = v; }, 'text'),
      input(m.email, 'From — address shown when opened', v => { m.email = v; }, 'text'),
      input(m.time, 'Time label, e.g. “09:14”, “Yesterday”, “Mon”', v => { m.time = v; }, 'text')
    );
    body.appendChild(grid);

    body.appendChild(input(
      (m.body || []).join('\n\n'),
      'The message. One paragraph per blank line.',
      v => { m.body = v.split(/\n{2,}/).map(p => p.trim()).filter(Boolean); },
      'textarea'
    ));

    /* Attachments point at files already in the repo under /assets/docs.
       There is no upload here: uploading means write access to the bucket,
       which is a much larger surface than a password box deserves. */
    if (!Array.isArray(m.attach)) m.attach = [];
    m.attach.forEach((a, k) => {
      const row = el('div', 'row row-attach');
      row.append(
        input(a.name, 'File name shown', v => { a.name = v; }, 'text'),
        input(a.href, '/assets/docs/…', v => { a.href = v; }, 'text'),
        input(a.size, 'Size, e.g. “4.9 KB”', v => { a.size = v; }, 'text'),
        orderControls(m.attach, k)
      );
      body.appendChild(row);
    });

    const addFile = el('button', 'add', '+ Attach a file');
    addFile.type = 'button';
    addFile.addEventListener('click', () => {
      m.attach.push({ name: '', href: '/assets/docs/', size: '' });
      touch();
      render();
    });
    body.appendChild(addFile);

    card.appendChild(body);
    return card;
  }

  function renderMailbox() {
    const pane = $('#pane-mailbox');
    pane.textContent = '';

    pane.appendChild(el('p', 'pane-note',
      'The messages in the mailbox on the homepage. The whole panel carries a “Demo” badge, so treat anything here as illustrative unless the person has given you permission to publish their words.'));

    if (!Array.isArray(model.mailbox)) model.mailbox = [];
    model.mailbox.forEach((_, i) => pane.appendChild(mailCard(model.mailbox, i)));

    const add = el('button', 'add', '+ Add message');
    add.type = 'button';
    add.addEventListener('click', () => {
      model.mailbox.push({ from: '', email: '', role: '', subject: 'New message', time: '', body: [''], attach: [] });
      touch();
      render();
    });
    pane.appendChild(add);
  }

  /* ── Questions ──────────────────────────────────────────
     Read-only: what people actually asked AI-me. Not editable, so it is not
     part of the save model and does not go anywhere near the content PUT. */

  let questions = null;      // null = not fetched yet

  function when(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 60) return mins + 'm ago';
    if (mins < 60 * 24) return Math.round(mins / 60) + 'h ago';
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function loadQuestions() {
    const { ok, data } = await api('/api/admin/questions');
    questions = ok && data ? (data.questions || []) : [];
    render();
  }

  function dayLabel(ms) {
    const d = new Date(ms);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(ms); day.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const clock = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /* Newest day first, and within a day one block per conversation rather than
     a flat wall. A thread id is a browser tab, not a person: it is the closest
     thing to "who asked this" that exists without tracking anyone across
     visits, which the privacy page promises not to do. */
  function groupQuestions(rows) {
    const days = new Map();
    rows.forEach((row) => {
      const key = new Date(row.at); key.setHours(0, 0, 0, 0);
      const stamp = key.getTime();
      if (!days.has(stamp)) days.set(stamp, new Map());
      const threads = days.get(stamp);
      const id = row.thread || ('single:' + row.key);
      if (!threads.has(id)) threads.set(id, []);
      threads.get(id).push(row);
    });
    return [...days.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([stamp, threads]) => ({
        stamp,
        threads: [...threads.entries()]
          .map(([id, rows]) => ({ id, rows: rows.slice().sort((a, b) => a.at - b.at) }))
          .sort((a, b) => b.rows[0].at - a.rows[0].at)
      }));
  }

  async function removeQuestion(row) {
    await api('/api/admin/questions', { method: 'POST', body: JSON.stringify({ key: row.key }) });
    questions = questions.filter(q => q.key !== row.key);
    render();
  }

  function renderQuestions() {
    const pane = $('#pane-questions');
    pane.textContent = '';

    pane.appendChild(el('p', 'pane-note',
      'What people asked AI-me, newest day first and grouped by conversation. Kept 90 days, then it expires on its own. A conversation is one browser tab — no IP and no visitor id is stored, so nothing here follows anyone between visits.'));

    if (questions === null) {
      pane.appendChild(el('p', 'hint', 'Loading…'));
      loadQuestions();
      return;
    }
    if (!questions.length) {
      pane.appendChild(el('p', 'hint', 'Nothing asked yet. Questions appear here as they are asked.'));
      return;
    }

    const days = groupQuestions(questions);
    const counts = questions.reduce((a, q) => { a[q.lang] = (a[q.lang] || 0) + 1; return a; }, {});
    pane.appendChild(el('p', 'hint',
      `${questions.length} question${questions.length === 1 ? '' : 's'} · ` +
      `${days.length} day${days.length === 1 ? '' : 's'} · ` +
      Object.entries(counts).map(([l, n]) => l.toUpperCase() + ' ' + n).join(' · ')));

    days.forEach((day, dayIndex) => {
      const group = document.createElement('details');
      group.className = 'qday';
      group.open = dayIndex === 0;            // today expanded, history collapsed

      const total = day.threads.reduce((n, t) => n + t.rows.length, 0);
      const summary = document.createElement('summary');
      summary.append(
        el('span', 'qday-name', dayLabel(day.stamp)),
        el('span', 'qday-count',
           `${day.threads.length} conversation${day.threads.length === 1 ? '' : 's'} · ${total} question${total === 1 ? '' : 's'}`)
      );
      group.appendChild(summary);

      day.threads.forEach((thread) => {
        const box = el('div', 'qthread');
        const head = el('div', 'qthread-head');
        head.append(
          el('span', 'qthread-id', thread.id.startsWith('single:') ? 'one-off' : thread.id),
          el('span', 'qthread-meta',
             `${clock(thread.rows[0].at)} · ${thread.rows.length} question${thread.rows.length === 1 ? '' : 's'}`)
        );
        box.appendChild(head);

        thread.rows.forEach((row) => {
          const line = el('div', 'qrow');
          const meta = el('div', 'qrow-head');
          meta.append(el('span', 'qrow-when', clock(row.at)), el('span', 'qrow-lang', row.lang.toUpperCase()));
          /* Answered by the off-topic gate, not the model. If real business
             questions start showing up with this badge, the gate is too tight. */
          if (row.offTopic) meta.appendChild(el('span', 'qrow-off', 'off-topic'));
          meta.appendChild(iconBtn('✕', 'Delete this question', async () => {
            if (!confirm('Delete this question permanently?')) return;
            await removeQuestion(row);
          }, true));
          line.append(meta, el('p', 'qrow-q', row.q));
          box.appendChild(line);
        });

        group.appendChild(box);
      });

      pane.appendChild(group);
    });
  }

  function render() {
    $('#pane-desktop').hidden = tab !== 'desktop';
    $('#pane-mailbox').hidden = tab !== 'mailbox';
    $('#pane-questions').hidden = tab !== 'questions';
    if (tab === 'desktop') renderDesktop();
    else if (tab === 'mailbox') renderMailbox();
    else renderQuestions();
  }

  /* ── Session ────────────────────────────────────────────── */

  async function api(path, options) {
    const res = await fetch(path, Object.assign({
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin'
    }, options || {}));
    let data = null;
    try { data = await res.json(); } catch (_) { /* 204 or empty */ }
    return { status: res.status, ok: res.ok, data };
  }

  function showEditor() {
    $('#lock').hidden = true;
    $('#admin').hidden = false;
    render();
  }

  async function load() {
    const { status, data } = await api('/api/admin/content');
    if (status === 401) return;                    // stay on the lock screen
    if (status === 503) {
      setState('Storage not configured');
      showEditor();
      return;
    }
    if (data && data.store) {
      // Only replace the halves that were actually saved, so a store written
      // before a section existed does not blank that section out.
      if (Array.isArray(data.store.desktop) && data.store.desktop.length) model.desktop = data.store.desktop;
      if (Array.isArray(data.store.mailbox) && data.store.mailbox.length) model.mailbox = data.store.mailbox;
      setState('Saved ' + new Date(data.store.updated).toLocaleString());
    } else {
      setState('Showing the shipped defaults');
    }
    showEditor();
  }

  $('#lock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#lock-err');
    const go = $('#lock-go');
    err.hidden = true;
    go.disabled = true;
    go.textContent = 'Checking…';

    const { ok, data } = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: $('#pw').value })
    });

    go.disabled = false;
    go.textContent = 'Unlock';

    if (!ok) {
      err.textContent = (data && data.error) || 'Could not sign in.';
      err.hidden = false;
      return;
    }
    $('#pw').value = '';
    load();
  });

  $('#save').addEventListener('click', async () => {
    const btn = $('#save');
    btn.disabled = true;
    setState('Saving…');

    const { ok, data } = await api('/api/admin/content', {
      method: 'PUT',
      body: JSON.stringify({ desktop: model.desktop, mailbox: model.mailbox })
    });

    btn.disabled = false;
    if (!ok) {
      setState((data && data.error) || 'Save failed', true);
      return;
    }
    // Render what the server actually kept, not what was sent — invalid rows
    // are dropped on the way in and it should be obvious which ones.
    model.desktop = data.store.desktop;
    model.mailbox = data.store.mailbox;
    dirty = false;
    setState('Saved ' + new Date(data.store.updated).toLocaleString());
    render();
  });

  const resetStats = $('#reset-stats');
  if (resetStats) {
    resetStats.addEventListener('click', async () => {
      if (!confirm('Clear all visit and traffic counters?\n\nThe questions log and the record of who has visited before are kept, so returning visitors are still recognised. This cannot be undone.')) return;
      resetStats.disabled = true;
      const { ok, data } = await api('/api/admin/reset-stats', { method: 'POST' });
      resetStats.disabled = false;
      setState(ok ? `Statistics cleared (${data.removed} records)` : 'Could not clear statistics', !ok);
    });
  }

  $('#reset').addEventListener('click', () => {
    if (!confirm('Replace everything with the content that ships with the site? This does not save until you press Save.')) return;
    model = clone(DEFAULTS);
    touch();
    render();
  });

  $('#signout').addEventListener('click', async () => {
    if (dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    await api('/api/admin/logout', { method: 'POST' });
    location.reload();
  });

  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    tab = btn.dataset.tab;
    // Questions are read-only; offering Save there implies they are not.
    const editable = tab !== 'questions';
    $('#save').hidden = !editable;
    $('#reset').hidden = !editable;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-on', t === btn));
    render();
  });

  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  load();
})();
