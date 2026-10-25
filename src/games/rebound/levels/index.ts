import { parseLevel, type Level } from '../logic/level';
import * as level01 from './level01';
import * as level02 from './level02';
import * as level03 from './level03';
import * as level04 from './level04';
import * as level05 from './level05';
import * as level06 from './level06';
import * as level07 from './level07';
import * as level08 from './level08';
import * as level09 from './level09';
import * as level10 from './level10';

/** Every level in play order, each with its recorded solution. */
export const LEVEL_FILES = [
  level01,
  level02,
  level03,
  level04,
  level05,
  level06,
  level07,
  level08,
  level09,
  level10,
];

export const LEVELS: readonly Level[] = LEVEL_FILES.map((file) => parseLevel(file.level));
