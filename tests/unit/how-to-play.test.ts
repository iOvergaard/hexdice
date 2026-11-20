import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../src/engine/config';
import type { RulesConfig } from '../../src/engine/types';
import { helpSections } from '../../src/ui/how-to-play';

const text = (overrides: Partial<RulesConfig> = {}) =>
  helpSections({ ...DEFAULT_RULES, ...overrides })
    .map((s) => `## ${s.heading}\n${s.lines.join('\n')}`)
    .join('\n');

const section = (heading: string, overrides: Partial<RulesConfig> = {}) =>
  helpSections({ ...DEFAULT_RULES, ...overrides }).find((s) => s.heading === heading)?.lines.join('\n');

describe('how to play', () => {
  it('covers the goal, attacks, reinforcements, linking, the final and tips with the default rules', () => {
    expect(helpSections(DEFAULT_RULES).map((s) => s.heading)).toEqual(['Goal', 'The map', 'Attacking', 'Reinforcements', 'Linking up', 'The final', 'Tips']);
  });

  it('says ties go to the defender and what a failed attack costs', () => {
    const attack = section('Attacking')!;
    expect(attack).toContain('a tie goes to the defender');
    expect(attack).toContain('all your dice but one');
    expect(attack).toContain('The territory you took stays selected while it can attack again');
    expect(attack).toContain('Lose: your territory drops to 1 die');
    expect(attack).toContain('Draw: it drops to as many dice as the defender had');
  });

  it('follows the loss rule', () => {
    expect(section('Attacking', { lossRule: 'classic' })).toContain('Lose or draw: your territory drops to 1 die');
    expect(section('Attacking', { lossRule: 'attrition' })).toContain('Lose or draw: your territory drops to as many dice as the defender had');
    expect(section('Attacking', { lossRule: 'halfStack' })).toContain('Lose or draw: your territory loses half its dice');
  });

  it('explains income from the largest group, front-line placement, the reserve and knockouts', () => {
    const r = section('Reinforcements')!;
    expect(r).toContain('largest connected group');
    expect(r).toContain('The small number under it, by the little die, is how many dice you have on the map.');
    expect(r).toContain('border an enemy');
    expect(r).toContain(`up to ${DEFAULT_RULES.maxDice}`);
    expect(r).toContain(`up to ${DEFAULT_RULES.maxReserve}`);
    expect(r).toContain('+1 die per turn for every player you knock out');
  });

  it('follows the reinforcement rule and knockout bonus', () => {
    expect(section('Reinforcements', { reinforcement: 'random' })).toContain('any of your territories');
    expect(section('Reinforcements', { reinforcement: 'weighted' })).toContain('three times as likely');
    expect(section('Reinforcements')).toContain("Dice that don't fit on your front line go to the territories just behind it, nearest it first");
    expect(section('Reinforcements')).toContain('only once every territory you hold is full');
    expect(section('Reinforcements', { frontlineOverflow: 'reserve' })).toContain("Dice that don't fit wait in your reserve");
    expect(section('Reinforcements', { reinforcement: 'random' })).not.toContain('just behind it');
    expect(section('Reinforcements', { eliminationBonus: 0 })).not.toContain('knock out');
    expect(section('Tips', { reinforcement: 'random' })).not.toContain('front');
  });

  it('describes the connection bonus in play, and leaves it out when off', () => {
    expect(section('Linking up')).toContain('fewer territories than the average');
    expect(section('Linking up')).toContain('+2 dice for each extra group');
    expect(section('Linking up', { connectionBonus: 'flat' })).not.toContain('average');
    expect(section('Linking up', { connectionBonus: 'smaller' })).toContain('smaller groups');
    expect(text({ connectionBonus: 'off' })).not.toContain('Linking up');
  });

  it('explains the last stand and how to deny it, and leaves it out when off', () => {
    const final = section('The final')!;
    expect(final).toContain('three or more players');
    expect(final).toContain('fewer territories makes a last stand: +1 die on each of their territories');
    expect(final).toContain('knocking out one rival hands the smaller of the last two a last stand');
    expect(final).toContain('Knock out both in one turn and nobody gets one');
    expect(section('The final', { lastStandDice: 2 })).toContain('+2 dice on each');
    expect(text({ lastStandDice: 0 })).not.toContain('The final');
  });

  it('only mentions rivers and fords when the map has them', () => {
    expect(section('The map')).toContain('ford');
    expect(section('The map', { riverCount: 0 })).not.toContain('ford');
  });

  it('never uses an em dash', () => {
    for (const lossRule of ['classic', 'attrition', 'drawAttrition', 'halfStack'] as const) expect(text({ lossRule })).not.toContain('—');
  });
});
