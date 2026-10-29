<script setup>
const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
  strokeWidth: { type: [Number, String], default: 1.7 },
  filled: { type: Boolean, default: false },
});

const paths = {
  home: '<path d="M3 10.4 12 3l9 7.4"/><path d="M5.2 9v11.2h13.6V9"/><path d="M9.4 20.2v-6h5.2v6"/>',
  basket:
    '<path d="M4.6 8.5h14.8L18 20.2H6L4.6 8.5Z"/><path d="M9 8.5 12 3l3 5.5"/><path d="M9.5 12v4.4M14.5 12v4.4"/>',
  calendar:
    '<rect x="3.2" y="5" width="17.6" height="15.8" rx="3"/><path d="M8 3v4M16 3v4M3.2 9.8h17.6"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/>',
  clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.4V12l3.1 1.9"/>',
  book: '<path d="M4.2 18.6A2.6 2.6 0 0 1 6.8 16H20V3.4H6.8A2.6 2.6 0 0 0 4.2 6v12.6Z"/><path d="M4.2 18.6A2.6 2.6 0 0 0 6.8 21.2H20"/><path d="M8 7.2h8M8 10.6h5.5"/>',
  leaf: '<path d="M4.5 20c-.8-8.4 5-14.6 15-16.2.7 9.9-5.2 15.6-13.4 15.8"/><path d="M4.8 19.7c3.8-3.6 7.6-6 12.4-7.4"/>',
  settings:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.4"/><circle cx="9" cy="17" r="2.4"/>',
  user: '<circle cx="12" cy="8" r="3.9"/><path d="M4.5 20.6c.7-3.6 3.7-5.6 7.5-5.6s6.8 2 7.5 5.6"/>',
  users:
    '<circle cx="9.2" cy="8.4" r="3.4"/><path d="M3 20c.6-3.3 3-5.1 6.2-5.1s5.6 1.8 6.2 5.1"/><path d="M15.5 5.4a3.2 3.2 0 0 1 0 6.2M17.2 15.2c2.3.6 3.6 2.2 4 4.8"/>',
  search: '<circle cx="10.9" cy="10.9" r="7"/><path d="M16.2 16.2 21 21"/>',
  plus: '<path d="M12 4.8v14.4M4.8 12h14.4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  'chevron-left': '<path d="M14.8 5.5 8.3 12l6.5 6.5"/>',
  'chevron-right': '<path d="M9.2 5.5 15.7 12l-6.5 6.5"/>',
  'chevron-down': '<path d="M5.8 9.2 12 15.4l6.2-6.2"/>',
  'arrow-right': '<path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5"/>',
  'arrow-left': '<path d="M19.5 12h-15M11 5.5 4.5 12l6.5 6.5"/>',
  check: '<path d="M5 12.6 9.4 17 19 7"/>',
  trash: '<path d="M4 7h16M9.3 7V4.6h5.4V7"/><path d="M6.3 7l.9 13.2h9.6L17.7 7"/><path d="M10.3 11v5.4M13.7 11v5.4"/>',
  edit: '<path d="M4 20.2h16"/><path d="M6.2 16.3 15.6 7l2.9 2.9-9.3 9.3H6.2v-2.9Z"/><path d="M13.9 5.4 15.6 7"/>',
  camera:
    '<path d="M4 8.4h3l1.4-2h7.2l1.4 2h3v10.8H4V8.4Z"/><circle cx="12" cy="13.4" r="3.4"/>',
  paperclip: '<path d="M8.2 12.4 14 6.6a3.2 3.2 0 0 1 4.5 4.5l-7.9 7.9a5 5 0 0 1-7.1-7.1l7.6-7.6"/>',
  download: '<path d="M12 3.4v11.8M7.2 10.6 12 15.4l4.8-4.8M4.2 20.4h15.6"/>',
  upload: '<path d="M12 20V8.6M7.2 13 12 8.2l4.8 4.8M4.2 3.6h15.6"/>',
  mail: '<rect x="3" y="5.2" width="18" height="13.6" rx="2.6"/><path d="m3.8 7 8.2 5.6L20.2 7"/>',
  lock: '<rect x="4.2" y="10" width="15.6" height="10.6" rx="2.6"/><path d="M8 10V7.4a4 4 0 0 1 8 0V10"/><path d="M12 14.2v2.6"/>',
  logout: '<path d="M9.6 21H5.4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.2"/><path d="M16.4 16.6 21 12l-4.6-4.6M21 12H9.4"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  alert: '<path d="M12 9.4v4.2M12 17.2h.01"/><path d="M10.3 4.2 2.6 17.8A2 2 0 0 0 4.3 20.8h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10.8v5.4M12 7.6h.01"/>',
  image: '<rect x="3.2" y="4.4" width="17.6" height="15.2" rx="3"/><circle cx="8.8" cy="9.6" r="1.6"/><path d="m4.4 17.4 4.9-4.9 3.4 3.4 2.8-2.8 4.1 4.1"/>',
  file: '<path d="M13.8 3H6.4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11.2a2 2 0 0 0 2-2V8.6L13.8 3Z"/><path d="M13.8 3v5.6h5.8"/>',
  sparkle: '<path d="M12 3.4 13.8 9l5.6 1.8-5.6 1.8L12 18.2l-1.8-5.6L4.6 10.8 10.2 9 12 3.4Z"/><path d="M19 16.4 19.9 19l2.6.9-2.6.9-.9 2.6"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5 7.2 7.2M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>',
  list: '<path d="M8.5 6h12M8.5 12h12M8.5 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  heart: '<path d="M12 20.4S3.6 15.6 3.6 9.9A4.6 4.6 0 0 1 12 7.1a4.6 4.6 0 0 1 8.4 2.8c0 5.7-8.4 10.5-8.4 10.5Z"/>',
  droplet: '<path d="M12 3.2s6.2 6.1 6.2 11a6.2 6.2 0 0 1-12.4 0c0-4.9 6.2-11 6.2-11Z"/>',
  filter: '<path d="M3.4 5.2h17.2l-6.8 8v6.2l-3.6-1.8v-4.4l-6.8-8Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  refresh: '<path d="M20.6 12a8.6 8.6 0 1 1-2.6-6.2"/><path d="M20.8 3.4v5.2h-5.2"/>',
  shield: '<path d="M12 3.2 20 6v6.1c0 4.9-3.5 7.9-8 9-4.5-1.1-8-4.1-8-9V6l8-2.8Z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  database: '<ellipse cx="12" cy="6" rx="7.6" ry="3"/><path d="M4.4 6v12c0 1.7 3.4 3 7.6 3s7.6-1.3 7.6-3V6"/><path d="M4.4 12c0 1.7 3.4 3 7.6 3s7.6-1.3 7.6-3"/>',
  bell: '<path d="M6.4 9.8a5.6 5.6 0 0 1 11.2 0c0 5 2 6.4 2 6.4H4.4s2-1.4 2-6.4Z"/><path d="M10.2 19.4a2 2 0 0 0 3.6 0"/>',
  utensils: '<path d="M6 3.4v7.2M8.8 3.4v7.2M6 10.6h2.8"/><path d="M7.4 10.6V20.6"/><path d="M16.4 20.6v-6.4M16.4 14.2c2 0 3-1.6 3-4.2 0-3-1.4-6.6-3-6.6s-3 3.6-3 6.6c0 2.6 1 4.2 3 4.2Z"/>',
  folder: '<path d="M3.4 7.2a2 2 0 0 1 2-2h4l2 2.4h7.2a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2V7.2Z"/>',
  eye: '<path d="M2.8 12S6.4 5.8 12 5.8 21.2 12 21.2 12 17.6 18.2 12 18.2 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  pin: '<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 1 0-13 0c0 5 6.5 11 6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  wifi: '<path d="M4 9.4a12 12 0 0 1 16 0M7 12.6a7.6 7.6 0 0 1 10 0M10 15.8a3.4 3.4 0 0 1 4 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
};

const content = paths[props.name] || paths.dot;
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="content"
  />
</template>

<style scoped>
.icon {
  display: block;
  flex: none;
}
</style>
