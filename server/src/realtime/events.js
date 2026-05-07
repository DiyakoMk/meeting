// Thin wrappers around sendToUser / sendToServer so each route file doesn't
// need to import the ws module directly.

import { sendToUser, sendToServer } from './ws.js';
import { q } from '../db.js';

// --- DM events ---

export function emitNewDm(senderUid, peerUid, message) {
  sendToUser(peerUid, { type: 'dm:new', from: String(senderUid), message });
}

// --- Friend events ---

export function emitFriendRequest(toUid, request) {
  sendToUser(toUid, { type: 'friend:request', request });
}

export function emitFriendAccepted(toUid, peer) {
  sendToUser(toUid, { type: 'friend:accepted', peer });
}

// --- Server events ---

// Helper: get all user ids who are members of a server.
async function serverMemberUids(serverId) {
  const rows = await q('SELECT user_id FROM server_members WHERE server_id = ?', [serverId]);
  return rows.map(r => String(r.user_id));
}

export async function emitServerMemberJoined(serverId, userName) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'server:member-joined', serverId, name: userName });
}

export async function emitServerMemberLeft(serverId, userName) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'server:member-left', serverId, name: userName });
}

export async function emitChannelMessage(serverId, channelId, message) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'channel:message', serverId, channelId, message });
}

export async function emitVoiceJoin(serverId, channelId, userName, members) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'voice:join', serverId, channelId, userName, members });
}

export async function emitVoiceLeave(serverId, channelId, userName, members) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'voice:leave', serverId, channelId, userName, members });
}
