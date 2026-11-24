/* 数据清洗：质量画像 + 缺失值 / 重复行 / 异常值 / 文本规整 */
(function () {
  'use strict';

  var DEFAULT = { trim: false, missing: 'keep', fill: 'mean', outliers: 'keep', dedupe: false };
  var SEP = String.fromCharCode(1);

  function isNumType(t) { return t === 'num' || t === 'time'; }

  function isMissing(v, type) {
    if (v == null || v === '') return true;
    if (isNumType(type)) return typeof v !== 'number' || !isFinite(v);
    return false;
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var pos = (sorted.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function stats(values) {
    var a = values.filter(function (v) { return typeof v === 'number' && isFinite(v); })
      .sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var q1 = quantile(a, 0.25), q3 = quantile(a, 0.75), iqr = q3 - q1;
    var outliers = 0;
    a.forEach(function (v) { if (v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr) outliers++; });
    return {
      n: a.length, min: a[0], max: a[a.length - 1],
      mean: a.reduce(function (x, y) { return x + y; }, 0) / a.length,
      median: quantile(a, 0.5),
      lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr, outliers: outliers
    };
  }

  function signature(r, keys) {
    return keys.map(function (k) { return String(r[k] == null ? '' : r[k]); }).join(SEP);
  }

  function profile(rows, cols) {
    var keys = cols.map(function (c) { return c.key; });
    var columns = cols.map(function (col) {
      var missing = 0, seen = {}, unique = 0, values = [];
      rows.forEach(function (r) {
        var v = r[col.key];
        if (isMissing(v, col.type)) { missing++; return; }
        if (isNumType(col.type)) values.push(v);
        var k = String(v);
        if (!seen[k]) { seen[k] = 1; unique++; }
      });
      return {
        key: col.key, type: col.type, missing: missing, unique: unique,
        pct: rows.length ? Math.round(missing / rows.length * 1000) / 10 : 0,
        stats: isNumType(col.type) ? stats(values) : null
      };
    });
    var seenRow = {}, dup = 0, missingCells = 0, dirtyRows = 0;
    rows.forEach(function (r) {
      var sig = signature(r, keys);
      if (seenRow[sig]) dup++; else seenRow[sig] = 1;
      var any = false;
      cols.forEach(function (c) {
        if (isMissing(r[c.key], c.type)) { missingCells++; any = true; }
      });
      if (any) dirtyRows++;
    });
    return { rows: rows.length, columns: columns, dup: dup, missingCells: missingCells, dirtyRows: dirtyRows };
  }

  function normalizeCfg(cfg) {
    var out = {};
    Object.keys(DEFAULT).forEach(function (k) {
      out[k] = cfg && cfg[k] != null ? cfg[k] : DEFAULT[k];
    });
    return out;
  }

  function isDefault(cfg) {
    var c = normalizeCfg(cfg);
    return Object.keys(DEFAULT).every(function (k) { return c[k] === DEFAULT[k]; });
  }

  /* 返回清洗后的新数组，不修改原始数据 */
  function apply(rows, cols, cfg) {
    var c = normalizeCfg(cfg);
    var keys = cols.map(function (x) { return x.key; });
    var numCols = cols.filter(function (x) { return isNumType(x.type); });
    var textCols = cols.filter(function (x) { return x.type === 'cat' || x.type === 'bool'; });
    var report = { removed: 0, filled: 0, clipped: 0, deduped: 0, trimmed: 0 };

    var work = rows.map(function (r) {
      var o = {};
      keys.forEach(function (k) { o[k] = r[k]; });
      Object.keys(r).forEach(function (k) { if (!(k in o)) o[k] = r[k]; });
      return o;
    });

    if (c.trim) {
      work.forEach(function (r) {
        textCols.forEach(function (col) {
          var v = r[col.key];
          if (typeof v !== 'string') return;
          var t = v.replace(/\s+/g, ' ').trim();
          if (t !== v) { r[col.key] = t; report.trimmed++; }
        });
      });
    }

    var fillValue = {};
    if (c.missing === 'fill') {
      numCols.forEach(function (col) {
        var st = stats(work.map(function (r) { return r[col.key]; }));
        if (!st) return;
        fillValue[col.key] = c.fill === 'median' ? st.median : c.fill === 'zero' ? 0 : st.mean;
      });
    }

    if (c.missing !== 'keep') {
      work = work.filter(function (r) {
        var hit = false;
        cols.forEach(function (col) {
          if (!isMissing(r[col.key], col.type)) return;
          if (c.missing === 'drop') { hit = true; return; }
          if (col.key in fillValue) {
            r[col.key] = Math.round(fillValue[col.key] * 1000) / 1000;
            report.filled++;
          } else if (col.type === 'cat') {
            r[col.key] = '未知';
            report.filled++;
          }
        });
        if (hit) report.removed++;
        return !hit;
      });
    }

    if (c.outliers !== 'keep' && numCols.length) {
      var fences = {};
      numCols.forEach(function (col) {
        var st = stats(work.map(function (r) { return r[col.key]; }));
        if (st && st.hi > st.lo) fences[col.key] = st;
      });
      work = work.filter(function (r) {
        var drop = false;
        Object.keys(fences).forEach(function (k) {
          var v = r[k];
          if (typeof v !== 'number' || !isFinite(v)) return;
          var st = fences[k];
          if (v >= st.lo && v <= st.hi) return;
          if (c.outliers === 'drop') { drop = true; return; }
          r[k] = Math.round((v < st.lo ? st.lo : st.hi) * 1000) / 1000;
          report.clipped++;
        });
        if (drop) report.removed++;
        return !drop;
      });
    }

    if (c.dedupe) {
      var seen = {};
      work = work.filter(function (r) {
        var sig = signature(r, keys);
        if (seen[sig]) { report.deduped++; return false; }
        seen[sig] = 1;
        return true;
      });
    }

    report.before = rows.length;
    report.after = work.length;
    return { rows: work, report: report };
  }

  window.Clean = {
    DEFAULT: DEFAULT,
    profile: profile,
    apply: apply,
    normalizeCfg: normalizeCfg,
    isDefault: isDefault,
    isMissing: isMissing
  };
})();