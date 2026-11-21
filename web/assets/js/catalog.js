(function () {
  'use strict';

  var CATEGORIES = [
    { id: 'campus', name: '校园学生类', hue: 'var(--c-series-1)' },
    { id: 'classic', name: '公共通用经典数据集', hue: 'var(--c-series-4)' },
    { id: 'life', name: '生活 & 社会类', hue: 'var(--c-series-2)' },
    { id: 'fun', name: '体育、娱乐类', hue: 'var(--c-series-3)' }
  ];

  var DATASETS = [
    { id: 'grades', cat: 'campus', icon: 'cap', name: '学生成绩数据集',
      fields: ['学号', '姓名', '各科分数', '学分', '班级', '性别'],
      dirs: ['平均分分布', '挂科统计', '不同科目分数对比', '班级成绩差异'],
      alias: '成绩 分数 挂科 GPA score grades student 学生' },
    { id: 'library', cat: 'campus', icon: 'book', name: '校园图书借阅数据',
      fields: ['借阅时间', '书籍分类', '借阅人', '归还日期'],
      dirs: ['哪类书最受欢迎', '借阅高峰时段'],
      alias: '图书 借阅 图书馆 书籍 library book borrow' },
    { id: 'attendance', cat: 'campus', icon: 'clock', name: '校园打卡 / 考勤数据',
      fields: ['日期', '学生', '打卡时间', '是否迟到'],
      dirs: ['迟到率', '早晚打卡分布'],
      alias: '考勤 打卡 迟到 出勤 attendance checkin clock' },
    { id: 'spending', cat: 'campus', icon: 'wallet', name: '学生消费数据',
      fields: ['时间', '金额', '消费类型'],
      dirs: ['开销结构', '时段消费趋势'],
      alias: '消费 开销 食堂 支出 spending consumption canteen' },
    { id: 'iris', cat: 'classic', icon: 'flower', name: '鸢尾花 Iris',
      fields: ['花萼', '花瓣长宽', '品种'],
      dirs: ['分类分布', '特征对比'],
      alias: 'iris 鸢尾花 花 分类 特征 fisher' },
    { id: 'titanic', cat: 'classic', icon: 'ship', name: '泰坦尼克号 Titanic',
      fields: ['乘客年龄', '舱位', '性别', '是否幸存'],
      dirs: ['生存率和性别 / 舱位 / 年龄的关系'],
      alias: 'titanic 泰坦尼克 生存 乘客 舱位 kaggle' },
    { id: 'housing', cat: 'classic', icon: 'home', name: '房价数据集', tag: 'Boston / 加州房价',
      fields: ['面积', '房间数', '区位', '房价'],
      dirs: ['房价和各个特征的相关性'],
      alias: '房价 boston 加州 housing price 回归 相关性' },
    { id: 'orders', cat: 'classic', icon: 'cart', name: '电商订单数据',
      fields: ['订单时间', '商品类别', '金额', '地区'],
      dirs: ['销量趋势', '品类占比'],
      alias: '电商 订单 销量 品类 ecommerce orders sales' },
    { id: 'weather', cat: 'life', icon: 'cloud', name: '天气数据',
      fields: ['日期', '城市', '气温', '降雨量', '湿度', '风速'],
      dirs: ['气温变化趋势', '月度降水统计', '温湿度关系', '天气状况构成'],
      alias: '天气 气温 温度 降雨 降水 湿度 风速 城市 weather climate' },
    { id: 'bikes', cat: 'life', icon: 'bike', name: '共享单车出行数据',
      fields: ['日期', '小时', '租借数量', '天气', '气温'],
      dirs: ['24 小时租借曲线', '工作日与周末对比', '天气对骑行的影响'],
      alias: '单车 骑行 租车 租借 出行 通勤 bike sharing cycling' },
    { id: 'tea', cat: 'life', icon: 'cup', name: '奶茶 / 外卖订单',
      fields: ['下单时间', '品类', '商品名', '金额', '门店', '渠道'],
      dirs: ['每日营业额', '高峰时段', '热销单品', '甜度偏好'],
      alias: '奶茶 外卖 茶饮 咖啡 订单 甜度 门店 tea delivery milk' },
    { id: 'players', cat: 'fun', icon: 'trophy', name: '比赛球员数据',
      fields: ['球员', '球队', '位置', '得分', '助攻', '篮板'],
      dirs: ['得分榜与助攻榜', '各位置产出对比', '技术统计相关性', '球队得分热力'],
      alias: '球员 得分 助攻 篮板 比赛 篮球 足球 player sports nba' },
    { id: 'movies', cat: 'fun', icon: 'film', name: '影视评分数据',
      fields: ['片名', '类型', '上映年份', '评分', '评分人数', '票房'],
      dirs: ['评分分布', '类型口碑排行', '年代评分走势', '高分影片榜'],
      alias: '电影 影视 评分 类型 年份 票房 movie film rating imdb' }
  ];

  var ICONS = {
    cap: '<path d="M12 4L2.5 8.6 12 13.2l9.5-4.6z"/><path d="M6.5 11v4.4c0 1.3 2.5 2.6 5.5 2.6s5.5-1.3 5.5-2.6V11"/><path d="M21.5 8.6v5"/>',
    book: '<path d="M12 6.2C10 4.7 7.6 4.2 4 4.2v13.6c3.6 0 6 .5 8 2 2-1.5 4.4-2 8-2V4.2c-3.6 0-6 .5-8 2z"/><path d="M12 6.2v13.6"/>',
    clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.1 2.1"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2.6"/><path d="M3 10h18"/><circle cx="16.6" cy="14.5" r="1.3"/>',
    flower: '<circle cx="12" cy="7.2" r="3.1"/><circle cx="12" cy="16.8" r="3.1"/><circle cx="7.2" cy="12" r="3.1"/><circle cx="16.8" cy="12" r="3.1"/><circle cx="12" cy="12" r="1.7"/>',
    ship: '<path d="M4 14.5h16l-2.2 4.5H6.2z"/><path d="M12 3.5v11"/><path d="M12 4.5l5.5 8H12z"/><path d="M12 7l-4 5.5h4"/><path d="M2.5 21c1.6 0 1.6-.9 3.2-.9s1.6.9 3.2.9 1.6-.9 3.2-.9 1.6.9 3.2.9 1.6-.9 3.2-.9 1.6.9 3 .9"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6.9 9.4V20h10.2V9.4"/><path d="M10 20v-5.2h4V20"/>',
    cart: '<circle cx="9.4" cy="19.6" r="1.5"/><circle cx="17.2" cy="19.6" r="1.5"/><path d="M3 4h2.2l2.5 11.4h10.6L21 7.6H6"/>',
    cloud: '<path d="M7.2 18.5h9.3a4.1 4.1 0 00.5-8.2 5.6 5.6 0 00-10.8 1.5 3.4 3.4 0 001 6.7z"/><path d="M8 21h.01M12 21h.01M16 21h.01"/>',
    bike: '<circle cx="6" cy="16.8" r="3.4"/><circle cx="18" cy="16.8" r="3.4"/><path d="M6 16.8l3.4-7.3h4.8l3.8 7.3"/><path d="M9.4 9.5l2.8 7.3h5.8"/><path d="M13.4 6.6h2.4"/>',
    cup: '<path d="M5.4 8.6h11.2v5.6a5 5 0 01-5 5h-1.2a5 5 0 01-5-5z"/><path d="M16.6 9.6h1.9a2.6 2.6 0 010 5.2h-1.9"/><path d="M9.2 8.6l1.4-4.2"/><path d="M4.4 8.6h13.2"/>',
    trophy: '<path d="M8 4h8v5.2a4 4 0 01-8 0z"/><path d="M8 5H4.6c0 3 1.4 4.6 3.4 4.6M16 5h3.4c0 3-1.4 4.6-3.4 4.6"/><path d="M12 13.2v3.2"/><path d="M8.6 20h6.8l-.8-3.6H9.4z"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="2.2"/><path d="M3 9.6h18"/><path d="M7.4 5l2 4.6M12.4 5l2 4.6M17.4 5l2 4.6"/><path d="M10.6 12.6l4 2.4-4 2.4z"/>'
  };

  var list = document.getElementById('catalog-list');
  var input = document.getElementById('catalog-search');
  var clearBtn = document.getElementById('search-clear');
  var kbdHint = document.querySelector('.search__kbd');
  var countEl = document.getElementById('catalog-count');
  var emptyEl = document.getElementById('catalog-empty');
  var emptyQuery = document.getElementById('catalog-empty-query');
  var emptyClear = document.getElementById('empty-clear');
  var badge = document.getElementById('catalog-badge');
  var plate = document.getElementById('plate');
  var hint = document.getElementById('canvas-hint');
  var now = document.getElementById('now');
  var nowNone = document.getElementById('now-none');
  var nowName = document.getElementById('now-name');
  var nowDot = document.getElementById('now-dot');
  var nowClear = document.getElementById('now-clear');

  var selectedId = null;
  var groupEls = {};
  var optionEls = {};

  function catOf(ds) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === ds.cat) return CATEGORIES[i];
    return CATEGORIES[0];
  }

  function indexOf(ds) { return DATASETS.indexOf(ds) + 1; }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function svgIcon(key) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[key] + '</svg>';
  }

  function build() {
    CATEGORIES.forEach(function (cat) {
      var group = document.createElement('div');
      group.className = 'catalog__group';
      group.setAttribute('role', 'group');
      var titleId = 'grp-' + cat.id;
      group.setAttribute('aria-labelledby', titleId);

      var title = document.createElement('h3');
      title.className = 'catalog__group-title';
      title.id = titleId;
      var dot = document.createElement('span');
      dot.className = 'catalog__group-dot';
      dot.style.setProperty('--hue', cat.hue);
      var label = document.createElement('span');
      label.textContent = cat.name;
      var num = document.createElement('span');
      num.className = 'catalog__group-n';
      title.appendChild(dot);
      title.appendChild(label);
      title.appendChild(num);
      group.appendChild(title);

      DATASETS.filter(function (d) { return d.cat === cat.id; }).forEach(function (ds) {
        var opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'opt';
        opt.id = 'opt-' + ds.id;
        opt.setAttribute('role', 'option');
        opt.setAttribute('aria-selected', 'false');
        opt.tabIndex = -1;
        opt.dataset.id = ds.id;
        opt.title = ds.name + '　字段：' + ds.fields.join('、') +
          (ds.dirs.length ? '　分析：' + ds.dirs.join('、') : '');

        var icon = document.createElement('span');
        icon.className = 'opt__icon';
        icon.style.setProperty('--hue', cat.hue);
        icon.innerHTML = svgIcon(ds.icon);

        var body = document.createElement('span');
        body.className = 'opt__body';
        var name = document.createElement('span');
        name.className = 'opt__name';
        name.textContent = ds.name;
        var meta = document.createElement('span');
        meta.className = 'opt__meta';
        meta.textContent = ds.fields.join(' · ');
        body.appendChild(name);
        body.appendChild(meta);

        var hit = document.createElement('span');
        hit.className = 'opt__hit';
        hit.hidden = true;

        var check = document.createElement('span');
        check.className = 'opt__check';
        check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

        opt.appendChild(icon);
        opt.appendChild(body);
        opt.appendChild(hit);
        opt.appendChild(check);
        opt.addEventListener('click', function () { select(ds.id); });
        group.appendChild(opt);
        optionEls[ds.id] = opt;
      });

      list.appendChild(group);
      groupEls[cat.id] = { root: group, num: num };
    });
    badge.textContent = String(DATASETS.length);
  }

  function nameRanges(name, tokens) {
    var lower = name.toLowerCase();
    var ranges = [];
    tokens.forEach(function (t) {
      var from = 0, i;
      while ((i = lower.indexOf(t, from)) !== -1) {
        ranges.push([i, i + t.length]);
        from = i + t.length;
      }
    });
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    ranges.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r);
    });
    return merged;
  }

  function paintName(el, name, tokens) {
    el.textContent = '';
    var ranges = nameRanges(name, tokens);
    if (!ranges.length) { el.textContent = name; return; }
    var cursor = 0;
    ranges.forEach(function (r) {
      if (r[0] > cursor) el.appendChild(document.createTextNode(name.slice(cursor, r[0])));
      var mark = document.createElement('mark');
      mark.textContent = name.slice(r[0], r[1]);
      el.appendChild(mark);
      cursor = r[1];
    });
    if (cursor < name.length) el.appendChild(document.createTextNode(name.slice(cursor)));
  }

  function tokensOf(query) {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function haystack(ds) {
    return [ds.name, ds.tag || '', ds.alias, catOf(ds).name, ds.fields.join(' '), ds.dirs.join(' ')]
      .join(' ').toLowerCase();
  }

  function filter() {
    var query = input.value.trim();
    var tokens = tokensOf(query);
    var visible = 0;

    DATASETS.forEach(function (ds) {
      var opt = optionEls[ds.id];
      var hay = haystack(ds);
      var match = tokens.every(function (t) { return hay.indexOf(t) !== -1; });
      opt.hidden = !match;
      if (!match) return;
      visible++;

      var nameEl = opt.querySelector('.opt__name');
      paintName(nameEl, ds.name, tokens);

      var hit = opt.querySelector('.opt__hit');
      var inName = tokens.some(function (t) { return ds.name.toLowerCase().indexOf(t) !== -1; });
      if (!tokens.length || inName) {
        hit.hidden = true;
      } else {
        var where = tokens.some(function (t) { return ds.fields.join(' ').toLowerCase().indexOf(t) !== -1; })
          ? '字段匹配'
          : (tokens.some(function (t) { return ds.dirs.join(' ').toLowerCase().indexOf(t) !== -1; })
            ? '分析方向匹配' : '别名匹配');
        hit.textContent = where;
        hit.hidden = false;
      }
    });

    CATEGORIES.forEach(function (cat) {
      var g = groupEls[cat.id];
      var n = DATASETS.filter(function (d) { return d.cat === cat.id && !optionEls[d.id].hidden; }).length;
      g.root.hidden = n === 0;
      g.num.textContent = String(n);
    });

    countEl.textContent = tokens.length
      ? '匹配 ' + visible + ' / ' + DATASETS.length + ' 个数据集'
      : '共 ' + DATASETS.length + ' 个数据集 · ' + CATEGORIES.length + ' 个分类';
    clearBtn.hidden = query.length === 0;
    kbdHint.hidden = query.length > 0;
    emptyEl.hidden = visible !== 0;
    list.hidden = visible === 0;
    if (!visible) emptyQuery.textContent = '「' + query + '」';
    rove();
  }

  function visibleOptions() {
    return DATASETS.map(function (d) { return optionEls[d.id]; }).filter(function (o) { return !o.hidden; });
  }

  function rove() {
    var opts = visibleOptions();
    if (!opts.length) return;
    var current = opts.filter(function (o) { return o.tabIndex === 0; })[0];
    var active = optionEls[selectedId];
    var target = (active && !active.hidden) ? active : (current || opts[0]);
    opts.forEach(function (o) { o.tabIndex = o === target ? 0 : -1; });
  }

  function isReady(ds) {
    return !!(window.Dash && window.DATA && window.DATA.SCHEMAS[ds.id]);
  }

  function readyNames() {
    return CATEGORIES.filter(function (cat) {
      return DATASETS.some(function (d) { return d.cat === cat.id && isReady(d); });
    }).map(function (cat) { return cat.name; });
  }

  function renderPlate(ds) {
    var cat = catOf(ds);
    var html = '';
    html += '<p class="plate__eyebrow"><span class="plate__dot" style="--hue:' + cat.hue + '"></span>' +
      cat.name + '<span class="plate__index">' + pad(indexOf(ds)) + ' / ' + pad(DATASETS.length) + '</span></p>';
    html += '<h2 class="plate__title">' + ds.name + '</h2>';
    if (ds.tag) html += '<p class="plate__tag">' + ds.tag + '</p>';
    html += '<div class="plate__group"><h3>字段</h3><ul class="chips">';
    ds.fields.forEach(function (f) { html += '<li class="chip">' + f + '</li>'; });
    html += '</ul></div>';
    if (ds.dirs.length) {
      html += '<div class="plate__group"><h3>分析方向</h3><ul class="chips chips--dir">';
      ds.dirs.forEach(function (d) { html += '<li class="chip chip--dir">' + d + '</li>'; });
      html += '</ul></div>';
    }
    var done = readyNames();
    html += '<div class="plate__status"><span class="pulse" aria-hidden="true"></span>' +
      '<span>' + (isReady(ds) ? '看板已就绪' : '该分类看板待构建 · 已就绪：' + (done.length ? done.join('、') : '暂无')) + '</span>' +
      '<button class="ghost-btn" type="button" data-act="clear">清除选择</button></div>';
    plate.innerHTML = html;
  }

  function select(id, persist) {
    var ds = null;
    for (var i = 0; i < DATASETS.length; i++) if (DATASETS[i].id === id) ds = DATASETS[i];
    if (!ds) return;
    selectedId = id;

    DATASETS.forEach(function (d) {
      var o = optionEls[d.id];
      o.setAttribute('aria-selected', String(d.id === id));
      o.classList.toggle('is-active', d.id === id);
    });

    renderPlate(ds);
    var ready = isReady(ds);
    if (ready) {
      window.Dash.open(ds);
      plate.hidden = true;
    } else {
      if (window.Dash) window.Dash.close();
      plate.hidden = false;
    }
    hint.hidden = true;
    now.hidden = false;
    nowNone.hidden = true;
    nowName.textContent = ds.name;
    nowDot.style.setProperty('--hue', catOf(ds).hue);
    var nowState = document.getElementById('now-state');
    if (nowState) nowState.textContent = ready ? '看板已就绪' : '内容待配置';
    document.title = ds.name + ' · 数据分析看板';

    if (persist !== false) {
      try { localStorage.setItem('console.dataset', id); } catch (e) {}
    }
    rove();
    if (window.Shell && window.Shell.isCompact()) window.Shell.setRail(false);
  }

  function clearSelection() {
    selectedId = null;
    DATASETS.forEach(function (d) {
      optionEls[d.id].setAttribute('aria-selected', 'false');
      optionEls[d.id].classList.remove('is-active');
    });
    if (window.Dash) window.Dash.close();
    plate.hidden = true;
    plate.innerHTML = '';
    hint.hidden = false;
    now.hidden = true;
    nowNone.hidden = false;
    document.title = '数据分析看板';
    try { localStorage.removeItem('console.dataset'); } catch (e) {}
    rove();
  }

  input.addEventListener('input', filter);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && input.value) {
      e.stopPropagation();
      input.value = '';
      filter();
    } else if (e.key === 'ArrowDown') {
      var first = visibleOptions()[0];
      if (first) { e.preventDefault(); first.tabIndex = 0; first.focus(); }
    } else if (e.key === 'Enter') {
      var top = visibleOptions()[0];
      if (top) { e.preventDefault(); select(top.dataset.id); }
    }
  });

  function resetSearch() {
    input.value = '';
    filter();
    input.focus();
  }
  clearBtn.addEventListener('click', resetSearch);
  emptyClear.addEventListener('click', resetSearch);

  list.addEventListener('keydown', function (e) {
    var opts = visibleOptions();
    if (!opts.length) return;
    var i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      var next;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = opts.length - 1;
      else if (e.key === 'ArrowDown') next = i < 0 ? 0 : Math.min(opts.length - 1, i + 1);
      else next = i < 0 ? opts.length - 1 : Math.max(0, i - 1);
      opts.forEach(function (o, j) { o.tabIndex = j === next ? 0 : -1; });
      opts[next].focus();
    } else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) {
      e.preventDefault();
      select(opts[i].dataset.id);
    }
  });

  plate.addEventListener('click', function (e) {
    if (e.target.closest('[data-act="clear"]')) clearSelection();
  });
  nowClear.addEventListener('click', clearSelection);

  build();
  filter();

  var saved = null;
  try { saved = localStorage.getItem('console.dataset'); } catch (e) {}
  if (saved && DATASETS.some(function (d) { return d.id === saved; })) select(saved, false);
  else select('grades');

  window.Catalog = {
    focusSearch: function () { input.focus(); input.select(); },
    hasQuery: function () { return input.value.length > 0; },
    clearQuery: function () { input.value = ''; filter(); },
    categoryOf: function (id) {
      for (var i = 0; i < DATASETS.length; i++) if (DATASETS[i].id === id) return catOf(DATASETS[i]).name;
      return '';
    }
  };
})();