// One place to translate between MySQL row shape (snake_case) and the
// frontend's expected JSON shape (camelCase). Keeps every route consistent.

export function publicUser(row) {
  if (!row) return null;
  return {
    id:           String(row.id),
    name:         row.name,
    handle:       row.handle ? '@' + row.handle.replace(/^@/, '') : '',
    email:        row.email || null,
    phone:        row.phone || null,
    bio:          row.bio || '',
    rank:         row.rank_label || 'EXPLORER',
    baseColor:    row.base_color || null,
    avImage:      row.av_image || null,
    bannerImage:  row.banner_image || null,
    friendsOnly:  !!row.friends_only, unlockedPacks: (function(){var v=row.unlocked_packs;if(!v)return[];if(Array.isArray(v))return v;try{var a=JSON.parse(v);return Array.isArray(a)?a:[];}catch(_){return[];}})(),
    createdAt:    row.created_at ? new Date(row.created_at).toISOString() : null,
    lastSeenAt:   row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null
  };
}

export function foreignUser(row) {
  const u = publicUser(row);
  if (!u) return null;
  delete u.email;
  delete u.phone;
  delete u.friendsOnly; delete u.unlockedPacks;
  return u;
}
