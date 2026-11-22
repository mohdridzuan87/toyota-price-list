// Malaysian phone number formatter (works while typing). Local style, no +60:
//   mobile   0163313607  -> 016-331 3607   (011: 011-2345 6789)
//   landline 0312228028  -> 03-1222 8028   (other states: 04-123 4567)
// A number pasted with +60 / 60 in front is converted to the local style.
export function formatMyPhone(raw) {
  const all = String(raw ?? '').replace(/\D/g, '');
  if (!all) return '';
  let d = all;
  if (d.startsWith('60')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 10);
  if (!d) return all.startsWith('0') ? '0' : ''; // just the leading 0 typed so far

  const join = (area, ...rest) => {
    const parts = rest.filter(Boolean);
    return '0' + area + (parts.length ? '-' + parts[0] : '') + (parts[1] ? ' ' + parts[1] : '');
  };

  if (d[0] === '1') {
    const area = d.slice(0, 2);
    if (d.startsWith('11')) return join(area, d.slice(2, 6), d.slice(6, 10));
    return join(area, d.slice(2, 5), d.slice(5, 9));
  }
  // landline: 03/04/05/06/07/09 = 1-digit area code, 08x (Sarawak/Sabah) = 2 digits
  const area = d[0] === '8' ? d.slice(0, 2) : d.slice(0, 1);
  const rest = d.slice(area.length);
  if (area === '3') return join(area, rest.slice(0, 4), rest.slice(4, 8));
  return join(area, rest.slice(0, 3), rest.slice(3, 7));
}

/** Same format; kept as an alias for the PDF / image code. */
export const formatMyPhoneLocal = formatMyPhone;

/** Digits only, in international form, for tel: links. */
export function telHref(formatted) {
  const d = String(formatted ?? '').replace(/\D/g, '');
  return d ? 'tel:+' + (d.startsWith('60') ? d : '60' + d.replace(/^0/, '')) : '';
}
