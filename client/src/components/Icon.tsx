/** Line icons on a 20px grid, drawn for this app so they share one stroke weight. */
const paths = {
  back: 'M12.5 4.5 7 10l5.5 5.5',
  bulletList: 'M8 5.5h9M8 10h9M8 14.5h9M3.5 5.5h.01M3.5 10h.01M3.5 14.5h.01',
  orderedList:
    'M8 5.5h9M8 10h9M8 14.5h9M3 4.5l1-.5v3M3 9.2c.3-.5 1.7-.6 1.7.3 0 .7-1.7 1.3-1.7 2h1.8M3 13.6h1.6l-.9 1.1c.7 0 1.1.4 1 .9-.1.7-1.2.8-1.7.3',
  quote: 'M4 4.5v11M8 6h8.5M8 10h8.5M8 14h5.5',
  undo: 'M7.5 5 4 8.5 7.5 12M4 8.5h8.5a4 4 0 0 1 0 8H10',
  redo: 'M12.5 5 16 8.5 12.5 12M16 8.5H7.5a4 4 0 0 0 0 8H10',
  history: 'M3.5 10a6.5 6.5 0 1 0 1.9-4.6L3.5 7.3M3.5 3.8v3.5H7M10 6.5V10l2.5 1.5',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  share: 'M10 12.5V3.5M6.5 7 10 3.5 13.5 7M4.5 11v4.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11',
  download: 'M10 3.5v9M6.5 9 10 12.5 13.5 9M4.5 16.5h11',
  print: 'M6 7.5V3.5h8v4M6 13.5H4.5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H14M6 11.5h8v5H6z',
  trash: 'M4 6h12M8 6V4.5h4V6M5.5 6l.7 9.6a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L14.5 6',
  close: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  plus: 'M10 4.5v11M4.5 10h11',
  upload: 'M10 13V4M6.5 7.5 10 4l3.5 3.5M4.5 13v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V13',
  check: 'M4.5 10.5 8 14l7.5-8',
  eye: 'M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5zM10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
