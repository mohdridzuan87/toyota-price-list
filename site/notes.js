// Footnotes shared by the web page and the PDF. ASCII only, so they render in the PDF's built-in font.
export function notes(s) {
  return [
    'Body price = On-The-Road price without insurance (Individual, Peninsular Malaysia) from the UMW Toyota Motor price list. Rebates follow the Toyota Malaysia monthly promotions page and are subject to terms and conditions; the rebate is not deducted from the body price in the figures above.',
    "Est. insurance is an indicative figure, not a quotation. Toyota does not publish premiums, so it is calculated from Toyota's Recommended Sum Insured; the actual premium depends on the customer's profile, NCD and cover.",
    `D/P ${s.dpPercent}% = ${s.dpPercent}% x body price; D/P 0% = no down payment. Loan = body price - D/P. Monthly = (loan x ${s.ratePercent}% x ${s.years} years + loan) / ${s.years * 12}, flat rate. Insurance is payable separately and is not included in the D/P or the loan.`,
    'All figures are estimates and subject to bank approval. Prices, rebates and promotions may change at any time without prior notice.',
    'Unofficial tool made for Toyota sales advisors. It is not issued or endorsed by UMW Toyota Motor Sdn Bhd. Always confirm against the official Toyota price list.',
  ];
}

export const DOCS = {
  individual: ['IC copy', 'Licence copy', 'Payslip 3 or 6 months', 'Bank statement 3 or 6 months', 'KWSP statement / EA form'],
  company: ['IC director & SSM company copy', 'Bank statement 6 months', 'Income tax slip'],
};
