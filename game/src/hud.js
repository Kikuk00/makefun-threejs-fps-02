// The DOM HUD: health, ammo, round timer, round score, money, weapon, kill feed,
// plant/defuse progress, a top-down minimap and the buy menu. It never touches
// the simulation; main.js pushes numbers in and reads callbacks out. Every setter
// is cached, so the DOM is only written when a value actually changes.
import { BUY_ITEMS } from './weapons.js';

const COPY = {
  start: {
    title: 'Sable Yard',
    copy: 'Five against five in a dusk industrial yard. Plant the charge or wipe the Rustjackals — then hold the site. Click to play.',
    action: 'Click to play',
  },
  paused: { title: 'Sable Yard', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  round: { title: '', copy: '', action: 'Click to continue' },
  end: { title: 'Round over', copy: '', action: 'Next round' },
  match: { title: 'Match over', copy: '', action: 'Play again' },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammo = $('ammo');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const moneyValue = $('money-value');
  const hitmarker = $('hitmarker');
  const banner = $('banner');
  const bannerText = $('banner-text');
  const killfeed = $('killfeed');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const progressWrap = $('progress-wrap');
  const progressLabel = $('progress-label');
  const progressFill = $('progress-fill');
  const bombState = $('bomb-state');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');
  const crosshair = $('crosshair');
  let hitTimer = 0;
  let bannerTimer = 0;
  const cache = {};

  function setText(el, key, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    el.textContent = value;
  }

  // Buy menu rows are built once from the weapon table.
  for (const item of BUY_ITEMS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.dataset.item = item.id;
    row.innerHTML = `<span class="buy-key"></span><span class="buy-label"></span>`;
    row.querySelector('.buy-label').textContent = item.label;
    row.addEventListener('click', () => callbacks.onBuy(item.id));
    buyList.appendChild(row);
  }
  const buyRows = [...buyList.querySelectorAll('.buy-row')];
  buyRows.forEach((row, i) => {
    row.querySelector('.buy-key').textContent = String(i + 1);
  });

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'weapon', name);
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(value) {
      const v = Math.max(0, Math.round(value));
      setText(healthValue, 'health', String(v));
      healthFill.style.width = `${v}%`;
      healthFill.classList.toggle('low', v <= 30);
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerValue, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      timerValue.classList.toggle('urgent', seconds <= 10);
    },
    setScore(vanguard, rustjackal) {
      setText(scoreValue, 'score', `Vanguard ${vanguard} — ${rustjackal} Rustjackals`);
    },
    setMoney(value) {
      setText(moneyValue, 'money', `$${value}`);
      setText(buyMoney, 'buyMoney', `$${value}`);
      for (const row of buyRows) {
        const item = BUY_ITEMS.find((entry) => entry.id === row.dataset.item);
        row.classList.toggle('cant', value < item.price);
      }
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    showBanner(text, ms = 2600) {
      bannerText.textContent = text;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, ms);
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    setBomb(text) {
      setText(bombState, 'bomb', text);
      bombState.hidden = !text;
    },
    setProgress(label, fraction) {
      if (!label) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      setText(progressLabel, 'progress', label);
      progressFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    showBuy(show) {
      buyMenu.hidden = !show;
      if (show) buyMenu.querySelector('.buy-row').focus();
    },
    isBuyOpen() {
      return !buyMenu.hidden;
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = mode === 'round' || mode === 'end' || mode === 'match' ? detail.title : text.title;
      copy.textContent = detail && detail.copy ? detail.copy : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    // Top-down minimap: yard walls, site pads, the player (amber), teammates
    // (teal), enemies only once seen (rust), and the planted charge (flashing).
    drawMinimap(world, player, bots, bomb, time) {
      const w = minimap.width;
      const h = minimap.height;
      const toX = (x) => ((x + 22) / 44) * w;
      const toY = (z) => ((z + 18) / 36) * h;
      mapCtx.clearRect(0, 0, w, h);
      mapCtx.fillStyle = '#241c14';
      mapCtx.fillRect(0, 0, w, h);
      mapCtx.strokeStyle = '#4a3a28';
      mapCtx.lineWidth = 2;
      mapCtx.strokeRect(1, 1, w - 2, h - 2);
      for (const [key, site] of Object.entries(world.sites)) {
        mapCtx.fillStyle = bomb.planted && bomb.site === key ? '#e07830' : '#3a2f22';
        mapCtx.beginPath();
        mapCtx.arc(toX(site.x), toY(site.z), 7, 0, Math.PI * 2);
        mapCtx.fill();
      }
      for (const bot of bots) {
        if (!bot.alive) continue;
        if (bot.team === 'rustjackal' && bot.seenAt < time - 4 && bot.state !== 'engage') continue;
        mapCtx.fillStyle = bot.team === 'rustjackal' ? '#c8502e' : '#3fa7a0';
        mapCtx.beginPath();
        mapCtx.arc(toX(bot.position.x), toY(bot.position.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      mapCtx.fillStyle = '#f0a830';
      mapCtx.beginPath();
      mapCtx.arc(toX(player.position.x), toY(player.position.z), 3.5, 0, Math.PI * 2);
      mapCtx.fill();
      if (bomb.planted && Math.floor(time * 2) % 2 === 0) {
        mapCtx.fillStyle = '#ff5a2e';
        mapCtx.beginPath();
        mapCtx.arc(toX(world.sites[bomb.site].x), toY(world.sites[bomb.site].z), 5, 0, Math.PI * 2);
        mapCtx.fill();
      }
    },
  };
}
