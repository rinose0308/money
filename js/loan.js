// 住宅ローンの月次計算エンジン (銀行の返済予定表と同じ計算)
//
//  ・利息 = floor(返済前の残高 × 年利 ÷ 12)
//    (りょちょ・まちょの予定表の 2054年1〜3月の数字と1円単位で一致することを確認済み)
//  ・毎月の返済額が足りないと、返しきれなかった元金が最終月にまとめて来る (しわ寄せ)
//  ・5年ルール: 返済額は5年ごとに見直し。上げ幅は直前の返済額の125%まで
//  ・返済額が利息に届かない月は、不足分が「未払利息」として残り、以後の返済で先に充当される
//
// 月は「年×12 + (月−1)」の通し番号 (monthIndex) で扱う。
// DOM に触らない純粋な計算だけを置いているので、Node からそのままテストできる。

// 'YYYY-MM' → 通し番号。形式が違えば null
export function monthIndex(s) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  return (+m[1]) * 12 + (mo - 1);
}
export const yearOf = (idx) => Math.floor(idx / 12);
export const monthStr = (idx) => `${yearOf(idx)}-${String((idx % 12) + 1).padStart(2, '0')}`;
export const monthLabel = (idx) => `${yearOf(idx)}年${(idx % 12) + 1}月`;

// 残高を n 回の同額払いで返しきる毎月の返済額 (元利均等)。端数は切り上げ
export function levelPayment(balance, ratePct, n) {
  if (!(balance > 0)) return 0;
  if (n <= 1) return Math.ceil(balance);
  const r = (ratePct || 0) / 100 / 12;
  if (r === 0) return Math.ceil(balance / n);
  return Math.ceil(balance * r / (1 - Math.pow(1 + r, -n)));
}

// spec: { balance, ratePct, finalIdx, payment (null=自動), fiveYear, reviewIdx }
// startIdx: この月の返済から計算を始める (balance はその直前の残高)
export function createLoan(spec, startIdx) {
  const balance = Math.max(0, Math.round(spec.balance || 0));
  const n = spec.finalIdx - startIdx + 1;
  const auto = !(spec.payment > 0);
  const L = {
    balance,
    unpaid: 0,                         // 未払利息
    ratePct: Math.max(0, spec.ratePct || 0),
    finalIdx: spec.finalIdx,
    payment: auto ? levelPayment(balance, spec.ratePct, n) : Math.round(spec.payment),
    auto,
    fiveYear: !!spec.fiveYear && !auto,   // 自動計算の返済額はもともと完済まで足りるので見直し不要
    reviewIdx: null,
    done: balance <= 0 || n < 1,
    paidOffIdx: null,
  };
  if (L.fiveYear) {
    let r = spec.reviewIdx ?? (startIdx + 60);
    while (r < startIdx) r += 60;     // 過去の見直し月が入っていたら次の見直しまで進める
    L.reviewIdx = r;
  }
  return L;
}

// 繰上げ返済 (その月の返済より前に入れる)。実際に充てた額を返す
//   shorten = 期間短縮型: 毎月の返済額はそのまま → 早く終わる / 最終月のしわ寄せが減る
//   reduce  = 返済額軽減型: 残高が減った割合だけ毎月の返済額を下げる
export function prepayLoan(L, amount, mode, idx) {
  if (L.done || !(amount > 0)) return 0;
  const x = Math.min(Math.round(amount), L.balance + L.unpaid);
  const toUnpaid = Math.min(x, L.unpaid);   // 未払利息があれば先に精算
  L.unpaid -= toUnpaid;
  const toPrincipal = x - toUnpaid;
  if (mode === 'reduce' && L.balance > 0) {
    L.payment = Math.round(L.payment * (L.balance - toPrincipal) / L.balance);
  }
  L.balance -= toPrincipal;
  if (L.balance <= 0 && L.unpaid <= 0) {
    L.balance = 0; L.unpaid = 0; L.done = true; L.paidOffIdx = idx;
  }
  return x;
}

