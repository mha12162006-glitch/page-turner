export default function Logo({ size = 44 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-label="Manhwa Tracker logo"
    >
      <rect width="48" height="48" rx="14" className="fill-plum" />
      <path
        d="M9 19c5-2.5 10-2 15 1.5v17c-5-3-10-3.5-15-1.5z"
        fill="#fff"
      />
      <path
        d="M39 19c-5-2.5-10-2-15 1.5v17c5-3 10-3.5 15-1.5z"
        fill="#fff"
        opacity=".88"
      />
      <path
        d="M13 24c3-1 6-.5 8 1M13 29c3-1 6-.5 8 1M27 25c2-1.500 5-2 8-1M27 30c2-1.500 5-2 8-1"
        stroke="currentColor"
        className="text-plum"
        strokeWidth="1.600"
        strokeLinecap="round"
        fill="none"
        opacity=".45"
      />
      <path
        d={
          "M24 17c-1.500-3-6-2.200-6 1.200 0 2.200 " +
          "2.800 3.800 6 6.300 3.200-2.500 6-4.100 6-6.300 " +
          "0-3.400-4.500-4.200-6-1.200z"
        }
        fill="#FFB3D1"
        stroke="#fff"
        strokeWidth="1.500"
      />
      <circle cx="38" cy="10" r="1.800" fill="#fff" />
      <circle cx="10" cy="11" r="1.200" fill="#fff" opacity=".8" />
    </svg>
  );
}
