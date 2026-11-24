/* 数据集：种子数据、字段映射、文件解析 */
(function () {
  'use strict';

  var MAX_ROWS = 300000;
  var MAX_FILE_BYTES = 64 * 1048576;

  var SUBJECTS = ['数学', '语文', '英语', '物理', '化学'];
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var IRIS_FEATURES = ['花萼长', '花萼宽', '花瓣长', '花瓣宽'];
  var IRIS_SPECIES = ['山鸢尾', '变色鸢尾', '维吉尼亚鸢尾'];
  var AGE_BANDS = ['儿童', '少年', '青年', '中年', '长者'];
  var AREA_BANDS = ['小户型', '中户型', '大户型', '超大户型'];
  var HOUSE_AGE_BANDS = ['新房', '次新房', '普通住宅', '老旧住宅'];
  var ORDER_SLOTS = ['凌晨', '上午', '下午', '晚间'];
  var SEASONS = ['春', '夏', '秋', '冬'];
  var RAIN_LEVELS = ['无雨', '小雨', '中雨', '大雨', '暴雨'];
  var BIKE_SLOTS = ['凌晨', '早高峰', '上午', '午间', '下午', '晚高峰', '夜间'];
  var BIKE_WEATHER = ['晴', '多云', '阴', '小雨', '大雨'];
  var TEA_CATS = ['奶茶', '果茶', '纯茶', '咖啡', '冰沙', '小食'];
  var TEA_SUGAR = ['标准糖', '七分糖', '五分糖', '三分糖', '无糖'];
  var POSITIONS = ['控球后卫', '得分后卫', '小前锋', '大前锋', '中锋'];
  var SCORE_BANDS = ['角色球员', '轮换球员', '主力球员', '核心球员'];
  var GENRES = ['剧情', '喜剧', '动作', '科幻', '悬疑', '动画', '爱情', '恐怖', '纪录片', '犯罪'];
  var RATING_BANDS = ['不及格', '平庸', '良好', '优秀', '神作'];
  var DECADES = ['90年代', '00年代', '10年代', '20年代'];

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(r) {
    var u = Math.max(r(), 1e-9), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

  function weighted(r, pairs) {
    var total = 0, i;
    for (i = 0; i < pairs.length; i++) total += pairs[i][1];
    var x = r() * total;
    for (i = 0; i < pairs.length; i++) {
      x -= pairs[i][1];
      if (x <= 0) return pairs[i][0];
    }
    return pairs[pairs.length - 1][0];
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addDays(dateStr, n) {
    var p = dateStr.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return iso(d);
  }

  function dayIndex(dateStr) {
    var p = dateStr.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).getDay();
  }

  var SURNAME = ['林', '沈', '陆', '苏', '顾', '叶', '江', '秦', '许', '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶'];
  var GIVEN = ['知远', '静怡', '承宇', '若彤', '子墨', '嘉树', '念安', '清越', '明轩', '书瑶', '亦凡', '南乔', '景行', '听澜', '慕白', '星辞', '砚秋', '昭华', '予安', '望舒', '其琛', '云舟', '疏桐', '既明'];

  function personPool(r, n) {
    var out = [], used = {};
    while (out.length < n) {
      var name = pick(r, SURNAME) + pick(r, GIVEN);
      if (used[name]) continue;
      used[name] = 1;
      out.push(name);
    }
    return out;
  }

  /* ---------- schema ---------- */

  var SCHEMAS = {
    grades: {
      label: '学生成绩',
      columns: [
        { key: '学号', type: 'cat', aliases: ['学号', 'student_id', 'id', '编号', '学籍号'] },
        { key: '姓名', type: 'cat', aliases: ['姓名', 'name', '学生姓名', '学生'] },
        { key: '班级', type: 'cat', aliases: ['班级', 'class', '班别', '行政班'] },
        { key: '性别', type: 'cat', aliases: ['性别', 'gender', 'sex'] },
        { key: '数学', type: 'num', aliases: ['数学', 'math', 'maths', '数学分数'] },
        { key: '语文', type: 'num', aliases: ['语文', 'chinese', '语文分数'] },
        { key: '英语', type: 'num', aliases: ['英语', 'english', '英语分数'] },
        { key: '物理', type: 'num', aliases: ['物理', 'physics', '物理分数'] },
        { key: '化学', type: 'num', aliases: ['化学', 'chemistry', '化学分数'] },
        { key: '学分', type: 'num', aliases: ['学分', 'credit', 'credits', '已修学分'] },
        { key: '平均分', type: 'num', aliases: ['平均分', '均分', '平均成绩', '平均分数', 'average', 'avg', 'mean_score'] },
        { key: '总分', type: 'num', aliases: ['总分', '总成绩', '总分数', 'total', 'sum', '合计'] }
      ],
      usable: function (p) {
        return p.indexOf('平均分') !== -1 || SUBJECTS.some(function (s) { return p.indexOf(s) !== -1; });
      },
      hint: '至少包含一科分数（数学 / 语文 / 英语 / 物理 / 化学）或平均分'
    },
    library: {
      label: '图书借阅',
      columns: [
        { key: '借阅时间', type: 'datetime', aliases: ['借阅时间', '借出时间', '借出日期', '借书日期', '借书时间', 'borrow_time', 'loan_date', '借阅日期', '时间'] },
        { key: '书籍分类', type: 'cat', aliases: ['书籍分类', '分类', '类别', 'category', 'book_type', '图书分类'] },
        { key: '借阅人', type: 'cat', aliases: ['借阅人', '读者', '借阅者', 'borrower', 'reader', '姓名'] },
        { key: '归还日期', type: 'date', aliases: ['归还日期', '归还时间', '还书时间', 'return_date', '还书日期'] }
      ],
      usable: function (p) {
        return ['书籍分类', '借阅时间', '借阅人', '归还日期'].some(function (k) { return p.indexOf(k) !== -1; });
      },
      hint: '至少包含借阅时间、书籍分类、借阅人、归还日期之一'
    },
    attendance: {
      label: '打卡考勤',
      columns: [
        { key: '日期', type: 'date', aliases: ['日期', 'date', '打卡日期', '考勤日期'] },
        { key: '学生', type: 'cat', aliases: ['学生', '姓名', 'student', 'name', '学号', '学生姓名'] },
        { key: '打卡时间', type: 'time', aliases: ['打卡时间', '时间', 'checkin_time', 'time', '时刻', '签到时间'] },
        { key: '是否迟到', type: 'bool', aliases: ['是否迟到', '迟到', 'late', 'is_late', '状态', '考勤状态'] }
      ],
      usable: function (p) {
        return ['打卡时间', '是否迟到', '日期'].some(function (k) { return p.indexOf(k) !== -1; });
      },
      hint: '至少包含日期、打卡时间、是否迟到之一'
    },
    spending: {
      label: '学生消费',
      columns: [
        { key: '时间', type: 'datetime', aliases: ['时间', '消费时间', 'datetime', 'date', '日期', '交易时间'] },
        { key: '金额', type: 'num', aliases: ['金额', 'amount', 'price', '消费金额', '支出', '花费'] },
        { key: '消费类型', type: 'cat', aliases: ['消费类型', '类型', '类别', 'category', 'type', '用途', '商户类型'] }
      ],
      usable: function (p) { return p.indexOf('金额') !== -1; },
      hint: '必须包含金额列，建议同时包含时间与消费类型'
    },
    iris: {
      label: '鸢尾花',
      columns: [
        { key: '编号', type: 'cat', aliases: ['编号', 'id', 'sample_id', '样本号', '样本编号'] },
        { key: '品种', type: 'cat', aliases: ['品种', 'species', '类别', '分类', 'class', '花种', 'iris_species'] },
        { key: '花萼长', type: 'num', aliases: ['花萼长', '花萼长度', '萼片长', '萼片长度', 'sepal_length', 'sepallength'] },
        { key: '花萼宽', type: 'num', aliases: ['花萼宽', '花萼宽度', '萼片宽', '萼片宽度', 'sepal_width', 'sepalwidth'] },
        { key: '花瓣长', type: 'num', aliases: ['花瓣长', '花瓣长度', 'petal_length', 'petallength'] },
        { key: '花瓣宽', type: 'num', aliases: ['花瓣宽', '花瓣宽度', 'petal_width', 'petalwidth'] }
      ],
      usable: function (p) {
        return p.indexOf('品种') !== -1 || IRIS_FEATURES.filter(function (f) { return p.indexOf(f) !== -1; }).length >= 2;
      },
      hint: '至少包含品种，或花萼长 / 花萼宽 / 花瓣长 / 花瓣宽中的两项'
    },
    titanic: {
      label: '泰坦尼克',
      columns: [
        { key: '乘客编号', type: 'cat', aliases: ['乘客编号', 'passengerid', 'id', '编号'] },
        { key: '姓名', type: 'cat', aliases: ['姓名', 'name', '乘客姓名', 'passenger_name'] },
        { key: '是否幸存', type: 'bool', aliases: ['是否幸存', '幸存', 'survived', '生还', '是否生还', 'survival'] },
        { key: '舱位', type: 'cat', aliases: ['舱位', 'pclass', '舱位等级', '客舱等级', '船舱等级', 'class'] },
        { key: '性别', type: 'cat', aliases: ['性别', 'sex', 'gender'] },
        { key: '年龄', type: 'num', aliases: ['年龄', 'age', '乘客年龄'] },
        { key: '票价', type: 'num', aliases: ['票价', 'fare', '船票价格', '船票票价'] },
        { key: '登船港口', type: 'cat', aliases: ['登船港口', 'embarked', '港口', '登船港', 'embarkation'] }
      ],
      usable: function (p) {
        return ['是否幸存', '舱位', '性别', '年龄', '票价'].some(function (k) { return p.indexOf(k) !== -1; });
      },
      hint: '至少包含是否幸存、舱位、性别、年龄、票价之一'
    },
    housing: {
      label: '房价',
      columns: [
        { key: '区位', type: 'cat', aliases: ['区位', '地区', '区域', '板块', '街区', 'neighborhood', 'location', 'district', '城市'] },
        { key: '面积', type: 'num', aliases: ['面积', '建筑面积', '房屋面积', 'area', 'size', 'square_meters', '平方米'] },
        { key: '房间数', type: 'num', aliases: ['房间数', '卧室数', '卧室数量', '居室数', 'bedrooms', 'rooms', 'room_count'] },
        { key: '房龄', type: 'num', aliases: ['房龄', '楼龄', '建筑年龄', 'house_age', 'age'] },
        { key: '距市中心', type: 'num', aliases: ['距市中心', '距市中心距离', '通勤距离', 'distance', 'distance_to_center', '距离'] },
        { key: '房价', type: 'num', aliases: ['房价', '总价', '房屋总价', '售价', 'price', 'medv', 'median_house_value', 'sale_price'] },
        { key: '单价', type: 'num', aliases: ['单价', '每平米单价', 'unit_price', 'price_per_sqm', '均价'] }
      ],
      usable: function (p) { return p.indexOf('房价') !== -1 || p.indexOf('单价') !== -1; },
      hint: '必须包含房价或单价列，建议同时包含面积 / 房间数 / 区位'
    },
    orders: {
      label: '电商订单',
      columns: [
        { key: '订单号', type: 'cat', aliases: ['订单号', '订单编号', 'order_id', 'id', '编号'] },
        { key: '订单时间', type: 'datetime', aliases: ['订单时间', '下单时间', 'order_time', 'order_date', '时间', '日期', '创建时间', '交易时间'] },
        { key: '商品类别', type: 'cat', aliases: ['商品类别', '商品分类', '品类', '类别', '分类', 'category', '类型'] },
        { key: '金额', type: 'num', aliases: ['金额', '订单金额', '实付金额', '销售额', '总价', 'amount', 'price'] },
        { key: '数量', type: 'num', aliases: ['数量', '购买数量', '件数', 'quantity', 'qty'] },
        { key: '地区', type: 'cat', aliases: ['地区', '收货地区', '区域', '省份', 'region', 'province', '城市'] },
        { key: '支付方式', type: 'cat', aliases: ['支付方式', '付款方式', 'payment', 'payment_method'] },
        { key: '是否退款', type: 'bool', aliases: ['是否退款', '退款', '是否退货', 'refunded', '退货'] }
      ],
      usable: function (p) { return p.indexOf('金额') !== -1; },
      hint: '必须包含金额列，建议同时包含订单时间 / 商品类别 / 地区'
    },
    weather: {
      label: '天气',
      columns: [
        { key: '日期', type: 'date', aliases: ['日期', 'date', '观测日期', '记录日期', '时间', 'day', 'datetime', '统计日期'] },
        { key: '城市', type: 'cat', aliases: ['城市', '站点', '地区', '观测站', 'city', 'station', 'location', '区域'] },
        { key: '平均气温', type: 'num', aliases: ['平均气温', '气温', '平均温度', '温度', 'temp', 'temperature', 'tavg', 'mean_temp', '日均气温'] },
        { key: '最高温', type: 'num', aliases: ['最高温', '最高气温', '最高温度', 'temp_max', 'tmax', 'temperature_max', '白天温度'] },
        { key: '最低温', type: 'num', aliases: ['最低温', '最低气温', '最低温度', 'temp_min', 'tmin', 'temperature_min', '夜间温度'] },
        { key: '降雨量', type: 'num', aliases: ['降雨量', '降水量', '降水', '雨量', 'precipitation', 'precip', 'rain', 'rainfall', 'prcp'] },
        { key: '湿度', type: 'num', aliases: ['湿度', '相对湿度', 'humidity', 'rh', 'relative_humidity'] },
        { key: '风速', type: 'num', aliases: ['风速', '风力', 'wind', 'wind_speed', 'windspeed', '平均风速'] },
        { key: '天气状况', type: 'cat', aliases: ['天气状况', '天气', '天况', '天气类型', 'condition', 'weather', 'weathersit'] }
      ],
      usable: function (p) {
        return ['平均气温', '最高温', '最低温', '降雨量'].some(function (k) { return p.indexOf(k) !== -1; });
      },
      hint: '至少包含气温（平均 / 最高 / 最低）或降雨量之一，建议同时包含日期与城市'
    },
    bikes: {
      label: '共享单车',
      columns: [
        { key: '日期', type: 'date', aliases: ['日期', 'date', 'dteday', '时间', '骑行日期', 'day'] },
        { key: '小时', type: 'num', aliases: ['小时', 'hour', 'hr', '钟点', '时段', '时刻'] },
        { key: '租借数量', type: 'num', aliases: ['租借数量', '租车量', '租借量', '骑行量', '租用量', 'cnt', 'count', 'rentals', 'total_count', '数量', '订单数'] },
        { key: '天气', type: 'cat', aliases: ['天气', '天气状况', '天况', 'weather', 'weathersit', 'condition'] },
        { key: '气温', type: 'num', aliases: ['气温', '温度', 'temp', 'atemp', 'temperature', '体感温度'] },
        { key: '湿度', type: 'num', aliases: ['湿度', '相对湿度', 'humidity', 'hum'] },
        { key: '风速', type: 'num', aliases: ['风速', '风力', 'wind', 'windspeed', 'wind_speed'] },
        { key: '是否工作日', type: 'bool', aliases: ['是否工作日', '工作日', 'workingday', '是否上班', '工作日标记'] }
      ],
      usable: function (p) { return p.indexOf('租借数量') !== -1; },
      hint: '必须包含租借数量列，建议同时包含日期 / 小时 / 天气'
    },
    tea: {
      label: '奶茶外卖',
      columns: [
        { key: '订单号', type: 'cat', aliases: ['订单号', '订单编号', 'order_id', 'id', '编号', '单号'] },
        { key: '下单时间', type: 'datetime', aliases: ['下单时间', '订单时间', '时间', '日期', 'order_time', 'created_at', '交易时间', '购买时间'] },
        { key: '品类', type: 'cat', aliases: ['品类', '商品类别', '商品分类', '分类', '类别', 'category', '类型', '茶饮类型'] },
        { key: '商品名', type: 'cat', aliases: ['商品名', '商品名称', '品名', '单品', 'product', 'item', '商品', '名称'] },
        { key: '价格', type: 'num', aliases: ['价格', '单价', '售价', 'price', 'unit_price', '每杯价格'] },
        { key: '金额', type: 'num', aliases: ['金额', '实付金额', '订单金额', '总价', '支付金额', 'amount', 'total', '实付'] },
        { key: '数量', type: 'num', aliases: ['数量', '杯数', '件数', 'quantity', 'qty', '购买数量'] },
        { key: '门店', type: 'cat', aliases: ['门店', '店铺', '分店', 'store', 'shop', '门店名称', '商家'] },
        { key: '渠道', type: 'cat', aliases: ['渠道', '下单渠道', '来源', 'channel', 'platform', '平台', '订单来源'] },
        { key: '甜度', type: 'cat', aliases: ['甜度', '糖度', 'sugar', 'sweetness', '糖分'] }
      ],
      usable: function (p) { return p.indexOf('金额') !== -1 || p.indexOf('价格') !== -1; },
      hint: '必须包含金额或价格列，建议同时包含下单时间 / 品类 / 数量'
    },
    players: {
      label: '球员数据',
      columns: [
        { key: '球员', type: 'cat', aliases: ['球员', '姓名', '球员姓名', 'player', 'name', '选手'] },
        { key: '球队', type: 'cat', aliases: ['球队', '队伍', 'team', '俱乐部', '所属球队', '球会'] },
        { key: '位置', type: 'cat', aliases: ['位置', '场上位置', '司职', 'position', 'pos'] },
        { key: '得分', type: 'num', aliases: ['得分', '场均得分', 'pts', 'points', 'score', '分数', '进球'] },
        { key: '助攻', type: 'num', aliases: ['助攻', '场均助攻', 'ast', 'assists', '助攻数'] },
        { key: '篮板', type: 'num', aliases: ['篮板', '场均篮板', 'reb', 'rebounds', '篮板球'] },
        { key: '抢断', type: 'num', aliases: ['抢断', 'stl', 'steals', '抢断数'] },
        { key: '盖帽', type: 'num', aliases: ['盖帽', 'blk', 'blocks', '封盖'] },
        { key: '失误', type: 'num', aliases: ['失误', 'tov', 'turnovers', '失误数'] },
        { key: '出场时间', type: 'num', aliases: ['出场时间', '上场时间', '分钟', 'minutes', 'mp', 'mins', '场均时间'] },
        { key: '命中率', type: 'num', aliases: ['命中率', '投篮命中率', 'fg_pct', 'shooting', '投篮命中率(%)'] }
      ],
      usable: function (p) { return p.indexOf('得分') !== -1 || p.indexOf('助攻') !== -1; },
      hint: '至少包含得分或助攻列，建议同时包含球员 / 位置 / 篮板'
    },
    movies: {
      label: '影视评分',
      columns: [
        { key: '片名', type: 'cat', aliases: ['片名', '电影名', '影片', '名称', 'title', 'name', '电影名称'] },
        { key: '类型', type: 'cat', aliases: ['类型', '题材', 'genre', 'genres', '分类', '影片类型', '类别'] },
        { key: '上映年份', type: 'num', aliases: ['上映年份', '年份', 'year', 'release_year', '年代', '上映时间'] },
        { key: '评分', type: 'num', aliases: ['评分', '电影评分', '豆瓣评分', 'rating', 'score', 'imdb_rating', '分数', '星级'] },
        { key: '评分人数', type: 'num', aliases: ['评分人数', '评价人数', '投票数', 'votes', 'vote_count', 'ratings', '人数'] },
        { key: '时长', type: 'num', aliases: ['时长', '片长', 'runtime', 'duration', 'minutes', '分钟'] },
        { key: '导演', type: 'cat', aliases: ['导演', 'director', '导演姓名'] },
        { key: '地区', type: 'cat', aliases: ['地区', '国家', '制片国家', 'country', 'region', '产地', '制片地区'] },
        { key: '票房', type: 'num', aliases: ['票房', '总票房', 'box_office', 'gross', 'revenue', '票房收入'] }
      ],
      usable: function (p) { return p.indexOf('评分') !== -1; },
      hint: '必须包含评分列，建议同时包含类型 / 上映年份 / 片名'
    }
  };

  /* ---------- 种子数据 ---------- */

  function seedGrades() {
    var r = rng(20230901);
    var classes = ['一班', '二班', '三班', '四班'];
    var base = [78, 73, 82, 69];
    var offset = { '数学': -5, '语文': 4, '英语': 1, '物理': -7, '化学': -2 };
    var rows = [];
    classes.forEach(function (cls, ci) {
      for (var i = 1; i <= 30; i++) {
        var row = {
          '学号': '2023' + (ci + 1) + pad(i),
          '姓名': SURNAME[(ci * 7 + i) % SURNAME.length] + GIVEN[(ci * 5 + i * 3) % GIVEN.length],
          '班级': cls,
          '性别': r() < 0.52 ? '男' : '女'
        };
        var sum = 0, n = 0;
        SUBJECTS.forEach(function (s) {
          var v = Math.round(base[ci] + offset[s] + gauss(r) * 11);
          v = Math.max(24, Math.min(100, v));
          row[s] = v;
          sum += v; n++;
        });
        row['总分'] = sum;
        row['平均分'] = Math.round(sum / n * 10) / 10;
        row['学分'] = Math.max(12, Math.min(32, Math.round(19 + (row['平均分'] - 72) / 5 + gauss(r) * 2)));
        rows.push(row);
      }
    });
    return rows;
  }

  function seedLibrary() {
    var r = rng(771203);
    var readers = personPool(r, 42);
    var cats = [['文学', 26], ['科技', 20], ['教辅', 18], ['历史', 12], ['艺术', 12], ['漫画', 12]];
    var hours = [[9, 8], [10, 10], [11, 9], [12, 4], [14, 9], [15, 11], [16, 12], [17, 8], [19, 10], [20, 9], [21, 5]];
    var start = new Date(2026, 2, 1);
    var rows = [];
    for (var i = 0; i < 268; i++) {
      var d = new Date(start.getTime());
      d.setDate(d.getDate() + Math.floor(r() * 184));
      if (d.getDay() === 0 && r() < 0.6) d.setDate(d.getDate() + 1);
      var date = iso(d);
      var hour = weighted(r, hours);
      var dur = 3 + Math.floor(Math.pow(r(), 1.7) * 44);
      var back = r() < 0.06 ? '' : addDays(date, dur);
      rows.push({
        '借阅时间': date + ' ' + pad(hour) + ':' + pad(Math.floor(r() * 60)),
        '书籍分类': weighted(r, cats),
        '借阅人': pick(r, readers),
        '归还日期': back
      });
    }
    rows.sort(function (a, b) { return a['借阅时间'] < b['借阅时间'] ? -1 : 1; });
    return rows;
  }

  function seedAttendance() {
    var r = rng(410922);
    var students = personPool(r, 16);
    var propensity = students.map(function () { return r(); });
    var rows = [];
    for (var day = 1; day <= 30; day++) {
      var date = '2026-09-' + pad(day);
      students.forEach(function (name, si) {
        var drift = propensity[si] * 22;
        var am = Math.round(468 + drift + gauss(r) * 13);
        var pm = Math.round(1288 + drift * 0.6 + gauss(r) * 24);
        am = Math.max(400, Math.min(560, am));
        pm = Math.max(1200, Math.min(1400, pm));
        rows.push({ '日期': date, '学生': name, '打卡时间': pad(Math.floor(am / 60)) + ':' + pad(am % 60), '是否迟到': am > 480 ? '是' : '否' });
        rows.push({ '日期': date, '学生': name, '打卡时间': pad(Math.floor(pm / 60)) + ':' + pad(pm % 60), '是否迟到': pm > 1320 ? '是' : '否' });
      });
    }
    return rows;
  }

  function seedSpending() {
    var r = rng(880417);
    var types = [['餐饮', 42], ['超市', 17], ['交通', 12], ['文具', 10], ['娱乐', 13], ['通讯', 6]];
    var hoursBy = {
      '餐饮': [7, 8, 11, 12, 13, 17, 18, 19],
      '超市': [16, 17, 18, 19, 20, 21],
      '交通': [7, 8, 12, 17, 18, 21],
      '文具': [10, 11, 14, 15, 16],
      '娱乐': [18, 19, 20, 21, 22],
      '通讯': [9, 12, 20, 21]
    };
    var range = { '餐饮': [6, 34], '超市': [14, 128], '交通': [2, 12], '文具': [4, 46], '娱乐': [18, 156], '通讯': [19, 60] };
    var rows = [];
    for (var i = 0; i < 342; i++) {
      var type = weighted(r, types);
      var day = 1 + Math.floor(r() * 31);
      var hour = pick(r, hoursBy[type]);
      var lo = range[type][0], hi = range[type][1];
      var amount = Math.round((lo + Math.pow(r(), 1.5) * (hi - lo)) * 10) / 10;
      rows.push({
        '时间': '2026-10-' + pad(day) + ' ' + pad(hour) + ':' + pad(Math.floor(r() * 60)),
        '金额': amount,
        '消费类型': type
      });
    }
    rows.sort(function (a, b) { return a['时间'] < b['时间'] ? -1 : 1; });
    return rows;
  }

  function ageBand(a) {
    return a < 14 ? '儿童' : a < 25 ? '少年' : a < 45 ? '青年' : a < 65 ? '中年' : '长者';
  }
  function areaBand(a) {
    return a < 70 ? '小户型' : a < 110 ? '中户型' : a < 160 ? '大户型' : '超大户型';
  }
  function houseAgeBand(a) {
    return a < 5 ? '新房' : a < 15 ? '次新房' : a < 30 ? '普通住宅' : '老旧住宅';
  }

  var IRIS_STATS = {
    '山鸢尾': [[5.006, 0.352], [3.428, 0.379], [1.462, 0.174], [0.246, 0.105]],
    '变色鸢尾': [[5.936, 0.516], [2.770, 0.314], [4.260, 0.470], [1.326, 0.198]],
    '维吉尼亚鸢尾': [[6.588, 0.636], [2.974, 0.322], [5.552, 0.552], [2.026, 0.275]]
  };

  function seedIris() {
    var r = rng(19360101);
    var rows = [];
    IRIS_SPECIES.forEach(function (sp, si) {
      var st = IRIS_STATS[sp];
      for (var i = 0; i < 50; i++) {
        var row = { '编号': 'IR-' + pad(si + 1) + pad(i + 1), '品种': sp };
        IRIS_FEATURES.forEach(function (f, fi) {
          var v = st[fi][0] + gauss(r) * st[fi][1];
          if (f === '花瓣宽') v += (row['花瓣长'] - st[2][0]) * 0.42;
          if (f === '花萼宽') v += (row['花萼长'] - st[0][0]) * 0.3;
          row[f] = Math.max(0.1, Math.round(v * 10) / 10);
        });
        rows.push(row);
      }
    });
    return rows;
  }

  var T_SURNAMES = ['Braund', 'Cumings', 'Heikkinen', 'Futrelle', 'Allen', 'Moran', 'McCarthy', 'Palsson', 'Johnson',
    'Nasser', 'Sandstrom', 'Bonnell', 'Andersson', 'Vestrom', 'Hewlett', 'Rice', 'Williams', 'Emir', 'Farrell', 'Devaney',
    'Rogers', 'Lennon', 'Todoroff', 'Spencer', 'Glynn', 'Wheadon', 'Meyer', 'Holverson', 'Mamee', 'Cann', 'Ahlin',
    'Turpin', 'Kraeff', 'Laroche', 'Cribb', 'Hassan', 'Knight', 'Berriman', 'Troupiansky', 'Lesurer', 'Ivanoff',
    'Nankoff', 'Hawksford', 'Cavendish', 'Ryerson', 'Keeping', 'Miles', 'Cornell', 'Aldworth', 'Brown'];
  var T_MALE = ['Owen', 'William', 'John', 'James', 'Charles', 'Thomas', 'Henry', 'George', 'Edward', 'Frederick',
    'Albert', 'Samuel', 'Joseph', 'Arthur', 'Ernest', 'Patrick', 'Michael', 'Daniel', 'Peter', 'Andrew'];
  var T_FEMALE = ['Mary', 'Anna', 'Margaret', 'Elizabeth', 'Ellen', 'Catherine', 'Hanora', 'Bridget', 'Katherine',
    'Laina', 'Eleanor', 'Madeleine', 'Charlotte', 'Annie', 'Julia', 'Emma', 'Sarah', 'Bertha', 'Helmina', 'Augusta'];
  var T_CLASS = [['头等舱', 216, 0.565, 0.369, 0.968, 38, 14, 84, 58],
    ['二等舱', 184, 0.587, 0.157, 0.921, 30, 13, 21, 12],
    ['三等舱', 491, 0.707, 0.135, 0.5, 25, 11, 13, 10]];

  function seedTitanic() {
    var r = rng(19120415);
    var rows = [], id = 1;
    T_CLASS.forEach(function (cls) {
      for (var i = 0; i < cls[1]; i++) {
        var male = r() < cls[2];
        var age = Math.round((cls[5] + gauss(r) * cls[6]) * 2) / 2;
        age = Math.max(0.42, Math.min(80, age));
        var missingAge = r() < 0.08;
        var p = male ? cls[3] : cls[4];
        if (!missingAge && age < 14) p = Math.min(0.97, p + 0.28);
        if (!missingAge && age > 62) p = Math.max(0.05, p - 0.12);
        var fare = Math.max(0, Math.round((cls[7] + Math.pow(r(), 2.1) * cls[8] * 2.4 + gauss(r) * cls[8] * 0.3) * 100) / 100);
        if (r() < 0.012) fare = 0;
        var port = weighted(r, cls[0] === '头等舱' ? [['S', 58], ['C', 34], ['Q', 8]] : [['S', 76], ['C', 16], ['Q', 8]]);
        var title = male ? (age < 14 ? 'Master' : 'Mr') : (age < 18 ? 'Miss' : 'Mrs');
        var given = pick(r, male ? T_MALE : T_FEMALE);
        rows.push({
          '乘客编号': String(id++),
          '姓名': pick(r, T_SURNAMES) + ', ' + title + '. ' + given,
          '是否幸存': r() < p ? '是' : '否',
          '舱位': cls[0],
          '性别': male ? '男' : '女',
          '年龄': missingAge ? '' : age,
          '票价': fare,
          '登船港口': port === 'S' ? '南安普敦' : port === 'C' ? '瑟堡' : '皇后镇'
        });
      }
    });
    rows.sort(function (a, b) { return Number(a['乘客编号']) - Number(b['乘客编号']); });
    return rows;
  }

  var REGIONS = [
    { name: '滨江新区', base: 52000, area: [88, 168], age: [1, 12], dist: [3.5, 9], n: 108 },
    { name: '老城中心', base: 46000, area: [52, 122], age: [18, 46], dist: [0.5, 3], n: 124 },
    { name: '高新园区', base: 39000, area: [74, 146], age: [2, 15], dist: [6, 14], n: 116 },
    { name: '大学城', base: 28000, area: [58, 126], age: [5, 22], dist: [8, 16], n: 98 },
    { name: '湖畔板块', base: 34000, area: [96, 196], age: [3, 20], dist: [10, 20], n: 86 },
    { name: '临港新城', base: 21000, area: [68, 142], age: [1, 10], dist: [18, 32], n: 88 }
  ];

  function seedHousing() {
    var r = rng(20260318);
    var rows = [];
    REGIONS.forEach(function (reg) {
      for (var i = 0; i < reg.n; i++) {
        var area = Math.round(reg.area[0] + Math.pow(r(), 0.85) * (reg.area[1] - reg.area[0]));
        var age = Math.round(reg.age[0] + r() * (reg.age[1] - reg.age[0]));
        var dist = Math.round((reg.dist[0] + r() * (reg.dist[1] - reg.dist[0])) * 10) / 10;
        var rooms = Math.max(1, Math.min(6, Math.round(area / 33 + gauss(r) * 0.55)));
        var unit = reg.base * (1 - age * 0.0042) * (1 - dist * 0.0058) * Math.exp(gauss(r) * 0.13);
        unit = Math.max(9000, Math.round(unit / 100) * 100);
        rows.push({
          '区位': reg.name,
          '面积': area,
          '房间数': rooms,
          '房龄': age,
          '距市中心': dist,
          '房价': Math.round(unit * area / 1000) * 1000,
          '单价': unit
        });
      }
    });
    return rows;
  }

  var O_CATS = [
    { name: '数码配件', w: 18, range: [39, 1299], refund: 0.035 },
    { name: '服饰鞋包', w: 24, range: [59, 899], refund: 0.092 },
    { name: '美妆个护', w: 17, range: [49, 699], refund: 0.041 },
    { name: '家居日用', w: 16, range: [19, 459], refund: 0.028 },
    { name: '食品生鲜', w: 15, range: [25, 268], refund: 0.022 },
    { name: '运动户外', w: 10, range: [89, 1580], refund: 0.048 }
  ];
  var O_REGIONS = [['华东', 30], ['华南', 20], ['华北', 18], ['华中', 12], ['西南', 12], ['东北', 8]];
  var O_PAY = [['微信支付', 46], ['支付宝', 38], ['银行卡', 10], ['货到付款', 6]];
  var O_HOURS = [[0, 2], [1, 1], [7, 4], [8, 6], [9, 8], [10, 10], [11, 11], [12, 14], [13, 12],
    [14, 8], [15, 8], [16, 9], [17, 10], [18, 11], [19, 13], [20, 17], [21, 18], [22, 13], [23, 6]];

  function seedOrders() {
    var r = rng(20260801);
    var rows = [], seq = 1;
    var start = new Date(2026, 7, 1);
    for (var d = 0; d < 60; d++) {
      var day = new Date(start.getTime());
      day.setDate(day.getDate() + d);
      var date = iso(day);
      var weekend = day.getDay() === 0 || day.getDay() === 6;
      var count = Math.max(6, Math.round(15 + d * 0.14 + (weekend ? 6 : 0) + gauss(r) * 3));
      for (var i = 0; i < count; i++) {
        var cat = weighted(r, O_CATS.map(function (c) { return [c, c.w]; }));
        var hour = weighted(r, O_HOURS);
        var qty = weighted(r, [[1, 62], [2, 24], [3, 10], [4, 4]]);
        var unit = Math.round((cat.range[0] + Math.pow(r(), 1.6) * (cat.range[1] - cat.range[0])) * 100) / 100;
        rows.push({
          '订单号': 'SO' + date.replace(/-/g, '') + pad(Math.floor(seq / 100)) + pad(seq % 100),
          '订单时间': date + ' ' + pad(hour) + ':' + pad(Math.floor(r() * 60)),
          '商品类别': cat.name,
          '金额': Math.round(unit * qty * 100) / 100,
          '数量': qty,
          '地区': weighted(r, O_REGIONS),
          '支付方式': weighted(r, O_PAY),
          '是否退款': r() < cat.refund ? '是' : '否'
        });
        seq++;
      }
    }
    rows.sort(function (a, b) { return a['订单时间'] < b['订单时间'] ? -1 : 1; });
    return rows;
  }

  var W_CITIES = [
    { name: '北京', mean: 13.2, amp: 15.2, rainP: 0.25, rainMax: 20, hum: 52, humAmp: 16, wind: 2.6 },
    { name: '上海', mean: 17.4, amp: 12.1, rainP: 0.38, rainMax: 28, hum: 68, humAmp: 12, wind: 3.1 },
    { name: '广州', mean: 22.6, amp: 8.2, rainP: 0.45, rainMax: 35, hum: 76, humAmp: 9, wind: 2.2 },
    { name: '成都', mean: 16.4, amp: 10.0, rainP: 0.42, rainMax: 20, hum: 78, humAmp: 8, wind: 1.6 }
  ];

  function seedWeather() {
    var r = rng(20250101);
    var rows = [];
    for (var d = 0; d < 365; d++) {
      var date = addDays('2025-01-01', d);
      var season = -Math.cos(2 * Math.PI * (d - 19) / 365);
      W_CITIES.forEach(function (c) {
        var tavg = Math.round((c.mean + c.amp * season + gauss(r) * 2.1) * 10) / 10;
        var diurnal = 4 + r() * 3.5;
        var tmax = Math.round((tavg + diurnal) * 10) / 10;
        var tmin = Math.round((tavg - diurnal) * 10) / 10;
        var rain = 0;
        if (r() < c.rainP * (0.55 + 0.75 * (season + 1) / 2)) {
          rain = Math.round(Math.pow(r(), 2.2) * c.rainMax * 10) / 10;
        }
        var hum = Math.round(Math.max(20, Math.min(99,
          c.hum + c.humAmp * season * 0.5 + (rain > 0 ? 12 : 0) + gauss(r) * 6)));
        var wind = Math.max(0.2, Math.round((c.wind + gauss(r) * 0.9 + (season < 0 ? 0.6 : 0)) * 10) / 10);
        var cond;
        if (rain > 0) {
          cond = tmax <= 1 ? '雪' : rainLevel(rain);
          if (cond === '大雨' && season > 0.5 && r() < 0.35) cond = '雷阵雨';
        } else {
          var cloud = r();
          cond = cloud < 0.45 ? '晴' : cloud < 0.78 ? '多云' : '阴';
        }
        rows.push({ '日期': date, '城市': c.name, '平均气温': tavg, '最高温': tmax, '最低温': tmin,
          '降雨量': rain, '湿度': hum, '风速': wind, '天气状况': cond });
      });
    }
    return rows;
  }

  var B_HOUR = [4, 2, 1, 1, 1, 3, 10, 28, 52, 38, 26, 24, 28, 26, 24, 26, 32, 52, 66, 48, 34, 26, 18, 10];
  var B_WEATHER_F = { '晴': 1, '多云': 0.93, '阴': 0.79, '小雨': 0.55, '大雨': 0.26 };

  function seedBikes() {
    var r = rng(20260901);
    var rows = [];
    for (var d = 0; d < 61; d++) {
      var date = addDays('2026-09-01', d);
      var dow = dayIndex(date);
      var work = dow >= 1 && dow <= 5;
      var weather = weighted(r, [['晴', 42], ['多云', 27], ['阴', 16], ['小雨', 12], ['大雨', 3]]);
      var base = 26 - d * 0.164;
      for (var h = 0; h < 24; h++) {
        var diurnal = -Math.cos(2 * Math.PI * (h - 4) / 24);
        var temp = Math.round((base + 5 * diurnal + gauss(r) * 1.2) * 10) / 10;
        var hum = Math.round(Math.max(25, Math.min(98,
          62 - 14 * diurnal + (weather === '小雨' || weather === '大雨' ? 16 : 0) + gauss(r) * 7)));
        var wind = Math.max(0.3, Math.round((2.4 + gauss(r) * 1.1) * 10) / 10);
        var f = 1;
        if (!work) {
          if (h >= 7 && h <= 9) f = 0.42;
          else if (h >= 17 && h <= 19) f = 0.55;
          else if (h >= 11 && h <= 16) f = 1.55;
          else if (h >= 20) f = 1.2;
        }
        var tf = temp < 8 ? 0.62 : temp < 14 ? 0.82 : temp > 33 ? 0.8 : 1;
        var cnt = Math.max(0, Math.round(B_HOUR[h] * 1.62 * f * B_WEATHER_F[weather] * tf * (1 + gauss(r) * 0.11)));
        rows.push({ '日期': date, '小时': h, '租借数量': cnt, '天气': weather, '气温': temp,
          '湿度': hum, '风速': wind, '是否工作日': work ? '是' : '否' });
      }
    }
    return rows;
  }

  var TEA_ITEMS = {
    '奶茶': { w: 30, items: [['珍珠奶茶', 12, 18], ['芋泥波波', 16, 22], ['布丁奶茶', 13, 18], ['黑糖鲜奶', 15, 20]] },
    '果茶': { w: 24, items: [['满杯红柚', 16, 22], ['柠檬四季春', 12, 16], ['葡萄芝士', 18, 24], ['芒果绿茶', 15, 20]] },
    '纯茶': { w: 12, items: [['四季春', 8, 12], ['茉莉绿茶', 8, 12], ['冻顶乌龙', 9, 13], ['陈皮普洱', 10, 15]] },
    '咖啡': { w: 16, items: [['拿铁', 15, 22], ['美式', 12, 18], ['生椰拿铁', 18, 25], ['卡布奇诺', 16, 22]] },
    '冰沙': { w: 10, items: [['芒果冰沙', 16, 22], ['草莓冰沙', 17, 23], ['抹茶冰沙', 18, 24]] },
    '小食': { w: 8, items: [['鸡蛋仔', 10, 15], ['黄金薯条', 8, 13], ['鸡米花', 12, 18], ['葡式蛋挞', 7, 12]] }
  };
  var TEA_STORES = [['大学城店', 30], ['万象城店', 26], ['高新店', 24], ['老街店', 20]];
  var TEA_CHANNELS = [['小程序', 44], ['美团外卖', 30], ['饿了么', 18], ['到店点单', 8]];
  var TEA_HOURS = [[9, 3], [10, 6], [11, 9], [12, 12], [13, 13], [14, 16], [15, 17], [16, 15],
    [17, 12], [18, 10], [19, 14], [20, 16], [21, 13], [22, 7], [23, 3]];

  function seedTea() {
    var r = rng(20260920);
    var rows = [], seq = 1;
    for (var d = 0; d < 45; d++) {
      var date = addDays('2026-09-20', d);
      var weekend = dayIndex(date) === 0 || dayIndex(date) === 6;
      var count = Math.max(10, Math.round(24 + (weekend ? 7 : 0) + gauss(r) * 4));
      for (var i = 0; i < count; i++) {
        var catName = weighted(r, TEA_CATS.map(function (c) { return [c, TEA_ITEMS[c].w]; }));
        var item = pick(r, TEA_ITEMS[catName].items);
        var unit = Math.round(item[1] + r() * (item[2] - item[1]));
        var qty = weighted(r, [[1, 68], [2, 24], [3, 8]]);
        var hour = weighted(r, TEA_HOURS);
        rows.push({
          '订单号': 'MT' + date.replace(/-/g, '') + pad(Math.floor(seq / 100)) + pad(seq % 100),
          '下单时间': date + ' ' + pad(hour) + ':' + pad(Math.floor(r() * 60)),
          '品类': catName,
          '商品名': item[0],
          '价格': unit,
          '金额': unit * qty,
          '数量': qty,
          '门店': weighted(r, TEA_STORES),
          '渠道': weighted(r, TEA_CHANNELS),
          '甜度': catName === '小食' ? '' : weighted(r, TEA_SUGAR.map(function (s, j) { return [s, [38, 26, 20, 10, 6][j]]; }))
        });
        seq++;
      }
    }
    rows.sort(function (a, b) { return a['下单时间'] < b['下单时间'] ? -1 : 1; });
    return rows;
  }

  var P_TEAMS = ['江城雷霆', '岭南飞虎', '北原钢铁', '东海巨鲨', '西岭苍狼', '南粤烈豹', '中原麒麟', '松江雄鹰'];
  var P_POS = [
    ['控球后卫', 12.5, 6.4, 3.6, 1.5, 0.3, 2.5, 32, 44],
    ['得分后卫', 18.2, 3.1, 4.2, 1.2, 0.4, 2.0, 33, 45],
    ['小前锋', 16.0, 3.2, 5.6, 1.1, 0.6, 1.9, 33, 47],
    ['大前锋', 13.0, 2.0, 7.6, 0.8, 1.0, 1.6, 30, 51],
    ['中锋', 12.2, 1.5, 9.2, 0.6, 1.8, 1.5, 28, 56]
  ];
  var P_ROSTER = [2, 3, 3, 2, 2];

  function seedPlayers() {
    var r = rng(20261012);
    var names = personPool(r, 96);
    var rows = [], n = 0;
    P_TEAMS.forEach(function (team) {
      P_POS.forEach(function (p, pi) {
        for (var k = 0; k < P_ROSTER[pi]; k++) {
          var mp = Math.max(12, Math.min(40, Math.round(p[7] + gauss(r) * 4.5)));
          var mf = Math.pow(mp / 32, 0.85);
          var star = r() < 0.13 ? 1.32 : 1;
          rows.push({
            '球员': names[n++], '球队': team, '位置': p[0],
            '得分': Math.max(1.2, Math.round((p[1] * star * mf + gauss(r) * 2.6) * 10) / 10),
            '助攻': Math.max(0.2, Math.round((p[2] * star * mf + gauss(r) * 0.9) * 10) / 10),
            '篮板': Math.max(0.5, Math.round((p[3] * star * mf + gauss(r) * 1.1) * 10) / 10),
            '抢断': Math.max(0, Math.round((p[4] * mf + gauss(r) * 0.35) * 10) / 10),
            '盖帽': Math.max(0, Math.round((p[5] * mf + gauss(r) * 0.3) * 10) / 10),
            '失误': Math.max(0.2, Math.round((p[6] * mf + gauss(r) * 0.5) * 10) / 10),
            '出场时间': mp,
            '命中率': Math.max(36, Math.min(68, Math.round((p[8] + gauss(r) * 4.6) * 10) / 10))
          });
        }
      });
    });
    return rows;
  }

  var M_GENRE = [
    ['剧情', 18, 7.2, 124, 22, 1.0], ['喜剧', 14, 6.5, 108, 16, 1.25],
    ['动作', 13, 6.6, 118, 18, 1.6], ['科幻', 9, 7.0, 126, 20, 1.9],
    ['悬疑', 10, 7.3, 116, 17, 1.05], ['动画', 9, 7.4, 94, 15, 1.35],
    ['爱情', 9, 6.4, 110, 16, 0.85], ['恐怖', 6, 5.9, 96, 14, 0.6],
    ['纪录片', 6, 7.8, 96, 20, 0.22], ['犯罪', 6, 7.1, 122, 19, 0.95]
  ];
  var M_REGIONS = [['中国大陆', 30], ['美国', 28], ['日本', 12], ['韩国', 10], ['英国', 10], ['法国', 10]];
  var M_TITLE_A = ['长夜', '星河', '孤城', '归途', '风暴', '沉默', '烈日', '迷雾', '彼岸', '浮生', '破晓', '暗涌',
    '远山', '回声', '霓虹', '荒原', '潮汐', '逆光', '旧梦', '边界', '白夜', '深海', '旷野', '骤雨'];
  var M_TITLE_B = ['将尽', '之下', '来信', '纪元', '行动', '游戏', '时刻', '之谜', '传说', '往事', '计划', '边缘',
    '深处', '之外', '序曲', '终章', '回响', '迷城', '追凶', '告白', '未眠', '将启', '无声', '有信', '重逢', '独白'];

  function seedMovies() {
    var r = rng(20261119);
    var directors = personPool(r, 90);
    var rows = [];
    for (var i = 0; i < 600; i++) {
      var g = weighted(r, M_GENRE.map(function (x) { return [x, x[1]]; }));
      var year = 1990 + Math.floor(Math.pow(r(), 0.62) * 37);
      var rating = Math.round(Math.max(2.4, Math.min(9.6,
        g[2] + gauss(r) * 0.82 + (2026 - year) * 0.004 + (r() < 0.06 ? 1.1 : 0))) * 10) / 10;
      var region = weighted(r, M_REGIONS);
      rows.push({
        '片名': M_TITLE_A[i % 24] + M_TITLE_B[Math.floor(i / 24) % 26],
        '类型': g[0], '上映年份': year, '评分': rating,
        '评分人数': Math.round((Math.pow(r(), 2.5) * 420000 + 1200) * (0.5 + rating / 11)),
        '时长': Math.max(68, Math.min(195, Math.round(g[3] + gauss(r) * g[4]))),
        '导演': pick(r, directors), '地区': region,
        '票房': Math.round(Math.pow(r(), 2.1) * 60000 * g[5] * (0.35 + rating / 9) *
          (region === '中国大陆' ? 1.5 : 0.8) / 10) * 10
      });
    }
    rows.sort(function (a, b) { return a['上映年份'] - b['上映年份'] || (a['片名'] < b['片名'] ? -1 : 1); });
    return rows;
  }

  var SEEDS = {
    grades: seedGrades, library: seedLibrary, attendance: seedAttendance, spending: seedSpending,
    iris: seedIris, titanic: seedTitanic, housing: seedHousing, orders: seedOrders,
    weather: seedWeather, bikes: seedBikes, tea: seedTea, players: seedPlayers, movies: seedMovies
  };
  var seedCache = {};

  function seed(id) {
    if (!seedCache[id]) seedCache[id] = enrich(id, SEEDS[id]());
    return seedCache[id];
  }

  /* ---------- 派生字段 ---------- */

  function enrich(id, rows) {
    return rows.map(function (raw) {
      var r = {};
      for (var k in raw) if (Object.prototype.hasOwnProperty.call(raw, k)) r[k] = raw[k];
      if (id === 'grades') {
        var present = SUBJECTS.filter(function (s) { return typeof r[s] === 'number' && isFinite(r[s]); });
        if (present.length) {
          var sum = present.reduce(function (a, s) { return a + r[s]; }, 0);
          if (typeof r['总分'] !== 'number') r['总分'] = sum;
          if (typeof r['平均分'] !== 'number') r['平均分'] = Math.round(sum / present.length * 10) / 10;
        }
        r['挂科门数'] = present.filter(function (s) { return r[s] < 60; }).length;
      } else if (id === 'library') {
        var dt = r['借阅时间'] || '';
        r['借阅日期'] = dt ? String(dt).slice(0, 10) : '';
        r['小时'] = dt && String(dt).length > 10 ? parseInt(String(dt).slice(11, 13), 10) : null;
        r['月份'] = r['借阅日期'] ? r['借阅日期'].slice(0, 7) : '';
        r['星期'] = r['借阅日期'] ? WEEK[dayIndex(r['借阅日期'])] : '';
        if (r['借阅日期'] && r['归还日期']) {
          var a = r['借阅日期'].split('-'), b = String(r['归还日期']).slice(0, 10).split('-');
          var days = Math.round((new Date(+b[0], +b[1] - 1, +b[2]) - new Date(+a[0], +a[1] - 1, +a[2])) / 86400000);
          r['时长天数'] = days >= 0 ? days : null;
        } else r['时长天数'] = null;
        r['借阅状态'] = r['时长天数'] == null ? '在借' : (r['时长天数'] > 30 ? '超期' : '按时');
      } else if (id === 'attendance') {
        var t = r['打卡时间'];
        var mins = typeof t === 'number' ? (isFinite(t) ? t : null) : (t == null || t === '' ? null : normTime(t));
        r['分钟'] = mins;
        r['小时'] = mins == null ? null : Math.floor(mins / 60);
        r['时段'] = mins == null ? '' : (mins < 720 ? '早间' : '晚间');
        r['星期'] = r['日期'] ? WEEK[dayIndex(String(r['日期']).slice(0, 10))] : '';
        r['迟到'] = r['是否迟到'] === '是';
      } else if (id === 'spending') {
        var s = String(r['时间'] || '');
        r['日期'] = s.slice(0, 10);
        r['小时'] = s.length > 10 ? parseInt(s.slice(11, 13), 10) : null;
        r['星期'] = r['日期'] ? WEEK[dayIndex(r['日期'])] : '';
      } else if (id === 'iris') {
        var pl = num(r['花瓣长']), pw = num(r['花瓣宽']), sl = num(r['花萼长']), sw = num(r['花萼宽']);
        r['花瓣面积'] = pl != null && pw != null ? Math.round(pl * pw * 100) / 100 : null;
        r['花萼面积'] = sl != null && sw != null ? Math.round(sl * sw * 100) / 100 : null;
        r['长宽比'] = pl != null && pw != null && pw > 0 ? Math.round(pl / pw * 100) / 100 : null;
      } else if (id === 'titanic') {
        r['舱位'] = classLabel(r['舱位']);
        r['性别'] = sexLabel(r['性别']);
        r['登船港口'] = portLabel(r['登船港口']);
        r['年龄段'] = typeof r['年龄'] === 'number' && isFinite(r['年龄']) ? ageBand(r['年龄']) : '';
        r['幸存'] = r['是否幸存'] === '是';
      } else if (id === 'housing') {
        if (typeof r['单价'] !== 'number' || !isFinite(r['单价'])) {
          var hp = num(r['房价']), ha = num(r['面积']);
          r['单价'] = hp != null && ha != null && ha > 0 ? Math.round(hp / ha) : null;
        }
        r['面积段'] = num(r['面积']) != null ? areaBand(r['面积']) : '';
        r['房龄段'] = num(r['房龄']) != null ? houseAgeBand(r['房龄']) : '';
        r['总价万元'] = num(r['房价']) != null ? Math.round(r['房价'] / 1000) / 10 : null;
      } else if (id === 'orders') {
        var od = String(r['订单时间'] || '');
        r['日期'] = od.slice(0, 10);
        r['小时'] = od.length > 10 ? parseInt(od.slice(11, 13), 10) : null;
        r['月份'] = r['日期'] ? r['日期'].slice(0, 7) : '';
        r['星期'] = r['日期'] ? WEEK[dayIndex(r['日期'])] : '';
        r['时段'] = r['小时'] == null || !isFinite(r['小时']) ? ''
          : (r['小时'] < 6 ? '凌晨' : r['小时'] < 12 ? '上午' : r['小时'] < 18 ? '下午' : '晚间');
        r['退款'] = r['是否退款'] === '是';
        r['件单价'] = num(r['金额']) != null && num(r['数量']) > 0
          ? Math.round(r['金额'] / r['数量'] * 100) / 100 : null;
      } else if (id === 'weather') {
        var wd = String(r['日期'] || '').slice(0, 10);
        r['月份'] = wd ? wd.slice(0, 7) : '';
        r['星期'] = wd ? WEEK[dayIndex(wd)] : '';
        r['季节'] = wd ? seasonOf(wd) : '';
        var tmax = num(r['最高温']), tmin = num(r['最低温']);
        if (num(r['平均气温']) == null && tmax != null && tmin != null) {
          r['平均气温'] = Math.round((tmax + tmin) / 2 * 10) / 10;
        }
        r['温差'] = tmax != null && tmin != null ? Math.round((tmax - tmin) * 10) / 10 : null;
        var rain = num(r['降雨量']);
        r['雨量等级'] = rain == null ? '' : rainLevel(rain);
        r['降雨'] = rain != null && rain > 0;
        r['高温'] = tmax != null && tmax >= 35;
      } else if (id === 'bikes') {
        var bd = String(r['日期'] || '').slice(0, 10);
        r['月份'] = bd ? bd.slice(0, 7) : '';
        r['星期'] = bd ? WEEK[dayIndex(bd)] : '';
        r['季节'] = bd ? seasonOf(bd) : '';
        var bh = num(r['小时']);
        r['时段'] = bh == null ? '' : bikeSlot(bh);
        if (r['是否工作日'] !== '是' && r['是否工作日'] !== '否' && bd) {
          var weekday = dayIndex(bd);
          r['是否工作日'] = weekday >= 1 && weekday <= 5 ? '是' : '否';
        }
        r['日期类型'] = r['是否工作日'] === '是' ? '工作日' : r['是否工作日'] === '否' ? '非工作日' : '';
        r['工作'] = r['是否工作日'] === '是';
      } else if (id === 'tea') {
        var td = String(r['下单时间'] || '');
        r['日期'] = td.slice(0, 10);
        r['小时'] = td.length > 10 ? parseInt(td.slice(11, 13), 10) : null;
        r['月份'] = r['日期'] ? r['日期'].slice(0, 7) : '';
        r['星期'] = r['日期'] ? WEEK[dayIndex(r['日期'])] : '';
        var th = r['小时'];
        r['时段'] = th == null || !isFinite(th) ? ''
          : (th < 6 ? '凌晨' : th < 12 ? '上午' : th < 18 ? '下午' : '晚间');
        var qty = num(r['数量']);
        if (qty == null) qty = 1;
        if (num(r['金额']) == null && num(r['价格']) != null) r['金额'] = Math.round(num(r['价格']) * qty * 100) / 100;
        if (num(r['价格']) == null && num(r['金额']) != null && qty > 0) r['价格'] = Math.round(num(r['金额']) / qty * 100) / 100;
        r['外卖'] = r['渠道'] != null && r['渠道'] !== '' && r['渠道'] !== '到店点单';
      } else if (id === 'players') {
        var pts = num(r['得分']), ast = num(r['助攻']), reb = num(r['篮板']);
        var stl = num(r['抢断']), blk = num(r['盖帽']), tov = num(r['失误']);
        var parts = [pts, ast, reb, stl, blk].filter(function (v) { return v != null; });
        r['效率值'] = parts.length ? Math.round((parts.reduce(function (a, b) { return a + b; }, 0) - (tov || 0)) * 10) / 10 : null;
        var mp = num(r['出场时间']);
        r['每36分钟得分'] = pts != null && mp != null && mp > 0 ? Math.round(pts / mp * 36 * 10) / 10 : null;
        r['得分档'] = pts == null ? '' : scoreBand(pts);
        r['两双'] = [pts, ast, reb, stl, blk].filter(function (v) { return v != null && v >= 10; }).length >= 2;
      } else if (id === 'movies') {
        var year = num(r['上映年份']), score = num(r['评分']), votes = num(r['评分人数']);
        r['年代'] = year == null ? '' : decadeOf(year);
        r['评分档'] = score == null ? '' : ratingBand(score);
        var rt = num(r['时长']);
        r['时长档'] = rt == null ? '' : (rt < 90 ? '短片' : rt < 120 ? '标准' : rt < 150 ? '长片' : '超长');
        r['加权评分'] = score != null && votes != null && votes > 0
          ? Math.round((score * votes + 7 * 2000) / (votes + 2000) * 100) / 100 : null;
      }
      return r;
    });
  }

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  function classLabel(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (/^(1|一|first|1st)$/i.test(s) || s.indexOf('头等') !== -1 || s.indexOf('一等') !== -1) return '头等舱';
    if (/^(2|二|second|2nd)$/i.test(s) || s.indexOf('二等') !== -1) return '二等舱';
    if (/^(3|三|third|3rd)$/i.test(s) || s.indexOf('三等') !== -1) return '三等舱';
    return s;
  }

  function sexLabel(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s) return '';
    if (s === 'male' || s === 'm' || s === '男' || s === '男性') return '男';
    if (s === 'female' || s === 'f' || s === '女' || s === '女性') return '女';
    return String(v).trim();
  }

  function portLabel(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (/^(s|southampton)$/i.test(s) || s.indexOf('南安普') !== -1) return '南安普敦';
    if (/^(c|cherbourg)$/i.test(s) || s.indexOf('瑟堡') !== -1) return '瑟堡';
    if (/^(q|queenstown|cobh)$/i.test(s) || s.indexOf('皇后镇') !== -1 || s.indexOf('科夫') !== -1) return '皇后镇';
    return s;
  }

  function seasonOf(dateStr) {
    var m = parseInt(String(dateStr).slice(5, 7), 10);
    if (!isFinite(m)) return '';
    return m >= 3 && m <= 5 ? '春' : m >= 6 && m <= 8 ? '夏' : m >= 9 && m <= 11 ? '秋' : '冬';
  }

  function rainLevel(mm) {
    return mm <= 0 ? '无雨' : mm < 5 ? '小雨' : mm < 15 ? '中雨' : mm < 30 ? '大雨' : '暴雨';
  }

  function bikeSlot(h) {
    return h < 6 ? '凌晨' : h < 10 ? '早高峰' : h < 12 ? '上午' : h < 14 ? '午间'
      : h < 17 ? '下午' : h < 20 ? '晚高峰' : '夜间';
  }

  function scoreBand(p) {
    return p < 10 ? '角色球员' : p < 15 ? '轮换球员' : p < 20 ? '主力球员' : '核心球员';
  }

  function ratingBand(s) {
    return s < 5 ? '不及格' : s < 6.5 ? '平庸' : s < 7.5 ? '良好' : s < 8.5 ? '优秀' : '神作';
  }

  function decadeOf(y) {
    if (!(y >= 1900 && y <= 2099)) return '';
    var d = Math.floor(y / 10) * 10;
    return String(d).slice(2) + '年代';
  }

  /* ---------- 文件解析 ---------- */

  function splitLine(line, delim) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function detectDelim(text) {
    var line = text.split(/\r?\n/)[0] || '';
    var counts = [['\t', 0], [',', 0], [';', 0]];
    var q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') q = !q;
      else if (!q) counts.forEach(function (p) { if (p[0] === c) p[1]++; });
    }
    counts.sort(function (a, b) { return b[1] - a[1]; });
    return counts[0][1] > 0 ? counts[0][0] : ',';
  }

  function collectRows(lines, headers, delim, from, to, out) {
    for (var i = from; i < to; i++) {
      var cells = splitLine(lines[i], delim);
      var obj = {};
      for (var j = 0; j < headers.length; j++) obj[headers[j]] = cells[j] == null ? '' : cells[j].trim();
      out.push(obj);
    }
  }

  function csvParts(text) {
    var clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    var delim = detectDelim(clean);
    var lines = clean.split('\n').filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return { error: '文件至少需要表头与一行数据' };
    return {
      lines: lines, delim: delim,
      headers: splitLine(lines[0], delim).map(function (h) { return h.trim(); }),
      format: delim === '\t' ? 'TSV' : 'CSV'
    };
  }

  function parseCSV(text) {
    var parts = csvParts(text);
    if (parts.error) return parts;
    var rows = [];
    collectRows(parts.lines, parts.headers, parts.delim, 1, parts.lines.length, rows);
    return { headers: parts.headers, rows: rows, format: parts.format };
  }

  /* 大文件分块解析：每块之间让出主线程，避免界面卡死 */
  /* 后台标签页里 setTimeout 会被浏览器降频到每秒甚至每分钟一次，改用消息任务让出 */
  var yieldTask = (function () {
    if (typeof MessageChannel !== 'function') return function (fn) { setTimeout(fn, 0); };
    var ch = new MessageChannel(), queue = [];
    ch.port1.onmessage = function () { var fn = queue.shift(); if (fn) fn(); };
    return function (fn) { queue.push(fn); ch.port2.postMessage(0); };
  })();

  function parseChunked(text, filename, onProgress) {
    return new Promise(function (resolve) {
      var name = String(filename || '').toLowerCase();
      var trimmed = text.replace(/^﻿/, '').trim();
      if (!trimmed) { resolve({ error: '文件内容为空' }); return; }
      if (/\.json$/.test(name) || trimmed[0] === '[' || trimmed[0] === '{') { resolve(parseJSON(trimmed)); return; }
      var parts = csvParts(text);
      if (parts.error) { resolve(parts); return; }
      var rows = [], i = 1, total = parts.lines.length - 1;
      function step() {
        var end = Math.min(parts.lines.length, i + 20000);
        collectRows(parts.lines, parts.headers, parts.delim, i, end, rows);
        i = end;
        if (onProgress) onProgress(rows.length, total);
        if (i < parts.lines.length) yieldTask(step);
        else resolve({ headers: parts.headers, rows: rows, format: parts.format });
      }
      step();
    });
  }

  function parseJSON(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { error: 'JSON 解析失败：' + e.message }; }
    if (data && !Array.isArray(data)) {
      data = data.data || data.rows || data.records || data.list;
    }
    if (!Array.isArray(data) || !data.length) return { error: 'JSON 需为非空数组，或含 data / rows 数组字段' };
    if (Array.isArray(data[0])) {
      var headers = data[0].map(String);
      var rows = data.slice(1).map(function (arr) {
        var o = {};
        headers.forEach(function (h, i) { o[h] = arr[i] == null ? '' : arr[i]; });
        return o;
      });
      return { headers: headers, rows: rows, format: 'JSON' };
    }
    if (typeof data[0] !== 'object') return { error: 'JSON 数组元素需为对象' };
    var keys = [];
    data.forEach(function (o) {
      Object.keys(o).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
    });
    return { headers: keys, rows: data, format: 'JSON' };
  }

  function parse(text, filename) {
    var name = String(filename || '').toLowerCase();
    var trimmed = text.replace(/^﻿/, '').trim();
    if (!trimmed) return { error: '文件内容为空' };
    if (/\.json$/.test(name) || trimmed[0] === '[' || trimmed[0] === '{') return parseJSON(trimmed);
    return parseCSV(text);
  }

  /* ---------- 普通表解析（分析工作台，不套业务模板） ---------- */

  var RE_PLAIN_NUM = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/;

  function plainNumber(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v == null ? '' : v).replace(/[\s\u00a5\uFFE5$,]/g, '');
    if (!RE_PLAIN_NUM.test(s)) return null;
    if (/^0\d/.test(s.replace(/^[-+]/, ''))) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function tableKind(values) {
    var c = { number: 0, date: 0, datetime: 0, time: 0, text: 0 }, n = 0;
    for (var i = 0; i < values.length && n < 60; i++) {
      var s = values[i];
      if (s == null || s === '') continue;
      n++;
      s = String(s).trim();
      if (RE_DATETIME.test(s)) c.datetime++;
      else if (RE_DATE.test(s)) c.date++;
      else if (RE_TIME.test(s)) c.time++;
      else if (plainNumber(s) !== null) c.number++;
      else c.text++;
    }
    if (!n) return 'empty';
    var family = c.date + c.datetime;
    var kind = 'text', best = c.text;
    if (family > best) { best = family; kind = c.datetime > c.date ? 'datetime' : 'date'; }
    if (c.time > best) { best = c.time; kind = 'time'; }
    if (c.number > best) { kind = 'number'; }
    return kind;
  }

  var KIND_LABEL = {
    number: '数值', date: '日期', datetime: '日期时间', time: '时刻',
    text: '文本', empty: '全空'
  };

  function parseTable(text) {
    var clean = String(text == null ? '' : text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (!clean.trim()) return { error: '文件内容为空，请确认导出是否完成' };
    var delim = detectDelim(clean);
    var recs = [];
    var lines = clean.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (!/\S/.test(lines[i])) continue;
      recs.push({ line: i + 1, cells: splitLine(lines[i], delim) });
    }
    if (recs.length < 2) return { error: '至少需要一行表头和一行数据，当前只读到 ' + recs.length + ' 行' };

    var raw = recs[0].cells.map(function (h) { return h.trim(); });
    var width = raw.length;
    var seen = {};
    var columns = raw.map(function (h, i) {
      var name = h || '列 ' + (i + 1);
      seen[name] = (seen[name] || 0) + 1;
      if (seen[name] > 1) name += ' ' + seen[name];
      return { id: 'c' + (i + 1), header: h, name: name, inferred: 'text', kind: 'text', missing: 0, sample: '' };
    });

    var rows = [];
    var ragged = [];
    for (var r = 1; r < recs.length; r++) {
      var cells = recs[r].cells;
      if (cells.length !== width) ragged.push({ line: recs[r].line, got: cells.length, want: width });
      var row = [];
      for (var j = 0; j < width; j++) row.push(cells[j] == null ? '' : cells[j].trim());
      rows.push(row);
    }

    columns.forEach(function (col, i) {
      var filled = 0;
      var values = [];
      for (var k = 0; k < rows.length; k++) {
        values.push(rows[k][i]);
        if (rows[k][i] !== '') filled++;
      }
      col.inferred = col.kind = tableKind(values);
      col.missing = rows.length - filled;
      col.sample = values.filter(function (v) { return v !== ''; })[0] || '';
    });

    return {
      columns: columns,
      rows: rows,
      ragged: ragged,
      delimiter: delim,
      format: delim === '\t' ? 'TSV' : (delim === ',' ? 'CSV' : '分隔文本'),
      rowCount: rows.length,
      colCount: width
    };
  }

  /* ---------- 归一化 ---------- */

  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v == null ? '' : v).replace(/[¥￥$,\s元%％]/g, '');
    if (s === '' || s === '-' || s === 'NA' || s === 'null') return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function normDate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) return iso(new Date(1899, 11, 30 + Math.round(v)));
      var d = new Date(v > 1e11 ? v : v * 1000);
      return isNaN(d) ? '' : iso(d);
    }
    var s = String(v).trim().replace(/[\/年\.]/g, '-').replace(/月/g, '-').replace(/日/g, '').replace('T', ' ');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    var mc = s.match(/^(\d{4})(\d{2})(\d{2})\s+\d{1,2}:\d{2}/);
    if (mc && +mc[2] >= 1 && +mc[2] <= 12 && +mc[3] >= 1 && +mc[3] <= 31) return mc[1] + '-' + mc[2] + '-' + mc[3];
    var d2 = new Date(s);
    return isNaN(d2) ? '' : iso(d2);
  }

  function normDateTime(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') { var nd = normDate(v); return nd ? nd + ' 00:00' : ''; }
    var s = String(v).trim().replace(/[\/年\.]/g, '-').replace(/月/g, '-').replace(/日/g, '').replace('T', ' ');
    var m = s.match(/^(\d{4}-\d{1,2}-\d{1,2})[ ]?(\d{1,2}:\d{2})?/);
    if (m) {
      var date = normDate(m[1]);
      if (!date) return '';
      if (!m[2]) return date;
      var tp = m[2].split(':');
      return date + ' ' + pad(+tp[0]) + ':' + pad(+tp[1]);
    }
    if (/^\d{8}$/.test(s)) return normDate(s);
    var mc = s.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{1,2}):(\d{2})/);
    if (mc && +mc[2] >= 1 && +mc[2] <= 12 && +mc[3] >= 1 && +mc[3] <= 31) {
      return mc[1] + '-' + mc[2] + '-' + mc[3] + ' ' + pad(+mc[4]) + ':' + pad(+mc[5]);
    }
    var d = new Date(s);
    if (isNaN(d)) return '';
    return iso(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function normTime(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).trim();
    var m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) return (+m[1]) * 60 + (+m[2]);
    var m2 = s.match(/^(\d{1,2})点/);
    if (m2) return (+m2[1]) * 60;
    var n = parseFloat(s);
    if (isFinite(n) && n >= 0 && n <= 1440) return n;
    return null;
  }

  function normBool(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (['是', 'yes', 'y', 'true', '1', '迟到', 'late', '晚'].indexOf(s) !== -1) return '是';
    if (['否', 'no', 'n', 'false', '0', '正常', '准时', '正常打卡'].indexOf(s) !== -1) return '否';
    return '';
  }

  /* ---------- 表头自动识别 ---------- */

  function normHeader(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\uff01-\uff5e]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/[\(\[\{<【《][^)\]\}>】》]*[\)\]\}>】》]/g, '')
      .replace(/(元|圆|块|人民币|rmb|单位|格式|yyyymmdd|yyyy|mmdd|hhmm|percent|pct)$/, '')
      .replace(/[^\w\u4e00-\u9fff]/g, '')
      .replace(/_/g, '');
  }

  var RE_DATETIME = /^\d{4}[-\/年\.]\d{1,2}[-\/月\.]\d{1,2}日?[\sT]+\d{1,2}:\d{2}/;
  var RE_COMPACT_DT = /^\d{8}\s+\d{1,2}:\d{2}/;
  var RE_DATE = /^\d{4}[-\/年\.]\d{1,2}[-\/月\.]\d{1,2}日?$/;
  var RE_TIME = /^\d{1,2}:\d{2}(:\d{2})?$/;
  var RE_BOOL = /^(是|否|yes|no|y|n|true|false|迟到|未迟到|准时|正常|late)$/i;

  function detectKind(values) {
    var c = { date: 0, datetime: 0, time: 0, number: 0, bool: 0, text: 0 };
    var n = 0;
    for (var i = 0; i < values.length && n < 60; i++) {
      var v = values[i];
      if (v == null || v === '') continue;
      n++;
      var s = String(v).trim();
      if (RE_DATETIME.test(s) || RE_COMPACT_DT.test(s)) c.datetime++;
      else if (RE_DATE.test(s) || /^\d{8}$/.test(s)) c.date++;
      else if (RE_TIME.test(s) || /^\d{1,2}点/.test(s)) c.time++;
      else if (/^[-+]?\d+(\.\d+)?$/.test(s.replace(/[¥￥$,\s元%％]/g, ''))) c.number++;
      else if (RE_BOOL.test(s)) c.bool++;
      else c.text++;
    }
    if (!n) return { kind: 'empty', ratio: 0 };
    var family = c.date + c.datetime;
    var kind = 'text', best = c.text;
    if (family > best) { best = family; kind = c.datetime > c.date ? 'datetime' : 'date'; }
    if (c.time > best) { best = c.time; kind = 'time'; }
    if (c.number > best) { best = c.number; kind = 'number'; }
    if (c.bool > best) { best = c.bool; kind = 'bool'; }
    return { kind: kind, ratio: best / n };
  }

  function tokensOf(s) {
    var clean = String(s == null ? '' : s).toLowerCase()
      .replace(/[\uff01-\uff5e]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/[\(\[\{<【《][^)\]\}>】》]*[\)\]\}>】》]/g, ' ')
      .replace(/[^\w\u4e00-\u9fff]+/g, ' ');
    var out = clean.match(/[a-z0-9]+/g) || [];
    var cjk = clean.replace(/[^\u4e00-\u9fff]/g, '');
    for (var i = 0; i + 1 < cjk.length; i++) out.push(cjk.slice(i, i + 2));
    if (cjk.length === 1) out.push(cjk);
    return out;
  }

  function containable(a, h) {
    var short = a.length <= h.length ? a : h;
    return short.length >= (/^[\x00-\x7f]+$/.test(short) ? 3 : 2);
  }

  function nameScore(col, header, owners) {
    var h = normHeader(header);
    if (!h) return { score: 0, generic: false };
    var raw = String(header).trim().toLowerCase();
    var keys = [col.key].concat(col.aliases || []);
    var best = 0, generic = false;
    for (var i = 0; i < keys.length; i++) {
      var a = normHeader(keys[i]);
      if (!a) continue;
      var s, gen = false;
      if (a === h) s = String(keys[i]).trim().toLowerCase() === raw ? 100 : 92;
      else if (containable(a, h) && h.indexOf(a) !== -1) { s = 66 + 12 * (a.length / h.length); gen = true; }
      else if (containable(a, h) && a.indexOf(h) !== -1) s = 56 + 12 * (h.length / a.length);
      else {
        var ta = tokensOf(keys[i]), tb = tokensOf(header), hit = 0;
        ta.forEach(function (t) { if (tb.indexOf(t) !== -1) hit++; });
        s = ta.length && tb.length ? 34 * (hit / Math.max(ta.length, tb.length)) : 0;
      }
      if (gen && owners) {
        gen = tokensOf(keys[i]).every(function (t) { return owners[t] && owners[t].length > 1; });
      }
      if (s > best) { best = s; generic = gen; }
    }
    return { score: best, generic: generic };
  }

  var COMPAT = {
    cat: { date: 0.2, datetime: 0.2, time: 0.2, number: 0.4, bool: 0.4, text: 0.6 },
    num: { date: -1, datetime: -1, time: -1, number: 1, bool: 0.2, text: -0.6 },
    bool: { date: -1, datetime: -1, time: -1, number: 0.4, bool: 1, text: 0.2 },
    date: { date: 1, datetime: 1, time: -1, number: 0.2, bool: -0.5, text: -0.2 },
    datetime: { date: 0.8, datetime: 1, time: -0.6, number: 0.2, bool: -0.5, text: -0.2 },
    time: { date: -1, datetime: 1, time: 1, number: 0.5, bool: -0.5, text: -0.2 }
  };

  function veto(type, k) {
    if (k.ratio < 0.6 || k.kind === 'empty') return false;
    if (type === 'num' || type === 'bool') return isDateType(k.kind);
    if (type === 'date' || type === 'datetime') return k.kind === 'time';
    if (type === 'time') return k.kind === 'date';
    return false;
  }

  function isDateType(t) { return t === 'date' || t === 'datetime' || t === 'time'; }

  var GENERIC_TOKENS = ('时间 日期 时刻 date time day datetime 分类 类别 类型 category type 姓名 名字 name 学生 student ' +
    '金额 amount price 学号 id 编号 班级 class 性别 gender sex 状态 status 总分 total 平均分 avg average 学分 credit credits').split(' ');

  function matchHeaders(schema, headers, samples) {
    var owners = {};
    schema.columns.forEach(function (col, ci) {
      var seen = {};
      [col.key].concat(col.aliases || []).forEach(function (k) {
        tokensOf(k).forEach(function (t) { seen[t] = 1; });
      });
      Object.keys(seen).forEach(function (t) { (owners[t] = owners[t] || []).push(ci); });
    });

    var pairs = [];
    schema.columns.forEach(function (col, ci) {
      headers.forEach(function (h, hi) {
        var ev = nameScore(col, h, owners);
        if (ev.score <= 0 || veto(col.type, samples[hi])) return;
        if (ev.generic || ev.score < 66) {
          var clash = tokensOf(h).some(function (t) {
            var o = owners[t];
            return o && o.length === 1 && o[0] !== ci && GENERIC_TOKENS.indexOf(t) === -1;
          });
          if (clash) return;
        }
        var cp = (COMPAT[col.type] || {})[samples[hi].kind];
        pairs.push({ ci: ci, hi: hi, ns: ev.score, score: ev.score + (cp == null ? 0 : cp * 20) });
      });
    });
    pairs.sort(function (a, b) { return b.score - a.score || a.ci - b.ci || a.hi - b.hi; });

    var map = {}, how = {}, usedCol = {}, usedHead = {};
    pairs.forEach(function (p) {
      var col = schema.columns[p.ci];
      if (p.score < 30 || usedCol[col.key] || usedHead[p.hi]) return;
      usedCol[col.key] = 1;
      usedHead[p.hi] = 1;
      map[col.key] = headers[p.hi];
      how[col.key] = p.ns >= 92 ? 'exact' : 'fuzzy';
    });

    schema.columns.forEach(function (col) {
      if (map[col.key] || !isDateType(col.type)) return;
      var bestI = -1, bestS = 0;
      headers.forEach(function (h, i) {
        if (usedHead[i]) return;
        var k = samples[i];
        if (k.ratio < 0.6) return;
        var ok = col.type === 'time' ? (k.kind === 'time' || k.kind === 'datetime') : (k.kind === 'date' || k.kind === 'datetime');
        if (!ok) return;
        var s = k.ratio * 10 + (/日期|时间|时刻|date|time|day/.test(normHeader(h)) ? 8 : 0);
        if (s > bestS) { bestS = s; bestI = i; }
      });
      if (bestI >= 0) {
        usedHead[bestI] = 1;
        map[col.key] = headers[bestI];
        how[col.key] = 'content';
      }
    });

    ['num', 'bool'].forEach(function (type) {
      var left = schema.columns.filter(function (c) { return c.type === type && !map[c.key]; });
      if (left.length !== 1) return;
      var cand = [];
      headers.forEach(function (h, i) {
        if (usedHead[i]) return;
        var k = samples[i];
        if (k.ratio < 0.8) return;
        if (type === 'num' ? k.kind === 'number' : (k.kind === 'bool' || k.kind === 'number')) cand.push(i);
      });
      if (cand.length !== 1) return;
      usedHead[cand[0]] = 1;
      map[left[0].key] = headers[cand[0]];
      how[left[0].key] = 'content';
    });

    schema.columns.forEach(function (col) {
      if (map[col.key] || !isDateType(col.type)) return;
      for (var i = 0; i < headers.length; i++) {
        var owner = null;
        schema.columns.forEach(function (c2) {
          if (map[c2.key] === headers[i] && isDateType(c2.type)) owner = c2;
        });
        if (!owner) continue;
        var k = samples[i];
        var ok = col.type === 'date' ? (k.kind === 'date' || k.kind === 'datetime')
          : col.type === 'time' ? k.kind === 'datetime' : k.kind === 'datetime';
        if (!ok) continue;
        map[col.key] = headers[i];
        how[col.key] = col.type === 'date' ? 'datepart' : (col.type === 'time' ? 'timepart' : 'split');
        break;
      }
    });

    return {
      map: map, how: how,
      unused: headers.filter(function (h, i) { return !usedHead[i]; })
    };
  }

  function normalize(id, parsed) {
    var schema = SCHEMAS[id];
    if (!schema) return { error: '未知数据集' };
    var samples = parsed.headers.map(function (h) {
      var vals = [];
      for (var i = 0; i < parsed.rows.length && vals.length < 60; i++) {
        var v = parsed.rows[i][h];
        if (v != null && v !== '') vals.push(v);
      }
      return detectKind(vals);
    });
    var matched = matchHeaders(schema, parsed.headers, samples);
    var map = matched.map;
    var present = Object.keys(map);
    if (!schema.usable(present)) {
      return { error: '字段无法识别：' + schema.hint, mapped: map, headers: parsed.headers };
    }
    var dropped = 0;
    var rows = [];
    parsed.rows.forEach(function (raw) {
      var r = {}, any = false;
      schema.columns.forEach(function (col) {
        var header = map[col.key];
        if (header == null) return;
        var v = raw[header];
        var out;
        if (col.type === 'num') out = toNum(v);
        else if (col.type === 'date') out = normDate(v);
        else if (col.type === 'datetime') out = normDateTime(v);
        else if (col.type === 'time') out = normTime(v);
        else if (col.type === 'bool') out = normBool(v);
        else out = String(v == null ? '' : v).trim();
        if (out != null && out !== '') any = true;
        r[col.key] = out;
      });
      if (!any) { dropped++; return; }
      rows.push(r);
    });
    if (!rows.length) return { error: '没有有效数据行', mapped: map, headers: parsed.headers };
    var truncated = 0;
    if (rows.length > MAX_ROWS) {
      truncated = rows.length - MAX_ROWS;
      rows = rows.slice(0, MAX_ROWS);
    }
    return { rows: enrich(id, rows), mapped: map, matchHow: matched.how, unused: matched.unused, present: present, dropped: dropped, truncated: truncated, headers: parsed.headers };
  }

  function presentKeys(id, rows) {
    var schema = SCHEMAS[id];
    var keys = [];
    schema.columns.forEach(function (col) {
      for (var i = 0; i < rows.length; i++) {
        var v = rows[i][col.key];
        if (v != null && v !== '') { keys.push(col.key); break; }
      }
    });
    var derived = {
      grades: ['总分', '平均分', '挂科门数'],
      library: ['借阅日期', '小时', '月份', '星期', '时长天数', '借阅状态'],
      attendance: ['分钟', '小时', '时段', '星期', '迟到'],
      spending: ['日期', '小时', '星期'],
      iris: ['花瓣面积', '花萼面积', '长宽比'],
      titanic: ['年龄段', '幸存'],
      housing: ['单价', '面积段', '房龄段', '总价万元'],
      orders: ['日期', '小时', '月份', '星期', '时段', '退款', '件单价'],
      weather: ['月份', '星期', '季节', '温差', '雨量等级', '降雨', '高温'],
      bikes: ['月份', '星期', '季节', '时段', '日期类型', '工作'],
      tea: ['日期', '小时', '月份', '星期', '时段', '外卖'],
      players: ['效率值', '每36分钟得分', '得分档', '两双'],
      movies: ['年代', '评分档', '时长档', '加权评分']
    }[id] || [];
    derived.forEach(function (k) {
      if (keys.indexOf(k) !== -1) return;
      for (var i = 0; i < rows.length; i++) {
        var v = rows[i][k];
        if (v != null && v !== '' && !(typeof v === 'number' && !isFinite(v))) { keys.push(k); break; }
      }
    });
    return keys;
  }

  function template(id) {
    var schema = SCHEMAS[id];
    var sample = seed(id).slice(0, 3);
    var headers = schema.columns.map(function (c) { return c.key; });
    var lines = [headers.join(',')];
    sample.forEach(function (r) {
      lines.push(headers.map(function (h) {
        var v = r[h] == null ? '' : String(r[h]);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    return lines.join('\n');
  }

  window.DATA = {
    MAX_ROWS: MAX_ROWS,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    SUBJECTS: SUBJECTS,
    WEEK: WEEK,
    IRIS_FEATURES: IRIS_FEATURES,
    IRIS_SPECIES: IRIS_SPECIES,
    AGE_BANDS: AGE_BANDS,
    AREA_BANDS: AREA_BANDS,
    HOUSE_AGE_BANDS: HOUSE_AGE_BANDS,
    ORDER_SLOTS: ORDER_SLOTS,
    SEASONS: SEASONS,
    RAIN_LEVELS: RAIN_LEVELS,
    BIKE_SLOTS: BIKE_SLOTS,
    BIKE_WEATHER: BIKE_WEATHER,
    TEA_CATS: TEA_CATS,
    TEA_SUGAR: TEA_SUGAR,
    POSITIONS: POSITIONS,
    SCORE_BANDS: SCORE_BANDS,
    GENRES: GENRES,
    RATING_BANDS: RATING_BANDS,
    DECADES: DECADES,
    SCHEMAS: SCHEMAS,
    seed: seed,
    enrich: enrich,
    parse: parse,
    parseTable: parseTable,
    plainNumber: plainNumber,
    KIND_LABEL: KIND_LABEL,
    parseChunked: parseChunked,
    yieldTask: yieldTask,
    normalize: normalize,
    presentKeys: presentKeys,
    template: template,
    iso: iso,
    addDays: addDays
  };
})();