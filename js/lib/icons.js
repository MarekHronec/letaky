// Inline SVG ikony (stroke štýl, 24×24). Nové ikony pridávaj sem –
// v šablónach sa používajú cez svg('nazov') alebo atribút data-icon.

const ICONS = {
  tag: '<path d="M20 13 13 20a2 2 0 0 1-2.8 0L3 12.8V4h8.8L20 12a1.4 1.4 0 0 1 0 1Z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  home: '<path d="m3 11 9-7 9 7"/><path d="M5.5 10v10h13V10M9.5 20v-6h5v6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m4 6 .8.8L6.5 5M4 12l.8.8L6.5 11M4 18l.8.8 1.7-1.8"/>',
  bookmark: '<path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21L12 17.5 6.5 21Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  check: '<path d="m5 12 4.2 4L19 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  cart: '<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.5a2 2 0 0 0 2 1.5H18a2 2 0 0 0 2-1.6l1-6.4H6"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 4.2 2.5 18a2 2 0 0 0 1.8 3h15.4a2 2 0 0 0 1.8-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v5h16v-5"/>',
  download: '<path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M4 20h16"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/>',
  doc: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/><path d="m8.8 14.5 2 2 4-4.2"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.9 7.9 0 0 0 0-3l1.6-1.2-1.8-3.1-1.9.8a7.6 7.6 0 0 0-2.6-1.5L14.4 2H9.6l-.3 2a7.6 7.6 0 0 0-2.6 1.5l-1.9-.8L3 7.8 4.6 9a7.9 7.9 0 0 0 0 3L3 13.5l1.8 3.1 1.9-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2h4.8l.3-2a7.6 7.6 0 0 0 2.6-1.5l1.9.8 1.8-3.1Z"/>',
};

export function svg(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.tag}</svg>`;
}

// Nahradí obsah všetkých elementov s data-icon atribútom príslušnou ikonou.
export function initIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(node => {
    node.innerHTML = svg(node.dataset.icon);
  });
}
