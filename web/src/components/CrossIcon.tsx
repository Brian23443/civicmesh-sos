/** Outlined cross for the "Get help" tab (from the team's SVG). Stroke matches lucide's 2px-at-24 weight;
 *  colour follows the text (never red: triage colour, and the red-cross emblem is protected). */
export function CrossIcon({ size = 20 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 256 256" fill="none">
    <path d="M96,160H40a8,8,0,0,1-8-8V104a8,8,0,0,1,8-8H96V40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8V96h56a8,8,0,0,1,8,8v48a8,8,0,0,1-8,8H160v56a8,8,0,0,1-8,8H104a8,8,0,0,1-8-8V160Z"
      stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={20}/>
  </svg>;
}
