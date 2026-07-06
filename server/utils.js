function todayStr() {
  // KST 기준 YYYY-MM-DD
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function dowOf(dateStr) {
  // 0=Sun ... 6=Sat, 'YYYY-MM-DD' 달력 날짜 기준 (서버 로컬 시간대 영향 없음)
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(dateStr, n) {
  // 'YYYY-MM-DD' 달력 날짜 기준 단순 가감 (타임존 변환 없음)
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nowHM() {
  // KST 기준 HH:MM
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(11, 16);
}

function isPastDeadline(deadlineTime) {
  if (!deadlineTime) return false;
  return nowHM() > deadlineTime;
}

function isBeforeStart(startTime) {
  if (!startTime) return false;
  return nowHM() < startTime;
}

// 가중치 배열 [[값, 가중치], ...] 중 하나를 가중 무작위로 선택
function weightedPick(pairs) {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let x = Math.random() * total;
  for (const [value, w] of pairs) {
    if (x < w) return value;
    x -= w;
  }
  return pairs[pairs.length - 1][0];
}

const DEFAULT_DRAW_CONFIG = {
  badNumbers: [],          // 낮은 달성률일 때 나오는 나쁜 숫자 (예: [-1, -2]), 비어있으면 비활성
  badThreshold: 0.3,       // 이 비율 미만이면 나쁜 숫자 영역
  lowNumbers: [1, 2],     // 평소에 나오는 보통 숫자들
  highNumbers: [3, 4, 5], // 잘했을 때 나올 수 있는 특별한 숫자들
  threshold: 0.7,         // 이 정도(0~1) 이상 했을 때부터 특별한 숫자가 나올 수 있음
  minChance: 0.15,        // 기준을 막 넘었을 때 특별한 숫자가 나올 확률
  maxChance: 0.6          // 다 했을 때(100%) 특별한 숫자가 나올 확률
};

function normalizeDrawConfig(config) {
  const c = config || {};
  const badNumbers = Array.isArray(c.badNumbers) ? c.badNumbers : DEFAULT_DRAW_CONFIG.badNumbers;
  const lowNumbers = Array.isArray(c.lowNumbers) && c.lowNumbers.length ? c.lowNumbers : DEFAULT_DRAW_CONFIG.lowNumbers;
  const highNumbers = Array.isArray(c.highNumbers) && c.highNumbers.length ? c.highNumbers : DEFAULT_DRAW_CONFIG.highNumbers;
  const clamp01 = v => Math.max(0, Math.min(1, v));
  return {
    badNumbers,
    badThreshold: clamp01(c.badThreshold ?? DEFAULT_DRAW_CONFIG.badThreshold),
    lowNumbers,
    highNumbers,
    threshold: clamp01(c.threshold ?? DEFAULT_DRAW_CONFIG.threshold),
    minChance: clamp01(c.minChance ?? DEFAULT_DRAW_CONFIG.minChance),
    maxChance: clamp01(c.maxChance ?? DEFAULT_DRAW_CONFIG.maxChance)
  };
}

// 배열의 뒤쪽(큰 숫자)일수록 bias가 커질 때 더 잘 나오도록 가중치를 만듦
function weightsByPosition(numbers, bias) {
  return numbers.map((n, i) => [n, 1 + bias * i]);
}

// rate(0~1, 오늘 루틴을 한 만큼)에 비례한 확률로 설정된 숫자 중 하나를 뽑음.
// rate가 threshold 미만이면 항상 lowNumbers 중에서만 나오고,
// threshold 이상이면 minChance~maxChance 확률로 highNumbers 중 하나가 나올 수 있음.
// 어느 그룹이든 rate(또는 그 그룹 안에서의 정도)가 높을수록 큰 숫자 쪽 비중이 커짐.
function rollDrawNumber(rate, config) {
  const cfg = normalizeDrawConfig(config);
  const r = Math.max(0, Math.min(1, rate || 0));

  // 달성률이 나쁜 숫자 기준 미만이면 나쁜 숫자 영역 (badNumbers가 설정된 경우에만)
  if (cfg.badNumbers.length && r < cfg.badThreshold) {
    const span = Math.max(cfg.badThreshold, 0.0001);
    const howBad = (cfg.badThreshold - r) / span; // 0(기준 근처)~1(0% 달성)
    return { number: weightedPick(weightsByPosition(cfg.badNumbers, howBad)), tier: 'bad' };
  }

  if (r >= cfg.threshold) {
    const span = Math.max(1 - cfg.threshold, 0.0001);
    const bonus = (r - cfg.threshold) / span; // 0~1
    const highChance = cfg.minChance + bonus * (cfg.maxChance - cfg.minChance);
    if (Math.random() < highChance) {
      return { number: weightedPick(weightsByPosition(cfg.highNumbers, bonus)), tier: 'special' };
    }
  }
  return { number: weightedPick(weightsByPosition(cfg.lowNumbers, r)), tier: 'normal' };
}

function genCode(len = 4) {
  let code = '';
  for (let i = 0; i < len; i++) code += Math.floor(Math.random() * 10);
  return code;
}

async function pickMessage(db, classId, rate) {
  const tiers = await db.prepare(
    `SELECT * FROM encouragement_tiers WHERE class_id = ? OR class_id IS NULL ORDER BY (class_id IS NULL) ASC, sort_order ASC`
  ).all(classId);
  for (const t of tiers) {
    if (rate >= t.min_rate && rate <= t.max_rate) return t.message;
  }
  return '';
}

module.exports = { todayStr, dowOf, addDays, genCode, pickMessage, nowHM, isPastDeadline, isBeforeStart, rollDrawNumber, normalizeDrawConfig, DEFAULT_DRAW_CONFIG };
