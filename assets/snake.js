/* ==========================================================
   Funnel — a snake game for a discount code.

   You are a funnel. Convert 5 signups without hitting a wall or
   doubling back. Three lives.

   The reward is a Stripe promotion code. Note that the code lives
   in this file, so anyone reading source can skip the game — that
   is fine for a marketing toy, and Stripe caps redemptions anyway.
   Treat it as a nudge, not a lock.
   ========================================================== */

window.QD_SNAKE = (function () {
  'use strict';

  const CODE = 'QD50';          // must exist as a Stripe promotion code
  const TARGET = 5;                 // signups needed
  const LIVES = 3;
  const COLS = 20, ROWS = 20;
  const TICK_MS = 130;

  let cvs, ctx, cell, raf, timer;
  let snake, dir, nextDir, prize, lives, caught, state;

  const $ = s => document.querySelector(s);
  const rand = n => Math.floor(Math.random() * n);

  function reset(full) {
    snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    if (full) { lives = LIVES; caught = 0; }
    placePrize();
  }

  function placePrize() {
    do {
      prize = { x: rand(COLS), y: rand(ROWS) };
    } while (snake.some(s => s.x === prize.x && s.y === prize.y));
  }

  function setState(next) {
    state = next;
    const modal = $('#snake');
    if (modal) modal.className = modal.className.replace(/\bis-\w+\b/g, '').trim() + ' is-' + next;
    ['intro', 'play', 'lost', 'won'].forEach(k => {
      const el = $('#snake-' + k);
      if (el) el.hidden = (k !== next);
    });
    const hud = $('#snake-hud');
    if (hud) hud.hidden = next !== 'play';
  }

  function paintHud() {
    const l = $('#snake-lives'), c = $('#snake-caught');
    if (l) l.textContent = '●'.repeat(lives) + '○'.repeat(LIVES - lives);
    if (c) c.textContent = caught + ' / ' + TARGET;
  }

  function loseLife() {
    lives--;
    paintHud();
    if (lives <= 0) { stop(); setState('lost'); return; }
    reset(false);
  }

  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // walls
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return loseLife();
    // self
    if (snake.some(s => s.x === head.x && s.y === head.y)) return loseLife();

    snake.unshift(head);

    if (head.x === prize.x && head.y === prize.y) {
      caught++;
      paintHud();
      if (caught >= TARGET) { stop(); reveal(); return; }
      placePrize();
    } else {
      snake.pop();
    }
  }

  function reveal() {
    const out = $('#snake-code');
    if (out) out.textContent = CODE;
    setState('won');
    if (window.QD && window.QD.track) window.QD.track('discount_won', { target: CODE });
  }

  /* ── drawing ── */
  function draw() {
    if (!cell) { if (state === 'play') raf = requestAnimationFrame(draw); return; }
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--text').trim();
    const a = css.getPropertyValue('--accent-a').trim() || '#35d6ee';
    const b = css.getPropertyValue('--accent-b').trim() || '#8f7bff';

    ctx.clearRect(0, 0, cvs.width, cvs.height);

    // grid
    ctx.strokeStyle = 'rgba(127,140,180,0.13)';
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, ROWS * cell); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(COLS * cell, i * cell); ctx.stroke();
    }

    // prize: a pulsing node
    const t = Date.now() / 320;
    const r = cell * (0.30 + Math.sin(t) * 0.05);
    const cx = prize.x * cell + cell / 2, cy = prize.y * cell + cell / 2;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 0.9);
    glow.addColorStop(0, a); glow.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.5; ctx.fillStyle = glow;
    ctx.fillRect(cx - cell, cy - cell, cell * 2, cell * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = a;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    // funnel body, gradient head to tail
    snake.forEach((s, i) => {
      const f = i / Math.max(1, snake.length - 1);
      ctx.fillStyle = i === 0 ? b : mix(b, a, f);
      const p = cell * 0.12;
      round(s.x * cell + p, s.y * cell + p, cell - p * 2, cell - p * 2, cell * 0.28);
      ctx.fill();
    });

    if (state === 'play') raf = requestAnimationFrame(draw);
  }

  function round(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function mix(c1, c2, t) {
    const p = c => {
      c = c.replace('#', '');
      if (c.length === 3) c = c.split('').map(x => x + x).join('');
      return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
    };
    const [r1, g1, b1] = p(c1), [r2, g2, b2] = p(c2);
    return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
  }

  /* ── input ── */
  function turn(x, y) {
    // no instant reversal into your own neck
    if (snake.length > 1 && x === -dir.x && y === -dir.y) return;
    nextDir = { x, y };
  }

  function onKey(e) {
    if (state !== 'play') return;
    const k = e.key.toLowerCase();
    const map = {
      arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
      arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0]
    };
    if (map[k]) { e.preventDefault(); turn(map[k][0], map[k][1]); }
  }

  let touchStart = null;
  function onTouchStart(e) { const t = e.touches[0]; touchStart = { x: t.clientX, y: t.clientY }; }
  function onTouchMove(e) {
    if (!touchStart || state !== 'play') return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    e.preventDefault();
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
    else turn(0, dy > 0 ? 1 : -1);
    touchStart = { x: t.clientX, y: t.clientY };
  }

  /* ── lifecycle ── */
  function start() {
    // The board is display:none behind the intro, so it can only be measured
    // once play actually starts.
    setState('play');
    size();
    reset(true);
    paintHud();
    stopLoops();
    timer = setInterval(step, TICK_MS);
    raf = requestAnimationFrame(draw);
  }

  function stopLoops() {
    clearInterval(timer);
    cancelAnimationFrame(raf);
  }
  function stop() { stopLoops(); }

  function size() {
    const wrap = $('#snake-board');
    if (!wrap || !cvs) return;
    const w = Math.min(wrap.clientWidth, 420);
    const dpr = window.devicePixelRatio || 1;
    cell = Math.floor(w / COLS);
    const px = cell * COLS;
    cvs.style.width = px + 'px';
    cvs.style.height = px + 'px';
    cvs.width = px * dpr;
    cvs.height = px * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function open() {
    const modal = $('#snake');
    if (!modal) return;
    modal.hidden = false;
    cvs = $('#snake-canvas');
    ctx = cvs.getContext('2d');
    reset(true);
    setState('intro');
    if (window.QD && window.QD.track) window.QD.track('discount_open');
  }

  function close() {
    stop();
    const modal = $('#snake');
    if (modal) modal.hidden = true;
    setState('intro');
  }

  function init() {
    const modal = $('#snake');
    if (!modal) return;

    document.addEventListener('keydown', onKey);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modal.hidden) close();
    });
    window.addEventListener('resize', () => { if (!modal.hidden) size(); });

    $('#snake-board').addEventListener('touchstart', onTouchStart, { passive: true });
    $('#snake-board').addEventListener('touchmove', onTouchMove, { passive: false });

    /* Delegated, not bound directly. The "Want a discount code?" button is
       created by showPaywall() only once someone hits the free limit, so it
       does not exist when this runs — binding to it here found nothing. */
    document.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest('[data-snake-open]'))  { e.preventDefault(); open(); }
      else if (e.target.closest('[data-snake-close]')) { close(); }
      else if (e.target.closest('[data-snake-start]')) { start(); }
    });

    const copy = $('#snake-copy');
    if (copy) {
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(CODE);
          copy.textContent = 'Copied';
          setTimeout(() => { copy.textContent = 'Copy code'; }, 1800);
        } catch (_) {
          copy.textContent = 'Select it manually';
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { open, close, CODE };
})();
