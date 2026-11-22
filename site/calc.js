// Finance maths, identical to the original Excel price list.
//   D/P 10%        = 10% x (body price + estimated insurance)
//   Loan (90%)     = body price - D/P
//   9 yrs / 90%    = (loan x rate x years + loan) / (years x 12)      (flat rate)
//   9 yrs / 100%   = (body x rate x years + body) / (years x 12)      (no D/P)
export function calc(body, insurance, { dpPercent = 10, ratePercent = 2.3, years = 9 } = {}) {
  const dp = (body + insurance) * (dpPercent / 100);
  const loan = body - dp;
  const monthly = (principal) => (principal * (ratePercent / 100) * years + principal) / (years * 12);
  return { dp, loan, m90: monthly(loan), m100: monthly(body) };
}

export const rm = (n) => 'RM' + Math.round(n).toLocaleString('en-US');
