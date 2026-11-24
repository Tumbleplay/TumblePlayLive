import { io } from 'socket.io-client';
export const socket = io({ autoConnect: true, withCredentials: true });
// reconnect after login/logout so the server sees the new session cookie
export const resetSocket = () => { socket.disconnect(); socket.connect(); };
