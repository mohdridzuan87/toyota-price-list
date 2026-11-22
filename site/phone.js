// Malaysian phone number formatter (works while typing).
//   mobile   0163313607  -> +6016 - 331 3607   (011: +6011 - 2345 6789);  local style: 016-331 3607
//   landline 0312228028  -> +603 - 1222 8028   (other states: +604 - 123 4567);  local style: 03-1222 8028
function format(raw, local) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('60')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 10);
  const prefix = local ? '0' : '+60';
  if (!d) return local ? '' : '+60';

  // on screen: +6016 - 331 3607   |   on the PDF / image: 016-331 3607
  const join = (area, ...rest) => {
    const parts = rest.filter(Boolean);
    return prefix + area + (parts.length ? (local ? '-' : ' - ') + parts[0] : '') + (parts[1] ? ' ' + parts[1] : '');
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

/** Phone input / page style: +6016 - 331 3607 */
export function formatMyPhone(raw) {
  return format(raw, false);
}

/** Style used on the generated PDF and image: 016-331 3607 */
export function formatMyPhoneLocal(raw) {
  return format(raw, true);
}

/** Digits only, in international form, for tel: links. */
export function telHref(formatted) {
  const d = String(formatted ?? '').replace(/\D/g, '');
  return d ? 'tel:+' + (d.startsWith('60') ? d : '60' + d.replace(/^0/, '')) : '';
}
