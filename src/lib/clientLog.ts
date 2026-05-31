/**
 * clientLog.ts — singleton LogApi for browser/client use.
 *
 * Reuses createLog() from WS5's log.ts (ring-buffer, no filesystem sink
 * in the browser environment).
 */
import { createLog } from './ai/log';
import type { LogApi } from '../../contracts';

export const clientLog: LogApi = createLog();
