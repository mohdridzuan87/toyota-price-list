// Finance maths (D/P on the body price only; insurance is paid separately and is not part of the D/P or the loan).
//   D/P 10%        = 10% x body price
//   Loan (90%)     = body price - D/P
//   9 yrs / 10% D/P = (loan x rate x years + loan) / (years x 12)     (flat rate)
//   9 yrs / 0% D/P  = (body x rate x years + body) / (years x 12)     (no D/P, whole body price financed)
// `insurance` is accepted only so callers keep one signature; it does not change any figure.
export function calc(body, insurance, { dpPercent = 10, ratePercent = 2.3, years = 9 } = {}) {
  const dp = body * (dpPercent / 100);
  const loan = body - dp;
  const monthly = (principal) => (principal * (ratePercent / 100) * years + principal) / (years * 12);
  return { dp, loan, m90: monthly(loan), m100: monthly(body) };
}

export const rm = (n) => 'RM' + Math.round(n).toLocaleString('en-US');
