/* Gamer Card: a 1080×1350 player card drawn on a canvas, previewed in a modal, downloadable as PNG/JPG. */
(function () {
  'use strict';
  window.EF = window.EF || {};

  const W = 1080;
  const H = 1350;
  const C = {
    ink: '#030720', ink2: '#08113a', ink3: '#111f5c',
    neon: '#d4ff1a', volt: '#3d6bff', text: '#eef2ff', soft: '#cdd6fb', muted: '#93a2d8',
    warn: '#ffb547', ok: '#4ade80',
  };
  const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";
  const BODY = "Inter, 'Segoe UI', Arial, sans-serif";

  const siteName = () => (window.EF_CONFIG && window.EF_CONFIG.SITE_NAME) || 'Game Board';

  /** Registration number shared by every page: order of sign-up among non-rejected players. */
  function idNo(player, players) {
    const list = (players || []).filter((p) => p.status !== 'rejected' && p.tournament_id === player.tournament_id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const i = list.findIndex((p) => p.id === player.id);
    return i >= 0 ? String(i + 1).padStart(3, '0') : '—';
  }

  const serial = (id) => String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase() || '00000000';

  async function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.all([
        document.fonts.load(`italic 900 80px ${DISPLAY}`),
        document.fonts.load(`800 60px ${DISPLAY}`),
        document.fonts.load(`700 40px ${DISPLAY}`),
        document.fonts.load(`600 30px ${BODY}`),
        document.fonts.load(`700 30px ${BODY}`),
      ]);
    } catch (_) { /* fall back to system fonts */ }
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) { resolve(null); return; }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Largest font size (≤ max) at which the text fits the width. */
  function fit(ctx, text, font, max, min, width) {
    let size = max;
    for (; size > min; size -= 2) {
      ctx.font = font(size);
      if (ctx.measureText(text).width <= width) return size;
    }
    ctx.font = font(min);
    return min;
  }

  function ellipsize(ctx, text, width) {
    if (ctx.measureText(text).width <= width) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
    return `${t}…`;
  }

  /** Split into at most two lines that fit the width. */
  function twoLines(ctx, text, width) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [''];
    words.forEach((w) => {
      const cur = lines[lines.length - 1];
      const next = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(next).width <= width || !cur) lines[lines.length - 1] = next;
      else lines.push(w);
    });
    if (lines.length > 2) lines.splice(1, lines.length - 1, lines.slice(1).join(' '));
    return lines.map((l) => ellipsize(ctx, l, width));
  }

  function hue(text) {
    let h = 0;
    const s = String(text || '');
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  async function draw(player, { tournament = {}, number = '—' } = {}) {
    await ensureFonts();
    const photo = EF.utils.isAvatarData(player.avatar_url) ? await loadImage(player.avatar_url) : null;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // ---- Background ----
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#13248a');
    bg.addColorStop(0.45, C.ink2);
    bg.addColorStop(1, C.ink);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W / 2, 520, 40, W / 2, 520, 620);
    glow.addColorStop(0, 'rgba(61,107,255,0.45)');
    glow.addColorStop(1, 'rgba(61,107,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Diagonal neon stripes (top-left and bottom-right).
    ctx.save();
    ctx.lineCap = 'round';
    [[-60, 260, 12, 0.9], [-10, 300, 5, 0.5]].forEach(([x, len, wdt, a]) => {
      ctx.strokeStyle = `rgba(212,255,26,${a})`; ctx.lineWidth = wdt;
      ctx.beginPath(); ctx.moveTo(x + 120, -20); ctx.lineTo(x - 40 + 120 - len * 0.5, len); ctx.stroke();
    });
    [[W + 40, 12, 0.9], [W + 90, 5, 0.5]].forEach(([x, wdt, a]) => {
      ctx.strokeStyle = `rgba(212,255,26,${a})`; ctx.lineWidth = wdt;
      ctx.beginPath(); ctx.moveTo(x - 30, H - 150); ctx.lineTo(x - 110, H + 20); ctx.stroke();
    });
    ctx.restore();

    // Subtle pitch lines.
    ctx.save();
    ctx.strokeStyle = 'rgba(140,160,255,0.07)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W / 2, 520, 360, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 520); ctx.lineTo(W, 520); ctx.stroke();
    ctx.restore();

    // Card frame.
    ctx.save();
    roundRect(ctx, 22, 22, W - 44, H - 44, 44);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(140,160,255,0.35)';
    ctx.stroke();
    ctx.restore();

    ctx.textBaseline = 'alphabetic';

    // ---- Header: brand + tournament ----
    ctx.textAlign = 'left';
    ctx.fillStyle = C.neon;
    ctx.font = `italic 900 40px ${DISPLAY}`;
    ctx.fillText(siteName().toUpperCase(), 76, 104);
    const brandW = ctx.measureText(siteName().toUpperCase()).width;

    ctx.textAlign = 'right';
    ctx.font = `700 24px ${BODY}`;
    ctx.fillStyle = C.soft;
    ctx.fillText('OFFICIAL GAMER CARD', W - 76, 100);

    ctx.fillStyle = 'rgba(212,255,26,0.8)';
    ctx.fillRect(76, 124, Math.min(brandW, 160), 5);

    const tName = String(tournament.name || 'eFootball Tournament').toUpperCase();
    ctx.textAlign = 'center';
    ctx.fillStyle = C.text;
    const tSize = fit(ctx, tName, (s) => `italic 900 ${s}px ${DISPLAY}`, 78, 44, W - 150);
    ctx.font = `italic 900 ${tSize}px ${DISPLAY}`;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 18;
    ctx.fillText(ellipsize(ctx, tName, W - 150), W / 2, 210);
    ctx.shadowBlur = 0;
    if (tournament.season) {
      ctx.font = `800 28px ${DISPLAY}`;
      ctx.fillStyle = C.neon;
      ctx.fillText(String(tournament.season).toUpperCase(), W / 2, 252);
    }

    // Measure the name first: a two-line name gets a slightly smaller photo so nothing overlaps.
    const name = String(player.player_name || 'Player').toUpperCase();
    const nameSize = fit(ctx, name, (s) => `italic 900 ${s}px ${DISPLAY}`, 104, 74, W - 140);
    ctx.font = `italic 900 ${nameSize}px ${DISPLAY}`;
    const nameLines = ctx.measureText(name).width <= W - 140 ? [name] : twoLines(ctx, name, W - 140);

    // ---- Photo ----
    const PS = nameLines.length > 1 ? 440 : 520;
    const px = (W - PS) / 2;
    const py = 290;
    ctx.save();
    ctx.shadowColor = 'rgba(212,255,26,0.55)';
    ctx.shadowBlur = 50;
    roundRect(ctx, px, py, PS, PS, 48);
    ctx.fillStyle = C.ink3;
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, px, py, PS, PS, 48);
    ctx.clip();
    if (photo) {
      const side = Math.min(photo.naturalWidth, photo.naturalHeight);
      ctx.drawImage(photo, (photo.naturalWidth - side) / 2, (photo.naturalHeight - side) / 2, side, side, px, py, PS, PS);
    } else {
      const h = hue(player.player_name);
      const g = ctx.createLinearGradient(px, py, px + PS, py + PS);
      g.addColorStop(0, `hsl(${h},70%,45%)`);
      g.addColorStop(1, `hsl(${(h + 40) % 360},70%,22%)`);
      ctx.fillStyle = g;
      ctx.fillRect(px, py, PS, PS);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.textAlign = 'center';
      ctx.font = `italic 900 ${Math.round(PS * 0.44)}px ${DISPLAY}`;
      ctx.fillText(EF.utils.initials(player.player_name), W / 2, py + PS / 2 + PS * 0.16);
    }
    const shade = ctx.createLinearGradient(0, py + PS * 0.6, 0, py + PS);
    shade.addColorStop(0, 'rgba(3,7,32,0)');
    shade.addColorStop(1, 'rgba(3,7,32,0.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(px, py, PS, PS);
    ctx.restore();

    roundRect(ctx, px, py, PS, PS, 48);
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.neon;
    ctx.stroke();

    // ID No badge over the photo's top-left corner.
    ctx.save();
    roundRect(ctx, px - 36, py + 34, 170, 96, 22);
    ctx.fillStyle = C.neon;
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 20;
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#06102f';
    ctx.font = `800 20px ${BODY}`;
    ctx.fillText('ID NO', px - 36 + 85, py + 66);
    ctx.font = `italic 900 50px ${DISPLAY}`;
    ctx.fillText(`#${number}`, px - 36 + 85, py + 114);

    // Status chip at the photo's top-right.
    const approved = player.status === 'approved';
    const stText = approved ? 'VERIFIED' : 'PENDING';
    ctx.font = `800 22px ${BODY}`;
    const stW = ctx.measureText(stText).width + 62;
    const sx = px + PS - stW - 22;
    const sy = py + 24;
    roundRect(ctx, sx, sy, stW, 46, 23);
    ctx.fillStyle = 'rgba(3,7,32,0.78)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = approved ? C.ok : C.warn;
    ctx.stroke();
    ctx.fillStyle = approved ? C.ok : C.warn;
    ctx.beginPath(); ctx.arc(sx + 26, sy + 23, 7, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillText(stText, sx + 42, sy + 31);

    // ---- Name + team ----
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `italic 900 ${nameSize}px ${DISPLAY}`;
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 16;
    let y = py + PS + 104;
    nameLines.forEach((line, i) => { ctx.fillText(line, W / 2, y + i * 78); });
    ctx.shadowBlur = 0;
    y += (nameLines.length - 1) * 78;

    // Team with a small shield.
    const team = String(player.team_name || '—');
    ctx.font = `700 40px ${DISPLAY}`;
    const teamText = ellipsize(ctx, team.toUpperCase(), W - 220);
    const tw = ctx.measureText(teamText).width;
    const tx = W / 2 - (tw + 46) / 2;
    const ty = y + 58;
    ctx.save();
    ctx.translate(tx, ty - 30);
    ctx.beginPath();
    ctx.moveTo(15, 0); ctx.lineTo(30, 6); ctx.lineTo(30, 18); ctx.quadraticCurveTo(30, 32, 15, 38); ctx.quadraticCurveTo(0, 32, 0, 18); ctx.lineTo(0, 6); ctx.closePath();
    ctx.fillStyle = C.neon;
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = C.neon;
    ctx.fillText(teamText, tx + 46, ty);

    // ---- Info tiles ----
    const tiles = [
      ['eFootball Username', `@${player.efootball_username || '—'}`],
      ['Registered', EF.utils.formatDate(player.created_at, { day: '2-digit', month: 'short', year: 'numeric' })],
    ];
    const gap = 24;
    const tileW = (W - 120 - gap) / 2;
    const tileY = Math.max(ty + 40, H - 290);
    tiles.forEach(([label, value], i) => {
      const x = 60 + i * (tileW + gap);
      roundRect(ctx, x, tileY, tileW, 128, 24);
      ctx.fillStyle = 'rgba(8,17,58,0.85)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(140,160,255,0.3)';
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = C.muted;
      ctx.font = `700 22px ${BODY}`;
      ctx.fillText(label.toUpperCase(), x + 28, tileY + 46);
      ctx.fillStyle = i === 0 ? '#9fb6ff' : C.text;
      ctx.font = `700 40px ${DISPLAY}`;
      const vs = fit(ctx, value, (s) => `700 ${s}px ${DISPLAY}`, 46, 28, tileW - 56);
      ctx.font = `700 ${vs}px ${DISPLAY}`;
      ctx.fillText(ellipsize(ctx, value, tileW - 56), x + 28, tileY + 98);
    });

    // ---- Footer ----
    ctx.fillStyle = 'rgba(140,160,255,0.18)';
    ctx.fillRect(60, H - 128, W - 120, 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = `600 22px ${BODY}`;
    ctx.fillText(`CARD ID · ${serial(player.id)}`, 64, H - 80);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.neon;
    ctx.font = `italic 800 30px ${DISPLAY}`;
    ctx.fillText(`${siteName().toUpperCase()} · eFOOTBALL`, W - 150, H - 78);

    return canvas;
  }

  const slug = (s) => String(s || 'player').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'player';

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** Preview modal with PNG / JPG download (and Share on phones that support it). */
  async function open(player, opts = {}) {
    const ui = EF.ui;
    const e = EF.utils.escapeHtml;
    const modal = ui.modal({ title: 'Gamer Card', size: 'md', body: ui.state.loading('Creating gamer card') });
    try {
      const canvas = await draw(player, opts);
      const png = canvas.toDataURL('image/png');
      const base = `gamer-card-${slug(player.player_name)}-${opts.number || ''}`.replace(/-$/, '');
      modal.setBody(`
        <div class="gcard">
          <img class="gcard__img" src="${png}" alt="Gamer card for ${e(player.player_name)}">
          <div class="gcard__actions">
            <button type="button" class="btn btn-primary" data-dl="png">${ui.icon('download', '')}Download PNG</button>
            <button type="button" class="btn btn-outline" data-dl="jpg">${ui.icon('image-down', '')}Download JPG</button>
            <button type="button" class="btn btn-ghost" data-share hidden>${ui.icon('share-2', '')}Share</button>
          </div>
          <p class="gcard__hint">1080 × 1350 · PNG for best quality, JPG for a smaller file (Facebook / WhatsApp).</p>
        </div>`);
      const body = modal.body;
      body.querySelector('[data-dl="png"]').addEventListener('click', () => download(png, `${base}.png`));
      body.querySelector('[data-dl="jpg"]').addEventListener('click', () => download(canvas.toDataURL('image/jpeg', 0.92), `${base}.jpg`));

      const shareBtn = body.querySelector('[data-share]');
      canvas.toBlob((blob) => {
        if (!blob || !navigator.canShare) return;
        const file = new File([blob], `${base}.png`, { type: 'image/png' });
        if (!navigator.canShare({ files: [file] })) return;
        shareBtn.hidden = false;
        shareBtn.addEventListener('click', () => {
          navigator.share({ files: [file], title: `${player.player_name} · Gamer Card` }).catch(() => {});
        });
      }, 'image/png');
      ui.icons();
    } catch (err) {
      console.error(err);
      modal.setBody(ui.state.error({ message: 'The gamer card could not be created. Please try again.', retry: false }));
      ui.icons();
    }
  }

  EF.gamerCard = { draw, open, idNo, serial };
})();
