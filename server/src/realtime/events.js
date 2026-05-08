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

export async function emitChannelMessageDeleted(serverId, channelId, messageId) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'channel:message:deleted', serverId, channelId, messageId });
}

export async function emitServerPinChanged(serverId, pinnedText) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'server:pin', serverId, pinned: pinnedText ? { text: pinnedText, by: null, time: null } : null });
}

export async function emitServerCategoryAdded(serverId, category) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'server:category-added', serverId, category });
}

export async function emitServerCategoryDeleted(serverId, categoryId) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'server:category-deleted', serverId, categoryId });
}

export async function emitServerChannelAdded(serverId, channelKind, channel, categoryId) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'server:channel-added', serverId, channelKind, channel, categoryId });
}

export async function emitServerChannelDeleted(serverId, channelKind, channelId) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'server:channel-deleted', serverId, channelKind, channelId });
}

// Generic "the server just changed" — used when many fields change at once
// (identity edit, role/membership changes, ownership transfer, etc.) so the
// frontend can replace its in-memory copy without us inventing a granular
// event for every PATCH.
export async function emitServerUpdated(serverId, serverPayload) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'server:updated', serverId, server: serverPayload });
}

// "The server is gone" — emitted to the member uid list captured BEFORE the
// DELETE statement runs (server_members rows cascade away). Callers must
// pass the snapshot of uids that still need to learn the server vanished.
export function emitServerDeleted(memberUids, serverId) {
  sendToServer(memberUids.map(String), { type: 'server:deleted', serverId });
}

export async function emitChannelMessagePinned(serverId, channelId, pinnedMsgId, pinnedText, pinnedBy) {
  const uids = await serverMemberUids(serverId);
  sendToServer(uids, { type: 'channel:pin', serverId, channelId, pinnedMsgId, pinnedText, pinnedBy });
}

// Notify a single user that they were kicked / banned / promoted, etc.
export function emitToUser(uid, payload) {
  sendToUser(uid, payload);
}

// "the sender deleted one of their messages" — peer should soft-delete the
// bubble (replace with a "Message deleted" placeholder) without reloading.
export function emitDmDeleted(senderUid, peerUid, messageId) {
  sendToUser(peerUid, { type: 'dm:deleted', from: String(senderUid), messageId });
}

// "the user emptied this conversation" — peer drops the entire history for
// that thread on their side too. Mirrors the local clear.
export function emitDmCleared(senderUid, peerUid) {
  sendToUser(peerUid, { type: 'dm:cleared', from: String(senderUid) });
}

// "the other person unfriended you" — peer's friend bubble disappears
// without waiting for a refresh.
export function emitFriendRemoved(toUid, peerUid, peerHandle) {
  sendToUser(toUid, { type: 'friend:removed', peerId: String(peerUid), peerHandle: peerHandle || null });
}