// 1ヶ月分の返済。{ pay, interest, final, regular } を返す
//   final   = 最終月 (残りを一括で払った月)
//   regular = その月の約定返済額 (しわ寄せの判定に使う)
export function stepMonth(L, idx) {
  if (L.done) return { pay: 0, interest: 0, final: false, regular: 0 };
  const interest = Math.floor(L.balance * L.ratePct / 100 / 12);

  if (idx >= L.finalIdx) {
    const pay = L.balance + L.unpaid + interest;
    const regular = L.payment;
    L.balance = 0; L.unpaid = 0; L.done = true; L.paidOffIdx = idx;
    return { pay, interest, final: true, regular };
  }

  if (L.fiveYear && L.reviewIdx != null && idx >= L.reviewIdx) {
    // 残り回数で完済できる額に見直す。ただし上げ幅は直前の125%まで (下げは制限なし)
    const fresh = levelPayment(L.balance + L.unpaid, L.ratePct, L.finalIdx - idx + 1);
    L.payment = Math.min(fresh, Math.floor(L.payment * 1.25));
    L.reviewIdx += 60;
  }

  const due = interest + L.unpaid;
  let pay = L.payment;
  if (pay >= due) {
    const principal = pay - due;
    L.unpaid = 0;
    if (principal >= L.balance) {
      pay = L.balance + due;
      L.balance = 0; L.done = true; L.paidOffIdx = idx;
    } else {
      L.balance -= principal;
    }
  } else {
    L.unpaid = due - pay;   // 利息を払いきれない → 未払利息として持ち越し
  }
  return { pay, interest, final: false, regular: L.payment };
}

// 最終月の支払が通常の返済の1.5倍を超えていたら「しわ寄せ」とみなす
// (端数調整で最終回が少し大きくなるだけのケースは除く)
export function isBalloon(finalPay, regular) {
  return finalPay > regular * 1.5 && finalPay - regular > 10000;
}

// 繰上げは「その年の最初の返済月の前」に入れる (開始年は startIdx、以降は1月)
function prepayMonthOf(year, startIdx) {
  return year === yearOf(startIdx) ? startIdx : year * 12;
}

// 1本のローンを最後まで回す (ライフプランの資金繰りとは切り離した単体計算)
// prepays: [{ year, amount, mode }]
export function simulateLoan(spec, startIdx, prepays = []) {
  const L = createLoan(spec, startIdx);
  const firstPayment = L.payment;
  const byMonth = new Map();
  for (const p of prepays) {
    const m = prepayMonthOf(p.year, startIdx);
    if (m < startIdx || m > spec.finalIdx) continue;
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(p);
  }
  let interest = 0, paid = 0, prepaid = 0, finalPay = 0, regular = L.payment, balloon = false;
  for (let idx = startIdx; !L.done && idx <= spec.finalIdx; idx++) {
    for (const p of byMonth.get(idx) ?? []) prepaid += prepayLoan(L, p.amount, p.mode, idx);
    if (L.done) break;
    const s = stepMonth(L, idx);
    interest += s.interest; paid += s.pay;
    if (s.final) { finalPay = s.pay; regular = s.regular; balloon = isBalloon(s.pay, s.regular); }
    else regular = s.regular;
  }
  return {
    firstPayment, lastPayment: regular, interest, paid, prepaid,
    finalPay, balloon, paidOffIdx: L.paidOffIdx,
  };
}

// 条件を満たす最小の額を1万円単位で二分探索 (金額が増えるほど満たしやすい前提)
function smallestAmount(ok, cap) {
  const U = 10000;
  if (ok(0)) return 0;
  const capU = Math.max(1, Math.ceil(cap / U));
  let hiU = 1;
  while (!ok(hiU * U)) {
    if (hiU >= capU) return null;
    hiU = Math.min(hiU * 2, capU);
  }
  let loU = 0;   // ok(loU) = false, ok(hiU) = true
  while (hiU - loU > 1) {
    const midU = Math.floor((loU + hiU) / 2);
    if (ok(midU * U)) hiU = midU; else loU = midU;
  }
  return hiU * U;
}

// 「毎年いくら繰上げれば最終月のしわ寄せが消えるか」(期間短縮型・fromYear〜toYear の毎年初め)
// basePrepays (すでに予定している繰上げ) に上乗せする額を返す。不可能なら null
export function solveYearlyPrepay(spec, startIdx, basePrepays, fromYear, toYear) {
  if (toYear < fromYear) return null;
  const ok = (x) => {
    const extra = [];
    if (x > 0) for (let y = fromYear; y <= toYear; y++) extra.push({ year: y, amount: x, mode: 'shorten' });
    return !simulateLoan(spec, startIdx, [...basePrepays, ...extra]).balloon;
  };
  return smallestAmount(ok, Math.max(spec.balance, 10000));
}

// 「今(計算開始月)いくら一括で繰上げればしわ寄せが消えるか」(期間短縮型)
export function solveLumpPrepay(spec, startIdx, basePrepays) {
  const year = yearOf(startIdx);
  const ok = (x) => !simulateLoan(spec, startIdx,
    x > 0 ? [...basePrepays, { year, amount: x, mode: 'shorten' }] : basePrepays).balloon;
  return smallestAmount(ok, Math.max(spec.balance, 10000));
}
