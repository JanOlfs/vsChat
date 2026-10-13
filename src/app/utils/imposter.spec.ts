import { scoreRound } from './imposter';
import type { ImposterRole } from '../models/types';

const role = (profile_id: string, r: string, vote_for: string | null, voted = true): ImposterRole => ({
  game_id: 'g',
  round: 1,
  profile_id,
  role: r,
  voted,
  vote_for,
});

describe('scoreRound', () => {
  it('gibt dem unerkannten Imposter 5 bei Niederlage und 1 bei Sieg', () => {
    // b tippt richtig, c und der Imposter auf b, d gar nicht: b hat die meisten Stimmen.
    const roles = [role('a', 'imposter', 'b'), role('b', 'crew', 'a'), role('c', 'crew', 'b'), role('d', 'crew', null, false)];
    const loss = scoreRound(roles, 'loss');
    expect(loss.get('a')).toBe(5);
    expect(loss.get('b')).toBe(1);
    expect(loss.get('c')).toBe(0);
    expect(scoreRound(roles, 'win').get('a')).toBe(1);
    expect(scoreRound(roles, 'win').get('b')).toBe(2 + 1);
  });

  it('gibt dem erkannten Imposter 0, egal wie das Spiel ausging', () => {
    const roles = [role('a', 'imposter', 'b'), role('b', 'crew', 'a'), role('c', 'crew', 'a'), role('d', 'crew', 'c')];
    expect(scoreRound(roles, 'loss').get('a')).toBe(0);
    expect(scoreRound(roles, 'win').get('a')).toBe(0);
  });

  it('lässt den Imposter mit seiner eigenen Stimme einen Gleichstand erzwingen', () => {
    const roles = [role('a', 'imposter', 'b'), role('b', 'crew', 'a'), role('c', 'crew', 'a'), role('d', 'crew', 'b')];
    expect(scoreRound(roles, 'loss').get('a')).toBe(5);
  });

  it('wertet die meisten Stimmen als erkannt, auch ohne absolute Mehrheit', () => {
    const roles = [
      role('a', 'imposter', 'b'),
      role('b', 'crew', 'a'),
      role('c', 'crew', 'a'),
      role('d', 'crew', 'e'),
      role('e', 'crew', 'd'),
      role('f', 'crew', 'c'),
    ];
    expect(scoreRound(roles, 'loss').get('a')).toBe(0);
  });

  it('wertet "kein Imposter" in einer Paranoia-Runde als richtig', () => {
    const points = scoreRound([role('a', 'crew', null), role('b', 'crew', 'a')], 'win');
    expect(points.get('a')).toBe(2 + 1);
    expect(points.get('b')).toBe(2);
  });
});
