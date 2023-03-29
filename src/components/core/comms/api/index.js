/**
 * @file Index for all ReSTful API endpoint handlers.
 */
import { handlers as settings } from 'cs/api/handlers/settings';
import { handlers as pen } from 'cs/api/handlers/pen';
import { handlers as motors } from 'cs/api/handlers/motors';
import { handlers as buffer } from 'cs/api/handlers/buffer';
import { handlers as tools } from 'cs/api/handlers/tools';
import { handlers as colors } from 'cs/api/handlers/colors';
import { handlers as imps } from 'cs/api/handlers/implements';
import { handlers as projects } from 'cs/api/handlers/projects';
import { handlers as content } from 'cs/api/handlers/content';
import { handlers as print } from 'cs/api/handlers/print';
import { handlers as serial } from 'cs/api/handlers/serial';

export const handlers = {
  ...settings,
  ...pen,
  ...motors,
  ...buffer,
  ...tools,
  ...colors,
  ...imps,
  ...projects,
  ...content,
  ...print,
  ...serial,
};
