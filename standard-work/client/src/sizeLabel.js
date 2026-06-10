// Sofa sizes have friendly names: small = 3.5, medium = 4.5/5.5/6.5,
// large = 7.5. Data keeps the numeric keys; the UI shows both.
const NAMES = {
  '3.5': 'Small',
  '4.5–6.5': 'Medium',
  '4.5-6.5': 'Medium',
  '7.5': 'Large',
};

export function sizeLabel(key) {
  const name = NAMES[String(key).trim()];
  return name ? `${name} (${key})` : String(key);
}
