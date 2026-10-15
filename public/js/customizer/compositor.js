(function attachCustomizerCompositor(global) {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getPreviewLabel(side) {
    return side === 'back' ? 'BACK' : 'FRONT';
  }

  function drawRoundedRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, radius);
      return;
    }

    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function drawZoneBadges(ctx, state, width, height) {
    const zones = Array.isArray(state.zones) ? state.zones.slice(0, 4) : [];
    if (!zones.length) return;

    ctx.save();
    ctx.font = '600 12px sans-serif';
    ctx.textBaseline = 'middle';

    zones.forEach((zone, index) => {
      const badgeWidth = 120;
      const badgeHeight = 28;
      const x = 24;
      const y = height - 36 - (index * (badgeHeight + 10));

      ctx.fillStyle = 'rgba(15, 13, 22, 0.72)';
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.24)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      drawRoundedRect(ctx, x, y, badgeWidth, badgeHeight, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fafafa';
      ctx.fillText(String(zone.label || zone.zone_label || zone.zoneKey || zone.zone_key || `ZONE ${index + 1}`).slice(0, 16), x + 12, y + 14);
    });

    ctx.restore();
  }

  function getDesignZones(state) {
    return state.design && Array.isArray(state.design.zones) ? state.design.zones : [];
  }

  function findZoneValue(state, matcher, fallback) {
    const zone = getDesignZones(state).find((entry) => matcher(String(entry.zoneKey || '').toLowerCase()));
    return zone && zone.color ? zone.color : fallback;
  }

  function pickBaseColor(state, side) {
    return findZoneValue(
      state,
      (key) => key.includes(`${side}-body`) || key.includes(`${side}-main`) || key.includes('body'),
      '#f4f4f5'
    );
  }

  function pickAccentColor(state, side) {
    return findZoneValue(
      state,
      (key) => key.includes(`${side}-trim`) || key.includes('collar') || key.includes('sleeve') || key.includes('accent'),
      '#7f1d45'
    );
  }

  function drawLogoBadge(ctx, state, x, y) {
    const logo = state.design && Array.isArray(state.design.logos) ? state.design.logos[0] : null;
    if (!logo) return;

    const label = String(logo.name || logo.slug || 'LOG').slice(0, 3).toUpperCase();
    ctx.save();
    ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fafafa';
    ctx.font = '800 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 1);
    ctx.restore();
  }

  function drawTextLayer(ctx, state, x, y, torsoWidth, torsoHeight, side) {
    const texts = state.design && state.design.texts && typeof state.design.texts === 'object'
      ? state.design.texts
      : {};

    ctx.save();
    ctx.textAlign = 'center';

    if (side === 'back') {
      if (texts.playerName) {
        ctx.fillStyle = '#fafafa';
        ctx.font = '700 16px sans-serif';
        ctx.fillText(String(texts.playerName).slice(0, 18).toUpperCase(), x + torsoWidth / 2, y + 120);
      }
      if (texts.playerNumber) {
        ctx.fillStyle = '#111827';
        ctx.font = '900 72px sans-serif';
        ctx.fillText(String(texts.playerNumber).slice(0, 3), x + torsoWidth / 2, y + torsoHeight * 0.7);
      }
    } else if (texts.teamName) {
      ctx.fillStyle = '#fafafa';
      ctx.font = '800 22px sans-serif';
      ctx.fillText(String(texts.teamName).slice(0, 18).toUpperCase(), x + torsoWidth / 2, y + 156);
    }

    ctx.restore();
  }

  function drawJerseyShape(ctx, state, width, height) {
    const activeSide = state.previews && state.previews.activeSide === 'back' ? 'back' : 'front';
    const selectedProductType = state.selectedProductType && state.selectedProductType.name
      ? state.selectedProductType.name
      : 'TEAMWEAR';
    const selectedTemplate = state.selectedTemplate && state.selectedTemplate.name
      ? state.selectedTemplate.name
      : 'Blank Template';

    const torsoWidth = clamp(width * 0.28, 180, 300);
    const torsoHeight = clamp(height * 0.46, 260, 360);
    const x = (width - torsoWidth) / 2;
    const y = (height - torsoHeight) / 2 + 10;
    const sleeveWidth = torsoWidth * 0.24;
    const sleeveHeight = torsoHeight * 0.2;
    const baseColor = pickBaseColor(state, activeSide);
    const accentColor = pickAccentColor(state, activeSide);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(x + sleeveWidth, y);
    ctx.lineTo(x + torsoWidth - sleeveWidth, y);
    ctx.lineTo(x + torsoWidth, y + sleeveHeight);
    ctx.lineTo(x + torsoWidth - 18, y + sleeveHeight + 16);
    ctx.lineTo(x + torsoWidth - 18, y + torsoHeight);
    ctx.lineTo(x + 18, y + torsoHeight);
    ctx.lineTo(x + 18, y + sleeveHeight + 16);
    ctx.lineTo(x, y + sleeveHeight);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.3)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    drawRoundedRect(ctx, x + 18, y + sleeveHeight + 22, torsoWidth - 36, 42, 14);
    ctx.fill();

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    drawRoundedRect(ctx, x + torsoWidth * 0.28, y + 94, torsoWidth * 0.44, activeSide === 'back' ? 116 : 136, 18);
    ctx.fill();

    ctx.strokeStyle = activeSide === 'back' ? 'rgba(244, 244, 245, 0.72)' : 'rgba(15, 13, 22, 0.24)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + torsoWidth * 0.5, y + 88);
    ctx.lineTo(x + torsoWidth * 0.5, y + torsoHeight - 26);
    ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.font = '700 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(getPreviewLabel(activeSide), width / 2, y + 54);

    ctx.fillStyle = '#fafafa';
    ctx.font = '800 18px sans-serif';
    ctx.fillText(String(selectedProductType).toUpperCase().slice(0, 20), width / 2, y + torsoHeight + 42);

    ctx.fillStyle = '#d4d4d8';
    ctx.font = '600 13px sans-serif';
    ctx.fillText(String(selectedTemplate).slice(0, 28), width / 2, y + torsoHeight + 66);

    drawTextLayer(ctx, state, x, y, torsoWidth, torsoHeight, activeSide);
    drawLogoBadge(ctx, state, x + torsoWidth * 0.28, y + 120);
    ctx.restore();
  }

  function paintCanvas(canvas, state) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bounds = typeof canvas.getBoundingClientRect === 'function'
      ? canvas.getBoundingClientRect()
      : { width: 720, height: 520 };
    const width = Math.max(360, Math.round(bounds.width || 720));
    const height = Math.max(420, Math.round(bounds.height || 520));
    const pixelRatio = typeof global.devicePixelRatio === 'number' ? global.devicePixelRatio : 1;

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#20182a');
    gradient.addColorStop(1, '#100d17');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(212, 175, 55, 0.05)';
    ctx.beginPath();
    ctx.arc(width * 0.22, height * 0.24, 140, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(127, 29, 69, 0.12)';
    ctx.beginPath();
    ctx.arc(width * 0.78, height * 0.3, 180, 0, Math.PI * 2);
    ctx.fill();

    drawJerseyShape(ctx, state, width, height);
    drawZoneBadges(ctx, state, width, height);
  }

  function createPreviewCompositor(root) {
    return {
      render(state) {
        if (!root || typeof root.querySelector !== 'function') return;
        const canvas = root.querySelector('[data-role="preview-canvas"]');
        paintCanvas(canvas, state || {});
      },
    };
  }

  global.CustomizerCompositor = {
    createPreviewCompositor,
  };
})(window);
