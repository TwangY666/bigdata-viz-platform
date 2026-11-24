/* 自定义计算字段：安全表达式求值（词法 + 递归下降，不使用 eval） */
(function () {
  'use strict';

  var FUNCS = {
    abs: [1, 1, function (a) { return Math.abs(a[0]); }],
    round: [1, 2, function (a) { var k = Math.pow(10, a[1] == null ? 0 : a[1]); return Math.round(a[0] * k) / k; }],
    floor: [1, 1, function (a) { return Math.floor(a[0]); }],
    ceil: [1, 1, function (a) { return Math.ceil(a[0]); }],
    sqrt: [1, 1, function (a) { return Math.sqrt(a[0]); }],
    pow: [2, 2, function (a) { return Math.pow(a[0], a[1]); }],
    ln: [1, 1, function (a) { return Math.log(a[0]); }],
    log: [1, 1, function (a) { return Math.log(a[0]) / Math.LN10; }],
    exp: [1, 1, function (a) { return Math.exp(a[0]); }],
    min: [1, 8, function (a) { return Math.min.apply(null, a); }],
    max: [1, 8, function (a) { return Math.max.apply(null, a); }],
    len: [1, 1, function (a) { return String(a[0] == null ? '' : a[0]).length; }],
    num: [1, 1, function (a) { return toNum(a[0]); }],
    if: [3, 3, function (a) { return truthy(a[0]) ? a[1] : a[2]; }],
    coalesce: [2, 8, function (a) {
      for (var i = 0; i < a.length; i++) {
        if (a[i] != null && !(typeof a[i] === 'number' && !isFinite(a[i]))) return a[i];
      }
      return NaN;
    }]
  };

  function toNum(v) {
    if (typeof v === 'number') return v;
    if (v == null || v === '') return NaN;
    var n = parseFloat(String(v).replace(/[¥￥$,\s元%％]/g, ''));
    return isFinite(n) ? n : NaN;
  }

  function truthy(v) {
    if (typeof v === 'number') return isFinite(v) && v !== 0;
    return v != null && v !== '' && v !== '否' && v !== 'false';
  }

  function tokenize(src) {
    var out = [], i = 0, s = String(src);
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '[') {
        var end = s.indexOf(']', i);
        if (end < 0) throw new Error('字段引用缺少右括号 ]');
        out.push({ t: 'field', v: s.slice(i + 1, end).trim() });
        i = end + 1;
        continue;
      }
      if (c === '"' || c === "'") {
        var end2 = s.indexOf(c, i + 1);
        if (end2 < 0) throw new Error('文本缺少结束引号');
        out.push({ t: 'str', v: s.slice(i + 1, end2) });
        i = end2 + 1;
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        var m = /^\d*\.?\d+(e[-+]?\d+)?/i.exec(s.slice(i));
        if (!m) throw new Error('无法解析数字');
        out.push({ t: 'num', v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      var two = s.slice(i, i + 2);
      if (['>=', '<=', '==', '!=', '&&', '||'].indexOf(two) !== -1) {
        out.push({ t: 'op', v: two }); i += 2; continue;
      }
      if ('+-*/%^(),<>!'.indexOf(c) !== -1) {
        out.push({ t: 'op', v: c }); i++; continue;
      }
      var name = /^[A-Za-z_\u4e00-\u9fff][\w\u4e00-\u9fff]*/.exec(s.slice(i));
      if (name) {
        out.push({ t: 'name', v: name[0] });
        i += name[0].length;
        continue;
      }
      throw new Error('无法识别的字符「' + c + '」');
    }
    return out;
  }

  function compile(src, fields) {
    var known = fields || [];
    var refs = [];
    var tokens;
    try { tokens = tokenize(src); } catch (e) { return { error: e.message }; }
    if (!tokens.length) return { error: '表达式为空' };
    var pos = 0;

    function peek(v) { return tokens[pos] && tokens[pos].t === 'op' && tokens[pos].v === v; }
    function take() { return tokens[pos++]; }
    function expect(v) {
      if (!peek(v)) throw new Error('缺少「' + v + '」');
      pos++;
    }

    function binary(next, ops, apply) {
      return function () {
        var left = next();
        while (tokens[pos] && tokens[pos].t === 'op' && ops.indexOf(tokens[pos].v) !== -1) {
          var op = take().v;
          var right = next();
          left = apply(op, left, right);
        }
        return left;
      };
    }

    function primary() {
      var tk = take();
      if (!tk) throw new Error('表达式意外结束');
      if (tk.t === 'num') { var n = tk.v; return function () { return n; }; }
      if (tk.t === 'str') { var sv = tk.v; return function () { return sv; }; }
      if (tk.t === 'field') return fieldNode(tk.v);
      if (tk.t === 'name') {
        var lower = tk.v.toLowerCase();
        if (peek('(')) {
          var fn = FUNCS[lower];
          if (!fn) throw new Error('未知函数「' + tk.v + '」');
          expect('(');
          var args = [];
          if (!peek(')')) {
            args.push(orExpr());
            while (peek(',')) { take(); args.push(orExpr()); }
          }
          expect(')');
          if (args.length < fn[0] || args.length > fn[1]) {
            throw new Error('函数 ' + lower + ' 需要 ' + fn[0] + '–' + fn[1] + ' 个参数');
          }
          var impl = fn[2];
          return function (row) {
            return impl(args.map(function (a) { return a(row); }));
          };
        }
        if (known.indexOf(tk.v) !== -1) return fieldNode(tk.v);
        throw new Error('未知字段「' + tk.v + '」，可用 [字段名] 引用');
      }
      if (tk.t === 'op' && tk.v === '(') {
        var inner = orExpr();
        expect(')');
        return inner;
      }
      if (tk.t === 'op' && (tk.v === '-' || tk.v === '!')) {
        var operand = primary();
        return tk.v === '-'
          ? function (row) { return -toNum(operand(row)); }
          : function (row) { return truthy(operand(row)) ? 0 : 1; };
      }
      throw new Error('意外的符号「' + tk.v + '」');
    }

    function fieldNode(name) {
      if (known.indexOf(name) === -1) throw new Error('未知字段「' + name + '」');
      if (refs.indexOf(name) === -1) refs.push(name);
      return function (row) {
        var v = row[name];
        if (v == null || v === '') return NaN;
        return typeof v === 'number' ? v : v;
      };
    }

    function powExpr() {
      var base = primary();
      if (peek('^')) { take(); var exp = powExpr(); return function (r) { return Math.pow(toNum(base(r)), toNum(exp(r))); }; }
      return base;
    }

    var mulExpr = binary(powExpr, ['*', '/', '%'], function (op, a, b) {
      return function (r) {
        var x = toNum(a(r)), y = toNum(b(r));
        return op === '*' ? x * y : op === '/' ? x / y : x % y;
      };
    });
    var addExpr = binary(mulExpr, ['+', '-'], function (op, a, b) {
      return function (r) { return op === '+' ? toNum(a(r)) + toNum(b(r)) : toNum(a(r)) - toNum(b(r)); };
    });
    var cmpExpr = binary(addExpr, ['>', '<', '>=', '<=', '==', '!='], function (op, a, b) {
      return function (r) {
        var x = a(r), y = b(r);
        if (typeof x === 'string' || typeof y === 'string') {
          var sx = String(x == null ? '' : x), sy = String(y == null ? '' : y);
          if (op === '==') return sx === sy ? 1 : 0;
          if (op === '!=') return sx !== sy ? 1 : 0;
          x = sx; y = sy;
        } else { x = toNum(x); y = toNum(y); }
        if (op === '>') return x > y ? 1 : 0;
        if (op === '<') return x < y ? 1 : 0;
        if (op === '>=') return x >= y ? 1 : 0;
        if (op === '<=') return x <= y ? 1 : 0;
        if (op === '==') return x === y ? 1 : 0;
        return x !== y ? 1 : 0;
      };
    });
    var andExpr = binary(cmpExpr, ['&&'], function (op, a, b) {
      return function (r) { return truthy(a(r)) && truthy(b(r)) ? 1 : 0; };
    });
    var orExpr = binary(andExpr, ['||'], function (op, a, b) {
      return function (r) { return truthy(a(r)) || truthy(b(r)) ? 1 : 0; };
    });

    var root;
    try {
      root = orExpr();
      if (pos < tokens.length) throw new Error('表达式在「' + tokens[pos].v + '」之后有多余内容');
    } catch (e) { return { error: e.message }; }

    return {
      refs: refs,
      fn: function (row) {
        var v;
        try { v = root(row); } catch (e) { return null; }
        var n = toNum(v);
        if (!isFinite(n)) return null;
        return Math.round(n * 1e6) / 1e6;
      }
    };
  }

  /* defs: [{name, expr}]；返回新数组，附加计算列 */
  function evaluate(rows, defs, fields) {
    var compiled = [], errors = [];
    defs.forEach(function (d) {
      var c = compile(d.expr, fields);
      if (c.error) { errors.push(d.name + '：' + c.error); return; }
      compiled.push({ name: d.name, fn: c.fn });
    });
    if (!compiled.length) return { rows: rows, errors: errors };
    var out = rows.map(function (r) {
      var o = {};
      Object.keys(r).forEach(function (k) { o[k] = r[k]; });
      compiled.forEach(function (c) { o[c.name] = c.fn(r); });
      return o;
    });
    return { rows: out, errors: errors };
  }

  window.Calc = { compile: compile, evaluate: evaluate, FUNCS: Object.keys(FUNCS) };
})();