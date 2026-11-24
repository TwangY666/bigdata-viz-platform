/* 手写 SVG 图表引擎：bar / hbar / grouped / stacked / line / hist / donut / scatter / box / heat / corr */
(function () {
  'use strict';

  var FONT_DATA = "'Cascadia Mono','JetBrains Mono','SF Mono','Consolas',ui-monospace,monospace";
  var FONT_BODY = "'Segoe UI','PingFang SC','Microsoft YaHei UI',system-ui,sans-serif";

  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function palette() {
    var series = [];
    for (var i = 1; i <= 8; i++) series.push(css('--c-series-' + i, '#2fe0c6'));
    return {
      series: series,
      fg: css('--c-fg', '#e8f0f6'),
      strong: css('--c-fg-strong', '#ffffff'),
      muted: css('--c-muted', '#8aa2b5'),
      border: css('--c-border', '#1e2e3b'),
      soft: css('--c-border-soft', '#16232e'),
      surface: css('--c-surface-2', '#14202b'),
      accent: css('--c-accent', '#2fe0c6'),
      bg: css('--c-bg', '#070c12'),
      danger: css('--c-danger', '#ff4d5e')
    };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function hexRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) return [128, 128, 128];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    var A = hexRgb(a), B = hexRgb(b);
    var c = A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); });
    return 'rgb(' + c.join(',') + ')';
  }

  function lum(color) {
    var c = color.indexOf('rgb') === 0
      ? color.match(/\d+/g).map(Number)
      : hexRgb(color);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  }

  function ink(color) { return lum(color) > 0.55 ? '#06121a' : '#ffffff'; }

  function round1(v) { return Math.round(v * 10) / 10; }

  function fmt(v, mode) {
    if (v == null || !isFinite(v)) return '—';
    if (mode === 'pct') return round1(v) + '%';
    if (mode === 'time') {
      var m = Math.round(v);
      return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
    }
    if (mode === 'auto') {
      /* 普通表数值：保留足以区分结果的小数，不缩写成 k/万 */
      return new Intl.NumberFormat('zh-CN', {
        maximumFractionDigits: Math.abs(v) >= 1 ? 2 : 4
      }).format(v);
    }
    var prefix = mode === 'money' ? '¥' : '';
    if (mode === 'sep' || mode === 'moneysep') {
      return (mode === 'moneysep' ? '¥' : '') + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    var a = Math.abs(v);
    if (a >= 10000) return prefix + round1(v / 10000) + '万';
    if (a >= 1000) return prefix + round1(v / 1000) + 'k';
    if (a >= 100) return prefix + Math.round(v);
    return prefix + round1(v);
  }

  function niceTicks(min, max, count) {
    if (!isFinite(min) || !isFinite(max) || min === max) { max = min + 1; }
    var span = max - min;
    var step = Math.pow(10, Math.floor(Math.log(span / count) / Math.LN10));
    var err = span / count / step;
    if (err >= 7.5) step *= 10;
    else if (err >= 3.5) step *= 5;
    else if (err >= 1.5) step *= 2;
    var lo = Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var out = [];
    for (var v = lo; v <= hi + step * 0.5; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  function textW(s, size) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? size : size * 0.58;
    return w;
  }

  function truncate(s, maxW, size) {
    if (textW(s, size) <= maxW) return s;
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (textW(out + s[i] + '…', size) > maxW) break;
      out += s[i];
    }
    return out + '…';
  }

  function axisLeft(ticks, fmtMode, min) {
    var widest = 0;
    ticks.forEach(function (t) { widest = Math.max(widest, textW(fmt(t, fmtMode), 10.5)); });
    return Math.max(min, Math.ceil(widest) + 12);
  }

  function rotBottom(maxLab, cap, min) {
    return Math.max(min, Math.ceil(Math.min(cap, maxLab) * 0.6 + 18));
  }

  function emptySvg(w, h, p, msg) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img">' +
      '<text x="' + w / 2 + '" y="' + h / 2 + '" text-anchor="middle" font-family="' + FONT_BODY + '" font-size="13" fill="' + p.muted + '">' + esc(msg || '当前筛选下没有数据') + '</text></svg>';
  }

  function frame(w, h, p, m, ticks, yScale, fmtMode, yLabel) {
    var s = '';
    ticks.forEach(function (t) {
      var y = yScale(t);
      s += '<line x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + y + '" y2="' + y + '" stroke="' + p.soft + '" stroke-width="1"/>';
      s += '<text x="' + (m.l - 8) + '" y="' + (y + 3.5) + '" text-anchor="end" font-family="' + FONT_DATA + '" font-size="10.5" fill="' + p.muted + '">' + esc(fmt(t, fmtMode)) + '</text>';
    });
    s += '<line x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + (h - m.b) + '" y2="' + (h - m.b) + '" stroke="' + p.border + '" stroke-width="1"/>';
    if (yLabel) {
      s += '<text x="' + m.l + '" y="' + (m.t - 3) + '" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(yLabel) + '</text>';
    }
    return s;
  }

  function xLabels(labels, m, w, h, plotW, band, p, rotate) {
    var s = '';
    var every = labels.length > 22 ? Math.ceil(labels.length / 14) : 1;
    labels.forEach(function (lab, i) {
      if (i % every !== 0 && i !== labels.length - 1) return;
      var x = m.l + band * (i + 0.5);
      if (rotate) {
        var cap = Math.min(74, (x - 2) / 0.829);
        s += '<text x="' + x + '" y="' + (h - m.b + 12) + '" transform="rotate(-34 ' + x + ' ' + (h - m.b + 12) + ')" text-anchor="end" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(truncate(lab, cap, 10.5)) + '</text>';
      } else {
        s += '<text x="' + x + '" y="' + (h - m.b + 16) + '" text-anchor="middle" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(truncate(lab, band - 4, 10.5)) + '</text>';
      }
    });
    return s;
  }

  /* ---------- 柱状 / 分组 / 堆叠 / 直方 ---------- */

  function bars(spec, p, w, h, opts) {
    var x = spec.x || [];
    var series = (spec.series || []).filter(function (s) { return s.values && s.values.length; });
    if (!x.length || !series.length) return { svg: emptySvg(w, h, p), legend: [] };
    var mode = spec.mode || (series.length > 1 ? 'group' : 'single');
    var fmtMode = spec.fmt || 'num';
    var sums = x.map(function (_, i) {
      return series.reduce(function (a, s) { return a + (Number(s.values[i]) || 0); }, 0);
    });
    var maxV = mode === 'stack' ? Math.max.apply(null, sums) : Math.max.apply(null, series.reduce(function (a, s) { return a.concat(s.values.map(Number)); }, []));
    if (!isFinite(maxV) || maxV <= 0) maxV = 1;
    var ticks = niceTicks(0, maxV * 1.06, 5);
    var top = ticks[ticks.length - 1];
    var maxLab = Math.max.apply(null, x.map(function (l) { return textW(String(l), 10.5); }));
    var mL = axisLeft(ticks, fmtMode, 46);
    var rotate = maxLab * x.length > (w - mL - 14) * 0.92 && x.length > 3;
    var m = { t: spec.yLabel ? 22 : 14, r: 14, b: rotate ? rotBottom(maxLab, 74, 46) : 30, l: mL };
    var plotW = w - m.l - m.r, plotH = h - m.t - m.b;
    if (plotW < 40 || plotH < 40) return { svg: emptySvg(w, h, p, '图表区域过小'), legend: [] };
    var y = function (v) { return m.t + plotH - (v / top) * plotH; };
    var band = plotW / x.length;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(spec.aria || spec.title || '柱状图') + '">';
    s += frame(w, h, p, m, ticks, y, fmtMode, spec.yLabel);
    var inner = band * (mode === 'stack' ? 0.6 : 0.74);
    var slot = mode === 'group' ? inner / series.length : inner;
    var showLabels = opts.labels && band >= 26 && x.length <= 16;
    x.forEach(function (lab, i) {
      var x0 = m.l + band * i + (band - inner) / 2;
      var acc = 0;
      series.forEach(function (ser, si) {
        var v = Number(ser.values[i]) || 0;
        var color = ser.color || p.series[si % 8];
        var bh, by;
        if (mode === 'stack') {
          bh = (v / top) * plotH;
          by = y(acc + v);
          acc += v;
        } else {
          bh = (v / top) * plotH;
          by = y(v);
        }
        var bx = mode === 'group' ? x0 + slot * si : x0;
        var bw = Math.max(2, mode === 'group' ? slot - 2 : inner);
        if (bh < 0.6) bh = v > 0 ? 0.6 : 0;
        var delay = opts.animate ? ' style="animation-delay:' + Math.min(i * 22 + si * 40, 420) + 'ms"' : '';
        s += '<rect class="c-bar' + (opts.animate ? ' c-grow' : '') + '" x="' + round1(bx) + '" y="' + round1(by) + '" width="' + round1(bw) + '" height="' + round1(bh) + '" rx="2.5" fill="' + color + '" data-tip="' + esc(lab + (series.length > 1 ? ' · ' + ser.name : '') + '\n' + fmt(v, fmtMode)) + '"' + delay + '/>';
        if (showLabels && (mode !== 'group' || si === series.length - 1) && v > 0) {
          var lv = mode === 'stack' ? sums[i] : v;
          var ly = mode === 'stack' ? y(sums[i]) : by;
          if (mode !== 'stack' || si === series.length - 1) {
            s += '<text x="' + round1(bx + bw / 2) + '" y="' + round1(ly - 5) + '" text-anchor="middle" font-family="' + FONT_DATA + '" font-size="10" fill="' + p.fg + '">' + esc(fmt(lv, fmtMode)) + '</text>';
          }
        }
      });
    });
    s += xLabels(x, m, w, h, plotW, band, p, rotate);
    if (spec.xLabel) s += '<text x="' + (w - m.r) + '" y="' + (h - 4) + '" text-anchor="end" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(spec.xLabel) + '</text>';
    s += '</svg>';
    var legend = series.length > 1 ? series.map(function (ser, i) { return { name: ser.name, color: ser.color || p.series[i % 8] }; }) : [];
    return { svg: s, legend: legend };
  }

  function hbars(spec, p, w, h, opts) {
    var x = spec.x || [];
    var values = (spec.series && spec.series[0] && spec.series[0].values) || [];
    if (!x.length) return { svg: emptySvg(w, h, p), legend: [] };
    var fmtMode = spec.fmt || 'num';
    var maxV = Math.max.apply(null, values.map(Number).concat([1]));
    var ticks = niceTicks(0, maxV * 1.08, 4);
    var top = ticks[ticks.length - 1];
    var labCap = Math.max(104, Math.min(240, w * 0.24));
    var labW = Math.min(labCap, Math.max.apply(null, x.map(function (l) { return textW(String(l), 11); })) + 14);
    var m = { t: 12, r: opts.labels ? 52 : 18, b: 26, l: labW };
    var plotW = w - m.l - m.r, plotH = h - m.t - m.b;
    if (plotW < 40 || plotH < 30) return { svg: emptySvg(w, h, p, '图表区域过小'), legend: [] };
    var band = plotH / x.length;
    var bh = Math.min(20, band * 0.62);
    var color = (spec.series[0] && spec.series[0].color) || p.series[0];
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(spec.aria || '排行条形图') + '">';
    ticks.forEach(function (t) {
      var gx = m.l + (t / top) * plotW;
      s += '<line x1="' + gx + '" x2="' + gx + '" y1="' + m.t + '" y2="' + (h - m.b) + '" stroke="' + p.soft + '"/>';
      s += '<text x="' + gx + '" y="' + (h - m.b + 15) + '" text-anchor="middle" font-family="' + FONT_DATA + '" font-size="10" fill="' + p.muted + '">' + esc(fmt(t, fmtMode)) + '</text>';
    });
    x.forEach(function (lab, i) {
      var v = Number(values[i]) || 0;
      var by = m.t + band * i + (band - bh) / 2;
      var bw = (v / top) * plotW;
      var c = spec.colors ? spec.colors[i % spec.colors.length] : color;
      var delay = opts.animate ? ' style="animation-delay:' + Math.min(i * 30, 360) + 'ms"' : '';
      s += '<text x="' + (m.l - 8) + '" y="' + round1(by + bh / 2 + 3.5) + '" text-anchor="end" font-family="' + FONT_BODY + '" font-size="11" fill="' + p.fg + '">' + esc(truncate(lab, labW - 12, 11)) + '</text>';
      s += '<rect class="c-bar' + (opts.animate ? ' c-grow-x' : '') + '" x="' + m.l + '" y="' + round1(by) + '" width="' + round1(Math.max(bw, 1)) + '" height="' + round1(bh) + '" rx="2.5" fill="' + c + '" data-tip="' + esc(lab + '\n' + fmt(v, fmtMode)) + '"' + delay + '/>';
      if (opts.labels) {
        s += '<text x="' + round1(m.l + bw + 6) + '" y="' + round1(by + bh / 2 + 3.5) + '" font-family="' + FONT_DATA + '" font-size="10" fill="' + p.muted + '">' + esc(fmt(v, fmtMode)) + '</text>';
      }
    });
    s += '</svg>';
    return { svg: s, legend: [] };
  }

  /* ---------- 折线 / 面积 ---------- */

  function line(spec, p, w, h, opts) {
    var x = spec.x || [];
    var series = (spec.series || []).filter(function (s) { return s.values && s.values.length; });
    if (x.length < 2 || !series.length) return { svg: emptySvg(w, h, p), legend: [] };
    var fmtMode = spec.fmt || 'num';
    var all = series.reduce(function (a, s) { return a.concat(s.values.map(Number)); }, []);
    var maxV = Math.max.apply(null, all), minV = Math.min.apply(null, all);
    if (!isFinite(maxV)) maxV = 1;
    var lo = spec.zero === false ? minV : Math.min(0, minV);
    var ticks = niceTicks(lo, maxV * 1.08, 5);
    var top = ticks[ticks.length - 1], bottom = ticks[0];
    var m = { t: spec.yLabel ? 22 : 14, r: 16, b: 30, l: axisLeft(ticks, fmtMode, 48) };
    var plotW = w - m.l - m.r, plotH = h - m.t - m.b;
    if (plotW < 40 || plotH < 40) return { svg: emptySvg(w, h, p, '图表区域过小'), legend: [] };
    var y = function (v) { return m.t + plotH - ((v - bottom) / (top - bottom)) * plotH; };
    var px = function (i) { return m.l + (plotW * i) / (x.length - 1); };
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(spec.aria || '趋势折线图') + '">';
    s += '<defs>';
    series.forEach(function (ser, i) {
      var c = ser.color || p.series[i % 8];
      s += '<linearGradient id="lg' + i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity="0.3"/><stop offset="1" stop-color="' + c + '" stop-opacity="0.02"/></linearGradient>';
    });
    s += '</defs>';
    s += frame(w, h, p, m, ticks, y, fmtMode, spec.yLabel);
    var every = x.length > 16 ? Math.ceil(x.length / 10) : 1;
    x.forEach(function (lab, i) {
      if (i % every !== 0 && i !== x.length - 1) return;
      var anchor = i === 0 ? 'start' : i === x.length - 1 ? 'end' : 'middle';
      s += '<text x="' + round1(px(i)) + '" y="' + (h - m.b + 16) + '" text-anchor="' + anchor + '" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(truncate(lab, 58, 10.5)) + '</text>';
    });
    series.forEach(function (ser, si) {
      var c = ser.color || p.series[si % 8];
      var pts = ser.values.map(function (v, i) { return round1(px(i)) + ',' + round1(y(Number(v) || 0)); });
      if (spec.area) {
        s += '<path class="' + (opts.animate ? 'c-fade' : '') + '" d="M' + pts.join(' L') + ' L' + round1(px(x.length - 1)) + ',' + (h - m.b) + ' L' + m.l + ',' + (h - m.b) + ' Z" fill="url(#lg' + si + ')"/>';
      }
      s += '<path class="' + (opts.animate ? 'c-draw' : '') + '" d="M' + pts.join(' L') + '" fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>';
      if (x.length <= 46) {
        ser.values.forEach(function (v, i) {
          s += '<circle class="' + (opts.animate ? 'c-fade' : '') + '" cx="' + round1(px(i)) + '" cy="' + round1(y(Number(v) || 0)) + '" r="2.6" fill="' + c + '" stroke="' + p.bg + '" stroke-width="1"/>';
        });
      }
    });
    x.forEach(function (lab, i) {
      var tip = lab + '\n' + series.map(function (ser) { return ser.name + ' ' + fmt(Number(ser.values[i]) || 0, fmtMode); }).join('\n');
      var slotW = plotW / (x.length - 1);
      s += '<rect class="c-slot" x="' + round1(px(i) - slotW / 2) + '" y="' + m.t + '" width="' + round1(slotW) + '" height="' + plotH + '" fill="transparent" data-tip="' + esc(tip) + '"/>';
    });
    if (spec.xLabel) s += '<text x="' + (w - m.r) + '" y="' + (h - 4) + '" text-anchor="end" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(spec.xLabel) + '</text>';
    s += '</svg>';
    return { svg: s, legend: series.length > 1 ? series.map(function (ser, i) { return { name: ser.name, color: ser.color || p.series[i % 8] }; }) : [] };
  }

  /* ---------- 环形 ---------- */

  function arcPath(cx, cy, r0, r1, a0, a1) {
    if (a1 - a0 >= Math.PI * 2 - 1e-6) {
      var am = a0 + Math.PI;
      return arcPath(cx, cy, r0, r1, a0, am) + ' ' + arcPath(cx, cy, r0, r1, am, a1);
    }
    var large = a1 - a0 > Math.PI ? 1 : 0;
    var p0 = [cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0)];
    var p1 = [cx + r1 * Math.cos(a1), cy + r1 * Math.sin(a1)];
    var p2 = [cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1)];
    var p3 = [cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0)];
    return 'M' + round1(p0[0]) + ',' + round1(p0[1]) +
      ' A' + r1 + ',' + r1 + ' 0 ' + large + ' 1 ' + round1(p1[0]) + ',' + round1(p1[1]) +
      ' L' + round1(p2[0]) + ',' + round1(p2[1]) +
      ' A' + r0 + ',' + r0 + ' 0 ' + large + ' 0 ' + round1(p3[0]) + ',' + round1(p3[1]) + ' Z';
  }

  function donut(spec, p, w, h, opts) {
    var slices = (spec.slices || []).filter(function (s) { return Number(s.value) > 0; });
    if (!slices.length) return { svg: emptySvg(w, h, p), legend: [] };
    var total = slices.reduce(function (a, s) { return a + Number(s.value); }, 0);
    var cx = w / 2, cy = h / 2;
    var r1 = Math.max(30, Math.min(w, h) / 2 - 12);
    var r0 = r1 * 0.62;
    var fmtMode = spec.fmt || 'num';
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(spec.aria || '占比环形图') + '">';
    s += '<g class="' + (opts.animate ? 'c-pop' : '') + '" style="transform-origin:' + cx + 'px ' + cy + 'px">';
    var a = -Math.PI / 2;
    slices.forEach(function (sl, i) {
      var frac = Number(sl.value) / total;
      var a1 = a + frac * Math.PI * 2;
      var gap = slices.length > 1 ? 0.018 : 0;
      var c = sl.color || p.series[i % 8];
      s += '<path class="c-arc" d="' + arcPath(cx, cy, r0, r1, a + gap / 2, a1 - gap / 2) + '" fill="' + c + '" data-tip="' + esc(sl.label + '\n' + fmt(sl.value, fmtMode) + ' · ' + round1(frac * 100) + '%') + '"/>';
      if (opts.labels && frac > 0.07 && r1 > 52) {
        var mid = (a + a1) / 2, rr = (r0 + r1) / 2;
        s += '<text x="' + round1(cx + rr * Math.cos(mid)) + '" y="' + round1(cy + rr * Math.sin(mid) + 3.5) + '" text-anchor="middle" font-family="' + FONT_DATA + '" font-size="10.5" font-weight="600" fill="' + ink(c) + '" pointer-events="none">' + Math.round(frac * 100) + '%</text>';
      }
      a = a1;
    });
    s += '</g>';
    var center = spec.center || { value: fmt(total, fmtMode), label: '合计' };
    s += '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-family="' + FONT_DATA + '" font-size="' + Math.min(24, r0 * 0.62) + '" font-weight="700" fill="' + p.strong + '">' + esc(center.value) + '</text>';
    s += '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-family="' + FONT_BODY + '" font-size="11" fill="' + p.muted + '">' + esc(center.label) + '</text>';
    s += '</svg>';
    return {
      svg: s,
      legend: slices.map(function (sl, i) {
        return { name: sl.label + ' ' + round1(Number(sl.value) / total * 100) + '%', color: sl.color || p.series[i % 8] };
      })
    };
  }

  /* ---------- 散点 ---------- */

  function scatter(spec, p, w, h, opts) {
    var pts = spec.points || [];
    if (pts.length < 2) return { svg: emptySvg(w, h, p), legend: [] };
    var xs = pts.map(function (d) { return d.x; }), ys = pts.map(function (d) { return d.y; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
    var xPad = (xMax - xMin) * 0.06 || 1, yPad = (yMax - yMin) * 0.08 || 1;
    var xt = niceTicks(xMin - xPad, xMax + xPad, 5);
    var yt = niceTicks(yMin - yPad, yMax + yPad, 5);
    var m = { t: spec.yLabel ? 22 : 14, r: 16, b: 34, l: axisLeft(yt, spec.fmt, 48) };
    var plotW = w - m.l - m.r, plotH = h - m.t - m.b;
    if (plotW < 40 || plotH < 40) return { svg: emptySvg(w, h, p, '图表区域过小'), legend: [] };
    var X = function (v) { return m.l + ((v - xt[0]) / (xt[xt.length - 1] - xt[0])) * plotW; };
    var Y = function (v) { return m.t + plotH - ((v - yt[0]) / (yt[yt.length - 1] - yt[0])) * plotH; };
    var groups = spec.groups || [{ name: '全部', color: p.series[0] }];
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(spec.aria || '散点图') + '">';
    yt.forEach(function (t) {
      s += '<line x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + round1(Y(t)) + '" y2="' + round1(Y(t)) + '" stroke="' + p.soft + '"/>';
      s += '<text x="' + (m.l - 8) + '" y="' + round1(Y(t) + 3.5) + '" text-anchor="end" font-family="' + FONT_DATA + '" font-size="10.5" fill="' + p.muted + '">' + esc(fmt(t, spec.fmt)) + '</text>';
    });
    xt.forEach(function (t) {
      s += '<line x1="' + round1(X(t)) + '" x2="' + round1(X(t)) + '" y1="' + m.t + '" y2="' + (h - m.b) + '" stroke="' + p.soft + '"/>';
      s += '<text x="' + round1(X(t)) + '" y="' + (h - m.b + 16) + '" text-anchor="middle" font-family="' + FONT_DATA + '" font-size="10.5" fill="' + p.muted + '">' + esc(fmt(t, spec.xFmt)) + '</text>';
    });
    s += '<line x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + (h - m.b) + '" y2="' + (h - m.b) + '" stroke="' + p.border + '"/>';
    pts.forEach(function (d, i) {
      var g = groups[d.g || 0] || groups[0];
      var delay = opts.animate ? ' style="animation-delay:' + Math.min(i * 3, 400) + 'ms"' : '';
      s += '<circle class="c-dot' + (opts.animate ? ' c-fade' : '') + '" cx="' + round1(X(d.x)) + '" cy="' + round1(Y(d.y)) + '" r="3.4" fill="' + g.color + '" fill-opacity="0.78" data-tip="' + esc((d.label ? d.label + '\n' : '') + (spec.xLabel || 'x') + ' ' + fmt(d.x, spec.xFmt) + '\n' + (spec.yLabel || 'y') + ' ' + fmt(d.y, spec.fmt)) + '"' + delay + '/>';
    });
    if (spec.yLabel) s += '<text x="' + m.l + '" y="' + (m.t - 3) + '" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(spec.yLabel) + '</text>';
    if (spec.xLabel) s += '<text x="' + (w - m.r) + '" y="' + (h - 4) + '" text-anchor="end" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(spec.xLabel) + '</text>';
    s += '</svg>';
    return { svg: s, legend: groups.length > 1 ? groups.map(function (g) { return { name: g.name, color: g.color }; }) : [] };
  }

  /* ---------- 箱线 ---------- */

  function box(spec, p, w, h, opts) {
    var groups = spec.groups || [];
    if (!groups.length) return { svg: emptySvg(w, h, p), legend: [] };
    var lo = Math.min.apply(null, groups.map(function (g) { return g.min; }));
    var hi = Math.max.apply(null, groups.map(function (g) { return g.max; }));
    var ticks = niceTicks(lo - (hi - lo) * 0.08, hi + (hi - lo) * 0.08, 5);
    var m = { t: spec.yLabel ? 22 : 14, r: 16, b: 30, l: axisLeft(ticks, spec.fmt, 46) };
    var plotW = w - m.l - m.r, plotH = h - m.t - m.b;
    if (plotW < 40 || plotH < 40) return { svg: emptySvg(w, h, p, '图表区域过小'), legend: [] };
    var Y = function (v) { return m.t + plotH - ((v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0])) * plotH; };
    var band = plotW / groups.length;
    var bw = Math.min(56, band * 0.46);
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(spec.aria || '箱线图') + '">';
    s += frame(w, h, p, m, ticks, Y, spec.fmt, spec.yLabel);
    groups.forEach(function (g, i) {
      var cx = m.l + band * (i + 0.5);
      var c = p.series[i % 8];
      var tip = g.label + '\n中位数 ' + fmt(g.med, spec.fmt) + '\nQ1–Q3 ' + fmt(g.q1, spec.fmt) + ' – ' + fmt(g.q3, spec.fmt) + '\n极值 ' + fmt(g.min, spec.fmt) + ' – ' + fmt(g.max, spec.fmt) + '\n样本 ' + g.n;
      var delay = opts.animate ? ' style="animation-delay:' + i * 60 + 'ms"' : '';
      s += '<g class="' + (opts.animate ? 'c-fade' : '') + '"' + delay + ' data-tip="' + esc(tip) + '">';
      s += '<line x1="' + cx + '" x2="' + cx + '" y1="' + round1(Y(g.max)) + '" y2="' + round1(Y(g.q3)) + '" stroke="' + c + '" stroke-width="1.4"/>';
      s += '<line x1="' + cx + '" x2="' + cx + '" y1="' + round1(Y(g.q1)) + '" y2="' + round1(Y(g.min)) + '" stroke="' + c + '" stroke-width="1.4"/>';
      s += '<line x1="' + round1(cx - bw / 3) + '" x2="' + round1(cx + bw / 3) + '" y1="' + round1(Y(g.max)) + '" y2="' + round1(Y(g.max)) + '" stroke="' + c + '" stroke-width="1.6"/>';
      s += '<line x1="' + round1(cx - bw / 3) + '" x2="' + round1(cx + bw / 3) + '" y1="' + round1(Y(g.min)) + '" y2="' + round1(Y(g.min)) + '" stroke="' + c + '" stroke-width="1.6"/>';
      s += '<rect class="c-bar" x="' + round1(cx - bw / 2) + '" y="' + round1(Y(g.q3)) + '" width="' + round1(bw) + '" height="' + round1(Math.max(1, Y(g.q1) - Y(g.q3))) + '" rx="3" fill="' + c + '" fill-opacity="0.24" stroke="' + c + '" stroke-width="1.4"/>';
      s += '<line x1="' + round1(cx - bw / 2) + '" x2="' + round1(cx + bw / 2) + '" y1="' + round1(Y(g.med)) + '" y2="' + round1(Y(g.med)) + '" stroke="' + p.accent + '" stroke-width="2.6" stroke-linecap="round"/>';
      s += '</g>';
      if (opts.labels) s += '<text x="' + cx + '" y="' + round1(Y(g.med) - 8) + '" text-anchor="middle" font-family="' + FONT_DATA + '" font-size="10" fill="' + p.fg + '">' + esc(fmt(g.med, spec.fmt)) + '</text>';
      s += '<text x="' + cx + '" y="' + (h - m.b + 16) + '" text-anchor="middle" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(truncate(g.label, band - 4, 10.5)) + '</text>';
    });
    s += '</svg>';
    return { svg: s, legend: [{ name: '中位数', color: p.accent }, { name: 'Q1–Q3 区间', color: p.series[0] }] };
  }

  /* ---------- 热力 ---------- */

  function heat(spec, p, w, h, opts) {
    var xs = spec.x || [], ys = spec.y || [], vals = spec.values || [];
    if (!xs.length || !ys.length) return { svg: emptySvg(w, h, p), legend: [] };
    var maxV = 0;
    vals.forEach(function (row) { row.forEach(function (v) { if (Number(v) > maxV) maxV = Number(v); }); });
    if (maxV <= 0) maxV = 1;
    var labW = Math.min(72, Math.max.apply(null, ys.map(function (l) { return textW(String(l), 10.5); })) + 10);
    var maxLab = Math.max.apply(null, xs.map(function (l) { return textW(String(l), 10.5); }));
    var rotate = maxLab * xs.length > (w - labW - 20) * 0.95;
    var m = { t: 12, r: 12, b: rotate ? rotBottom(maxLab, 60, 44) : 26, l: labW };
    var plotW = w - m.l - m.r, plotH = h - m.t - m.b;
    if (plotW < 40 || plotH < 30) return { svg: emptySvg(w, h, p, '图表区域过小'), legend: [] };
    var cw = plotW / xs.length, ch = plotH / ys.length;
    var base = p.surface, hot = p.series[0];
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(spec.aria || '热力图') + '">';
    ys.forEach(function (yl, ri) {
      s += '<text x="' + (m.l - 7) + '" y="' + round1(m.t + ch * (ri + 0.5) + 3.5) + '" text-anchor="end" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(truncate(yl, labW - 10, 10.5)) + '</text>';
      xs.forEach(function (xl, ci) {
        var v = Number((vals[ri] || [])[ci]) || 0;
        var t = Math.pow(v / maxV, 0.72);
        var c = mix(base, hot, 0.08 + t * 0.92);
        var tip = yl + ' · ' + xl + '\n' + fmt(v, spec.fmt);
        var delay = opts.animate ? ' style="animation-delay:' + Math.min((ri * xs.length + ci) * 8, 380) + 'ms"' : '';
        s += '<rect class="c-cell' + (opts.animate ? ' c-fade' : '') + '" x="' + round1(m.l + cw * ci + 1) + '" y="' + round1(m.t + ch * ri + 1) + '" width="' + round1(Math.max(1, cw - 2)) + '" height="' + round1(Math.max(1, ch - 2)) + '" rx="2.5" fill="' + c + '" data-tip="' + esc(tip) + '"' + delay + '/>';
        if (opts.labels && cw > 34 && ch > 20) {
          s += '<text x="' + round1(m.l + cw * (ci + 0.5)) + '" y="' + round1(m.t + ch * (ri + 0.5) + 3.5) + '" text-anchor="middle" font-family="' + FONT_DATA + '" font-size="10" fill="' + ink(c) + '" pointer-events="none">' + esc(fmt(v, spec.fmt)) + '</text>';
        }
      });
    });
    xs.forEach(function (xl, ci) {
      var x = m.l + cw * (ci + 0.5);
      if (rotate) {
        s += '<text x="' + x + '" y="' + (h - m.b + 12) + '" transform="rotate(-34 ' + x + ' ' + (h - m.b + 12) + ')" text-anchor="end" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(truncate(xl, 60, 10.5)) + '</text>';
      } else {
        s += '<text x="' + x + '" y="' + (h - m.b + 15) + '" text-anchor="middle" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(truncate(xl, cw - 2, 10.5)) + '</text>';
      }
    });
    s += '</svg>';
    return { svg: s, legend: [{ name: '0', color: mix(base, hot, 0.08) }, { name: fmt(maxV, spec.fmt), color: hot }] };
  }

  /* ---------- 相关性矩阵 ---------- */

  function strength(r) {
    var a = Math.abs(r);
    if (a >= 0.999) return '完全相关';
    var s = a >= 0.8 ? '极强' : a >= 0.6 ? '强' : a >= 0.4 ? '中等' : a >= 0.2 ? '弱' : '几乎无';
    return s + (r >= 0 ? '正相关' : '负相关');
  }

  function corr(spec, p, w, h, opts) {
    var xs = spec.x || [], ys = spec.y || [], vals = spec.values || [];
    if (!xs.length || !ys.length) return { svg: emptySvg(w, h, p), legend: [] };
    var neg = p.series[3], pos = p.series[1], base = p.surface;
    var labW = Math.min(88, Math.max.apply(null, ys.map(function (l) { return textW(String(l), 10.5); })) + 10);
    var maxLab = Math.max.apply(null, xs.map(function (l) { return textW(String(l), 10.5); }));
    var rotate = maxLab * xs.length > (w - labW - 20) * 0.95;
    var m = { t: 12, r: 12, b: rotate ? rotBottom(maxLab, 62, 46) : 26, l: labW };
    var plotW = w - m.l - m.r, plotH = h - m.t - m.b;
    if (plotW < 40 || plotH < 30) return { svg: emptySvg(w, h, p, '图表区域过小'), legend: [] };
    var cw = plotW / xs.length, ch = plotH / ys.length;
    var fs = Math.max(8, Math.min(11, Math.min(cw * 0.3, ch * 0.42)));
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(spec.aria || '相关性矩阵') + '">';
    ys.forEach(function (yl, ri) {
      s += '<text x="' + (m.l - 7) + '" y="' + round1(m.t + ch * (ri + 0.5) + 3.5) + '" text-anchor="end" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(truncate(yl, labW - 10, 10.5)) + '</text>';
      xs.forEach(function (xl, ci) {
        var v = Number((vals[ri] || [])[ci]);
        if (!isFinite(v)) v = 0;
        v = Math.max(-1, Math.min(1, v));
        var diag = ri === ci && xs.length === ys.length && xl === yl;
        var c = diag ? base : (v >= 0
          ? mix(base, pos, 0.1 + Math.pow(v, 0.72) * 0.9)
          : mix(base, neg, 0.1 + Math.pow(-v, 0.72) * 0.9));
        var label = diag ? '1.00' : (v > 0 ? '+' : '') + v.toFixed(2);
        var tip = xl + ' × ' + yl + '\nr = ' + v.toFixed(3) + ' · ' + strength(v) +
          (spec.n ? '\n样本 ' + spec.n + ' 条' : '');
        var delay = opts.animate ? ' style="animation-delay:' + Math.min((ri * xs.length + ci) * 8, 380) + 'ms"' : '';
        s += '<rect class="c-cell' + (opts.animate ? ' c-fade' : '') + '" x="' + round1(m.l + cw * ci + 1) + '" y="' + round1(m.t + ch * ri + 1) + '" width="' + round1(Math.max(1, cw - 2)) + '" height="' + round1(Math.max(1, ch - 2)) + '" rx="2.5" fill="' + c + '"' +
          (diag ? ' stroke="' + p.border + '" stroke-width="1" stroke-dasharray="3 2"' : '') +
          ' data-tip="' + esc(tip) + '"' + delay + '/>';
        if (cw > 26 && ch > 15) {
          s += '<text x="' + round1(m.l + cw * (ci + 0.5)) + '" y="' + round1(m.t + ch * (ri + 0.5) + fs * 0.36) + '" text-anchor="middle" font-family="' + FONT_DATA + '" font-size="' + round1(fs) + '" fill="' + (diag ? p.muted : ink(c)) + '" pointer-events="none">' + esc(label) + '</text>';
        }
      });
    });
    xs.forEach(function (xl, ci) {
      var x = m.l + cw * (ci + 0.5);
      if (rotate) {
        s += '<text x="' + x + '" y="' + (h - m.b + 12) + '" transform="rotate(-34 ' + x + ' ' + (h - m.b + 12) + ')" text-anchor="end" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(truncate(xl, 62, 10.5)) + '</text>';
      } else {
        s += '<text x="' + x + '" y="' + (h - m.b + 15) + '" text-anchor="middle" font-family="' + FONT_BODY + '" font-size="10.5" fill="' + p.muted + '">' + esc(truncate(xl, cw - 2, 10.5)) + '</text>';
      }
    });
    s += '</svg>';
    return {
      svg: s,
      legend: [{ name: '−1 负相关', color: neg }, { name: '0', color: mix(base, pos, 0.1) }, { name: '+1 正相关', color: pos }]
    };
  }

  var RENDERERS = {
    bar: bars, grouped: bars, stacked: bars, hist: bars,
    hbar: hbars, line: line, donut: donut, scatter: scatter, box: box, heat: heat, corr: corr
  };

  function render(host, spec, opts) {
    opts = opts || {};
    var p = palette();
    var w = Math.max(160, host.clientWidth || 560);
    var h = Math.max(120, host.clientHeight || 240);
    var fn = RENDERERS[spec.kind] || bars;
    if (spec.kind === 'grouped') spec.mode = 'group';
    if (spec.kind === 'stacked') spec.mode = 'stack';
    if (spec.kind === 'hist') spec.mode = 'single';
    var out = fn(spec, p, w, h, { labels: !!opts.labels, animate: !!opts.animate });
    host.innerHTML = out.svg;
    return out;
  }

  function serialize(svg) {
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.querySelectorAll('[class]').forEach(function (el) { el.removeAttribute('class'); });
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + clone.outerHTML;
  }

  function png(svg, scale) {
    return new Promise(function (resolve, reject) {
      var p = palette();
      var str = serialize(svg);
      var blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var k = scale || 2;
        var canvas = document.createElement('canvas');
        canvas.width = svg.width.baseVal.value * k;
        canvas.height = svg.height.baseVal.value * k;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('PNG 编码失败')); }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('SVG 栅格化失败')); };
      img.src = url;
    });
  }

  window.Charts = {
    render: render,
    palette: palette,
    fmt: fmt,
    serialize: serialize,
    png: png,
    niceTicks: niceTicks
  };
})();