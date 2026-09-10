/**
 * PaisaTrack Charts Engine
 * Lightweight, high-DPI HTML5 Canvas Charting Engine for Web and Mobile Android
 * Fully responsive with dynamic container-sizing, retina/mobile DPR scaling, and auto-redraw.
 */

const PaisaCharts = {
  // Cache of latest data for instant, zero-latency redraw on resize or tab switch
  _cache: {
    donut: {},
    trends: {},
    daily: {}
  },

  // Clear all cached datasets and clear all canvas drawings (used on logout and user switch)
  clearAll() {
    this._cache = { donut: {}, trends: {}, daily: {} };
    const chartIds = ['categoryDonutChart', 'trendBarChart', 'reportsDonutChart', 'dailyExpensesChart'];
    chartIds.forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    });
    const legend = document.getElementById('donutChartLegend');
    if (legend) legend.innerHTML = '';
  },

  // Setup canvas for Retina and Android high-DPI screens with dynamic container width
  setupCanvas(canvas, defaultHeight = 240) {
    const dpr = window.devicePixelRatio || 1;
    const parent = canvas.parentElement;
    
    // Compute container width dynamically
    let width = 340;
    if (parent && parent.clientWidth > 0) {
      width = parent.clientWidth;
    } else if (canvas.clientWidth > 0) {
      width = canvas.clientWidth;
    } else if (window.innerWidth > 0) {
      width = Math.min(window.innerWidth - 48, 600);
    }

    // Dynamic height based on screen width
    let height = defaultHeight;
    if (window.innerWidth <= 480) {
      height = Math.min(defaultHeight, Math.max(190, Math.round(width * 0.65)));
    }

    // Set CSS visual dimensions
    canvas.style.width = '100%';
    canvas.style.maxWidth = '100%';
    canvas.style.height = `${height}px`;
    canvas.style.display = 'block';

    // Set high-DPI internal buffer resolution
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext('2d');
    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);

    return { ctx, width, height };
  },

  // 1. Donut Chart for Category Breakdown
  renderDonutChart(canvasId, categories, currencyFormatter) {
    // Cache args for auto-redraw
    this._cache.donut[canvasId] = { categories, currencyFormatter };

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const { ctx, width, height } = this.setupCanvas(canvas, 230);
    ctx.clearRect(0, 0, width, height);

    if (!categories || categories.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No expenses recorded for this period', width / 2, height / 2);
      return;
    }

    const total = categories.reduce((sum, c) => sum + (c.total_amount || 0), 0);
    if (total === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('₹0.00 Expense this period', width / 2, height / 2);
      return;
    }

    const centerX = width / 2;
    const centerY = height / 2;
    // Adapt radius to available screen dimensions (ensures no clipping on 320px/360px phones)
    const radius = Math.max(50, Math.min(centerX, centerY) - 14);
    const innerRadius = radius * 0.62;

    let startAngle = -Math.PI / 2;

    categories.forEach(cat => {
      const sliceAngle = ((cat.total_amount || 0) / total) * (2 * Math.PI);
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();

      ctx.fillStyle = cat.category_color || '#6366f1';
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0b0f1c';
      ctx.stroke();

      startAngle = endAngle;
    });

    // Center Total Display
    const isSmall = width < 360;
    ctx.fillStyle = '#94a3b8';
    ctx.font = isSmall ? '10px "Plus Jakarta Sans", sans-serif' : '11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TOTAL EXPENSE', centerX, centerY - (isSmall ? 10 : 12));

    ctx.fillStyle = '#ffffff';
    ctx.font = isSmall ? 'bold 14px "Outfit", sans-serif' : 'bold 16px "Outfit", sans-serif';
    const formattedTotal = currencyFormatter ? currencyFormatter(total) : `₹${total.toFixed(0)}`;
    ctx.fillText(formattedTotal, centerX, centerY + (isSmall ? 8 : 10));
  },

  // 2. Dual Bar Trend Chart (Last 6 Months Income vs Expense)
  renderTrendBarChart(canvasId, trends, currencyFormatter) {
    this._cache.trends[canvasId] = { trends, currencyFormatter };

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const { ctx, width, height } = this.setupCanvas(canvas, 240);
    ctx.clearRect(0, 0, width, height);

    if (!trends || trends.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No historical trends available', width / 2, height / 2);
      return;
    }

    const isMobile = width < 480;
    const padding = {
      top: 32,
      right: isMobile ? 12 : 20,
      bottom: 38,
      left: isMobile ? 44 : 58
    };
    const chartW = Math.max(100, width - padding.left - padding.right);
    const chartH = Math.max(80, height - padding.top - padding.bottom);

    // Find max value
    let maxVal = 0;
    trends.forEach(t => {
      maxVal = Math.max(maxVal, t.income || 0, t.expense || 0);
    });
    maxVal = Math.max(maxVal, 10000) * 1.15;

    // Draw horizontal grid lines
    const gridLines = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = isMobile ? '10px "Plus Jakarta Sans", sans-serif' : '11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      const val = maxVal - (maxVal / gridLines) * i;

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const valLabel = val >= 100000 ? `${(val / 100000).toFixed(1)}L` : `${(val / 1000).toFixed(0)}k`;
      ctx.fillText(valLabel, padding.left - 6, y + 4);
    }

    const groupW = chartW / trends.length;
    const barW = Math.max(6, Math.min(isMobile ? 12 : 18, groupW * 0.32));

    trends.forEach((t, idx) => {
      const groupX = padding.left + idx * groupW + groupW / 2;

      // Income Bar (Emerald)
      const incH = Math.max(2, ((t.income || 0) / maxVal) * chartH);
      const incX = groupX - barW - 1.5;
      const incY = padding.top + chartH - incH;

      ctx.fillStyle = '#10b981';
      this.drawRoundedRect(ctx, incX, incY, barW, incH, 3);

      // Expense Bar (Rose)
      const expH = Math.max(2, ((t.expense || 0) / maxVal) * chartH);
      const expX = groupX + 1.5;
      const expY = padding.top + chartH - expH;

      ctx.fillStyle = '#f43f5e';
      this.drawRoundedRect(ctx, expX, expY, barW, expH, 3);

      // Month Label
      ctx.fillStyle = '#94a3b8';
      ctx.font = isMobile ? '10px "Plus Jakarta Sans", sans-serif' : '11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      
      // Shorten label on ultra compact screens if needed
      let label = t.month_label || '';
      if (isMobile && label.length > 4) {
        label = label.slice(0, 3);
      }
      ctx.fillText(label, groupX, height - padding.bottom + 18);
    });

    // Legend
    ctx.font = '11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#10b981';
    ctx.fillRect(padding.left, 10, 8, 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Income', padding.left + 12, 18);

    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(padding.left + (isMobile ? 62 : 78), 10, 8, 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Expense', padding.left + (isMobile ? 74 : 92), 18);
  },

  // 3. Day-by-Day Spending Timeline Bar Chart
  renderDailyChart(canvasId, days, peakDate, currencyFormatter) {
    this._cache.daily[canvasId] = { days, peakDate, currencyFormatter };

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const { ctx, width, height } = this.setupCanvas(canvas, 250);
    ctx.clearRect(0, 0, width, height);

    if (!days || days.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No daily data available for this month', width / 2, height / 2);
      return;
    }

    const isMobile = width < 500;
    const padding = {
      top: 30,
      right: isMobile ? 10 : 15,
      bottom: 36,
      left: isMobile ? 38 : 50
    };
    const chartW = Math.max(100, width - padding.left - padding.right);
    const chartH = Math.max(80, height - padding.top - padding.bottom);

    let maxVal = 0;
    days.forEach(d => {
      maxVal = Math.max(maxVal, d.expense || 0);
    });
    maxVal = Math.max(maxVal, 2000) * 1.15;

    // Grid lines
    const gridLines = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = isMobile ? '9px "Plus Jakarta Sans", sans-serif' : '10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      const val = maxVal - (maxVal / gridLines) * i;

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const valLabel = val >= 100000 ? `${(val / 100000).toFixed(1)}L` : `${(val / 1000).toFixed(0)}k`;
      ctx.fillText(valLabel, padding.left - 5, y + 3);
    }

    // Adaptive bar width based on number of days and screen width
    const slotW = chartW / days.length;
    const barW = Math.max(2, slotW - (isMobile ? 1 : 2.5));

    days.forEach((d, idx) => {
      const x = padding.left + idx * slotW + (slotW - barW) / 2;
      const expH = Math.max(2, ((d.expense || 0) / maxVal) * chartH);
      const y = padding.top + chartH - expH;

      const isPeak = d.date === peakDate && d.expense > 0;

      if (isPeak) {
        ctx.fillStyle = '#f59e0b'; // Amber Gold for Peak Day
      } else if (d.expense > 0) {
        ctx.fillStyle = '#f43f5e';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      }

      this.drawRoundedRect(ctx, x, y, barW, expH, barW > 3 ? 2 : 0);

      // Mobile smart label skipping: show 1st, every 5th day, and last day
      const shouldLabel = isMobile
        ? (d.day === 1 || d.day % 5 === 0 || d.day === days.length)
        : (d.day === 1 || d.day % 3 === 0 || d.day === days.length);

      if (shouldLabel) {
        ctx.fillStyle = isPeak ? '#f59e0b' : '#94a3b8';
        ctx.font = isMobile ? '9px "Plus Jakarta Sans", sans-serif' : '10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.day.toString(), x + barW / 2, height - padding.bottom + 16);
      }
    });

    // Legend
    ctx.font = '10.5px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(padding.left, 10, 8, 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Daily Expense', padding.left + 12, 17);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(padding.left + (isMobile ? 86 : 110), 10, 8, 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Peak Spending Day', padding.left + (isMobile ? 98 : 124), 17);
  },

  drawRoundedRect(ctx, x, y, width, height, radius) {
    if (height <= 0) return;
    if (radius <= 0 || width < 4) {
      ctx.fillRect(x, y, width, height);
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  },

  // Redraw all cached charts with updated responsive dimensions
  redrawAll() {
    // Redraw Donut charts
    Object.keys(this._cache.donut).forEach(canvasId => {
      const el = document.getElementById(canvasId);
      if (el && (el.offsetParent !== null || el.clientWidth > 0)) {
        const item = this._cache.donut[canvasId];
        this.renderDonutChart(canvasId, item.categories, item.currencyFormatter);
      }
    });

    // Redraw Trend charts
    Object.keys(this._cache.trends).forEach(canvasId => {
      const el = document.getElementById(canvasId);
      if (el && (el.offsetParent !== null || el.clientWidth > 0)) {
        const item = this._cache.trends[canvasId];
        this.renderTrendBarChart(canvasId, item.trends, item.currencyFormatter);
      }
    });

    // Redraw Daily charts
    Object.keys(this._cache.daily).forEach(canvasId => {
      const el = document.getElementById(canvasId);
      if (el && (el.offsetParent !== null || el.clientWidth > 0)) {
        const item = this._cache.daily[canvasId];
        this.renderDailyChart(canvasId, item.days, item.peakDate, item.currencyFormatter);
      }
    });
  }
};

// Automatic responsive redraw with debounce
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    PaisaCharts.redrawAll();
  }, 120);
});

// Also trigger on orientation change
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    PaisaCharts.redrawAll();
  }, 180);
});

window.PaisaCharts = PaisaCharts;
