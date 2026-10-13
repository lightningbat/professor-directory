const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const SearchIcon = (p) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const BuildingIcon = (p) => (
  <svg {...base} {...p}><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 21h18M4 18h16" /></svg>
);
export const GridIcon = (p) => (
  <svg {...base} {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></svg>
);
export const PersonIcon = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>
);
export const ChevronDown = (p) => (
  <svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>
);
export const ChevronLeft = (p) => (
  <svg {...base} {...p}><path d="m15 6-6 6 6 6" /></svg>
);
export const ChevronRight = (p) => (
  <svg {...base} {...p}><path d="m9 6 6 6-6 6" /></svg>
);
export const ClipboardIcon = (p) => (
  <svg {...base} {...p}><rect x="6" y="5" width="12" height="16" rx="2" /><path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /></svg>
);
export const CheckIcon = (p) => (
  <svg {...base} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const MailIcon = (p) => (
  <svg {...base} {...p}><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m4 7.5 8 6 8-6" /></svg>
);
export const ArrowUpRight = (p) => (
  <svg {...base} {...p}><path d="M7 17 17 7M8.5 7H17v8.5" /></svg>
);
export const CapIcon = (p) => (
  <svg {...base} strokeWidth={1.7} {...p}><path d="m12 4 9 4.5-9 4.5-9-4.5L12 4Z" /><path d="M7 11v4.2c0 1.2 2.2 2.3 5 2.3s5-1.1 5-2.3V11" /><path d="M21 8.5V14" /></svg>
);
export const CloseIcon = (p) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
