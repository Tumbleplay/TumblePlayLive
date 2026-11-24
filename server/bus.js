import { EventEmitter } from 'node:events';
// In-process event bus: game/wallet code emits, the socket layer delivers.
export const bus = new EventEmitter();
bus.setMaxListeners(50);
export const toUser = (userId, event, data) => bus.emit('user', userId, event, data);
export const toAll = (event, data) => bus.emit('all', event, data);
