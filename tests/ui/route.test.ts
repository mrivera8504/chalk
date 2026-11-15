import { beforeEach, describe, expect, it } from 'vitest';
import { getRoute, go, parsePath, toPath, type Route } from '../../src/ui/route';

describe('addresses', () => {
  const all: [Route, string][] = [
    [{ screen: 'book' }, '/'],
    [{ screen: 'team' }, '/team'],
    [{ screen: 'print' }, '/print'],
    [{ screen: 'settings' }, '/settings'],
    [{ screen: 'play', id: 'pm3x9a0' }, '/play/pm3x9a0'],
  ];

  it('give every screen one, and read it back', () => {
    for (const [route, path] of all) {
      expect(toPath(route)).toBe(path);
      expect(parsePath(path)).toEqual(route);
    }
  });

  it('land a stale or mistyped link on the playbook', () => {
    for (const path of ['/nope', '/play', '/play/', '/play/a/b', '/team/extra', '/play/%E0%A4%A']) {
      expect(parsePath(path), path).toEqual({ screen: 'book' });
    }
  });

  it('forgive a trailing slash', () => {
    expect(parsePath('/team/')).toEqual({ screen: 'team' });
    expect(parsePath('')).toEqual({ screen: 'book' });
  });

  it('survive an id with characters an address would mangle', () => {
    const route: Route = { screen: 'play', id: 'a b/c' };
    expect(parsePath(toPath(route))).toEqual(route);
  });
});

describe('going somewhere', () => {
  beforeEach(() => {
    go({ screen: 'book' });
    history.replaceState(null, '', '/');
  });

  it('writes the address on the current entry, and adds none', () => {
    const before = history.length;
    go({ screen: 'team' });
    expect(location.pathname).toBe('/team');
    go({ screen: 'play', id: 'p1' });
    expect(location.pathname).toBe('/play/p1');
    // Back belongs to ui/backstack.ts. A second owner of the history stack is
    // how the app came to close on a back gesture.
    expect(history.length).toBe(before);
    expect(getRoute()).toEqual({ screen: 'play', id: 'p1' });
  });

  it('keeps the query string, so ?trace outlives the first tap', () => {
    history.replaceState(null, '', '/?trace');
    go({ screen: 'settings' });
    expect(location.pathname + location.search).toBe('/settings?trace');
  });
});
