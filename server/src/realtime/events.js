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

// "I just read your messages up to maxId" — the original sender flips
// every outgoing bubble in this thread from delivered (single tick) to
// read (double tick). The peer's own copy is unaffected.
export function emitDmRead(readerUid, peerUid, maxId) {
  sendToUser(peerUid, { type: 'dm:read', from: String(readerUid), upToId: Number(maxId) });
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

// "you were kicked from this voice channel" — the kicked user's client
// drops their voice connection and the rest of the server sees it as a
// regular voice:leave (also emitted alongside).
export function emitVoiceKicked(toUid, serverId, channelId) {
  sendToUser(toUid, { type: 'voice:kicked', serverId, channelId });
}

// "this user just blocked / unblocked you" — peer client toggles the
// blocked-by-peer state in their copy and locks/unlocks composing.
export function emitBlockedByPeer(toUid, byUid, byHandle, on) {
  sendToUser(toUid, { type: 'block:status', from: String(byUid), handle: byHandle || null, on: !!on });
}

// "this user updated their public profile fields" — friends + server peers
// receive the new avatar / banner / name / handle / bio so any avatar in
// their UI updates without needing a refresh.
export async function emitProfileUpdated(uid, payload) {
  const friendRows = await q(
    `SELECT f.friend_id AS id FROM friendships f WHERE f.user_id = ?`, [uid]);
  const serverRows = await q(
    `SELECT DISTINCT sm2.user_id AS id
       FROM server_members sm
       JOIN server_members sm2 ON sm2.server_id = sm.server_id
      WHERE sm.user_id = ? AND sm2.user_id != ?`, [uid, uid]);
  const ids = new Set();
  friendRows.forEach(r => ids.add(String(r.id)));
  serverRows.forEach(r => ids.add(String(r.id)));
  const data = { type: 'profile:updated', uid: String(uid), ...payload };
  ids.forEach(rid => sendToUser(rid, data));
}
