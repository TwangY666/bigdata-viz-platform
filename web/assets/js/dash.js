/* 看板：数据源、筛选、图表选择、上传、渲染 */
(function () {
  'use strict';

  var D = window.DATA;
  var C = window.Charts;

  var dash = document.getElementById('dash');
  var grid = document.getElementById('dash-grid');
  var kpis = document.getElementById('dash-kpis');
  var headTitle = document.getElementById('dash-title');
  var headMeta = document.getElementById('dash-meta');
  var filtersBox = document.getElementById('dash-filters');
  var srcSelect = document.getElementById('src-select');
  var sortSelect = document.getElementById('sort-select');
  var binValue = document.getElementById('bin-value');
  var labelsToggle = document.getElementById('labels-toggle');
  var foot = document.getElementById('dash-foot');
  var tip = document.getElementById('tip');
  var toasts = document.getElementById('toasts');
  var fileInput = document.getElementById('file-input');

  var KIND_LABEL = {
    bar: '柱状', grouped: '分组柱状', stacked: '堆叠柱状', hist: '直方图',
    hbar: '排行条形', line: '折线', donut: '环形占比', scatter: '散点', box: '箱线', heat: '热力', corr: '相关性'
  };

  var KIND_ICON = {
    bar: '<path d="M4 20V10M9.3 20V4M14.6 20v-8M20 20V7"/>',
    grouped: '<path d="M4 20v-6M7.5 20V9M12 20v-9M15.5 20V5M20 20v-7"/>',
    stacked: '<rect x="5" y="12" width="5" height="8" rx="1"/><rect x="5" y="6" width="5" height="5" rx="1"/><rect x="14" y="9" width="5" height="11" rx="1"/><rect x="14" y="4" width="5" height="4" rx="1"/>',
    hist: '<path d="M3 20h18"/><rect x="4" y="12" width="3.4" height="8"/><rect x="8" y="7" width="3.4" height="13"/><rect x="12" y="10" width="3.4" height="10"/><rect x="16" y="14" width="3.4" height="6"/>',
    hbar: '<path d="M4 5h12M4 10h8M4 15h14M4 20h6"/>',
    line: '<path d="M3 17l5-6 4 3 6-8"/><path d="M3 21h18"/>',
    donut: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="M12 4v4.6M18.9 15.5l-4-2.3"/>',
    scatter: '<circle cx="6" cy="16" r="1.6"/><circle cx="10" cy="9" r="1.6"/><circle cx="14" cy="14" r="1.6"/><circle cx="18" cy="6" r="1.6"/><path d="M3 21h18"/>',
    box: '<path d="M8 4v3M8 17v3M16 4v3M16 17v3"/><rect x="5" y="7" width="6" height="10" rx="1"/><rect x="13" y="9" width="6" height="8" rx="1"/><path d="M5 12h6M13 13h6"/>',
    heat: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    corr: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/><path d="M5.6 7.4l1.6-1.6M16.8 18.4l1.6-1.6"/>'
  };

  /* ---------- 聚合工具 ---------- */

  /* 同一批 rows 在一次渲染里被多张图重复取列，只缓存本次渲染的主数据 */
  var colCache = { rows: null, nums: {}, count: {} };
  function colBegin(rows) { colCache.rows = rows; colCache.nums = {}; colCache.count = {}; }
  function nums(rows, k) {
    var primary = colCache.rows === rows;
    if (primary && colCache.nums[k]) return colCache.nums[k];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i][k];
      if (typeof v === 'number' && isFinite(v)) out.push(v);
    }
    if (primary) colCache.nums[k] = out;
    return out;
  }
  function mean(a) { return a.length ? sum(a) / a.length : 0; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function countBy(rows, k) {
    var primary = colCache.rows === rows;
    if (primary && colCache.count[k]) return colCache.count[k];
    var m = {};
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i][k];
      if (v == null || v === '') continue;
      m[v] = (m[v] || 0) + 1;
    }
    if (primary) colCache.count[k] = m;
    return m;
  }
  function sumBy(rows, k, vk) {
    var m = {};
    rows.forEach(function (r) {
      var v = r[k], n = r[vk];
      if (v == null || v === '' || typeof n !== 'number') return;
      m[v] = (m[v] || 0) + n;
    });
    return m;
  }
  function meanBy(rows, k, vk) {
    var s = {}, n = {};
    rows.forEach(function (r) {
      var v = r[k], x = r[vk];
      if (v == null || v === '' || typeof x !== 'number') return;
      s[v] = (s[v] || 0) + x;
      n[v] = (n[v] || 0) + 1;
    });
    var m = {};
    Object.keys(s).forEach(function (key) { m[key] = s[key] / n[key]; });
    return m;
  }
  /* 逐元素比较：Math.min.apply 在十万级数组上会爆栈 */
  function minOf(a) { var m = Infinity; for (var i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
  function maxOf(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
  function countStr(n) { return Number(n).toLocaleString('en-US'); }
  function uniq(rows, k) {
    var seen = {}, out = [];
    rows.forEach(function (r) {
      var v = r[k];
      if (v == null || v === '' || seen[v]) return;
      seen[v] = 1;
      out.push(v);
    });
    return out.sort(function (a, b) { return String(a).localeCompare(String(b), 'zh'); });
  }
  function entries(m) {
    return Object.keys(m).map(function (k) { return { label: k, value: m[k] }; });
  }
  /* 上传文件的类别数不受控，超过上限时把长尾并入「其他」，避免渲染上万个图元 */
  function catEntries(rows, key, cap) {
    var list = entries(countBy(rows, key));
    var lim = cap || 24;
    if (list.length <= lim) return list;
    var sorted = list.slice().sort(function (a, b) { return b.value - a.value; });
    var head = sorted.slice(0, lim);
    var rest = 0;
    for (var i = lim; i < sorted.length; i++) rest += sorted[i].value;
    head.push({ label: '其他 ' + (sorted.length - lim) + ' 类', value: rest });
    return head;
  }
  function order(list, sort) {
    var out = list.slice();
    if (sort === 'desc') out.sort(function (a, b) { return b.value - a.value; });
    else if (sort === 'asc') out.sort(function (a, b) { return a.value - b.value; });
    else if (sort === 'name') out.sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'zh'); });
    return out;
  }
  function hist(vals, bins) {
    if (!vals.length) return { x: [], counts: [] };
    var lo = minOf(vals), hi = maxOf(vals);
    var nonNeg = lo >= 0;
    var span = hi - lo;
    if (span <= 0) { lo -= 1; hi += 1; span = 2; }
    lo -= span * 0.02; hi += span * 0.02;
    if (lo < 0 && nonNeg) lo = 0;
    var step = (hi - lo) / bins;
    var counts = new Array(bins).fill(0);
    vals.forEach(function (v) {
      counts[Math.min(bins - 1, Math.floor((v - lo) / step))]++;
    });
    var dec = step >= 10 ? 0 : step >= 1 ? 1 : step >= 0.1 ? 2 : 3;
    var x = counts.map(function (_, i) {
      return (lo + step * i).toFixed(dec) + '–' + (lo + step * (i + 1)).toFixed(dec);
    });
    return { x: x, counts: counts };
  }
  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    var pos = (sorted.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function weekOrder(rows) {
    var present = uniq(rows, '星期');
    return D.WEEK.filter(function (w) { return present.indexOf(w) !== -1; });
  }
  function hoursOf(rows) {
    return uniq(rows, '小时').map(Number).sort(function (a, b) { return a - b; });
  }
  function pad2(n) { return ('0' + n).slice(-2); }

  function pairs(rows, kx, ky) {
    var out = [];
    rows.forEach(function (r) {
      var x = r[kx], y = r[ky];
      if (typeof x === 'number' && isFinite(x) && typeof y === 'number' && isFinite(y)) out.push([x, y]);
    });
    return out;
  }
  function pearson(rows, kx, ky) {
    var ps = pairs(rows, kx, ky);
    if (ps.length < 3) return null;
    var mx = mean(ps.map(function (p) { return p[0]; }));
    var my = mean(ps.map(function (p) { return p[1]; }));
    var sxy = 0, sxx = 0, syy = 0;
    ps.forEach(function (p) {
      var a = p[0] - mx, b = p[1] - my;
      sxy += a * b; sxx += a * a; syy += b * b;
    });
    if (sxx <= 0 || syy <= 0) return null;
    return sxy / Math.sqrt(sxx * syy);
  }
  function corrSpec(rows, keys, title) {
    var vals = keys.map(function (a) {
      return keys.map(function (b) {
        if (a === b) return 1;
        var r = pearson(rows, a, b);
        return r == null ? 0 : Math.round(r * 1000) / 1000;
      });
    });
    return { kind: 'corr', x: keys, y: keys, values: vals, n: rows.length, aria: title || '相关性矩阵' };
  }
  function boxGroups(rows, key, valKey, orderList) {
    var labels = orderList || uniq(rows, key);
    var out = [];
    labels.forEach(function (lab) {
      var vals = nums(rows.filter(function (r) { return r[key] === lab; }), valKey)
        .sort(function (a, b) { return a - b; });
      if (vals.length < 4) return;
      out.push({
        label: lab, min: vals[0], q1: quantile(vals, 0.25), med: quantile(vals, 0.5),
        q3: quantile(vals, 0.75), max: vals[vals.length - 1], n: vals.length
      });
    });
    return out;
  }
  function etaSquared(rows, groupKey, valKey) {
    var all = nums(rows, valKey);
    if (all.length < 4) return null;
    var gm = mean(all);
    var total = all.reduce(function (a, v) { return a + (v - gm) * (v - gm); }, 0);
    if (total <= 0) return null;
    var within = 0;
    uniq(rows, groupKey).forEach(function (g) {
      var vals = nums(rows.filter(function (r) { return r[groupKey] === g; }), valKey);
      if (!vals.length) return;
      var m = mean(vals);
      within += vals.reduce(function (a, v) { return a + (v - m) * (v - m); }, 0);
    });
    return Math.max(0, Math.min(1, 1 - within / total));
  }
  function features(present) {
    return D.IRIS_FEATURES.filter(function (f) { return present.indexOf(f) !== -1; });
  }
  function groupsBy(rows, key, orderList) {
    var present = uniq(rows, key);
    var list = (orderList || []).filter(function (s) { return present.indexOf(s) !== -1; });
    present.forEach(function (s) { if (list.indexOf(s) === -1) list.push(s); });
    var pal = C.palette().series;
    return list.map(function (name, i) { return { name: name, color: pal[i % 8] }; });
  }
  function speciesGroups(rows) { return groupsBy(rows, '品种', D.IRIS_SPECIES); }
  function scatterBy(rows, kx, ky, groupKey, groups, xLabel, yLabel, fmtMode, xFmt, labelKey) {
    var points = [];
    rows.forEach(function (r) {
      var x = r[kx], y = r[ky];
      if (typeof x !== 'number' || !isFinite(x) || typeof y !== 'number' || !isFinite(y)) return;
      var gi = 0;
      if (groupKey) {
        for (var i = 0; i < groups.length; i++) if (groups[i].name === r[groupKey]) { gi = i; break; }
      }
      points.push({
        x: x, y: y, g: gi,
        label: labelKey ? (r[labelKey] || '')
          : (r['编号'] || r['姓名'] || r['订单号'] || r['球员'] || r['片名'] || '')
      });
    });
    return { kind: 'scatter', points: thinPoints(points), groups: groups, xLabel: xLabel, yLabel: yLabel, fmt: fmtMode, xFmt: xFmt };
  }
  function thinPoints(points) {
    if (points.length <= 1600) return points;
    var step = Math.ceil(points.length / 1600);
    return points.filter(function (_, i) { return i % step === 0; });
  }
  function rateBy(rows, key, test) {
    var m = {};
    rows.forEach(function (r) {
      var v = r[key];
      if (v == null || v === '') return;
      m[v] = m[v] || [0, 0];
      m[v][0]++;
      if (test(r)) m[v][1]++;
    });
    return m;
  }
  function round2(v) { return Math.round(v * 100) / 100; }

  function gridBy(rows, xKey, yKey, valKey, xs, ys, mode) {
    var xi = {}, yi = {};
    xs.forEach(function (x, i) { xi[x] = i; });
    ys.forEach(function (y, i) { yi[y] = i; });
    var acc = ys.map(function () { return xs.map(function () { return [0, 0]; }); });
    rows.forEach(function (r) {
      var i = xi[r[xKey]], j = yi[r[yKey]];
      if (i == null || j == null) return;
      var v = mode === 'count' ? 1 : r[valKey];
      if (typeof v !== 'number' || !isFinite(v)) return;
      acc[j][i][0] += v;
      acc[j][i][1]++;
    });
    return acc.map(function (row) {
      return row.map(function (c) {
        if (!c[1]) return 0;
        return mode === 'mean' ? round2(c[0] / c[1]) : Math.round(c[0]);
      });
    });
  }
  function decadeNum(s) {
    var n = parseInt(s, 10);
    if (!isFinite(n)) return 9999;
    return n >= 50 ? 1900 + n : 2000 + n;
  }
  function decadeOrder(rows) {
    return uniq(rows, '年代').sort(function (a, b) { return decadeNum(a) - decadeNum(b); });
  }

  /* ---------- 图表定义 ---------- */

  function subjects(present) {
    return D.SUBJECTS.filter(function (s) { return present.indexOf(s) !== -1; });
  }

  var CHARTS = {
    grades: [
      { id: 'g-dist', name: '平均分分布', desc: '全体平均分的区间人数分布', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('平均分') !== -1; },
        build: function (rows, ctx) {
          var h = hist(nums(rows, '平均分'), ctx.bins);
          return { kind: 'hist', x: h.x, series: [{ name: '人数', values: h.counts }], yLabel: '人数', xLabel: '平均分区间', aria: '平均分分布直方图' };
        } },
      { id: 'g-fail', name: '挂科统计', desc: '各科目低于 60 分的人次', kind: 'bar', span: 6,
        when: function (p) { return subjects(p).length > 0; },
        build: function (rows, ctx) {
          var subs = subjects(ctx.present);
          var failTotals = subs.map(function (s) {
            return rows.filter(function (r) { return typeof r[s] === 'number' && r[s] < 60; }).length;
          });
          subs = order(subs.map(function (s, i) { return { label: s, value: failTotals[i] }; }), ctx.sort).map(function (e) { return e.label; });
          var genders = uniq(rows, '性别');
          if (genders.length > 1) {
            return {
              kind: 'grouped', x: subs, yLabel: '挂科人次',
              series: genders.map(function (g, i) {
                return { name: g, color: C.palette().series[i === 0 ? 3 : 2], values: subs.map(function (s) {
                  return rows.filter(function (r) { return r['性别'] === g && typeof r[s] === 'number' && r[s] < 60; }).length;
                }) };
              })
            };
          }
          return { kind: 'bar', x: subs, yLabel: '挂科人次', series: [{ name: '挂科人次', values: subs.map(function (s) {
            return rows.filter(function (r) { return typeof r[s] === 'number' && r[s] < 60; }).length;
          }) }] };
        } },
      { id: 'g-subject', name: '科目分数对比', desc: '各科目平均分，按班级分组', kind: 'grouped', span: 6,
        when: function (p) { return subjects(p).length > 0; },
        build: function (rows, ctx) {
          var subs = subjects(ctx.present);
          var meanTotals = subs.map(function (s) { return mean(nums(rows, s)); });
          subs = order(subs.map(function (s, i) { return { label: s, value: meanTotals[i] }; }), ctx.sort).map(function (e) { return e.label; });
          var classes = uniq(rows, '班级');
          if (classes.length > 1) {
            return { kind: 'grouped', x: subs, yLabel: '平均分', series: classes.map(function (cls) {
              var sub = rows.filter(function (r) { return r['班级'] === cls; });
              return { name: cls, values: subs.map(function (s) { return Math.round(mean(nums(sub, s)) * 10) / 10; }) };
            }) };
          }
          return { kind: 'bar', x: subs, yLabel: '平均分', series: [{ name: '平均分', values: subs.map(function (s) { return Math.round(mean(nums(rows, s)) * 10) / 10; }) }] };
        } },
      { id: 'g-class', name: '班级成绩差异', desc: '各班平均分的中位数与四分位区间', kind: 'box', span: 6,
        when: function (p) { return p.indexOf('班级') !== -1 && p.indexOf('平均分') !== -1; },
        build: function (rows) {
          var groups = uniq(rows, '班级').map(function (cls) {
            var v = nums(rows.filter(function (r) { return r['班级'] === cls; }), '平均分').sort(function (a, b) { return a - b; });
            return { label: cls, min: v[0], q1: quantile(v, 0.25), med: quantile(v, 0.5), q3: quantile(v, 0.75), max: v[v.length - 1], n: v.length };
          }).filter(function (g) { return g.n > 0; });
          return { kind: 'box', groups: groups, yLabel: '平均分', aria: '班级成绩箱线图' };
        } },
      { id: 'g-gender', name: '性别结构', desc: '男女学生人数占比', kind: 'donut', span: 4,
        when: function (p) { return p.indexOf('性别') !== -1; },
        build: function (rows) {
          var m = countBy(rows, '性别');
          var list = order(entries(m), 'desc');
          return { kind: 'donut', slices: list.map(function (e, i) { return { label: e.label, value: e.value, color: C.palette().series[i === 0 ? 3 : 2] }; }), center: { value: countStr(rows.length), label: '学生数' } };
        } },
      { id: 'g-credit', name: '学分 × 平均分', desc: '已修学分与成绩的关系', kind: 'scatter', span: 4,
        when: function (p) { return p.indexOf('学分') !== -1 && p.indexOf('平均分') !== -1; },
        build: function (rows, ctx) {
          var classes = uniq(rows, '班级');
          var pal = C.palette().series;
          var groups = classes.length > 1 ? classes.map(function (c, i) { return { name: c, color: pal[i % 8] }; }) : [{ name: '学生', color: pal[0] }];
          var pts = [];
          rows.forEach(function (r) {
            if (typeof r['学分'] !== 'number' || typeof r['平均分'] !== 'number') return;
            pts.push({ x: r['学分'], y: r['平均分'], g: classes.length > 1 ? classes.indexOf(r['班级']) : 0, label: r['姓名'] || '' });
          });
          return { kind: 'scatter', points: thinPoints(pts), groups: groups, xLabel: '学分', yLabel: '平均分', aria: '学分与平均分散点图' };
        } },
      { id: 'g-top', name: '平均分 Top 10', desc: '成绩最高的十名学生', kind: 'hbar', span: 4,
        when: function (p) { return p.indexOf('姓名') !== -1 && p.indexOf('平均分') !== -1; },
        build: function (rows) {
          var top = rows.filter(function (r) { return typeof r['平均分'] === 'number'; })
            .sort(function (a, b) { return b['平均分'] - a['平均分']; }).slice(0, 10);
          return { kind: 'hbar', x: top.map(function (r) { return r['姓名']; }), series: [{ name: '平均分', values: top.map(function (r) { return r['平均分']; }) }], aria: '平均分前十条形图' };
        } },
      { id: 'g-heat', name: '班级 × 科目均分', desc: '各班在各科目的平均分热度', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('班级') !== -1 && subjects(p).length > 0; },
        build: function (rows, ctx) {
          var subs = subjects(ctx.present);
          var classes = uniq(rows, '班级');
          var values = classes.map(function (cls) {
            var sub = rows.filter(function (r) { return r['班级'] === cls; });
            return subs.map(function (s) { return Math.round(mean(nums(sub, s)) * 10) / 10; });
          });
          return { kind: 'heat', x: subs, y: classes, values: values, aria: '班级科目均分热力图' };
        } },
      { id: 'g-stack', name: '及格 / 挂科构成', desc: '各班所有科目成绩的及格与挂科人次', kind: 'stacked', span: 6,
        when: function (p) { return p.indexOf('班级') !== -1 && subjects(p).length > 0; },
        build: function (rows, ctx) {
          var subs = subjects(ctx.present);
          var classes = uniq(rows, '班级');
          var pal = C.palette().series;
          var pass = [], fail = [];
          classes.forEach(function (cls) {
            var pcount = 0, fcount = 0;
            rows.filter(function (r) { return r['班级'] === cls; }).forEach(function (r) {
              subs.forEach(function (s) {
                if (typeof r[s] !== 'number') return;
                if (r[s] < 60) fcount++; else pcount++;
              });
            });
            pass.push(pcount); fail.push(fcount);
          });
          return { kind: 'stacked', x: classes, yLabel: '人次', series: [
            { name: '及格', values: pass, color: pal[4] },
            { name: '挂科', values: fail, color: pal[2] }
          ] };
        } }
    ],
    library: [
      { id: 'l-cat', name: '分类借阅量', desc: '各书籍分类的借阅次数', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('书籍分类') !== -1; },
        build: function (rows, ctx) {
          var list = order(catEntries(rows, '书籍分类'), ctx.sort);
          return { kind: 'bar', x: list.map(function (e) { return e.label; }), series: [{ name: '借阅次数', values: list.map(function (e) { return e.value; }) }], yLabel: '借阅次数' };
        } },
      { id: 'l-share', name: '分类占比', desc: '哪类书最受欢迎', kind: 'donut', span: 6,
        when: function (p) { return p.indexOf('书籍分类') !== -1; },
        build: function (rows, ctx) {
          var list = order(catEntries(rows, '书籍分类'), ctx.sort === 'default' ? 'desc' : ctx.sort);
          return { kind: 'donut', slices: list.map(function (e) { return { label: e.label, value: e.value }; }), center: { value: countStr(rows.length), label: '总借阅' } };
        } },
      { id: 'l-hour', name: '借阅高峰时段', desc: '一天中各小时的借阅量', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('小时') !== -1; },
        build: function (rows) {
          var hours = hoursOf(rows);
          if (!hours.length) return null;
          var lo = hours[0], hi = hours[hours.length - 1];
          var xs = [], counts = [];
          var m = countBy(rows, '小时');
          for (var h = lo; h <= hi; h++) { xs.push(pad2(h)); counts.push(m[h] || 0); }
          return { kind: 'bar', x: xs, series: [{ name: '借阅次数', values: counts }], yLabel: '借阅次数', xLabel: '时段（小时）' };
        } },
      { id: 'l-month', name: '月度借阅趋势', desc: '按月汇总的借阅量变化', kind: 'line', span: 6,
        when: function (p) { return p.indexOf('月份') !== -1; },
        build: function (rows) {
          var m = countBy(rows, '月份');
          var months = Object.keys(m).sort();
          return { kind: 'line', area: true, x: months, series: [{ name: '借阅次数', values: months.map(function (k) { return m[k]; }) }], yLabel: '借阅次数', xLabel: '月份' };
        } },
      { id: 'l-dur', name: '借阅时长分布', desc: '从借出到归还的天数分布', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('时长天数') !== -1; },
        build: function (rows, ctx) {
          var h = hist(nums(rows, '时长天数'), ctx.bins);
          return { kind: 'hist', x: h.x, series: [{ name: '笔数', values: h.counts }], yLabel: '笔数', xLabel: '借阅时长（天）' };
        } },
      { id: 'l-status', name: '归还状态', desc: '按时 / 超期（>30 天）/ 在借', kind: 'donut', span: 6,
        when: function (p) { return p.indexOf('借阅状态') !== -1; },
        build: function (rows) {
          var m = countBy(rows, '借阅状态');
          var pal = C.palette().series;
          var color = { '按时': pal[4], '超期': pal[2], '在借': pal[7] };
          var list = ['按时', '超期', '在借'].filter(function (k) { return m[k]; }).map(function (k) { return { label: k, value: m[k], color: color[k] }; });
          return { kind: 'donut', slices: list, center: { value: countStr(rows.length), label: '借阅记录' } };
        } },
      { id: 'l-top', name: '热门借阅人 Top 10', desc: '借阅次数最多的读者', kind: 'hbar', span: 6,
        when: function (p) { return p.indexOf('借阅人') !== -1; },
        build: function (rows) {
          var list = order(catEntries(rows, '借阅人'), 'desc').slice(0, 10);
          return { kind: 'hbar', x: list.map(function (e) { return e.label; }), series: [{ name: '借阅次数', values: list.map(function (e) { return e.value; }) }] };
        } },
      { id: 'l-week', name: '星期 × 时段热度', desc: '一周内各时段借阅密度', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('星期') !== -1 && p.indexOf('小时') !== -1; },
        build: function (rows) {
          var hours = hoursOf(rows);
          var weeks = weekOrder(rows);
          var values = weeks.map(function (w) {
            return hours.map(function (h) {
              return rows.filter(function (r) { return r['星期'] === w && r['小时'] === h; }).length;
            });
          });
          return { kind: 'heat', x: hours.map(pad2), y: weeks, values: values, xLabel: '时段', aria: '星期时段借阅热力图' };
        } },
      { id: 'l-catmonth', name: '分类月度构成', desc: '每月各分类借阅量堆叠对比', kind: 'stacked', span: 12,
        when: function (p) { return p.indexOf('书籍分类') !== -1 && p.indexOf('月份') !== -1; },
        build: function (rows) {
          var months = uniq(rows, '月份');
          var totals = countBy(rows, '书籍分类');
          var cats = order(entries(totals), 'desc').slice(0, 6).map(function (e) { return e.label; });
          var series = cats.map(function (cat) {
            return { name: cat, values: months.map(function (mo) {
              return rows.filter(function (r) { return r['月份'] === mo && r['书籍分类'] === cat; }).length;
            }) };
          });
          return { kind: 'stacked', x: months, series: series, yLabel: '借阅次数', xLabel: '月份' };
        } }
    ],
    attendance: [
      { id: 'a-rate', name: '迟到率趋势', desc: '每日迟到打卡占比', kind: 'line', span: 6,
        when: function (p) { return p.indexOf('日期') !== -1 && p.indexOf('是否迟到') !== -1; },
        build: function (rows) {
          var dates = uniq(rows, '日期');
          var vals = dates.map(function (d) {
            var sub = rows.filter(function (r) { return r['日期'] === d; });
            var late = sub.filter(function (r) { return r['是否迟到'] === '是'; }).length;
            return sub.length ? Math.round(late / sub.length * 1000) / 10 : 0;
          });
          return { kind: 'line', area: true, x: dates.map(function (d) { return d.slice(5); }), series: [{ name: '迟到率', values: vals, color: C.palette().series[2] }], fmt: 'pct', yLabel: '迟到率', xLabel: '日期' };
        } },
      { id: 'a-hour', name: '早晚打卡分布', desc: '各小时打卡量，区分早间 / 晚间', kind: 'grouped', span: 6,
        when: function (p) { return p.indexOf('小时') !== -1; },
        build: function (rows) {
          var hours = hoursOf(rows);
          if (!hours.length) return null;
          var slots = uniq(rows, '时段');
          var pal = C.palette().series;
          if (slots.length > 1) {
            return { kind: 'grouped', x: hours.map(pad2), yLabel: '打卡次数', xLabel: '时刻（小时）', series: slots.map(function (s, i) {
              return { name: s, color: pal[i === 0 ? 0 : 5], values: hours.map(function (h) {
                return rows.filter(function (r) { return r['小时'] === h && r['时段'] === s; }).length;
              }) };
            }) };
          }
          var m = countBy(rows, '小时');
          return { kind: 'bar', x: hours.map(pad2), series: [{ name: '打卡次数', values: hours.map(function (h) { return m[h] || 0; }) }], yLabel: '打卡次数', xLabel: '时刻（小时）' };
        } },
      { id: 'a-status', name: '出勤结构', desc: '准时与迟到打卡占比', kind: 'donut', span: 4,
        when: function (p) { return p.indexOf('是否迟到') !== -1; },
        build: function (rows) {
          var late = rows.filter(function (r) { return r['是否迟到'] === '是'; }).length;
          var pal = C.palette().series;
          return { kind: 'donut', slices: [
            { label: '准时', value: rows.length - late, color: pal[4] },
            { label: '迟到', value: late, color: pal[2] }
          ], center: { value: (rows.length ? Math.round(late / rows.length * 1000) / 10 : 0) + '%', label: '迟到率' } };
        } },
      { id: 'a-week', name: '星期迟到率', desc: '一周中各天的迟到占比', kind: 'bar', span: 4,
        when: function (p) { return p.indexOf('星期') !== -1 && p.indexOf('是否迟到') !== -1; },
        build: function (rows) {
          var weeks = weekOrder(rows);
          var vals = weeks.map(function (w) {
            var sub = rows.filter(function (r) { return r['星期'] === w; });
            var late = sub.filter(function (r) { return r['是否迟到'] === '是'; }).length;
            return sub.length ? Math.round(late / sub.length * 1000) / 10 : 0;
          });
          return { kind: 'bar', x: weeks, series: [{ name: '迟到率', values: vals, color: C.palette().series[2] }], fmt: 'pct', yLabel: '迟到率' };
        } },
      { id: 'a-top', name: '迟到最多 Top 10', desc: '迟到次数最多的学生', kind: 'hbar', span: 4,
        when: function (p) { return p.indexOf('学生') !== -1 && p.indexOf('是否迟到') !== -1; },
        build: function (rows) {
          var m = {};
          rows.forEach(function (r) {
            if (r['是否迟到'] !== '是' || !r['学生']) return;
            m[r['学生']] = (m[r['学生']] || 0) + 1;
          });
          var list = order(entries(m), 'desc').slice(0, 10);
          return { kind: 'hbar', x: list.map(function (e) { return e.label; }), series: [{ name: '迟到次数', values: list.map(function (e) { return e.value; }), color: C.palette().series[2] }] };
        } },
      { id: 'a-heat', name: '星期 × 时刻热度', desc: '打卡密度分布', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('星期') !== -1 && p.indexOf('小时') !== -1; },
        build: function (rows) {
          var hours = hoursOf(rows);
          var weeks = weekOrder(rows);
          var values = weeks.map(function (w) {
            return hours.map(function (h) {
              return rows.filter(function (r) { return r['星期'] === w && r['小时'] === h; }).length;
            });
          });
          return { kind: 'heat', x: hours.map(pad2), y: weeks, values: values, xLabel: '时刻' };
        } },
      { id: 'a-student', name: '学生出勤对比', desc: '打卡量前八名学生的准时 / 迟到构成', kind: 'stacked', span: 6,
        when: function (p) { return p.indexOf('学生') !== -1 && p.indexOf('是否迟到') !== -1; },
        build: function (rows) {
          var totals = countBy(rows, '学生');
          var students = order(entries(totals), 'desc').slice(0, 8).map(function (e) { return e.label; });
          var pal = C.palette().series;
          var onTime = [], late = [];
          students.forEach(function (s) {
            var sub = rows.filter(function (r) { return r['学生'] === s; });
            var l = sub.filter(function (r) { return r['是否迟到'] === '是'; }).length;
            onTime.push(sub.length - l); late.push(l);
          });
          return { kind: 'stacked', x: students, series: [
            { name: '准时', values: onTime, color: pal[4] },
            { name: '迟到', values: late, color: pal[2] }
          ], yLabel: '打卡次数' };
        } },
      { id: 'a-time', name: '打卡时刻散点', desc: '每天打卡时刻分布，迟到以红色标出', kind: 'scatter', span: 12,
        when: function (p) { return p.indexOf('日期') !== -1 && p.indexOf('分钟') !== -1; },
        build: function (rows) {
          var dates = uniq(rows, '日期');
          var dateIdx = {};
          dates.forEach(function (d, i) { dateIdx[d] = i + 1; });
          var pal = C.palette().series;
          var pts = [];
          rows.forEach(function (r) {
            if (typeof r['分钟'] !== 'number' || !r['日期']) return;
            pts.push({ x: dateIdx[r['日期']], y: r['分钟'], g: r['是否迟到'] === '是' ? 1 : 0, label: (r['学生'] || '') + ' ' + r['日期'] });
          });
          return { kind: 'scatter', points: thinPoints(pts), groups: [{ name: '准时', color: pal[0] }, { name: '迟到', color: pal[2] }], xLabel: '日期序号', yLabel: '打卡时刻', fmt: 'time', aria: '打卡时刻散点图' };
        } }
    ],
    spending: [
      { id: 's-type', name: '类型消费金额', desc: '各消费类型的总支出', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('消费类型') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(sumBy(rows, '消费类型', '金额')), ctx.sort);
          return { kind: 'bar', x: list.map(function (e) { return e.label; }), series: [{ name: '金额', values: list.map(function (e) { return Math.round(e.value * 10) / 10; }) }], fmt: 'money', yLabel: '消费金额' };
        } },
      { id: 's-share', name: '开销结构', desc: '各类型支出占比', kind: 'donut', span: 6,
        when: function (p) { return p.indexOf('消费类型') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(sumBy(rows, '消费类型', '金额')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          return { kind: 'donut', slices: list.map(function (e) { return { label: e.label, value: Math.round(e.value * 10) / 10 }; }), fmt: 'money', center: { value: C.fmt(sum(nums(rows, '金额')), 'money'), label: '总支出' } };
        } },
      { id: 's-hour', name: '时段消费趋势', desc: '一天中各小时的消费金额', kind: 'line', span: 6,
        when: function (p) { return p.indexOf('小时') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows) {
          var hours = hoursOf(rows);
          if (!hours.length) return null;
          var lo = hours[0], hi = hours[hours.length - 1];
          var xs = [], vals = [];
          for (var h = lo; h <= hi; h++) {
            xs.push(pad2(h));
            vals.push(Math.round(sum(rows.filter(function (r) { return r['小时'] === h; }).map(function (r) { return r['金额']; })) * 10) / 10);
          }
          return { kind: 'line', area: true, x: xs, series: [{ name: '金额', values: vals }], fmt: 'money', yLabel: '消费金额', xLabel: '时段（小时）' };
        } },
      { id: 's-day', name: '每日消费趋势', desc: '按日汇总的支出变化', kind: 'line', span: 6,
        when: function (p) { return p.indexOf('日期') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows) {
          var dates = uniq(rows, '日期');
          var vals = dates.map(function (d) {
            return Math.round(sum(rows.filter(function (r) { return r['日期'] === d; }).map(function (r) { return r['金额']; })) * 10) / 10;
          });
          return { kind: 'line', area: true, x: dates.map(function (d) { return d.slice(5); }), series: [{ name: '金额', values: vals }], fmt: 'money', yLabel: '消费金额', xLabel: '日期' };
        } },
      { id: 's-dist', name: '单笔金额分布', desc: '消费金额的区间笔数', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('金额') !== -1; },
        build: function (rows, ctx) {
          var h = hist(nums(rows, '金额'), ctx.bins);
          return { kind: 'hist', x: h.x, series: [{ name: '笔数', values: h.counts }], yLabel: '笔数', xLabel: '单笔金额（元）' };
        } },
      { id: 's-avg', name: '类型笔均消费', desc: '各类型平均每笔金额', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('消费类型') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(meanBy(rows, '消费类型', '金额')), ctx.sort);
          return { kind: 'bar', x: list.map(function (e) { return e.label; }), series: [{ name: '笔均', values: list.map(function (e) { return Math.round(e.value * 10) / 10; }), color: C.palette().series[1] }], fmt: 'money', yLabel: '笔均金额' };
        } },
      { id: 's-heat', name: '类型 × 时段热度', desc: '各类型在不同时段的支出密度', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('消费类型') !== -1 && p.indexOf('小时') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows) {
          var hours = hoursOf(rows);
          var types = uniq(rows, '消费类型');
          var values = types.map(function (t) {
            return hours.map(function (h) {
              return Math.round(sum(rows.filter(function (r) { return r['消费类型'] === t && r['小时'] === h; }).map(function (r) { return r['金额']; })) * 10) / 10;
            });
          });
          return { kind: 'heat', x: hours.map(pad2), y: types, values: values, fmt: 'money', xLabel: '时段' };
        } },
      { id: 's-week', name: '星期消费构成', desc: '一周各天的类型支出堆叠', kind: 'stacked', span: 6,
        when: function (p) { return p.indexOf('星期') !== -1 && p.indexOf('消费类型') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows) {
          var weeks = weekOrder(rows);
          var types = uniq(rows, '消费类型');
          var series = types.map(function (t) {
            return { name: t, values: weeks.map(function (w) {
              return Math.round(sum(rows.filter(function (r) { return r['星期'] === w && r['消费类型'] === t; }).map(function (r) { return r['金额']; })) * 10) / 10;
            }) };
          });
          return { kind: 'stacked', x: weeks, series: series, fmt: 'money', yLabel: '消费金额' };
        } },
      { id: 's-big', name: '最大单笔 Top 10', desc: '金额最高的十笔消费', kind: 'hbar', span: 12,
        when: function (p) { return p.indexOf('金额') !== -1; },
        build: function (rows) {
          var top = rows.filter(function (r) { return typeof r['金额'] === 'number'; })
            .sort(function (a, b) { return b['金额'] - a['金额']; }).slice(0, 10);
          return { kind: 'hbar', x: top.map(function (r) {
            return (r['消费类型'] || '消费') + ' · ' + String(r['时间'] || '').slice(5, 16);
          }), series: [{ name: '金额', values: top.map(function (r) { return r['金额']; }), color: C.palette().series[1] }], fmt: 'money' };
        } }
    ],
    iris: [
      { id: 'i-count', name: '品种样本占比', desc: '三个品种各自的样本数量', kind: 'donut', span: 4,
        when: function (p) { return p.indexOf('品种') !== -1; },
        build: function (rows, ctx) {
          var groups = speciesGroups(rows);
          var counts = countBy(rows, '品种');
          var list = groups.map(function (g) { return { label: g.name, value: counts[g.name] || 0, color: g.color }; })
            .filter(function (s) { return s.value > 0; });
          if (ctx.sort === 'asc') list.sort(function (a, b) { return a.value - b.value; });
          else if (ctx.sort === 'desc') list.sort(function (a, b) { return b.value - a.value; });
          return { kind: 'donut', slices: list, center: { value: countStr(rows.length), label: '样本总数' } };
        } },
      { id: 'i-plpw', name: '花瓣长 × 花瓣宽', desc: '花瓣尺寸散点，按品种着色', kind: 'scatter', span: 8,
        when: function (p) { return p.indexOf('花瓣长') !== -1 && p.indexOf('花瓣宽') !== -1; },
        build: function (rows) {
          var groups = speciesGroups(rows);
          var spec = scatterBy(rows, '花瓣长', '花瓣宽', '品种', groups, '花瓣长（cm）', '花瓣宽（cm）');
          spec.aria = '花瓣长与花瓣宽散点图';
          return spec;
        } },
      { id: 'i-slsw', name: '花萼长 × 花萼宽', desc: '花萼尺寸散点，按品种着色', kind: 'scatter', span: 6,
        when: function (p) { return p.indexOf('花萼长') !== -1 && p.indexOf('花萼宽') !== -1; },
        build: function (rows) {
          return scatterBy(rows, '花萼长', '花萼宽', '品种', speciesGroups(rows), '花萼长（cm）', '花萼宽（cm）');
        } },
      { id: 'i-box', name: '各品种花瓣长分布', desc: '花瓣长的四分位与极值', kind: 'box', span: 6,
        when: function (p) { return p.indexOf('品种') !== -1 && p.indexOf('花瓣长') !== -1; },
        build: function (rows) {
          var groups = boxGroups(rows, '品种', '花瓣长', speciesGroups(rows).map(function (g) { return g.name; }));
          if (!groups.length) return null;
          return { kind: 'box', groups: groups, yLabel: '花瓣长（cm）' };
        } },
      { id: 'i-hist', name: '花瓣长分布', desc: '花瓣长的区间样本数', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('花瓣长') !== -1; },
        build: function (rows, ctx) {
          var h = hist(nums(rows, '花瓣长'), ctx.bins);
          return { kind: 'hist', x: h.x, series: [{ name: '样本数', values: h.counts }], yLabel: '样本数', xLabel: '花瓣长（cm）' };
        } },
      { id: 'i-area', name: '花瓣面积分布', desc: '花瓣长 × 花瓣宽的区间样本数', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('花瓣面积') !== -1; },
        build: function (rows, ctx) {
          var h = hist(nums(rows, '花瓣面积'), ctx.bins);
          return { kind: 'hist', x: h.x, series: [{ name: '样本数', values: h.counts, color: C.palette().series[4] }], yLabel: '样本数', xLabel: '花瓣面积（cm²）' };
        } },
      { id: 'i-heat', name: '品种 × 特征均值', desc: '各品种在每项特征上的平均尺寸', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('品种') !== -1 && features(p).length >= 2; },
        build: function (rows, ctx) {
          var fs = features(ctx.present);
          var sp = speciesGroups(rows).map(function (g) { return g.name; });
          var values = sp.map(function (s) {
            var sub = rows.filter(function (r) { return r['品种'] === s; });
            return fs.map(function (f) { return round2(mean(nums(sub, f))); });
          });
          return { kind: 'heat', x: fs, y: sp, values: values, xLabel: '特征' };
        } },
      { id: 'i-corr', name: '特征相关性矩阵', desc: '四项测量值之间的皮尔逊相关系数', kind: 'corr', span: 6,
        when: function (p) { return features(p).length >= 2; },
        build: function (rows, ctx) { return corrSpec(rows, features(ctx.present), '鸢尾花特征相关性矩阵'); } },
      { id: 'i-mean', name: '品种特征对比', desc: '每个品种在各项特征上的均值', kind: 'grouped', span: 12,
        when: function (p) { return p.indexOf('品种') !== -1 && features(p).length >= 2; },
        build: function (rows, ctx) {
          var fs = features(ctx.present);
          var groups = speciesGroups(rows);
          var series = groups.map(function (g) {
            var sub = rows.filter(function (r) { return r['品种'] === g.name; });
            return { name: g.name, color: g.color, values: fs.map(function (f) { return round2(mean(nums(sub, f))); }) };
          });
          var x = fs.slice();
          if (ctx.sort === 'name') x.sort(function (a, b) { return a.localeCompare(b, 'zh'); });
          return { kind: 'grouped', x: x, series: series.map(function (s) {
            return { name: s.name, color: s.color, values: x.map(function (f) { return s.values[fs.indexOf(f)]; }) };
          }), yLabel: '平均尺寸（cm）' };
        } }
    ],
    titanic: [
      { id: 't-survive', name: '幸存比例', desc: '幸存与遇难乘客占比', kind: 'donut', span: 4,
        when: function (p) { return p.indexOf('是否幸存') !== -1; },
        build: function (rows) {
          var pal = C.palette().series;
          var alive = rows.filter(function (r) { return r['是否幸存'] === '是'; }).length;
          return { kind: 'donut', slices: [
            { label: '幸存', value: alive, color: pal[0] },
            { label: '遇难', value: rows.length - alive, color: pal[7] }
          ], center: { value: C.fmt(rows.length ? alive / rows.length * 100 : 0, 'pct'), label: '生存率' }, fmt: 'num' };
        } },
      { id: 't-sex', name: '性别生存率', desc: '男女乘客的幸存比例', kind: 'bar', span: 4,
        when: function (p) { return p.indexOf('性别') !== -1 && p.indexOf('是否幸存') !== -1; },
        build: function (rows, ctx) {
          var m = rateBy(rows, '性别', function (r) { return r['是否幸存'] === '是'; });
          var list = order(Object.keys(m).map(function (k) {
            return { label: k, value: round2(m[k][1] / m[k][0] * 100), n: m[k][0], hit: m[k][1] };
          }), ctx.sort === 'default' ? 'name' : ctx.sort);
          return { kind: 'bar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '生存率', values: list.map(function (e) { return e.value; }) }], fmt: 'pct', yLabel: '生存率' };
        } },
      { id: 't-class', name: '舱位生存率', desc: '各舱位等级的幸存比例', kind: 'bar', span: 4,
        when: function (p) { return p.indexOf('舱位') !== -1 && p.indexOf('是否幸存') !== -1; },
        build: function (rows, ctx) {
          var m = rateBy(rows, '舱位', function (r) { return r['是否幸存'] === '是'; });
          var list = order(Object.keys(m).map(function (k) {
            return { label: k, value: round2(m[k][1] / m[k][0] * 100) };
          }), ctx.sort === 'default' ? 'name' : ctx.sort);
          return { kind: 'bar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '生存率', values: list.map(function (e) { return e.value; }), color: C.palette().series[3] }], fmt: 'pct', yLabel: '生存率' };
        } },
      { id: 't-age', name: '乘客年龄分布', desc: '年龄区间的人数分布', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('年龄') !== -1; },
        build: function (rows, ctx) {
          var h = hist(nums(rows, '年龄'), ctx.bins);
          return { kind: 'hist', x: h.x, series: [{ name: '人数', values: h.counts }], yLabel: '人数', xLabel: '年龄（岁）' };
        } },
      { id: 't-ageband', name: '年龄段生存构成', desc: '各年龄段的幸存与遇难人数', kind: 'stacked', span: 6,
        when: function (p) { return p.indexOf('年龄段') !== -1 && p.indexOf('是否幸存') !== -1; },
        build: function (rows) {
          var present = uniq(rows, '年龄段');
          var bands = D.AGE_BANDS.filter(function (b) { return present.indexOf(b) !== -1; });
          var pal = C.palette().series;
          var series = [
            { name: '幸存', color: pal[0], values: bands.map(function (b) {
              return rows.filter(function (r) { return r['年龄段'] === b && r['是否幸存'] === '是'; }).length; }) },
            { name: '遇难', color: pal[7], values: bands.map(function (b) {
              return rows.filter(function (r) { return r['年龄段'] === b && r['是否幸存'] !== '是'; }).length; }) }
          ];
          return { kind: 'stacked', x: bands, series: series, yLabel: '人数' };
        } },
      { id: 't-fare', name: '各舱位票价分布', desc: '票价的四分位与极值', kind: 'box', span: 6,
        when: function (p) { return p.indexOf('舱位') !== -1 && p.indexOf('票价') !== -1; },
        build: function (rows) {
          var groups = boxGroups(rows, '舱位', '票价');
          if (!groups.length) return null;
          return { kind: 'box', groups: groups, fmt: 'money', yLabel: '票价' };
        } },
      { id: 't-scatter', name: '年龄 × 票价', desc: '按幸存结果着色的乘客散点', kind: 'scatter', span: 6,
        when: function (p) { return p.indexOf('年龄') !== -1 && p.indexOf('票价') !== -1; },
        build: function (rows) {
          var pal = C.palette().series;
          var groups = [{ name: '幸存', color: pal[0] }, { name: '遇难', color: pal[7] }];
          var points = [];
          rows.forEach(function (r) {
            if (typeof r['年龄'] !== 'number' || typeof r['票价'] !== 'number') return;
            points.push({ x: r['年龄'], y: r['票价'], g: r['是否幸存'] === '是' ? 0 : 1, label: r['姓名'] || '' });
          });
          if (!points.length) return null;
          return { kind: 'scatter', points: thinPoints(points), groups: groups, xLabel: '年龄（岁）', yLabel: '票价', fmt: 'money' };
        } },
      { id: 't-heat', name: '舱位 × 性别生存率', desc: '不同舱位与性别组合的生存率', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('舱位') !== -1 && p.indexOf('性别') !== -1 && p.indexOf('是否幸存') !== -1; },
        build: function (rows) {
          var classes = uniq(rows, '舱位'), sexes = uniq(rows, '性别');
          var values = sexes.map(function (s) {
            return classes.map(function (c) {
              var sub = rows.filter(function (r) { return r['舱位'] === c && r['性别'] === s; });
              if (!sub.length) return 0;
              return round2(sub.filter(function (r) { return r['是否幸存'] === '是'; }).length / sub.length * 100);
            });
          });
          return { kind: 'heat', x: classes, y: sexes, values: values, fmt: 'pct', xLabel: '舱位' };
        } },
      { id: 't-port', name: '登船港口构成', desc: '各港口登船乘客的舱位分布', kind: 'stacked', span: 6,
        when: function (p) { return p.indexOf('登船港口') !== -1 && p.indexOf('舱位') !== -1; },
        build: function (rows) {
          var ports = uniq(rows, '登船港口'), classes = uniq(rows, '舱位');
          var series = classes.map(function (c) {
            return { name: c, values: ports.map(function (pt) {
              return rows.filter(function (r) { return r['登船港口'] === pt && r['舱位'] === c; }).length;
            }) };
          });
          return { kind: 'stacked', x: ports, series: series, yLabel: '人数' };
        } },
      { id: 't-top', name: '最高票价 Top 10', desc: '票价最高的十位乘客', kind: 'hbar', span: 12,
        when: function (p) { return p.indexOf('票价') !== -1; },
        build: function (rows) {
          var top = rows.filter(function (r) { return typeof r['票价'] === 'number'; })
            .sort(function (a, b) { return b['票价'] - a['票价']; }).slice(0, 10);
          if (!top.length) return null;
          return { kind: 'hbar', x: top.map(function (r) {
            return (r['姓名'] ? String(r['姓名']).split(',')[0] : '乘客 ' + r['乘客编号']) + ' · ' + (r['舱位'] || '');
          }), series: [{ name: '票价', values: top.map(function (r) { return r['票价']; }), color: C.palette().series[1] }], fmt: 'money' };
        } }
    ],
    housing: [
      { id: 'h-area', name: '面积 × 总价', desc: '房源面积与总价的关系，按区位着色', kind: 'scatter', span: 12,
        when: function (p) { return p.indexOf('面积') !== -1 && p.indexOf('房价') !== -1; },
        build: function (rows) {
          var regions = uniq(rows, '区位');
          var pal = C.palette().series;
          var groups = regions.map(function (n, i) { return { name: n, color: pal[i % 8] }; });
          var spec = scatterBy(rows, '面积', '房价', '区位', groups, '建筑面积（㎡）', '总价', 'money');
          spec.aria = '面积与总价散点图';
          return spec;
        } },
      { id: 'h-price', name: '总价分布', desc: '房源总价的区间套数', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('房价') !== -1; },
        build: function (rows, ctx) {
          var vals = nums(rows, '房价').map(function (v) { return v / 10000; });
          var h = hist(vals, ctx.bins);
          return { kind: 'hist', x: h.x, series: [{ name: '套数', values: h.counts }], yLabel: '套数', xLabel: '总价（万元）' };
        } },
      { id: 'h-unit', name: '单价分布', desc: '每平米单价的区间套数', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('单价') !== -1; },
        build: function (rows, ctx) {
          var h = hist(nums(rows, '单价'), ctx.bins);
          return { kind: 'hist', x: h.x, series: [{ name: '套数', values: h.counts, color: C.palette().series[1] }], yLabel: '套数', xLabel: '单价（元/㎡）' };
        } },
      { id: 'h-corr', name: '特征相关性矩阵', desc: '面积 / 房间数 / 房龄 / 距离与价格的相关系数', kind: 'corr', span: 6,
        when: function (p) {
          return ['面积', '房间数', '房龄', '距市中心', '单价', '房价'].filter(function (k) { return p.indexOf(k) !== -1; }).length >= 3;
        },
        build: function (rows, ctx) {
          var keys = ['面积', '房间数', '房龄', '距市中心', '单价', '房价']
            .filter(function (k) { return ctx.present.indexOf(k) !== -1; });
          return corrSpec(rows, keys, '房价特征相关性矩阵');
        } },
      { id: 'h-region', name: '各区位平均总价', desc: '按区位汇总的平均成交总价', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('区位') !== -1 && p.indexOf('房价') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(meanBy(rows, '区位', '房价')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          return { kind: 'bar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '平均总价', values: list.map(function (e) { return Math.round(e.value); }) }], fmt: 'money', yLabel: '平均总价' };
        } },
      { id: 'h-box', name: '各区位单价分布', desc: '每平米单价的四分位与极值', kind: 'box', span: 6,
        when: function (p) { return p.indexOf('区位') !== -1 && p.indexOf('单价') !== -1; },
        build: function (rows) {
          var groups = boxGroups(rows, '区位', '单价');
          if (!groups.length) return null;
          return { kind: 'box', groups: groups, fmt: 'sep', yLabel: '单价（元/㎡）' };
        } },
      { id: 'h-rooms', name: '房间数与单价', desc: '不同居室数量的平均单价', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('房间数') !== -1 && p.indexOf('单价') !== -1; },
        build: function (rows) {
          var m = meanBy(rows, '房间数', '单价');
          var keys = Object.keys(m).map(Number).sort(function (a, b) { return a - b; });
          return { kind: 'bar', x: keys.map(function (k) { return k + ' 居'; }),
            series: [{ name: '平均单价', values: keys.map(function (k) { return Math.round(m[k]); }), color: C.palette().series[4] }],
            fmt: 'sep', yLabel: '单价（元/㎡）' };
        } },
      { id: 'h-age', name: '房龄 × 单价', desc: '房龄增长对每平米单价的影响', kind: 'scatter', span: 6,
        when: function (p) { return p.indexOf('房龄') !== -1 && p.indexOf('单价') !== -1; },
        build: function (rows) {
          var regions = uniq(rows, '区位');
          var pal = C.palette().series;
          var groups = regions.map(function (n, i) { return { name: n, color: pal[i % 8] }; });
          return scatterBy(rows, '房龄', '单价', '区位', groups, '房龄（年）', '单价（元/㎡）', 'sep');
        } },
      { id: 'h-heat', name: '区位 × 面积段', desc: '各区位不同户型的房源套数', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('区位') !== -1 && p.indexOf('面积段') !== -1; },
        build: function (rows) {
          var regions = uniq(rows, '区位');
          var present = uniq(rows, '面积段');
          var bands = D.AREA_BANDS.filter(function (b) { return present.indexOf(b) !== -1; });
          var values = regions.map(function (rg) {
            return bands.map(function (b) {
              return rows.filter(function (r) { return r['区位'] === rg && r['面积段'] === b; }).length;
            });
          });
          return { kind: 'heat', x: bands, y: regions, values: values, xLabel: '面积段' };
        } }
    ],
    orders: [
      { id: 'o-trend', name: '每日销售额趋势', desc: '按日汇总的销售金额变化', kind: 'line', span: 12,
        when: function (p) { return p.indexOf('日期') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows) {
          var dates = uniq(rows, '日期');
          if (!dates.length) return null;
          var vals = dates.map(function (d) {
            return Math.round(sum(rows.filter(function (r) { return r['日期'] === d; }).map(function (r) { return r['金额']; })));
          });
          return { kind: 'line', area: true, x: dates.map(function (d) { return d.slice(5); }),
            series: [{ name: '销售额', values: vals }], fmt: 'money', yLabel: '销售额', xLabel: '日期', zero: false };
        } },
      { id: 'o-cat', name: '品类销售额', desc: '各商品类别的销售总额', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('商品类别') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(sumBy(rows, '商品类别', '金额')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          return { kind: 'bar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '销售额', values: list.map(function (e) { return Math.round(e.value); }) }], fmt: 'money', yLabel: '销售额' };
        } },
      { id: 'o-share', name: '品类占比', desc: '各品类销售额占比', kind: 'donut', span: 6,
        when: function (p) { return p.indexOf('商品类别') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(sumBy(rows, '商品类别', '金额')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          return { kind: 'donut', slices: list.map(function (e) { return { label: e.label, value: Math.round(e.value) }; }),
            fmt: 'money', center: { value: C.fmt(sum(nums(rows, '金额')), 'money'), label: '总销售额' } };
        } },
      { id: 'o-hour', name: '下单时段分布', desc: '一天中各小时的订单量', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('小时') !== -1; },
        build: function (rows) {
          var hours = hoursOf(rows);
          if (!hours.length) return null;
          var lo = hours[0], hi = hours[hours.length - 1];
          var xs = [], vals = [];
          for (var h = lo; h <= hi; h++) {
            xs.push(pad2(h));
            vals.push(rows.filter(function (r) { return r['小时'] === h; }).length);
          }
          return { kind: 'bar', x: xs, series: [{ name: '订单数', values: vals, color: C.palette().series[3] }], yLabel: '订单数', xLabel: '时段（小时）' };
        } },
      { id: 'o-region', name: '地区销售排行', desc: '各地区销售额排名', kind: 'hbar', span: 6,
        when: function (p) { return p.indexOf('地区') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows) {
          var list = order(entries(sumBy(rows, '地区', '金额')), 'desc');
          return { kind: 'hbar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '销售额', values: list.map(function (e) { return Math.round(e.value); }), color: C.palette().series[1] }], fmt: 'money' };
        } },
      { id: 'o-heat', name: '品类 × 时段热度', desc: '各品类在不同时段的销售额', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('商品类别') !== -1 && p.indexOf('时段') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows) {
          var present = uniq(rows, '时段');
          var slots = D.ORDER_SLOTS.filter(function (s) { return present.indexOf(s) !== -1; });
          var cats = uniq(rows, '商品类别');
          var values = cats.map(function (c) {
            return slots.map(function (s) {
              return Math.round(sum(rows.filter(function (r) { return r['商品类别'] === c && r['时段'] === s; }).map(function (r) { return r['金额']; })));
            });
          });
          return { kind: 'heat', x: slots, y: cats, values: values, fmt: 'money', xLabel: '时段' };
        } },
      { id: 'o-week', name: '星期品类构成', desc: '一周各天的品类销售额堆叠', kind: 'stacked', span: 6,
        when: function (p) { return p.indexOf('星期') !== -1 && p.indexOf('商品类别') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows) {
          var weeks = weekOrder(rows);
          var cats = uniq(rows, '商品类别');
          var series = cats.map(function (c) {
            return { name: c, values: weeks.map(function (w) {
              return Math.round(sum(rows.filter(function (r) { return r['星期'] === w && r['商品类别'] === c; }).map(function (r) { return r['金额']; })));
            }) };
          });
          return { kind: 'stacked', x: weeks, series: series, fmt: 'money', yLabel: '销售额' };
        } },
      { id: 'o-pay', name: '支付方式占比', desc: '各支付方式的订单数占比', kind: 'donut', span: 4,
        when: function (p) { return p.indexOf('支付方式') !== -1; },
        build: function (rows, ctx) {
          var list = order(catEntries(rows, '支付方式'), ctx.sort === 'default' ? 'desc' : ctx.sort);
          return { kind: 'donut', slices: list.map(function (e) { return { label: e.label, value: e.value }; }),
            center: { value: countStr(rows.length), label: '订单总数' } };
        } },
      { id: 'o-avg', name: '品类客单价', desc: '各品类平均每单金额', kind: 'bar', span: 8,
        when: function (p) { return p.indexOf('商品类别') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(meanBy(rows, '商品类别', '金额')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          return { kind: 'bar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '客单价', values: list.map(function (e) { return round2(e.value); }), color: C.palette().series[5] }],
            fmt: 'money', yLabel: '客单价' };
        } }
    ],
    weather: [
      { id: 'w-trend', name: '每日平均气温', desc: '各城市全年日均气温曲线', kind: 'line', span: 12,
        when: function (p) { return p.indexOf('日期') !== -1 && p.indexOf('平均气温') !== -1; },
        build: function (rows) {
          var dates = uniq(rows, '日期');
          if (dates.length < 2) return null;
          var cities = uniq(rows, '城市');
          var series;
          if (cities.length > 1) {
            var g = gridBy(rows, '日期', '城市', '平均气温', dates, cities, 'mean');
            series = cities.map(function (c, i) { return { name: c, values: g[i] }; });
          } else {
            var m = meanBy(rows, '日期', '平均气温');
            series = [{ name: '平均气温', values: dates.map(function (d) { return round2(m[d] || 0); }) }];
          }
          return { kind: 'line', x: dates.map(function (d) { return d.slice(5); }), series: series,
            zero: false, yLabel: '气温（℃）', xLabel: '日期', aria: '每日平均气温趋势' };
        } },
      { id: 'w-rain', name: '月度降水量', desc: '各城市逐月降水总量堆叠', kind: 'stacked', span: 6,
        when: function (p) { return p.indexOf('月份') !== -1 && p.indexOf('降雨量') !== -1; },
        build: function (rows) {
          var months = uniq(rows, '月份');
          if (!months.length) return null;
          var cities = uniq(rows, '城市');
          var labels = months.map(function (m) { return months.length > 12 ? m : m.slice(5) + '月'; });
          if (cities.length > 1) {
            var g = gridBy(rows, '月份', '城市', '降雨量', months, cities, 'sum');
            return { kind: 'stacked', x: labels, series: cities.map(function (c, i) { return { name: c, values: g[i] }; }),
              fmt: 'sep', yLabel: '降水量（mm）' };
          }
          var s = sumBy(rows, '月份', '降雨量');
          return { kind: 'stacked', x: labels,
            series: [{ name: cities[0] || '降水量', values: months.map(function (m) { return Math.round(s[m] || 0); }) }],
            fmt: 'sep', yLabel: '降水量（mm）' };
        } },
      { id: 'w-temp', name: '气温分布', desc: '优先使用平均气温，未提供时使用最高温或最低温', kind: 'hist', span: 6,
        when: function (p) { return ['平均气温', '最高温', '最低温'].some(function (k) { return p.indexOf(k) !== -1; }); },
        build: function (rows, ctx) {
          var key = ['平均气温', '最高温', '最低温'].filter(function (k) { return ctx.present.indexOf(k) !== -1; })[0];
          var h = hist(nums(rows, key), ctx.bins);
          if (!h.x.length) return null;
          return { kind: 'hist', x: h.x, series: [{ name: '记录数', values: h.counts, color: C.palette().series[1] }],
            yLabel: '记录数', xLabel: key + '（℃）', aria: key + '分布直方图' };
        } },
      { id: 'w-range', name: '月度高低温对比', desc: '按高低温均有效的记录统计月均值，可按城市筛选', kind: 'line', span: 6,
        when: function (p) { return p.indexOf('月份') !== -1 && p.indexOf('最高温') !== -1 && p.indexOf('最低温') !== -1; },
        build: function (rows) {
          var valid = rows.filter(function (r) { return typeof r['最高温'] === 'number' && typeof r['最低温'] === 'number'; });
          var months = uniq(valid, '月份');
          if (!months.length) return null;
          return { kind: 'line', x: months, series: ['最高温', '最低温'].map(function (key) {
            var averages = meanBy(valid, '月份', key);
            return { name: '平均' + key, values: months.map(function (m) { return round2(averages[m]); }) };
          }), zero: false, yLabel: '气温（℃）', xLabel: '月份', aria: '月度平均高低温对比' };
        } },
      { id: 'w-hum', name: '气温 × 湿度', desc: '按季节着色的温湿度关系', kind: 'scatter', span: 6,
        when: function (p) { return p.indexOf('平均气温') !== -1 && p.indexOf('湿度') !== -1; },
        build: function (rows) {
          var groups = groupsBy(rows, '季节', D.SEASONS);
          var spec = scatterBy(rows, '平均气温', '湿度', '季节', groups, '气温（℃）', '湿度（%）', null, null, '日期');
          spec.aria = '气温与湿度散点图';
          return spec;
        } },
      { id: 'w-box', name: '四季气温分布', desc: '各季日均气温的四分位与极值', kind: 'box', span: 6,
        when: function (p) { return p.indexOf('季节') !== -1 && p.indexOf('平均气温') !== -1; },
        build: function (rows) {
          var g = boxGroups(rows, '季节', '平均气温', D.SEASONS);
          if (!g.length) return null;
          return { kind: 'box', groups: g, yLabel: '气温（℃）' };
        } },
      { id: 'w-heat', name: '城市 × 月份降水', desc: '各城市逐月降水总量热力', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('城市') !== -1 && p.indexOf('月份') !== -1 && p.indexOf('降雨量') !== -1; },
        build: function (rows) {
          var months = uniq(rows, '月份'), cities = uniq(rows, '城市');
          if (!months.length || !cities.length) return null;
          return { kind: 'heat', x: months.map(function (m) { return months.length > 12 ? m : m.slice(5) + '月'; }),
            y: cities, values: gridBy(rows, '月份', '城市', '降雨量', months, cities, 'sum'),
            fmt: 'sep', xLabel: '月份', aria: '城市与月份降水量热力图' };
        } },
      { id: 'w-corr', name: '气象要素相关性', desc: '气温 / 降水 / 湿度 / 风速的相关系数', kind: 'corr', span: 6,
        when: function (p) {
          return ['平均气温', '最高温', '最低温', '降雨量', '湿度', '风速'].filter(function (k) { return p.indexOf(k) !== -1; }).length >= 3;
        },
        build: function (rows, ctx) {
          var keys = ['平均气温', '最高温', '最低温', '温差', '降雨量', '湿度', '风速'].filter(function (k) { return ctx.present.indexOf(k) !== -1; });
          return corrSpec(rows, keys, '气象要素相关性矩阵');
        } },
      { id: 'w-level', name: '雨量等级占比', desc: '无雨到暴雨的记录数构成', kind: 'donut', span: 4,
        when: function (p) { return p.indexOf('雨量等级') !== -1; },
        build: function (rows, ctx) {
          var present = uniq(rows, '雨量等级');
          var levels = D.RAIN_LEVELS.filter(function (l) { return present.indexOf(l) !== -1; });
          present.forEach(function (l) { if (levels.indexOf(l) === -1) levels.push(l); });
          var c = countBy(rows, '雨量等级');
          var list = levels.map(function (l) { return { label: l, value: c[l] || 0 }; });
          if (ctx.sort !== 'default') list = order(list, ctx.sort);
          var rainy = rows.filter(function (r) { return r['降雨']; }).length;
          return { kind: 'donut', slices: list,
            center: { value: nums(rows, '降雨量').length ? C.fmt(rainy / nums(rows, '降雨量').length * 100, 'pct') : '—', label: '有效记录降雨占比' } };
        } },
      { id: 'w-cond', name: '天气状况天数', desc: '各类天气出现的记录数排行', kind: 'hbar', span: 8,
        when: function (p) { return p.indexOf('天气状况') !== -1; },
        build: function (rows, ctx) {
          var list = order(catEntries(rows, '天气状况'), ctx.sort === 'default' ? 'desc' : ctx.sort);
          if (!list.length) return null;
          return { kind: 'hbar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '记录数', values: list.map(function (e) { return e.value; }), color: C.palette().series[3] }],
            fmt: 'sep' };
        } }
    ],
    bikes: [
      { id: 'b-trend', name: '每日租借量', desc: '按天汇总的共享单车租借趋势', kind: 'line', span: 12,
        when: function (p) { return p.indexOf('日期') !== -1 && p.indexOf('租借数量') !== -1; },
        build: function (rows) {
          var dates = uniq(rows, '日期');
          if (dates.length < 2) return null;
          var s = sumBy(rows, '日期', '租借数量');
          return { kind: 'line', area: true, x: dates.map(function (d) { return d.slice(5); }),
            series: [{ name: '租借量', values: dates.map(function (d) { return Math.round(s[d] || 0); }) }],
            fmt: 'sep', zero: false, yLabel: '租借量', xLabel: '日期', aria: '每日租借量趋势' };
        } },
      { id: 'b-hour', name: '24 小时租借曲线', desc: '各小时的平均租借量', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('小时') !== -1 && p.indexOf('租借数量') !== -1; },
        build: function (rows) {
          var hours = hoursOf(rows);
          if (!hours.length) return null;
          var m = meanBy(rows, '小时', '租借数量');
          return { kind: 'bar', x: hours.map(pad2),
            series: [{ name: '平均租借量', values: hours.map(function (h) { return Math.round(m[h] || 0); }), color: C.palette().series[3] }],
            fmt: 'sep', yLabel: '平均租借量', xLabel: '小时' };
        } },
      { id: 'b-slot', name: '时段租借总量', desc: '早高峰到晚高峰的租借量对比', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('时段') !== -1 && p.indexOf('租借数量') !== -1; },
        build: function (rows, ctx) {
          var present = uniq(rows, '时段');
          var slots = D.BIKE_SLOTS.filter(function (s) { return present.indexOf(s) !== -1; });
          present.forEach(function (s) { if (slots.indexOf(s) === -1) slots.push(s); });
          var s = sumBy(rows, '时段', '租借数量');
          var list = slots.map(function (x) { return { label: x, value: Math.round(s[x] || 0) }; });
          if (ctx.sort !== 'default') list = order(list, ctx.sort);
          return { kind: 'bar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '租借量', values: list.map(function (e) { return e.value; }), color: C.palette().series[0] }],
            fmt: 'sep', yLabel: '租借量' };
        } },
      { id: 'b-weather', name: '天气对租借的影响', desc: '不同天气下的小时均租借量', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('天气') !== -1 && p.indexOf('租借数量') !== -1; },
        build: function (rows, ctx) {
          var present = uniq(rows, '天气');
          var list = D.BIKE_WEATHER.filter(function (w) { return present.indexOf(w) !== -1; });
          present.forEach(function (w) { if (list.indexOf(w) === -1) list.push(w); });
          var m = meanBy(rows, '天气', '租借数量');
          var items = list.map(function (w) { return { label: w, value: Math.round(m[w] || 0) }; });
          if (ctx.sort !== 'default') items = order(items, ctx.sort);
          return { kind: 'bar', x: items.map(function (e) { return e.label; }),
            series: [{ name: '平均租借量', values: items.map(function (e) { return e.value; }), color: C.palette().series[1] }],
            fmt: 'sep', yLabel: '平均租借量' };
        } },
      { id: 'b-scatter', name: '气温 × 租借量', desc: '按天气着色的温度敏感度', kind: 'scatter', span: 6,
        when: function (p) { return p.indexOf('气温') !== -1 && p.indexOf('租借数量') !== -1; },
        build: function (rows) {
          var groups = groupsBy(rows, '天气', D.BIKE_WEATHER);
          var spec = scatterBy(rows, '气温', '租借数量', '天气', groups, '气温（℃）', '租借量', 'sep', null, '日期');
          spec.aria = '气温与租借量散点图';
          return spec;
        } },
      { id: 'b-heat', name: '星期 × 时段热力', desc: '一周各天分时段的小时均租借量', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('星期') !== -1 && p.indexOf('时段') !== -1 && p.indexOf('租借数量') !== -1; },
        build: function (rows) {
          var weeks = weekOrder(rows);
          var present = uniq(rows, '时段');
          var slots = D.BIKE_SLOTS.filter(function (s) { return present.indexOf(s) !== -1; });
          present.forEach(function (s) { if (slots.indexOf(s) === -1) slots.push(s); });
          if (!weeks.length || !slots.length) return null;
          return { kind: 'heat', x: slots, y: weeks,
            values: gridBy(rows, '时段', '星期', '租借数量', slots, weeks, 'mean'),
            fmt: 'sep', xLabel: '时段', aria: '星期与时段租借量热力图' };
        } },
      { id: 'b-corr', name: '骑行要素相关性', desc: '气温 / 湿度 / 风速 / 时刻与租借量', kind: 'corr', span: 6,
        when: function (p) {
          return ['气温', '湿度', '风速', '小时', '租借数量'].filter(function (k) { return p.indexOf(k) !== -1; }).length >= 3;
        },
        build: function (rows, ctx) {
          var keys = ['气温', '湿度', '风速', '小时', '租借数量'].filter(function (k) { return ctx.present.indexOf(k) !== -1; });
          return corrSpec(rows, keys, '骑行要素相关性矩阵');
        } },
      { id: 'b-daytype', name: '工作日 / 非工作日占比', desc: '优先使用工作日标记，未提供时按星期推算', kind: 'donut', span: 4,
        when: function (p) { return p.indexOf('日期类型') !== -1 && p.indexOf('租借数量') !== -1; },
        build: function (rows) {
          var s = sumBy(rows, '日期类型', '租借数量');
          var list = order(entries(s), 'desc');
          if (!list.length) return null;
          var total = sum(list.map(function (e) { return e.value; }));
          return { kind: 'donut', slices: list.map(function (e) { return { label: e.label, value: e.value }; }),
            fmt: 'sep', center: { value: C.fmt(total, 'sep'), label: '总租借量' } };
        } },
      { id: 'b-compare', name: '工作日 vs 非工作日', desc: '两类日期各时段的平均租借量', kind: 'grouped', span: 8,
        when: function (p) { return p.indexOf('时段') !== -1 && p.indexOf('日期类型') !== -1 && p.indexOf('租借数量') !== -1; },
        build: function (rows) {
          var present = uniq(rows, '时段');
          var slots = D.BIKE_SLOTS.filter(function (s) { return present.indexOf(s) !== -1; });
          present.forEach(function (s) { if (slots.indexOf(s) === -1) slots.push(s); });
          var types = ['工作日', '非工作日'].filter(function (t) { return rows.some(function (r) { return r['日期类型'] === t; }); });
          if (!slots.length || types.length < 2) return null;
          var series = types.map(function (t) {
            var m = meanBy(rows.filter(function (r) { return r['日期类型'] === t; }), '时段', '租借数量');
            return { name: t, values: slots.map(function (s) { return Math.round(m[s] || 0); }) };
          });
          return { kind: 'grouped', x: slots, series: series, fmt: 'sep', yLabel: '平均租借量' };
        } }
    ],
    tea: [
      { id: 'te-trend', name: '每日营业额', desc: '奶茶 / 外卖订单的日营收趋势', kind: 'line', span: 12,
        when: function (p) { return p.indexOf('日期') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows) {
          var dates = uniq(rows, '日期');
          if (dates.length < 2) return null;
          var s = sumBy(rows, '日期', '金额');
          return { kind: 'line', area: true, x: dates.map(function (d) { return d.slice(5); }),
            series: [{ name: '营业额', values: dates.map(function (d) { return round2(s[d] || 0); }) }],
            fmt: 'money', zero: false, yLabel: '营业额', xLabel: '日期', aria: '每日营业额趋势' };
        } },
      { id: 'te-cat', name: '品类营业额', desc: '各品类的销售额排行', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('品类') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(sumBy(rows, '品类', '金额')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          if (!list.length) return null;
          return { kind: 'bar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '营业额', values: list.map(function (e) { return round2(e.value); }), color: C.palette().series[0] }],
            fmt: 'money', yLabel: '营业额' };
        } },
      { id: 'te-share', name: '品类销量占比', desc: '按件数统计的品类构成', kind: 'donut', span: 6,
        when: function (p) { return p.indexOf('品类') !== -1 && p.indexOf('数量') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(sumBy(rows, '品类', '数量')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          if (!list.length) return null;
          var total = sum(list.map(function (e) { return e.value; }));
          return { kind: 'donut', slices: list.map(function (e) { return { label: e.label, value: e.value }; }),
            fmt: 'sep', center: { value: C.fmt(total, 'sep'), label: '总销量（杯 / 份）' } };
        } },
      { id: 'te-hour', name: '下单时段分布', desc: '各小时的订单数', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('小时') !== -1; },
        build: function (rows) {
          var hours = hoursOf(rows);
          if (!hours.length) return null;
          var c = countBy(rows, '小时');
          return { kind: 'bar', x: hours.map(pad2),
            series: [{ name: '订单数', values: hours.map(function (h) { return c[h] || 0; }), color: C.palette().series[2] }],
            fmt: 'sep', yLabel: '订单数', xLabel: '小时' };
        } },
      { id: 'te-top', name: '热销单品 Top 10', desc: '按销量排名的商品', kind: 'hbar', span: 6,
        when: function (p) { return p.indexOf('商品名') !== -1 && p.indexOf('数量') !== -1; },
        build: function (rows) {
          var list = order(entries(sumBy(rows, '商品名', '数量')), 'desc').slice(0, 10);
          if (!list.length) return null;
          return { kind: 'hbar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '销量', values: list.map(function (e) { return e.value; }), color: C.palette().series[4] }],
            fmt: 'sep' };
        } },
      { id: 'te-heat', name: '品类 × 时段营业额', desc: '各品类在一天四个时段的营收', kind: 'heat', span: 6,
        when: function (p) { return p.indexOf('品类') !== -1 && p.indexOf('时段') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows) {
          var slots = ['凌晨', '上午', '下午', '晚间'].filter(function (s) { return rows.some(function (r) { return r['时段'] === s; }); });
          var cats = uniq(rows, '品类');
          if (!slots.length || !cats.length) return null;
          return { kind: 'heat', x: slots, y: cats, values: gridBy(rows, '时段', '品类', '金额', slots, cats, 'sum'),
            fmt: 'money', xLabel: '时段', aria: '品类与时段营业额热力图' };
        } },
      { id: 'te-store', name: '门店营业额', desc: '各门店的销售额对比', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('门店') !== -1 && p.indexOf('金额') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(sumBy(rows, '门店', '金额')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          if (!list.length) return null;
          return { kind: 'bar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '营业额', values: list.map(function (e) { return round2(e.value); }), color: C.palette().series[5] }],
            fmt: 'money', yLabel: '营业额' };
        } },
      { id: 'te-channel', name: '渠道订单占比', desc: '小程序 / 外卖 / 到店的订单构成', kind: 'donut', span: 4,
        when: function (p) { return p.indexOf('渠道') !== -1; },
        build: function (rows, ctx) {
          var list = order(catEntries(rows, '渠道'), ctx.sort === 'default' ? 'desc' : ctx.sort);
          if (!list.length) return null;
          var delivery = rows.filter(function (r) { return r['外卖']; }).length;
          return { kind: 'donut', slices: list.map(function (e) { return { label: e.label, value: e.value }; }),
            center: { value: rows.length ? C.fmt(delivery / rows.length * 100, 'pct') : '—', label: '外卖订单占比' } };
        } },
      { id: 'te-sugar', name: '甜度偏好', desc: '饮品订单的甜度选择分布', kind: 'bar', span: 8,
        when: function (p) { return p.indexOf('甜度') !== -1; },
        build: function (rows, ctx) {
          var present = uniq(rows, '甜度');
          var list = D.TEA_SUGAR.filter(function (s) { return present.indexOf(s) !== -1; });
          present.forEach(function (s) { if (list.indexOf(s) === -1) list.push(s); });
          var c = countBy(rows, '甜度');
          var items = list.map(function (s) { return { label: s, value: c[s] || 0 }; });
          if (ctx.sort !== 'default') items = order(items, ctx.sort);
          if (!items.length) return null;
          return { kind: 'bar', x: items.map(function (e) { return e.label; }),
            series: [{ name: '订单数', values: items.map(function (e) { return e.value; }), color: C.palette().series[6] }],
            fmt: 'sep', yLabel: '订单数' };
        } }
    ],
    players: [
      { id: 'p-scatter', name: '得分 × 助攻', desc: '按位置着色的球员产出分布', kind: 'scatter', span: 12,
        when: function (p) { return p.indexOf('得分') !== -1 && p.indexOf('助攻') !== -1; },
        build: function (rows) {
          var groups = groupsBy(rows, '位置', D.POSITIONS);
          var spec = scatterBy(rows, '得分', '助攻', '位置', groups, '场均得分', '场均助攻');
          spec.aria = '球员得分与助攻散点图';
          return spec;
        } },
      { id: 'p-top', name: '得分榜 Top 10', desc: '场均得分最高的球员', kind: 'hbar', span: 6,
        when: function (p) { return p.indexOf('球员') !== -1 && p.indexOf('得分') !== -1; },
        build: function (rows) {
          var list = rows.filter(function (r) { return typeof r['得分'] === 'number'; })
            .sort(function (a, b) { return b['得分'] - a['得分']; }).slice(0, 10);
          if (!list.length) return null;
          return { kind: 'hbar', x: list.map(function (r) { return r['球员'] + (r['球队'] ? ' · ' + r['球队'] : ''); }),
            series: [{ name: '场均得分', values: list.map(function (r) { return r['得分']; }), color: C.palette().series[2] }] };
        } },
      { id: 'p-assists', name: '助攻榜 Top 10', desc: '场均助攻最高的十名球员', kind: 'hbar', span: 6,
        when: function (p) { return p.indexOf('球员') !== -1 && p.indexOf('助攻') !== -1; },
        build: function (rows) {
          var list = rows.filter(function (r) { return typeof r['助攻'] === 'number'; })
            .sort(function (a, b) { return b['助攻'] - a['助攻']; }).slice(0, 10);
          if (!list.length) return null;
          return { kind: 'hbar', x: list.map(function (r) { return r['球员'] + (r['球队'] ? ' · ' + r['球队'] : ''); }),
            series: [{ name: '场均助攻', values: list.map(function (r) { return r['助攻']; }), color: C.palette().series[3] }],
            aria: '球员助攻前十排行' };
        } },
      { id: 'p-assist-dist', name: '助攻分布', desc: '球员场均助攻的区间人数分布', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('助攻') !== -1; },
        build: function (rows, ctx) {
          var h = hist(nums(rows, '助攻'), ctx.bins);
          if (!h.x.length) return null;
          return { kind: 'hist', x: h.x, series: [{ name: '球员数', values: h.counts, color: C.palette().series[3] }],
            yLabel: '球员数', xLabel: '场均助攻', aria: '球员助攻分布直方图' };
        } },
      { id: 'p-pos', name: '各位置平均得分', desc: '五个位置的得分产出对比', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('位置') !== -1 && p.indexOf('得分') !== -1; },
        build: function (rows, ctx) {
          var present = uniq(rows, '位置');
          var list = D.POSITIONS.filter(function (s) { return present.indexOf(s) !== -1; });
          present.forEach(function (s) { if (list.indexOf(s) === -1) list.push(s); });
          var m = meanBy(rows, '位置', '得分');
          var items = list.map(function (s) { return { label: s, value: round2(m[s] || 0) }; });
          if (ctx.sort !== 'default') items = order(items, ctx.sort);
          return { kind: 'bar', x: items.map(function (e) { return e.label; }),
            series: [{ name: '平均得分', values: items.map(function (e) { return e.value; }), color: C.palette().series[3] }],
            yLabel: '场均得分' };
        } },
      { id: 'p-box', name: '各位置得分分布', desc: '位置内得分的四分位与极值', kind: 'box', span: 6,
        when: function (p) { return p.indexOf('位置') !== -1 && p.indexOf('得分') !== -1; },
        build: function (rows) {
          var g = boxGroups(rows, '位置', '得分', D.POSITIONS);
          if (!g.length) return null;
          return { kind: 'box', groups: g, yLabel: '场均得分' };
        } },
      { id: 'p-hist', name: '得分分布', desc: '球员场均得分的频次分布', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('得分') !== -1; },
        build: function (rows, ctx) {
          var h = hist(nums(rows, '得分'), ctx.bins);
          if (!h.x.length) return null;
          return { kind: 'hist', x: h.x, series: [{ name: '球员数', values: h.counts, color: C.palette().series[0] }],
            yLabel: '球员数', xLabel: '场均得分' };
        } },
      { id: 'p-corr', name: '技术统计相关性', desc: '得分 / 助攻 / 篮板 / 命中率等的相关系数', kind: 'corr', span: 6,
        when: function (p) {
          return ['得分', '助攻', '篮板', '抢断', '盖帽', '出场时间'].filter(function (k) { return p.indexOf(k) !== -1; }).length >= 3;
        },
        build: function (rows, ctx) {
          var keys = ['得分', '助攻', '篮板', '抢断', '盖帽', '失误', '出场时间', '命中率'].filter(function (k) { return ctx.present.indexOf(k) !== -1; });
          return corrSpec(rows, keys, '球员技术统计相关性矩阵');
        } },
      { id: 'p-team', name: '球队平均得分', desc: '各球队球员的平均得分产出', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('球队') !== -1 && p.indexOf('得分') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(meanBy(rows, '球队', '得分')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          if (!list.length) return null;
          return { kind: 'bar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '平均得分', values: list.map(function (e) { return round2(e.value); }), color: C.palette().series[4] }],
            yLabel: '场均得分' };
        } },
      { id: 'p-band', name: '得分档占比', desc: '角色 / 轮换 / 主力 / 核心的构成', kind: 'donut', span: 4,
        when: function (p) { return p.indexOf('得分档') !== -1; },
        build: function (rows, ctx) {
          var present = uniq(rows, '得分档');
          var bands = D.SCORE_BANDS.filter(function (s) { return present.indexOf(s) !== -1; });
          present.forEach(function (s) { if (bands.indexOf(s) === -1) bands.push(s); });
          var c = countBy(rows, '得分档');
          var list = bands.map(function (s) { return { label: s, value: c[s] || 0 }; });
          if (ctx.sort !== 'default') list = order(list, ctx.sort);
          return { kind: 'donut', slices: list, center: { value: countStr(rows.length), label: '球员总数' } };
        } },
      { id: 'p-heat', name: '位置 × 球队得分', desc: '各球队每个位置的平均得分', kind: 'heat', span: 8,
        when: function (p) { return p.indexOf('位置') !== -1 && p.indexOf('球队') !== -1 && p.indexOf('得分') !== -1; },
        build: function (rows) {
          var present = uniq(rows, '位置');
          var pos = D.POSITIONS.filter(function (s) { return present.indexOf(s) !== -1; });
          present.forEach(function (s) { if (pos.indexOf(s) === -1) pos.push(s); });
          var teams = uniq(rows, '球队');
          if (!pos.length || !teams.length) return null;
          return { kind: 'heat', x: teams, y: pos, values: gridBy(rows, '球队', '位置', '得分', teams, pos, 'mean'),
            xLabel: '球队', aria: '位置与球队平均得分热力图' };
        } }
    ],
    movies: [
      { id: 'mv-hist', name: '评分分布', desc: '影片评分落在各区间的数量', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf('评分') !== -1; },
        build: function (rows, ctx) {
          var h = hist(nums(rows, '评分'), ctx.bins);
          if (!h.x.length) return null;
          return { kind: 'hist', x: h.x, series: [{ name: '影片数', values: h.counts, color: C.palette().series[5] }],
            yLabel: '影片数', xLabel: '评分' };
        } },
      { id: 'mv-year', name: '各年平均评分', desc: '按上映年份的评分走势', kind: 'line', span: 6,
        when: function (p) { return p.indexOf('上映年份') !== -1 && p.indexOf('评分') !== -1; },
        build: function (rows) {
          var years = uniq(rows, '上映年份').map(Number).filter(isFinite).sort(function (a, b) { return a - b; });
          if (years.length < 2) return null;
          var m = meanBy(rows, '上映年份', '评分');
          return { kind: 'line', x: years.map(String),
            series: [{ name: '平均评分', values: years.map(function (y) { return round2(m[y] || 0); }) }],
            zero: false, yLabel: '平均评分', xLabel: '上映年份', aria: '各年平均评分趋势' };
        } },
      { id: 'mv-genre', name: '类型平均评分', desc: '各类型影片的口碑排行', kind: 'hbar', span: 6,
        when: function (p) { return p.indexOf('类型') !== -1 && p.indexOf('评分') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(meanBy(rows, '类型', '评分')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          if (!list.length) return null;
          return { kind: 'hbar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '平均评分', values: list.map(function (e) { return round2(e.value); }), color: C.palette().series[0] }] };
        } },
      { id: 'mv-box', name: '各类型评分分布', desc: '类型内评分的四分位与极值', kind: 'box', span: 6,
        when: function (p) { return p.indexOf('类型') !== -1 && p.indexOf('评分') !== -1; },
        build: function (rows) {
          var present = uniq(rows, '类型');
          var genres = D.GENRES.filter(function (g) { return present.indexOf(g) !== -1; });
          present.forEach(function (g) { if (genres.indexOf(g) === -1) genres.push(g); });
          var g = boxGroups(rows, '类型', '评分', genres);
          if (!g.length) return null;
          return { kind: 'box', groups: g, yLabel: '评分' };
        } },
      { id: 'mv-pop', name: '评分 × 评分人数', desc: '按地区着色的口碑与热度', kind: 'scatter', span: 6,
        when: function (p) { return p.indexOf('评分') !== -1 && p.indexOf('评分人数') !== -1; },
        build: function (rows) {
          var groups = groupsBy(rows, '地区');
          var spec = scatterBy(rows, '评分', '评分人数', '地区', groups, '评分', '评分人数', 'sep');
          spec.aria = '评分与评分人数散点图';
          return spec;
        } },
      { id: 'mv-corr', name: '影片要素相关性', desc: '评分 / 热度 / 时长 / 年份 / 票房', kind: 'corr', span: 6,
        when: function (p) {
          return ['评分', '评分人数', '时长', '上映年份', '票房'].filter(function (k) { return p.indexOf(k) !== -1; }).length >= 3;
        },
        build: function (rows, ctx) {
          var keys = ['评分', '评分人数', '时长', '上映年份', '票房'].filter(function (k) { return ctx.present.indexOf(k) !== -1; });
          return corrSpec(rows, keys, '影片要素相关性矩阵');
        } },
      { id: 'mv-decade', name: '年代口碑构成', desc: '各年代影片的评分档堆叠', kind: 'stacked', span: 6,
        when: function (p) { return p.indexOf('年代') !== -1 && p.indexOf('评分档') !== -1; },
        build: function (rows) {
          var decades = decadeOrder(rows);
          var present = uniq(rows, '评分档');
          var bands = D.RATING_BANDS.filter(function (b) { return present.indexOf(b) !== -1; });
          present.forEach(function (b) { if (bands.indexOf(b) === -1) bands.push(b); });
          if (!decades.length || !bands.length) return null;
          var g = gridBy(rows, '年代', '评分档', null, decades, bands, 'count');
          return { kind: 'stacked', x: decades, series: bands.map(function (b, i) { return { name: b, values: g[i] }; }),
            fmt: 'sep', yLabel: '影片数' };
        } },
      { id: 'mv-region', name: '地区平均评分', desc: '各制片地区的口碑对比', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf('地区') !== -1 && p.indexOf('评分') !== -1; },
        build: function (rows, ctx) {
          var list = order(entries(meanBy(rows, '地区', '评分')), ctx.sort === 'default' ? 'desc' : ctx.sort);
          if (!list.length) return null;
          return { kind: 'bar', x: list.map(function (e) { return e.label; }),
            series: [{ name: '平均评分', values: list.map(function (e) { return round2(e.value); }), color: C.palette().series[6] }],
            yLabel: '平均评分' };
        } },
      { id: 'mv-band', name: '评分档占比', desc: '不及格到神作的影片构成', kind: 'donut', span: 4,
        when: function (p) { return p.indexOf('评分档') !== -1; },
        build: function (rows, ctx) {
          var present = uniq(rows, '评分档');
          var bands = D.RATING_BANDS.filter(function (b) { return present.indexOf(b) !== -1; });
          present.forEach(function (b) { if (bands.indexOf(b) === -1) bands.push(b); });
          var c = countBy(rows, '评分档');
          var list = bands.map(function (b) { return { label: b, value: c[b] || 0 }; });
          if (ctx.sort !== 'default') list = order(list, ctx.sort);
          return { kind: 'donut', slices: list, center: { value: countStr(rows.length), label: '影片总数' } };
        } },
      { id: 'mv-top', name: '高分影片 Top 12', desc: '评分最高的影片（同分按热度）', kind: 'hbar', span: 8,
        when: function (p) { return p.indexOf('片名') !== -1 && p.indexOf('评分') !== -1; },
        build: function (rows) {
          var list = rows.filter(function (r) { return typeof r['评分'] === 'number'; })
            .sort(function (a, b) { return b['评分'] - a['评分'] || (b['评分人数'] || 0) - (a['评分人数'] || 0); })
            .slice(0, 12);
          if (!list.length) return null;
          return { kind: 'hbar', x: list.map(function (r) { return r['片名'] + (r['上映年份'] ? '（' + r['上映年份'] + '）' : ''); }),
            series: [{ name: '评分', values: list.map(function (r) { return r['评分']; }), color: C.palette().series[1] }] };
        } }
    ]
  };

  /* ---------- KPI ---------- */

  var KPIS = {
    grades: function (rows, ctx) {
      var avg = nums(rows, '平均分');
      var subs = subjects(ctx.present);
      var failCount = 0, totalScores = 0;
      rows.forEach(function (r) {
        subs.forEach(function (s) {
          if (typeof r[s] !== 'number') return;
          totalScores++;
          if (r[s] < 60) failCount++;
        });
      });
      return [
        { label: '学生数', value: countStr(rows.length), sub: uniq(rows, '班级').length + ' 个班级' },
        { label: '总平均分', value: avg.length ? C.fmt(mean(avg)) : '—', sub: '满分 100' },
        { label: '挂科人次', value: countStr(failCount), sub: '低于 60 分', tone: failCount ? 'warn' : 'ok' },
        { label: '挂科率', value: totalScores ? C.fmt(failCount / totalScores * 100, 'pct') : '—', sub: '按科目人次计' },
        { label: '最高平均分', value: avg.length ? C.fmt(maxOf(avg)) : '—', sub: '个人最佳' }
      ];
    },
    library: function (rows) {
      var dur = nums(rows, '时长天数');
      var returned = rows.filter(function (r) { return r['借阅状态'] !== '在借'; }).length;
      var overdue = rows.filter(function (r) { return r['借阅状态'] === '超期'; }).length;
      var cats = order(catEntries(rows, '书籍分类'), 'desc');
      return [
        { label: '借阅次数', value: countStr(rows.length), sub: uniq(rows, '月份').length + ' 个月' },
        { label: '活跃读者', value: countStr(uniq(rows, '借阅人').length), sub: '去重借阅人' },
        { label: '平均借阅天数', value: dur.length ? C.fmt(mean(dur)) : '—', sub: '已归还记录' },
        { label: '超期率', value: returned ? C.fmt(overdue / returned * 100, 'pct') : '—', sub: '超过 30 天', tone: overdue ? 'warn' : 'ok' },
        { label: '最热门分类', value: cats.length ? cats[0].label : '—', sub: cats.length ? cats[0].value + ' 次' : '' }
      ];
    },
    attendance: function (rows) {
      var late = rows.filter(function (r) { return r['是否迟到'] === '是'; }).length;
      var amRows = rows.filter(function (r) { return r['时段'] === '早间'; });
      var mins = nums(amRows.length ? amRows : rows, '分钟');
      var lateStudents = {};
      rows.forEach(function (r) { if (r['是否迟到'] === '是' && r['学生']) lateStudents[r['学生']] = 1; });
      return [
        { label: '打卡次数', value: countStr(rows.length), sub: uniq(rows, '日期').length + ' 天' },
        { label: '迟到率', value: rows.length ? C.fmt(late / rows.length * 100, 'pct') : '—', sub: late + ' 次迟到', tone: late ? 'warn' : 'ok' },
        { label: amRows.length ? '早间平均打卡' : '平均打卡时刻', value: mins.length ? C.fmt(mean(mins), 'time') : '—',
          sub: amRows.length ? amRows.length + ' 次早间打卡' : '全部打卡' },
        { label: '涉及迟到学生', value: countStr(Object.keys(lateStudents).length), sub: '去重人数' },
        { label: '覆盖学生', value: countStr(uniq(rows, '学生').length), sub: '打卡名单' }
      ];
    },
    spending: function (rows) {
      var amounts = nums(rows, '金额');
      var total = sum(amounts);
      var days = uniq(rows, '日期').length;
      return [
        { label: '总消费', value: C.fmt(total, 'money'), sub: rows.length + ' 笔' },
        { label: '笔均消费', value: amounts.length ? C.fmt(total / amounts.length, 'money') : '—', sub: '平均每笔' },
        { label: '日均消费', value: days ? C.fmt(total / days, 'money') : '—', sub: days + ' 天' },
        { label: '最大单笔', value: amounts.length ? C.fmt(maxOf(amounts), 'money') : '—', sub: '单笔记账' },
        { label: '消费类型', value: countStr(uniq(rows, '消费类型').length), sub: '去重类别' }
      ];
    },
    iris: function (rows, ctx) {
      var pl = nums(rows, '花瓣长'), sl = nums(rows, '花萼长');
      var eta = ctx.present.indexOf('品种') !== -1 ? etaSquared(rows, '品种', '花瓣长') : null;
      return [
        { label: '样本数', value: countStr(rows.length), sub: uniq(rows, '品种').length + ' 个品种' },
        { label: '平均花瓣长', value: pl.length ? C.fmt(mean(pl)) : '—', sub: '单位 cm' },
        { label: '平均花萼长', value: sl.length ? C.fmt(mean(sl)) : '—', sub: '单位 cm' },
        { label: '花瓣长跨度', value: pl.length ? C.fmt(minOf(pl)) + ' – ' + C.fmt(maxOf(pl)) : '—', sub: '最小至最大' },
        { label: '品种区分度', value: eta == null ? '—' : C.fmt(eta * 100, 'pct'),
          sub: '花瓣长组间方差占比', tone: eta != null && eta >= 0.8 ? 'ok' : '' }
      ];
    },
    titanic: function (rows) {
      var alive = rows.filter(function (r) { return r['是否幸存'] === '是'; }).length;
      var female = rows.filter(function (r) { return r['性别'] === '女'; });
      var fAlive = female.filter(function (r) { return r['是否幸存'] === '是'; }).length;
      var ages = nums(rows, '年龄');
      var missing = rows.length - ages.length;
      var fares = nums(rows, '票价');
      return [
        { label: '乘客数', value: countStr(rows.length), sub: uniq(rows, '舱位').length + ' 个舱位等级' },
        { label: '总体生存率', value: rows.length ? C.fmt(alive / rows.length * 100, 'pct') : '—',
          sub: alive + ' 人幸存', tone: alive / Math.max(1, rows.length) < 0.5 ? 'warn' : 'ok' },
        { label: '女性生存率', value: female.length ? C.fmt(fAlive / female.length * 100, 'pct') : '—', sub: female.length + ' 位女性乘客' },
        { label: '平均年龄', value: ages.length ? C.fmt(mean(ages)) : '—', sub: missing ? missing + ' 条年龄缺失' : '年龄完整' },
        { label: '平均票价', value: fares.length ? C.fmt(mean(fares), 'money') : '—', sub: '全体乘客' }
      ];
    },
    housing: function (rows, ctx) {
      var prices = nums(rows, '房价'), units = nums(rows, '单价'), areas = nums(rows, '面积');
      var best = null;
      if (ctx.present.indexOf('单价') !== -1) {
        ['面积', '房间数', '房龄', '距市中心'].forEach(function (k) {
          if (ctx.present.indexOf(k) === -1) return;
          var r = pearson(rows, k, '单价');
          if (r == null) return;
          if (!best || Math.abs(r) > Math.abs(best.r)) best = { key: k, r: r };
        });
      }
      return [
        { label: '房源数', value: countStr(rows.length), sub: uniq(rows, '区位').length + ' 个区位' },
        { label: '平均总价', value: prices.length ? C.fmt(mean(prices), 'money') : '—', sub: '每套成交总价' },
        { label: '平均单价', value: units.length ? C.fmt(mean(units), 'sep') : '—', sub: '元 / ㎡' },
        { label: '平均面积', value: areas.length ? C.fmt(mean(areas)) : '—', sub: '建筑面积 ㎡' },
        { label: '最强相关特征', value: best ? best.key : '—',
          sub: best ? 'r = ' + (best.r > 0 ? '+' : '') + best.r.toFixed(2) + '（对单价）' : '需要更多字段' }
      ];
    },
    orders: function (rows) {
      var amounts = nums(rows, '金额');
      var total = sum(amounts);
      var days = uniq(rows, '日期').length;
      var refund = rows.filter(function (r) { return r['是否退款'] === '是'; }).length;
      var cats = order(catEntries(rows, '商品类别'), 'desc');
      return [
        { label: '订单数', value: countStr(rows.length), sub: days ? days + ' 天' : '单日' },
        { label: '总销售额', value: C.fmt(total, 'money'), sub: '含退款订单' },
        { label: '客单价', value: amounts.length ? C.fmt(total / amounts.length, 'money') : '—', sub: '平均每单' },
        { label: '退款率', value: rows.length ? C.fmt(refund / rows.length * 100, 'pct') : '—',
          sub: refund + ' 笔退款', tone: refund ? 'warn' : 'ok' },
        { label: '最畅销品类', value: cats.length ? cats[0].label : '—', sub: cats.length ? cats[0].value + ' 单' : '' }
      ];
    },
    weather: function (rows) {
      var temps = nums(rows, '平均气温'), rain = nums(rows, '降雨量');
      var rainy = rows.filter(function (r) { return r['降雨']; }).length;
      var hi = null;
      rows.forEach(function (r) {
        if (typeof r['最高温'] === 'number' && (!hi || r['最高温'] > hi.v)) hi = { v: r['最高温'], city: r['城市'], date: r['日期'] };
      });
      return [
        { label: '观测记录', value: countStr(rows.length),
          sub: uniq(rows, '城市').length + ' 个城市 · ' + uniq(rows, '日期').length + ' 天' },
        { label: '平均气温', value: temps.length ? mean(temps).toFixed(1) + '℃' : '—', sub: '日均气温的均值' },
        { label: '累计降水', value: rain.length ? C.fmt(sum(rain), 'sep') : '—', sub: '毫米（mm）' },
        { label: '降雨记录占比', value: rain.length ? C.fmt(rainy / rain.length * 100, 'pct') : '—',
          sub: rain.length ? rainy + ' / ' + rain.length + ' 条有效降水记录' : '需要降雨量字段', tone: rainy ? 'ok' : 'warn' },
        { label: '最高气温', value: hi ? hi.v.toFixed(1) + '℃' : '—',
          sub: hi ? (hi.city ? hi.city + ' · ' : '') + (hi.date || '') : '需要最高温字段' }
      ];
    },
    bikes: function (rows) {
      var cnt = nums(rows, '租借数量'), total = sum(cnt);
      var days = uniq(rows, '日期').length;
      var slots = order(entries(sumBy(rows, '时段', '租借数量')), 'desc');
      var peak = order(entries(sumBy(rows, '日期', '租借数量')), 'desc')[0];
      var sunny = nums(rows.filter(function (r) { return r['天气'] === '晴'; }), '租借数量');
      var wet = nums(rows.filter(function (r) { return r['天气'] === '小雨' || r['天气'] === '大雨'; }), '租借数量');
      var work = sum(nums(rows.filter(function (r) { return r['日期类型'] === '工作日'; }), '租借数量'));
      return [
        { label: '总租借量', value: C.fmt(total, 'sep'), sub: days ? days + ' 天 · 日均 ' + C.fmt(total / days, 'sep') : '单日汇总' },
        { label: '高峰时段', value: slots.length ? slots[0].label : '—',
          sub: slots.length && total ? C.fmt(slots[0].value / total * 100, 'pct') + ' 的租借量' : '' },
        { label: '单日峰值', value: peak ? C.fmt(peak.value, 'sep') : '—', sub: peak ? peak.label : '' },
        { label: '晴天小时均量', value: sunny.length ? C.fmt(mean(sunny), 'sep') : '—',
          sub: wet.length ? '雨天 ' + C.fmt(mean(wet), 'sep') : '无雨天记录', tone: 'ok' },
        { label: '工作日占比', value: total ? C.fmt(work / total * 100, 'pct') : '—', sub: '工作日租借量 / 总量' }
      ];
    },
    tea: function (rows) {
      var amounts = nums(rows, '金额'), total = sum(amounts);
      var units = nums(rows, '价格');
      var sold = sum(nums(rows, '数量'));
      var days = uniq(rows, '日期').length;
      var top = order(entries(sumBy(rows, '品类', '数量')), 'desc')[0];
      var peak = order(catEntries(rows, '时段'), 'desc')[0];
      return [
        { label: '订单数', value: countStr(rows.length), sub: days ? days + ' 天' : '单日' },
        { label: '营业额', value: C.fmt(total, 'money'), sub: days ? '日均 ' + C.fmt(total / days, 'money') : '' },
        { label: '客单价', value: amounts.length ? C.fmt(total / amounts.length, 'money') : '—', sub: '平均每单' },
        { label: '总销量', value: sold ? C.fmt(sold, 'sep') : '—',
          sub: units.length ? '均价 ' + C.fmt(mean(units), 'money') : '杯 / 份合计' },
        { label: '热销品类', value: top ? top.label : '—',
          sub: top ? top.value + ' 件' + (peak ? ' · 高峰 ' + peak.label : '') : '' }
      ];
    },
    players: function (rows) {
      var pts = nums(rows, '得分');
      var scorers = rows.filter(function (r) { return typeof r['得分'] === 'number'; })
        .sort(function (a, b) { return b['得分'] - a['得分']; });
      var passers = rows.filter(function (r) { return typeof r['助攻'] === 'number'; })
        .sort(function (a, b) { return b['助攻'] - a['助攻']; });
      var topP = scorers[0], topA = passers[0];
      var dd = rows.filter(function (r) { return r['两双']; }).length;
      return [
        { label: '球员数', value: countStr(rows.length), sub: uniq(rows, '球队').length + ' 支球队' },
        { label: '场均得分', value: pts.length ? mean(pts).toFixed(1) : '—', sub: '全部球员的平均' },
        { label: '得分王', value: topP && topP['球员'] ? topP['球员'] : '—',
          sub: topP ? topP['得分'] + ' 分' + (topP['球队'] ? ' · ' + topP['球队'] : '') : '' },
        { label: '助攻王', value: topA && topA['球员'] ? topA['球员'] : '—',
          sub: topA ? topA['助攻'] + ' 次' + (topA['球队'] ? ' · ' + topA['球队'] : '') : '' },
        { label: '两双人数', value: countStr(dd),
          sub: rows.length ? C.fmt(dd / rows.length * 100, 'pct') + ' 的球员' : '', tone: dd ? 'ok' : 'warn' }
      ];
    },
    movies: function (rows) {
      var scores = nums(rows, '评分');
      var box = nums(rows, '票房');
      var best = rows.filter(function (r) { return typeof r['评分'] === 'number'; })
        .sort(function (a, b) { return b['评分'] - a['评分']; })[0];
      var great = rows.filter(function (r) { return typeof r['评分'] === 'number' && r['评分'] >= 8.5; }).length;
      return [
        { label: '影片数', value: countStr(rows.length), sub: uniq(rows, '类型').length + ' 种类型' },
        { label: '平均评分', value: scores.length ? mean(scores).toFixed(2) : '—', sub: '满分 10 分' },
        { label: '最高评分', value: best ? best['评分'].toFixed(1) : '—', sub: best ? best['片名'] || '' : '' },
        { label: '神作占比', value: scores.length ? C.fmt(great / scores.length * 100, 'pct') : '—',
          sub: great + ' / ' + scores.length + ' 部有效评分 ≥ 8.5 分', tone: great ? 'ok' : 'warn' },
        { label: '平均票房', value: box.length ? C.fmt(mean(box), 'sep') : '—', sub: '万元 / 部' }
      ];
    }
  };

  /* ---------- 筛选 ---------- */

  var FILTERS = {
    grades: [
      { key: '班级', label: '班级', type: 'select', field: '班级', test: function (r, v) { return r['班级'] === v; } },
      { key: '性别', label: '性别', type: 'select', field: '性别', test: function (r, v) { return r['性别'] === v; } },
      { key: '仅挂科', label: '仅挂科', type: 'toggle', test: function (r) { return r['挂科门数'] > 0; } }
    ],
    library: [
      { key: '书籍分类', label: '分类', type: 'select', field: '书籍分类', test: function (r, v) { return r['书籍分类'] === v; } },
      { key: 'from', label: '起始', type: 'date', test: function (r, v) { return (r['借阅日期'] || '') >= v; } },
      { key: 'to', label: '截止', type: 'date', test: function (r, v) { return (r['借阅日期'] || '') <= v; } }
    ],
    attendance: [
      { key: '时段', label: '时段', type: 'select', field: '时段', test: function (r, v) { return r['时段'] === v; } },
      { key: '星期', label: '星期', type: 'select', field: '星期', test: function (r, v) { return r['星期'] === v; } },
      { key: '仅迟到', label: '仅迟到', type: 'toggle', test: function (r) { return r['是否迟到'] === '是'; } }
    ],
    spending: [
      { key: '消费类型', label: '类型', type: 'select', field: '消费类型', test: function (r, v) { return r['消费类型'] === v; } },
      { key: 'min', label: '最低金额', type: 'number', test: function (r, v) { return typeof r['金额'] === 'number' && r['金额'] >= v; } },
      { key: 'from', label: '起始', type: 'date', test: function (r, v) { return (r['日期'] || '') >= v; } },
      { key: 'to', label: '截止', type: 'date', test: function (r, v) { return (r['日期'] || '') <= v; } }
    ],
    iris: [
      { key: '品种', label: '品种', type: 'select', field: '品种', test: function (r, v) { return r['品种'] === v; } },
      { key: 'minPetal', label: '花瓣长下限', type: 'number', step: '0.1',
        test: function (r, v) { return typeof r['花瓣长'] === 'number' && r['花瓣长'] >= v; } },
      { key: 'minSepal', label: '花萼长下限', type: 'number', step: '0.1',
        test: function (r, v) { return typeof r['花萼长'] === 'number' && r['花萼长'] >= v; } }
    ],
    titanic: [
      { key: '舱位', label: '舱位', type: 'select', field: '舱位', test: function (r, v) { return r['舱位'] === v; } },
      { key: '性别', label: '性别', type: 'select', field: '性别', test: function (r, v) { return r['性别'] === v; } },
      { key: '登船港口', label: '港口', type: 'select', field: '登船港口', test: function (r, v) { return r['登船港口'] === v; } },
      { key: '仅幸存', label: '仅幸存', type: 'toggle', test: function (r) { return r['是否幸存'] === '是'; } }
    ],
    housing: [
      { key: '区位', label: '区位', type: 'select', field: '区位', test: function (r, v) { return r['区位'] === v; } },
      { key: '房间数', label: '居室', type: 'select', field: '房间数', test: function (r, v) { return String(r['房间数']) === v; } },
      { key: 'minUnit', label: '最低单价', type: 'number', step: '500',
        test: function (r, v) { return typeof r['单价'] === 'number' && r['单价'] >= v; } }
    ],
    orders: [
      { key: '商品类别', label: '品类', type: 'select', field: '商品类别', test: function (r, v) { return r['商品类别'] === v; } },
      { key: '地区', label: '地区', type: 'select', field: '地区', test: function (r, v) { return r['地区'] === v; } },
      { key: 'from', label: '起始', type: 'date', test: function (r, v) { return (r['日期'] || '') >= v; } },
      { key: 'to', label: '截止', type: 'date', test: function (r, v) { return (r['日期'] || '') <= v; } },
      { key: '仅退款', label: '仅退款', type: 'toggle', test: function (r) { return r['是否退款'] === '是'; } }
    ],
    weather: [
      { key: '城市', label: '城市', type: 'select', field: '城市', test: function (r, v) { return r['城市'] === v; } },
      { key: '季节', label: '季节', type: 'select', field: '季节', test: function (r, v) { return r['季节'] === v; } },
      { key: 'from', label: '起始', type: 'date', test: function (r, v) { return (r['日期'] || '') >= v; } },
      { key: 'to', label: '截止', type: 'date', test: function (r, v) { return (r['日期'] || '') <= v; } },
      { key: '仅降雨', label: '仅降雨', type: 'toggle', test: function (r) { return !!r['降雨']; } }
    ],
    bikes: [
      { key: '天气', label: '天气', type: 'select', field: '天气', test: function (r, v) { return r['天气'] === v; } },
      { key: '时段', label: '时段', type: 'select', field: '时段', test: function (r, v) { return r['时段'] === v; } },
      { key: '日期类型', label: '日期', type: 'select', field: '日期类型', test: function (r, v) { return r['日期类型'] === v; } },
      { key: 'from', label: '起始', type: 'date', test: function (r, v) { return (r['日期'] || '') >= v; } },
      { key: 'to', label: '截止', type: 'date', test: function (r, v) { return (r['日期'] || '') <= v; } }
    ],
    tea: [
      { key: '品类', label: '品类', type: 'select', field: '品类', test: function (r, v) { return r['品类'] === v; } },
      { key: '门店', label: '门店', type: 'select', field: '门店', test: function (r, v) { return r['门店'] === v; } },
      { key: '渠道', label: '渠道', type: 'select', field: '渠道', test: function (r, v) { return r['渠道'] === v; } },
      { key: 'from', label: '起始', type: 'date', test: function (r, v) { return (r['日期'] || '') >= v; } },
      { key: 'to', label: '截止', type: 'date', test: function (r, v) { return (r['日期'] || '') <= v; } }
    ],
    players: [
      { key: '球队', label: '球队', type: 'select', field: '球队', test: function (r, v) { return r['球队'] === v; } },
      { key: '位置', label: '位置', type: 'select', field: '位置', test: function (r, v) { return r['位置'] === v; } },
      { key: '得分档', label: '得分档', type: 'select', field: '得分档', test: function (r, v) { return r['得分档'] === v; } },
      { key: 'minPts', label: '最低得分', type: 'number', step: '1',
        test: function (r, v) { return typeof r['得分'] === 'number' && r['得分'] >= v; } }
    ],
    movies: [
      { key: '类型', label: '类型', type: 'select', field: '类型', test: function (r, v) { return r['类型'] === v; } },
      { key: '地区', label: '地区', type: 'select', field: '地区', test: function (r, v) { return r['地区'] === v; } },
      { key: '年代', label: '年代', type: 'select', field: '年代', test: function (r, v) { return r['年代'] === v; } },
      { key: 'minScore', label: '最低评分', type: 'number', step: '0.1',
        test: function (r, v) { return typeof r['评分'] === 'number' && r['评分'] >= v; } }
    ]
  };

  /* ---------- 状态 ---------- */

  var state = {
    dsId: null,
    source: 'builtin',
    rowsRaw: [],
    rowsAll: [],
    present: [],
    filters: {},
    sort: 'default',
    bins: 12,
    labels: false,
    charts: null,
    cards: {},
    clean: null,
    cleanReport: null,
    calc: [],
    custom: {},
    title: '',
    intro: ''
  };

  var uploads = [];
  try {
    var rawUp = localStorage.getItem('console.uploads');
    if (rawUp) uploads = JSON.parse(rawUp) || [];
  } catch (e) { uploads = []; }
  uploads.forEach(function (u) { if (!Array.isArray(u.rows)) u.rows = []; });

  /* 上传的数据行放 IndexedDB，localStorage 只保留元信息，避免大数据集超出配额 */
  var idb = null;
  var idbReady = new Promise(function (resolve) {
    if (!window.indexedDB) { resolve(false); return; }
    var req;
    try { req = window.indexedDB.open('analytics-console', 1); } catch (e) { resolve(false); return; }
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains('uploads')) db.createObjectStore('uploads');
    };
    req.onsuccess = function () { idb = req.result; resolve(true); };
    req.onerror = function () { resolve(false); };
    req.onblocked = function () { resolve(false); };
  });

  function idbRun(mode, action) {
    return idbReady.then(function (ok) {
      if (!ok) return null;
      return new Promise(function (resolve) {
        var tx;
        try { tx = idb.transaction('uploads', mode); } catch (e) { resolve(null); return; }
        var req = action(tx.objectStore('uploads'));
        tx.oncomplete = function () { resolve(req && req.result !== undefined ? req.result : true); };
        tx.onerror = function () { resolve(null); };
        tx.onabort = function () { resolve(null); };
      });
    });
  }

  function idbAllRows() {
    return idbReady.then(function (ok) {
      if (!ok) return {};
      return new Promise(function (resolve) {
        var tx = idb.transaction('uploads', 'readonly');
        var store = tx.objectStore('uploads');
        var keys = store.getAllKeys(), vals = store.getAll();
        tx.oncomplete = function () {
          var map = {};
          (keys.result || []).forEach(function (k, i) { map[k] = vals.result[i]; });
          resolve(map);
        };
        tx.onerror = function () { resolve({}); };
      });
    });
  }

  function saveUploads() {
    try {
      localStorage.setItem('console.uploads', JSON.stringify(uploads.map(function (u) {
        return { id: u.id, name: u.name, dsId: u.dsId, count: u.rows.length, present: u.present, createdAt: u.createdAt, size: u.size };
      })));
      return true;
    } catch (e) {
      toast('数据源列表超出浏览器存储上限，刷新后需重新上传', 'warn');
      return false;
    }
  }

  function persistRows(u) {
    return idbRun('readwrite', function (store) { return store.put(u.rows, u.id); }).then(function (ok) {
      if (!ok) toast('数据已载入，但本浏览器无法持久保存大文件，刷新后需重新上传', 'warn');
      return ok;
    });
  }

  idbAllRows().then(function (map) {
    var touched = false;
    uploads.forEach(function (u) {
      if (Array.isArray(map[u.id]) && map[u.id].length) { u.rows = map[u.id]; touched = true; }
    });
    if (!touched || !state.dsId || state.source === 'builtin') return;
    state.rowsRaw = sourceRows(state.dsId, state.source);
    rebuildRows();
    buildSourceSelect();
    buildFilters();
    render(false);
  });

  function stateKey() { return 'console.dash.' + state.dsId; }

  function saveState() {
    if (!state.dsId) return;
    try {
      localStorage.setItem(stateKey(), JSON.stringify({
        source: state.source, charts: state.charts, filters: state.filters,
        sort: state.sort, bins: state.bins, labels: state.labels,
        clean: state.clean, calc: state.calc, custom: state.custom,
        title: state.title, intro: state.intro
      }));
    } catch (e) {}
  }

  function loadState(dsId) {
    var s = null;
    try { s = JSON.parse(localStorage.getItem('console.dash.' + dsId) || 'null'); } catch (e) {}
    return s || {};
  }

  function sourceRows(dsId, source) {
    if (source === 'builtin') return D.seed(dsId);
    var up = uploads.filter(function (u) { return u.id === source; })[0];
    return up ? up.rows : D.seed(dsId);
  }

  function sourceName(dsId, source) {
    if (source === 'builtin') return '内置示例数据';
    var up = uploads.filter(function (u) { return u.id === source; })[0];
    return up ? up.name : '内置示例数据';
  }

  /* ---------- 通用 UI ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  var TOAST_ICON = {
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.2"/>',
    err: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.2"/>'
  };

  function toast(msg, kind, action) {
    kind = kind || 'info';
    var el = document.createElement('div');
    el.className = 'toast toast--' + kind;
    el.setAttribute('role', 'status');
    el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (TOAST_ICON[kind] || TOAST_ICON.info) + '</svg>' +
      '<span class="toast__msg"></span>' +
      (action ? '<button class="toast__act" type="button"></button>' : '') +
      '<button class="toast__x" type="button" aria-label="关闭提示"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    el.querySelector('.toast__msg').textContent = msg;
    if (action) {
      var act = el.querySelector('.toast__act');
      act.textContent = action.label;
      act.addEventListener('click', function () { action.fn(); dismiss(); });
    }
    function dismiss() {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 260);
    }
    el.querySelector('.toast__x').addEventListener('click', dismiss);
    toasts.appendChild(el);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(dismiss, action ? 7000 : 4200);
  }

  /* ---------- 模态 ---------- */

  var openModal = null;
  var lastFocus = null;

  function showModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    lastFocus = document.activeElement;
    el.hidden = false;
    openModal = id;
    document.body.classList.add('modal-open');
    var focusTarget = el.querySelector('[data-autofocus]') || el.querySelector('button, input, select');
    if (focusTarget) focusTarget.focus();
  }

  function hideModal(id) {
    var el = document.getElementById(id || openModal);
    if (!el) return;
    el.hidden = true;
    if (openModal === (id || openModal)) openModal = null;
    document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('keydown', function (e) {
    if (!openModal) return;
    var panel = document.querySelector('#' + openModal + ' .modal__panel');
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideModal();
      return;
    }
    if (e.key === 'Tab' && panel) {
      var items = Array.prototype.filter.call(
        panel.querySelectorAll('button:not([hidden]), input:not([hidden]), select, [tabindex="0"]'),
        function (el) { return el.offsetParent !== null && !el.disabled; }
      );
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      e.stopPropagation();
      return;
    }
    if (['[', '/', 'g', 't', 'G', 'T'].indexOf(e.key) !== -1) {
      var t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.stopPropagation();
    }
  }, true);

  document.addEventListener('click', function (e) {
    var closer = e.target.closest('[data-close]');
    if (closer) hideModal(closer.getAttribute('data-close'));
  });

  /* ---------- 图表选择器 ---------- */

  function suitableCharts() {
    var defs = (CHARTS[state.dsId] || []).concat(calcChartDefs());
    return defs.filter(function (def) { return def.when(state.present); });
  }

  function pickerSeenKey() { return 'console.picker.' + state.dsId + '.' + state.source; }

  function openPicker() {
    var defs = suitableCharts();
    var gridEl = document.getElementById('picker-grid');
    var selected = state.charts ? state.charts.slice() : defs.map(function (d) { return d.id; });
    document.getElementById('picker-title').textContent = headTitle.textContent;
    document.getElementById('picker-sub').textContent =
      sourceName(state.dsId, state.source) + ' · ' + state.rowsAll.length + ' 行 · 依据字段适配出 ' + defs.length + ' 种图表';
    var fieldsEl = document.getElementById('picker-fields');
    fieldsEl.innerHTML = '<span class="picker__fields-label">识别字段</span>' +
      state.present.map(function (k) { return '<span class="chip">' + esc(k) + '</span>'; }).join('');
    gridEl.innerHTML = '';
    defs.forEach(function (def) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'picker-opt';
      btn.setAttribute('role', 'checkbox');
      btn.setAttribute('aria-checked', String(selected.indexOf(def.id) !== -1));
      btn.dataset.id = def.id;
      btn.innerHTML = '<span class="picker-opt__icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + KIND_ICON[def.kind] + '</svg></span>' +
        '<span class="picker-opt__body"><span class="picker-opt__name">' + esc(def.name) + '</span>' +
        '<span class="picker-opt__desc">' + esc(def.desc) + '</span></span>' +
        '<span class="picker-opt__kind">' + KIND_LABEL[def.kind] + '</span>' +
        '<span class="picker-opt__check"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
      btn.addEventListener('click', function () {
        var on = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(on));
        if (on) { if (selected.indexOf(def.id) === -1) selected.push(def.id); }
        else selected = selected.filter(function (x) { return x !== def.id; });
        syncPickerCount();
      });
      gridEl.appendChild(btn);
    });
    function syncPickerCount() {
      document.getElementById('picker-count').textContent = '已选 ' + selected.length + ' / ' + defs.length;
      document.getElementById('picker-apply').disabled = selected.length === 0;
    }
    syncPickerCount();
    document.getElementById('picker-all').onclick = function () {
      selected = defs.map(function (d) { return d.id; });
      gridEl.querySelectorAll('.picker-opt').forEach(function (b) { b.setAttribute('aria-checked', 'true'); });
      syncPickerCount();
    };
    document.getElementById('picker-none').onclick = function () {
      selected = [];
      gridEl.querySelectorAll('.picker-opt').forEach(function (b) { b.setAttribute('aria-checked', 'false'); });
      syncPickerCount();
    };
    document.getElementById('picker-skip').onclick = function () {
      state.charts = null;
      saveState();
      try { localStorage.setItem(pickerSeenKey(), '1'); } catch (e) {}
      hideModal('picker');
      render(true);
      toast('已跳过选择，显示全部 ' + defs.length + ' 种图表', 'ok');
    };
    document.getElementById('picker-apply').onclick = function () {
      if (!selected.length) return;
      state.charts = selected.length === defs.length ? null : selected;
      saveState();
      try { localStorage.setItem(pickerSeenKey(), '1'); } catch (e) {}
      hideModal('picker');
      render(true);
      toast(state.charts ? '已生成 ' + selected.length + ' 个图表' : '已显示全部 ' + defs.length + ' 种图表', 'ok');
    };
    showModal('picker');
  }

  /* ---------- 上传 ---------- */

  var pendingUpload = null;

  function openUpload() {
    pendingUpload = null;
    hideProgress();
    document.getElementById('upload-choose').hidden = false;
    document.getElementById('upload-preview').hidden = true;
    document.getElementById('upload-error').hidden = true;
    document.getElementById('upload-hint').textContent = D.SCHEMAS[state.dsId].hint;
    showModal('upload');
  }

  function humanSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function decodeText(buf) {
    var b = new Uint8Array(buf);
    if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'UTF-16 LE' };
    if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'UTF-16 BE' };
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'UTF-8' }; } catch (e) {}
    try { return { text: new TextDecoder('gbk', { fatal: true }).decode(b), encoding: 'GBK' }; } catch (e) {}
    return null;
  }

  function setProgress(done, total, label) {
    document.getElementById('upload-progress').hidden = false;
    document.getElementById('upload-progress-fill').style.width = (total ? Math.round(done / total * 100) : 8) + '%';
    document.getElementById('upload-progress-text').textContent = label || ('解析中 · ' + done.toLocaleString('en-US') + ' / ' + total.toLocaleString('en-US') + ' 行');
  }

  function hideProgress() { document.getElementById('upload-progress').hidden = true; }

  function handleFile(file) {
    if (!file) return;
    if (file.size > D.MAX_FILE_BYTES) {
      uploadError('文件超过 64 MB 上限，请拆分后再上传');
      return;
    }
    document.getElementById('upload-error').hidden = true;
    setProgress(0, 0, '读取文件…');
    var reader = new FileReader();
    reader.onload = function () {
      var decoded = decodeText(reader.result);
      if (!decoded) {
        hideProgress();
        uploadError('无法识别文件编码（支持 UTF-8 / GBK / UTF-16），请另存为 UTF-8 后重试');
        return;
      }
      setProgress(0, 0, '解析数据…');
      D.parseChunked(decoded.text, file.name, function (done, total) { setProgress(done, total); }).then(function (parsed) {
        if (parsed.error) { hideProgress(); uploadError(parsed.error); return; }
        setProgress(0, 0, '匹配字段并归一化…');
        D.yieldTask(function () {
          var norm = D.normalize(state.dsId, parsed);
          hideProgress();
          if (norm.error) {
            uploadError(norm.error + '（已识别表头：' + (norm.headers || parsed.headers).join('、') + '）');
            return;
          }
          pendingUpload = { file: file, norm: norm, format: parsed.format, encoding: decoded.encoding };
          renderUploadPreview();
        });
      });
    };
    reader.onerror = function () { hideProgress(); uploadError('文件读取失败，请重试'); };
    reader.readAsArrayBuffer(file);
  }

  function uploadError(msg) {
    var el = document.getElementById('upload-error');
    el.textContent = msg;
    el.hidden = false;
    toast(msg, 'err');
  }

  function renderUploadPreview() {
    var up = pendingUpload;
    document.getElementById('upload-choose').hidden = true;
    document.getElementById('upload-preview').hidden = false;
    document.getElementById('upload-error').hidden = true;
    var schema = D.SCHEMAS[state.dsId];
    document.getElementById('upload-file-meta').textContent =
      up.file.name + ' · ' + humanSize(up.file.size) + ' · ' + up.format +
      (up.encoding && up.encoding !== 'UTF-8' ? ' · ' + up.encoding + ' 编码' : '') +
      ' · ' + up.norm.rows.length.toLocaleString('en-US') + ' 行有效数据' +
      (up.norm.dropped ? ' · 忽略 ' + up.norm.dropped + ' 行空记录' : '') +
      (up.norm.truncated ? ' · 超出 30 万行上限，已截取前 30 万行' : '');
    var mapEl = document.getElementById('upload-map');
    var HOW = { fuzzy: '模糊匹配', content: '按内容识别', datepart: '取日期部分', timepart: '取时间部分', split: '共用该列' };
    var how = up.norm.matchHow || {};
    var derived = D.presentKeys(state.dsId, up.norm.rows);
    mapEl.innerHTML = schema.columns.map(function (col) {
      var header = up.norm.mapped[col.key];
      if (!header) {
        return derived.indexOf(col.key) !== -1
          ? '<span class="chip chip--auto">' + esc(col.key) + '<em>自动计算</em></span>'
          : '<span class="chip chip--miss">' + esc(col.key) + ' 未提供</span>';
      }
      var tag = HOW[how[col.key]];
      return '<span class="chip chip--ok">' + esc(col.key) + ' ← ' + esc(header) +
        (tag ? '<em>' + tag + '</em>' : '') + '</span>';
    }).join('') + (up.norm.unused && up.norm.unused.length
      ? '<p class="upload__note">未使用的列：' + up.norm.unused.map(esc).join('、') + '</p>'
      : '');
    var cols = schema.columns.filter(function (c) { return up.norm.mapped[c.key]; });
    var preview = up.norm.rows.slice(0, 6);
    var table = '<table class="mini-table"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c.key) + '</th>'; }).join('') + '</tr></thead><tbody>';
    preview.forEach(function (r) {
      table += '<tr>' + cols.map(function (c) {
        var v = r[c.key];
        if (c.type === 'time' && typeof v === 'number' && isFinite(v)) {
          v = ('0' + Math.floor(v / 60)).slice(-2) + ':' + ('0' + Math.floor(v % 60)).slice(-2);
        }
        return '<td>' + esc(v == null ? '' : v) + '</td>';
      }).join('') + '</tr>';
    });
    table += '</tbody></table>';
    document.getElementById('upload-table').innerHTML = table;
    var nameInput = document.getElementById('upload-name');
    nameInput.value = up.file.name.replace(/\.[^.]+$/, '');
    nameInput.focus();
    nameInput.select();
  }

  function applySource(id, autoPicker) {
    state.source = id;
    state.rowsRaw = sourceRows(state.dsId, id);
    state.filters = {};
    state.charts = null;
    rebuildRows();
    saveState();
    buildSourceSelect();
    buildFilters();
    render(true);
    if (autoPicker) maybeAutoPicker();
  }

  function confirmUpload() {
    if (!pendingUpload) return;
    var name = document.getElementById('upload-name').value.trim() || pendingUpload.file.name;
    var id = 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    var record = {
      id: id, name: name, dsId: state.dsId,
      rows: pendingUpload.norm.rows,
      present: D.presentKeys(state.dsId, pendingUpload.norm.rows),
      createdAt: new Date().toISOString(),
      size: pendingUpload.file.size
    };
    uploads.push(record);
    saveUploads();
    persistRows(record);
    hideModal('upload');
    applySource(id, true);
    toast('已载入「' + name + '」' + record.rows.length + ' 行数据', 'ok');
  }

  function uploadCount(u) { return u.rows.length || u.count || 0; }

  function buildSourceSelect() {
    var opts = ['<option value="builtin">内置示例数据</option>'];
    uploads.filter(function (u) { return u.dsId === state.dsId; }).forEach(function (u) {
      opts.push('<option value="' + esc(u.id) + '">' + esc(u.name) + '（' + uploadCount(u) + ' 行）</option>');
    });
    srcSelect.innerHTML = opts.join('');
    srcSelect.value = state.source;
    if (srcSelect.value !== state.source) {
      state.source = 'builtin';
      srcSelect.value = 'builtin';
    }
  }

  function openSources() {
    var body = document.getElementById('sources-body');
    var mine = uploads.filter(function (u) { return u.dsId === state.dsId; });
    var html = '<div class="source-row source-row--builtin">' +
      '<div class="source-row__body"><strong>内置示例数据</strong>' +
      '<span>' + D.seed(state.dsId).length + ' 行 · 本地生成的演示记录</span></div>' +
      '<button class="ghost-btn" type="button" data-use="builtin">使用</button></div>';
    if (!mine.length) {
      html += '<p class="sources-empty">还没有上传的数据文件。支持 CSV / TSV / JSON，表头可对照字段模板。</p>';
    }
    mine.forEach(function (u) {
      html += '<div class="source-row" data-id="' + esc(u.id) + '">' +
        '<div class="source-row__body"><strong>' + esc(u.name) + '</strong>' +
        '<span>' + uploadCount(u) + ' 行 · ' + humanSize(u.size || 0) + ' · ' + String(u.createdAt || '').slice(0, 10) + '</span></div>' +
        '<button class="ghost-btn" type="button" data-use="' + esc(u.id) + '">使用</button>' +
        '<button class="ghost-btn ghost-btn--danger" type="button" data-del="' + esc(u.id) + '">删除</button></div>';
    });
    body.innerHTML = html;
    showModal('sources');
  }

  document.getElementById('sources-body').addEventListener('click', function (e) {
    var use = e.target.closest('[data-use]');
    var del = e.target.closest('[data-del]');
    if (use) {
      hideModal('sources');
      applySource(use.getAttribute('data-use'), true);
      return;
    }
    if (del) {
      var id = del.getAttribute('data-del');
      var idx = -1;
      uploads.forEach(function (u, i) { if (u.id === id) idx = i; });
      if (idx === -1) return;
      var removed = uploads.splice(idx, 1)[0];
      saveUploads();
      idbRun('readwrite', function (store) { return store.delete(id); });
      if (state.source === id) {
        applySource('builtin', false);
      }
      openSources();
      toast('已删除「' + removed.name + '」', 'warn', {
        label: '撤销',
        fn: function () {
          uploads.splice(Math.min(idx, uploads.length), 0, removed);
          saveUploads();
          persistRows(removed);
          buildSourceSelect();
          openSources();
          toast('已恢复「' + removed.name + '」', 'ok');
        }
      });
    }
  });

  /* ---------- 筛选控件 ---------- */

  function buildFilters() {
    var defs = allFilterDefs();
    filtersBox.innerHTML = '';
    defs.forEach(function (def) {
      if (def.type === 'select' && state.present.indexOf(def.field) === -1) return;
      var wrap = document.createElement('label');
      wrap.className = 'ctl';
      var lab = document.createElement('span');
      lab.className = 'ctl__label';
      lab.textContent = def.label;
      wrap.appendChild(lab);
      if (def.type === 'select') {
        var sel = document.createElement('select');
        sel.className = 'ctl__input';
        sel.dataset.key = def.key;
        var values = def.field === '年代' ? decadeOrder(state.rowsAll) : uniq(state.rowsAll, def.field);
        sel.innerHTML = '<option value="">全部</option>' + values.map(function (v) {
          return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
        }).join('');
        sel.value = state.filters[def.key] || '';
        sel.addEventListener('change', function () {
          state.filters[def.key] = sel.value;
          saveState();
          render(false);
        });
        wrap.appendChild(sel);
      } else if (def.type === 'date') {
        var inp = document.createElement('input');
        inp.type = 'date';
        inp.className = 'ctl__input';
        inp.value = state.filters[def.key] || '';
        inp.addEventListener('change', function () {
          state.filters[def.key] = inp.value;
          saveState();
          render(false);
        });
        wrap.appendChild(inp);
      } else if (def.type === 'number') {
        var num = document.createElement('input');
        num.type = 'number';
        num.min = def.min != null ? def.min : '0';
        num.step = def.step || '1';
        num.placeholder = '0';
        num.className = 'ctl__input ctl__input--num';
        num.value = state.filters[def.key] || '';
        num.addEventListener('input', function () {
          state.filters[def.key] = num.value;
          saveState();
          render(false);
        });
        wrap.appendChild(num);
      } else {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ctl__toggle';
        btn.setAttribute('aria-pressed', String(!!state.filters[def.key]));
        btn.textContent = def.label;
        btn.addEventListener('click', function () {
          state.filters[def.key] = !state.filters[def.key];
          btn.setAttribute('aria-pressed', String(state.filters[def.key]));
          saveState();
          render(false);
        });
        wrap.appendChild(btn);
        wrap.classList.add('ctl--toggle');
      }
      filtersBox.appendChild(wrap);
    });
  }

  function filteredRows() {
    var defs = allFilterDefs();
    return state.rowsAll.filter(function (r) {
      return defs.every(function (def) {
        var v = state.filters[def.key];
        if (v == null || v === '' || v === false) return true;
        if (def.type === 'toggle') return v ? def.test(r) : true;
        if (def.type === 'number') return def.test(r, Number(v));
        return def.test(r, v);
      });
    });
  }

  /* ---------- 清洗 / 计算字段 / 图表自定义 ---------- */

  function schemaCols() {
    var schema = D.SCHEMAS[state.dsId];
    if (!schema) return [];
    var rawPresent = D.presentKeys(state.dsId, state.rowsRaw);
    return schema.columns.filter(function (c) { return rawPresent.indexOf(c.key) !== -1; });
  }

  function calcNames() { return state.calc.map(function (f) { return f.name; }); }

  function rebuildRows() {
    var rows = state.rowsRaw;
    state.cleanReport = null;
    if (state.clean && !window.Clean.isDefault(state.clean)) {
      var res = window.Clean.apply(rows, schemaCols(), state.clean);
      rows = res.rows;
      state.cleanReport = res.report;
    }
    if (state.calc.length) {
      rows = window.Calc.evaluate(rows, state.calc, D.presentKeys(state.dsId, rows)).rows;
    }
    state.rowsAll = rows;
    var present = D.presentKeys(state.dsId, rows);
    calcNames().forEach(function (n) { if (present.indexOf(n) === -1) present.push(n); });
    state.present = present;
  }

  function calcFilterDefs() {
    return state.calc.map(function (f, i) {
      return {
        key: 'calc' + i, label: f.name + ' ≥', type: 'number', field: f.name, step: 'any', min: '',
        test: function (r, v) { return typeof r[f.name] === 'number' && r[f.name] >= v; }
      };
    });
  }

  function allFilterDefs() { return (FILTERS[state.dsId] || []).concat(calcFilterDefs()); }

  function preferredGroup() {
    var cols = schemaCols();
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].type !== 'cat' && cols[i].type !== 'bool') continue;
      var u = uniq(state.rowsAll, cols[i].key);
      if (u.length > 1 && u.length <= 24) return cols[i].key;
    }
    return null;
  }

  function calcChartDefs() {
    var out = [], groupKey = preferredGroup();
    state.calc.forEach(function (f, i) {
      out.push({
        id: 'calc-hist-' + i, name: f.name + ' 分布', desc: '计算字段「' + f.name + '」的区间分布', kind: 'hist', span: 6,
        when: function (p) { return p.indexOf(f.name) !== -1; },
        build: function (rows, ctx) {
          var vals = nums(rows, f.name);
          if (!vals.length) return null;
          var h = hist(vals, ctx.bins);
          return { kind: 'hist', x: h.x, series: [{ name: '记录数', values: h.counts }], yLabel: '记录数', xLabel: f.name, aria: f.name + ' 分布直方图' };
        }
      });
      if (!groupKey) return;
      out.push({
        id: 'calc-group-' + i, name: f.name + ' 分组均值', desc: '按' + groupKey + '对比「' + f.name + '」的平均值', kind: 'bar', span: 6,
        when: function (p) { return p.indexOf(f.name) !== -1 && p.indexOf(groupKey) !== -1; },
        build: function (rows, ctx) {
          var gs = uniq(rows, groupKey);
          if (!gs.length) return null;
          var list = order(gs.map(function (g) {
            return { label: g, value: mean(nums(rows.filter(function (r) { return r[groupKey] === g; }), f.name)) };
          }), ctx.sort);
          return {
            kind: 'bar', x: list.map(function (e) { return e.label; }), yLabel: f.name + ' 均值',
            series: [{ name: f.name + ' 均值', values: list.map(function (e) { return round2(e.value); }) }]
          };
        }
      });
    });
    return out;
  }

  function customOf(id) { return state.custom[id] || {}; }

  function chartOpts(id, animate) {
    var cu = customOf(id);
    return {
      labels: cu.labels != null ? cu.labels : state.labels,
      grid: cu.grid !== false,
      colors: cu.scheme && cu.scheme !== 'theme' ? C.schemeColors(cu.scheme, cu.color) : null,
      animate: !!animate
    };
  }

  function drawCard(rec, animate) {
    if (rec.tableView) return;
    var out = C.render(rec.host, rec.spec, chartOpts(rec.def.id, animate));
    rec.legendEl.innerHTML = out.legend.map(function (l) {
      return '<span class="legend-item"><i style="background:' + l.color + '"></i>' + esc(l.name) + '</span>';
    }).join('');
    rec.legendEl.hidden = out.legend.length === 0 || customOf(rec.def.id).legend === false;
  }

  /* ---------- 渲染 ---------- */

  function tableFor(spec) {
    var cols, rows = [];
    if (spec.kind === 'donut') {
      var total = spec.slices.reduce(function (a, s) { return a + Number(s.value); }, 0);
      cols = ['类别', '数值', '占比'];
      rows = spec.slices.map(function (s) {
        return [s.label, C.fmt(s.value, spec.fmt), (total ? Math.round(s.value / total * 1000) / 10 : 0) + '%'];
      });
    } else if (spec.kind === 'scatter') {
      cols = [spec.xLabel || 'x', spec.yLabel || 'y', '分组'];
      rows = spec.points.slice(0, 400).map(function (d) {
        return [C.fmt(d.x, spec.xFmt), C.fmt(d.y, spec.fmt), (spec.groups[d.g || 0] || {}).name || ''];
      });
    } else if (spec.kind === 'box') {
      cols = ['组', '最小', 'Q1', '中位数', 'Q3', '最大', '样本'];
      rows = spec.groups.map(function (g) {
        return [g.label, C.fmt(g.min, spec.fmt), C.fmt(g.q1, spec.fmt), C.fmt(g.med, spec.fmt), C.fmt(g.q3, spec.fmt), C.fmt(g.max, spec.fmt), g.n];
      });
    } else if (spec.kind === 'heat') {
      cols = [''].concat(spec.x);
      rows = spec.y.map(function (y, i) { return [y].concat(spec.values[i].map(function (v) { return C.fmt(v, spec.fmt); })); });
    } else if (spec.kind === 'corr') {
      cols = ['r'].concat(spec.x);
      rows = spec.y.map(function (y, i) {
        return [y].concat(spec.values[i].map(function (v) { return (v > 0 ? '+' : '') + Number(v).toFixed(2); }));
      });
    } else {
      cols = ['类别'].concat(spec.series.map(function (s) { return s.name; }));
      rows = spec.x.map(function (lab, i) {
        return [lab].concat(spec.series.map(function (s) { return C.fmt(Number(s.values[i]) || 0, spec.fmt); }));
      });
    }
    return { columns: cols, rows: rows };
  }

  function renderTable(host, table) {
    var html = '<table class="mini-table"><thead><tr>' + table.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
    table.rows.forEach(function (r) {
      html += '<tr>' + r.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>';
    });
    html += '</tbody></table>';
    host.innerHTML = html;
  }

  var resizeObserver = window.ResizeObserver ? new ResizeObserver(function (entries) {
    entries.forEach(function (entry) {
      var host = entry.target;
      var card = host.closest('.card');
      if (!card) return;
      var rec = state.cards[card.dataset.chart];
      if (!rec || rec.tableView || !rec.spec) return;
      clearTimeout(host._rt);
      host._rt = setTimeout(function () {
        if (host.clientWidth > 0 && host.clientHeight > 0) drawCard(rec, false);
      }, 120);
    });
  }) : null;

  var tabletQuery = window.matchMedia ? window.matchMedia('(max-width: 899px)') : null;
  if (tabletQuery) {
    var onTablet = function () { if (state.dsId) render(false); };
    if (tabletQuery.addEventListener) tabletQuery.addEventListener('change', onTablet);
    else if (tabletQuery.addListener) tabletQuery.addListener(onTablet);
  }

  function render(animate) {
    if (!state.dsId) return;
    var rows = filteredRows();
    colBegin(rows);
    var defs = suitableCharts();
    var chosen = state.charts ? defs.filter(function (d) { return state.charts.indexOf(d.id) !== -1; }) : defs;

    var catName = (window.Catalog && window.Catalog.categoryOf(state.dsId)) || '数据集';
    document.getElementById('dash-eyebrow').textContent = catName + ' · 看板';
    var cr = state.cleanReport;
    var cleanNote = cr && (cr.removed || cr.filled || cr.clipped || cr.deduped || cr.trimmed)
      ? ' · 已清洗（移除 ' + cr.removed + ' 行 / 填充 ' + cr.filled + ' 处）' : '';
    headMeta.textContent = catName + ' · ' + sourceName(state.dsId, state.source) + ' · ' +
      rows.length.toLocaleString('en-US') + ' / ' + state.rowsAll.length.toLocaleString('en-US') + ' 行 · ' + state.present.length + ' 个字段' +
      cleanNote +
      (state.calc.length ? ' · ' + state.calc.length + ' 个计算字段' : '') +
      (state.source === 'builtin' ? ' · 演示数据由本地生成' : '');

    var kpiList = KPIS[state.dsId](rows, { present: state.present });
    kpis.innerHTML = kpiList.map(function (k, i) {
      return '<div class="kpi" style="--hue:var(--c-series-' + ((i % 8) + 1) + ')">' +
        '<span class="kpi__label">' + esc(k.label) + '</span>' +
        '<strong class="kpi__value' + (k.tone === 'warn' ? ' kpi__value--warn' : '') + '">' + esc(k.value) + '</strong>' +
        '<span class="kpi__sub">' + esc(k.sub || '') + '</span></div>';
    }).join('');

    grid.innerHTML = '';
    state.cards = {};
    if (!rows.length) {
      grid.innerHTML = '<div class="dash-empty"><p>当前筛选下没有数据</p>' +
        '<button class="ghost-btn" type="button" id="dash-empty-reset">清除筛选</button></div>';
      var rb = document.getElementById('dash-empty-reset');
      if (rb) rb.addEventListener('click', resetView);
      foot.textContent = '共 ' + chosen.length + ' 种可用图表 · 数据仅保存在本浏览器';
      return;
    }

    var built = [];
    chosen.forEach(function (def) {
      var spec = def.build(rows, { present: state.present, bins: state.bins, sort: state.sort, labels: state.labels });
      if (spec) built.push({ def: def, spec: spec, span: Math.min(12, customOf(def.id).span || def.span) });
    });

    var used = 0;
    built.forEach(function (b, i) {
      if (used && used + b.span > 12) used = 0;
      used += b.span;
      var next = built[i + 1];
      var rowEnd = !next || used + next.span > 12;
      if (rowEnd && used < 12) { b.span += 12 - used; used = 12; }
      b.emit = b.span;
    });

    if (tabletQuery && tabletQuery.matches) {
      var half = function (s) { return s === 4 || s === 8; };
      var u = 0;
      built.forEach(function (b, i) {
        var units = half(b.span) ? 3 : 6;
        if (u && u + units > 6) u = 0;
        u += units;
        var next = built[i + 1];
        if (!next || u + (half(next.span) ? 3 : 6) > 6) {
          if (u < 6) b.emit = 12;
          u = 0;
        }
      });
    }

    built.forEach(function (b, idx) {
      var def = b.def, spec = b.spec;
      var cu = customOf(def.id);
      var cardName = cu.title || def.name;
      var cardDesc = cu.desc != null && cu.desc !== '' ? cu.desc : def.desc;
      spec.title = cardName;
      var article = document.createElement('article');
      article.className = 'card';
      article.dataset.chart = def.id;
      article.dataset.span = String(b.emit);
      article.style.gridColumn = 'span ' + b.emit;
      article.style.animationDelay = Math.min(idx * 45, 400) + 'ms';
      article.innerHTML =
        '<header class="card__head">' +
          '<div class="card__titles"><h3>' + esc(cardName) + '</h3><p>' + esc(cardDesc) + '</p></div>' +
          '<span class="card__kind">' + KIND_LABEL[def.kind] + '</span>' +
          '<div class="card__tools">' +
            '<button type="button" data-act="custom" aria-label="自定义这张图表" title="自定义标题 / 配色 / 样式"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg></button>' +
            '<button type="button" data-act="table" aria-pressed="false" aria-label="切换数据表格" title="数据表格"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9.5 9.5v10M15 9.5v10"/></svg></button>' +
            '<button type="button" data-act="svg" aria-label="导出 SVG" title="导出 SVG"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10M8 10.5l4 4 4-4"/><path d="M5 19h14"/></svg></button>' +
            '<button type="button" data-act="png" aria-label="导出 PNG" title="导出 PNG"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 17l4.5-4 3.5 3 3-2.5 4 3.5"/></svg></button>' +
          '</div>' +
        '</header>' +
        '<div class="card__body"><div class="chart-host"></div><div class="card__table" hidden></div></div>' +
        '<footer class="card__legend"></footer>';
      grid.appendChild(article);
      var host = article.querySelector('.chart-host');
      var legendEl = article.querySelector('.card__legend');
      var tableEl = article.querySelector('.card__table');
      var table = tableFor(spec);
      var rec = { spec: spec, host: host, legendEl: legendEl, tableEl: tableEl, article: article, table: table, tableView: false, def: def };
      state.cards[def.id] = rec;
      drawCard(rec, animate);
      if (resizeObserver) resizeObserver.observe(host);
    });

    foot.textContent = '显示 ' + Object.keys(state.cards).length + ' / ' + defs.length + ' 种图表 · 数据仅保存在本浏览器 · 可导出当前筛选结果';
  }

  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var card = btn.closest('.card');
    var rec = state.cards[card.dataset.chart];
    if (!rec) return;
    var act = btn.getAttribute('data-act');
    if (act === 'table') {
      rec.tableView = !rec.tableView;
      btn.setAttribute('aria-pressed', String(rec.tableView));
      rec.host.hidden = rec.tableView;
      rec.tableEl.hidden = !rec.tableView;
      if (rec.tableView) renderTable(rec.tableEl, rec.table);
      else drawCard(rec, false);
    } else if (act === 'custom') {
      openChartCustom(card.dataset.chart);
    } else if (act === 'svg') {
      var svg = rec.host.querySelector('svg');
      if (!svg) { toast('表格视图下请先切回图表再导出', 'warn'); return; }
      download(new Blob([C.serialize(svg)], { type: 'image/svg+xml;charset=utf-8' }), rec.def.id + '.svg');
      toast('已导出 ' + rec.def.name + ' SVG', 'ok');
    } else if (act === 'png') {
      var svg2 = rec.host.querySelector('svg');
      if (!svg2) { toast('表格视图下请先切回图表再导出', 'warn'); return; }
      C.png(svg2, 2).then(function (blob) {
        download(blob, rec.def.id + '.png');
        toast('已导出 ' + rec.def.name + ' PNG', 'ok');
      }).catch(function (err) { toast(err.message, 'err'); });
    }
  });

  /* tooltip */
  grid.addEventListener('mousemove', function (e) {
    var mark = e.target.closest('[data-tip]');
    if (!mark) { tip.hidden = true; return; }
    var lines = mark.getAttribute('data-tip').split('\n');
    tip.innerHTML = lines.map(function (l, i) {
      return i === 0 ? '<strong>' + esc(l) + '</strong>' : '<span>' + esc(l) + '</span>';
    }).join('');
    tip.hidden = false;
    var pad = 14;
    var x = e.clientX + pad, y = e.clientY + pad;
    var r = tip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  });
  grid.addEventListener('mouseleave', function () { tip.hidden = true; });

  /* ---------- 控制区事件 ---------- */

  srcSelect.addEventListener('change', function () {
    applySource(srcSelect.value, true);
  });

  sortSelect.addEventListener('change', function () {
    state.sort = sortSelect.value;
    saveState();
    render(false);
  });

  document.getElementById('bin-minus').addEventListener('click', function () {
    state.bins = Math.max(4, state.bins - 2);
    binValue.textContent = String(state.bins);
    saveState();
    render(false);
  });
  document.getElementById('bin-plus').addEventListener('click', function () {
    state.bins = Math.min(24, state.bins + 2);
    binValue.textContent = String(state.bins);
    saveState();
    render(false);
  });

  labelsToggle.addEventListener('click', function () {
    state.labels = !state.labels;
    labelsToggle.setAttribute('aria-pressed', String(state.labels));
    saveState();
    render(false);
  });

  function resetView() {
    state.filters = {};
    state.sort = 'default';
    state.bins = 12;
    state.labels = false;
    sortSelect.value = 'default';
    binValue.textContent = '12';
    labelsToggle.setAttribute('aria-pressed', 'false');
    saveState();
    buildFilters();
    render(false);
    toast('已重置筛选与显示选项', 'ok');
  }

  document.getElementById('reset-btn').addEventListener('click', resetView);
  document.getElementById('picker-btn').addEventListener('click', openPicker);
  document.getElementById('upload-btn').addEventListener('click', openUpload);
  document.getElementById('sources-btn').addEventListener('click', openSources);

  document.getElementById('export-csv').addEventListener('click', function () {
    var rows = filteredRows();
    if (!rows.length) { toast('当前筛选下没有可导出的数据', 'warn'); return; }
    var schema = D.SCHEMAS[state.dsId];
    var cols = schema.columns.map(function (c) { return c.key; }).filter(function (k) { return state.present.indexOf(k) !== -1; })
      .concat(calcNames());
    var lines = [cols.join(',')];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) {
        var v = r[c] == null ? '' : String(r[c]);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    download(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
      state.dsId + '-' + (state.source === 'builtin' ? 'builtin' : 'upload') + '-filtered.csv');
    toast('已导出 ' + rows.length + ' 行 CSV', 'ok');
  });

  document.getElementById('upload-pick').addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });
  document.getElementById('upload-template').addEventListener('click', function () {
    download(new Blob(['﻿' + D.template(state.dsId)], { type: 'text/csv;charset=utf-8' }), state.dsId + '-template.csv');
    toast('已下载字段模板，可直接填入数据后上传', 'ok');
  });
  document.getElementById('upload-confirm').addEventListener('click', confirmUpload);
  document.getElementById('upload-again').addEventListener('click', function () {
    pendingUpload = null;
    document.getElementById('upload-choose').hidden = false;
    document.getElementById('upload-preview').hidden = true;
    document.getElementById('upload-error').hidden = true;
  });

  var dropzone = document.getElementById('dropzone');
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.remove('is-over'); });
  });
  dropzone.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  /* ---------- 页面文案 / 关于 ---------- */

  var ABOUT_DEFAULT = '数据分析看板是一个纯前端的分析工作台：13 个数据集分为校园学生、公共通用经典、生活社会与体育娱乐四类，每个数据集都自带一份本地生成的演示数据，也可以上传自己的 CSV / TSV / JSON。\n\n' +
    '上传的文件会自动识别 UTF-8 / GBK / UTF-16 编码，并对表头做模糊匹配——「日期」「时间」「统计日期」这类写法都能对上字段。缺失值、重复行与异常值可以在「数据清洗」里按规则处理，也可以用「计算字段」写表达式生成新的指标。\n\n' +
    '所有数据只保存在你自己的浏览器里（上传记录存于 IndexedDB），不会发送到任何服务器。图表由手写 SVG 引擎绘制，可单独导出 SVG / PNG，也可以一键下载包含全部图表的 HTML 报告。';

  var PAGE_DEFAULT = { site: '数据分析看板', sub: 'ANALYTICS CONSOLE', aboutTitle: '关于本工具', about: ABOUT_DEFAULT };

  var page = {};
  try { page = JSON.parse(localStorage.getItem('console.page') || '{}') || {}; } catch (e) { page = {}; }

  function pageVal(k) { return page[k] != null && page[k] !== '' ? page[k] : PAGE_DEFAULT[k]; }

  function savePage() {
    try { localStorage.setItem('console.page', JSON.stringify(page)); } catch (e) {}
  }

  function applySiteText() {
    var name = pageVal('site'), sub = pageVal('sub');
    document.querySelector('.mark__name').textContent = name;
    document.querySelector('.mark__sub').textContent = sub;
    document.querySelector('.mark').setAttribute('aria-label', name + ' 首页');
    document.title = state.dsId ? (state.title || state.dsName) + ' · ' + name : name;
  }

  function applyHeadText() {
    headTitle.textContent = state.title || state.dsName || '';
    var intro = document.getElementById('dash-intro');
    intro.textContent = state.intro || '';
    intro.hidden = !state.intro;
    applySiteText();
  }

  function paragraphs(text) {
    return String(text || '').split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function aboutHtml() {
    return paragraphs(pageVal('about')).map(function (p) {
      return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  function renderAbout() {
    var t = pageVal('aboutTitle');
    document.getElementById('about-heading').textContent = t;
    document.getElementById('about-modal-title').textContent = t;
    var html = aboutHtml();
    document.getElementById('about-body').innerHTML = html;
    document.getElementById('about-modal-body').innerHTML = html;
  }

  function openPage() {
    document.getElementById('pg-site').value = pageVal('site');
    document.getElementById('pg-sub').value = pageVal('sub');
    document.getElementById('pg-dash').value = state.title || '';
    document.getElementById('pg-intro').value = state.intro || '';
    document.getElementById('pg-about-title').value = pageVal('aboutTitle');
    document.getElementById('pg-about').value = pageVal('about');
    showModal('page');
  }

  document.getElementById('page-btn').addEventListener('click', openPage);
  document.getElementById('about-btn').addEventListener('click', function () { renderAbout(); showModal('about'); });
  document.getElementById('about-edit').addEventListener('click', openPage);
  document.getElementById('about-modal-edit').addEventListener('click', function () { hideModal('about'); openPage(); });

  document.getElementById('pg-apply').addEventListener('click', function () {
    page.site = document.getElementById('pg-site').value.trim();
    page.sub = document.getElementById('pg-sub').value.trim();
    page.aboutTitle = document.getElementById('pg-about-title').value.trim();
    page.about = document.getElementById('pg-about').value.trim();
    savePage();
    state.title = document.getElementById('pg-dash').value.trim();
    state.intro = document.getElementById('pg-intro').value.trim();
    saveState();
    applyHeadText();
    renderAbout();
    hideModal('page');
    toast('页面文案已更新', 'ok');
  });

  document.getElementById('pg-reset').addEventListener('click', function () {
    page = {};
    savePage();
    state.title = '';
    state.intro = '';
    saveState();
    applyHeadText();
    renderAbout();
    openPage();
    toast('已恢复默认文案', 'ok');
  });

  /* ---------- 数据清洗 ---------- */

  var cleanDraft = null;

  function cleanCols() { return schemaCols(); }

  function syncCleanControls() {
    document.getElementById('clean-missing').value = cleanDraft.missing;
    document.getElementById('clean-fill').value = cleanDraft.fill;
    document.getElementById('clean-fill-wrap').hidden = cleanDraft.missing !== 'fill';
    document.getElementById('clean-outliers').value = cleanDraft.outliers;
    document.getElementById('clean-dedupe').setAttribute('aria-pressed', String(!!cleanDraft.dedupe));
    document.getElementById('clean-trim').setAttribute('aria-pressed', String(!!cleanDraft.trim));
  }

  function updateCleanImpact() {
    var res = window.Clean.apply(state.rowsRaw, cleanCols(), cleanDraft);
    var r = res.report;
    var bits = [];
    if (r.removed) bits.push('移除 ' + r.removed + ' 行');
    if (r.filled) bits.push('填充 ' + r.filled + ' 处');
    if (r.clipped) bits.push('截断 ' + r.clipped + ' 处');
    if (r.deduped) bits.push('去重 ' + r.deduped + ' 行');
    if (r.trimmed) bits.push('规整 ' + r.trimmed + ' 处文本');
    document.getElementById('clean-impact').textContent =
      '应用后 ' + r.before.toLocaleString('en-US') + ' → ' + r.after.toLocaleString('en-US') + ' 行' +
      (bits.length ? ' · ' + bits.join(' · ') : ' · 当前规则不改变数据');
  }

  function openClean() {
    cleanDraft = window.Clean.normalizeCfg(state.clean);
    var cols = cleanCols();
    var prof = window.Clean.profile(state.rowsRaw, cols);
    document.getElementById('clean-sub').textContent =
      sourceName(state.dsId, state.source) + ' · 原始 ' + prof.rows.toLocaleString('en-US') + ' 行 · 清洗只影响本浏览器中的分析结果，不修改源文件';
    document.getElementById('clean-stats').innerHTML = [
      { label: '数据行', value: prof.rows.toLocaleString('en-US') },
      { label: '缺失单元格', value: prof.missingCells.toLocaleString('en-US'), warn: prof.missingCells > 0 },
      { label: '含缺失的行', value: prof.dirtyRows.toLocaleString('en-US'), warn: prof.dirtyRows > 0 },
      { label: '完全重复行', value: prof.dup.toLocaleString('en-US'), warn: prof.dup > 0 }
    ].map(function (s) {
      return '<div class="qstat' + (s.warn ? ' qstat--warn' : '') + '"><span>' + esc(s.label) + '</span><strong>' + esc(s.value) + '</strong></div>';
    }).join('');

    var TYPE_LABEL = { num: '数值', cat: '类别', date: '日期', datetime: '日期时间', time: '时间', bool: '布尔' };
    var html = '<table class="mini-table"><thead><tr><th>字段</th><th>类型</th><th>缺失</th><th>唯一值</th><th>异常值</th><th>范围</th></tr></thead><tbody>';
    prof.columns.forEach(function (c) {
      var range = c.stats ? C.fmt(c.stats.min, 'num') + ' ~ ' + C.fmt(c.stats.max, 'num') : '—';
      html += '<tr><td>' + esc(c.key) + '</td><td>' + (TYPE_LABEL[c.type] || c.type) + '</td>' +
        '<td' + (c.missing ? ' class="cell--warn"' : '') + '>' + c.missing + '（' + c.pct + '%）</td>' +
        '<td>' + c.unique + '</td>' +
        '<td' + (c.stats && c.stats.outliers ? ' class="cell--warn"' : '') + '>' + (c.stats ? c.stats.outliers : '—') + '</td>' +
        '<td>' + esc(range) + '</td></tr>';
    });
    html += '</tbody></table>';
    document.getElementById('clean-table').innerHTML = html;
    syncCleanControls();
    updateCleanImpact();
    showModal('clean');
  }

  document.getElementById('clean-btn').addEventListener('click', openClean);
  document.getElementById('clean-missing').addEventListener('change', function () {
    cleanDraft.missing = this.value;
    syncCleanControls();
    updateCleanImpact();
  });
  document.getElementById('clean-fill').addEventListener('change', function () {
    cleanDraft.fill = this.value;
    updateCleanImpact();
  });
  document.getElementById('clean-outliers').addEventListener('change', function () {
    cleanDraft.outliers = this.value;
    updateCleanImpact();
  });
  document.getElementById('clean-dedupe').addEventListener('click', function () {
    cleanDraft.dedupe = !cleanDraft.dedupe;
    syncCleanControls();
    updateCleanImpact();
  });
  document.getElementById('clean-trim').addEventListener('click', function () {
    cleanDraft.trim = !cleanDraft.trim;
    syncCleanControls();
    updateCleanImpact();
  });

  function finishClean(msg) {
    rebuildRows();
    saveState();
    buildFilters();
    render(false);
    hideModal('clean');
    toast(msg, 'ok');
  }

  document.getElementById('clean-apply').addEventListener('click', function () {
    state.clean = window.Clean.isDefault(cleanDraft) ? null : cleanDraft;
    finishClean(state.clean ? '已应用清洗规则' : '清洗规则为默认，数据保持原样');
  });
  document.getElementById('clean-reset').addEventListener('click', function () {
    state.clean = null;
    cleanDraft = window.Clean.normalizeCfg(null);
    finishClean('已恢复原始数据');
  });

  /* ---------- 计算字段 ---------- */

  function calcFieldNames() { return D.presentKeys(state.dsId, state.rowsRaw); }

  function renderCalcList() {
    var box = document.getElementById('calc-list');
    if (!state.calc.length) {
      box.innerHTML = '<p class="calc__empty">还没有计算字段。示例：<code>[数学] * 0.4 + [语文] * 0.6</code></p>';
      return;
    }
    box.innerHTML = state.calc.map(function (f, i) {
      return '<div class="calc__item"><div><strong>' + esc(f.name) + '</strong><code>' + esc(f.expr) + '</code></div>' +
        '<button class="ghost-btn ghost-btn--danger ghost-btn--sm" type="button" data-calc-del="' + i + '">删除</button></div>';
    }).join('');
  }

  function calcPreview() {
    var name = document.getElementById('calc-name').value.trim();
    var expr = document.getElementById('calc-expr').value.trim();
    var err = document.getElementById('calc-error');
    var prev = document.getElementById('calc-preview');
    err.hidden = true;
    prev.textContent = '';
    if (!expr) return null;
    var c = window.Calc.compile(expr, calcFieldNames());
    if (c.error) {
      err.textContent = c.error;
      err.hidden = false;
      return null;
    }
    var sample = state.rowsRaw.slice(0, 4).map(function (r) {
      var v = c.fn(r);
      return v == null ? '—' : String(v);
    });
    prev.textContent = '引用字段：' + (c.refs.join('、') || '无') + ' · 前 4 行结果：' + sample.join(' / ');
    return { name: name, expr: expr, refs: c.refs };
  }

  function openCalc() {
    renderCalcList();
    document.getElementById('calc-funcs').textContent = window.Calc.FUNCS.join(' ');
    var names = calcFieldNames();
    document.getElementById('calc-fields').innerHTML = names.map(function (n) {
      return '<button class="chip chip--pick" type="button" data-field="' + esc(n) + '">' + esc(n) + '</button>';
    }).join('');
    calcPreview();
    showModal('calc');
  }

  document.getElementById('calc-btn').addEventListener('click', openCalc);
  document.getElementById('calc-expr').addEventListener('input', calcPreview);
  document.getElementById('calc-name').addEventListener('input', calcPreview);
  document.getElementById('calc-fields').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-field]');
    if (!btn) return;
    var inp = document.getElementById('calc-expr');
    var ref = '[' + btn.getAttribute('data-field') + ']';
    var s = inp.selectionStart || inp.value.length;
    inp.value = inp.value.slice(0, s) + ref + inp.value.slice(inp.selectionEnd || s);
    inp.focus();
    inp.selectionStart = inp.selectionEnd = s + ref.length;
    calcPreview();
  });
  document.getElementById('calc-clear').addEventListener('click', function () {
    document.getElementById('calc-name').value = '';
    document.getElementById('calc-expr').value = '';
    calcPreview();
  });
  document.getElementById('calc-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-calc-del]');
    if (!btn) return;
    var i = Number(btn.getAttribute('data-calc-del'));
    var removed = state.calc.splice(i, 1)[0];
    delete state.filters['calc' + i];
    rebuildRows();
    saveState();
    buildFilters();
    render(false);
    renderCalcList();
    toast('已删除计算字段「' + removed.name + '」', 'ok');
  });
  document.getElementById('calc-add').addEventListener('click', function () {
    var res = calcPreview();
    var err = document.getElementById('calc-error');
    if (!res || !res.name) {
      err.textContent = res ? '请填写字段名称' : '请先填写有效的表达式';
      err.hidden = false;
      return;
    }
    if (calcFieldNames().indexOf(res.name) !== -1 || state.calc.some(function (f) { return f.name === res.name; })) {
      err.textContent = '字段名「' + res.name + '」已存在，请换一个';
      err.hidden = false;
      return;
    }
    state.calc.push({ name: res.name, expr: res.expr });
    rebuildRows();
    saveState();
    buildFilters();
    render(false);
    renderCalcList();
    document.getElementById('calc-name').value = '';
    document.getElementById('calc-expr').value = '';
    calcPreview();
    toast('已添加计算字段「' + res.name + '」，并生成对应图表', 'ok');
  });

  /* ---------- 图表自定义 ---------- */

  var ccTarget = null;

  function ccRead() {
    return {
      title: document.getElementById('cc-name').value.trim(),
      desc: document.getElementById('cc-desc').value.trim(),
      scheme: document.getElementById('cc-scheme').value,
      color: document.getElementById('cc-color').value,
      span: Number(document.getElementById('cc-span').value) || 0,
      labels: document.getElementById('cc-labels').getAttribute('aria-pressed') === 'true',
      grid: document.getElementById('cc-grid').getAttribute('aria-pressed') === 'true',
      legend: document.getElementById('cc-legend').getAttribute('aria-pressed') === 'true'
    };
  }

  function ccSwatches() {
    var v = ccRead();
    var colors = v.scheme === 'theme' ? C.palette().series : C.schemeColors(v.scheme, v.color);
    document.getElementById('cc-swatches').innerHTML = (colors || []).map(function (c) {
      return '<i style="background:' + c + '"></i>';
    }).join('');
    document.getElementById('cc-color-wrap').hidden = v.scheme !== 'custom';
  }

  function openChartCustom(id) {
    var rec = state.cards[id];
    if (!rec) return;
    ccTarget = id;
    var cu = customOf(id);
    document.getElementById('cc-title').textContent = cu.title || rec.def.name;
    document.getElementById('cc-name').value = cu.title || '';
    document.getElementById('cc-name').placeholder = rec.def.name;
    document.getElementById('cc-desc').value = cu.desc || '';
    document.getElementById('cc-desc').placeholder = rec.def.desc;
    document.getElementById('cc-scheme').innerHTML = C.SCHEMES.map(function (s) {
      return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
    }).join('');
    document.getElementById('cc-scheme').value = cu.scheme || 'theme';
    document.getElementById('cc-color').value = cu.color || '#2fe0c6';
    document.getElementById('cc-span').value = String(cu.span || 0);
    document.getElementById('cc-labels').setAttribute('aria-pressed', String(cu.labels != null ? cu.labels : state.labels));
    document.getElementById('cc-grid').setAttribute('aria-pressed', String(cu.grid !== false));
    document.getElementById('cc-legend').setAttribute('aria-pressed', String(cu.legend !== false));
    ccSwatches();
    showModal('chart-custom');
  }

  ['cc-scheme', 'cc-color', 'cc-span'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', ccSwatches);
  });
  ['cc-labels', 'cc-grid', 'cc-legend'].forEach(function (id) {
    var el = document.getElementById(id);
    el.addEventListener('click', function () {
      el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true'));
    });
  });

  document.getElementById('cc-apply').addEventListener('click', function () {
    if (!ccTarget) return;
    var v = ccRead();
    var isDefault = !v.title && !v.desc && v.scheme === 'theme' && !v.span &&
      v.labels === state.labels && v.grid && v.legend;
    if (isDefault) delete state.custom[ccTarget];
    else state.custom[ccTarget] = v;
    saveState();
    hideModal('chart-custom');
    render(false);
    toast('图表设置已保存', 'ok');
  });

  document.getElementById('cc-reset').addEventListener('click', function () {
    if (!ccTarget) return;
    delete state.custom[ccTarget];
    saveState();
    hideModal('chart-custom');
    render(false);
    toast('已恢复该图表的默认样式', 'ok');
  });

  /* ---------- 重置 ---------- */

  var RESET_ITEMS = [
    { key: 'filters', label: '筛选与显示选项', desc: '筛选条件、排序、分箱、数值标签' },
    { key: 'custom', label: '图表自定义', desc: '标题、配色、宽度与样式改写' },
    { key: 'calc', label: '计算字段', desc: '删除全部自定义表达式字段' },
    { key: 'clean', label: '清洗规则', desc: '恢复未清洗的原始数据' },
    { key: 'text', label: '标题与项目介绍', desc: '恢复当前看板的默认标题与介绍' }
  ];

  document.getElementById('reset-btn').addEventListener('click', function () {
    document.getElementById('reset-list').innerHTML = RESET_ITEMS.map(function (it, i) {
      return '<label class="reset__item"><input type="checkbox" data-reset="' + it.key + '"' + (i === 0 ? ' checked' : '') + '>' +
        '<span><strong>' + esc(it.label) + '</strong><em>' + esc(it.desc) + '</em></span></label>';
    }).join('');
    showModal('reset');
  });

  document.getElementById('reset-apply').addEventListener('click', function () {
    var picked = {};
    document.querySelectorAll('#reset-list [data-reset]').forEach(function (el) {
      if (el.checked) picked[el.getAttribute('data-reset')] = true;
    });
    if (!Object.keys(picked).length) { toast('请至少选择一项', 'warn'); return; }
    if (picked.filters) {
      state.filters = {};
      state.sort = 'default';
      state.bins = 12;
      state.labels = false;
      state.charts = null;
      sortSelect.value = 'default';
      binValue.textContent = '12';
      labelsToggle.setAttribute('aria-pressed', 'false');
    }
    if (picked.custom) state.custom = {};
    if (picked.calc) state.calc = [];
    if (picked.clean) state.clean = null;
    if (picked.text) { state.title = ''; state.intro = ''; }
    rebuildRows();
    applyHeadText();
    saveState();
    buildFilters();
    render(false);
    hideModal('reset');
    toast('已重置：' + RESET_ITEMS.filter(function (it) { return picked[it.key]; }).map(function (it) { return it.label; }).join('、'), 'ok');
  });

  /* ---------- 下载报告 ---------- */

  function svgFor(rec) {
    var svg = rec.host.querySelector('svg');
    if (svg) return C.serialize(svg);
    var tmp = document.createElement('div');
    tmp.style.cssText = 'position:absolute;left:-9999px;top:0;width:720px;height:320px';
    document.body.appendChild(tmp);
    C.render(tmp, rec.spec, chartOpts(rec.def.id, false));
    var node = tmp.querySelector('svg');
    var out = node ? C.serialize(node) : '';
    tmp.remove();
    return out;
  }

  function buildReport() {
    var p = C.palette();
    var rows = filteredRows();
    colBegin(rows);
    var name = state.title || state.dsName;
    var cols = schemaCols().map(function (c) { return c.key; }).concat(calcNames());
    var kpiList = KPIS[state.dsId](rows, { present: state.present });
    var css = 'body{margin:0;padding:32px;background:' + p.bg + ';color:' + p.fg +
      ';font-family:"Segoe UI","PingFang SC","Microsoft YaHei UI",system-ui,sans-serif;line-height:1.6}' +
      '.wrap{max-width:1080px;margin:0 auto}h1{font-size:26px;margin:0 0 6px}h2{font-size:17px;margin:0 0 4px}' +
      '.meta{color:' + p.muted + ';font-size:13px;margin:0 0 20px}.intro{margin:0 0 20px;max-width:70ch}' +
      '.kpis{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 24px}' +
      '.kpi{flex:1 1 160px;border:1px solid ' + p.border + ';border-radius:12px;padding:12px 14px;background:' + p.surface + '}' +
      '.kpi span{display:block;font-size:12px;color:' + p.muted + '}.kpi strong{font-size:22px}' +
      '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}' +
      '.card{border:1px solid ' + p.border + ';border-radius:14px;padding:14px;background:' + p.surface + ';break-inside:avoid}' +
      '.card p{margin:0 0 8px;font-size:12px;color:' + p.muted + '}.card svg{width:100%;height:auto}' +
      'table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px}' +
      'th,td{border:1px solid ' + p.border + ';padding:5px 8px;text-align:left}' +
      'th{color:' + p.muted + ';font-weight:600}section{margin-top:28px}' +
      '@media print{body{background:#fff;color:#111}.card,.kpi{background:#fff;border-color:#ddd}}';

    var html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
      '<title>' + esc(name) + ' · 分析报告</title><style>' + css + '</style></head><body><div class="wrap">' +
      '<h1>' + esc(name) + '</h1>' +
      '<p class="meta">' + esc(pageVal('site')) + ' · ' + esc(sourceName(state.dsId, state.source)) + ' · ' +
      rows.length.toLocaleString('en-US') + ' / ' + state.rowsAll.length.toLocaleString('en-US') + ' 行 · 生成于 ' +
      new Date().toLocaleString('zh-CN') + '</p>' +
      (state.intro ? '<p class="intro">' + esc(state.intro) + '</p>' : '') +
      '<div class="kpis">' + kpiList.map(function (k) {
        return '<div class="kpi"><span>' + esc(k.label) + '</span><strong>' + esc(k.value) + '</strong><span>' + esc(k.sub || '') + '</span></div>';
      }).join('') + '</div><div class="grid">';

    Object.keys(state.cards).forEach(function (id) {
      var rec = state.cards[id];
      var cu = customOf(id);
      html += '<div class="card"><h2>' + esc(cu.title || rec.def.name) + '</h2><p>' +
        esc(cu.desc || rec.def.desc) + '</p>' + svgFor(rec) + '</div>';
    });
    html += '</div>';

    if (state.calc.length) {
      html += '<section><h2>计算字段</h2><table><thead><tr><th>字段</th><th>表达式</th></tr></thead><tbody>' +
        state.calc.map(function (f) { return '<tr><td>' + esc(f.name) + '</td><td>' + esc(f.expr) + '</td></tr>'; }).join('') +
        '</tbody></table></section>';
    }
    if (state.cleanReport) {
      var r = state.cleanReport;
      html += '<section><h2>清洗记录</h2><p class="meta">原始 ' + r.before + ' 行 → ' + r.after + ' 行 · 移除 ' +
        r.removed + ' · 填充 ' + r.filled + ' · 截断 ' + r.clipped + ' · 去重 ' + r.deduped + '</p></section>';
    }

    var preview = rows.slice(0, 200);
    html += '<section><h2>数据明细（前 ' + preview.length + ' 行）</h2><table><thead><tr>' +
      cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      preview.map(function (r) {
        return '<tr>' + cols.map(function (c) { return '<td>' + esc(r[c] == null ? '' : r[c]) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></section>';

    html += '<section><h2>' + esc(pageVal('aboutTitle')) + '</h2>' + aboutHtml() + '</section>';
    html += '</div></body></html>';
    return html;
  }

  document.getElementById('report-btn').addEventListener('click', function () {
    if (!state.dsId) return;
    if (!Object.keys(state.cards).length) { toast('当前没有可导出的图表', 'warn'); return; }
    var html = buildReport();
    download(new Blob([html], { type: 'text/html;charset=utf-8' }),
      (state.dsId || 'dashboard') + '-report.html');
    toast('已下载 HTML 报告，可直接打开或打印为 PDF', 'ok');
  });

  /* ---------- 生命周期 ---------- */

  function maybeAutoPicker() {
    var seen = null;
    try { seen = localStorage.getItem(pickerSeenKey()); } catch (e) {}
    if (!seen) openPicker();
  }

  function open(ds) {
    state.dsId = ds.id;
    state.dsName = ds.name;
    var saved = loadState(ds.id);
    state.source = saved.source || 'builtin';
    state.filters = saved.filters || {};
    state.sort = saved.sort || 'default';
    state.bins = saved.bins || 12;
    state.labels = !!saved.labels;
    state.charts = saved.charts || null;
    state.clean = saved.clean || null;
    state.calc = Array.isArray(saved.calc) ? saved.calc : [];
    state.custom = saved.custom || {};
    state.title = saved.title || '';
    state.intro = saved.intro || '';
    state.rowsRaw = sourceRows(ds.id, state.source);
    if (state.source !== 'builtin' && !uploads.some(function (u) { return u.id === state.source; })) {
      state.source = 'builtin';
      state.rowsRaw = D.seed(ds.id);
    }
    rebuildRows();

    applyHeadText(ds);
    renderAbout();
    sortSelect.value = state.sort;
    binValue.textContent = String(state.bins);
    labelsToggle.setAttribute('aria-pressed', String(state.labels));
    buildSourceSelect();
    buildFilters();
    dash.hidden = false;
    document.documentElement.setAttribute('data-dash', 'on');
    render(true);
    maybeAutoPicker();
  }

  function close() {
    dash.hidden = true;
    document.documentElement.removeAttribute('data-dash');
    state.dsId = null;
    state.cards = {};
    grid.innerHTML = '';
    kpis.innerHTML = '';
    tip.hidden = true;
  }

  function refreshColors() {
    if (!state.dsId || dash.hidden) return;
    Object.keys(state.cards).forEach(function (id) { drawCard(state.cards[id], false); });
  }

  window.Dash = {
    open: open,
    close: close,
    refreshColors: refreshColors,
    toast: toast,
    esc: esc,
    decode: decodeText,
    humanSize: humanSize,
    showModal: showModal,
    hideModal: hideModal
  };

  applySiteText();
  renderAbout();
})();