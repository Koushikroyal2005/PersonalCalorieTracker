interface PasswordVisibilityIconProps {
  visible: boolean;
}

export function PasswordVisibilityIcon({ visible }: PasswordVisibilityIconProps) {
  return visible ? (
    <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.7" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 5.2 9 8a8.8 8.8 0 0 1-2 3.8M6.2 6.2C4.2 7.7 3 10.2 3 12c0 2.8 3.5 8 9 8 1.4 0 2.7-.3 3.8-.8" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.7" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12S5.75 5.25 12 5.25 21.75 12 21.75 12 18.25 18.75 12 18.75 2.25 12 2.25 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}
