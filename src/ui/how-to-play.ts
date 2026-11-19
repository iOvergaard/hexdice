import type { RulesConfig } from '../engine/types';
import { listSection, openPanel } from './panel';

export interface HelpSection {
  heading: string;
  lines: string[];
}

const dice = (n: number) => `${n} ${n === 1 ? 'die' : 'dice'}`;

/** The rules in plain words, following the settings the game is played with. */
export function helpSections(rules: RulesConfig): HelpSection[] {
  const sections: HelpSection[] = [{ heading: 'Goal', lines: ['Take every territory on the map. A player left with none is out.'] }];

  const map = [
    'The land is split into territories. You can attack an enemy territory that touches one of yours.',
    'The sea and lakes block the way.',
    `The number on a stack is how many dice it holds, up to ${rules.maxDice}.`,
  ];
  if (rules.riverCount > 0) map[1] = 'The sea and lakes block the way, and a river can only be crossed at its ford, drawn as a bridge.';
  sections.push({ heading: 'The map', lines: map });

  const loss: Record<RulesConfig['lossRule'], string[]> = {
    classic: ['Lose or draw: your territory drops to 1 die.'],
    attrition: ['Lose or draw: your territory drops to as many dice as the defender had, losing at least 1.'],
    drawAttrition: ['Lose: your territory drops to 1 die.', 'Draw: it drops to as many dice as the defender had, losing at least 1.'],
    halfStack: ['Lose or draw: your territory loses half its dice, rounded up.'],
  };
  sections.push({
    heading: 'Attacking',
    lines: [
      'On your turn, tap one of your territories with 2 or more dice, then an enemy territory next to it.',
      'Both sides roll all their dice and the higher total wins: a tie goes to the defender. The badge on the target shows your chance of winning.',
      'Win: you take the territory and move in all your dice but one.',
      ...loss[rules.lossRule],
      'Attack as often as you like, then end your turn.',
    ],
  });

  const where = {
    frontline: `New dice land at random on your territories that border an enemy, up to ${rules.maxDice} per territory.`,
    random: `New dice land at random on any of your territories, up to ${rules.maxDice} per territory.`,
    weighted: `New dice land at random on your territories, up to ${rules.maxDice} per territory, three times as likely on ones that border an enemy.`,
  }[rules.reinforcement];
  const income = ['When you end your turn you get 1 die for each territory in your largest connected group: the number by your name.'];
  if (rules.eliminationBonus > 0) income.push(`You also get +${dice(rules.eliminationBonus)} per turn for every player you knock out, for the rest of the game.`);
  income.push(where, `Dice that don't fit wait in your reserve (up to ${rules.maxReserve}), shown as +N by your name, and come with your next reinforcements.`);
  sections.push({ heading: 'Reinforcements', lines: income });

  if (rules.connectionBonus !== 'off') {
    const join = 'a capture that joins two or more of your separate groups earns';
    const earn = {
      catchup: `While you hold fewer territories than the average of the players still in, ${join} +2 dice for each extra group joined.`,
      flat: `${join[0]!.toUpperCase()}${join.slice(1)} +2 dice for each extra group joined.`,
      smaller: `${join[0]!.toUpperCase()}${join.slice(1)} as many dice as the smaller groups hold between them.`,
    }[rules.connectionBonus];
    sections.push({ heading: 'Linking up', lines: [earn, 'They land on the territory you just took, and any that don\'t fit go to your reserve. Look for the gold "linked!".'] });
  }

  if (rules.lastStandDice > 0) {
    sections.push({
      heading: 'The final',
      lines: [
        `In a game of three or more players, the first time a turn ends with only two left, the one with fewer territories makes a last stand: +${dice(rules.lastStandDice)} on each of their territories.`,
        'Knock out both of your last two rivals in one turn and nobody gets one.',
      ],
    });
  }

  const tips = ['Attack with more dice than the defender: equal stacks win less than half the time.', 'Keep your territories joined up. Your largest group is your income.'];
  if (rules.reinforcement === 'frontline') tips.push('A short front line gets your new dice where the fighting is, and water makes a cheap wall.');
  if (rules.eliminationBonus > 0) tips.push('Knocking out a weak player pays every turn after.');
  sections.push({ heading: 'Tips', lines: tips });
  return sections;
}

/** Opens the rules as a modal panel. */
export function openHowToPlay(rules: RulesConfig): HTMLDialogElement {
  return openPanel('help', 'How to play', helpSections(rules).map((s) => listSection(s.heading, s.lines)));
}
