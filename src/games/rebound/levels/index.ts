import { parseLevel, type Level } from '../logic/level';
import * as level01 from './level01';
import * as level02 from './level02';
import * as level03 from './level03';

/** Every level in play order, each with its recorded solution. */
export const LEVEL_FILES = [level01, level02, level03];

export const LEVELS: readonly Level[] = LEVEL_FILES.map((file) => parseLevel(file.level));
