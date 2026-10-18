/* 错题本 · 方法论核心规则（纯函数，浏览器与 Node 共用）
   视频框架：定位 → 收集 → 整理 → 重复 → 清除
   两条铁律：记录是为使用服务的；错题本不是越厚越好（连对三次就划掉）
   本文件不碰 DOM、不碰网络，方便用 node --test 直接测。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const p2 = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const fmtStamp = d => `${fmtDate(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  const today = (now) => fmtDate(now ? new Date(now) : new Date());

  function parseStamp(s) {
    if (!s) return null;
    const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  function addDays(dateStr, n) {
    const d = parseStamp(dateStr) || new Date();
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  }

  function daysBetween(from, to) {           // to - from，按自然日算
    const a = parseStamp(from), b = parseStamp(to);
    if (!a || !b) return 0;
    const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((db - da) / 86400000);
  }

  /* ---------- 课程权重（2026 级 · 软件工程 2024 版培养方案） ----------
     口径：推免只看大一~大三，前六个学期合计 147 学分；
     某课杠杆 = 该课学分 ÷ 147（该课绩点每变动 1.0，加权平均绩点就变动这么多）。
     数据源：D:\大学保研\08_学习系统\学情配置.json（三个工具共用同一份）。 */
  const GPA_DENOM = 147;
  const COURSE_WEIGHTS = {
    '大一上': [['高等数学 I（上）', 5.5], ['高级语言程序设计', 4], ['大学英语（一）', 3], ['思想道德与法治', 3], ['软件工程专业导论', 1], ['中国传统文化', 1]],
    '大一下': [['高等数学I（下）', 6], ['大学物理I（上）', 4], ['离散数学', 3], ['大学英语（二）', 3], ['中国近现代史纲要', 3], ['马克思主义基本原理', 3], ['Java程序设计（双语教学）', 2.5], ['大学生心理健康教育', 2]]
  };
  const SUBJECT_SETS = {
    '大一上': ['未分类'].concat(COURSE_WEIGHTS['大一上'].map(x => x[0]), ['其他']),
    '大一下': ['未分类'].concat(COURSE_WEIGHTS['大一下'].map(x => x[0]), ['其他'])
  };
  // 期末考日期：1 月 17 日放假，考试在 1/11-1/16 之间；具体哪天以学校通知为准，设置页可改
  const EXAM_PRESET = {
    '大学英语（一）': '2027-01-11', '高级语言程序设计': '2027-01-12', '软件工程专业导论': '2027-01-13',
    '高等数学 I（上）': '2027-01-14', '思想道德与法治': '2027-01-15', '中国传统文化': '2027-01-16'
  };

  /* ---------- 默认设置 ---------- */
  function defaultSettings() {
    return {
      port: 8347,
      image: { maxEdge: 2000, quality: 85, keepOriginal: false },
      schedule: { first: 3, second: 7, examLeadDays: 14 },   // D+3 / D+7 / 考前 14 天起进清单
      remind: { pc: '19:30', phone: '20:00', skipWeekend: false, enabled: true },
      examDate: '',
      difficulties: ['基础', '中档', '综合'],                 // 定位用：难度必须匹配自己能力
      natureTypes: ['粗心', '概念模糊', '完全陌生'],            // 视频里的三类错题
      errorTypes: ['概念不清', '知识点片面理解', '套模板没走正常思考流程', '粗心', '其他'],
      subjects: SUBJECT_SETS['大一上'].slice(),
      subjectSets: JSON.parse(JSON.stringify(SUBJECT_SETS)),
      courseWeights: JSON.parse(JSON.stringify(COURSE_WEIGHTS)),
      currentTerm: '大一上',
      examDates: Object.assign({}, EXAM_PRESET),   // 按科目考试日期（优先于全局 examDate）
      meta: { schema: 3 },
      streak: { current: 0, best: 0, lastSettleDay: '' },
      pinIp: ''
    };
  }

  /* ---------- 题目对象 ---------- */
  function newItem(fields) {
    const now = fmtStamp(new Date());
    return Object.assign({
      id: Math.random().toString(16).slice(2, 12),
      createdAt: now,
      updatedAt: now,
      source: 'pc',
      subject: '未分类',
      status: 'inbox',        // inbox 待整理 / active 在库 / teardown 只拆解 / careless 粗心档案 / cleared 已毕业
      locate: { difficulty: '', nature: '', decidedAt: '' },
      question: { images: [], text: '' },
      red: { text: '', images: [] },                       // 红笔：规范解答
      blue: { errorType: '', errorText: '', gainText: '' },// 蓝笔：错因 + 收获（最有价值的部分）
      tags: [],
      attempts: [],
      schedule: { base: '', stage: 0, nextAt: null, lastAt: '' },
      marks: { rights: 0, wrongs: 0, streakRight: 0, alert: 0 },
      clearedAt: null,
      clearedReason: null
    }, fields || {});
  }

  /* ---------- 定位：三条去向 ---------- */
  // 视频：只整理「与你能力匹配的基础题和中档题」；难题只拆解、粗心只记原因
  const DEST = {
    active: { key: 'active', label: '进错题本', hint: '基础/中档题，值得反复重做的' },
    teardown: { key: 'teardown', label: '只拆解', hint: '难题：记下它拆出的知识点，不整题搬进本子' },
    careless: { key: 'careless', label: '只记原因', hint: '粗心类：进粗心档案，别占本子' }
  };

  // 定位 + 完成整理（写完红蓝笔）→ 正式入本，并按 D+3 排第一次重复
  function locate(item, opts) {
    const o = opts || {};
    item.status = o.status || 'active';
    item.locate = { difficulty: o.difficulty || '', nature: o.nature || '', decidedAt: fmtStamp(new Date()) };
    item.tags = o.tags || item.tags || [];
    item.subject = o.subject || item.subject || '未分类';
    if (item.status === 'active') {
      item.schedule.base = o.base || today();
      item.schedule.stage = 0;
      item.schedule.nextAt = addDays(item.schedule.base, (o.settings || defaultSettings()).schedule.first);
    }
    item.updatedAt = fmtStamp(new Date());
    return item;
  }

  /* ---------- 重复：错因比对（视频核心洞察） ---------- */
  const NOISE = /[\s，。、,.!?！？;；:：“”"'（）()【】\[\]—-]/g;
  function bigrams(s) {
    const t = String(s || '').replace(NOISE, '');
    const out = new Set();
    if (t.length === 1) out.add(t);
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  }
  function similarity(a, b) {
    const A = bigrams(a), B = bigrams(b);
    if (!A.size || !B.size) return 0;
    let hit = 0;
    A.forEach(x => { if (B.has(x)) hit++; });
    return hit / (A.size + B.size - hit);
  }

  // 上一次的错因：优先取最近一次重做时写的，没有就取整理时的蓝笔错因
  function lastError(item) {
    for (let i = item.attempts.length - 1; i >= 0; i--) {
      const a = item.attempts[i];
      if (a.errorType || a.errorText) return { type: a.errorType || '', text: a.errorText || '' };
    }
    const b = item.blue || {};
    return { type: b.errorType || '', text: b.errorText || '' };
  }

  // 一样 → 掌握得不扎实；不一样 → 还有别的理解不到位，第一次的蓝笔标记太片面
  function compareError(prev, cur) {
    const hasPrev = !!(prev && (prev.type || prev.text));
    const hasCur = !!(cur && (cur.type || cur.text));
    if (!hasPrev || !hasCur) {
      return { kind: 'first', same: false, similarity: 0, message: '这是第一次记录错因，先把它写具体。' };
    }
    const sameType = !!(prev.type && cur.type && prev.type === cur.type);
    const sim = similarity(prev.text, cur.text);
    const contain = prev.text && cur.text && prev.text.length >= 4 && cur.text.length >= 4 &&
      (prev.text.includes(cur.text) || cur.text.includes(prev.text));
    const same = sameType || sim >= 0.5 || contain;
    return {
      kind: same ? 'same' : 'diff',
      same,
      similarity: Number(sim.toFixed(2)),
      message: same
        ? '这次错因和上次一样 → 说明你对这个知识掌握得根本不扎实，别急着往下走，回去把最基础的那一步重新过一遍。'
        : '这次错因和上次不一样 → 说明你对这个知识还有其他方面的理解不到位，也就是说你第一次的蓝笔标记太片面。建议回本子把蓝笔的错因和收获补写清楚。'
    };
  }

  // 排期不能落在过去：算出来已经过期就顺延到明天
  function scheduleAt(baseStr, days, nowStr) {
    const cand = addDays(baseStr, days);
    return daysBetween(nowStr || today(), cand) >= 0 ? cand : addDays(nowStr || today(), 1);
  }

  /* ---------- 每次重做的结果 ---------- */
  // result: 'right' | 'wrong'；错了必须给错因
  function applyAttempt(item, input, settings) {
    const s = settings || defaultSettings();
    const now = input.at || fmtStamp(new Date());
    const prev = lastError(item);
    const attempt = {
      at: now, round: item.attempts.length + 1,
      result: input.result, mode: input.mode || 'screen',
      errorType: input.errorType || '', errorText: input.errorText || ''
    };
    let verdict = null;
    if (input.result === 'wrong') {
      verdict = compareError(prev, { type: attempt.errorType, text: attempt.errorText });
      attempt.sameAsPrev = verdict.same;
      attempt.verdict = verdict.kind;
      item.marks.wrongs++;
      item.marks.streakRight = 0;
      // 错过一次 = 重点盯住；连错三次 = 回去重新定位知识点（视频原话）
      // 视频：错的次数越多越要盯死；错两次就明确告诉他「回去重新定位知识点」
      item.marks.alert = item.marks.wrongs >= 2 ? 2 : 1;
      item.schedule.nextAt = addDays(now, 1);        // 明天补练一次，别等下一轮
      item.schedule.stage = Math.min(item.schedule.stage, 2);
    } else {
      item.marks.rights++;
      item.marks.streakRight++;
      if (item.schedule.stage === 0) {
        item.schedule.stage = 1;
        item.schedule.nextAt = scheduleAt(item.schedule.base || now, s.schedule.second, now);
      } else if (item.schedule.stage === 1) {
        item.schedule.stage = 2;
        item.schedule.nextAt = null;                 // 等考前那一轮
      } else {
        item.schedule.stage = 3;
        item.schedule.nextAt = null;
      }
    }
    item.schedule.lastAt = now;
    item.attempts.push(attempt);
    item.updatedAt = now;
    if (item.marks.streakRight >= 3) markCleared(item, 'auto', now);
    return { item, attempt, verdict, graduated: item.status === 'cleared' };
  }

  function markCleared(item, reason, at) {
    item.status = 'cleared';
    item.clearedAt = at || fmtStamp(new Date());
    item.clearedReason = reason || 'manual';
    item.schedule.nextAt = null;
    item.updatedAt = item.clearedAt;
    return item;
  }

  /* ---------- 到期 / 欠账 / 考前 / 统计 ---------- */
  const isActive = it => it.status === 'active';

  function dueItems(items, dayStr) {
    const d = dayStr || today();
    return items.filter(isActive).filter(it => it.schedule.nextAt && daysBetween(it.schedule.nextAt, d) >= 0)
      .sort((a, b) => (a.schedule.nextAt < b.schedule.nextAt ? -1 : a.schedule.nextAt > b.schedule.nextAt ? 1 : 0));
  }

  function focusItems(items, dayStr) {
    // 重点：错过两次以上（带感叹号）的题，重复时先看这类
    const d = dayStr || today();
    return dueItems(items, d).filter(it => it.marks.wrongs >= 2);
  }

  function debtSummary(items, dayStr) {
    const d = dayStr || today();
    const due = dueItems(items, d);
    const days = due.map(it => daysBetween(it.schedule.nextAt, d));
    return { count: due.length, maxDays: days.length ? Math.max.apply(null, days) : 0, items: due, days };
  }

  /* ---------- 科目考试日期 + 学分权重 ---------- */
  // 某科目对应的考试日期：优先「按科目」的 examDates，其次全局 examDate（老数据兼容）
  function subjectExam(settings, subject) {
    const s = settings || defaultSettings();
    const map = s.examDates || {};
    if (subject && map[subject]) return map[subject];
    return s.examDate || '';
  }

  function terms(settings) { return Object.keys((settings || defaultSettings()).subjectSets || SUBJECT_SETS); }

  function subjectsOf(settings, term) {
    const s = settings || defaultSettings();
    const t = term || s.currentTerm || '大一上';
    const sets = s.subjectSets || SUBJECT_SETS;
    return ((sets[t] || SUBJECT_SETS['大一上']) || []).slice();
  }

  // 切换学期：科目集跟着换（推免口径是学分加权，换学期就等于换权重表）
  function switchTerm(settings, term) {
    const s = settings || defaultSettings();
    s.currentTerm = term;
    s.subjects = subjectsOf(s, term);
    return s;
  }

  // 某科目的学分（没登记的科目返回 null）
  function subjectWeight(settings, subject) {
    const s = settings || defaultSettings();
    const t = s.currentTerm || '大一上';
    const rows = (s.courseWeights || COURSE_WEIGHTS)[t] || [];
    const hit = rows.filter(r => r[0] === subject)[0];
    return hit ? hit[1] : null;
  }

  // 老库升级：补科目集/权重表/按科考试日期（幂等，启动时可反复调用）
  function migrateSettings(settings) {
    const s = Object.assign({}, settings || {});
    let changed = false;
    if (!s.subjectSets || !Object.keys(s.subjectSets).length) { s.subjectSets = JSON.parse(JSON.stringify(SUBJECT_SETS)); changed = true; }
    if (!s.courseWeights || !Object.keys(s.courseWeights).length) { s.courseWeights = JSON.parse(JSON.stringify(COURSE_WEIGHTS)); changed = true; }
    if (!s.currentTerm) { s.currentTerm = '大一上'; changed = true; }
    const oldDefault = '未分类,高数,线代,概率,英语';
    const isOld = !s.subjects || !s.subjects.length || (s.subjects || []).join(',') === oldDefault;
    if (isOld) { s.subjects = subjectsOf(s, s.currentTerm); changed = true; }
    if (!s.examDates) { s.examDates = Object.assign({}, EXAM_PRESET); changed = true; }
    if (!s.meta || s.meta.schema !== 3) { s.meta = Object.assign({ schema: 3 }, s.meta || {}); changed = true; }
    return { settings: s, changed: changed };
  }

  // 考试就绪度：按科目分组（在库题 / 其中连对≥2 次的 / 就绪度 / 该科学分）
  function examReadiness(items, settings, dayStr) {
    const s = settings || defaultSettings();
    const d = dayStr || today();
    const map = new Map();
    for (const it of items.filter(isActive)) {
      const exam = subjectExam(s, it.subject);
      if (!exam) continue;
      const subj = it.subject || '未分类';
      const row = map.get(subj) || { subject: subj, exam: exam, daysLeft: daysBetween(d, exam), total: 0, mastered: 0, wrongHard: 0, credits: subjectWeight(s, subj), ready: 0 };
      row.total++;
      if (it.marks && it.marks.streakRight >= 2) row.mastered++;
      if (it.marks && it.marks.wrongs >= 2) row.wrongHard++;
      map.set(subj, row);
    }
    const rows = [...map.values()].map(r => Object.assign(r, { ready: r.total ? Math.round(r.mastered / r.total * 100) : 0 }));
    rows.sort((a, b) => (a.daysLeft - b.daysLeft) || ((b.credits || 0) - (a.credits || 0)));
    let wsum = 0, w = 0;
    for (const r of rows) { if (r.credits) { wsum += r.credits * r.ready; w += r.credits; } }
    return { rows: rows, weightedReady: w ? Math.round(wsum / w) : null, weightedCredits: w };
  }

  // 考前清单：先排「第二遍又错的」，再排其余在库题（视频原话）。
  // 现在按「科目」各看各的考试日期：先到期的那科排前面；daysLeft 取最近的一场。
  function examItems(items, settings, dayStr) {
    const s = settings || defaultSettings();
    const d = dayStr || today();
    const lead = s.schedule.examLeadDays || 14;
    const weight = it => (it.marks.wrongs >= 2 ? 0 : it.schedule.stage <= 1 ? 1 : 2);
    const dated = items.filter(isActive)
      .map(it => ({ it: it, exam: subjectExam(s, it.subject) }))
      .filter(x => !!x.exam);
    const bySubject = examReadiness(items, s, d).rows;
    if (!dated.length) return { inWindow: false, daysLeft: null, list: [], daysBefore: lead, nextExam: '', bySubject: bySubject };
    const nextExam = dated.map(x => x.exam).sort()[0];
    const daysLeft = daysBetween(d, nextExam);
    const inWindow = daysLeft <= lead;
    const list = dated.filter(x => daysBetween(d, x.exam) <= lead)
      .map(x => x.it)
      .sort((a, b) => {
        const ea = subjectExam(s, a.subject), eb = subjectExam(s, b.subject);
        if (ea !== eb) return ea < eb ? -1 : 1;
        return weight(a) - weight(b) || (b.marks.wrongs - a.marks.wrongs) || ((subjectWeight(s, b.subject) || 0) - (subjectWeight(s, a.subject) || 0));
      });
    return { inWindow: inWindow, daysLeft: daysLeft, list: list, daysBefore: lead, nextExam: nextExam, bySubject: bySubject };
  }

  function thickness(items) {
    return {
      active: items.filter(isActive).length,
      cleared: items.filter(it => it.status === 'cleared').length,
      teardown: items.filter(it => it.status === 'teardown').length,
      careless: items.filter(it => it.status === 'careless').length,
      inbox: items.filter(it => it.status === 'inbox').length,
      total: items.length
    };
  }

  // 漏洞榜：哪个考点错得最多、重复错最多
  function tagStats(items, opts) {
    const onlyOneTag = (opts || {}).onlyTags;
    const map = new Map();
    for (const it of items) {
      const tags = (it.tags && it.tags.length ? it.tags : ['（未标考点）']);
      for (const t of tags) {
        if (onlyOneTag && !onlyOneTag.includes(t)) continue;
        const row = map.get(t) || { tag: t, count: 0, wrongs: 0, active: 0, cleared: 0 };
        row.count++;
        row.wrongs += (it.marks && it.marks.wrongs) || 0;
        if (it.status === 'active') row.active++;
        if (it.status === 'cleared') row.cleared++;
        map.set(t, row);
      }
    }
    return [...map.values()].sort((a, b) => b.wrongs - a.wrongs || b.count - a.count);
  }

  // 连续达标天数：某天打开时没有欠账，就算达标；断了归零
  function settleStreak(streak, items, dayStr) {
    const d = dayStr || today();
    const s = Object.assign({ current: 0, best: 0, lastSettleDay: '' }, streak || {});
    if (s.lastSettleDay === d) return s;
    const debt = debtSummary(items, d);
    if (debt.count === 0) {
      s.current += 1;
    } else {
      s.current = 0;
    }
    s.best = Math.max(s.best || 0, s.current);
    s.lastSettleDay = d;
    return s;
  }

  /* ---------- 到点提醒该不该响 ---------- */
  // now: Date；state: {lastRemindFired:'YYYY-MM-DD HH:MM', skipped:{'YYYY-MM-DD':true}}
  function shouldRemind(settings, state, items, now) {
    const s = settings || defaultSettings();
    const st = state || {};
    const d = now || new Date();
    const hm = p2(d.getHours()) + ':' + p2(d.getMinutes());
    const dayKey = fmtDate(d);
    const r = s.remind || {};
    if (!r.enabled || !r.pc) return { fire: false, reason: '提醒已关闭' };
    if (r.pc !== hm) return { fire: false, reason: '还没到点' };
    if (st.lastRemindFired === dayKey + ' ' + hm) return { fire: false, reason: '这个点已经提醒过' };
    if (r.skipWeekend && (d.getDay() === 0 || d.getDay() === 6)) return { fire: false, reason: '周末不打扰' };
    if (st.skipped && st.skipped[dayKey]) return { fire: false, reason: '今天你选了跳过' };
    const debt = debtSummary(items, dayKey);
    if (!debt.count) return { fire: false, reason: '今天没有欠账，不打扰' };
    return { fire: true, reason: '欠账 ' + debt.count + ' 题', debt: debt.count, key: dayKey + ' ' + hm };
  }

  function scheduleLabel(item, settings) {
    const s = settings || defaultSettings();
    if (item.status === 'cleared') return item.clearedReason === 'auto' ? '连对三次，已划掉' : '手动划掉';
    if (!item.schedule.nextAt) return item.schedule.stage >= 2 ? '等考前那一轮' : '未排期';
    const d = daysBetween(today(), item.schedule.nextAt);
    if (d < 0) return `逾期 ${-d} 天`;
    if (d === 0) return '今天该重做';
    return `${d} 天后再来`;
  }

  return {
    p2, fmtDate, fmtStamp, parseStamp, addDays, daysBetween, today,
    defaultSettings, newItem, DEST, locate,
    GPA_DENOM, COURSE_WEIGHTS, SUBJECT_SETS, EXAM_PRESET,
    terms, subjectsOf, switchTerm, subjectWeight, migrateSettings, subjectExam, examReadiness,
    similarity, lastError, compareError, applyAttempt, markCleared, scheduleAt,
    isActive, dueItems, focusItems, debtSummary, examItems, shouldRemind,
    thickness, tagStats, settleStreak, scheduleLabel, shouldRemind
  };
}));

