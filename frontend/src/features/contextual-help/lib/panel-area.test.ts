import { getHelpPanelArea } from './panel-area';

function test(name: string, check: () => void) {
  try {
    check();
  } catch (cause) {
    throw new Error(name, { cause });
  }
}
function assert(value: boolean) {
  if (!value) throw new Error('Unexpected help panel bounds');
}

test('help stays outside expanded and collapsed navigation on narrow screens', () => {
  for (const [viewport, navigation, preferred] of [
    [743, 272, 380],
    [390, 76, 560],
    [240, 76, 380],
    [1440, 272, 560],
  ]) {
    const area = getHelpPanelArea(0, viewport, navigation, preferred);
    assert(area.left >= navigation + 12);
    assert(area.left + area.width <= viewport - 16);
    assert(area.width > 0 && area.width <= preferred);
  }
});

test('help respects a shifted visual viewport and works without navigation', () => {
  const shifted = getHelpPanelArea(100, 390, 176, 380);
  assert(shifted.left === 188 && shifted.width === 286);
  const withoutNavigation = getHelpPanelArea(0, 390, undefined, 380);
  assert(withoutNavigation.left === 16 && withoutNavigation.width === 358);
});
