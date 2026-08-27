/* ==========================================================
   The opt-out switch on /privacy.

   Deliberately not a consent banner. A banner asks permission to do something
   the visitor did not want; this asks nothing and gives them the control if
   they go looking for it. Turning it off clears the keys as well as setting
   the flag, so "off" means the browser is left clean rather than merely
   ignored from here on.
   ========================================================== */

(function () {
  'use strict';

  const KEY = 'qd:no-personalisation';

  const toggle = document.getElementById('privacy-toggle');
  const state  = document.getElementById('privacy-state');
  const detail = document.getElementById('privacy-detail');
  const note   = document.getElementById('privacy-cleared');
  if (!toggle || !state || !detail) return;

  const isOff = () => {
    try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; }
  };

  function paint() {
    const off = isOff();
    state.textContent  = off ? 'Measurement is off' : 'Measurement is on';
    detail.textContent = off
      ? 'Nothing is being counted from this browser.'
      : 'Aggregate counts only, as described above.';
    toggle.textContent = off ? 'Turn it back on' : 'Turn it off';
    toggle.setAttribute('aria-pressed', String(off));
    document.getElementById('privacy-switch').classList.toggle('is-off', off);
  }

  /* Everything this site sets, minus the flag itself. Listed rather than
     wildcarded over the qd: prefix so that adding a key elsewhere has to be a
     deliberate decision here too. */
  const KEYS = ['qd:vid', 'qd:seen', 'qd:asked', 'qd:promo', 'qd:sent',
                'qd:theme', 'qd:glass', 'qd:mode'];
  const SESSION_KEYS = ['qd:sid', 'qd:utm'];

  toggle.addEventListener('click', () => {
    const turningOff = !isOff();
    try {
      if (turningOff) {
        localStorage.setItem(KEY, '1');
        KEYS.forEach(k => localStorage.removeItem(k));
        SESSION_KEYS.forEach(k => sessionStorage.removeItem(k));
        if (note) note.hidden = false;
      } else {
        localStorage.removeItem(KEY);
        if (note) note.hidden = true;
      }
    } catch (_) {
      // Private mode: nothing was stored to begin with, so "off" is already true.
    }

    // The tracker reads the flag before every send, so this takes effect on
    // the next event rather than needing a reload.
    paint();
  });

  paint();
})();
