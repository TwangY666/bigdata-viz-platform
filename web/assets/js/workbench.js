/* ============================================================
   分析工作台 · 打开自己的表 → 选字段 → 看图 → 核对明细
   普通表不套业务模板；数据只在当前页面内存里，不上传、不写入存储。
   ============================================================ */
(function () {
  'use strict';

  var D = window.DATA, C = window.Charts, DASH = window.Dash;
  var root = document.documentElement;
  /* 与示例看板同一套上限：64 MB 文件、D.MAX_ROWS 行（超出截断） */
  var MAX_BYTES = 64 * 1048576;
  var MAX_ROWS = D.MAX_ROWS || 300000;
  var PREVIEW_ROWS = 10;
  var DETAIL_ROWS = 300;
  var MAX_BARS = 24;

  function $(id) { return document.getElementById(id); }
  var dom = {};
  [
    'wb', 'wb-name', 'wb-meta', 'wb-title', 'wb-formula', 'wb-unit', 'wb-chart', 'wb-summary',
    'wb-notice', 'wb-report-card', 'wb-detail-card', 'wb-detail', 'wb-detail-meta',
    'wb-filter-line', 'wb-filter-line-text', 'wb-panel-title',
    'wb-group', 'wb-measure', 'wb-agg', 'wb-filter-col', 'wb-filter-val', 'wb-filter-clear',
    'wb-panel', 'wb-panel-btn', 'wb-open-btn', 'wb-view-report', 'wb-view-detail', 'wb-view-examples',
    'open-data-btn', 'landing-open', 'landing-example', 'now', 'now-none', 'now-name', 'now-state', 'now-dot',
    'wb-import', 'wb-import-choose', 'wb-import-preview', 'wb-import-step', 'wb-import-title', 'wb-dropzone',
    'wb-preview-meta', 'wb-preview-cols', 'wb-preview-table', 'wb-preview-note', 'wb-preview-name',
    'wb-preview-confirm', 'wb-preview-again', 'wb-import-error', 'wb-file-input', 'tip'
  ].forEach(function (id) { dom[id] = $(id); });

  var wb = { table: null, cfg: null, view: 'report', pending: null, token: 0, lastExample: null };
  var nf = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });

  function esc(s) { return DASH.esc(s); }
  function kindLabel(col) {
    return D.KIND_LABEL[col.kind] || col.kind;
  }

  function unitOf(text) {
    var m = /(万元|小时|分钟|公里|千米|毫升|元|笔|次|人|辆|份|台|件|单|米|吨|升|kg|km|l|ml)/i.exec(String(text || ''));
    return m ? m[1] : '';
  }

  function colById(id) {
    if (!wb.table || !id) return null;
    for (var i = 0; i < wb.table.columns.length; i++) {
      if (wb.table.columns[i].id === id) return wb.table.columns[i];
    }
    return null;
  }

  function isMeasure(col) { return !!col && col.kind === 'number'; }

  function distinctCount(col) {
    var seen = {}, n = 0;
    wb.table.rows.forEach(function (r) {
      var v = r[col.index];
      if (v === '' || seen[v]) return;
      seen[v] = 1;
      n++;
    });
    return n;
  }

  function defaultCfg() {
    var cols = wb.table.columns, group = null, measure = null, i;
    var best = null, bestDistinct = Infinity;
    for (i = 0; i < cols.length; i++) {
      if (cols[i].kind === 'number' || cols[i].kind === 'empty') continue;
      var d = distinctCount(cols[i]);
      if (d > 1 && d < bestDistinct) { best = cols[i]; bestDistinct = d; }
    }
    if (best) group = best.id;
    else {
      for (i = 0; i < cols.length; i++) {
        if (cols[i].kind !== 'number' && cols[i].kind !== 'empty') { group = cols[i].id; break; }
      }
    }
    if (!group) group = cols.length ? cols[0].id : null;
    for (i = 0; i < cols.length; i++) {
      if (cols[i].kind === 'number') { measure = cols[i].id; break; }
    }
    return { group: group, measure: measure || 'count', agg: 'sum', filterCol: '', filterVal: '' };
  }

  /* ---------- 计算 ---------- */

  function filteredRows() {
    var t = wb.table, cfg = wb.cfg;
    if (!t) return [];
    var col = colById(cfg.filterCol);
    if (!col || !cfg.filterVal) return t.rows;
    return t.rows.filter(function (r) { return r[col.index] === cfg.filterVal; });
  }

  function aggregate(rows) {
    var cfg = wb.cfg, group = colById(cfg.group), measure = colById(cfg.measure);
    var counting = !isMeasure(measure);
    var order = [], map = {};
    rows.forEach(function (r) {
      var key = group ? (r[group.index] === '' ? '（空值）' : r[group.index]) : '全部记录';
      if (!map[key]) { map[key] = { sum: 0, used: 0, empty: 0, bad: 0, n: 0 }; order.push(key); }
      var g = map[key];
      g.n++;
      if (counting) return;
      var v = r[measure.index];
      if (v === '') { g.empty++; return; }
      var num = D.plainNumber(v);
      if (num === null) { g.bad++; return; }
      g.sum += num;
      g.used++;
    });
    var items = order.map(function (key) {
      var g = map[key];
      return {
        label: key, n: g.n, empty: g.empty, bad: g.bad, used: g.used, sum: g.sum,
        value: counting ? g.n : (cfg.agg === 'avg' ? (g.used ? g.sum / g.used : null) : g.sum)
      };
    });
    var kept = items.filter(function (it) { return it.value !== null && isFinite(it.value); });
    var totals = {
      counting: counting, rows: rows.length, groups: items.length, skipped: items.length - kept.length,
      used: 0, empty: 0, bad: 0, sum: 0
    };
    items.forEach(function (it) {
      totals.used += it.used; totals.empty += it.empty; totals.bad += it.bad; totals.sum += it.sum;
    });
    return { items: kept, all: items, totals: totals };
  }

  /* ---------- 控件 ---------- */

  function columnOptions() {
    return wb.table.columns.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
    }).join('');
  }

  function buildControls() {
    var cfg = wb.cfg;
    var opts = columnOptions();
    dom['wb-group'].innerHTML = opts;
    dom['wb-group'].value = cfg.group || '';

    var nums = wb.table.columns.filter(isMeasure);
    if (!nums.some(function (c) { return c.id === cfg.measure; })) cfg.measure = 'count';
    dom['wb-measure'].innerHTML =
      nums.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') +
      '<option value="count">记录数（计数）</option>';
    dom['wb-measure'].value = cfg.measure;
    dom['wb-agg'].disabled = cfg.measure === 'count';
    dom['wb-agg'].value = cfg.agg;

    dom['wb-filter-col'].innerHTML = '<option value="">不筛选</option>' + opts;
    dom['wb-filter-col'].value = cfg.filterCol || '';
    buildFilterValues();
  }

  function buildFilterValues() {
    var cfg = wb.cfg, col = colById(cfg.filterCol), sel = dom['wb-filter-val'];
    if (!col) {
      sel.innerHTML = '<option value="">-</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    var seen = {}, list = [];
    wb.table.rows.forEach(function (r) {
      var v = r[col.index];
      if (v === '' || seen[v]) return;
      seen[v] = 1;
      list.push(v);
    });
    list.sort(function (a, b) {
      var x = D.plainNumber(a), y = D.plainNumber(b);
      if (x !== null && y !== null) return x - y;
      return String(a).localeCompare(String(b), 'zh-CN');
    });
    sel.innerHTML = '<option value="">全部（' + list.length + ' 项）</option>' +
      list.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
    if (list.indexOf(cfg.filterVal) === -1) cfg.filterVal = '';
    sel.value = cfg.filterVal;
  }

  /* ---------- 渲染 ---------- */

  function render() {
    var t = wb.table;
    if (!t) return;
    var cfg = wb.cfg;
    var rows = filteredRows();
    var agg = aggregate(rows);
    var group = colById(cfg.group);
    var measure = colById(cfg.measure);
    var counting = agg.totals.counting;
    var valueName = counting ? '记录数' : measure.name;
    var unit = counting ? '条' : unitOf(measure.name + ' ' + measure.header);

    dom['wb-name'].textContent = t.name;
    dom['wb-meta'].textContent = t.fileName + ' · ' + DASH.humanSize(t.size) + ' · ' + t.format +
      (t.encoding && t.encoding !== 'UTF-8' ? ' · ' + t.encoding + ' 编码' : '') +
      ' · ' + t.rows.length + ' 行 × ' + t.columns.length + ' 列' +
      (t.truncated ? '（原 ' + t.totalRows + ' 行，超出上限已截断）' : '');

    var aggWord = counting ? '计数' : (cfg.agg === 'avg' ? '取平均' : '求和');
    dom['wb-title'].textContent = counting
      ? '各' + (group ? group.name : '') + '记录数'
      : '各' + (group ? group.name : '') + measure.name + (cfg.agg === 'avg' ? '平均值' : '合计');
    dom['wb-formula'].textContent = '按「' + (group ? group.name : '全部') + '」分组 · 「' + valueName + '」' + aggWord +
      ' · ' + agg.items.length + ' 个分组' +
      (agg.items.length > MAX_BARS ? ' · 图上按降序显示前 ' + MAX_BARS + ' 个' : '');
    dom['wb-unit'].textContent = '单位：' + (unit || '跟随「' + valueName + '」列');

    var shown = agg.items.length > MAX_BARS
      /* 分组太多时条形会压成一条线，图上按数值降序显示前若干组，明细仍是全部 */
      ? agg.items.slice().sort(function (a, b) { return b.value - a.value; }).slice(0, MAX_BARS)
      : agg.items;

    if (!shown.length) {
      dom['wb-chart'].style.height = '180px';
      dom['wb-chart'].innerHTML = '<p class="wb__chart-empty">' +
        (rows.length ? '所选数值在该筛选下没有可用数字，请换个数值字段或清除筛选' : '当前筛选命中 0 行') + '</p>';
    } else {
      /* 条形高度跟随分组数，两三个组时不留大片空白 */
      dom['wb-chart'].style.height =
        Math.round(Math.max(150, Math.min(420, shown.length * 58 + 46))) + 'px';
      C.render(dom['wb-chart'], {
        kind: 'hbar',
        x: shown.map(function (it) { return it.label; }),
        series: [{ name: valueName, values: shown.map(function (it) { return it.value; }) }],
        fmt: 'auto',
        aria: dom['wb-title'].textContent + '：' + ariaValues(shown, unit)
      }, { labels: true, animate: true });
    }

    var unitTail = unit ? ' ' + unit : '';
    var parts = [{ k: '筛选后行数', v: nf.format(agg.totals.rows) + ' / ' + nf.format(t.rows.length) + ' 行' }];
    if (counting) {
      parts.push({ k: '合计条数', v: nf.format(agg.totals.rows) + ' 条' });
    } else if (cfg.agg === 'avg') {
      parts.push({
        k: '总体平均' + measure.name,
        v: agg.totals.used ? C.fmt(agg.totals.sum / agg.totals.used, 'auto') + unitTail : '无可用数值'
      });
      parts.push({ k: '合计（求和）', v: C.fmt(agg.totals.sum, 'auto') + unitTail });
    } else {
      parts.push({ k: '合计' + measure.name + '（求和）', v: C.fmt(agg.totals.sum, 'auto') + unitTail });
    }
    parts.push({ k: '参与计算的数值', v: counting ? '按条数计数' : nf.format(agg.totals.used) + ' 条' });
    parts.push({
      k: '空值 / 无法计算',
      v: counting ? '—' : nf.format(agg.totals.empty) + ' / ' + nf.format(agg.totals.bad) + ' 条'
    });
    dom['wb-summary'].innerHTML = parts.map(function (p) {
      return '<div class="wb__stat"><span>' + esc(p.k) + '</span><b>' + esc(p.v) + '</b></div>';
    }).join('');

    renderDetail(rows, agg);
    renderNotice(rows, agg);
    syncView();
    syncHeader();
  }

  function ariaValues(shown, unit) {
    var tail = unit ? ' ' + unit : '';
    var head = shown.slice(0, 12).map(function (it) {
      return it.label + ' ' + C.fmt(it.value, 'auto') + tail;
    }).join('，');
    return shown.length > 12 ? head + '，共 ' + shown.length + ' 个分组' : head;
  }

  function renderDetail(rows, agg) {
    var t = wb.table, cfg = wb.cfg;
    var col = colById(cfg.filterCol);
    var line = dom['wb-filter-line'];
    if (col && cfg.filterVal) {
      dom['wb-filter-line-text'].textContent = col.name + ' = ' + cfg.filterVal + ' · ' +
        nf.format(rows.length) + ' / ' + nf.format(t.rows.length) + ' 行';
      line.hidden = false;
    } else {
      line.hidden = true;
    }
    var shown = rows.slice(0, DETAIL_ROWS);
    dom['wb-detail-meta'].textContent = '共 ' + t.columns.length + ' 列' +
      (rows.length > shown.length ? ' · 表格显示前 ' + DETAIL_ROWS + ' 行' : '');
    var html = '<table class="mini-table wb__table"><thead><tr>' +
      t.columns.map(function (c) {
        var raw = c.header === c.name ? '' : ' title="原表头：' + esc(c.header) + '"';
        return '<th' + raw + '>' + esc(c.name) + '<span class="wb__th-kind">' + esc(kindLabel(c)) + '</span></th>';
      }).join('') + '</tr></thead><tbody>' +
      shown.map(function (r) {
        return '<tr>' + t.columns.map(function (c) {
          return '<td' + (c.kind === 'number' ? ' class="wb__num"' : '') + '>' + (r[c.index] === '' ? '<span class="wb__void">空</span>' : esc(r[c.index])) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    dom['wb-detail'].innerHTML = html;
  }

  function renderNotice(rows, agg) {
    var box = dom['wb-notice'];
    var msgs = [];
    var measure = colById(wb.cfg.measure);
    if (!rows.length) {
      msgs.push('当前筛选命中 0 行，图与明细都按这 0 行核对。');
    } else if (!wb.table.columns.some(isMeasure)) {
      msgs.push('这张表没有可计算的数值字段，已按记录数计数；可先切到「数据明细」看内容。');
    } else if (agg.totals.empty + agg.totals.bad > 0) {
      msgs.push('「' + measure.name + '」有 ' + agg.totals.empty + ' 条空值、' + agg.totals.bad +
        ' 条无法解析为数字，均按空值处理，' + agg.totals.used + ' 条参与计算。');
    }
    if (rows.length && wb.table.ragged.length) msgs.push(raggedMsg());
    if (wb.table.truncated) {
      msgs.push('文件共 ' + wb.table.totalRows + ' 行，超过 ' + MAX_ROWS + ' 行上限，工作台只用前 ' +
        MAX_ROWS + ' 行，被截掉的 ' + wb.table.truncated + ' 行不参与计算。');
    }
    if (agg.items.length > MAX_BARS) {
      msgs.push('分组共 ' + agg.items.length + ' 个，图上按数值降序显示前 ' + MAX_BARS + ' 个；数据明细仍是全部 ' +
        rows.length + ' 行。');
    }
    if (rows.length && agg.totals.skipped) {
      msgs.push(agg.totals.skipped + ' 个分组没有可用数值，已从图中跳过，明细仍完整显示。');
    }

    if (!msgs.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = '<span>' + msgs.map(esc).join(' ') + '</span>' +
      (!rows.length ? '<button class="wb__link" type="button" data-act="clear-filter">清除筛选</button>' : '');
    box.hidden = false;
  }

  function raggedMsg() {
    var r = wb.table.ragged;
    var lines = r.slice(0, 3).map(function (x) { return '第 ' + x.line + ' 行有 ' + x.got + ' 个值（表头 ' + x.want + ' 列）'; });
    return r.length + ' 行的列数与表头不一致，多出的值忽略、缺的列按空值处理：' + lines.join('、') +
      (r.length > 3 ? ' 等' : '');
  }

  function syncView() {
    var report = wb.view === 'report';
    dom['wb-report-card'].hidden = !report;
    dom['wb-detail-card'].hidden = report;
    dom.wb.setAttribute('data-view', wb.view);
    dom['wb-panel'].setAttribute('aria-label', report ? '图表设置' : '筛选');
    dom['wb-panel-title'].textContent = report ? '图表设置' : '筛选';
    dom['wb-view-report'].setAttribute('aria-pressed', String(report));
    dom['wb-view-detail'].setAttribute('aria-pressed', String(!report));
    dom['wb-view-examples'].setAttribute('aria-pressed', 'false');
  }

  function syncHeader() {
    if (!wb.table || root.getAttribute('data-wb') !== 'on') return;
    dom['now'].hidden = false;
    dom['now-none'].hidden = true;
    dom['now-name'].textContent = wb.table.name;
    dom['now-state'].textContent = '分析工作台 · ' + wb.table.rows.length + ' 行 · 本地解析';
    dom['now-dot'].style.setProperty('--hue', '168');
    document.title = wb.table.name + ' · 分析工作台';
  }

  function showWorkbench() {
    dom.wb.hidden = false;
    root.setAttribute('data-wb', 'on');
    buildControls();
    render();
  }

  function hideWorkbench() {
    root.removeAttribute('data-wb');
    root.removeAttribute('data-wb-panel');
    dom.wb.hidden = true;
    dom['wb-panel-btn'].setAttribute('aria-expanded', 'false');
  }

  /* ---------- 导入 ---------- */

  function setStep(which) {
    var preview = which === 'preview';
    dom['wb-import-choose'].hidden = preview;
    dom['wb-import-preview'].hidden = !preview;
    dom['wb-import-step'].textContent = preview ? '第二步 · 确认表头与类型' : '第一步 · 选择文件';
  }

  function openImport() {
    wb.pending = null;
    dom['wb-import-error'].hidden = true;
    dom['wb-file-input'].value = '';
    setStep('choose');
    DASH.showModal('wb-import');
  }

  function importError(msg) {
    dom['wb-import-error'].textContent = msg;
    dom['wb-import-error'].hidden = false;
    setStep('choose');
    DASH.toast(msg, 'err');
  }

  function stemOf(name) {
    return String(name).replace(/\.[^.]+$/, '');
  }

  function handleFile(file) {
    if (!file) return;
    var token = ++wb.token;
    if (file.size > MAX_BYTES) {
      importError('「' + file.name + '」有 ' + DASH.humanSize(file.size) + '，超过 64 MB 上限。请删减行或拆分后再打开；当前表与配置保持不变。');
      return;
    }
    var m = /\.([a-z0-9]+)$/i.exec(file.name);
    var ext = m ? m[1].toLowerCase() : '';
    if (ext === 'json' || ext === 'xlsx' || ext === 'xls') {
      importError('第一阶段只打通 CSV / TSV / 分隔文本，' + ext.toUpperCase() + ' 排在第二阶段。请先用办公系统另存为 CSV 再打开。');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      if (token !== wb.token) return;
      var decoded = DASH.decode(reader.result);
      if (!decoded) {
        importError('无法识别「' + file.name + '」的编码（支持 UTF-8 / GBK / UTF-16）。请在编辑器或办公系统里另存为 CSV UTF-8 后重试。');
        return;
      }
      var parsed = D.parseTable(decoded.text);
      if (parsed.error) {
        importError(parsed.error + '（文件：' + file.name + '）');
        return;
      }
      wb.pending = { file: file, parsed: parsed, encoding: decoded.encoding };
      renderPreview();
    };
    reader.onerror = function () {
      if (token === wb.token) importError('「' + file.name + '」读取失败，请重新选择文件再试一次。');
    };
    reader.readAsArrayBuffer(file);
  }

  function renderPreview() {
    var p = wb.pending, t = p.parsed;
    setStep('preview');
    dom['wb-import-error'].hidden = true;
    dom['wb-preview-meta'].textContent = p.file.name + ' · ' + DASH.humanSize(p.file.size) + ' · ' + t.format +
      (t.delimiter === '\t' ? '（制表符）' : t.delimiter === ',' ? '（逗号）' : '（分号）') +
      ' · ' + (p.encoding === 'UTF-8' ? 'UTF-8' : p.encoding + ' 编码') +
      ' · ' + t.rowCount + ' 行 × ' + t.colCount + ' 列 · 表头取第 1 行';

    dom['wb-preview-cols'].innerHTML = t.columns.map(function (c) {
      var extra = c.missing ? '<em>空 ' + c.missing + '</em>' : '';
      var toggle = c.inferred === 'number'
        ? '<button class="wb-force" type="button" data-col="' + c.id + '" aria-pressed="' + (c.kind === 'text') + '">' +
          (c.kind === 'text' ? '已按文本' : '按文本保留') + '</button>'
        : '';
      return '<span class="chip' + (c.kind === 'number' ? ' chip--auto' : '') + '">' +
        esc(c.name) + '<em>' + esc(kindLabel(c)) + '</em>' + extra + toggle + '</span>';
    }).join('');

    var show = t.rows.slice(0, PREVIEW_ROWS);
    dom['wb-preview-table'].innerHTML = '<table class="mini-table"><thead><tr>' +
      t.columns.map(function (c) { return '<th>' + esc(c.name) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      show.map(function (r) {
        return '<tr>' + r.slice(0, t.colCount).map(function (v) {
          return '<td>' + (v === '' ? '<span class="wb__void">空</span>' : esc(v)) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';

    dom['wb-preview-note'].textContent = '预览前 ' + show.length + ' 行 / 共 ' + t.rowCount + ' 行。' +
      (t.rowCount > MAX_ROWS ? '行数超过 ' + MAX_ROWS.toLocaleString('zh-CN') + ' 行上限，进入工作台只取前 ' +
        MAX_ROWS.toLocaleString('zh-CN') + ' 行。' : '') +
      (t.ragged.length ? raggedMsgFor(t) : '各行列数一致。') +
      ' 带前导零的编号已按文本保留。';
    dom['wb-preview-name'].value = stemOf(p.file.name);
    dom['wb-import-title'].focus();
  }

  function raggedMsgFor(t) {
    var r = t.ragged;
    return r.length + ' 行的列数与表头不一致（' +
      r.slice(0, 3).map(function (x) { return '第 ' + x.line + ' 行 ' + x.got + '/' + x.want; }).join('、') +
      (r.length > 3 ? ' 等' : '') + '），多出的值忽略、缺的列按空值处理。';
  }

  function toggleForceText(colId) {
    var t = wb.pending && wb.pending.parsed;
    if (!t) return;
    for (var i = 0; i < t.columns.length; i++) {
      if (t.columns[i].id !== colId) continue;
      t.columns[i].kind = t.columns[i].kind === 'number' ? 'text' : 'number';
      renderPreview();
      var btn = dom['wb-preview-cols'].querySelector('[data-col="' + colId + '"]');
      if (btn) btn.focus();
      return;
    }
  }

  function confirmImport() {
    var p = wb.pending;
    if (!p) return;
    var t = p.parsed;
    t.columns.forEach(function (c, i) { c.index = i; });
    var rows = t.rows, truncated = 0;
    if (rows.length > MAX_ROWS) {
      truncated = rows.length - MAX_ROWS;
      rows = rows.slice(0, MAX_ROWS);
    }
    wb.table = {
      name: dom['wb-preview-name'].value.trim() || stemOf(p.file.name),
      fileName: p.file.name,
      size: p.file.size,
      format: t.format,
      encoding: p.encoding,
      columns: t.columns,
      rows: rows,
      totalRows: t.rowCount,
      truncated: truncated,
      ragged: t.ragged
    };
    wb.cfg = defaultCfg();
    wb.pending = null;
    DASH.hideModal('wb-import');
    showWorkbench();
    dom['wb-title'].focus();
    DASH.toast('已载入「' + wb.table.name + '」' + wb.table.rows.length + ' 行 × ' + wb.table.columns.length + ' 列', 'ok');
  }

  /* ---------- 事件 ---------- */

  dom['open-data-btn'].addEventListener('click', openImport);
  dom['wb-open-btn'].addEventListener('click', openImport);
  dom['landing-open'].addEventListener('click', openImport);
  dom['landing-example'].addEventListener('click', function () { window.Catalog.select('grades'); });

  dom['wb-file-input'].addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (f) handleFile(f);
  });

  var dz = dom['wb-dropzone'];
  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); });
  });
  dz.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  dz.addEventListener('click', function () { dom['wb-file-input'].click(); });
  dz.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dom['wb-file-input'].click(); }
  });

  dom['wb-preview-cols'].addEventListener('click', function (e) {
    var btn = e.target.closest('.wb-force');
    if (btn) toggleForceText(btn.getAttribute('data-col'));
  });
  dom['wb-preview-again'].addEventListener('click', function () {
    wb.pending = null;
    dom['wb-preview-name'].value = '';
    dom['wb-file-input'].value = '';
    setStep('choose');
  });
  dom['wb-preview-confirm'].addEventListener('click', confirmImport);

  dom['wb-group'].addEventListener('change', function () { wb.cfg.group = this.value; render(); });
  dom['wb-measure'].addEventListener('change', function () { wb.cfg.measure = this.value; buildControls(); render(); });
  dom['wb-agg'].addEventListener('change', function () { wb.cfg.agg = this.value; render(); });
  dom['wb-filter-col'].addEventListener('change', function () {
    wb.cfg.filterCol = this.value;
    wb.cfg.filterVal = '';
    buildFilterValues();
    render();
  });
  dom['wb-filter-val'].addEventListener('change', function () { wb.cfg.filterVal = this.value; render(); });
  dom['wb-filter-clear'].addEventListener('click', function () {
    wb.cfg.filterCol = '';
    wb.cfg.filterVal = '';
    dom['wb-filter-col'].value = '';
    buildFilterValues();
    render();
  });

  dom.wb.addEventListener('click', function (e) {
    if (e.target.closest('[data-act="clear-filter"]')) dom['wb-filter-clear'].click();
  });

  function setView(v) {
    if (v === 'examples') {
      if (window.Catalog) window.Catalog.select(wb.lastExample || 'grades');
      else if (window.Shell) window.Shell.setRail(true);
      return;
    }
    wb.view = v;
    syncView();
  }
  dom['wb-view-report'].addEventListener('click', function () { setView('report'); });
  dom['wb-view-detail'].addEventListener('click', function () { setView('detail'); });
  dom['wb-view-examples'].addEventListener('click', function () { setView('examples'); });

  function closePanel(returnFocus) {
    if (root.getAttribute('data-wb-panel') !== 'open') return;
    root.removeAttribute('data-wb-panel');
    dom['wb-panel-btn'].setAttribute('aria-expanded', 'false');
    if (returnFocus) dom['wb-panel-btn'].focus();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePanel(true);
  });
  document.addEventListener('click', function (e) {
    if (root.getAttribute('data-wb-panel') !== 'open') return;
    if (dom['wb-panel'].contains(e.target) || dom['wb-panel-btn'].contains(e.target)) return;
    closePanel(false);
  });

  dom['wb-panel-btn'].addEventListener('click', function () {
    if (root.getAttribute('data-wb-panel') === 'open') { closePanel(false); return; }
    root.setAttribute('data-wb-panel', 'open');
    this.setAttribute('aria-expanded', 'true');
    dom['wb-group'].focus();
  });

  /* 图表悬浮提示，沿用原看板的 tip 元素 */
  dom['wb-chart'].addEventListener('mousemove', function (e) {
    var mark = e.target.closest('[data-tip]');
    if (!mark) { dom.tip.hidden = true; return; }
    var lines = mark.getAttribute('data-tip').split('\n');
    dom.tip.innerHTML = lines.map(function (l, i) {
      return i === 0 ? '<strong>' + esc(l) + '</strong>' : '<span>' + esc(l) + '</span>';
    }).join('');
    dom.tip.hidden = false;
    var pad = 14;
    var x = e.clientX + pad, y = e.clientY + pad;
    var r = dom.tip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
    dom.tip.style.left = Math.max(8, x) + 'px';
    dom.tip.style.top = Math.max(8, y) + 'px';
  });
  dom['wb-chart'].addEventListener('mouseleave', function () { dom.tip.hidden = true; });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (window.Shell && !window.Shell.isCompact()) {
        root.removeAttribute('data-wb-panel');
        dom['wb-panel-btn'].setAttribute('aria-expanded', 'false');
      }
      if (wb.table && root.getAttribute('data-wb') === 'on') render();
    }, 220);
  });

  new MutationObserver(function () {
    if (wb.table && root.getAttribute('data-wb') === 'on') render();
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  function panelBtnVisibility() {
    dom['wb-panel-btn'].hidden = !(window.Shell && window.Shell.isCompact());
  }
  panelBtnVisibility();
  if (window.matchMedia) {
    var compact = window.matchMedia('(max-width: 899px)');
    if (compact.addEventListener) compact.addEventListener('change', panelBtnVisibility);
    else if (compact.addListener) compact.addListener(panelBtnVisibility);
  }

  window.Workbench = {
    onExample: function (id) { wb.lastExample = id; hideWorkbench(); },
    onClear: function () { hideWorkbench(); },
    open: openImport,
    table: function () { return wb.table; }
  };
})();
