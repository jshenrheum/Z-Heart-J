export type IconName =
  | 'home' | 'info' | 'list' | 'plan' | 'search' | 'plus' | 'copy' | 'phone' | 'pin' | 'map' | 'mail' | 'globe' | 'lock'
  | 'chevron' | 'check' | 'undo' | 'user' | 'x' | 'arrowUp' | 'arrowDown' | 'trash' | 'calendar' | 'refresh' | 'edit'
  | 'fax' | 'building' | 'wifi' | 'paw' | 'car' | 'bolt' | 'wrench' | 'heart' | 'repeat' | 'download' | 'eye' | 'logout';

const PATHS: Record<IconName, string> = {
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  logout: 'M13.5 4.5h-8v15h8 M10 12h10.5 M17 8.5l3.5 3.5-3.5 3.5',
  home: 'M3 11.5 12 4l9 7.5 M5.5 10v9.5h13V10 M10 19.5v-5h4v5',
  info: 'M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H7.5A2.5 2.5 0 0 1 5 17.5Z M5 17.5A2.5 2.5 0 0 1 7.5 15H18',
  list: 'M9 6.5h11 M9 12h11 M9 17.5h11 M4.5 6.5h.01 M4.5 12h.01 M4.5 17.5h.01',
  plan: 'M4.5 6.5h15v13h-15Z M4.5 10.5h15 M8.5 3.5v4 M15.5 3.5v4 M9.5 15l2 2 3.5-4',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z M15.5 15.5 20 20',
  plus: 'M12 5v14 M5 12h14',
  copy: 'M8.5 8.5h10v12h-10Z M5.5 15.5v-12h10',
  phone: 'M7 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 5 5.5a2 2 0 0 1 2-2Z',
  pin: 'M9 4.5h6l-1 5 3 3H7l3-3Z M12 12.5v7',
  map: 'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11Z M12 12a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
  mail: 'M4 6.5h16v11H4Z M4.5 7l7.5 6 7.5-6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M3 12h18 M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9Z',
  lock: 'M6.5 11h11v8.5h-11Z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  chevron: 'M9 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  undo: 'M8.5 6.5 4 11l4.5 4.5 M4.5 11H14a5.5 5.5 0 0 1 0 11h-3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4.5 20a7.5 7.5 0 0 1 15 0',
  x: 'M6 6l12 12 M18 6 6 18',
  arrowUp: 'M12 19V5 M6 11l6-6 6 6',
  arrowDown: 'M12 5v14 M6 13l6 6 6-6',
  trash: 'M5 7h14 M9 7V4.5h6V7 M7 7l.8 12.5h8.4L17 7',
  calendar: 'M4.5 6.5h15v13h-15Z M4.5 10.5h15 M8.5 3.5v4 M15.5 3.5v4',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3 M19.5 4.5v4h-4',
  edit: 'M5 19l.8-3.6L16.5 4.7a1.8 1.8 0 0 1 2.6 0l.2.2a1.8 1.8 0 0 1 0 2.6L8.6 18.2Z M14.5 6.7l2.8 2.8',
  fax: 'M7 9V4.5h10V9 M7 17H5V9.5h14V17h-2 M7 14h10v6H7Z',
  building: 'M5 20.5v-16h9v16 M14 9.5h5v11 M8 8h3 M8 12h3 M8 16h3',
  wifi: 'M3.5 9.5a12 12 0 0 1 17 0 M6.5 12.8a8 8 0 0 1 11 0 M9.4 16a4 4 0 0 1 5.2 0 M12 19.2h.01',
  paw: 'M8 11.5c-1 0-1.8-1-1.8-2.2S7 7.1 8 7.1s1.8 1 1.8 2.2S9 11.5 8 11.5Z M16 11.5c-1 0-1.8-1-1.8-2.2S15 7.1 16 7.1s1.8 1 1.8 2.2-.8 2.2-1.8 2.2Z M12 8.6c-1 0-1.7-1-1.7-2.1S11 4.4 12 4.4s1.7 1 1.7 2.1S13 8.6 12 8.6Z M12 11.5c-2.8 0-5.2 3.4-5.2 5.5 0 1.6 1.4 2.3 2.7 2.3 1 0 1.6-.5 2.5-.5s1.5.5 2.5.5c1.3 0 2.7-.7 2.7-2.3 0-2.1-2.4-5.5-5.2-5.5Z',
  car: 'M4 15.5v-3.2l1.6-4.3a1.5 1.5 0 0 1 1.4-1h10a1.5 1.5 0 0 1 1.4 1L20 12.3v3.2 M4 15.5h16v2.5H4Z M7.5 18v1.5 M16.5 18v1.5 M7.5 13h.01 M16.5 13h.01',
  bolt: 'M13 3.5 6 13h5l-1 7.5L18 11h-5Z',
  wrench: 'M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5Z',
  heart: 'M12 19.5C6.5 15.8 4 12.8 4 9.8a3.8 3.8 0 0 1 6.7-2.5L12 8.8l1.3-1.5A3.8 3.8 0 0 1 20 9.8c0 3-2.5 6-8 9.7Z',
  repeat: 'M5 11V9.5A2.5 2.5 0 0 1 7.5 7H18 M15.5 4.5 18 7l-2.5 2.5 M19 13v1.5a2.5 2.5 0 0 1-2.5 2.5H6 M8.5 19.5 6 17l2.5-2.5',
  download: 'M12 4.5v11 M7 11l5 5 5-5 M5 19.5h14',
};

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
