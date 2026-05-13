
(function(){

  'use strict';

  // Build stamp — useful when debugging "fix didn't apply" reports. Bump

  // any time you ship a hot-reloadable change you want to confirm landed.

  // The stamp logs once on boot and shows up in the user's devtools so

  // you can sanity-check via screenshot whether they're on the cached

  // bundle or the fresh one.

  console.log('[orblood] client build 2026-05-13-FIXED (WebRTC glare prevention, bio save fix, bcryptjs, local Lucide icons, web refresh/download buttons)');

  // Mobile-only: wire the FAB + scrim to slide the orbits drawer in / out.

  // Desktop is unaffected because the FAB and scrim are display:none

  // outside the 560px media query.

  (function setupOrbDrawer(){

    const fab    = document.getElementById('orbColFab');

    const scrim  = document.getElementById('orbColScrim');

    const orbCol = document.getElementById('orbCol');

    if (!fab || !scrim || !orbCol) return;

    function openDrawer(){

      orbCol.classList.add('open');

      scrim.classList.add('show');

      fab.classList.add('is-hidden');

    }

    function closeDrawer(){

      orbCol.classList.remove('open');

      scrim.classList.remove('show');

      fab.classList.remove('is-hidden');

    }

    fab.addEventListener('click', e => {

      e.preventDefault();

      if (orbCol.classList.contains('open')) closeDrawer(); else openDrawer();

    });

    scrim.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', e => {

      if (e.key === 'Escape' && orbCol.classList.contains('open')) closeDrawer();

    });

  })();

  // PWA: FORCE UNREGISTER OLD SERVICE WORKERS
  // The old service worker was caching stale builds. We unregister it
  // on every page load to ensure users always get fresh content.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(reg => {
        reg.unregister();
        console.log('[orblood] unregistered old service worker');
      });
    }).catch(() => {});
  }

  // Service worker temporarily disabled to fix caching issues
  // Will re-enable with better cache strategy in future update
  /*
  if ('serviceWorker' in navigator && window.isSecureContext){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch(err => console.warn('[orblood] sw register failed', err && err.message));
    });

    // When a new SW takes over (after an update), reload once so the
    // user sees the fresh build instead of a stale cached shell.
    let _swReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_swReloaded) return;
      _swReloaded = true;
      // Tiny defer so any pending navigation finishes before the reload.
      setTimeout(() => location.reload(), 50);
    });
  }
  */

  // ============== STARS ==============

  const starsHost = document.getElementById('stars');

  if (starsHost){

    let html = '';

    for (let i=0;i<70;i++){

      const s = (Math.random()*1.5+0.4).toFixed(2);

      const l = (Math.random()*100).toFixed(1);

      const t = (Math.random()*100).toFixed(1);

      const d = (Math.random()*4).toFixed(2);

      html += '<div class="star" style="width:'+s+'px;height:'+s+'px;left:'+l+'%;top:'+t+'%;animation-delay:'+d+'s"></div>';

    }

    starsHost.innerHTML = html;

  }

  // ============== UTIL ==============

  function refreshIcons(){

    if (window.lucide && typeof window.lucide.createIcons === 'function'){

      try { window.lucide.createIcons(); } catch(e){}

    }

  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  function fmtBytes(n){ if (n<1024) return n+' B'; if (n<1024*1024) return (n/1024).toFixed(1)+' KB'; return (n/(1024*1024)).toFixed(2)+' MB'; }

  function uid(){ return 'id-'+Math.random().toString(36).slice(2,10); }

  function nowTime(){ const n = new Date(); return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0'); }

  // Format a message timestamp for the bubble's tiny clock. Accepts ISO

  // strings ("2026-05-09T04:42:18.123Z" — what the API now returns) and

  // already-formatted "HH:MM" strings (legacy optimistic bubbles, demo

  // data). For ISO strings we render in the user's local timezone so

  // a server in UTC + a user in Tehran no longer disagree about what

  // "now" means after a reload.

  function fmtMessageTime(raw){

    if (!raw) return '';

    const s = String(raw).trim();

    // Already in HH:MM form — leave as-is.

    if (/^\d{1,2}:\d{2}/.test(s)) return s;

    const d = new Date(s);

    if (isNaN(d.getTime())) return s;

    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');

  }

  // Day key used to bucket bubbles under a divider. We deliberately use a

  // locale-independent ISO-ish key (YYYY-MM-DD) so a server-side render in

  // node never disagrees with a client-side render about whether two

  // messages were "on the same day". The actual visible label is built

  // from this key by `_dayLabel()` so users still see "TODAY" /

  // "YESTERDAY" / "May 8, 2026" without breaking grouping.

  function _isoDay(d){

    const y = d.getFullYear();

    const m = String(d.getMonth()+1).padStart(2,'0');

    const dd = String(d.getDate()).padStart(2,'0');

    return y + '-' + m + '-' + dd;

  }

  function todayDayLabel(){ return _isoDay(new Date()); }

  // Older clients stored `day` as the raw locale string `5/8/2026`. After

  // the format change everything new is `2026-05-08`. To stop both formats

  // from coexisting in the same conversation (and triggering a divider on

  // every bubble because `'TODAY' !== '2026-05-08'` for example), every

  // bubble passes through this normaliser before render. It accepts the

  // ISO key as-is, parses locale strings, and falls back to "today" so a

  // legacy bubble with `day: 'TODAY'` still buckets correctly.

  function _normalizeDayKey(raw){

    if (!raw) return _isoDay(new Date());

    const s = String(raw).trim().toUpperCase();

    if (s === 'TODAY')     return _isoDay(new Date());

    if (s === 'YESTERDAY') { const y = new Date(); y.setDate(y.getDate()-1); return _isoDay(y); }

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;            // already ISO

    const parsed = new Date(s);

    if (!isNaN(parsed.getTime())) return _isoDay(parsed);

    return _isoDay(new Date());

  }

  // Translate the YYYY-MM-DD bucket key into the friendly text the divider

  // shows. Today / yesterday get the relative label so the chat doesn't

  // shout the literal date for messages from a few minutes ago.

  function _dayLabel(key){

    if (!key) return '';

    if (key === _isoDay(new Date())) return 'TODAY';

    const y = new Date();

    y.setDate(y.getDate() - 1);

    if (key === _isoDay(y)) return 'YESTERDAY';

    // Older days: human-readable date in the user's locale.

    const parts = key.split('-');

    if (parts.length === 3){

      const dt = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]));

      return dt.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }).toUpperCase();

    }

    return String(key).toUpperCase();

  }

  // Promise-based in-app replacement for window.confirm.

  let _confirmResolver = null;

  function appConfirm(message, opts){

    opts = opts || {};

    document.getElementById('confirmTitle').textContent = '// '+(opts.title||'CONFIRM');

    document.getElementById('confirmMessage').textContent = message || 'Are you sure?';

    const yes = document.getElementById('confirmYes');

    yes.textContent = (opts.confirmLabel || 'CONFIRM');

    yes.classList.toggle('danger-btn', !!opts.danger);

    document.getElementById('confirmBackdrop').classList.add('show');

    return new Promise(res => { _confirmResolver = res; });

  }

  function _confirmDone(v){

    document.getElementById('confirmBackdrop').classList.remove('show');

    if (_confirmResolver){ const r = _confirmResolver; _confirmResolver = null; r(v); }

  }

  function showToast(text, kind){

    const t = document.getElementById('toast');

    const txt = document.getElementById('toastText');

    const ic = document.getElementById('toastIcon');

    txt.textContent = text;

    t.className = 'toast' + (kind ? ' '+kind : '');

    const iconName = kind==='success'?'check':kind==='warn'?'alert-triangle':kind==='danger'?'alert-circle':'info';

    ic.innerHTML = '<i data-lucide="'+iconName+'" style="width:13px;height:13px"></i>';

    refreshIcons();

    t.classList.add('show');

    clearTimeout(t._tt);

    t._tt = setTimeout(()=>{ t.classList.remove('show'); }, 2400);

  }

  // ============== STATE ==============

  // Voice channels live entirely in `servers[*].voiceChannels`. The only

  // built-in entry kept here is the "EMPTY" placeholder used by the orb column

  // when the user has no servers and no marked orbits yet. Real orbs are

  // appended at runtime by submitCreateChannel() / hydrateFromBackend().

  const channelData = {

    __empty__:{ name:'EMPTY', users:[], color:'rgba(120,120,140,', planetGrad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.18),#3a3a44 55%,#0f0f14)', atmoColor:'rgba(120,120,140,0.18)', orbiterColor:'rgba(120,120,140,0.4)', avBorder:'#6b7280', emoji:'∅', tier:'common', isEmpty:true }

  };

  function vcChannelKey(vc){ return vc ? vc.id : null; }

  const allChannels = [];

  let favorites = [];

  let marked = [];

  let inVoice = false;

  let muted = false;

  let deafened = false;

  let connectedChannel = null;

  let selectedSlideChannel = 'orbit';

  let currentSlideIndex = 0;

  let editMode = false;

  let voiceUsersSidebarOpen = false;

  let speakingUser = null;

  let callStartTime = 0;

  let callTimerInterval = null;

  let mutedUsersByMe = new Set(); // local mute (per user name)

  const userVolumes = {}; // userName -> 0-200 (%) volume; default 100

  // Whether the local user has admin powers in the *currently viewed* server.

  // Recomputed by selectServer() and any place that switches `currentServer`.

  let isAdmin = false;

  // ============== SERVERS ==============

  // Populated at runtime — either by the user creating a server, accepting an

  // invite, or by hydrateFromBackend() once a real backend is connected.

  // Shape of each entry:

  //   { id, name, initial, desc, grad, glow, bannerC1, bannerC2, cover,

  //     members:[], admins:[], textChannels:[{id,name,style,unread}],

  //     voiceChannels:[{id,name,style}],

  //     pinned:{text,by,time}|null,

  //     categories:[{id,name,textChannels:[],voiceChannels:[]}],

  //     roles:[] (built lazily by ensureRoles()) }

  const servers = {};

  let myServers = [];

  let currentServer = null;

  let homeRailOpen = false;

  let worldRailOpen = false;

  let frActiveTab = 'incoming';

  let membersOpen = false;

  // VOICE channel style presets

  const voiceStyles = {

    indigo:  { label:'INDIGO',  grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.45),#6366f1 55%,#1e1b4b)',           c:'rgba(99,102,241,0.5)',  glow:'rgba(99,102,241,0.4)' },

    pink:    { label:'PINK',    grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.45),#ec4899 55%,#831843)',           c:'rgba(236,72,153,0.5)',  glow:'rgba(236,72,153,0.4)' },

    green:   { label:'GREEN',   grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.45),#22c55e 55%,#14532d)',           c:'rgba(34,197,94,0.5)',   glow:'rgba(34,197,94,0.4)' },

    cyan:    { label:'CYAN',    grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.45),#22d3ee 55%,#164e63)',           c:'rgba(34,211,238,0.5)',  glow:'rgba(34,211,238,0.4)' },

    gold:    { label:'GOLD',    grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.7),#fef3c7 25%,#f59e0b 55%,#7c2d12)',c:'rgba(245,158,11,0.5)',  glow:'rgba(245,158,11,0.4)' },

    purple:  { label:'PURPLE',  grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.45),#a855f7 55%,#3b0764)',           c:'rgba(168,85,247,0.5)',  glow:'rgba(168,85,247,0.4)' },

    crimson: { label:'CRIMSON', grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.45),#b91c4a 55%,#3f0917)',           c:'rgba(185,28,74,0.5)',   glow:'rgba(185,28,74,0.4)' },

    fire:    { label:'SOLARIS', skin:'fire',  grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.85),#fed7aa 20%,#f97316 55%,#7c2d12)', c:'rgba(249,115,22,0.55)', glow:'rgba(249,115,22,0.5)' },

    ice:     { label:'GLACIUS', skin:'ice',   grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.95),#e0f2fe 20%,#7dd3fc 55%,#0c4a6e)', c:'rgba(125,211,252,0.55)',glow:'rgba(125,211,252,0.5)' },

    tree:    { label:'VERDANT', skin:'tree',  grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.7),#bbf7d0 25%,#4ade80 55%,#14532d)',  c:'rgba(74,222,128,0.55)', glow:'rgba(74,222,128,0.5)' },

    flame:   { label:'INFERNO', skin:'flame', grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.85),#fed7aa 20%,#f97316 55%,#7c2d12)', c:'rgba(249,115,22,0.6)',  glow:'rgba(249,115,22,0.5)' },

    sun:     { label:'SUNFIRE', skin:'fire',  grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.85),#fef3c7 25%,#f59e0b 55%,#7c2d12)', c:'rgba(245,158,11,0.55)', glow:'rgba(245,158,11,0.5)' },

    aurora:  { label:'AURORA',  skin:'aurora', grad:'radial-gradient(circle at 35% 30%,#ffffff,#fff0f8 45%,#ffe1d6 100%)', c:'rgba(255,160,210,0.55)', glow:'rgba(255,160,210,0.55)' }

  };

  const textStyles = ['glow','fire','ice','nature','gold'];

  // Conversation state. The only built-in entry is 'saved' (a private notes

  // chat owned by the local user). Everything else is loaded from the backend

  // or created when a friend request is accepted / a DM is opened.

  const conversations = {

    saved: { name:'Saved Messages', online:true, unread:0, avColor:'linear-gradient(135deg,#b91c4a,#7f1d1d)', initial:'★', handle:'@saved', bio:'Personal notes, bookmarks and forwarded messages — only you can see this.', stats:{posts:0,friends:0,orbits:0}, location:'PRIVATE', joined:'JUST NOW', lastSeen:'always', rank:'NOTES', orbColor:'#b91c4a', orbGrad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.5),#b91c4a 55%,#7f1d1d)', isSaved:true }

  };

  let currentConversation = null;

  let dmReplyTo = null;

  let dmEditingId = null;

  let dmAttachData = null;

  let worldAttachData = null;

  // DM extras: pinned message id per conversation, selection mode for bulk delete.

  const dmPinnedByConv = {}; // key -> msg id

  let dmSelectMode = false;

  const dmSelectedIds = new Set();

  // DM-list bulk select (entire conversations)

  let dmListSelectMode = false;

  const dmListSelectedKeys = new Set();

  // Set of conversation keys you have blocked. Block hides the chat for both sides.

  const blockedUsers = new Set();

  // Conversations whose peer has blocked *us*. We can't message them and the

  // input is replaced with a banner — but we keep the chat history visible.

  const blockedByUsers = new Set();

  function isBlockedByPeer(key){ return blockedByUsers.has(key); }

  function isBlocked(key){ return blockedUsers.has(key); }

  function blockUser(key){

    if (!key || (conversations[key] && conversations[key].isSaved)) return;

    blockedUsers.add(key);

    // Fire-and-forget on the backend. The local state already reflects the

    // intent; if the backend rejects, the snapshot will reconcile next time.

    if (backend.isConfigured()){ backend.users.block(key).catch(()=>{}); }

    if (currentConversation === key) renderConversation();

  }

  function unblockUser(key){

    blockedUsers.delete(key);

    if (backend.isConfigured()){ backend.users.unblock(key).catch(()=>{}); }

    if (currentConversation === key) renderConversation();

  }

  // Per-key visibility flag for the DM list (saved chats are always visible).

  // Removing a key from the DM list does NOT remove the conversation or unfriend the contact.

  const dmListHidden = new Set();

  // Order of conversations in the DM list (most recent at top).

  let dmListOrder = [];

  function bumpDmList(key){

    if (!key) return;

    dmListOrder = [key, ...dmListOrder.filter(k => k !== key)];

    dmListHidden.delete(key);

  }

  function initDmListOrder(){

    if (dmListOrder.length) return;

    // Build a default order from current conversation keys (saved first).

    const keys = Object.keys(conversations);

    dmListOrder = ['saved', ...keys.filter(k => k !== 'saved')];

  }

  let activeDmTab = 'all';

  let activeWorldFilter = 'all';

  // Marked friends (DM key list) and marked text channels (server__channelId).

  // Empty by default — populated as the user marks friends/channels.

  let markedFriends = [];

  let markedTextChannels = [];

  let markedPanelTab = 'friends';

  // Notifications — populated by the backend / realtime channel.

  let notifications = [];

  // Friend requests (incoming + outgoing).

  let friendRequests = { incoming:[], outgoing:[] };

  // ============== UNIFIED FRIENDS DATABASE ==============

  // Single source of truth for "is this person a friend of mine". Conversations,

  // home online-friends row, settings panes, and DM messaging gates all read

  // from this one set so the lists never drift apart. Empty until the backend

  // hydrates it (or the user accepts a friend request).

  let friendsList = [];

  function isFriend(key){ if (!key) return false; return friendsList.includes(key.toLowerCase()); }

  // Resolve the peer key we send to /api/dms/:peerKey. The frontend uses

  // synthetic '__u_<name>' keys for non-friend profiles we discover from

  // server members or search results, but the backend only accepts a real

  // handle. This walks conversations[k].handle to recover the actual

  // handle ('user2'), or returns the input unchanged when it's already a

  // handle ('saved' / 'user2').

  function resolvePeerKeyForBackend(key){

    if (!key) return key;

    if (key === 'saved') return 'saved';

    const conv = conversations[key];

    if (conv && conv.handle){

      const clean = conv.handle.replace(/^@/, '').trim();

      if (clean && !/\s/.test(clean)) return clean.toLowerCase();

    }

    // Last resort: strip the synthetic prefix if present.

    if (key.startsWith('__u_')) return null;

    return key;

  }

  function addFriend(key){

    if (!key) return;

    const k = key.toLowerCase();

    if (!friendsList.includes(k)) friendsList.push(k);

  }

  function removeFriend(key){

    if (!key) return;

    const k = key.toLowerCase();

    friendsList = friendsList.filter(x => x !== k);

    if (backend.isConfigured()){ backend.friends.remove(k).catch(()=>{}); }

    // Also drop them from marked friends and DM list ordering hints, but keep

    // their conversation around so message history isn't lost.

    if (typeof markedFriends !== 'undefined' && markedFriends.includes(k)){

      markedFriends = markedFriends.filter(x => x !== k);

      if (typeof persistMarkedFriends === 'function') persistMarkedFriends();

    }

  }

  // User-controlled gate: only friends can DM me. Persisted across sessions.

  // Mirrored to the backend's users.friends_only column when an API is wired

  // up — that's where the *server* enforces the rule for incoming DMs.

  const FRIENDS_ONLY_KEY = 'orblood_friends_only_v1';

  function readFriendsOnly(){ try { return localStorage.getItem(FRIENDS_ONLY_KEY) === '1'; } catch(_){ return false; } }

  function writeFriendsOnly(on){

    try { localStorage.setItem(FRIENDS_ONLY_KEY, on?'1':'0'); } catch(_){}

    if (backend.isConfigured()){ backend.me.patch({ friendsOnly: !!on }).catch(()=>{}); }

  }

  // Conversation messages — keyed by conversation id. Saved Messages ships

  // empty so the user can drop their first note. Real DM threads are loaded

  // from the backend / appended as they arrive.

  const messages = {

    saved: []

  };

  // World feed (legacy — currently unused since the world page is empty when

  // the user is in no servers). Kept here so the forward-target logic still

  // has a target to push to without crashing.

  let worldMessages = [];

  // ============== UNREAD COUNTS ==============

  function totalUnread(){ return Object.values(conversations).reduce((s,c)=>s+(c.unread||0),0); }

  function updateBadges(){

    const totU = totalUnread();

    const tbDm = document.getElementById('tbDmBadge');

    if (tbDm){ tbDm.style.display = totU>0?'block':'none'; tbDm.textContent = totU; }

    const reqDot = document.getElementById('tbReqDot');

    if (reqDot){ reqDot.style.display = friendRequests.incoming.length>0?'block':'none'; }

    const notUnread = notifications.filter(n=>n.unread).length;

    const notDot = document.getElementById('tbNotifDot');

    if (notDot){ notDot.style.display = notUnread>0?'block':'none'; }

    const homeNot = document.getElementById('homeNotifDot');

    if (homeNot){ homeNot.style.display = notUnread>0?'block':'none'; }

    const dmHd = document.getElementById('dmHeaderSub');

    if (dmHd){ const n = Object.keys(conversations).length; dmHd.textContent = n+' active conversations'+(totU>0?' · '+totU+' unread':''); }

    const dmTabUnread = document.getElementById('dmTabUnreadCount');

    if (dmTabUnread){ dmTabUnread.textContent = totU; dmTabUnread.style.display = totU>0?'inline-block':'none'; }

    // Live orbits = voice channels with at least one connected user that the

    // user can actually see. Legendary = legendary-tier orbs visible in their

    // marked carousel. Both are recomputed from the same source the rest of

    // the UI uses, so the hero never drifts from the lists below it.

    const visibleOrbs = (typeof getAllChannels === 'function')

      ? getAllChannels().filter(k => k !== '__empty__')

      : [];

    const liveOrbits = visibleOrbs.filter(k => (channelData[k]?.users||[]).length > 0).length;

    const legendaryCount = visibleOrbs.filter(k => channelData[k]?.tier === 'legendary').length;

    const reqCount = friendRequests.incoming.length;

    const heroDM = document.getElementById('heroStatDM'); if (heroDM) heroDM.textContent = totU;

    const heroReq = document.getElementById('heroStatReq'); if (heroReq) heroReq.textContent = reqCount;

    const heroLive = document.getElementById('heroStatLive'); if (heroLive) heroLive.textContent = liveOrbits;

    const heroLeg = document.getElementById('heroStatLegendary'); if (heroLeg) heroLeg.textContent = legendaryCount;

    const heroUnread = document.getElementById('heroUnreadDM'); if (heroUnread) heroUnread.textContent = totU + (totU===1?' unread transmission':' unread transmissions');

    const heroR = document.getElementById('heroReqs'); if (heroR) heroR.textContent = reqCount + (reqCount===1?' friend request':' friend requests');

    const heroLegSub = document.getElementById('heroLegendary'); if (heroLegSub) heroLegSub.textContent = legendaryCount + (legendaryCount===1?' legendary orb':' legendary orbs');

    const frIn = document.getElementById('frInCount'); if (frIn) frIn.textContent = friendRequests.incoming.length;

    const frOut = document.getElementById('frOutCount'); if (frOut) frOut.textContent = friendRequests.outgoing.length;

  }

  // The most recently-joined voice channel sticks at the front of the orb

  // carousel even after disconnect, until the user joins a different orb.

  // Marked orbs and the currently-connected orb still take precedence.

  let lastJoinedChannel = (function(){

    try { return localStorage.getItem('orblood:lastJoined') || null; } catch(_){ return null; }

  })();

  // ============== ORB CAROUSEL ==============

  function getAllChannels(){

    let out = marked.filter(c => channelData[c]).slice();

    // Prepend the last-joined orb if it isn't already in the list (and is

    // visible to the user). The currently-connected orb wins over everything.

    if (lastJoinedChannel && lastJoinedChannel !== connectedChannel

        && channelData[lastJoinedChannel] && !out.includes(lastJoinedChannel)){

      out.unshift(lastJoinedChannel);

    }

    if (inVoice && connectedChannel && !out.includes(connectedChannel) && channelData[connectedChannel]) out.unshift(connectedChannel);

    // Hide channels the user can't see (e.g. role-restricted voice orb).

    out = out.filter(canSeeVoiceKey);

    // Fallback: if the user has at least one server with at least one

    // voice channel they can see, surface those even when nothing is

    // explicitly marked. Otherwise a fresh user with a server but no

    // marks (or a user who reloaded before clicking "mark") gets stuck

    // looking at the empty placeholder + Create/Join buttons.

    if (out.length === 0){

      Object.values(servers).forEach(srv => {

        (srv.voiceChannels || []).forEach(vc => {

          const k = vcChannelKey(vc);

          if (!k || !channelData[k]) return;

          if (!canSeeVoiceKey(k)) return;

          if (!out.includes(k)) out.push(k);

        });

      });

    }

    // Empty state: when the user has no servers and no marked orbits, show

    // a single placeholder "EMPTY" orb that cannot be joined.

    if (out.length === 0) return ['__empty__'];

    return out;

  }

  function isMarked(ch){ return marked.includes(ch); }

  function isFav(ch){ return favorites.includes(ch); }

  function buildLegendaryExtras(){

    return '<div class="legendary-aura"></div>'+

      '<div class="legendary-sweep"></div>'+

      '<div class="legendary-particle lp1"></div>'+

      '<div class="legendary-particle lp2"></div>'+

      '<div class="legendary-particle lp3"></div>'+

      '<div class="legendary-particle lp4"></div>'+

      '<div class="legendary-particle lp5"></div>'+

      '<div class="legendary-particle lp6"></div>';

  }

  // === Initial render of all slides — runs ONCE ===

  function renderOrbSlides(){

    const slides = document.getElementById('orbSlides');

    const dots = document.getElementById('orbDots');

    const list = getAllChannels();

    let sHtml = '', dHtml = '';

    list.forEach((ch, i) => {

      const data = channelData[ch];

      const isLegendary = data.tier === 'legendary';

      let cls = 'orb-slide';

      if (isLegendary) cls += ' legendary';

      if (data.skin) cls += ' skin-'+data.skin;

      if (data.isEmpty) cls += ' empty-state';

      if (i === currentSlideIndex) cls += ' default-channel';

      // Pull customStyle from the matching voice channel (if any) so the

      // orb in the orbits column inherits the pack the channel uses.

      let _orbCustom = null;

      Object.values(servers).forEach(_srv => {

        (_srv.voiceChannels||[]).forEach(_vc => {

          if (vcChannelKey(_vc) === ch && _vc.customStyle) _orbCustom = _vc.customStyle;

        });

      });

      if (_orbCustom) cls += ' '+packClassFor(_orbCustom,'orbit');

      // Build orbiter avatars (will be updated, NOT replaced, on state changes)

      let orbiterHtml = '';

      for (let idx=0;idx<3;idx++){

        const u = data.users[idx] || '';

        let avInner = '';

        let avBgExtra = '';

        if (u){

          const a = resolveUserAvatar(u);

          if (a.isImage){ avBgExtra = ';background:'+a.bg; }

          else { avInner = a.text; }

        }

        // Tag the avatar with the WebRTC peer connection state so the

        // overlay (three dots while connecting, red ring when failed)

        // can attach via CSS — much lighter than re-rendering per state

        // transition.

        let avStateAttr = '';

        if (u && u !== selfProfile.name && inVoice && connectedChannel === ch){

          const pst = (typeof voice !== 'undefined' && voice.peerState) ? voice.peerState(u) : null;

          if (pst && pst !== 'connected') avStateAttr = ' data-peer-state="'+pst+'"';

        }

        const connectingDots = avStateAttr.includes('connecting') || avStateAttr.includes('reconnecting')

          ? '<span class="orb-av-dots" aria-hidden="true"><span></span><span></span><span></span></span>'

          : '';

        orbiterHtml += '<div class="orbiter" data-orb-idx="'+idx+'" style="animation-delay:'+(-idx*5)+'s'+(u?'':';opacity:0')+'"><div class="orb-av"'+avStateAttr+' style="border-color:'+data.avBorder+';box-shadow:0 0 12px '+data.color+'0.4)'+avBgExtra+'">'+avInner+connectingDots+'</div></div>';

      }

      const legExtras = isLegendary ? buildLegendaryExtras() : '';

      sHtml += '<div class="'+cls+'" data-channel="'+ch+'">'+

        '<div class="badge-row" data-badge-row></div>'+

        '<div class="orb-wrap">'+

          legExtras+

          '<div class="atmo" style="background:radial-gradient(circle,'+data.atmoColor+',transparent 70%)"></div>'+

          '<div class="lring" style="border-color:'+data.color+'0.4)"></div>'+

          '<div class="lring" style="border-color:'+data.color+'0.4)"></div>'+

          '<div class="lring" style="border-color:'+data.color+'0.4)"></div>'+

          '<div class="otrack" style="border-color:'+data.color+'0.25)"></div>'+

          '<div class="planet" style="background:'+data.planetGrad+';box-shadow:0 0 40px '+data.color+'0.4),inset 0 0 20px rgba(255,255,255,0.2)"></div>'+

          orbiterHtml+

        '</div>'+

        '<div class="vlabel">'+data.name+'</div>'+

        '<div class="vstatus" data-vstatus></div>'+

      '</div>';

      dHtml += '<div class="orb-dot" data-idx="'+i+'" title="'+data.name+'"></div>';

    });

    slides.innerHTML = sHtml;

    dots.innerHTML = dHtml;

    slides.style.transform = 'translateX(-'+(currentSlideIndex*100)+'%)';

    selectedSlideChannel = list[currentSlideIndex];

    updateOrbStates();

  }

  // === State updates (NEVER rebuild slides — preserves rotation animation) ===

  function updateOrbStates(){

    const list = getAllChannels();

    document.querySelectorAll('.orb-slide').forEach((slide, i) => {

      const ch = slide.dataset.channel; if (!ch) return;

      const data = channelData[ch];

      const isLegendary = data.tier === 'legendary';

      const isConn = inVoice && connectedChannel === ch;

      const isMark = isMarked(ch);

      const isEmpty = data.users.length === 0;

      const isInactive = inVoice && !isConn;

      slide.classList.toggle('connected', isConn);

      slide.classList.toggle('marked', !isConn && isMark);

      slide.classList.toggle('inactive', isInactive);

      slide.classList.toggle('empty', isEmpty);

      slide.classList.toggle('default-channel', i === currentSlideIndex);

      // Update badges

      const badgeRow = slide.querySelector('[data-badge-row]');

      if (badgeRow){

        let bHtml = '';

        if (isConn) bHtml += '<span class="obadge live">LIVE</span>';

        if (isLegendary) bHtml += '<span class="obadge legendary">★ LEGENDARY</span>';

        if (isMark && !isLegendary) bHtml += '<span class="obadge marked">MARK</span>';

        badgeRow.innerHTML = bHtml;

      }

      // Update vstatus text

      const vst = slide.querySelector('[data-vstatus]');

      if (vst){

        vst.classList.toggle('connected', isConn);

        // When connected, show the member count instead of repeating

        // "CONNECTED" — that word lives on the status pill under the

        // call timer (single source of truth).

        vst.textContent = isMark

          ? 'MARKED · '+data.users.length+' ACTIVE'

          : data.users.length+' '+(data.users.length===1?'MEMBER':'MEMBERS');

      }

      // Update orbiter avatars (mutate text/visibility, don't replace nodes)

      const orbiters = slide.querySelectorAll('.orbiter');

      orbiters.forEach((orb, idx) => {

        const u = data.users[idx];

        const av = orb.querySelector('.orb-av');

        if (u){

          orb.style.opacity = '';

          // Sync the peer-state attribute so CSS paints the connecting

          // dots / warning ring without re-rendering the slide.

          if (av){

            let pst = null;

            if (u !== selfProfile.name && isConn && typeof voice !== 'undefined' && voice.peerState){

              const p = voice.peerState(u);

              if (p && p !== 'connected') pst = p;

            }

            if (pst) av.setAttribute('data-peer-state', pst);

            else     av.removeAttribute('data-peer-state');

            const hasDots = av.querySelector('.orb-av-dots');

            const wantsDots = pst === 'connecting' || pst === 'reconnecting';

            if (wantsDots && !hasDots){

              const span = document.createElement('span');

              span.className = 'orb-av-dots';

              span.setAttribute('aria-hidden','true');

              span.innerHTML = '<span></span><span></span><span></span>';

              av.appendChild(span);

            } else if (!wantsDots && hasDots){

              hasDots.remove();

            }

          }

          if (av){

            const aRes = resolveUserAvatar(u);

            // Update only the first text node so the .orb-av-dots

            // overlay sibling stays in place. textContent='' would

            // wipe it.

            let firstText = null;

            for (const n of av.childNodes){

              if (n.nodeType === Node.TEXT_NODE){ firstText = n; break; }

            }

            if (aRes.isImage){

              if (firstText) firstText.nodeValue = '';

              else av.insertBefore(document.createTextNode(''), av.firstChild);

              av.style.background = aRes.bg;

            } else {

              if (firstText){ if (firstText.nodeValue !== aRes.text) firstText.nodeValue = aRes.text; }

              else av.insertBefore(document.createTextNode(aRes.text || ''), av.firstChild);

              av.style.background = '';

            }

            av.classList.toggle('speaking', isConn && speakingUser === u);

          }

        } else {

          orb.style.opacity = '0';

          if (av) av.classList.remove('speaking');

        }

      });

    });

    // Update dots

    document.querySelectorAll('.orb-dot').forEach((d, i) => {

      const ch = list[i];

      const data = channelData[ch];

      d.className = 'orb-dot' + (i===currentSlideIndex?' active': inVoice && connectedChannel === ch ? ' connected' : data.tier==='legendary' ? ' legendary' : isMarked(ch) ? ' marked' : '');

    });

    selectedSlideChannel = list[currentSlideIndex];

    updateOrbHud();

    updateMarkedSidebar();

    // Make sure the empty/connected/disconnected state on the orb column

    // tracks the slide list. Without this the column can stay in is-empty

    // even after hydrate populated marked orbits.

    if (typeof updateConnBanner === 'function') updateConnBanner();

    if (typeof updateBadges === 'function') updateBadges();

  }

  function updateOrbHud(){

    const data = channelData[selectedSlideChannel];

    const usersEl = document.getElementById('orbHudUsers');

    const pingEl = document.getElementById('orbHudPing');

    if (usersEl) usersEl.textContent = data.users.length;

    // Real RTT is owned by voice._startStatsPoller while in a call.

    // When the user is browsing a different orb (not the active call),

    // we don't have a meaningful number, so leave the pill blank.

    if (pingEl && !(inVoice && connectedChannel === selectedSlideChannel)){

      pingEl.textContent = '--';

    }

  }

  function goToSlide(idx, animate){

    const list = getAllChannels();

    if (idx < 0) idx = list.length-1;

    if (idx >= list.length) idx = 0;

    currentSlideIndex = idx;

    selectedSlideChannel = list[idx];

    const slides = document.getElementById('orbSlides');

    if (!animate) slides.style.transition = 'none';

    slides.style.transform = 'translateX(-'+(idx*100)+'%)';

    if (!animate) requestAnimationFrame(()=>{ slides.style.transition = ''; });

    updateOrbStates();

    // If the sidebar is already open, refresh its contents to reflect the

    // new selected orb. We deliberately don't auto-open here — the click

    // handler decides open/close so the toggle behaviour stays predictable.

    if (voiceUsersSidebarOpen) renderVoiceUsers();

  }

  // ============== CONNECT BANNER ==============

  function updateConnBanner(){

    const banner = document.getElementById('orbConnBanner');

    const txt = document.getElementById('orbConnBannerText');

    const orbCol = document.getElementById('orbCol');

    const list = getAllChannels();

    const isEmpty = list.length === 1 && list[0] === '__empty__';

    // During the first hydrate cycle we don't yet know whether the user

    // has orbits or not — keep the column in a loading state so we

    // don't flash "CREATE / JOIN SERVER" first and then yank it back.

    orbCol.classList.toggle('is-loading', _initialHydrating);

    // Only treat as empty AFTER the initial hydrate completes.

    orbCol.classList.toggle('is-empty', isEmpty && !_initialHydrating);

    if (inVoice && channelData[connectedChannel]){

      banner.className = 'orb-conn-banner connected';

      // "CONNECTED" status itself is owned by the pill below the orb

      // timer (so the banner doesn't repeat the same word). The banner

      // just shows which orbit we're in.

      txt.textContent = channelData[connectedChannel].name;

      orbCol.classList.remove('disconnected');

    } else {

      banner.className = 'orb-conn-banner disconnected';

      txt.textContent = isEmpty ? 'NO ORBITS' : 'NOT CONNECTED';

      orbCol.classList.add('disconnected');

    }

  }

  // ============== VOICE USERS SIDEBAR — shows ALL voice channels of current server, connected on top (cross-server) ==============

  function setVoiceUsers(open){

    voiceUsersSidebarOpen = !!open;

    const side = document.getElementById('voiceUsersSidebar');

    if (!side) return;

    if (open){ side.classList.add('open'); renderVoiceUsers(); }

    else side.classList.remove('open');

  }

  // Read the actual DOM state so the toggle never desyncs from reality —

  // we used to track the open/closed flag in a JS variable only, which would

  // get stuck in the wrong position if any other code path moved the sidebar

  // (e.g. a remote voice:join, channel switch, or sliding carousel) without

  // going through setVoiceUsers().

  function toggleVoiceUsers(){

    const side = document.getElementById('voiceUsersSidebar');

    const isOpenInDom = !!(side && side.classList.contains('open'));

    setVoiceUsers(!isOpenInDom);

  }

  function getOrderedVoiceChannels(){

    // Row 1: connected voice channel.

    // Row 2: orb chosen in the carousel (if different).

    // Row 3+: every other voice orb of the connected channel's server that the user can see.

    const order = [];

    const seen = new Set();

    if (inVoice && connectedChannel){ order.push(connectedChannel); seen.add(connectedChannel); }

    if (selectedSlideChannel && channelData[selectedSlideChannel] && !seen.has(selectedSlideChannel) && canSeeVoiceKey(selectedSlideChannel)){

      order.push(selectedSlideChannel); seen.add(selectedSlideChannel);

    }

    if (inVoice && connectedChannel){

      const owner = findVoiceChannelByKey(connectedChannel);

      if (owner){

        const srv = owner.server;

        (srv.voiceChannels||[]).forEach(v => {

          const k = vcChannelKey(v);

          if (seen.has(k) || !channelData[k]) return;

          // Cascade through the parent category — a voice orb inside a

          // hidden category should not surface here.

          if (!memberCanSeeChannelCascaded(srv,selfProfile.name, v)) return;

          order.push(k); seen.add(k);

        });

      }

    }

    return order;

  }

  function renderVoiceUsers(){

    const inner = document.getElementById('voiceUsersInner');

    let html = '';

    const order = getOrderedVoiceChannels();

    order.forEach((ch, idx) => {

      const data = channelData[ch]; if (!data) return;

      const isConn = inVoice && connectedChannel === ch;

      let groupCls = 'vu-group';

      if (isConn) groupCls += ' connected';

      else if (isMarked(ch)) groupCls += ' marked';

      html += '<div class="'+groupCls+'"><div class="vu-group-label" title="'+data.name+'">'+data.name+'</div>';

      if (isConn){

        // include 'You' (the local user) explicitly first

        const meAv = resolveUserAvatar(selfProfile.name);

        html += '<div class="vu-item speaking" data-vu-user="'+escapeHtml(selfProfile.name)+'" data-vu-ch="'+ch+'" data-name="You · '+data.name+'"><div class="vu-av" style="background:'+meAv.bg+';border-color:'+data.avBorder+'"><span>'+(meAv.isImage?'':escapeHtml(meAv.text))+'</span><span class="vu-s '+(muted?'off':'on')+'"></span></div></div>';

        data.users.forEach(u => {

          if (u === selfProfile.name) return;

          const speaking = speakingUser === u;

          const mutedByMe = mutedUsersByMe.has(u);

          const a = resolveUserAvatar(u);

          // Mirror the carousel's connecting indicator: while this

          // peer's WebRTC connection is still negotiating, dim the

          // avatar and overlay three pulsing dots.

          const pst = (typeof voice !== 'undefined' && voice.peerState) ? voice.peerState(u) : null;

          const stateAttr = (pst && pst !== 'connected') ? ' data-peer-state="'+pst+'"' : '';

          const dots = (pst === 'connecting' || pst === 'reconnecting')

            ? '<span class="orb-av-dots" aria-hidden="true"><span></span><span></span><span></span></span>'

            : '';

          html += '<div class="vu-item'+(speaking?' speaking':'')+(mutedByMe?' muted-by-me':'')+'" data-vu-user="'+escapeHtml(u)+'" data-vu-ch="'+ch+'" data-name="'+escapeHtml(u)+(mutedByMe?' · MUTED BY YOU':'')+'"><div class="vu-av"'+stateAttr+' style="background:'+a.bg+';border-color:'+data.avBorder+'"><span>'+(a.isImage?'':escapeHtml(a.text))+'</span>'+dots+'<span class="vu-s on"></span></div></div>';

        });

      } else {

        if (data.users.length === 0){

          html += '<div class="vu-empty">empty</div>';

        } else {

          data.users.slice(0,4).forEach(u => {

            const a = resolveUserAvatar(u);

            html += '<div class="vu-item dim" data-vu-user="'+escapeHtml(u)+'" data-vu-ch="'+ch+'" data-name="'+escapeHtml(u)+' · '+data.name+'"><div class="vu-av" style="background:'+a.bg+';border-color:'+data.avBorder+'"><span>'+(a.isImage?'':escapeHtml(a.text))+'</span><span class="vu-s idle"></span></div></div>';

          });

        }

      }

      html += '</div>';

    });

    inner.innerHTML = html || '<div class="vu-empty">No voice activity</div>';

  }

  function updateMarkedSidebar(){

    const wrap = document.getElementById('markedChannels');

    const list = document.getElementById('mcList');

    const count = document.getElementById('mcCount');

    if (marked.length === 0){ wrap.style.display = 'none'; return; }

    wrap.style.display = 'flex';

    count.textContent = String(marked.length).padStart(2,'0');

    list.innerHTML = marked.map(ch => {

      const data = channelData[ch];

      const isConn = inVoice && connectedChannel === ch;

      return '<div class="mc-item'+(isConn?' active':'')+'" data-channel="'+ch+'" title="'+data.name+'">'+

        '<div class="mc-dot"></div>'+

        '<div class="mc-name">'+data.name+'</div>'+

        '<div class="mc-count-badge">'+data.users.length+'</div>'+

      '</div>';

    }).join('');

  }

  // Debounced persistence helpers. Each saver fires at most once per ~250ms,

  // collapsing rapid drag-reorder or rapid toggle clicks into a single PUT.

  function _debounce(fn, ms){

    let t = null;

    return function(){

      if (t) clearTimeout(t);

      t = setTimeout(() => { t = null; fn(); }, ms);

    };

  }

  const persistMarkedOrbits = _debounce(() => {

    if (backend.isConfigured()) backend.me.saveOrbits(marked.slice()).catch(()=>{});

  }, 250);

  const persistMarkedTextChannels = _debounce(() => {

    if (backend.isConfigured()) backend.me.saveTextChannels(markedTextChannels.slice()).catch(()=>{});

  }, 250);

  const persistMarkedFriends = _debounce(() => {

    if (backend.isConfigured()) backend.me.saveFriendMarks(markedFriends.slice()).catch(()=>{});

  }, 250);

  const persistPinnedServers = _debounce(() => {

    if (backend.isConfigured()) backend.me.savePinnedServers(myServers.slice()).catch(()=>{});

  }, 250);

  function toggleMark(ch){

    const data = channelData[ch];

    if (marked.includes(ch)){

      appConfirm('Unmark '+data.name+'? It will be removed from your ORBITS column and from home.', {title:'UNMARK ORB', confirmLabel:'UNMARK', danger:true}).then(ok => {

        if (!ok) return;

        marked = marked.filter(c => c!==ch);

        // If the carousel was sitting on this slide, snap to the first remaining slide.

        const list = getAllChannels();

        if (currentSlideIndex >= list.length) currentSlideIndex = Math.max(0, list.length-1);

        renderOrbSlides();

        renderHomeMarkedOrbits();

        persistMarkedOrbits();

        showToast('Unmarked '+data.name,'warn');

      });

      return;

    }

    marked.push(ch);

    showToast('Marked '+data.name,'success');

    renderOrbSlides();

    renderHomeMarkedOrbits();

    persistMarkedOrbits();

  }

  // ============== VOICE CONNECT/DISCONNECT (NO orb rebuild) ==============

  // Tiny synth for soft join/leave cues. Lazy AudioContext, no asset download.

  let _audioCtx = null;

  function _ac(){ if (!_audioCtx) try { _audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch(_){ _audioCtx = null; } return _audioCtx; }

  function playVoiceCue(kind){

    const ctx = _ac(); if (!ctx) return;

    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    const tones = kind === 'leave' ? [660, 440] : [440, 660];

    tones.forEach((freq, i) => {

      const osc = ctx.createOscillator();

      const gain = ctx.createGain();

      osc.type = 'sine';

      osc.frequency.value = freq;

      const t = now + i * 0.11;

      gain.gain.setValueAtTime(0, t);

      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);

      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

      osc.connect(gain).connect(ctx.destination);

      osc.start(t);

      osc.stop(t + 0.2);

    });

  }

  function joinVoiceChannel(ch){

    if (ch === '__empty__'){ showToast('No orbits yet — create or join a server first','warn'); return; }

    const wasConnectedTo = inVoice ? connectedChannel : null;

    if (wasConnectedTo === ch){ showToast('Already connected to '+channelData[ch].name); return; }

    inVoice = true;

    connectedChannel = ch;

    lastJoinedChannel = ch;

    try { localStorage.setItem('orblood:lastJoined', ch); } catch(_){}

    // The joined channel must show up in the ORBITS carousel.

    // getAllChannels() always includes the connected channel, so we just rebuild

    // the slides (so the new orb appears) and then snap currentSlideIndex to it.

    const newList = getAllChannels();

    const idx = newList.indexOf(ch);

    if (idx >= 0){

      currentSlideIndex = idx;

      renderOrbSlides();

      // Snap the carousel transform exactly onto this slide so the next click

      // is recognised as the active one (and therefore closes the sidebar).

      const slidesEl = document.getElementById('orbSlides');

      slidesEl.style.transition = 'none';

      slidesEl.style.transform = 'translateX(-'+(idx*100)+'%)';

      requestAnimationFrame(() => { slidesEl.style.transition = ''; });

      selectedSlideChannel = ch;

    }

    if (!channelData[ch].users.includes(selfProfile.name)) channelData[ch].users = [selfProfile.name, ...channelData[ch].users];

    if (wasConnectedTo){

      channelData[wasConnectedTo].users = channelData[wasConnectedTo].users.filter(u=>u!==selfProfile.name);

      showToast('Switched to '+channelData[ch].name,'success');

    } else {

      callStartTime = Date.now();

      if (callTimerInterval) clearInterval(callTimerInterval);

      callTimerInterval = setInterval(updateCallTimer, 500);

      // "Connected" is misleading here — the WebRTC handshake hasn't

      // completed yet, only the local UI state. The status pill below

      // the orb timer paints the real ICE-driven state.

      showToast('Joining '+channelData[ch].name+'…','success');

    }

    document.getElementById('btnConnect').style.display = 'none';

    document.getElementById('btnMic').style.display = 'flex';

    document.getElementById('btnDeafen').style.display = 'flex';

    document.getElementById('btnEnd').style.display = 'flex';

    setVoiceUsers(true);

    updateConnBanner();

    updateOrbStates();

    startSpeakingSimulation();

    renderHomeMarkedOrbits();

    if (currentServer) renderServerOverview();

    playVoiceCue('join');

    // Tell the backend (so other members get a voice:join push, and persistence

    // tracks who's connected). On success we also kick off WebRTC.

    //

    // The voice channel is owned by a *specific* server, which is NOT

    // necessarily currentServer. When the user joins from the marked

    // orbits list, the orbit carousel, or a quick-access entry,

    // currentServer can be null (home page) or another server entirely.

    // Resolve the channel's real owner from `servers`, otherwise the

    // backend.voiceJoin call is silently skipped and WebRTC signalling

    // never starts — the exact "no connect from orbits column" bug.

    let sid = null;

    for (const _sid in servers){

      if ((servers[_sid].voiceChannels||[]).some(v => v.id === ch)){

        sid = _sid; break;

      }

    }

    if (backend.isConfigured() && sid){

      // If we were already in another voice channel, tell the backend we

      // left it before joining the new one — otherwise the server keeps

      // us listed in both channels and our avatar lingers on the old orb.

      if (wasConnectedTo && wasConnectedTo !== ch){

        let oldSid = sid;

        for (const _sid in servers){

          if ((servers[_sid].voiceChannels||[]).some(v => v.id === wasConnectedTo)){

            oldSid = _sid; break;

          }

        }

        try { voice.stop(); } catch(_){}

        backend.servers.voiceLeave(oldSid, wasConnectedTo).catch(()=>{});

      }

      backend.servers.voiceJoin(sid, ch).then(r => {

        if (r && !r.error && !r.offline){

          // Reflect the authoritative member list in case it differs.

          if (Array.isArray(r.members)) channelData[ch].users = r.members.slice();

          updateOrbStates();

          if (typeof renderVoiceUsers === 'function' && voiceUsersSidebarOpen) renderVoiceUsers();

          // Forward the authoritative member list to voice so it can

          // initiate connections to peers who were already in the room

          // before we joined. Without this we relied on the next

          // voice:join broadcast which never fires for the joiner.

          if (Array.isArray(r.members) && typeof voice !== 'undefined' && voice.onPeerJoined){

            voice.onPeerJoined(sid, ch, r.members);

          }

        }

      }).catch(()=>{});

      voice.start(sid, ch).catch(()=>{});

      // Ping is a voice-call-only metric (call quality indicator), so

      // we only run it while the user is actually in an orbit.

      _startWsPingLoop();

    } else if (!sid && backend.isConfigured()){

      console.warn('[voice] joinVoiceChannel: could not resolve server for channel', ch);

      showToast('Could not find the server that owns this voice channel','warn');

    }

  }

  function endVoiceCall(){

    if (!inVoice) return;

    playVoiceCue('leave');

    const ch = connectedChannel;

    if (channelData[ch]) channelData[ch].users = channelData[ch].users.filter(u=>u!==selfProfile.name);

    // Like join, resolve the owning server from the channel id — not

    // currentServer — so leaving from the home page (where currentServer

    // is null) still tells the backend we're gone.

    let leaveSid = null;

    for (const _sid in servers){

      if ((servers[_sid].voiceChannels||[]).some(v => v.id === ch)){

        leaveSid = _sid; break;

      }

    }

    if (backend.isConfigured() && leaveSid){

      backend.servers.voiceLeave(leaveSid, ch).catch(()=>{});

    }

    try { voice.stop(); } catch(_){}

    inVoice = false;

    // Stop pinging — HUD shows ping only while connected to a voice channel.

    _stopWsPingLoop();

    const _pingEl = document.getElementById('orbHudPing');

    if (_pingEl){

      _pingEl.textContent = '--';

      const _pingSpan = _pingEl.closest('span');

      if (_pingSpan) _pingSpan.classList.remove('ping-good','ping-okay','ping-bad');

    }

    const lastChannel = ch;

    connectedChannel = null;

    if (callTimerInterval){ clearInterval(callTimerInterval); callTimerInterval = null; }

    renderHomeMarkedOrbits();

    document.getElementById('orbTimer').textContent = '--:--';

    document.getElementById('orbTimer').classList.remove('active');

    document.getElementById('btnConnect').style.display = 'flex';

    document.getElementById('btnMic').style.display = 'none';

    document.getElementById('btnDeafen').style.display = 'none';

    document.getElementById('btnEnd').style.display = 'none';

    document.getElementById('btnMic').classList.remove('muted-state');

    document.getElementById('btnDeafen').classList.remove('muted-state');

    deafened = false;

    muted = false;

    speakingUser = null;

    mutedUsersByMe.clear();

    updateConnBanner();

    updateOrbStates();

    if (voiceUsersSidebarOpen) renderVoiceUsers();

    if (currentServer) renderServerOverview();

    showToast('Disconnected from '+(channelData[lastChannel] ? channelData[lastChannel].name : 'voice channel'),'warn');

    stopSpeakingSimulation();

  }

  function updateCallTimer(){

    if (!inVoice) return;

    const elapsed = Math.floor((Date.now()-callStartTime)/1000);

    const m = String(Math.floor(elapsed/60)).padStart(2,'0');

    const s = String(elapsed%60).padStart(2,'0');

    const t = document.getElementById('orbTimer');

    t.textContent = m+':'+s;

    t.classList.add('active');

  }

  let speakingInterval = null;

  function startSpeakingSimulation(){

    stopSpeakingSimulation();

    speakingInterval = setInterval(()=>{

      if (!inVoice || !connectedChannel) return;

      const users = channelData[connectedChannel].users.filter(u=>u!==selfProfile.name && !mutedUsersByMe.has(u));

      if (users.length===0){ speakingUser = null; return; }

      speakingUser = users[Math.floor(Math.random()*users.length)];

      // Update only the orbiter avatars' speaking class — no re-render

      document.querySelectorAll('.orb-slide.connected .orb-av').forEach((av,i)=>{

        const u = channelData[connectedChannel].users[i];

        av.classList.toggle('speaking', u === speakingUser);

      });

      if (voiceUsersSidebarOpen) renderVoiceUsers();

    }, 1500);

  }

  function stopSpeakingSimulation(){ if (speakingInterval){ clearInterval(speakingInterval); speakingInterval = null; } speakingUser = null; }

  // ============== EDIT MODE ==============

  function setEditMode(on){

    editMode = on;

    document.getElementById('orbCol').classList.toggle('edit-mode', on);

    document.getElementById('orbEditBtn').classList.toggle('active', on);

    document.getElementById('orbEditLabel').textContent = on ? 'DONE' : 'MARK';

    if (on) showToast('Tap an orb to mark/unmark','warn');

  }

  // ============== DM LIST (only ALL + UNREAD tabs) ==============

  function renderDmList(){

    const itemsEl = document.getElementById('dmItems');

    if (_initialHydrating){

      // Five shimmer rows so the user sees something hierarchical the

      // moment the messages page opens, not an empty white box.

      let sk = '';

      for (let i=0; i<5; i++){

        sk += '<div class="sk-dm-item"><span class="sk sk-av"></span>'

           +  '<span class="sk-text"><span class="sk sk-line sk-l-w60"></span>'

           +  '<span class="sk sk-line sk-l-w70"></span></span></div>';

      }

      itemsEl.innerHTML = sk;

      return;

    }

    initDmListOrder();

    const filter = (document.getElementById('dmListFilter').value||'').toLowerCase();

    const tab = activeDmTab;

    let html = '';

    // Saved Messages is always pinned at the very top, regardless of recency or order.

    const seen = new Set();

    const ordered = [];

    if (conversations.saved){ ordered.push('saved'); seen.add('saved'); }

    dmListOrder.forEach(k => { if (k !== 'saved' && conversations[k] && !seen.has(k)){ ordered.push(k); seen.add(k); } });

    Object.keys(conversations).forEach(k => { if (!seen.has(k)){ ordered.push(k); seen.add(k); } });

    ordered.forEach(key => {

      const conv = conversations[key];

      if (!conv) return;

      // Hide synthetic temp profiles (__u_*) — they're scratch entries

      // generated for "open profile of someone we have no DM with" and

      // would otherwise show up as a duplicate row alongside the real

      // conversation once the peer messages back.

      if (typeof key === 'string' && key.startsWith('__')) return;

      if (conv.isTemp) return;

      if (!conv.isSaved && dmListHidden.has(key)) return;

      // Blocked users are still listed in the chat sidebar — the chat panel

      // itself shows a "you blocked X" banner. Only the Blocked tab is filtered.

      if (tab === 'blocked' && !isBlocked(key)) return;

      if (tab !== 'blocked' && tab !== 'all' && tab !== 'unread' && tab !== 'requests'){ /* future tabs */ }

      if (filter && !conv.name.toLowerCase().includes(filter)) return;

      if (tab==='unread' && !conv.unread) return;

      const isActive = currentConversation === key;

      const lastMsg = (messages[key] && messages[key].length) ? messages[key][messages[key].length-1] : null;

      let preview = lastMsg ? (lastMsg.deleted?'Message deleted':lastMsg.type==='image' ? '🖼 Photo' : (lastMsg.text||'')) : '';

      if (lastMsg && lastMsg.sender==='me' && !lastMsg.deleted) preview = 'You: '+preview;

      const time = lastMsg ? lastMsg.time : '';

      const isTyping = conv.typing;

      const isMk = isFriendMarked(key);

      const isSel = dmListSelectedKeys.has(key);

      html += '<div class="dm-item'+(isActive?' active':'')+(conv.unread?' unread':'')+(isSel?' is-selected':'')+'" data-conv="'+key+'">'+

        (conv.isSaved ? '' : '<div class="dm-list-check" data-dm-list-check="'+key+'" title="Select"><i data-lucide="check" style="width:11px;height:11px"></i></div>')+

        (() => { const r = resolveUserAvatar(conv.isSaved?conv.name:key); return '<div class="dm-av-wrap"><div class="dm-av '+(conv.online?'online':'')+'" style="background:'+r.bg+'">'+(r.isImage?'':escapeHtml(r.text))+'</div></div>'; })()+

        '<div class="dm-mid">'+

          '<div class="dm-row1"><div class="dm-name">'+escapeHtml(conv.name)+'</div><div class="dm-time">'+time+'</div></div>'+

          '<div class="dm-row2">'+

            (isTyping ? '<div class="dm-typing">typing<span class="dm-typing-dots"><span></span><span></span><span></span></span></div>' : '<div class="dm-preview">'+escapeHtml(preview)+'</div>')+

            (conv.unread?'<div class="dm-unread-pill">'+conv.unread+'</div>':'')+

          '</div>'+

        '</div>'+

        '<button class="dm-star'+(isMk?' marked':'')+'" data-dm-star="'+key+'" title="'+(isMk?'Unmark':'Mark friend')+'"><i data-lucide="'+(isMk?'bookmark-check':'bookmark')+'" style="width:13px;height:13px"></i></button>'+

      '</div>';

    });

    itemsEl.innerHTML = html || '<div style="padding:30px 14px;text-align:center;color:var(--t3);font-size:0.78rem">No transmissions match.</div>';

  }

  function openConversation(key){

    if (!conversations[key]) return;

    currentConversation = key;

    conversations[key].unread = 0;

    // Tell the backend we've now read every existing message in this thread

    // so the unread count survives a refresh.

    if (backend.isConfigured() && key && key !== 'saved'){

      const peerKey = conversations[key].isSaved ? 'saved' : key;

      backend.dms.markRead(peerKey).catch(()=>{});

    }

    // Quick Access mirrors per-conversation unread; rerender so the red highlight clears

    // immediately when the user opens the chat (no tab swap required).

    if (typeof renderMarkedPanel === 'function') renderMarkedPanel();

    if (typeof updateBadges === 'function') updateBadges();

    const conv = conversations[key];

    document.getElementById('dmEmpty').style.display = 'none';

    document.getElementById('dmHead').style.display = 'flex';

    document.getElementById('dmMsgs').style.display = 'flex';

    document.getElementById('dmInputWrap').style.display = 'block';

    const headAvRes = resolveUserAvatar(conv.name);

    document.getElementById('dmHeadAvText').textContent = headAvRes.isImage ? '' : headAvRes.text;

    document.getElementById('dmHeadAv').style.background = headAvRes.bg;

    const showPresence = !conv.isSaved;

    document.getElementById('dmHeadAv').style.boxShadow = showPresence ? '0 0 18px '+(conv.online?'rgba(34,197,94,0.4)':'rgba(185,28,74,0.3)') : 'none';

    const pulseEl = document.getElementById('dmHeadPulse');

    pulseEl.style.display = showPresence ? '' : 'none';

    pulseEl.style.borderColor = conv.online ? 'var(--success)' : 'var(--t3)';

    pulseEl.style.opacity = conv.online ? '1' : '0';

    const nameHtml = conv.isSaved

      ? escapeHtml(conv.name)

      : escapeHtml(conv.name)+'<span class="verified"><i data-lucide="badge-check" style="width:14px;height:14px"></i></span>';

    document.getElementById('dmHeadName').innerHTML = nameHtml;

    const sub = document.getElementById('dmHeadSub');

    sub.classList.toggle('offline', !conv.online);

    sub.classList.toggle('is-saved', !!conv.isSaved);

    document.getElementById('dmHeadSubText').textContent = conv.isSaved

      ? 'PERSONAL NOTES · ONLY YOU'

      : (conv.online ? 'ONLINE · ENCRYPTED CHANNEL' : 'OFFLINE · LAST SEEN '+conv.lastSeen.toUpperCase());

    // The "TRANSMITTING TO ..." eyebrow used to live above the compose

    // box. It was redundant with the conversation header and made the

    // bottom feel heavy, so the element was removed and the wrap was

    // flattened to just the compose pill.

    cancelReply(); cancelEdit(); clearDmAttach();

    // First time we open a conversation in this session we don't have its

    // full history yet — only whatever stale subset survived in messages[].

    // Painting that subset and then re-painting the merged history a

    // moment later was the "two messages, then ten messages" flash. If

    // history hasn't been fetched, draw a tiny loading placeholder and

    // hold off on the real render until backend.dms.list resolves.

    const _msgsEl = document.getElementById('dmMsgs');

    // Empty-state placeholder while we wait for /api/dms/<peer> on a

    // fresh open. We always paint this immediately so the user never

    // sees a spinner over a brand new conversation that turns out to be

    // empty. If history actually exists, the merge handler below

    // re-renders with the real bubbles a moment later. We keep showing

    // the empty placeholder if the server returns zero messages.

    if (!conv._historyFetched && backend.isConfigured() && key && key !== 'saved'){

      // Paint a short skeleton stack instead of jumping straight to the

      // empty-thread message. If history exists the merge below replaces

      // it within ~one frame; if the thread really is empty, the same

      // merge swaps the skeleton for the real empty-state copy.

      _msgsEl.innerHTML =

        '<div class="sk-dm-bubble them"><span class="sk sk-line sk-l-w60"></span><span class="sk sk-line sk-l-w40"></span></div>'

        + '<div class="sk-dm-bubble me"><span class="sk sk-line sk-l-w50"></span></div>'

        + '<div class="sk-dm-bubble them"><span class="sk sk-line sk-l-w70"></span><span class="sk sk-line sk-l-w30"></span></div>'

        + '<div class="sk-dm-bubble me"><span class="sk sk-line sk-l-w60"></span><span class="sk sk-line sk-l-w40"></span></div>';

      invalidateDmCache(key);

    } else {

      renderConversation();

    }

    renderDmList();

    updateBadges();

    refreshIcons();

    setTimeout(()=>{ const inp = document.getElementById('dmInput'); if (inp) inp.focus(); }, 100);

    // Lazy-load DM history from the backend so messages survive reloads.

    // Saved Messages also persists, but the snapshot ships its array empty.

    //

    // IMPORTANT: we *merge* the server response into the existing array

    // instead of overwriting it. Overwriting was discarding optimistic /

    // pending messages and any WS pushes that arrived between request and

    // response, which made bubbles "randomly disappear".

    if (backend.isConfigured() && key && conversations[key]){

      const peerKey = conversations[key].isSaved ? 'saved' : key;

      backend.dms.list(peerKey).then(r => {

        if (!r || !Array.isArray(r.messages)) return;

        const local = messages[key] || [];

        const byId = new Map();

        // Server-issued messages are authoritative for fields they own (text,

        // edited, deleted, status). Locally-issued optimistic ids (tmp_*)

        // stay in place until the matching real id replaces them via sendDM.

        r.messages.forEach(srv => {

          const copy = { ...srv };

          _expandChannelMessage(copy);

          byId.set(String(srv.id), copy);

        });

        local.forEach(loc => {

          const idStr = String(loc.id);

          if (typeof loc.id === 'string' && loc.id.startsWith('tmp_')){

            byId.set(idStr, loc); // keep optimistic until reconciled

          } else if (!byId.has(idStr)){

            // Server hasn't returned this row yet (e.g. a freshly received

            // WS message); preserve it.

            byId.set(idStr, loc);

          }

        });

        // Preserve relative ordering: server order first, then any locals

        // that weren't on the server (tmp_* + late arrivals).

        const merged = r.messages.map(srv => byId.get(String(srv.id)));

        local.forEach(loc => {

          const idStr = String(loc.id);

          if (!merged.some(m => String(m.id) === idStr)) merged.push(loc);

        });

        messages[key] = merged;

        // History is now authoritative for this conversation. Mark the

        // flag so future opens skip the loading placeholder + render the

        // existing array straight away.

        if (conversations[key]) conversations[key]._historyFetched = true;

        if (currentConversation === key){

          // Throw away whatever placeholder / partial render is in the DOM

          // and rebuild fresh from the merged list. invalidateDmCache makes

          // sure the prefix-check doesn't try to reuse stale ids.

          invalidateDmCache(key);

          renderConversation();

        }

      }).catch(()=>{

        // Even on failure we mark fetched so a transient error doesn't trap

        // the user on the spinner forever; they'll see whatever subset

        // messages[k] holds and a real retry will come from the next WS

        // event or the next selectConversation call.

        if (conversations[key]) conversations[key]._historyFetched = true;

        if (currentConversation === key){

          invalidateDmCache(key);

          renderConversation();

        }

      });

    } else if (conv._historyFetched) {

      // History already fetched in this session; the synchronous render

      // above used the cached messages[k]. Nothing else to do.

    } else {

      // Backend not configured (offline / dev). Just render whatever we have.

      renderConversation();

      if (conv) conv._historyFetched = true;

    }

  }

  // Friends-only compose gate. When the local user has the privacy toggle on

  // and the current chat partner isn't a friend (and isn't Saved Messages),

  // hide the compose box and show a locked banner with a Friend Request shortcut.

  function syncDmComposeLock(){

    const wrap   = document.getElementById('dmInputWrap');

    const ibox   = document.getElementById('dmIbox');

    const replyBar = document.getElementById('dmReplyBar');

    const editBar  = document.getElementById('dmEditBar');

    const attBar   = document.getElementById('dmAttachPreview');

    const lockedEl = document.getElementById('dmComposeLocked');

    if (!wrap || !ibox || !lockedEl) return;

    const conv = conversations[currentConversation];

    const isSaved = conv && conv.isSaved;

    const youBlocked = !isSaved && currentConversation && isBlocked(currentConversation);

    const peerBlocked = !isSaved && currentConversation && isBlockedByPeer(currentConversation);

    // Friends-only is the *peer*'s privacy toggle, not ours: we can only

    // message them when we're already in their friends list. Our own

    // readFriendsOnly() flag controls who can DM *us* — the server

    // enforces that on incoming, so we don't gate the compose box on it.

    const peerFriendsOnly = !!(conv && conv.friendsOnly);

    const restricted = peerFriendsOnly && currentConversation && !isSaved && !isFriend(currentConversation);

    wrap.style.display = 'block';

    const hideCompose = youBlocked || peerBlocked || restricted;

    if (hideCompose){

      ibox.style.display = 'none';

      if (replyBar) replyBar.style.display = 'none';

      if (editBar) editBar.style.display = 'none';

      if (attBar) attBar.style.display = 'none';

      lockedEl.style.display = 'flex';

      // Repaint the locked banner so the message + button match the reason.

      let html;

      if (youBlocked){

        html = '<i data-lucide="shield-off" style="width:14px;height:14px"></i>'+

          '<span class="dm-locked-text">You blocked '+escapeHtml(conv.name)+' — chat history stays, sending is off.</span>'+

          '<button class="sm-btn primary" id="dmLockedUnblock" type="button"><i data-lucide="shield" style="width:11px;height:11px"></i>UNBLOCK</button>';

      } else if (peerBlocked){

        html = '<i data-lucide="ban" style="width:14px;height:14px"></i>'+

          '<span class="dm-locked-text">'+escapeHtml(conv.name)+' blocked you. You can\'t send new messages.</span>';

      } else {

        html = '<i data-lucide="user-x" style="width:14px;height:14px"></i>'+

          '<span class="dm-locked-text">'+escapeHtml(conv.name)+' only accepts messages from friends.</span>'+

          '<button class="sm-btn primary" id="dmLockedAddFriend" type="button"><i data-lucide="user-plus" style="width:11px;height:11px"></i>SEND FRIEND REQUEST</button>';

      }

      lockedEl.innerHTML = html;

      const ub = document.getElementById('dmLockedUnblock');

      if (ub) ub.addEventListener('click', () => {

        unblockUser(currentConversation);

        renderConversation();

        showToast('Unblocked '+conv.name,'success');

      });

      const af = document.getElementById('dmLockedAddFriend');

      if (af) af.addEventListener('click', async () => {

        const handle = conv.handle || ('@'+currentConversation);

        if (backend.isConfigured()){

          const r = await backend.friends.request(handle);

          if (r && r.error){ showToast('Could not send request: '+r.error,'warn'); return; }

        }

        showToast('Friend request sent','success');

      });

    } else {

      ibox.style.display = 'flex';

      lockedEl.style.display = 'none';

    }

    refreshIcons();

  }

  // Cache of (conversationKey -> [messageIds rendered into the DOM]) so we

  // can detect the "user just sent / received one new message" case and

  // append a single bubble instead of rebuilding the whole transcript. The

  // full innerHTML rebuild reset scroll, killed CSS animations and made the

  // chat visibly flash on every keystroke; appending in place is invisible.

  const _dmRenderedIds = Object.create(null);

  // Mutations that change a message in-place (edit, delete, status flip)

  // need a full re-render — the id list is unchanged so the prefix check

  // would happily skip them. Callers that mutate an existing bubble call

  // this so the next renderConversation rebuilds.

  function invalidateDmCache(key){

    if (key && _dmRenderedIds[key]) delete _dmRenderedIds[key];

  }

  // In-place bubble update: when the server hands us back the canonical id

  // for an optimistic message, or when an edit/delete event arrives, we'd

  // rather not rebuild the whole transcript. Find the existing row by

  // data-msg-row="<oldId>", swap the id attribute, and refresh just the

  // status icon + caption / text inside it. Keeps scroll, hover and the

  // icon set frozen — none of which renderConversation() preserves.

  function _patchDmBubbleInPlace(convKey, oldId, m){

    if (!convKey || !m) return false;

    const msgsEl = document.getElementById('dmMsgs');

    if (!msgsEl) return false;

    const row = msgsEl.querySelector('[data-msg-row="'+CSS.escape(String(oldId))+'"]');

    if (!row) return false;

    // Update the cached id list so the next prefix-check still passes.

    const cache = _dmRenderedIds[convKey];

    if (cache){

      const idx = cache.indexOf(String(oldId));

      if (idx >= 0) cache[idx] = String(m.id);

    }

    // Update id attributes everywhere the bubble references it.

    row.setAttribute('data-msg-row', String(m.id));

    row.querySelectorAll('[data-msg-id="'+CSS.escape(String(oldId))+'"]').forEach(el => {

      el.setAttribute('data-msg-id', String(m.id));

    });

    // Refresh the clock label too, in case the optimistic bubble used a

    // local "HH:MM" and the server returned an ISO timestamp that we

    // want to render with locale-aware formatting. If the time hasn't

    // changed visibly we still write it — cheap and idempotent.

    const timeSpan = row.querySelector('.dm-bubble-meta > span');

    if (timeSpan && m.time != null){

      timeSpan.textContent = fmtMessageTime(m.time);

    }

    // Status icon (the clock / check / check-check on outgoing bubbles).

    const statusContainer = row.querySelector('.dm-bubble-meta');

    if (statusContainer && m.sender === 'me'){

      const oldIcon = statusContainer.querySelector('.dm-status-icon');

      if (oldIcon) oldIcon.remove();

      let iconHtml = '';

      if (m.status === 'failed'){

        iconHtml = '<i data-lucide="alert-circle" class="dm-status-icon" style="color:var(--danger)" title="Failed to send — tap to retry"></i>';

      } else if (m.status === 'pending'){

        iconHtml = '<i data-lucide="clock" class="dm-status-icon dm-status-pending" title="Sending…"></i>';

      } else if (m.status === 'read'){

        iconHtml = '<i data-lucide="check-check" class="dm-status-icon" style="color:var(--accent)"></i>';

      } else if (m.status === 'delivered'){

        iconHtml = '<i data-lucide="check-check" class="dm-status-icon"></i>';

      } else {

        iconHtml = '<i data-lucide="check" class="dm-status-icon"></i>';

      }

      statusContainer.insertAdjacentHTML('beforeend', iconHtml);

      // Lucide replaces the <i> with an <svg>, but only when it walks the

      // tree — call createIcons so the new <i> we just inserted hydrates.

      if (window.lucide && window.lucide.createIcons){

        try { window.lucide.createIcons(); } catch(_){}

      }

    }

    return true;

  }

  // Bulk-flip every "delivered" bubble we sent to "read" the moment the

  // peer's read receipt arrives. We touch the underlying message objects

  // in messages[] AND patch the icon in-DOM so the second tick lights up

  // without a re-render.

  function markDmThreadRead(convKey){

    const arr = messages[convKey];

    if (!arr || !arr.length) return;

    let touched = false;

    for (const m of arr){

      if (m.sender === 'me' && (m.status === 'delivered' || m.status === 'sent')){

        m.status = 'read';

        if (convKey === currentConversation) _patchDmBubbleInPlace(convKey, m.id, m);

        touched = true;

      }

    }

    return touched;

  }

  function _dmRenderSingleBubble(m, list, prevSender, prevDay){

    const conv = conversations[currentConversation];

    let html = '';

    // Normalise both sides of the comparison to the ISO key. Without this

    // a bubble persisted as 'TODAY' (older clients) renders a divider next

    // to a bubble persisted as '2026-05-08' (current code), and vice versa.

    // We pass the previous bubble's normalised key in via prevDay so that

    // a caller using the fast-append path stays in lock-step with the

    // full-rebuild path; either way we only emit the divider when the

    // calendar day truly differs.

    const myDay   = _normalizeDayKey(m.day);

    const prevKey = prevDay == null ? null : _normalizeDayKey(prevDay);

    if (myDay && myDay !== prevKey){

      html += '<div class="dm-day-divider" data-day-key="'+escapeHtml(myDay)+'"><span>'+escapeHtml(_dayLabel(myDay))+'</span></div>';

    }

    const grouped = prevSender === m.sender;

    const cls = 'dm-msg '+(m.sender==='me'?'you':'them')+(grouped?' grouped':'');

    const av = (() => {

      const r = m.sender==='me' ? resolveUserAvatar(selfProfile.name) : resolveUserAvatar(conv ? conv.name : '');

      return '<div class="dm-msg-av" style="background:'+r.bg+'">'+(r.isImage?'':escapeHtml(r.text))+'</div>';

    })();

    let bubbleContent = '';

    if (m.deleted){

      bubbleContent = '<div class="dm-bubble deleted" data-msg-id="'+m.id+'">Message deleted</div>';

    } else if (m.type === 'serverCard' && m.serverCard){

      bubbleContent = '<div class="dm-bubble server-card-bubble" data-msg-id="'+m.id+'">'+renderServerCardHtml(m.serverCard)+'</div>';

    } else if (m.type === 'channelCard' && m.channelCard){

      bubbleContent = '<div class="dm-bubble server-card-bubble" data-msg-id="'+m.id+'">'+renderChannelCardHtml(m.channelCard)+'</div>';

    } else if (m.type === 'userCard' && m.userCard){

      bubbleContent = '<div class="dm-bubble server-card-bubble" data-msg-id="'+m.id+'">'+renderUserCardHtml(m.userCard)+'</div>';

    } else if (m.type === 'image'){

      const cap = m.caption ? '<div class="dm-bubble-cap">'+escapeHtml(m.caption)+'</div>' : '';

      let replyPrev = '';

      if (m.replyTo){

        const orig = list.find(x => String(x.id) === String(m.replyTo));

        if (orig && conv){

          const who = orig.sender==='me'?'You':conv.name;

          const txt = orig.deleted?'Message deleted':(orig.type==='image'?'🖼 Photo':(orig.text||'').slice(0,80));

          replyPrev = '<div class="dm-reply-preview" data-jump-to="'+orig.id+'"><div class="drp-name">'+who+'</div><div class="drp-text">'+escapeHtml(txt)+'</div></div>';

        }

      }

      bubbleContent = '<div class="dm-bubble image-bubble" data-msg-id="'+m.id+'">'+replyPrev+'<img class="dm-bubble-img" src="'+m.src+'" alt="" data-msg-id="'+m.id+'" />'+cap+'</div>';

    } else {

      const fwdTag = m.forwarded ? '<div class="dm-fwd-tag"><i data-lucide="share-2" style="width:9px;height:9px"></i>FORWARDED</div>' : '';

      const editedCls = m.edited ? ' edited' : '';

      let replyPrev = '';

      if (m.replyTo){

        const orig = list.find(x => String(x.id) === String(m.replyTo));

        if (orig && conv){

          const who = orig.sender==='me'?'You':conv.name;

          const txt = orig.deleted?'Message deleted':(orig.type==='image'?'🖼 Photo':(orig.text||'').slice(0,80));

          replyPrev = '<div class="dm-reply-preview" data-jump-to="'+orig.id+'"><div class="drp-name">'+who+'</div><div class="drp-text">'+escapeHtml(txt)+'</div></div>';

        }

      }

      bubbleContent = '<div class="dm-bubble'+(m.forwarded?' forwarded':'')+editedCls+'" data-msg-id="'+m.id+'">'+fwdTag+replyPrev+escapeHtml(m.text||'')+'</div>';

    }

    let statusIcon = '';

    if (m.sender === 'me'){

      if (m.status === 'failed'){

        statusIcon = '<i data-lucide="alert-circle" class="dm-status-icon" style="color:var(--danger)" title="Failed to send — tap to retry"></i>';

      } else if (m.status === 'pending'){

        statusIcon = '<i data-lucide="clock" class="dm-status-icon dm-status-pending" title="Sending…"></i>';

      } else {

        const ic = m.status === 'read' ? 'check-check' : (m.status === 'delivered' ? 'check-check' : 'check');

        statusIcon = '<i data-lucide="'+ic+'" class="dm-status-icon" style="'+(m.status==='read'?'color:var(--accent)':'')+'"></i>';

      }

    }

    const meta = '<div class="dm-bubble-meta"><span>'+escapeHtml(fmtMessageTime(m.time))+'</span>'+statusIcon+'</div>';

    let hoverActions = '';

    if (!m.deleted){

      const pinned = String(dmPinnedByConv[currentConversation] ?? '') === String(m.id);

      hoverActions = '<div class="dm-bubble-hover-actions">'+

        '<button class="dm-bubble-action" data-msg-action="reply" data-msg-id="'+m.id+'" title="Reply"><i data-lucide="reply" style="width:13px;height:13px"></i></button>'+

        '<button class="dm-bubble-action" data-msg-action="forward" data-msg-id="'+m.id+'" title="Forward"><i data-lucide="share-2" style="width:13px;height:13px"></i></button>'+

        '<button class="dm-bubble-action" data-msg-action="pin" data-msg-id="'+m.id+'" title="'+(pinned?'Unpin':'Pin')+'"><i data-lucide="pin" style="width:13px;height:13px;'+(pinned?'color:var(--warn)':'')+'"></i></button>'+

        (m.sender==='me' && m.type !== 'image' ? '<button class="dm-bubble-action" data-msg-action="edit" data-msg-id="'+m.id+'" title="Edit"><i data-lucide="edit-2" style="width:13px;height:13px"></i></button>' : '') +

        (m.type !== 'image' ? '<button class="dm-bubble-action" data-msg-action="copy" data-msg-id="'+m.id+'" title="Copy"><i data-lucide="copy" style="width:13px;height:13px"></i></button>' : '<button class="dm-bubble-action" data-msg-action="download-img" data-msg-id="'+m.id+'" title="Download"><i data-lucide="download" style="width:13px;height:13px"></i></button>') +

        (m.sender==='me' ? '<button class="dm-bubble-action danger" data-msg-action="delete" data-msg-id="'+m.id+'" title="Delete"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>' : '') +

      '</div>';

    }

    const selCls = (dmSelectMode && dmSelectedIds.has(String(m.id))) ? ' is-selected' : '';

    html += '<div class="'+cls+selCls+'" data-msg-row="'+m.id+'">'+av+'<div class="dm-bubble-wrap">'+bubbleContent+meta+'</div>'+hoverActions+'</div>';

    return html;

  }

  function renderConversation(){

    const msgsEl = document.getElementById('dmMsgs');

    const list = messages[currentConversation] || [];

    const conv = conversations[currentConversation];

    // Fast path: the cached id list matches everything but the new tail. We

    // append the missing bubbles in place so scroll, focus, hover state and

    // the input field stay intact. Anything that breaks this assumption

    // (edit, delete, pin change, day-divider boundary, conversation switch)

    // falls through to the full rebuild below.

    const cached = _dmRenderedIds[currentConversation];

    // Quick sanity check on cache integrity. The DOM also tracks the same

    // id list via data-msg-row; if the two diverge (e.g. the user opened

    // another conversation in between, or a remote dm:cleared wiped DOM

    // rows but missed the cache), we can't reason about prefix safely.

    // Drop into a full rebuild instead of risking dropped bubbles.

    let cacheLooksValid = !!(cached && cached.length);

    if (cacheLooksValid){

      const domIds = msgsEl.querySelectorAll('[data-msg-row]');

      if (domIds.length !== cached.length) cacheLooksValid = false;

    }

    if (cacheLooksValid && list.length >= cached.length){

      let prefixOk = true;

      for (let i = 0; i < cached.length; i++){

        if (cached[i] !== String(list[i].id)) { prefixOk = false; break; }

      }

      const onlyAppended = prefixOk && list.length > cached.length;

      if (onlyAppended){

        // We also need the pinned banner to be unchanged — when a pin is

        // added/removed the banner area shifts and incremental render misses

        // it. Stamp the current pin id and only fast-path when it matches.

        const expectedPin = msgsEl.dataset.pinId || '';

        const actualPin   = String(dmPinnedByConv[currentConversation] || '');

        if (expectedPin === actualPin){

          const SLOP = 80;

          const wasNearBottom = (msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight) < SLOP;

          // Build only the new bubbles, with sender/day stitched from the last

          // cached message so grouping still collapses correctly. We pull

          // prevDay from whichever divider is currently last in the DOM,

          // not from `list[lastCachedIdx].day` — those two get out of sync

          // when an older message had `day: undefined` (legacy WS push) and

          // would silently re-emit a divider on every subsequent bubble.

          const lastCachedIdx = cached.length - 1;

          let prevSender = lastCachedIdx >= 0 ? list[lastCachedIdx].sender : null;

          const allDividers = msgsEl.querySelectorAll('.dm-day-divider[data-day-key]');

          const lastDividerInDom = allDividers.length ? allDividers[allDividers.length - 1] : null;

          let prevDay = lastDividerInDom ? lastDividerInDom.getAttribute('data-day-key') : null;

          let appendHtml = '';

          for (let i = cached.length; i < list.length; i++){

            appendHtml += _dmRenderSingleBubble(list[i], list, prevSender, prevDay);

            prevSender = list[i].sender;

            const k = _normalizeDayKey(list[i].day);

            if (k) prevDay = k;

            cached.push(String(list[i].id));

          }

          if (appendHtml){

            const tmp = document.createElement('div');

            tmp.innerHTML = appendHtml;

            while (tmp.firstChild) msgsEl.appendChild(tmp.firstChild);

            if (wasNearBottom) msgsEl.scrollTop = msgsEl.scrollHeight;

            // Lucide icons inside the appended fragment need to be hydrated

            // — createIcons re-scans the document but since the new SVGs

            // are still <i data-lucide="...">, this just upgrades them.

            refreshIcons();

          }

          return;

        }

      }

    }

    // Reflect compose-box state for friends-only / block restrictions.

    // The block UI lives below, after the message list is rendered, so the

    // user keeps seeing their chat history while composing is locked off.

    syncDmComposeLock();

    let html = '';

    // Pinned message banner

    const pinId = dmPinnedByConv[currentConversation];

    if (pinId){

      const pinIdStr = String(pinId);

      const pm = list.find(x => String(x.id) === pinIdStr);

      if (pm){

        const txt = pm.deleted ? 'Message deleted' : (pm.type==='image' ? '🖼 Photo' : (pm.text||'').slice(0,160));

        html += '<div class="dm-pinned-banner" data-jump-to="'+pinId+'"><i data-lucide="pin" style="width:11px;height:11px"></i><div class="dm-pinned-info"><div class="dm-pinned-l">PINNED</div><div class="dm-pinned-text">'+escapeHtml(txt)+'</div></div><button class="dm-pinned-x" data-msg-action="pin" data-msg-id="'+pinId+'" title="Unpin"><i data-lucide="x" style="width:11px;height:11px"></i></button></div>';

      }

    }

    // Empty thread — render the same eyebrow + line that the loading

    // placeholder shows so first-open / no-history both feel the same.

    if (!list.length){

      const conv = conversations[currentConversation];

      msgsEl.innerHTML = '<div class="dm-empty-thread">'

        + '<div class="dm-empty-thread-eyebrow">// NEW TRANSMISSION</div>'

        + '<div class="dm-empty-thread-text">No messages yet — be the first to ping ' + escapeHtml((conv && conv.name)||'them') + '.</div>'

        + '</div>';

      _dmRenderedIds[currentConversation] = [];

      refreshIcons();

      return;

    }

    let lastDay = null;

    let lastSender = null;

    list.forEach((m) => {

      // Normalise so legacy "TODAY" / locale-formatted strings collapse to

      // the same key as a fresh "2026-05-08" bubble — otherwise old data

      // stuck in messages[] keeps drawing a fresh divider on every row.

      const myDay = _normalizeDayKey(m.day);

      if (myDay && myDay !== lastDay){

        html += '<div class="dm-day-divider" data-day-key="'+escapeHtml(myDay)+'"><span>'+escapeHtml(_dayLabel(myDay))+'</span></div>';

        lastDay = myDay;

        lastSender = null;

      }

      const grouped = lastSender === m.sender;

      lastSender = m.sender;

      const cls = 'dm-msg '+(m.sender==='me'?'you':'them')+(grouped?' grouped':'');

      const av = (() => {

        const r = m.sender==='me' ? resolveUserAvatar(selfProfile.name) : resolveUserAvatar(conv.name);

        return '<div class="dm-msg-av" style="background:'+r.bg+'">'+(r.isImage?'':escapeHtml(r.text))+'</div>';

      })();

      let bubbleContent = '';

      if (m.deleted){

        bubbleContent = '<div class="dm-bubble deleted" data-msg-id="'+m.id+'">Message deleted</div>';

      } else if (m.type === 'serverCard' && m.serverCard){

        bubbleContent = '<div class="dm-bubble server-card-bubble" data-msg-id="'+m.id+'">'+renderServerCardHtml(m.serverCard)+'</div>';

      } else if (m.type === 'channelCard' && m.channelCard){

        bubbleContent = '<div class="dm-bubble server-card-bubble" data-msg-id="'+m.id+'">'+renderChannelCardHtml(m.channelCard)+'</div>';

      } else if (m.type === 'userCard' && m.userCard){

        bubbleContent = '<div class="dm-bubble server-card-bubble" data-msg-id="'+m.id+'">'+renderUserCardHtml(m.userCard)+'</div>';

      } else if (m.type === 'image'){

        const cap = m.caption ? '<div class="dm-bubble-cap">'+escapeHtml(m.caption)+'</div>' : '';

        let replyPrev = '';

        if (m.replyTo){

          const orig = list.find(x => String(x.id) === String(m.replyTo));

          if (orig){

            const who = orig.sender==='me'?'You':conv.name;

            const txt = orig.deleted?'Message deleted':(orig.type==='image'?'🖼 Photo':(orig.text||'').slice(0,80));

            replyPrev = '<div class="dm-reply-preview" data-jump-to="'+orig.id+'"><div class="drp-name">'+who+'</div><div class="drp-text">'+escapeHtml(txt)+'</div></div>';

          }

        }

        bubbleContent = '<div class="dm-bubble image-bubble" data-msg-id="'+m.id+'">'+replyPrev+'<img class="dm-bubble-img" src="'+m.src+'" alt="" data-msg-id="'+m.id+'" />'+cap+'</div>';

      } else {

        const fwdTag = m.forwarded ? '<div class="dm-fwd-tag"><i data-lucide="share-2" style="width:9px;height:9px"></i>FORWARDED</div>' : '';

        const editedCls = m.edited ? ' edited' : '';

        let replyPrev = '';

        if (m.replyTo){

          const orig = list.find(x => String(x.id) === String(m.replyTo));

          if (orig){

            const who = orig.sender==='me'?'You':conv.name;

            const txt = orig.deleted?'Message deleted':(orig.type==='image'?'🖼 Photo':(orig.text||'').slice(0,80));

            replyPrev = '<div class="dm-reply-preview" data-jump-to="'+orig.id+'"><div class="drp-name">'+who+'</div><div class="drp-text">'+escapeHtml(txt)+'</div></div>';

          }

        }

        bubbleContent = '<div class="dm-bubble'+(m.forwarded?' forwarded':'')+editedCls+'" data-msg-id="'+m.id+'">'+fwdTag+replyPrev+escapeHtml(m.text)+'</div>';

      }

      let statusIcon = '';

      if (m.sender === 'me'){

        if (m.status === 'failed'){

          statusIcon = '<i data-lucide="alert-circle" class="dm-status-icon" style="color:var(--danger)" title="Failed to send — tap to retry"></i>';

        } else if (m.status === 'pending'){

          statusIcon = '<i data-lucide="clock" class="dm-status-icon dm-status-pending" title="Sending…"></i>';

        } else {

          const ic = m.status === 'read' ? 'check-check' : (m.status === 'delivered' ? 'check-check' : 'check');

          statusIcon = '<i data-lucide="'+ic+'" class="dm-status-icon" style="'+(m.status==='read'?'color:var(--accent)':'')+'"></i>';

        }

      }

      const meta = '<div class="dm-bubble-meta"><span>'+escapeHtml(fmtMessageTime(m.time))+'</span>'+statusIcon+'</div>';

      // Hover-based action toolbar (unified: reply, forward, copy/edit/download, pin, delete)

      let hoverActions = '';

      if (!m.deleted){

        const pinned = String(dmPinnedByConv[currentConversation] ?? '') === String(m.id);

        hoverActions = '<div class="dm-bubble-hover-actions">'+

          '<button class="dm-bubble-action" data-msg-action="reply" data-msg-id="'+m.id+'" title="Reply"><i data-lucide="reply" style="width:13px;height:13px"></i></button>'+

          '<button class="dm-bubble-action" data-msg-action="forward" data-msg-id="'+m.id+'" title="Forward"><i data-lucide="share-2" style="width:13px;height:13px"></i></button>'+

          '<button class="dm-bubble-action" data-msg-action="pin" data-msg-id="'+m.id+'" title="'+(pinned?'Unpin':'Pin')+'"><i data-lucide="pin" style="width:13px;height:13px;'+(pinned?'color:var(--warn)':'')+'"></i></button>'+

          (m.sender==='me' && m.type !== 'image' ? '<button class="dm-bubble-action" data-msg-action="edit" data-msg-id="'+m.id+'" title="Edit"><i data-lucide="edit-2" style="width:13px;height:13px"></i></button>' : '') +

          (m.type !== 'image' ? '<button class="dm-bubble-action" data-msg-action="copy" data-msg-id="'+m.id+'" title="Copy"><i data-lucide="copy" style="width:13px;height:13px"></i></button>' : '<button class="dm-bubble-action" data-msg-action="download-img" data-msg-id="'+m.id+'" title="Download"><i data-lucide="download" style="width:13px;height:13px"></i></button>') +

          (m.sender==='me' ? '<button class="dm-bubble-action danger" data-msg-action="delete" data-msg-id="'+m.id+'" title="Delete"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>' : '') +

        '</div>';

      }

      const selCls = (dmSelectMode && dmSelectedIds.has(String(m.id))) ? ' is-selected' : '';

      html += '<div class="'+cls+selCls+'" data-msg-row="'+m.id+'">'+av+'<div class="dm-bubble-wrap">'+bubbleContent+meta+'</div>'+hoverActions+'</div>';

    });

    // Preserve scroll position across re-renders so receiving / sending a

    // message doesn't snap the viewport (the visible "glitch") unless the

    // user was already at the bottom. The render itself is what causes the

    // brief flash — we set scrollTop SYNCHRONOUSLY right after innerHTML so

    // the browser never paints the intermediate "scrolled to top" state.

    const SLOP = 80;

    const wasNearBottom = (msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight) < SLOP;

    const prevScrollFromBottom = msgsEl.scrollHeight - msgsEl.scrollTop;

    msgsEl.innerHTML = html;

    // Re-seed the per-conversation cache so the next render can skip the

    // full rebuild when only a tail bubble is appended.

    _dmRenderedIds[currentConversation] = (list || []).map(x => String(x.id));

    msgsEl.dataset.pinId = String(dmPinnedByConv[currentConversation] || '');

    if (wasNearBottom){

      msgsEl.scrollTop = msgsEl.scrollHeight;

    } else {

      // Maintain distance from bottom so the user's reading position doesn't

      // drift when something below them changes height.

      msgsEl.scrollTop = msgsEl.scrollHeight - prevScrollFromBottom;

    }

    refreshIcons();

  }

  function findMsg(id){

    if (!currentConversation) return null;

    if (id === undefined || id === null) return null;

    // DOM dataset values come back as strings, but server-issued ids are

    // numbers. Compare by string form so both shapes match.

    const target = String(id);

    return (messages[currentConversation]||[]).find(m => String(m.id) === target);

  }

  // ============== BUBBLE ACTIONS POPUP — fixed positioning ==============

  let bubbleActionsTarget = null;

  function buildBubbleActions(m){

    const isMine = m.sender === 'me';

    let html = '';

    html += '<button class="dm-bubble-action" data-msg-action="reply" data-msg-id="'+m.id+'" title="Reply"><i data-lucide="reply" style="width:13px;height:13px"></i></button>';

    html += '<button class="dm-bubble-action" data-msg-action="forward" data-msg-id="'+m.id+'" title="Forward"><i data-lucide="share-2" style="width:13px;height:13px"></i></button>';

    if (isMine && m.type !== 'image') html += '<button class="dm-bubble-action" data-msg-action="edit" data-msg-id="'+m.id+'" title="Edit"><i data-lucide="edit-2" style="width:13px;height:13px"></i></button>';

    if (m.type !== 'image') html += '<button class="dm-bubble-action" data-msg-action="copy" data-msg-id="'+m.id+'" title="Copy"><i data-lucide="copy" style="width:13px;height:13px"></i></button>';

    else html += '<button class="dm-bubble-action" data-msg-action="download-img" data-msg-id="'+m.id+'" title="Download"><i data-lucide="download" style="width:13px;height:13px"></i></button>';

    if (isMine) html += '<button class="dm-bubble-action danger" data-msg-action="delete" data-msg-id="'+m.id+'" title="Delete"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>';

    return html;

  }

  function showBubbleActions(bubbleEl, m){

    const ba = document.getElementById('bubbleActions');

    ba.innerHTML = buildBubbleActions(m);

    refreshIcons();

    ba.classList.add('show');

    bubbleActionsTarget = m.id;

    // Position: prefer above the bubble, fallback below; clamp to viewport

    const br = bubbleEl.getBoundingClientRect();

    const baR = ba.getBoundingClientRect();

    let top = br.top - baR.height - 6;

    if (top < 6) top = br.bottom + 6;

    let left = br.left + (br.width - baR.width) / 2;

    if (m.sender === 'me') left = br.right - baR.width;

    if (left < 6) left = 6;

    if (left + baR.width > window.innerWidth - 6) left = window.innerWidth - baR.width - 6;

    if (top + baR.height > window.innerHeight - 6) top = window.innerHeight - baR.height - 6;

    ba.style.top = top + 'px';

    ba.style.left = left + 'px';

  }

  function hideBubbleActions(){

    const ba = document.getElementById('bubbleActions');

    ba.classList.remove('show');

    bubbleActionsTarget = null;

  }

  function setReply(id){

    const m = findMsg(id); if (!m) return;

    if (dmEditingId) cancelEdit();

    dmReplyTo = m;

    document.getElementById('dmReplyBar').style.display = 'flex';

    document.getElementById('dmReplyName').textContent = 'Replying to '+(m.sender==='me'?'yourself':conversations[currentConversation].name);

    document.getElementById('dmReplyText').textContent = m.type==='image' ? '🖼 Photo' : (m.text||'');

    document.getElementById('dmIbox').classList.add('has-reply');

    document.getElementById('dmInput').focus();

  }

  function cancelReply(){

    dmReplyTo = null;

    document.getElementById('dmReplyBar').style.display = 'none';

    document.getElementById('dmIbox').classList.remove('has-reply');

  }

  function setEdit(id){

    const m = findMsg(id); if (!m || m.sender!=='me' || m.type==='image') return;

    cancelReply();

    dmEditingId = id;

    document.getElementById('dmEditBar').style.display = 'flex';

    document.getElementById('dmEditText').textContent = m.text;

    document.getElementById('dmIbox').classList.add('has-edit');

    const inp = document.getElementById('dmInput');

    inp.value = m.text;

    inp.focus();

    autoResizeInput(inp);

    updateSendBtn();

  }

  function cancelEdit(){

    dmEditingId = null;

    document.getElementById('dmEditBar').style.display = 'none';

    document.getElementById('dmIbox').classList.remove('has-edit');

    const inp = document.getElementById('dmInput');

    inp.value = '';

    autoResizeInput(inp);

    updateSendBtn();

  }

  // ============== DM SELECT MODE / CLEAR CHAT / PIN ==============

  async function clearDmChat(){

    if (!currentConversation) return;

    if (backend.isConfigured()){

      const peerKey = resolvePeerKeyForBackend(currentConversation);

      const r = await backend.dms.clear(peerKey);

      if (r.error){ showToast('Could not clear: '+r.error,'warn'); return; }

    }

    // Reset message state. Wipe local stale UI bits (selection, pinned banner,

    // bubble action popups) BEFORE re-rendering so we don't see ghost rows.

    messages[currentConversation] = [];

    dmPinnedByConv[currentConversation] = null;

    if (typeof dmSelectedIds !== 'undefined') dmSelectedIds.clear();

    if (typeof dmSelectMode !== 'undefined' && dmSelectMode) exitDmSelectMode();

    if (typeof hideBubbleActions === 'function') hideBubbleActions();

    cancelReply(); cancelEdit(); clearDmAttach();

    // Clear the rendered list directly so even if a downstream render is async,

    // the user sees "empty" the instant they confirm.

    const msgsEl = document.getElementById('dmMsgs');

    if (msgsEl) msgsEl.innerHTML = '';

    renderConversation();

    renderDmList();

    showToast('Chat cleared','warn');

  }

  // Long-press helper: invokes onLongPress(targetEl) after `delay` ms of holding.

  // Attaches to the given delegated container with a selector for valid targets.

  // Adds a brief `.long-press-grow` class for visual feedback during the hold.

  function attachLongPress(container, selector, onLongPress, opts){

    opts = opts || {};

    const delay = opts.delay || 380;

    const moveCancelPx = opts.moveCancelPx || 6;

    let timer = null, startX = 0, startY = 0, target = null, fired = false, swallowNextClick = false;

    function reset(){ if (timer){ clearTimeout(timer); timer = null; } if (target) target.classList.remove('long-press-grow'); target = null; }

    container.addEventListener('pointerdown', e => {

      if (e.pointerType === 'mouse' && e.button !== 0) return;

      if (e.target.closest('.dm-msg-av,.ws-msg-av,.dm-bubble-hover-actions,.ws-msg-actions,button,a')) return;

      const t = e.target.closest(selector);

      if (!t) return;

      target = t; startX = e.clientX; startY = e.clientY; fired = false;

      target.classList.add('long-press-grow');

      timer = setTimeout(() => {

        fired = true;

        swallowNextClick = true;

        if (target) target.classList.remove('long-press-grow');

        try { onLongPress(target); } catch(_){}

      }, delay);

    });

    container.addEventListener('pointermove', e => {

      if (!timer) return;

      if (Math.abs(e.clientX - startX) > moveCancelPx || Math.abs(e.clientY - startY) > moveCancelPx){ reset(); fired = false; }

    });

    ['pointerup','pointerleave','pointercancel','blur'].forEach(ev => container.addEventListener(ev, reset));

    // After a long-press fires, the synthetic click that follows the pointerup

    // would otherwise toggle the same selection back off. Swallow it once.

    container.addEventListener('click', e => {

      if (swallowNextClick){ swallowNextClick = false; e.stopPropagation(); e.preventDefault(); }

    }, true);

    container.addEventListener('contextmenu', e => { if (fired) e.preventDefault(); });

  }

  function enterDmSelectMode(){

    dmSelectMode = true;

    dmSelectedIds.clear();

    document.getElementById('dmConv').classList.add('select-mode');

    document.querySelectorAll('.dm-msg.is-selected').forEach(el => el.classList.remove('is-selected'));

    renderDmSelectionBar();

  }

  function exitDmSelectMode(){

    dmSelectMode = false;

    dmSelectedIds.clear();

    document.getElementById('dmConv').classList.remove('select-mode');

    document.querySelectorAll('.dm-msg.is-selected').forEach(el => el.classList.remove('is-selected'));

    renderDmSelectionBar();

  }

  function toggleDmSelect(id){

    const key = String(id);

    if (dmSelectedIds.has(key)) dmSelectedIds.delete(key);

    else dmSelectedIds.add(key);

    if (dmSelectMode && dmSelectedIds.size === 0){ exitDmSelectMode(); return; }

    // In-place class toggle - avoid a full re-render so the user keeps their scroll position.

    const row = document.querySelector('.dm-msg[data-msg-row="'+key+'"]');

    if (row) row.classList.toggle('is-selected', dmSelectedIds.has(key));

    renderDmSelectionBar();

  }

  function deleteSelectedDm(){

    if (!currentConversation || !dmSelectedIds.size) return;

    const ids = Array.from(dmSelectedIds);

    messages[currentConversation] = (messages[currentConversation]||[]).filter(m => !dmSelectedIds.has(String(m.id)));

    showToast(ids.length+' message(s) deleted','warn');

    exitDmSelectMode();

    renderDmList();

    // Persist each deletion to the backend so the peer (and our other tabs)

    // actually see them disappear too. Skip optimistic temp ids.

    if (backend.isConfigured()){

      const peerKey = resolvePeerKeyForBackend(currentConversation);

      ids.forEach(id => {

        if (typeof id === 'string' && id.startsWith('tmp_')) return;

        backend.dms.del(peerKey, id).catch(()=>{});

      });

    }

  }

  function renderDmSelectionBar(){

    let bar = document.getElementById('dmSelectionBar');

    if (!dmSelectMode){ if (bar) bar.style.display = 'none'; return; }

    if (!bar){

      bar = document.createElement('div');

      bar.id = 'dmSelectionBar';

      bar.className = 'dm-selection-bar';

      bar.innerHTML =

        '<button class="dm-sel-cancel" id="dmSelCancel"><i data-lucide="x" style="width:13px;height:13px"></i></button>'+

        '<div class="dm-sel-count" id="dmSelCount">0 selected</div>'+

        '<button class="dm-sel-delete" id="dmSelDelete"><i data-lucide="trash-2" style="width:13px;height:13px"></i>DELETE</button>';

      const head = document.getElementById('dmHead');

      head.parentNode.insertBefore(bar, head.nextSibling);

      document.getElementById('dmSelCancel').addEventListener('click', exitDmSelectMode);

      document.getElementById('dmSelDelete').addEventListener('click', deleteSelectedDm);

      refreshIcons();

    }

    bar.style.display = 'flex';

    document.getElementById('dmSelCount').textContent = dmSelectedIds.size + ' selected';

  }

  function deleteMsg(id){

    const m = findMsg(id); if (!m) return;

    // Editing in-place changes the bubble content but not the id ordering,

    // so the append-only fast path would skip it — invalidate the cache.

    invalidateDmCache(currentConversation);

    // Optimistic local delete first so the UI is instant.

    m.deleted = true;

    m.text = '';

    renderConversation();

    renderDmList();

    showToast('Message deleted','warn');

    // Persist to the backend if we're online + signed-in. We only delete

    // server-side for messages whose id was issued by the server (numeric

    // or string-of-digits). Optimistic temp ids ('tmp_…') are not stored.

    if (!backend.isConfigured() || !currentConversation) return;

    if (typeof id === 'string' && id.startsWith('tmp_')) return;

    const peerKey = resolvePeerKeyForBackend(currentConversation);

    backend.dms.del(peerKey, id).catch(()=>{ /* the bubble already shows as deleted; surface a toast on hard failure only */ });

  }

  function copyToClipboardSafe(text){

    if (!text) return Promise.resolve(false);

    if (navigator.clipboard && window.isSecureContext){

      return navigator.clipboard.writeText(text).then(()=>true).catch(()=>fallbackCopy(text));

    }

    return Promise.resolve(fallbackCopy(text));

  }

  function fallbackCopy(text){

    try {

      const ta = document.createElement('textarea');

      ta.value = text;

      ta.style.position = 'fixed';

      ta.style.opacity = '0';

      ta.style.left = '-9999px';

      document.body.appendChild(ta);

      ta.focus(); ta.select();

      const ok = document.execCommand('copy');

      document.body.removeChild(ta);

      return ok;

    } catch { return false; }

  }

  function copyMsg(id){

    const m = findMsg(id); if (!m) return;

    const text = m.text || (m.type === 'image' ? (m.src||'') : '');

    if (!text){ showToast('Nothing to copy','warn'); return; }

    copyToClipboardSafe(text).then(ok => {

      showToast(ok ? 'Copied to clipboard' : 'Copy failed', ok ? 'success' : 'warn');

    });

  }

  // ============== SEND MESSAGE ==============

  function autoResizeInput(inp){

    inp.style.height = 'auto';

    inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';

  }

  function updateSendBtn(){

    const inp = document.getElementById('dmInput');

    const sendBtn = document.getElementById('dmSend');

    const has = (inp && inp.value.trim().length>0) || dmAttachData;

    sendBtn.classList.toggle('disabled', !has);

  }

  function updateWorldSendBtn(){

    const inp = document.getElementById('worldInput');

    const sendBtn = document.getElementById('worldSend');

    if (!sendBtn) return;

    const has = (inp && inp.value.trim().length>0) || worldAttachData;

    sendBtn.classList.toggle('disabled', !has);

  }

  async function sendDM(){

    if (!currentConversation) return;

    if (isBlocked(currentConversation)){ showToast('You blocked this user. Unblock to send messages.','warn'); return; }

    if (isBlockedByPeer(currentConversation)){ showToast('This user has blocked you. You can\'t send messages.','warn'); return; }

    const conv = conversations[currentConversation];

    // Same gate as syncDmComposeLock: peer's friends_only flag, not ours.

    if (conv && conv.friendsOnly && !conv.isSaved && !isFriend(currentConversation)){

      showToast('Only friends can be messaged. Send a friend request first.','warn'); return;

    }

    const inp = document.getElementById('dmInput');

    const text = inp.value.trim();

    if (!text && !dmAttachData) return;

    // Backend send. We render the message immediately with status:'pending'

    // (clock icon) and switch to 'delivered' (tick) once the server replies.

    // Failures flip the bubble to status:'failed' (alert icon) so the user

    // never wonders whether their message was actually sent.

    if (backend.isConfigured() && !dmEditingId){

      const peerKey = resolvePeerKeyForBackend(currentConversation);

      if (!peerKey){

        showToast('Cannot resolve recipient handle','warn');

        return;

      }

      const tempId = 'tmp_'+uid();

      // If there's an image attachment we need to upload it first; the

      // optimistic bubble shows the local data URL immediately so the

      // user sees it without waiting for the round trip.

      const hasImage = !!dmAttachData;

      const localImageSrc = hasImage ? dmAttachData.src : null;

      const optimistic = {

        id: tempId,

        sender: 'me',

        time: nowTime(),

        day: todayDayLabel(),

        status: 'pending',

        _pending: true

      };

      if (hasImage){

        optimistic.type = 'image';

        optimistic.src = localImageSrc;

        if (text) optimistic.caption = text;

      } else {

        optimistic.text = text;

      }

      if (dmReplyTo) optimistic.replyTo = dmReplyTo.id;

      if (!messages[currentConversation]) messages[currentConversation] = [];

      messages[currentConversation].push(optimistic);

      bumpDmList(currentConversation);

      const replyId = dmReplyTo ? dmReplyTo.id : undefined;

      const localFile = hasImage ? dmAttachData.file : null;

      inp.value = '';

      autoResizeInput(inp);

      cancelReply(); clearDmAttach(); updateSendBtn();

      renderConversation(); renderDmList();

      inp.focus();

      try {

        let payload = null;

        let serverImageSrc = localImageSrc;

        if (hasImage && localFile){

          // Upload the file first so the peer (and our future reload) gets

          // a real /uploads/... URL instead of an unbounded data URL.

          const fd = new FormData(); fd.append('file', localFile);

          const up = await backend.uploads.image(fd);

          if (up && up.url){

            if (up.url.startsWith('/')){

              const apiBase = (typeof _backendBase === 'function' ? _backendBase() : '') || '';

              serverImageSrc = apiBase ? apiBase.replace(/\/api$/, '') + up.url : up.url;

            } else {

              serverImageSrc = up.url;

            }

          } else {

            // Upload failed — fall back to the local data URL so at least we

            // see our own bubble. The peer won't get the image; surface a

            // toast so it's not invisible.

            showToast('Image upload failed; sending text only','warn');

          }

          payload = { type: 'image', src: serverImageSrc };

          if (text) payload.caption = text;

        }

        const sendBody = { text, replyTo: replyId };

        if (payload) sendBody.payload = payload;

        const r = await backend.dms.send(peerKey, sendBody);

        const arr = messages[currentConversation] || [];

        const idx = arr.findIndex(x => x.id === tempId);

        if (r.offline || r.error){

          if (idx >= 0){ arr[idx].status = 'failed'; arr[idx]._pending = false; arr[idx]._error = r.error || 'offline'; }

          renderConversation(); renderDmList();

          if (r.error === 'blocked') showToast('You can\'t message this user','warn');

          else if (r.error === 'friends_only') showToast('They only accept messages from friends','warn');

          else showToast(r.offline ? 'Cannot reach the server' : ('Send failed: '+r.error),'warn');

          return;

        }

        // Server returns the message with status='sent' — that's the canonical

        // "the message is in the database" state. We deliberately do NOT bump

        // it to 'delivered' here: a single tick means stored, two ticks mean

        // the peer's WS delivered the row, two ticks coloured means they read

        // it. Forging delivered/read locally is exactly what made the bubble

        // show two ticks before the peer had even opened the thread.

        const merged = { ...arr[idx], ...r.message, _pending: false };

        if (!merged.status) merged.status = 'sent';

        if (hasImage){ merged.type = 'image'; merged.src = serverImageSrc; if (text) merged.caption = text; }

        if (replyId) merged.replyTo = replyId;

        if (idx >= 0) arr[idx] = merged; else arr.push(merged);

        // Patch the existing bubble in place instead of nuking the transcript.

        // The id flips from tmp_... to a real number and the status icon goes

        // from clock to check, but the bubble itself stays in the DOM — no

        // re-flow, no scroll jump, no icon flash.

        _patchDmBubbleInPlace(currentConversation, tempId, merged);

      } catch (e) {

        const arr = messages[currentConversation] || [];

        const idx = arr.findIndex(x => x.id === tempId);

        if (idx >= 0){ arr[idx].status = 'failed'; arr[idx]._pending = false; }

        // Same in-place patch path: flip the clock icon to the alert one

        // without rebuilding everything.

        const failed = arr[idx]; if (failed) _patchDmBubbleInPlace(currentConversation, tempId, failed);

        showToast('Send failed','warn');

      }

      renderDmList();

      return;

    }

    if (dmEditingId){

      const m = findMsg(dmEditingId);

      const editedId = dmEditingId;

      if (m){ m.text = text; m.edited = true; }

      invalidateDmCache(currentConversation);

      cancelEdit();

      renderConversation();

      renderDmList();

      showToast('Message edited','success');

      inp.value = '';

      autoResizeInput(inp);

      updateSendBtn();

      // Persist the edit so the peer (and our other tabs) actually see it.

      // Skip pure-local optimistic ids — those don't exist server-side.

      if (backend.isConfigured() && currentConversation && !(typeof editedId === 'string' && editedId.startsWith('tmp_'))){

        const peerKey = resolvePeerKeyForBackend(currentConversation);

        backend.dms.edit(peerKey, editedId, text).catch(()=>{});

      }

      return;

    }

    const time = nowTime();

    const msg = { id:uid(), sender:'me', time, day:todayDayLabel(), status:'delivered' };

    if (dmAttachData){

      msg.type = 'image';

      msg.src = dmAttachData.src;

      if (text) msg.caption = text;

    } else {

      msg.text = text;

    }

    if (dmReplyTo){ msg.replyTo = dmReplyTo.id; }

    if (!messages[currentConversation]) messages[currentConversation] = [];

    messages[currentConversation].push(msg);

    bumpDmList(currentConversation);

    inp.value = '';

    autoResizeInput(inp);

    cancelReply();

    clearDmAttach();

    updateSendBtn();

    renderConversation();

    renderDmList();

    inp.focus();

    setTimeout(()=>{

      const conv = conversations[currentConversation];

      if (!conv || conv.isSaved) return;

      conv.typing = true;

      renderDmList();

      setTimeout(()=>{

        conv.typing = false;

        const replies = ["Acknowledged.","Copy that.","On it.","Got your transmission.","Stay safe.","Roger."];

        const reply = { id:uid(), sender:'them', text: replies[Math.floor(Math.random()*replies.length)], time:nowTime(), day:todayDayLabel(), status:'read' };

        messages[currentConversation].push(reply);

        bumpDmList(currentConversation);

        renderConversation();

        renderDmList();

      }, 1400);

    }, 800);

  }

  function sendWorld(){

    const inp = document.getElementById('worldInput');

    const text = inp.value.trim();

    if (!text && !worldAttachData) return;

    const time = nowTime();

    const msg = { id:uid(), sender:selfProfile.name, initial:selfProfile.initial, av:selfProfile.avColor||'linear-gradient(135deg,#22c55e,#15803d)', role:selfProfile.rank||'COMMANDER', time, special:false, cat:'news', reactions:{} };

    if (worldAttachData){

      msg.type = 'image';

      msg.src = worldAttachData.src;

      msg.text = text || '';

      msg.cat = 'media';

    } else {

      msg.text = text;

      if (text.includes('@')) msg.cat = 'mention';

    }

    worldMessages.push(msg);

    inp.value = '';

    autoResizeInput(inp);

    clearWorldAttach();

    updateWorldSendBtn();

    renderWorldMessages();

    inp.focus();

  }

  // ============== ATTACHMENTS ==============

  function setDmAttach(file){

    if (!file) return;

    if (!file.type.startsWith('image/')){ showToast('Only image files supported','warn'); return; }

    const reader = new FileReader();

    reader.onload = (e)=>{

      dmAttachData = { src: e.target.result, name: file.name, size: file.size, file };

      const thumb = document.getElementById('dmAttachThumb');

      thumb.src = e.target.result;

      document.getElementById('dmAttachName').textContent = file.name;

      document.getElementById('dmAttachSize').textContent = fmtBytes(file.size);

      document.getElementById('dmAttachPreview').style.display = 'flex';

      document.getElementById('dmIbox').classList.add('has-attach');

      updateSendBtn();

    };

    reader.onerror = ()=>{ showToast('Failed to read file','danger'); };

    reader.readAsDataURL(file);

  }

  function clearDmAttach(){

    dmAttachData = null;

    document.getElementById('dmAttachPreview').style.display = 'none';

    document.getElementById('dmIbox').classList.remove('has-attach');

    document.getElementById('dmFileInput').value = '';

    updateSendBtn();

  }

  function setWorldAttach(file){

    if (!file) return;

    if (!file.type.startsWith('image/')){ showToast('Only image files supported','warn'); return; }

    const reader = new FileReader();

    reader.onload = (e)=>{

      worldAttachData = { src: e.target.result, name: file.name, size: file.size };

      const thumb = document.getElementById('worldAttachThumb');

      thumb.src = e.target.result;

      document.getElementById('worldAttachName').textContent = file.name;

      document.getElementById('worldAttachSize').textContent = fmtBytes(file.size);

      document.getElementById('worldAttachPreview').style.display = 'flex';

      document.getElementById('worldIbox').classList.add('has-attach');

      updateWorldSendBtn();

    };

    reader.onerror = ()=>{ showToast('Failed to read file','danger'); };

    reader.readAsDataURL(file);

  }

  function clearWorldAttach(){

    worldAttachData = null;

    const prev = document.getElementById('worldAttachPreview'); if (prev) prev.style.display = 'none';

    const ibox = document.getElementById('worldIbox'); if (ibox) ibox.classList.remove('has-attach');

    const fi = document.getElementById('worldFileInput'); if (fi) fi.value = '';

    updateWorldSendBtn();

  }

  // ============== WORLD ==============

  function renderWorldMessages(){

    const el = document.getElementById('worldMsgs');

    if (!el) return;

    const filtered = worldMessages.filter(m => activeWorldFilter==='all' || m.cat===activeWorldFilter);

    if (filtered.length === 0){

      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--t3);font-size:0.78rem">No transmissions in this filter.</div>';

      return;

    }

    el.innerHTML = filtered.map(m => {

      const nameCls = m.special ? 'wmsg-name special' : 'wmsg-name';

      const role = m.role ? '<span class="wmsg-role '+(m.roleCls||'')+'">'+m.role+'</span>' : '';

      let body = '';

      if (m.type==='image'){

        const cap = m.text ? '<div class="wmsg-text">'+escapeHtml(m.text)+'</div>' : '';

        body = cap + '<div class="wmsg-text image-msg"><img src="'+m.src+'" alt="" data-world-img="'+m.id+'" /></div>';

      } else if (m.type==='serverCard' && m.serverCard){

        body = '<div class="wmsg-text" style="padding:0">'+renderServerCardHtml(m.serverCard)+'</div>';

      } else if (m.type==='channelCard' && m.channelCard){

        body = '<div class="wmsg-text" style="padding:0">'+renderChannelCardHtml(m.channelCard)+'</div>';

      } else if (m.type==='userCard' && m.userCard){

        body = '<div class="wmsg-text" style="padding:0">'+renderUserCardHtml(m.userCard)+'</div>';

      } else {

        body = '<div class="wmsg-text">'+escapeHtml(m.text)+'</div>';

      }

      let reactionsHtml = '';

      if (m.reactions){

        const keys = Object.keys(m.reactions);

        if (keys.length){

          reactionsHtml = '<div class="wmsg-reactions">'+keys.map(k => {

            const mineCls = (m.myReact && m.myReact[k]) ? ' mine' : '';

            return '<button class="reaction'+mineCls+'" data-world-react="'+m.id+'" data-emoji="'+k+'">'+k+'<span class="reaction-count">'+m.reactions[k]+'</span></button>';

          }).join('') + '<button class="reaction-add" data-world-react-add="'+m.id+'" title="Add reaction"><i data-lucide="smile-plus" style="width:11px;height:11px"></i></button></div>';

        } else {

          reactionsHtml = '<div class="wmsg-reactions"><button class="reaction-add" data-world-react-add="'+m.id+'" title="Add reaction"><i data-lucide="smile-plus" style="width:11px;height:11px"></i></button></div>';

        }

      }

      const actions = '<div class="wmsg-actions">'+

        '<button class="wmsg-action" data-world-action="reply" data-world-id="'+m.id+'" title="Reply"><i data-lucide="reply" style="width:11px;height:11px"></i></button>'+

        '<button class="wmsg-action" data-world-action="forward" data-world-id="'+m.id+'" title="Forward"><i data-lucide="share-2" style="width:11px;height:11px"></i></button>'+

        '<button class="wmsg-action" data-world-action="copy" data-world-id="'+m.id+'" title="Copy"><i data-lucide="copy" style="width:11px;height:11px"></i></button>'+

      '</div>';

      return '<div class="wmsg'+(m.pinned?' pinned':'')+'" data-world-row="'+m.id+'">'+

        '<div class="wmsg-av" style="background:'+m.av+'" data-world-av="'+m.id+'">'+m.initial+'</div>'+

        '<div class="wmsg-body">'+

          '<div class="wmsg-row1"><div class="'+nameCls+'" data-world-av="'+m.id+'">'+escapeHtml(m.sender)+'</div>'+role+'<div class="wmsg-time">'+escapeHtml(fmtMessageTime(m.time))+'</div></div>'+

          body+

          reactionsHtml+

        '</div>'+

        actions+

      '</div>';

    }).join('');

    refreshIcons();

    requestAnimationFrame(()=>{ el.scrollTop = el.scrollHeight; });

  }

  // ============== HOME SECTIONS ==============

  function renderHomeFriends(){

    const row = document.getElementById('homeFriendsRow');

    if (_initialHydrating){

      // ADD bubble first (always usable), then 4 shimmer placeholders.

      let sk = '<div class="friend-bubble add" id="addFriendBtn"><div class="friend-bubble-av"><i data-lucide="user-plus" style="width:18px;height:18px"></i></div><div class="friend-bubble-name">ADD</div></div>';

      for (let i=0;i<4;i++){

        sk += '<div class="sk-friend"><span class="sk sk-friend-av"></span><span class="sk sk-line sk-l-w70"></span></div>';

      }

      row.innerHTML = sk;

      if (typeof refreshIcons === 'function') refreshIcons();

      return;

    }

    const inVoiceUsers = inVoice && connectedChannel ? channelData[connectedChannel].users : [];

    // Pull from the unified friends database. Show online friends first, then

    // offline friends, skipping blocked ones.

    const friendEntries = friendsList

      .map(k => [k, conversations[k]])

      .filter(([k,c]) => c && !isBlocked(k));

    const online  = friendEntries.filter(([_,c]) => c.online);

    const offline = friendEntries.filter(([_,c]) => !c.online);

    let html = '';

    // ADD button always lives at the start of the list.

    html += '<div class="friend-bubble add" id="addFriendBtn"><div class="friend-bubble-av"><i data-lucide="user-plus" style="width:18px;height:18px"></i></div><div class="friend-bubble-name">ADD</div></div>';

    online.forEach(([k,c])=>{

      const isInVoice = inVoiceUsers.includes(c.name);

      const a = resolveUserAvatar(k);

      html += '<div class="friend-bubble" data-conv="'+k+'"><div class="friend-bubble-av '+(isInVoice?'in-voice':'')+'" style="background:'+a.bg+'"><span>'+(a.isImage?'':escapeHtml(a.text))+'</span><span class="fb-status"></span></div><div class="friend-bubble-name">'+escapeHtml(c.name)+'</div></div>';

    });

    offline.forEach(([k,c])=>{

      const a = resolveUserAvatar(k);

      html += '<div class="friend-bubble" data-conv="'+k+'"><div class="friend-bubble-av offline" style="background:'+a.bg+'"><span>'+(a.isImage?'':escapeHtml(a.text))+'</span><span class="fb-status"></span></div><div class="friend-bubble-name">'+escapeHtml(c.name)+'</div></div>';

    });

    row.innerHTML = html;

    refreshIcons();

  }

  function renderHomeMarkedOrbits(){

    const el = document.getElementById('homeMarkedOrbits');

    // Initial load: paint three shimmer placeholders until the first

    // hydrate finishes. Avoids the "empty" copy flashing before real

    // data arrives.

    if (_initialHydrating){

      el.innerHTML =

        '<div class="sk-orb-card"><div class="sk sk-orb-circle"></div><div class="sk sk-line sk-l-w70"></div><div class="sk sk-line sk-l-w50"></div></div>'

        + '<div class="sk-orb-card"><div class="sk sk-orb-circle"></div><div class="sk sk-line sk-l-w70"></div><div class="sk sk-line sk-l-w50"></div></div>'

        + '<div class="sk-orb-card"><div class="sk sk-orb-circle"></div><div class="sk sk-line sk-l-w70"></div><div class="sk sk-line sk-l-w50"></div></div>';

      return;

    }

    // Hide marked orbs whose channel (or its parent category) the user

    // lost access to. The mark stays in storage so re-granting the role

    // brings it back, but for now we treat it like the orb wasn't there.

    const visible = marked.filter(canSeeVoiceKey);

    if (visible.length === 0){

      el.innerHTML = '<div class="mark-orb-empty">No marked orbits yet. Tap <b style="color:var(--accent)">MARK</b> in the orb column to add some.</div>';

      return;

    }

    el.innerHTML = visible.map(ch => {

      const data = channelData[ch];

      if (!data) return '';

      const grad = data.planetGrad;

      const glowMatch = data.color.match(/rgba\((\d+),(\d+),(\d+),/);

      const r = glowMatch?glowMatch[1]:168, g = glowMatch?glowMatch[2]:85, b = glowMatch?glowMatch[3]:247;

      const glowDim = 'rgba('+r+','+g+','+b+',0.18)';

      const glowHover = 'rgba('+r+','+g+','+b+',0.28)';

      const orbGlow = 'rgba('+r+','+g+','+b+',0.4)';

      const colorBd = 'rgba('+r+','+g+','+b+',0.5)';

      const cssVars = '--card-grad:'+grad+';--card-glow:'+glowDim+';--card-glow-hover:'+glowHover+';--card-orb-glow:'+orbGlow+';--card-color:'+colorBd;

      const isConn = inVoice && connectedChannel === ch;

      const count = data.users.length;

      const countLabel = count + (count===1?' MEMBER':' MEMBERS');

      const live = isConn ? ' live' : '';

      // Find which server (if any) owns this voice channel

      let ownerSrv = null;

      for (const sid in servers){

        const sv = servers[sid];

        if ((sv.voiceChannels||[]).some(v => {

          const k = vcChannelKey(v);

          return k === ch;

        })){ ownerSrv = sv; break; }

      }

      // Server avatar (bigger) + user avatar stack

      let avs = '<div class="mo-avs">';

      if (ownerSrv){

        const srvAv = ownerSrv.cover

          ? '<div class="mo-srv-av has-image" style="background-image:url('+ownerSrv.cover+')" title="'+escapeHtml(ownerSrv.name)+'"></div>'

          : '<div class="mo-srv-av" style="background:'+ownerSrv.grad+';box-shadow:0 0 6px '+ownerSrv.glow+'" title="'+escapeHtml(ownerSrv.name)+'">'+ownerSrv.initial+'</div>';

        avs += srvAv;

      }

      if (count){

        data.users.slice(0,3).forEach(u => {

          const a = resolveUserAvatar(u);

          avs += '<div class="mo-av" style="background:'+a.bg+'" title="'+escapeHtml(u)+'">'+(a.isImage?'':escapeHtml(a.text))+'</div>';

        });

        if (count > 3) avs += '<div class="mo-av more">+'+(count-3)+'</div>';

      }

      avs += '</div>';

      // Inherit any customStyle pack from the matching voice channel.

      let _moCustom = null;

      Object.values(servers).forEach(_srv => {

        (_srv.voiceChannels||[]).forEach(_vc => {

          if (vcChannelKey(_vc) === ch && _vc.customStyle) _moCustom = _vc.customStyle;

        });

      });

      const _moCls = _moCustom ? ' '+packClassFor(_moCustom,'orbit') : '';

      return '<div class="mark-orb-card'+_moCls+'" data-mark-card="'+ch+'" data-key="'+ch+'" style="'+cssVars+'">'+

        '<div class="mo-orb'+_moCls+'"></div>'+

        '<div class="mo-name">'+data.name+'</div>'+

        avs+

        '<div class="mo-count'+live+'">'+(isConn?'CONNECTED · ':'')+countLabel+'</div>'+

      '</div>';

    }).join('');

    wireDragReorder(el, '.mark-orb-card', keys => { marked = keys.filter(k => marked.includes(k)); renderHomeMarkedOrbits(); persistMarkedOrbits(); });

  }

  function renderHomeMyServers(){

    const el = document.getElementById('homeMyServers');

    if (!el) return;

    if (_initialHydrating){

      el.innerHTML =

        '<div class="sk-server-card"><div class="sk sk-emblem"></div><div class="sk sk-line sk-l-w60"></div></div>'

        + '<div class="sk-server-card"><div class="sk sk-emblem"></div><div class="sk sk-line sk-l-w60"></div></div>'

        + '<div class="sk-server-card"><div class="sk sk-emblem"></div><div class="sk sk-line sk-l-w60"></div></div>';

      return;

    }

    if (!myServers.length){

      el.innerHTML = '<div class="mark-orb-empty">No servers joined yet. Open <b style="color:var(--accent)">WORLD</b> to discover some.</div>';

      return;

    }

    el.innerHTML = myServers.map(sid => {

      const s = servers[sid]; if (!s) return '';

      const cover = s.cover ? '<div class="ms-cover" style="background-image:url('+s.cover+')"></div>' : '';

      return '<div class="my-server-card" data-my-server="'+sid+'" data-key="'+sid+'" style="--card-grad:'+s.grad+';--card-glow:'+s.glow+'">'+

        cover+

        '<div class="ms-emblem'+(s.emblemImage?' has-image':'')+'">'+(s.emblemImage?'':s.initial)+(s.emblemImage?'<div class="ms-emblem-img" style="background-image:url('+s.emblemImage+')"></div>':'')+'</div>'+

        '<div class="ms-name">'+escapeHtml(s.name)+'</div>'+

      '</div>';

    }).join('');

    wireDragReorder(el, '.my-server-card', keys => { myServers = keys.filter(k => myServers.includes(k)); renderHomeMyServers(); renderServerRails(); persistPinnedServers(); });

  }

  // ============== MARKED PANEL (home: friends + text channels) ==============

  function isFriendMarked(k){ return markedFriends.includes(k); }

  function toggleFriendMark(k){

    if (isFriendMarked(k)){ markedFriends = markedFriends.filter(x=>x!==k); showToast('Removed friend mark','warn'); }

    else { markedFriends.push(k); showToast('Friend marked','success'); }

    // Snap to friends tab so the change is immediately visible.

    markedPanelTab = 'friends';

    renderMarkedPanel(); renderDmList();

    persistMarkedFriends();

  }

  function isChannelMarked(srvId, tcId){ return markedTextChannels.includes(srvId+'__'+tcId); }

  function toggleChannelMark(srvId, tcId){

    const k = srvId+'__'+tcId;

    if (markedTextChannels.includes(k)){ markedTextChannels = markedTextChannels.filter(x=>x!==k); showToast('Channel unmarked','warn'); }

    else { markedTextChannels.push(k); showToast('Channel marked','success'); }

    renderMarkedPanel();

    persistMarkedTextChannels();

  }

  function renderMarkedPanel(){

    const list = document.getElementById('markedPanelList');

    if (!list) return;

    if (_initialHydrating){

      // Three placeholder rows — enough to read as a list-loading state

      // without dominating the panel.

      let sk = '';

      for (let i=0;i<3;i++){

        sk += '<div class="sk-mp-row"><span class="sk sk-mp-av"></span><span class="sk sk-line sk-l-w70"></span></div>';

      }

      list.innerHTML = sk;

      return;

    }

    document.querySelectorAll('.mp-tab').forEach(t => t.classList.toggle('active', t.dataset.mpTab === markedPanelTab));

    let html = '';

    if (markedPanelTab === 'friends'){

      if (markedFriends.length === 0){

        html = '<div class="mp-empty">No marked friends yet. Hover a transmission and tap the bookmark icon.</div>';

      } else {

        markedFriends.forEach(k => {

          const c = conversations[k]; if (!c) return;

          if (isBlocked(k)) return;

          const lastMsg = (messages[k] && messages[k].length) ? messages[k][messages[k].length-1] : null;

          const preview = lastMsg ? (lastMsg.deleted?'Message deleted':lastMsg.type==='image'?'🖼 Photo':(lastMsg.text||'')) : 'No transmissions yet';

          const unreadCls = c.unread ? ' unread' : '';

          const pill = c.unread ? '<div class="mp-pill">'+c.unread+'</div>' : '';

          html += '<div class="mp-row'+unreadCls+'" data-mp-friend="'+k+'" data-key="friend:'+k+'">'+

            '<div class="mp-av" style="background:'+c.avColor+'">'+c.initial+'</div>'+

            '<div class="mp-info"><div class="mp-n">'+escapeHtml(c.name)+(c.online?'<span class="mp-tag" style="color:var(--success);background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.25)">ONLINE</span>':'')+'</div><div class="mp-meta">'+escapeHtml(preview)+'</div></div>'+

            pill+

            '<button class="mp-unstar" data-mp-unstar-friend="'+k+'" title="Unmark"><i data-lucide="bookmark-x" style="width:13px;height:13px"></i></button>'+

          '</div>';

        });

      }

    } else {

      if (markedTextChannels.length === 0){

        html = '<div class="mp-empty">No marked channels yet. Open a server, hover a #channel and use the bookmark.</div>';

      } else {

        markedTextChannels.forEach(key => {

          const [sid, tcId] = key.split('__');

          const s = servers[sid]; if (!s) return;

          const tc = s.textChannels.find(c => c.id === tcId); if (!tc) return;

          // Hide channels the user can no longer see (channel went

          // private, or its parent category did). The mark stays in

          // storage so it returns once the user gets the role back.

          if (!memberCanSeeChannelCascaded(s, selfProfile.name, tc)) return;

          const unreadCls = tc.unread ? ' unread' : '';

          const pill = tc.unread ? '<div class="mp-pill">'+tc.unread+'</div>' : '';

          html += '<div class="mp-row'+unreadCls+'" data-mp-tc="'+key+'" data-key="tc:'+key+'">'+

            '<div class="mp-av tc">#</div>'+

            '<div class="mp-info"><div class="mp-n">#'+escapeHtml(tc.name)+'</div><div class="mp-meta">'+escapeHtml(s.name)+(tc.unread?' · '+tc.unread+' new':'')+'</div></div>'+

            pill+

            '<button class="mp-unstar" data-mp-unstar-tc="'+key+'" title="Unmark"><i data-lucide="bookmark-x" style="width:13px;height:13px"></i></button>'+

          '</div>';

        });

      }

    }

    list.innerHTML = html;

    refreshIcons();

    if (markedPanelTab === 'friends'){

      wireDragReorder(list, '.mp-row', keys => { markedFriends = keys.map(k => k.replace('friend:','')).filter(k => markedFriends.includes(k)); renderMarkedPanel(); persistMarkedFriends(); });

    } else {

      wireDragReorder(list, '.mp-row', keys => { markedTextChannels = keys.map(k => k.replace('tc:','')).filter(k => markedTextChannels.includes(k)); renderMarkedPanel(); persistMarkedTextChannels(); });

    }

  }

  // ============== FRIEND REQUESTS (home section) ==============

  function renderFriendRequestsHome(){

    const list = document.getElementById('frList');

    document.querySelectorAll('.fr-tab').forEach(t => t.classList.toggle('active', t.dataset.frTab === frActiveTab));

    // Always refresh both tab counts so the OUTGOING badge reflects the live

    // outgoing array, not just whatever updateBadges last computed.

    const inEl  = document.getElementById('frInCount');  if (inEl)  inEl.textContent  = friendRequests.incoming.length;

    const outEl = document.getElementById('frOutCount'); if (outEl) outEl.textContent = friendRequests.outgoing.length;

    const items = friendRequests[frActiveTab] || [];

    if (items.length === 0){

      list.innerHTML = '<div class="fr-empty">No '+frActiveTab+' requests.</div>';

      return;

    }

    list.innerHTML = items.map(r => {

      let actions = '';

      if (frActiveTab === 'incoming'){

        actions = '<button class="fr-btn accept" data-fr-action="accept" data-fr-id="'+r.id+'" title="Accept"><i data-lucide="check" style="width:14px;height:14px"></i></button>'+

          '<button class="fr-btn reject" data-fr-action="reject" data-fr-id="'+r.id+'" title="Decline"><i data-lucide="x" style="width:14px;height:14px"></i></button>';

      } else {

        actions = '<span class="fr-pending">PENDING</span>'+

          '<button class="fr-btn cancel" data-fr-action="cancel" data-fr-id="'+r.id+'" title="Cancel"><i data-lucide="x" style="width:14px;height:14px"></i></button>';

      }

      const glow = (frActiveTab === 'incoming') ? ' has-glow' : '';

      return '<div class="fr-row'+glow+'" data-fr-name="'+escapeHtml(r.name)+'">'+

        '<div class="fr-av" style="background:'+r.avColor+'">'+r.initial+'</div>'+

        '<div class="fr-info"><div class="fr-name">'+escapeHtml(r.name)+'</div><div class="fr-meta">'+escapeHtml(r.handle)+' · '+escapeHtml(r.meta)+'</div></div>'+

        '<div class="fr-actions">'+actions+'</div>'+

      '</div>';

    }).join('');

    refreshIcons();

  }

  // ============== ACTIVITY TIMELINE ==============

  // Populated by the backend (notifications stream). Empty by default.

  const activityFeed = [];

  function renderActivityTimeline(){

    const el = document.getElementById('actTimeline');

    if (!el) return;

    el.innerHTML = activityFeed.map((a, i) => {

      let dataAttr = '';

      if (a.action.type === 'conv') dataAttr = 'data-act-conv="'+a.action.id+'"';

      else if (a.action.type === 'voice') dataAttr = 'data-act-voice="'+a.action.id+'"';

      else if (a.action.type === 'requests') dataAttr = 'data-act-requests="1"';

      return '<div class="act-tl-item" '+dataAttr+'>'+

        '<div class="act-tl-rail"><div class="act-tl-dot '+a.dotCls+'">'+a.dot+'</div></div>'+

        '<div class="act-tl-card">'+

          '<div class="act-tl-row1"><div class="act-tl-title">'+escapeHtml(a.title)+'</div><div class="act-tl-time">'+a.time+'</div></div>'+

          '<div class="act-tl-desc">'+escapeHtml(a.desc)+'</div>'+

        '</div>'+

      '</div>';

    }).join('');

  }

  // ============== SERVER RAILS (purple orb) ==============

  function buildServerRailHtml(){

    let html = '';

    html += '<button class="srv-orb gray" data-srv-action="create" title="Create or Join Server"><i data-lucide="plus" style="width:16px;height:16px"></i><span class="srv-orb-tip">Create / Join</span></button>';

    // The rail / sidebar shows every server the user is a member of,

    // regardless of pin state. Pinning is a "show on home" preference

    // only — unpinning a server keeps it accessible from the orb rail.

    // Order: pinned servers first (in the user's chosen order), then any

    // membership that isn't pinned, then the currently-open server if

    // it slipped through both lists.

    const ids = myServers.slice();

    Object.keys(servers).forEach(sid => {

      if (!ids.includes(sid)) ids.push(sid);

    });

    if (currentServer && servers[currentServer] && !ids.includes(currentServer)) ids.push(currentServer);

    ids.forEach(sid => {

      const s = servers[sid]; if (!s) return;

      const activeCls   = (currentServer === sid)   ? ' active'    : '';

      const pinnedCls   = myServers.includes(sid)   ? ' is-pinned' : '';

      const hasImg = s.emblemImage ? ' has-image' : '';

      const inner = s.emblemImage

        ? '<span class="srv-orb-img" style="background-image:url('+s.emblemImage+')"></span>'

        : s.initial;

      html += '<button class="srv-orb'+activeCls+pinnedCls+hasImg+'" data-srv-id="'+sid+'" style="--srv-grad:'+s.grad+';--srv-glow:'+s.glow+'">'+inner+'<span class="srv-orb-tip">'+s.name+'</span></button>';

    });

    return html;

  }

  function renderServerRails(){

    document.getElementById('homeServerRail').innerHTML = buildServerRailHtml();

    document.getElementById('worldServerRail').innerHTML = buildServerRailHtml();

    const dmsRail = document.getElementById('dmsServerRail');

    if (dmsRail) dmsRail.innerHTML = buildServerRailHtml();

    refreshIcons();

  }

  let dmsRailOpen = false;

  // The purple-orb server rail is a single shared piece of state across the

  // home, dms and world page headers. Toggling it on any page mirrors to all

  // three so the user doesn't need to re-open it after switching tabs.

  function applyRailState(){

    const open = !!railOpen;

    [

      ['homePurpleOrb','homeDefaultText','homeServerRail'],

      ['dmsPurpleOrb','dmsDefaultText','dmsServerRail'],

      ['worldPurpleOrb','worldDefaultText','worldServerRail']

    ].forEach(([orbId, txtId, railId]) => {

      const orb  = document.getElementById(orbId);

      const txt  = document.getElementById(txtId);

      const rail = document.getElementById(railId);

      if (orb)  orb.classList.toggle('active', open);

      if (txt)  txt.classList.toggle('hidden', open);

      if (rail) rail.classList.toggle('open', open);

    });

    homeRailOpen = open;

    dmsRailOpen  = open;

    worldRailOpen = open;

  }

  let railOpen = false;

  function setRailOpen(v){ railOpen = !!v; applyRailState(); }

  function toggleDmsRail(){ setRailOpen(!railOpen); }

  function toggleHomeRail(){ setRailOpen(!railOpen); }

  function toggleWorldRail(){ setRailOpen(!railOpen); }

  function closeWorldRail(){ setRailOpen(false); }

  // ============== SERVER OVERVIEW (store-like) ==============

  let currentTextChannel = null; // when null, server-main is shown

  // ============== ROLES ==============

  const PERMISSIONS = [

    { key:'manageCategory',  name:'Create / edit categories',     desc:'Add new categories and edit existing ones.' },

    { key:'manageTextCh',    name:'Create text channels',          desc:'Create or delete text channels.' },

    { key:'manageVoiceCh',   name:'Create voice orbs',             desc:'Create or delete voice channels.' },

    { key:'kickFromVoice',   name:'Kick from voice channel',       desc:'Disconnect users from a voice channel.' },

    { key:'kickFromServer',  name:'Remove members from server',    desc:'Kick users from this server.' },

    { key:'managePins',      name:'Pin / unpin messages',          desc:'Pin messages in channels and server.' },

    { key:'manageRoles',     name:'Manage roles',                  desc:'Create roles and assign permissions.' }

  ];

  // Debounced + coalesced "save the whole role list" call. Most role editor

  // interactions (toggle a permission, drag in a member, rename, recolor)

  // mutate s.roles synchronously and re-render. We schedule a single PUT

  // /servers/:sid/roles a moment later so a burst of edits collapses into

  // one round trip. Failures surface a toast but never block the UI.

  const _rolesSaveTimers = new Map();

  function persistRoles(s){

    if (!s || !s.id) return;

    if (!backend.isConfigured()) return;

    const sid = s.id;

    clearTimeout(_rolesSaveTimers.get(sid));

    _rolesSaveTimers.set(sid, setTimeout(()=>{

      const payload = (s.roles || []).map(r => ({

        id: r.id,

        name: r.name,

        color: r.color || null,

        system: !!r.system,

        position: r.position || 0,

        perms: r.perms || {},

        members: Array.from(new Set(r.members || []))

      }));

      backend.servers.saveRoles(sid, payload).catch(()=>{

        showToast('Could not save roles — try again','warn');

      });

    }, 350));

  }

  function ensureRoles(s){

    if (!s.roles){

      // Owner: holds every permission; exactly one user; cannot be deleted; can be transferred.

      // Admin: configurable permissions (defaults to all). Other roles can be added by users with manageRoles.

      // We deliberately do NOT model 'Member' as a role - members without any role just get baseline access.

      const owner = (s.admins && s.admins[0]) || selfProfile.name;

      s.roles = [

        { id:'owner',  name:'Owner',  color:'#fde68a', system:true,  members:[owner], perms:Object.fromEntries(PERMISSIONS.map(p=>[p.key,true])) },

        { id:'admin',  name:'Admin',  color:'#f59e0b', members:s.admins.filter(m=>m!==owner), perms:Object.fromEntries(PERMISSIONS.map(p=>[p.key,true])) }

      ];

    }

    // Repair pass: enforce single Owner, enforce exactly-one-role-per-member, drop legacy Member role.

    s.roles = (s.roles||[]).filter(r => r.id !== 'member');

    let owner = s.roles.find(r => r.id === 'owner');

    if (!owner){

      const ownerName = (s.admins && s.admins[0]) || selfProfile.name;

      owner = { id:'owner', name:'Owner', color:'#fde68a', system:true, members:[ownerName], perms:Object.fromEntries(PERMISSIONS.map(p=>[p.key,true])) };

      s.roles.unshift(owner);

    }

    owner.system = true;

    owner.perms = Object.fromEntries(PERMISSIONS.map(p=>[p.key,true]));

    if (!owner.members || owner.members.length !== 1) owner.members = [(owner.members && owner.members[0]) || (s.admins && s.admins[0]) || selfProfile.name];

    const ownerName = owner.members[0];

    // Owner must not appear in any other role.

    s.roles.forEach(r => { if (r !== owner) r.members = (r.members||[]).filter(m => m !== ownerName); });

    return s.roles;

  }

  // Look up the highest-priority role for a member (owner > admin > others). Returns null if no role.

  // Every role this member holds, in role-priority order (top of s.roles

  // list = highest priority). A member can hold multiple roles; permissions

  // are the union, but the "primary" role for grouping/coloring is the

  // first one in the list.

  function getMemberRoles(s, name){

    if (!s || !s.roles) return [];

    return s.roles.filter(r => (r.members||[]).includes(name));

  }

  // Single best role — used by anything that just needs a colour or label

  // (member list grouping, name colour). Equivalent to "highest priority

  // role this member holds".

  function getMemberRole(s, name){

    return getMemberRoles(s, name)[0] || null;

  }

  function memberHasPerm(s, name, key){

    // Owner + admin (anyone in s.admins) always passes. Without this, a

    // momentarily-empty s.roles (snapshot in flight, role list got reset

    // by a buggy save, etc.) would briefly strip every admin permission

    // and leave the user staring at "Server identity" as their only

    // banner-menu option even though they're the server owner.

    if (s && Array.isArray(s.admins) && s.admins.includes(name)) return true;

    // Permissions are unioned across every role the member holds, so

    // adding a side role with a single permission grants exactly that

    // permission without overriding anything else.

    const roles = getMemberRoles(s, name);

    return roles.some(r => r && r.perms && r.perms[key]);

  }

  // Same as memberHasPerm but consults the per-channel allow/deny maps too.

  // Used for permissions that make sense per-channel (sendMessages mostly).

  // Owner + admin always pass. Deny beats allow on the same role.

  function memberHasPermInChannel(s, name, key, entity){

    if (s && Array.isArray(s.admins) && s.admins.includes(name)) return true;

    const roles = getMemberRoles(s, name);

    // Server-wide grant from any role.

    let granted = roles.some(r => r && r.perms && r.perms[key]);

    if (entity){

      const allow = entity.permissionAllow || {};

      const deny  = entity.permissionDeny  || {};

      for (const r of roles){

        if (Array.isArray(allow[r.id]) && allow[r.id].includes(key)) { granted = true; break; }

      }

      for (const r of roles){

        if (Array.isArray(deny[r.id]) && deny[r.id].includes(key))  { granted = false; break; }

      }

    }

    // sendMessages defaults to allowed for everyone — only an explicit deny

    // turns it off. Other keys default to "no" (the role-grant check above).

    if (key === 'sendMessages' && entity){

      const deny = entity.permissionDeny || {};

      let denied = false;

      for (const r of roles){

        if (Array.isArray(deny[r.id]) && deny[r.id].includes('sendMessages')) { denied = true; break; }

      }

      if (!denied) granted = true;

      const allow = entity.permissionAllow || {};

      // Allow on a role overrides deny on the same role.

      for (const r of roles){

        if (Array.isArray(allow[r.id]) && allow[r.id].includes('sendMessages')) { granted = true; break; }

      }

    }

    return granted;

  }

  // Whether the given member can see an entity (category/textChannel/voiceChannel).

  // Per-user collapsed-category state, persisted in localStorage so it

  // survives reloads. Keyed by serverId so collapsing a category in one

  // server doesn't affect another. Admins / non-admins both can collapse

  // — it's purely a personal layout preference, never sent to the server.

  const COLLAPSE_KEY = 'orblood:collapsed-cats:v1';

  function _readCollapsedCats(){

    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}') || {}; }

    catch(_){ return {}; }

  }

  function _writeCollapsedCats(map){

    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map || {})); } catch(_){}

  }

  function isCategoryCollapsed(serverId, catId){

    if (!serverId || !catId) return false;

    const map = _readCollapsedCats();

    const set = map[serverId];

    return !!(set && set[catId]);

  }

  function toggleCategoryCollapsed(serverId, catId){

    if (!serverId || !catId) return;

    const map = _readCollapsedCats();

    map[serverId] = map[serverId] || {};

    map[serverId][catId] = !map[serverId][catId];

    if (!map[serverId][catId]) delete map[serverId][catId];

    _writeCollapsedCats(map);

  }

  // entity.visibleRoleIds is null/empty -> visible to everyone. Owner + admins always pass.

  function memberCanSee(s, name, entity){

    if (!entity) return false;

    const allow = entity.visibleRoleIds;

    if (!allow || !allow.length) return true;

    // Multi-role: the member can see the entity if ANY of their roles is

    // in the allowed set. Owner + admin always pass.

    const roles = getMemberRoles(s, name);

    if (!roles.length) return false;

    if (roles.some(r => r.id === 'owner' || r.id === 'admin')) return true;

    return roles.some(r => allow.includes(r.id));

  }

  // Find the category that owns this channel, if any. Both text + voice

  // channels live inside `s.categories[].textChannels` / `voiceChannels`

  // arrays of ids; a missing parent means the channel is uncategorised

  // and its visibility is judged purely by its own visibleRoleIds.

  function _findParentCategory(s, channelId){

    if (!s || !channelId) return null;

    return (s.categories || []).find(cat =>

      (cat.textChannels  && cat.textChannels.includes(channelId)) ||

      (cat.voiceChannels && cat.voiceChannels.includes(channelId))

    ) || null;

  }

  // Cascading visibility: a channel inherits its category's restriction.

  // If the parent category limits itself to a role and the user doesn't

  // hold any of those roles, every channel inside the category is hidden

  // — even the unrestricted ones. The channel can still tighten further

  // with its own visibleRoleIds, but it can't loosen what its parent has.

  // Owner / admin always pass.

  function memberCanSeeChannelCascaded(s, name, channel){

    if (!channel) return false;

    if (s && Array.isArray(s.admins) && s.admins.includes(name)) return true;

    const parent = _findParentCategory(s, channel.id);

    if (parent && !memberCanSee(s, name, parent)) return false;

    return memberCanSee(s, name, channel);

  }

  // True when the entity has any kind of access restriction baked in —

  // visibleRoleIds non-empty, or any per-role allow/deny override. Used

  // purely to decide whether to draw a small lock chip next to the

  // channel/category name so admins can spot private rooms at a glance.

  function isEntityRestricted(entity){

    if (!entity) return false;

    if (Array.isArray(entity.visibleRoleIds) && entity.visibleRoleIds.length) return true;

    const a = entity.permissionAllow;

    const d = entity.permissionDeny;

    if (a && typeof a === 'object' && Object.keys(a).length) return true;

    if (d && typeof d === 'object' && Object.keys(d).length) return true;

    return false;

  }

  // Renders the inline lock chip next to a private channel name. Only the

  // server owner / admins / users with manageRoles see it — for everyone

  // else a private channel they can't access is hidden anyway, and the

  // ones they CAN access shouldn't broadcast their privacy.

  function _privateLockHtml(s, entity){

    if (!isEntityRestricted(entity)) return '';

    const me = selfProfile && selfProfile.name;

    if (!me) return '';

    const isAdmin = (s && Array.isArray(s.admins) && s.admins.includes(me));

    const canManage = isAdmin || memberHasPerm(s, me, 'manageRoles');

    if (!canManage) return '';

    return '<span class="priv-lock" title="Restricted access"><i data-lucide="lock" style="width:11px;height:11px"></i></span>';

  }

  // Find {server, vc} for a given voice channelData key (e.g. 'endurance', 'coop', 'custom-...').

  function findVoiceChannelByKey(chKey){

    for (const sid in servers){

      const s = servers[sid];

      const vc = (s.voiceChannels||[]).find(v => {

        const k = vcChannelKey(v);

        return k === chKey;

      });

      if (vc) return { server:s, vc };

    }

    return null;

  }

  // Whether the user can see a voice channel by its channelData key.

  function canSeeVoiceKey(chKey){

    const found = findVoiceChannelByKey(chKey);

    if (!found) return true; // unowned/default channels are public

    // Cascade through the parent category so a public voice orb that

    // sits inside a category restricted to "Mods" gets hidden from

    // members without the role. Without the cascade the orb would still

    // surface in the home rail / orb slides even though the parent

    // category is hidden in the server view.

    return memberCanSeeChannelCascaded(found.server, selfProfile.name, found.vc);

  }

  let serverChannelMessages = {}; // channelId -> [{user,text,time,av}]

  function setServerView(mode){

    // mode: 'feed' (no server), 'main' (server overview), 'channel' (text channel chat)

    const dv = document.getElementById('worldDefaultView');

    const ov = document.getElementById('serverOverview');

    const cv = document.getElementById('wsChannelView');

    const strip = document.getElementById('wsChannelStrip');

    const goBtn = document.getElementById('worldGoServerMain');

    if (mode === 'feed'){

      dv.style.display = 'flex';

      ov.style.display = 'none';

      cv.style.display = 'none';

      strip.style.display = 'none';

      goBtn.style.display = 'none';

    } else if (mode === 'main'){

      dv.style.display = 'none';

      ov.style.display = 'flex';

      cv.style.display = 'none';

      strip.style.display = 'none';

      goBtn.style.display = 'flex';

    } else if (mode === 'channel'){

      dv.style.display = 'none';

      ov.style.display = 'none';

      cv.style.display = 'flex';

      strip.style.display = 'flex';

      goBtn.style.display = 'flex';

    }

  }

  // ============== SERVER CLEANUP ==============

  // Removes every dangling reference to a server the user no longer belongs to:

  // marked orbits, marked text channels, in-flight share state, and any cached

  // forwarded messages that point at it. Call this whenever Cooper leaves or

  // deletes a server.

  function purgeServerReferences(sid){

    const s = servers[sid];

    if (!s) return;

    // 1) Marked voice orbs that lived in this server.

    const orbKeys = (s.voiceChannels||[]).map(v => vcChannelKey(v));

    if (orbKeys.length){

      marked = marked.filter(k => !orbKeys.includes(k));

      persistMarkedOrbits();

      if (lastJoinedChannel && orbKeys.includes(lastJoinedChannel)){

        lastJoinedChannel = null;

        try { localStorage.removeItem('orblood:lastJoined'); } catch(_){}

      }

    }

    // 2) Marked text channels keyed by serverId__channelId.

    markedTextChannels = markedTextChannels.filter(k => !k.startsWith(sid+'__'));

    persistMarkedTextChannels();

    // 3) Cached channel chat history.

    Object.keys(serverChannelMessages).forEach(k => { if (k.startsWith(sid+'__')) delete serverChannelMessages[k]; });

    // 4) Strip server/channel cards out of every DM thread so the user can't

    //    reshare a server they're no longer part of.

    Object.keys(messages).forEach(k => {

      const list = messages[k]; if (!Array.isArray(list)) return;

      messages[k] = list.filter(m => {

        if (m.type === 'serverCard' && m.serverCard && m.serverCard.id === sid) return false;

        if (m.type === 'channelCard' && m.channelCard && m.channelCard.serverId === sid) return false;

        return true;

      });

    });

  }

  function selectServer(sid){

    currentServer = sid;

    currentTextChannel = null;

    const s = servers[sid];

    if (!s){

      setServerView('feed');

      document.getElementById('worldHeaderTitle').textContent = '// WORLD';

      document.getElementById('worldHeaderSub').textContent = 'Public broadcast — all stations';

      return;

    }

    // Persist the last opened server so reload lands here again, not on

    // the empty "create or join" state.

    try { localStorage.setItem('orblood:lastServer', sid); } catch(_){}

    // Make sure roles + perms are materialised before render so admin-only buttons appear.

    ensureRoles(s);

    isAdmin = (s.admins||[]).includes(selfProfile.name);

    setServerView('main');

    document.getElementById('worldHeaderTitle').textContent = '// '+s.name;

    document.getElementById('worldHeaderSub').textContent = s.members.length+' members · '+s.textChannels.length+' channels';

    renderServerOverview();

    renderServerRails();

    if (membersOpen) renderMembers();

    if (voiceUsersSidebarOpen) renderVoiceUsers();

    if (typeof syncWorldPinBtn === 'function') syncWorldPinBtn();

  }

  function goToServerMain(){

    if (!currentServer) return;

    currentTextChannel = null;

    setServerView('main');

    const s = servers[currentServer];

    document.getElementById('worldHeaderTitle').textContent = '// '+s.name;

    document.getElementById('worldHeaderSub').textContent = s.members.length+' members · '+s.textChannels.length+' channels';

    renderServerOverview();

  }

  function openTextChannel(tcId){

    if (!currentServer) return;

    const s = servers[currentServer];

    const tc = s.textChannels.find(c => c.id === tcId);

    if (!tc) return;

    currentTextChannel = tcId;

    if (tc.unread){ tc.unread = 0; updateBadges(); if (typeof renderMarkedPanel === 'function') renderMarkedPanel(); }

    // Persist the read marker so the unread count doesn't reset to >0 on

    // the next reload.

    if (backend.isConfigured()){

      backend.servers.markChannelRead(currentServer, tcId).catch(()=>{});

    }

    setServerView('channel');

    document.getElementById('worldHeaderTitle').innerHTML = '// '+s.name+' <span style="opacity:0.55"> · </span><span style="color:var(--accent)">#'+escapeHtml(tc.name)+'</span>';

    document.getElementById('worldHeaderSub').textContent = 'Text channel · '+s.members.length+' members';

    renderChannelStrip();

    renderChannelView();

    // Fetch the canonical message history from the backend so newly-joined

    // members (or anyone who reloaded the tab) see what's already been said

    // in this channel.

    if (backend.isConfigured()){

      const sid = currentServer, cid = tcId;

      backend.servers.listChannelMessages(sid, cid).then(r => {

        if (r && r.messages && Array.isArray(r.messages)){

          r.messages.forEach(_expandChannelMessage);

          serverChannelMessages[sid+'__'+cid] = r.messages;

          if (currentServer === sid && currentTextChannel === cid) renderChannelView();

        }

      }).catch(()=>{});

    }

  }

  function renderChannelStrip(){

    if (!currentServer) return;

    const s = servers[currentServer];

    const strip = document.getElementById('wsChannelStrip');

    let html = '';

    html += '<button class="ws-channel-strip-back" id="wsBackToMain"><i data-lucide="layout-grid" style="width:11px;height:11px"></i>MAIN</button>';

    html += '<div class="ws-channel-strip-sep"></div>';

    s.textChannels.forEach(tc => {

      // Cascade through the parent category — a channel inside a hidden

      // category disappears even if its own visibleRoleIds are open.

      if (!memberCanSeeChannelCascaded(s,selfProfile.name,tc)) return;

      const active = tc.id === currentTextChannel;

      html += '<button class="ws-channel-pill'+(active?' active':'')+'" data-strip-tc="'+tc.id+'"><i data-lucide="hash"></i>'+escapeHtml(tc.name)+_privateLockHtml(s, tc)+(tc.unread?'<span class="ws-channel-pill-badge">'+tc.unread+'</span>':'')+'</button>';

    });

    html += '<div style="flex:1"></div><button class="ws-channel-strip-back" id="wsChannelMore" title="Channel actions"><i data-lucide="more-vertical" style="width:11px;height:11px"></i></button>';

    strip.innerHTML = html;

    refreshIcons();

    document.getElementById('wsBackToMain').addEventListener('click', goToServerMain);

    document.getElementById('wsChannelMore').addEventListener('click', e => {

      e.stopPropagation();

      const items = [

        { icon:'check-square', label:'Select messages', action:enterChSelectMode },

        { icon:'eraser',       label:'Clear channel',   action:()=>{ appConfirm('Clear all messages in this channel?', {title:'CLEAR CHANNEL', confirmLabel:'CLEAR', danger:true}).then(ok => { if (!ok) return; const k = currentServer+'__'+currentTextChannel; serverChannelMessages[k] = []; renderChannelView(); showToast('Channel cleared','warn'); }); } }

      ];

      openPortalMenu(e.currentTarget, items);

    });

    strip.querySelectorAll('[data-strip-tc]').forEach(b => b.addEventListener('click', () => openTextChannel(b.dataset.stripTc)));

  }

  let chReplyTo = null; // id of channel msg being replied to

  let chSelectMode = false;

  const chSelectedIds = new Set();

  function enterChSelectMode(){

    chSelectMode = true;

    chSelectedIds.clear();

    document.getElementById('wsChannelView').classList.add('select-mode');

    document.querySelectorAll('.ws-msg.is-selected').forEach(el => el.classList.remove('is-selected'));

    renderChSelectionBar();

  }

  function exitChSelectMode(){

    chSelectMode = false;

    chSelectedIds.clear();

    document.getElementById('wsChannelView').classList.remove('select-mode');

    document.querySelectorAll('.ws-msg.is-selected').forEach(el => el.classList.remove('is-selected'));

    renderChSelectionBar();

  }

  function toggleChSelect(id){

    const key = String(id);

    if (chSelectedIds.has(key)) chSelectedIds.delete(key);

    else chSelectedIds.add(key);

    if (chSelectMode && chSelectedIds.size === 0){ exitChSelectMode(); return; }

    const row = document.querySelector('.ws-msg[data-ch-msg="'+key+'"]');

    if (row) row.classList.toggle('is-selected', chSelectedIds.has(key));

    renderChSelectionBar();

  }

  function deleteSelectedCh(){

    if (!currentServer || !currentTextChannel || !chSelectedIds.size) return;

    const k = currentServer+'__'+currentTextChannel;

    const sid = currentServer, cid = currentTextChannel;

    const ids = Array.from(chSelectedIds);

    if (backend.isConfigured()){

      ids.forEach(id => {

        if (typeof id === 'number'){

          backend.servers.delChannelMessage(sid, cid, id).catch(()=>{});

        }

      });

    }

    serverChannelMessages[k] = (serverChannelMessages[k]||[]).filter(m => !chSelectedIds.has(String(m.id)));

    showToast(ids.length+' message(s) deleted','warn');

    exitChSelectMode();

    renderChannelView();

  }

  function renderChSelectionBar(){

    let bar = document.getElementById('chSelectionBar');

    if (!chSelectMode){ if (bar) bar.style.display = 'none'; return; }

    if (!bar){

      bar = document.createElement('div');

      bar.id = 'chSelectionBar';

      bar.className = 'dm-selection-bar';

      bar.innerHTML =

        '<button class="dm-sel-cancel" id="chSelCancel"><i data-lucide="x" style="width:13px;height:13px"></i></button>'+

        '<div class="dm-sel-count" id="chSelCount">0 selected</div>'+

        '<button class="dm-sel-delete" id="chSelDelete"><i data-lucide="trash-2" style="width:13px;height:13px"></i>DELETE</button>';

      const view = document.getElementById('wsChannelView');

      view.insertBefore(bar, view.firstChild);

      document.getElementById('chSelCancel').addEventListener('click', exitChSelectMode);

      document.getElementById('chSelDelete').addEventListener('click', deleteSelectedCh);

      refreshIcons();

    }

    bar.style.display = 'flex';

    document.getElementById('chSelCount').textContent = chSelectedIds.size + ' selected';

  }

  function renderChannelView(){

    const wrap = document.getElementById('wsChannelMsgs');

    const s = servers[currentServer];

    const tc = s.textChannels.find(c => c.id === currentTextChannel);

    const key = currentServer+'__'+currentTextChannel;

    // First time we open this channel locally we just initialise an empty

    // buffer; the real history streams in from /api/channels/text/.../

    // messages on demand. Previously we seeded two fake "Welcome" / "Got

    // it" bubbles which the server feed then nuked on the next render —

    // that two-frame ghost is what looked like "the page is reloading"

    // when entering a text channel.

    let msgs = serverChannelMessages[key];

    if (!msgs){

      msgs = [];

      serverChannelMessages[key] = msgs;

    }

    let html = '';

    // Pinned message banner at top

    if (tc.pinnedMsgId){

      const pinIdStr = String(tc.pinnedMsgId);

      const pm = msgs.find(x => String(x.id) === pinIdStr);

      if (pm){

        const xBtn = (memberHasPerm(s,selfProfile.name,'managePins')) ? '<button class="ws-pin-x" data-ch-pin-x="'+pm.id+'" title="Unpin"><i data-lucide="x" style="width:11px;height:11px"></i></button>' : '';

        html += '<div class="ws-cat-pin" style="margin-bottom:12px"><div class="ws-cat-pin-i"><i data-lucide="pin" style="width:11px;height:11px"></i></div><div class="ws-cat-pin-info"><div class="ws-cat-pin-l">PINNED · '+escapeHtml(tc.pinnedBy||'')+'</div><div class="ws-cat-pin-text">'+escapeHtml((pm.text||'(image)').slice(0,200))+'</div></div>'+xBtn+'</div>';

      }

    }

    if (msgs.length === 0){

      html = '<div class="ws-channel-empty"><i data-lucide="hash"></i>No messages in #'+escapeHtml(tc.name)+' yet.<br>Be the first to break the silence.</div>';

    } else {

      msgs.forEach(m => {

        if (!m.id) m.id = Date.now()+Math.floor(Math.random()*1000);

        const avRes = resolveUserAvatar(m.user);

        const isMine = m.user === selfProfile.name;

        let replyPrev = '';

        if (m.replyTo){

          const orig = msgs.find(x => String(x.id) === String(m.replyTo));

          if (orig){

            const txt = orig.deleted ? 'Message deleted' : (orig.text||'').slice(0,80);

            replyPrev = '<div class="ws-msg-reply"><div class="wsr-name">'+escapeHtml(orig.user)+'</div><div class="wsr-text">'+escapeHtml(txt)+'</div></div>';

          }

        }

        let body;

        if (m.deleted){

          body = '<div class="ws-msg-text deleted">Message deleted</div>';

        } else if (m.type === 'serverCard' && m.serverCard){

          body = '<div class="ws-msg-text" style="padding:0;background:transparent;border:none">'+renderServerCardHtml(m.serverCard)+'</div>';

        } else if (m.type === 'channelCard' && m.channelCard){

          body = '<div class="ws-msg-text" style="padding:0;background:transparent;border:none">'+renderChannelCardHtml(m.channelCard)+'</div>';

        } else if (m.type === 'userCard' && m.userCard){

          body = '<div class="ws-msg-text" style="padding:0;background:transparent;border:none">'+renderUserCardHtml(m.userCard)+'</div>';

        } else if (m.type === 'image' && m.src){

          // Match the DM image bubble: tap the picture to open the lightbox

          // viewer, contained max size + padding wrapper so it sits cleanly

          // inside the channel feed.

          body = '<div class="ws-msg-text image-msg"><img src="'+m.src+'" alt="" data-ch-img="'+m.id+'" /></div>';

          if (m.text) body += '<div class="ws-msg-text" style="margin-top:4px">'+escapeHtml(m.text)+'</div>';

        } else {

          body = '<div class="ws-msg-text">'+escapeHtml(m.text)+'</div>';

        }

        const selCls = (chSelectMode && chSelectedIds.has(String(m.id))) ? ' is-selected' : '';

        html += '<div class="ws-msg'+selCls+'" data-ch-msg="'+m.id+'" data-mine="'+(isMine?'1':'0')+'"><div class="ws-msg-av" style="background:'+avRes.bg+'">'+(avRes.isImage?'':escapeHtml(avRes.text))+'</div>'+

          '<div class="ws-msg-body">'+

            '<div class="ws-msg-head"><span class="ws-msg-name">'+escapeHtml(m.user)+'</span><span class="ws-msg-time">'+escapeHtml(fmtMessageTime(m.time))+'</span></div>'+

            replyPrev + body +

          '</div>'+

          '<div class="ws-msg-actions">'+

            '<button class="ws-msg-act" data-ch-action="reply" data-ch-id="'+m.id+'" title="Reply"><i data-lucide="reply" style="width:12px;height:12px"></i></button>'+

            (!m.deleted ? '<button class="ws-msg-act" data-ch-action="forward" data-ch-id="'+m.id+'" title="Forward"><i data-lucide="share-2" style="width:12px;height:12px"></i></button>' : '') +

            (m.type !== 'image' && !m.deleted ? '<button class="ws-msg-act" data-ch-action="copy" data-ch-id="'+m.id+'" title="Copy"><i data-lucide="copy" style="width:12px;height:12px"></i></button>' : '') +

            (memberHasPerm(s,selfProfile.name,'managePins') && !m.deleted ? (function(){ const isPin = String(tc.pinnedMsgId||'')===String(m.id); return '<button class="ws-msg-act" data-ch-action="pin" data-ch-id="'+m.id+'" title="'+(isPin?'Unpin':'Pin')+'"><i data-lucide="pin" style="width:12px;height:12px;color:'+(isPin?'var(--warn)':'')+'"></i></button>'; })() : '') +

            (isMine && !m.deleted ? '<button class="ws-msg-act danger" data-ch-action="delete" data-ch-id="'+m.id+'" title="Delete"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button>' : '') +

          '</div>'+

        '</div>';

      });

    }

    wrap.innerHTML = html;

    document.getElementById('wsChannelInputLabel').textContent = '#'+tc.name.toUpperCase();

    document.getElementById('wsChannelInput').placeholder = 'Message #'+tc.name+'...';

    // Render reply preview above input

    renderChannelReplyPreview();

    refreshIcons();

    wrap.scrollTop = wrap.scrollHeight;

  }

  function renderChannelReplyPreview(){

    const prev = document.getElementById('wsReplyPreview');

    if (!prev) return;

    if (!chReplyTo){ prev.style.display = 'none'; prev.innerHTML = ''; return; }

    const key = currentServer+'__'+currentTextChannel;

    const msgs = serverChannelMessages[key] || [];

    const orig = msgs.find(x => String(x.id) === String(chReplyTo));

    if (!orig){ chReplyTo = null; prev.style.display = 'none'; return; }

    prev.style.display = 'flex';

    prev.innerHTML = '<div class="ws-rp-bar"></div><div class="ws-rp-info"><div class="ws-rp-l"><i data-lucide="reply" style="width:10px;height:10px"></i>Replying to <b>'+escapeHtml(orig.user)+'</b></div><div class="ws-rp-text">'+escapeHtml((orig.text||'').slice(0,90))+'</div></div><button class="ws-rp-x" id="wsRpCancel"><i data-lucide="x" style="width:12px;height:12px"></i></button>';

    refreshIcons();

    document.getElementById('wsRpCancel').addEventListener('click', () => { chReplyTo = null; renderChannelReplyPreview(); });

  }

  function renderServerOverview(){

    if (!currentServer) return;

    const s = servers[currentServer];

    if (!s) return;

    // ensureRoles is idempotent — safe to call before every render so the

    // owner / admin lookups (and the buttons gated by memberHasPerm) survive

    // any state replacement that just dropped s.roles, e.g. _onServerUpdated.

    ensureRoles(s);

    const ov = document.getElementById('serverOverview');

    let html = '';

    // BANNER (with optional cover image, faded at bottom — no neon border)

    const _coverPackCls = s.styleCover ? ' ' + packClassFor(s.styleCover, 'serverCover') : '';

    const _emblemPackCls = s.styleEmblem ? ' ' + packClassFor(s.styleEmblem, 'serverEmblem') : '';

    html += '<div class="ws-banner'+_coverPackCls+'" style="--srv-banner-c1:'+s.bannerC1+';--srv-banner-c2:'+s.bannerC2+'">';

    // Render a cover layer when there's an image OR when a cover pack

    // is active (the pack needs a host element to paint on).

    if (s.cover) {

      html += '<div class="ws-banner-cover" style="background-image:url('+s.cover+')"></div>';

    } else if (s.styleCover){

      html += '<div class="ws-banner-cover ws-banner-cover-empty"></div>';

    }

    const emblemSrc = s.emblemImage || null;

    const emblemImg = emblemSrc ? '<div class="ws-emblem-img" style="background-image:url('+emblemSrc+')"></div>' : '';

    const emblemContent = emblemSrc ? emblemImg : s.initial;

    const emblemCls = 'ws-emblem'+(emblemSrc?' has-image':'')+_emblemPackCls;

    html += '<div class="ws-emblem-wrap"><div class="'+emblemCls+'" style="--srv-grad:'+s.grad+';--srv-glow:'+s.glow+'">'+emblemContent+'</div>'+

    '</div>';

    const _styleNameCls = s.styleName ? ' ' + packClassFor(s.styleName, 'serverName') : '';

    html += '<div class="ws-banner-info">'+

        '<div class="ws-banner-eyebrow">SERVER · '+s.members.length+' MEMBERS · '+s.admins.length+' ADMINS</div>'+

        '<div class="ws-banner-title'+_styleNameCls+'">'+escapeHtml(s.name)+'</div>'+

        '<div class="ws-banner-desc">'+escapeHtml(s.desc)+'</div>'+

        '<div class="ws-banner-stats">'+

          '<div class="ws-bs"><i data-lucide="users"></i>'+s.members.length+' MEMBERS</div>'+

          '<div class="ws-bs live"><i data-lucide="radio"></i>'+(Math.floor(s.members.length*0.4))+' ONLINE</div>'+

          '<div class="ws-bs"><i data-lucide="hash"></i>'+s.textChannels.length+' TEXT</div>'+

          '<div class="ws-bs"><i data-lucide="orbit"></i>'+s.voiceChannels.length+' VOICE</div>'+

        '</div>'+

      '</div>';

    // Banner top-right action cluster: share for everyone; leave only for non-owners; settings only for admins.

    const isOwnerHere = s.admins.includes(selfProfile.name);

    html += '<div class="ws-banner-actions">';

    html += '<button class="ws-banner-share-btn" data-srv-action="share" title="Share server"><i data-lucide="share-2" style="width:13px;height:13px"></i></button>';

    // Customize: opens the pack library + per-surface picker. Available

    // to anyone who can manage the server identity (owner or manageServer).

    if (isOwnerHere || memberHasPerm(s,selfProfile.name,'manageServer')){

      html += '<button class="ws-banner-share-btn" data-srv-action="customize" title="Customize"><i data-lucide="palette" style="width:13px;height:13px"></i></button>';

    }

    if (!isOwnerHere){

      html += '<button class="ws-banner-leave-btn" data-srv-action="leave" title="Leave server"><i data-lucide="log-out" style="width:13px;height:13px"></i></button>';

    }

    // Show the server-settings cog whenever the user has *any* admin-style

    // permission on this server. This makes the gear act as the entry point

    // for create-channel / create-category / roles / pins / identity, and any

    // of those individually-gated submenus will hide actions the user can't

    // do once the menu opens.

    const canSeeSettings = ['manageRoles','manageCategory','manageTextCh','manageVoiceCh','managePins','manageServer'].some(p => memberHasPerm(s, selfProfile.name, p));

    if (isOwnerHere || canSeeSettings){

      html += '<button class="ws-banner-menu-btn" data-srv-action="banner-menu-toggle" title="Server settings"><i data-lucide="settings" style="width:14px;height:14px"></i></button>';

    }

    html += '</div>';

    html += '</div>';

    // PINNED — server-level (separate from channel-level) with neon wave

    const _stylePinCls = s.stylePin ? ' ' + packClassFor(s.stylePin, 'serverPin') : '';

    if (s.pinned){

      html += '<div class="ws-pinned-box has-neon'+_stylePinCls+'">'+

        '<div class="neon-border warm"></div>'+

        '<div class="ws-pin-icon"><i data-lucide="pin" style="width:14px;height:14px"></i></div>'+

        '<div class="ws-pin-info">'+

          '<div class="ws-pin-l"><i data-lucide="pin" style="width:9px;height:9px"></i>SERVER PIN</div>'+

          '<div class="ws-pin-text">'+escapeHtml(s.pinned.text)+'</div>'+

          '<div class="ws-pin-by">— '+escapeHtml(s.pinned.by)+' · '+escapeHtml(s.pinned.time)+'</div>'+

        '</div>'+

        (memberHasPerm(s,selfProfile.name,'managePins') ? '<button class="ws-pin-add" data-srv-action="addpin"><i data-lucide="edit-2" style="width:9px;height:9px"></i>EDIT</button>' : '')+

      '</div>';

    } else if (memberHasPerm(s,selfProfile.name,'managePins')){

      html += '<div class="ws-pinned-box'+_stylePinCls+'" style="opacity:0.7">'+

        '<div class="ws-pin-icon"><i data-lucide="pin" style="width:14px;height:14px"></i></div>'+

        '<div class="ws-pin-info"><div class="ws-pin-l">SERVER PIN</div><div class="ws-pin-text" style="color:var(--t3);font-style:italic">No pinned message yet.</div></div>'+

        '<button class="ws-pin-add" data-srv-action="addpin"><i data-lucide="plus" style="width:9px;height:9px"></i>PIN</button>'+

      '</div>';

    }

    // CATEGORIES — 3-col grid; each category can span 1, 2 or 3 columns

    if (s.categories && s.categories.length){

      html += '<div class="ws-cats-grid">';

      const canManageCat = memberHasPerm(s,selfProfile.name,'manageCategory');

      const canManageTc  = memberHasPerm(s,selfProfile.name,'manageTextCh');

      s.categories.forEach(cat => {

        if (!memberCanSee(s,selfProfile.name,cat)) return;

        const span = cat.span || 1;

        const spanCls = span === 2 ? ' span-2' : span === 3 ? ' span-3' : '';

        const catDrag = canManageCat ? ' draggable="true"' : '';

        // Per-user collapse — purely a local-storage flag. Each user can

        // hide categories they don't care about; admins still see them.

        const collapsed = isCategoryCollapsed(currentServer, cat.id);

        const collapsedCls = collapsed ? ' is-collapsed' : '';

        html += '<div class="ws-cat'+spanCls+collapsedCls+'" data-cat-id="'+cat.id+'" data-key="'+cat.id+'"'+catDrag+'>';

        html += '<div class="ws-cat-h">' +

          '<button class="ws-cat-toggle" data-cat-toggle="'+cat.id+'" type="button" title="'+(collapsed?'Expand':'Collapse')+'">'+

            '<i data-lucide="'+(collapsed?'chevron-right':'chevron-down')+'" style="width:11px;height:11px"></i>'+

          '</button>'+

          '<div class="ws-cat-h-name'+(cat.customStyle?' '+packClassFor(cat.customStyle,'category'):'')+'" data-cat-glow>'+escapeHtml(cat.name)+_privateLockHtml(s, cat)+'</div>'+

          (memberHasPerm(s,selfProfile.name,'manageCategory') ? '<button class="ws-cat-del" data-cat-delete="'+cat.id+'" title="Delete category"><i data-lucide="trash-2" style="width:11px;height:11px"></i></button>' : '')+

        '</div>';

        // While collapsed we just close the wrapper — none of the inner

        // pin / channels / orbs blocks render. Avoids both visual noise

        // and the cost of rendering them when they're hidden anyway.

        if (collapsed) { html += '</div>'; return; }

        // Category-level pin — pack class lands on the wrapper so the

        // background + text both pick up the rainbow wash.

        if (cat.pinned){

          // Apply both pin-background and category-text classes from

          // the pack so the wrapper picks up the wash AND the inner

          // text gets the gradient label treatment.

          const _catPinPackCls = cat.customStyle

            ? ' ' + packClassFor(cat.customStyle, 'serverPin')

              + ' ' + packClassFor(cat.customStyle, 'category')

            : '';

          html += '<div class="ws-cat-pin'+_catPinPackCls+'" data-cat-pin-id="'+cat.id+'">'+

            '<div class="ws-cat-pin-i"><i data-lucide="pin" style="width:11px;height:11px"></i></div>'+

            '<div class="ws-cat-pin-info"><div class="ws-cat-pin-l">CATEGORY PIN</div><div class="ws-cat-pin-text">'+escapeHtml(cat.pinned.text)+'</div></div>'+

            (memberHasPerm(s,selfProfile.name,'managePins') ? '<button class="ws-cat-pin-edit" data-cat-pin-edit="'+cat.id+'"><i data-lucide="edit-2" style="width:9px;height:9px"></i>EDIT</button>' : '')+

          '</div>';

        } else if (memberHasPerm(s,selfProfile.name,'managePins')){

          html += '<button class="ws-cat-add-pin" data-cat-pin-edit="'+cat.id+'"><i data-lucide="pin" style="width:9px;height:9px"></i>ADD CATEGORY PIN</button>';

        }

        // Text channels list

        if (cat.textChannels && cat.textChannels.length){

          html += '<div class="ws-cat-section"><div class="ws-cat-sec-l"><i data-lucide="hash"></i>TEXT</div><div class="ws-cat-tc-list" data-tc-list-cat="'+cat.id+'">';

          cat.textChannels.forEach(tcId => {

            const tc = s.textChannels.find(c => c.id === tcId);

            if (!tc) return;

            // Channel-level visibility tightens the category's. Even if the

            // parent category is open, the channel can still restrict to a

            // smaller role set (e.g. category visible to "Member", channel

            // visible only to "Mod").

            if (!memberCanSeeChannelCascaded(s,selfProfile.name,tc)) return;

            const tcDel = (memberHasPerm(s,selfProfile.name,'manageTextCh')) ? '<span class="ws-cat-tc-del" data-tc-delete="'+tc.id+'" title="Delete channel"><i data-lucide="x" style="width:10px;height:10px"></i></span>' : '';

            const tcDrag = canManageTc ? ' draggable="true"' : '';

            const _tcCustomCls = tc.customStyle ? ' '+packClassFor(tc.customStyle,'textChannel') : '';

            html += '<div class="ws-cat-tc style-'+tc.style+(tc.unread?' has-unread':'')+_tcCustomCls+'" data-tc-id="'+tc.id+'" data-key="'+tc.id+'"'+tcDrag+' role="button" tabindex="0"><i data-lucide="hash"></i><span class="ws-cat-tc-n">'+escapeHtml(tc.name)+_privateLockHtml(s, tc)+'</span>'+(tc.unread?'<span class="ws-cat-tc-b">'+tc.unread+'</span>':'')+tcDel+'</div>';

          });

          html += '</div></div>';

        }

        // Voice channels list

        if (cat.voiceChannels && cat.voiceChannels.length){

          html += '<div class="ws-cat-section"><div class="ws-cat-sec-l"><i data-lucide="orbit"></i>VOICE</div><div class="ws-cat-vc-list">';

          cat.voiceChannels.forEach(vcId => {

            const vc = s.voiceChannels.find(c => c.id === vcId);

            if (!vc) return;

            if (!memberCanSeeChannelCascaded(s,selfProfile.name,vc)) return;

            const style = voiceStyles[vc.style] || voiceStyles.indigo;

            const chKey = vcChannelKey(vc);

            const data = channelData[chKey];

            const count = data ? data.users.length : 0;

            const isConn = inVoice && connectedChannel === chKey;

            const cssVars = '--vc-grad:'+style.grad+';--vc-c:'+style.c+';--vc-glow:'+style.glow;

            // Build avatar overlay for users in this voice channel

            let avsHtml = '';

            if (data && count > 0){

              const shown = data.users.slice(0, 3);

              avsHtml += '<div class="ws-cat-vc-avs">';

              shown.forEach(u => {

                const a = resolveUserAvatar(u);

                const speakingCls = (isConn && speakingUser === u) ? ' speaking' : '';

                avsHtml += '<div class="ws-cat-vc-av'+speakingCls+'" style="background:'+a.bg+'" title="'+escapeHtml(u)+'">'+(a.isImage?'':escapeHtml(a.text))+'</div>';

              });

              if (count > 3){

                avsHtml += '<div class="ws-cat-vc-av more">+'+(count-3)+'</div>';

              }

              avsHtml += '</div>';

            }

            const vcDel = (memberHasPerm(s,selfProfile.name,'manageVoiceCh')) ? '<button class="ws-cat-vc-del" data-vc-delete="'+vc.id+'" title="Delete voice channel"><i data-lucide="x" style="width:11px;height:11px"></i></button>' : '';

            const legendaryCls = style.skin ? ' is-legendary' : '';

            const _vcCustomCls = vc.customStyle ? ' '+packClassFor(vc.customStyle,'voiceChannel') : '';

            const _vcOrbCls = vc.customStyle ? packClassFor(vc.customStyle,'orbit') : '';

            // The orb skin class (style-rainbow / style-fire / etc.)

            // drives the built-in voice orb styling, including the new

            // RAINBOW skin which is treated like INFERNO / SOLARIS.

            const _vcStyleCls = vc.style ? ' style-'+vc.style : '';

            html += '<div class="ws-cat-vc'+(isConn?' connected':'')+legendaryCls+_vcCustomCls+_vcStyleCls+'" data-vc-id="'+vc.id+'" data-vc-ch="'+chKey+'" style="'+cssVars+'"><div class="ws-cat-vc-orb '+_vcOrbCls+'"></div><div class="ws-cat-vc-info"><div class="ws-cat-vc-n">'+escapeHtml(vc.name)+_privateLockHtml(s, vc)+'</div><div class="ws-cat-vc-c'+(count>0?' live':'')+'">'+count+' '+(count===1?'MEMBER':'MEMBERS')+'</div></div>'+avsHtml+vcDel+'</div>';

          });

          html += '</div></div>';

        }

        html += '</div>';

      });

      html += '</div>'; // close ws-cats-grid

      requestAnimationFrame(() => {

        if (canManageCat){

          const grid = document.querySelector('.ws-cats-grid');

          if (grid) wireDragReorder(grid, '.ws-cat', keys => {

            const map = Object.fromEntries(s.categories.map(x => [x.id, x]));

            s.categories = keys.map(k => map[k]).filter(Boolean);

            if (backend.isConfigured()){

              backend.servers.reorderCategories(currentServer, s.categories.map(c => c.id)).catch(()=>{});

            }

            renderServerOverview();

          });

        }

        if (canManageTc){

          document.querySelectorAll('[data-tc-list-cat]').forEach(list => {

            const catId = list.dataset.tcListCat;

            const cat = s.categories.find(x => x.id === catId);

            if (!cat) return;

            wireDragReorder(list, '.ws-cat-tc', keys => {

              cat.textChannels = keys.filter(k => (cat.textChannels||[]).includes(k));

              renderServerOverview();

            });

          });

        }

      });

    }

    // STAFF quick row - shows every role (other than Owner) that has at least one member.

    // Each chip shows the user with their role tag in that role's color.

    ensureRoles(s);

    const featured = s.roles.filter(r => r.id !== 'owner' && (r.members||[]).length && r.featured !== false);

    if (featured.length){

      html += '<div class="ws-section" style="padding-bottom:22px"><div class="ws-sec-h"><div class="ws-sec-h-l"><i data-lucide="shield"></i>STAFF</div></div><div class="ws-admins">';

      featured.forEach(role => {

        (role.members||[]).forEach(name => {

          const ckey = name.toLowerCase();

          const conv = conversations[ckey];

          const av = conv ? conv.avColor : ('linear-gradient(135deg,'+role.color+',#1f1023)');

          html += '<div class="ws-admin-chip" data-admin-name="'+escapeHtml(name)+'" style="--role-c:'+role.color+'"><div class="ws-admin-chip-av" style="background:'+av+';border-color:'+role.color+'">'+name.charAt(0)+'</div><div class="ws-admin-chip-name">'+escapeHtml(name)+'</div><span class="ws-admin-chip-role" style="color:'+role.color+';background:'+role.color+'22;border-color:'+role.color+'40">'+escapeHtml(role.name.toUpperCase())+'</span></div>';

        });

      });

      html += '</div></div>';

    }

    ov.innerHTML = html;

    refreshIcons();

  }

  // (legacy renderCategoryCell removed)

  // ============== MEMBERS SIDEBAR (toggleable) ==============

  function toggleMembers(){

    const side = document.getElementById('membersSidebar');

    // Read DOM truth so a stuck JS flag doesn't leave the toggle inverted

    // after any code path moved the panel without going through us.

    const isOpenNow = !!(side && side.classList.contains('open'));

    membersOpen = !isOpenNow;

    if (side) side.classList.toggle('open', membersOpen);

    const btn = document.getElementById('worldMembersToggle');

    if (btn) btn.classList.toggle('active', membersOpen);

    if (membersOpen) renderMembers();

  }

  function renderMembers(){

    const inner = document.getElementById('msInner');

    let html = '';

    if (currentServer && servers[currentServer]){

      const s = servers[currentServer];

      ensureRoles(s);

      // Group members by their highest-priority role (first role in s.roles list that contains them).

      const groups = s.roles.map(r => ({ role:r, names:[] }));

      const unassigned = [];

      s.members.forEach(name => {

        let placed = false;

        for (let i=0;i<s.roles.length;i++){

          const r = s.roles[i];

          if ((r.members||[]).includes(name)){

            groups[i].names.push(name);

            placed = true;

            break;

          }

        }

        if (!placed) unassigned.push(name);

      });

      const memberRowHtml = (name, color) => {

        const a = resolveUserAvatar(name);

        const ckey = name.toLowerCase();

        const c = conversations[ckey];

        const online = name === selfProfile.name ? selfProfile.online !== false : (c ? c.online : false);

        const styleVar = color ? ' style="--role-c:'+color+'"' : '';

        const nameStyle = color ? ' style="color:'+color+'"' : '';

        return '<div class="ms-row" data-ms-name="'+escapeHtml(name)+'"'+styleVar+'>'+

          '<div class="ms-av '+(online?'online':'')+'" style="background:'+a.bg+'">'+(a.isImage?'':escapeHtml(a.text))+'</div>'+

          '<div class="ms-name"'+nameStyle+'>'+escapeHtml(name)+'</div>'+

        '</div>';

      };

      groups.forEach(g => {

        if (!g.names.length) return;

        html += '<div class="ms-group"><div class="ms-group-h"><span style="color:'+g.role.color+'">'+escapeHtml(g.role.name.toUpperCase())+'</span><span class="ms-count">'+g.names.length+'</span></div>';

        g.names.forEach(name => { html += memberRowHtml(name, g.role.color); });

        html += '</div>';

      });

      if (unassigned.length){

        html += '<div class="ms-group"><div class="ms-group-h"><span>OTHERS</span><span class="ms-count">'+unassigned.length+'</span></div>';

        unassigned.forEach(name => { html += memberRowHtml(name, null); });

        html += '</div>';

      }

    } else {

      // Default: all friends

      const friends = Object.values(conversations);

      html += '<div class="ms-group"><div class="ms-group-h"><span>FRIENDS</span><span class="ms-count">'+friends.length+'</span></div>';

      friends.forEach(c => {

        const a = resolveUserAvatar(c.name);

        html += '<div class="ms-row" data-ms-name="'+escapeHtml(c.name)+'"><div class="ms-av '+(c.online?'online':'')+'" style="background:'+a.bg+'">'+(a.isImage?'':escapeHtml(a.text))+'</div><div class="ms-name">'+escapeHtml(c.name)+'</div></div>';

      });

      html += '</div>';

    }

    inner.innerHTML = html || '<div class="vu-empty" style="padding:18px">No members</div>';

  }

  // ============== CONTEXT MENU (right-click voice members) ==============

  function showCtxMenu(x, y, items, headTitle, opts){

    const menu = document.getElementById('ctxMenu');

    let html = '';

    if (headTitle) html += '<div class="ctx-head">'+escapeHtml(headTitle)+'</div>';

    items.forEach((it, i) => {

      if (it.sep){ html += '<div class="ctx-sep"></div>'; return; }

      if (it.slider){

        html += '<div class="ctx-slider" data-ctx-slider-idx="'+i+'"><div class="ctx-slider-l"><i data-lucide="'+it.icon+'"></i>'+escapeHtml(it.label)+' <span data-ctx-slider-val>'+it.value+'%</span></div><input type="range" min="'+(it.min||0)+'" max="'+(it.max||200)+'" value="'+it.value+'" class="vs-slider" /></div>';

        return;

      }

      html += '<button class="ctx-item'+(it.danger?' danger':'')+'" data-ctx-idx="'+i+'"><i data-lucide="'+it.icon+'"></i>'+escapeHtml(it.label)+'</button>';

    });

    menu.innerHTML = html;

    menu.classList.add('show');

    refreshIcons();

    // Position

    const r = menu.getBoundingClientRect();

    let left = x, top = y;

    // If anchorRight requested (open to LEFT of given x), shift left by menu width

    if (opts && opts.anchorRight) left = x - r.width;

    // Clamp horizontally — if no room on left, flip to right of the original anchor

    if (left < 6){

      if (opts && opts.anchorRight) left = x + 60; // flip to right of anchor

      else left = 6;

    }

    if (left + r.width > window.innerWidth - 6) left = window.innerWidth - r.width - 6;

    if (top + r.height > window.innerHeight - 6) top = window.innerHeight - r.height - 6;

    if (top < 6) top = 6;

    menu.style.left = left + 'px';

    menu.style.top = top + 'px';

    // Wire clicks

    menu.querySelectorAll('[data-ctx-slider-idx]').forEach(wrap => {

      const inp = wrap.querySelector('input[type=range]');

      const val = wrap.querySelector('[data-ctx-slider-val]');

      const idx = parseInt(wrap.dataset.ctxSliderIdx);

      if (inp){

        inp.addEventListener('input', () => {

          val.textContent = inp.value+'%';

          const it = items[idx];

          if (it && it.onInput) it.onInput(parseInt(inp.value));

        });

      }

    });

    menu.querySelectorAll('[data-ctx-idx]').forEach(b => {

      b.addEventListener('click', () => {

        const idx = parseInt(b.dataset.ctxIdx);

        const it = items[idx];

        if (it && it.action) it.action();

        hideCtxMenu();

      });

    });

  }

  function hideCtxMenu(){ document.getElementById('ctxMenu').classList.remove('show'); }

  function openVoiceUserCtx(e, userName, channelKey){

    if (!inVoice){ showToast('You must be connected to a voice channel','warn'); return; }

    if (userName === selfProfile.name) return; // not yourself

    if (channelKey !== connectedChannel){ showToast('You can only mute/manage members of the channel you are in','warn'); return; }

    e.preventDefault();

    const isMutedByMe = mutedUsersByMe.has(userName);

    const curVol = (userName in userVolumes) ? userVolumes[userName] : 100;

    const items = [

      { icon: isMutedByMe?'mic':'mic-off', label: isMutedByMe?'Unmute (local)':'Mute (local)', action:()=>{

        if (isMutedByMe){ mutedUsersByMe.delete(userName); showToast('Unmuted '+userName,'success'); }

        else { mutedUsersByMe.add(userName); showToast('Muted '+userName+' (only for you)','warn'); }

        renderVoiceUsers();

      }},

      { slider:true, icon:'volume-2', label:'User volume', value:curVol, min:0, max:200, onInput:(v)=>{ userVolumes[userName] = v; } },

      { icon:'user', label:'View profile', action:()=>{ openProfileByName(userName); } }

    ];

    // Kick is only offered if the user has kickFromVoice in the server that OWNS the

    // voice channel (regardless of which page/server they're currently looking at).

    const ownerInfo = findVoiceChannelByKey(channelKey);

    const ownerSrv = ownerInfo ? ownerInfo.server : null;

    const canKick = ownerSrv ? (memberHasPerm(ownerSrv, selfProfile.name, 'kickFromVoice') || memberHasPerm(ownerSrv, selfProfile.name, 'kickFromServer')) : false;

    if (canKick){

      items.push({ sep:true });

      // Disconnect this user from the voice channel only (they stay in the server).

      if (memberHasPerm(ownerSrv, selfProfile.name, 'kickFromVoice')){

        items.push({ icon:'phone-off', label:'Kick from voice', action: async ()=>{

          const md = (ownerSrv.memberDetails || []).find(m => m.name === userName);

          if (!md){ showToast('Cannot resolve member id','warn'); return; }

          if (backend.isConfigured()){

            const r = await backend.servers.voiceKick(ownerSrv.id, channelKey, md.id);

            if (r && r.error){ showToast('Could not kick: '+r.error,'warn'); return; }

            if (r && r.offline){ showToast('Cannot reach the server','warn'); return; }

          }

          if (channelData[channelKey]){

            channelData[channelKey].users = channelData[channelKey].users.filter(u => u !== userName);

          }

          showToast(userName+' kicked from voice','warn');

          updateOrbStates();

          renderVoiceUsers();

        }});

      }

      if (memberHasPerm(ownerSrv, selfProfile.name, 'kickFromServer')){

        items.push({ icon:'user-x', label:'Remove from server', danger:true, action: async ()=>{

          const md = (ownerSrv.memberDetails || []).find(m => m.name === userName);

          if (!md){ showToast('Cannot resolve member id','warn'); return; }

          const ok = await appConfirm(

            'Remove '+userName+' from '+ownerSrv.name+'? This also disconnects them from any voice channel and they\'ll need a new invite to come back.',

            { title: 'REMOVE MEMBER', confirmLabel: 'REMOVE', danger: true }

          );

          if (!ok) return;

          if (backend.isConfigured()){

            const r = await backend.servers.kickMember(ownerSrv.id, md.id);

            if (r && r.error){ showToast('Could not remove: '+r.error,'warn'); return; }

            if (r && r.offline){ showToast('Cannot reach the server','warn'); return; }

          }

          // Pull the kicked user out of every voice channel snapshot we

          // hold for this server, so the orb UI updates immediately even

          // before the server's voice:leave fan-out arrives.

          (ownerSrv.voiceChannels || []).forEach(vc => {

            const cd = channelData[vc.id];

            if (cd && Array.isArray(cd.users)){

              cd.users = cd.users.filter(u => u !== userName);

            }

          });

          showToast(userName+' removed from '+ownerSrv.name,'warn');

          updateOrbStates();

          renderVoiceUsers();

        }});

      }

    }

    // Anchor to the voice user item — sidebar is on the right edge, so open menu to the LEFT of the avatar

    const item = e.target.closest('[data-vu-user]');

    let anchorX = e.clientX, anchorY = e.clientY;

    if (item){

      const r = item.getBoundingClientRect();

      anchorY = r.top;

      anchorX = r.left - 6; // place to the left of the avatar; showCtxMenu will measure & flip

    }

    showCtxMenu(anchorX, anchorY, items, userName, { anchorRight:true });

  }

  // ============== IMAGE VIEWER ==============

  let imgZoomLevel = 1;

  let imgViewCurrentMsg = null;

  function openImageViewer(src, opts){

    opts = opts || {};

    imgViewCurrentMsg = Object.assign({}, opts, { src });

    const v = document.getElementById('imgView');

    document.getElementById('imgViewImg').src = src;

    document.getElementById('imgViewSender').textContent = opts.sender || 'Unknown';

    document.getElementById('imgViewTime').textContent = opts.time || '';

    document.getElementById('imgViewAv').textContent = (opts.sender||'?').charAt(0);

    document.getElementById('imgViewAv').style.background = opts.av || 'linear-gradient(135deg,#818cf8,#1e1b4b)';

    imgZoomLevel = 1;

    updateImgZoom();

    v.classList.add('show');

  }

  function closeImageViewer(){

    document.getElementById('imgView').classList.remove('show');

    imgViewCurrentMsg = null;

  }

  function updateImgZoom(){

    const img = document.getElementById('imgViewImg');

    img.style.transform = 'scale('+imgZoomLevel+')';

    document.getElementById('imgViewZoomLevel').textContent = Math.round(imgZoomLevel*100)+'%';

    document.getElementById('imgViewStage').classList.toggle('zoomed', imgZoomLevel > 1);

  }

  // ============== POPUPS ==============

  function closeAllPopups(){

    document.querySelectorAll('.popup.show').forEach(p=>{ p.classList.remove('show'); p.style.display = 'none'; });

    document.getElementById('popupBackdrop').classList.remove('show');

    document.querySelectorAll('[data-popup].active').forEach(b=>b.classList.remove('active'));

  }

  function positionPopupNearAnchor(popup, anchor){

    const aRect = anchor.getBoundingClientRect();

    const shellRect = document.getElementById('appShell').getBoundingClientRect();

    popup.style.display = '';

    popup.classList.add('show');

    const pRect = popup.getBoundingClientRect();

    let top = aRect.bottom - shellRect.top + 8;

    let left = aRect.right - shellRect.left - pRect.width;

    if (left < 8) left = 8;

    if (top + pRect.height > shellRect.height - 8) top = aRect.top - shellRect.top - pRect.height - 8;

    if (top < 8) top = 8;

    popup.style.top = top + 'px';

    popup.style.left = left + 'px';

  }

  function toggleAnchoredPopup(popupId, anchor){

    const popup = document.getElementById(popupId);

    if (!popup) return;

    const wasOpen = popup.classList.contains('show');

    closeAllPopups();

    if (wasOpen) return;

    // Skip the dim/blur backdrop for emoji picker so the chat stays visible behind it.

    if (popupId !== 'emojiPop') document.getElementById('popupBackdrop').classList.add('show');

    positionPopupNearAnchor(popup, anchor);

    if (popupId === 'notifPanel') renderNotifications();

    if (popupId === 'requestsPop') renderRequestsPopup();

    if (popupId === 'emojiPop') renderEmojiPicker();

  }

  function renderNotifications(){

    const list = document.getElementById('notifList');

    if (notifications.length === 0){ list.innerHTML = '<div class="notif-empty">No notifications</div>'; return; }

    list.innerHTML = notifications.map(n => '<div class="notif-item'+(n.unread?' unread':'')+'" data-notif-id="'+n.id+'">'+

      '<div class="notif-i '+(n.iconCls||'')+'"><i data-lucide="'+n.icon+'" style="width:14px;height:14px"></i></div>'+

      '<div class="notif-c"><div class="notif-t">'+escapeHtml(n.title)+'</div><div class="notif-d">'+escapeHtml(n.desc)+'</div><div class="notif-time">'+n.time+'</div></div>'+

    '</div>').join('');

    refreshIcons();

  }

  function renderRequestsPopup(){

    const list = document.getElementById('reqList');

    const items = friendRequests.incoming;

    if (items.length === 0){ list.innerHTML = '<div class="notif-empty">No pending friend requests</div>'; return; }

    list.innerHTML = items.map(r => '<div class="req-item" data-req-id="'+r.id+'">'+

      '<div class="req-av" style="background:'+r.avColor+'">'+r.initial+'</div>'+

      '<div class="req-info"><div class="req-n">'+escapeHtml(r.name)+'</div><div class="req-meta">'+escapeHtml(r.handle)+' · '+escapeHtml(r.meta)+'</div></div>'+

      '<div class="req-actions">'+

        '<button class="req-btn accept" data-req-action="accept" data-req-id="'+r.id+'" title="Accept"><i data-lucide="check" style="width:13px;height:13px"></i></button>'+

        '<button class="req-btn reject" data-req-action="reject" data-req-id="'+r.id+'" title="Decline"><i data-lucide="x" style="width:13px;height:13px"></i></button>'+

      '</div>'+

    '</div>').join('');

    refreshIcons();

  }

  // ============== EMOJI ==============

  const emojiCategories = {

    'smileys': { icon:'🙂', label:'Smileys', list:['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','🥹','☺','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫣','🤭','🫢','🫡','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠','👽','👾','🤖'] },

    'people':  { icon:'👋', label:'People',  list:['👋','🤚','🖐','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁','👅','👄','💋','🩸'] },

    'animals': { icon:'🐶', label:'Animals', list:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷','🕸','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🦭','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔','🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘','🍀','🎍','🪴','🎋','🍃','🍂','🍁','🍄','🐚','🪨','🌾','💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻'] },

    'food':    { icon:'🍔', label:'Food',    list:['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊'] },

    'activities':{icon:'⚽', label:'Activity',list:['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸','🥌','🎿','⛷','🏂','🪂','🏋','🤼','🤸','⛹','🤺','🤾','🏌','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖','🏵','🎗','🎫','🎟','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎲','♟','🎯','🎳','🎮','🎰','🧩'] },

    'travel':  { icon:'🚀', label:'Travel',  list:['🚀','🛸','🛰','🛩','✈','🛫','🛬','🪂','🚁','🚟','🚠','🚡','🛺','🚜','🏎','🏍','🛵','🚲','🛴','🛹','🚂','🚆','🚄','🚅','🚈','🚇','🚊','🚉','🚞','🚝','🚋','🚃','🚎','🚌','🚍','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚘','🚙','🛻','🚚','🚛','🚦','🚥','🚧','⚓','🛟','⛵','🚤','🛥','🛳','⛴','🚢','🪝','⚓','🗺','🧭','🏔','⛰','🌋','🗻','🏕','🏖','🏜','🏝','🏞','🏟','🏛','🏗','🧱','🪨','🪵','🛖','🏘','🏚','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕','🕍','⛩','🕋','⛲','⛺','🌁','🌃','🏙','🌄','🌅','🌆','🌇','🌉','♨','🎠','🎡','🎢','💈','🎪','🚏','🛣','🛤','⛽','🛢','🚨','🛎','🗝','🚪','🪑','🛋','🛏','🛌','🧸','🪆','🖼','🪞','🪟','🛍','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉','📩','📨','📧','💌','📥','📤','📦','🏷','🪧','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒','🗓','📆','📅','🗑','📇','🗃','🗳','🗄','📋','📁','📂','🗂','🗞','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇','📐','📏','🧮','📌','📍','✂','🖊','🖋','✒','🖌','🖍','📝','✏','🔍','🔎','🔏','🔐','🔒','🔓'] },

    'symbols': { icon:'❤', label:'Symbols',  list:['❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟','☮','✝','☪','🕉','☸','✡','🔯','🕎','☯','☦','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛','🉑','☢','☣','📴','📳','🈶','🈚','🈸','🈺','🈷','✴','🆚','💮','🉐','㊙','㊗','🈴','🈵','🈹','🈲','🅰','🅱','🆎','🆑','🅾','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼','⁉','🔅','🔆','〽','⚠','🚸','🔱','⚜','🔰','♻','✅','🈯','💹','❇','✳','❎','🌐','💠','Ⓜ','🌀','💤','🏧','🚾','♿','🅿','🛗','🈳','🈂','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧','🚻','🚮','🎦','📶','🈁','🔣','ℹ','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓'] },

    'flags':   { icon:'🏁', label:'Flags',   list:['🏁','🚩','🎌','🏴','🏳','🏳‍🌈','🏳‍⚧','🏴‍☠','🇺🇳','🇦🇫','🇦🇱','🇩🇿','🇦🇷','🇦🇲','🇦🇺','🇦🇹','🇦🇿','🇧🇭','🇧🇩','🇧🇪','🇧🇷','🇨🇦','🇨🇳','🇫🇷','🇩🇪','🇮🇳','🇮🇩','🇮🇷','🇮🇶','🇮🇹','🇯🇵','🇰🇷','🇰🇼','🇲🇾','🇲🇽','🇳🇱','🇳🇿','🇳🇬','🇳🇴','🇵🇰','🇵🇭','🇵🇱','🇵🇹','🇶🇦','🇷🇺','🇸🇦','🇸🇬','🇿🇦','🇪🇸','🇸🇪','🇨🇭','🇸🇾','🇹🇷','🇺🇦','🇦🇪','🇬🇧','🇺🇸','🇻🇪','🇻🇳'] }

  };

  let activeEmojiCat = 'smileys';

  let emojiTargetInput = null;

  let emojiSearchQuery = '';

  function renderEmojiPicker(){

    const cats = document.getElementById('emojiCats');

    const grid = document.getElementById('emojiGrid');

    cats.innerHTML = Object.entries(emojiCategories).map(([k,v])=>'<div class="ec-tab"'+(activeEmojiCat===k?' data-active="1"':'')+' data-emoji-cat="'+k+'" title="'+v.label+'">'+v.icon+'</div>').join('');

    const cat = emojiCategories[activeEmojiCat] || { list:[] };

    const q = emojiSearchQuery.trim().toLowerCase();

    let list = cat.list;

    if (q){

      const all = Object.values(emojiCategories).flatMap(v => v.list);

      list = all.filter((e,i,a) => a.indexOf(e) === i);

    }

    grid.innerHTML = list.map(e=>'<div class="emoji-cell" data-emoji="'+e+'">'+e+'</div>').join('');

  }

  // ============== SEARCH ==============

  function openSearchOverlay(){

    const ov = document.getElementById('searchOverlay');

    ov.classList.add('show');

    setTimeout(()=>{ const inp = document.getElementById('searchInput'); inp.value = ''; inp.focus(); renderSearchResults(''); }, 50);

  }

  function closeSearchOverlay(){ document.getElementById('searchOverlay').classList.remove('show'); }

  function renderSearchResults(q){

    const r = document.getElementById('searchResults');

    q = q.toLowerCase().trim();

    let html = '';

    const matchFriends = Object.entries(conversations).filter(([_,c])=>!q||c.name.toLowerCase().includes(q));

    if (matchFriends.length){

      html += '<div class="search-section-h">FRIENDS</div>';

      html += matchFriends.slice(0,5).map(([k,c])=>'<div class="sr-item" data-search-friend="'+k+'"><div class="sr-i'+(c.online?' green':'')+'">'+c.initial+'</div><div><div class="sr-t">'+escapeHtml(c.name)+'</div><div class="sr-d">'+escapeHtml(c.handle)+(c.online?' · ONLINE':'')+'</div></div></div>').join('');

    }

    const matchChannels = Object.entries(channelData).filter(([_,c])=>!q||c.name.toLowerCase().includes(q));

    if (matchChannels.length){

      html += '<div class="search-section-h">CHANNELS</div>';

      html += matchChannels.slice(0,5).map(([k,c])=>'<div class="sr-item" data-search-channel="'+k+'"><div class="sr-i warn"><i data-lucide="orbit" style="width:14px;height:14px"></i></div><div><div class="sr-t">'+c.name+(c.tier==='legendary'?' ★':'')+'</div><div class="sr-d">VOICE · '+c.users.length+' MEMBERS</div></div></div>').join('');

    }

    if (!q || 'home messages world'.includes(q)){

      html += '<div class="search-section-h">PAGES</div>';

      html += '<div class="sr-item" data-search-page="pageHome"><div class="sr-i"><i data-lucide="home" style="width:14px;height:14px"></i></div><div><div class="sr-t">Home</div><div class="sr-d">Dashboard</div></div></div>';

      html += '<div class="sr-item" data-search-page="pageMessages"><div class="sr-i"><i data-lucide="message-circle" style="width:14px;height:14px"></i></div><div><div class="sr-t">Transmissions</div><div class="sr-d">Direct messages</div></div></div>';

      html += '<div class="sr-item" data-search-page="pageWorld"><div class="sr-i"><i data-lucide="globe" style="width:14px;height:14px"></i></div><div><div class="sr-t">World</div><div class="sr-d">Public broadcast</div></div></div>';

    }

    if (!html) html = '<div class="sr-empty">Nothing matches "'+escapeHtml(q)+'"</div>';

    r.innerHTML = html;

    refreshIcons();

  }

  // ============== PROFILE MODAL ==============

  // Self profile (editable). Hydrated from the backend (or auth modal) on

  // boot via applyProfileFromAuth() / resetSelfProfileForSignup(). The values

  // here are placeholders only — they are visible for at most a frame before

  // bootAuth() replaces them.

  const selfProfile = {

    name:'', initial:'?',

    avColor:'linear-gradient(135deg,#a78bfa,#1e1b4b)',

    orbGrad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.4),#a78bfa 55%,#1e1b4b)',

    orbColor:'#a78bfa',

    avImage:null,

    bannerImage:null,

    handle:'', rank:'EXPLORER',

    bio:'',

    online:true, lastSeen:'just now'

  };

  let profileEditingSelf = false; // toggled on when own profile is open and user clicks Edit

  // Helpers to render the user's own avatar consistently everywhere.

  function selfAvStyle(){ return selfProfile.avImage ? 'transparent url('+selfProfile.avImage+') center/cover no-repeat' : (selfProfile.avColor||'linear-gradient(135deg,#22c55e,#15803d)'); }

  function selfAvInner(){ return selfProfile.avImage ? '' : (selfProfile.initial||'C'); }

  // Universal avatar resolver. Given any display name (or DM key), returns a

  // {bg, text} pair so every "circle with someone's face" everywhere in the UI

  // pulls from a single source. selfProfile wins, then conversations[*],

  // otherwise we fall back to a deterministic gradient + initial.

  function resolveUserAvatar(nameOrKey){

    if (!nameOrKey) return { bg:'linear-gradient(135deg,#a78bfa,#1e1b4b)', text:'?', isImage:false };

    if (nameOrKey === selfProfile.name || nameOrKey === 'me' || nameOrKey === selfProfile.handle){

      return { bg:selfAvStyle(), text:selfAvInner(), isImage:!!selfProfile.avImage };

    }

    const lowerName = String(nameOrKey).toLowerCase();

    // 1) Direct handle match in conversations (cheap, common case).

    let c = conversations[lowerName];

    // 2) Case-insensitive name match across every conversation we know about.

    if (!c){

      c = Object.values(conversations).find(x => x && (

        (x.name && x.name.toLowerCase() === lowerName) ||

        (x.handle && x.handle.replace(/^@/, '').toLowerCase() === lowerName.replace(/^@/, ''))

      ));

    }

    if (c){

      if (c.avImage) return { bg:'transparent url('+c.avImage+') center/cover no-repeat', text:'', isImage:true };

      return { bg:c.avColor||c.orbGrad||'linear-gradient(135deg,#a78bfa,#1e1b4b)', text:(c.initial||c.name||'?').charAt(0).toUpperCase(), isImage:false };

    }

    // 3) Fall back to a server member detail row — covers the case where

    //    a non-friend in a voice channel hasn't been promoted to

    //    conversations[] yet (e.g. brand new join with no DM history).

    for (const sid in servers){

      const md = (servers[sid].memberDetails || []).find(m => m.name && m.name.toLowerCase() === lowerName);

      if (md){

        if (md.avImage) return { bg:'transparent url('+md.avImage+') center/cover no-repeat', text:'', isImage:true };

        if (md.baseColor){

          return { bg:'linear-gradient(135deg,'+md.baseColor+',#1e1b4b)', text:(md.name||'?').charAt(0).toUpperCase(), isImage:false };

        }

        break;

      }

    }

    return { bg:'linear-gradient(135deg,#a78bfa,#1e1b4b)', text:String(nameOrKey).charAt(0).toUpperCase(), isImage:false };

  }

  function avatarHtml(nameOrKey, extraClass, extraStyle){

    const a = resolveUserAvatar(nameOrKey);

    const cls = extraClass ? (' '+extraClass) : '';

    const sty = extraStyle ? (';'+extraStyle) : '';

    return '<div class="user-av'+cls+'" style="background:'+a.bg+sty+'">'+(a.isImage?'':escapeHtml(a.text))+'</div>';

  }

  // ============== BACKEND ADAPTER ==============

  //

  // Thin REST client that talks to the MySQL-backed API. Every place in the

  // UI that mutates a piece of state (servers, channels, friend requests,

  // messages, profile, etc.) calls into this module so we don't have to

  // sprinkle fetch() everywhere.

  //

  // Configuration:

  //   - BACKEND_BASE_URL  : where the API lives. Override with

  //                         <meta name="orblood-api" content="https://...">

  //                         in the page <head>, or set window.ORBLOOD_API.

  //   - BACKEND_TOKEN_KEY : localStorage key holding the auth token returned

  //                         by /auth/login or /auth/signup.

  //

  // Expected REST surface (shape only — pick your own routes when wiring up):

  //   POST /auth/signup           {email,password,name,handle}     -> {token,user}

  //   POST /auth/login            {email,password}                 -> {token,user}

  //   GET  /me                                                      -> {user}

  //   PATCH /me                   {name?,handle?,bio?,avImage?,bannerImage?,baseColor?,phone?,password?}

  //   GET  /me/snapshot                                             -> full hydration payload

  //   GET  /servers/:id                                             -> server detail

  //   POST /servers               {name,desc,baseColor,grad,glow}   -> server

  //   PATCH /servers/:id          {...}                             -> server

  //   DELETE /servers/:id

  //   POST /servers/:id/leave

  //   POST /servers/:id/categories         {name}                   -> category

  //   DELETE /servers/:id/categories/:cid

  //   POST /servers/:id/text-channels      {name,style,categoryId}  -> channel

  //   DELETE /servers/:id/text-channels/:cid

  //   POST /servers/:id/voice-channels     {name,style,categoryId}  -> channel

  //   DELETE /servers/:id/voice-channels/:cid

  //   POST /servers/:id/voice-channels/:cid/join

  //   POST /servers/:id/voice-channels/:cid/leave

  //   GET  /dms/:peerKey                                            -> [messages]

  //   POST /dms/:peerKey                   {text,replyTo?,attachment?}  -> message

  //   POST /dms/:peerKey/clear

  //   POST /friends/request                {handleOrEmail}          -> request

  //   POST /friends/:reqId/accept

  //   POST /friends/:reqId/reject

  //   DELETE /friends/:reqId

  //   POST /friends/:userId/remove

  //   POST /users/:userId/block

  //   POST /users/:userId/unblock

  //

  // The Hydration payload (GET /me/snapshot) is what initially fills the

  // in-memory state so the rest of the UI works unchanged. See

  // hydrateFromBackend() below for the exact shape.

  const BACKEND_TOKEN_KEY = 'orblood_token_v1';

  function _backendBase(){

    if (typeof window !== 'undefined' && window.ORBLOOD_API) return String(window.ORBLOOD_API).replace(/\/$/, '');

    const meta = document.querySelector('meta[name="orblood-api"]');

    if (meta && meta.content) return meta.content.replace(/\/$/, '');

    return '';

  }

  function _readToken(){ try { return localStorage.getItem(BACKEND_TOKEN_KEY) || null; } catch(_){ return null; } }

  function _writeToken(t){ try { if (t) localStorage.setItem(BACKEND_TOKEN_KEY, t); else localStorage.removeItem(BACKEND_TOKEN_KEY); } catch(_){} }

  async function _apiRequest(method, path, body){

    const base = _backendBase();

    if (!base) return { offline:true };

    const headers = { 'Content-Type':'application/json', 'Accept':'application/json' };

    const tok = _readToken(); if (tok) headers['Authorization'] = 'Bearer '+tok;

    let res;

    try {

      res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials:'include' });

    } catch (e){

      console.warn('[orblood] backend unreachable for '+method+' '+path, e);

      return { offline:true, error:e };

    }

    let data = null;

    try { data = await res.json(); } catch(_){ data = null; }

    if (!res.ok){

      const err = (data && data.error) || res.statusText;

      console.warn('[orblood] backend error '+res.status+' on '+method+' '+path+': '+err);

      return { error:err, status:res.status, data };

    }

    return data || {};

  }

  const backend = {

    isConfigured(){ return !!_backendBase(); },

    token: { read:_readToken, write:_writeToken },

    auth: {

      signup: payload => _apiRequest('POST', '/auth/signup', payload),

      login:  payload => _apiRequest('POST', '/auth/login',  payload),

      logout: ()      => _apiRequest('POST', '/auth/logout'),

      me:     ()      => _apiRequest('GET',  '/me')

    },

    me: {

      patch: patch    => _apiRequest('PATCH', '/me', patch),

      snapshot: ()    => _apiRequest('GET',   '/me/snapshot'),

      saveOrbits:        ids     => _apiRequest('PUT', '/me/marks/orbits',         { ids }),

      saveTextChannels:  keys    => _apiRequest('PUT', '/me/marks/text-channels',  { keys }),

      saveFriendMarks:   handles => _apiRequest('PUT', '/me/marks/friends',        { handles }),

      savePinnedServers: ids     => _apiRequest('PUT', '/me/marks/pinned-servers', { ids })

    },

    servers: {

      create:  payload      => _apiRequest('POST',   '/servers', payload),

      patch:   (id, p)      => _apiRequest('PATCH',  '/servers/'+encodeURIComponent(id), p),

      remove:  id           => _apiRequest('DELETE', '/servers/'+encodeURIComponent(id)),

      leave:   id           => _apiRequest('POST',   '/servers/'+encodeURIComponent(id)+'/leave'),

      lookup:  keyOrId      => _apiRequest('GET',    '/servers/lookup/'+encodeURIComponent(keyOrId)),

      join:    keyOrId      => _apiRequest('POST',   '/servers/'+encodeURIComponent(keyOrId)+'/join', {}),

      transferOwnership: (sid, targetUserId) => _apiRequest('POST', '/servers/'+encodeURIComponent(sid)+'/transfer-ownership', { targetUserId }),

      kickMember: (sid, userId) => _apiRequest('POST', '/servers/'+encodeURIComponent(sid)+'/kick', { userId }),

      patchCategory: (sid, cid, p) => _apiRequest('PATCH', '/servers/'+encodeURIComponent(sid)+'/categories/'+encodeURIComponent(cid), p),

      reorderCategories: (sid, order) => _apiRequest('PATCH', '/servers/'+encodeURIComponent(sid)+'/categories/order', { order }),

      patchTextChannel:  (sid, cid, p) => _apiRequest('PATCH', '/channels/text/'+encodeURIComponent(sid)+'/'+encodeURIComponent(cid), p),

      patchVoiceChannel: (sid, cid, p) => _apiRequest('PATCH', '/channels/voice/'+encodeURIComponent(sid)+'/'+encodeURIComponent(cid), p),

      pinChannelMessage: (sid, cid, messageId) => _apiRequest('POST', '/channels/text/'+encodeURIComponent(sid)+'/'+encodeURIComponent(cid)+'/pin', { messageId }),

      addCategory: (sid, p) => _apiRequest('POST',   '/servers/'+encodeURIComponent(sid)+'/categories', p),

      delCategory: (sid, c) => _apiRequest('DELETE', '/servers/'+encodeURIComponent(sid)+'/categories/'+encodeURIComponent(c)),

      addTextChannel:  (sid, p) => _apiRequest('POST',   '/channels/text/'+encodeURIComponent(sid), p),

      delTextChannel:  (sid, c) => _apiRequest('DELETE', '/channels/text/'+encodeURIComponent(sid)+'/'+encodeURIComponent(c)),

      addVoiceChannel: (sid, p) => _apiRequest('POST',   '/channels/voice/'+encodeURIComponent(sid), p),

      delVoiceChannel: (sid, c) => _apiRequest('DELETE', '/channels/voice/'+encodeURIComponent(sid)+'/'+encodeURIComponent(c)),

      voiceJoin:  (sid, c) => _apiRequest('POST', '/channels/voice/'+encodeURIComponent(sid)+'/'+encodeURIComponent(c)+'/join'),

      voiceLeave: (sid, c) => _apiRequest('POST', '/channels/voice/'+encodeURIComponent(sid)+'/'+encodeURIComponent(c)+'/leave'),

      voiceKick:  (sid, c, userId) => _apiRequest('POST', '/channels/voice/'+encodeURIComponent(sid)+'/'+encodeURIComponent(c)+'/kick', { userId }),

      listChannelMessages: (sid, c)         => _apiRequest('GET',  '/channels/text/'+encodeURIComponent(sid)+'/'+encodeURIComponent(c)+'/messages'),

      sendChannelMessage:  (sid, c, payload) => _apiRequest('POST', '/channels/text/'+encodeURIComponent(sid)+'/'+encodeURIComponent(c)+'/messages', payload),

      delChannelMessage:   (sid, c, mid)     => _apiRequest('DELETE','/channels/text/'+encodeURIComponent(sid)+'/'+encodeURIComponent(c)+'/messages/'+encodeURIComponent(mid)),

      saveRoles: (sid, roles) => _apiRequest('PUT', '/servers/'+encodeURIComponent(sid)+'/roles', { roles }),

      markChannelRead: (sid, cid) => _apiRequest('POST', '/channels/text/'+encodeURIComponent(sid)+'/'+encodeURIComponent(cid)+'/read'),

      regenerateInvite: sid => _apiRequest('POST', '/servers/'+encodeURIComponent(sid)+'/regenerate-invite')

    },

    uploads: {

      // multipart/form-data is built on the call site (FormData()).

      image: (formData) => {

        const base = _backendBase(); if (!base) return Promise.resolve({ offline:true });

        const tok = _readToken();

        return fetch(base + '/uploads/image', {

          method: 'POST',

          headers: tok ? { 'Authorization': 'Bearer '+tok } : {},

          body: formData

        }).then(r => r.json().catch(()=>({ error:'bad_response' })));

      }

    },

    dms: {

      list:   peer        => _apiRequest('GET',  '/dms/'+encodeURIComponent(peer)),

      send:   (peer, p)   => _apiRequest('POST', '/dms/'+encodeURIComponent(peer), p),

      clear:  peer        => _apiRequest('POST', '/dms/'+encodeURIComponent(peer)+'/clear'),

      del:    (peer, mid) => _apiRequest('DELETE', '/dms/'+encodeURIComponent(peer)+'/'+encodeURIComponent(mid)),

      edit:   (peer, mid, text) => _apiRequest('PATCH', '/dms/'+encodeURIComponent(peer)+'/'+encodeURIComponent(mid), { text }),

      markRead: peer => _apiRequest('POST', '/dms/'+encodeURIComponent(peer)+'/read'),

      pin:      (peer, messageId) => _apiRequest('POST', '/dms/'+encodeURIComponent(peer)+'/pin', { messageId: messageId === null ? null : messageId })

    },

    friends: {

      request: handleOrEmail => _apiRequest('POST', '/friends/request', { target:handleOrEmail }),

      accept:  rid => _apiRequest('POST',   '/friends/'+encodeURIComponent(rid)+'/accept'),

      reject:  rid => _apiRequest('POST',   '/friends/'+encodeURIComponent(rid)+'/reject'),

      cancel:  rid => _apiRequest('DELETE', '/friends/'+encodeURIComponent(rid)),

      remove:  uid => _apiRequest('POST',   '/friends/'+encodeURIComponent(uid)+'/remove')

    },

    users: {

      block:   uid => _apiRequest('POST', '/users/'+encodeURIComponent(uid)+'/block'),

      unblock: uid => _apiRequest('POST', '/users/'+encodeURIComponent(uid)+'/unblock'),

      lookup:  q   => _apiRequest('GET',  '/users/search?q='+encodeURIComponent(q))

    }

  };

  // Pulls the entire app state from the backend in one round-trip and rebuilds

  // every in-memory store. Safe to call after login / on reconnect.

  async function hydrateFromBackend(){

    if (!backend.isConfigured()) return false;

    const snap = await backend.me.snapshot();

    if (snap && snap.offline) return false;

    if (!snap || snap.error) return false;

    if (snap.user) applyProfileFromAuth(snap.user);

    if (snap.servers && typeof snap.servers === 'object'){

      Object.keys(servers).forEach(k => delete servers[k]);

      Object.assign(servers, snap.servers);

    }

    if (Array.isArray(snap.myServers)) myServers = snap.myServers.slice();

    // Drop stale entries first; we'll re-materialise from servers below

    // and only `users` arrays come straight from the snapshot.

    Object.keys(channelData).forEach(k => { if (k !== '__empty__') delete channelData[k]; });

    // Materialise channelData entries for every voice channel in every server

    // we just hydrated. The backend ships voice channels under each server's

    // `voiceChannels` array but channelData is the in-memory map the orb UI

    // reads from — without this, joining a voice channel as a guest fails

    // because channelData[chKey] is undefined.

    Object.values(servers).forEach(srv => {

      (srv.voiceChannels || []).forEach(vc => {

        const chKey = vcChannelKey(vc);

        if (!chKey || channelData[chKey]) return;

        const st = voiceStyles[vc.style] || voiceStyles.indigo;

        const m = (st.glow||'rgba(99,102,241,0.4)').match(/rgba\((\d+),(\d+),(\d+),/);

        const presetUsers = (snap.channelData && snap.channelData[chKey] && Array.isArray(snap.channelData[chKey].users))

          ? snap.channelData[chKey].users.slice()

          : [];

        channelData[chKey] = {

          name: vc.name,

          users: presetUsers,

          color: 'rgba('+(m?m[1]:99)+','+(m?m[2]:102)+','+(m?m[3]:241)+',',

          planetGrad: st.grad,

          atmoColor: st.glow,

          orbiterColor: st.c,

          avBorder: '#fff',

          emoji: '🪐',

          tier: st.skin ? 'legendary' : 'common',

          skin: st.skin || undefined

        };

      });

    });

    if (snap.conversations && typeof snap.conversations === 'object'){

      // Preserve session-only flags (like _historyFetched) so the next

      // open of an already-loaded conversation keeps its full history

      // instead of falling back to the snapshot's preview.

      const sessionFlags = {};

      Object.entries(conversations).forEach(([k, c]) => {

        if (c && c._historyFetched) sessionFlags[k] = true;

      });

      Object.keys(conversations).forEach(k => { if (k !== 'saved') delete conversations[k]; });

      Object.assign(conversations, snap.conversations);

      Object.entries(sessionFlags).forEach(([k, v]) => {

        if (conversations[k]) conversations[k]._historyFetched = v;

      });

    }

    if (snap.messages && typeof snap.messages === 'object'){

      // Snapshot messages are only previews (last 1-2 messages per

      // thread). If we wholesale-replace `messages` here, any thread

      // we've already opened in this session loses its full history

      // and the open conversation reloads to "just the latest

      // message" — exactly the bug users see during WS reconnects.

      // Instead, keep already-fetched threads intact and only seed

      // the previews for threads we don't have history for yet.

      Object.entries(snap.messages).forEach(([k, arr]) => {

        const conv = conversations[k];

        if (conv && conv._historyFetched) return;   // keep our full copy

        messages[k] = Array.isArray(arr) ? arr.slice() : [];

      });

      // Drop entries for conversations the snapshot no longer mentions

      // AND that we haven't opened ourselves — leaves "ghost" threads

      // (e.g. an open DM) untouched.

      Object.keys(messages).forEach(k => {

        if (k === 'saved') return;

        const conv = conversations[k];

        if (conv && conv._historyFetched) return;

        if (!(k in snap.messages)) delete messages[k];

      });

      if (!messages.saved) messages.saved = [];

    }

    // Seed each thread with its last message preview so quick-access /

    // home cards show real "X said Y" instead of "no transmissions yet"

    // before the user opens the conversation. The full history still

    // lazy-loads via openConversation().

    if (snap.messagePreviews && typeof snap.messagePreviews === 'object'){

      Object.entries(snap.messagePreviews).forEach(([k, prev]) => {

        if (!prev) return;

        if (!messages[k] || messages[k].length === 0){

          const m = { ...prev, status:'delivered', _preview:true };

          _expandChannelMessage(m);

          messages[k] = [m];

        }

      });

    }

    // Restore persistent unread counts so refresh doesn't silently mark

    // everything as seen. Server snapshot computes these from

    // dm_read_state / text_channel_read_state.

    // Per-DM-thread pinned message id, persisted server-side so the pin

    // survives reload + appears for both peers.

    if (snap.dmPinned && typeof snap.dmPinned === 'object'){

      Object.entries(snap.dmPinned).forEach(([k, mid]) => { dmPinnedByConv[k] = mid; });

    }

    if (snap.unreadDm && typeof snap.unreadDm === 'object'){

      Object.entries(snap.unreadDm).forEach(([k, n]) => {

        if (conversations[k]) conversations[k].unread = Number(n) || 0;

      });

    }

    if (snap.unreadChannels && typeof snap.unreadChannels === 'object'){

      Object.entries(snap.unreadChannels).forEach(([key, n]) => {

        const sep = key.indexOf('__');

        if (sep < 0) return;

        const sid = key.slice(0, sep), cid = key.slice(sep+2);

        const s = servers[sid]; if (!s) return;

        const tc = (s.textChannels||[]).find(t => t.id === cid);

        if (tc) tc.unread = Number(n) || 0;

      });

    }

    if (Array.isArray(snap.friendsList))  friendsList = snap.friendsList.slice();

    if (Array.isArray(snap.markedFriends)) markedFriends = snap.markedFriends.slice();

    if (Array.isArray(snap.markedTextChannels)) markedTextChannels = snap.markedTextChannels.slice();

    if (Array.isArray(snap.marked))       marked = snap.marked.slice();

    // Drop a stale localStorage 'lastJoined' if we no longer belong to its

    // server. Otherwise the orb column tries to render an unreachable orb,

    // falls through to the empty placeholder, and the user sees the "create

    // / join server" buttons even though they have a marked orb to show.

    if (lastJoinedChannel && !channelData[lastJoinedChannel]){

      lastJoinedChannel = null;

      try { localStorage.removeItem('orblood:lastJoined'); } catch(_){}

    }

    if (Array.isArray(snap.notifications)) notifications = snap.notifications.slice();

    if (Array.isArray(snap.blockedUsers)){ blockedUsers.clear(); snap.blockedUsers.forEach(k => blockedUsers.add(k)); }

    if (Array.isArray(snap.blockedBy)){ blockedByUsers.clear(); snap.blockedBy.forEach(k => blockedByUsers.add(k)); }

    if (snap.friendRequests){

      friendRequests.incoming = Array.isArray(snap.friendRequests.incoming) ? snap.friendRequests.incoming.slice() : [];

      friendRequests.outgoing = Array.isArray(snap.friendRequests.outgoing) ? snap.friendRequests.outgoing.slice() : [];

    }

    return true;

  }

  // ============== REALTIME (WebSocket) ==============

  //

  // One persistent connection per logged-in tab. The server pushes events

  // (new DM, friend request, channel message, voice join/leave, presence,

  // typing) and we mutate in-memory state then re-render the affected piece.

  //

  // The connection auto-reconnects with backoff. If no backend is configured

  // we never open one, so the page stays usable offline.

  let _ws = null;

  let _wsRetry = 0;

  let _wsTimer = null;

  function _wsUrl(){

    const base = _backendBase();

    if (!base) return null;

    // Convert /api → /ws on the same origin.

    if (base.startsWith('/')){

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';

      return proto + '//' + location.host + '/ws';

    }

    const u = new URL(base);

    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';

    u.pathname = '/ws';

    return u.toString().replace(/\/+$/, '');

  }

  function connectRealtime(){

    if (!backend.isConfigured()) return;

    const tok = backend.token.read();

    if (!tok) return;

    const url = _wsUrl();

    if (!url) return;

    if (_ws && (_ws.readyState === 0 || _ws.readyState === 1)) return;

    try { _ws = new WebSocket(url + '?token=' + encodeURIComponent(tok)); }

    catch (e){ console.warn('[orblood] ws connect failed', e); _scheduleWsRetry(); return; }

    _ws.addEventListener('open',  () => {

      const wasReconnect = _wsRetry > 0;

      _wsRetry = 0;

      // After a reconnect, pull a fresh snapshot so we don't miss events that

      // the server pushed while we were offline (friend accepts, new

      // channels, member joins, etc.).

      if (wasReconnect && typeof _hydrateAndRefresh === 'function'){

        _hydrateAndRefresh().catch(()=>{});

      }

      // While reconnecting after a drop, if the user was already in a

      // voice call, resume the ping probe so the HUD doesn't stay blank.

      if (typeof inVoice !== 'undefined' && inVoice){

        _startWsPingLoop();

      }

    });

    _ws.addEventListener('close', () => {

      _ws = null;

      _stopWsPingLoop();

      const el = document.getElementById('orbHudPing'); if (el) el.textContent = '--';

      _scheduleWsRetry();

    });

    _ws.addEventListener('error', () => { /* close handler will fire next */ });

    _ws.addEventListener('message', e => {

      let msg = null; try { msg = JSON.parse(e.data); } catch(_){}

      if (!msg || !msg.type) return;

      _handleRealtimeEvent(msg);

    });

  }

  function _scheduleWsRetry(){

    if (_wsTimer) return;

    const delay = Math.min(15000, 500 * Math.pow(2, _wsRetry++));

    _wsTimer = setTimeout(() => { _wsTimer = null; connectRealtime(); }, delay);

  }

  function disconnectRealtime(){

    if (_ws){ try { _ws.close(); } catch(_){} _ws = null; }

    if (_wsTimer){ clearTimeout(_wsTimer); _wsTimer = null; }

    _wsRetry = 0;

  }

  function wsSend(payload){

    if (_ws && _ws.readyState === 1){

      try { _ws.send(JSON.stringify(payload)); } catch(_){}

    }

  }

  // ============== WS PING (server RTT for the orb HUD) ==============

  // We keep a single lightweight RTT measurement so the orb's "ping"

  // pill is always meaningful — even when the user is alone in a voice

  // channel, or hasn't joined one at all. The number is the WebSocket

  // round-trip in ms, refreshed every 3 seconds.

  let _wsPingTimer  = null;

  let _wsPingSentAt = 0;

  let _wsLastPingMs = null;

  function _startWsPingLoop(){

    if (_wsPingTimer) return;

    const tick = () => {

      if (typeof wsSend !== 'function') return;

      _wsPingSentAt = performance.now();

      try { wsSend({ type: 'ping', t: _wsPingSentAt }); } catch(_){}

    };

    tick();

    _wsPingTimer = setInterval(tick, 3000);

  }

  function _stopWsPingLoop(){

    if (_wsPingTimer){ clearInterval(_wsPingTimer); _wsPingTimer = null; }

    _wsLastPingMs = null;

  }

  function _onWsPong(msg){

    const t = (msg && typeof msg.t === 'number') ? msg.t : _wsPingSentAt;

    const rtt = Math.max(0, Math.round(performance.now() - t));

    _wsLastPingMs = rtt;

    const el = document.getElementById('orbHudPing');

    if (!el) return;

    el.textContent = rtt + 'ms';

    // Colour-code the HUD ping:

    //  good (<80ms)  → success green

    //  okay (<200ms) → warn amber

    //  bad  (>=200)  → danger red

    const span = el.closest('span');

    if (!span) return;

    span.classList.remove('ping-good','ping-okay','ping-bad');

    if (rtt < 80)       span.classList.add('ping-good');

    else if (rtt < 200) span.classList.add('ping-okay');

    else                span.classList.add('ping-bad');

  }


  function _handleRealtimeEvent(msg){

    switch (msg.type){

      case 'hello':

        // Server confirmed auth.

        break;

      case 'pong':

        _onWsPong(msg);

        break;

      case 'presence':

        _onPresence(msg);

        break;

      case 'dm:new':

        _onIncomingDm(msg);

        break;

      case 'dm:deleted':

        _onDmDeleted(msg);

        break;

      case 'dm:cleared':

        _onDmCleared(msg);

        break;

      case 'dm:edited':

        _onDmEdited(msg);

        break;

      case 'dm:read':

        _onDmRead(msg);

        break;

      case 'channel:message':

        _onChannelMessage(msg);

        break;

      case 'voice:join':

      case 'voice:leave':

        _onVoiceMembership(msg);

        break;

      case 'voice:kicked':

        _onVoiceKicked(msg);

        break;

      case 'server:member-joined':

      case 'server:member-left':

        _onServerMembership(msg);

        break;

      case 'friend:request':

        _onFriendRequest(msg);

        break;

      case 'friend:accepted':

        _onFriendAccepted(msg);

        break;

      case 'friend:removed':

        _onFriendRemoved(msg);

        break;

      case 'block:status':

        _onBlockStatus(msg);

        break;

      case 'profile:updated':

        _onProfileUpdated(msg);

        break;

      case 'dm:pin':

        _onDmPin(msg);

        break;

      case 'typing':

        _onTyping(msg);

        break;

      case 'voice-signal':

        if (typeof voice !== 'undefined' && voice.handleSignal) voice.handleSignal(msg);

        break;

      case 'channel:message:deleted':

        _onChannelMessageDeleted(msg);

        break;

      case 'server:pin':

        _onServerPin(msg);

        break;

      case 'server:category-added':

        _onServerCategoryAdded(msg);

        break;

      case 'server:category-deleted':

        _onServerCategoryDeleted(msg);

        break;

      case 'server:channel-added':

        _onServerChannelAdded(msg);

        break;

      case 'server:channel-deleted':

        _onServerChannelDeleted(msg);

        break;

      case 'server:updated':

        _onServerUpdated(msg);

        break;

      case 'server:kicked':

        _onServerKicked(msg);

        break;

      case 'server:deleted':

        _onServerDeleted(msg);

        break;

      case 'channel:pin':

        _onChannelPin(msg);

        break;

    }

  }

  function _onServerUpdated({ serverId, server }){

    if (!server) return;

    // Replace the in-memory server with the fresh authoritative copy.

    servers[serverId] = Object.assign(servers[serverId] || {}, server);

    // If the server didn't ship persisted roles, drop the cached copy so

    // ensureRoles() can rebuild owner/admin from membership. If the server

    // *did* ship roles (custom + persisted), `Object.assign` already wrote

    // them in — keep them as the new source of truth.

    if (!Array.isArray(server.roles)) delete servers[serverId].roles;

    // Re-materialise channelData entries for any new voice channels.

    (server.voiceChannels || []).forEach(vc => {

      if (channelData[vc.id]) return;

      const st = voiceStyles[vc.style] || voiceStyles.indigo;

      const m = (st.glow||'rgba(99,102,241,0.4)').match(/rgba\((\d+),(\d+),(\d+),/);

      channelData[vc.id] = {

        name: vc.name, users: [],

        color: 'rgba('+(m?m[1]:99)+','+(m?m[2]:102)+','+(m?m[3]:241)+',',

        planetGrad: st.grad, atmoColor: st.glow, orbiterColor: st.c,

        avBorder:'#fff', emoji:'🪐',

        tier: st.skin ? 'legendary' : 'common', skin: st.skin || undefined

      };

    });

    // Drop channelData rows whose voice channel has gone away.

    const liveVoiceIds = new Set((server.voiceChannels || []).map(v => v.id));

    Object.keys(channelData).forEach(k => {

      // Only drop entries that belong to THIS server. We can't tell from the

      // chKey alone, so we narrow by checking against the previous voice

      // channel list still attached to other servers.

      let belongsHere = false;

      const prev = servers[serverId];

      if (prev && Array.isArray(prev._oldVoice)) belongsHere = prev._oldVoice.includes(k);

      if (belongsHere && !liveVoiceIds.has(k)) delete channelData[k];

    });

    // Refresh affected UI surfaces.

    if (currentServer === serverId){

      if (typeof renderServerOverview === 'function') renderServerOverview();

      if (typeof renderServerRails === 'function') renderServerRails();

      if (currentTextChannel){

        const stillThere = (server.textChannels||[]).some(t => t.id === currentTextChannel);

        if (!stillThere){ currentTextChannel = null; goToServerMain(); }

        else if (typeof renderChannelStrip === 'function') renderChannelStrip();

      }

    }

    if (typeof renderHomeMyServers === 'function') renderHomeMyServers();

    if (typeof renderOrbSlides === 'function') renderOrbSlides();

    // If we're currently in a voice channel in this server and its

    // bitrate may have changed, push the new cap to every active

    // sender without renegotiation.

    if (inVoice && connectedChannel && typeof voice !== 'undefined' && voice.applyBitrate){

      const vc = (server.voiceChannels || []).find(v => v.id === connectedChannel);

      if (vc) voice.applyBitrate();

    }

  }

  function _onServerKicked({ serverId }){

    if (!servers[serverId]) return;

    // Drop the server from every place we keep state.

    if (currentServer === serverId){ currentServer = null; currentTextChannel = null; setPage('pageHome'); }

    delete servers[serverId];

    myServers = myServers.filter(s => s !== serverId);

    if (typeof renderServerRails === 'function') renderServerRails();

    if (typeof renderHomeMyServers === 'function') renderHomeMyServers();

    if (typeof renderOrbSlides === 'function') renderOrbSlides();

    showToast('You were removed from a server','warn');

  }

  function _onServerDeleted({ serverId }){

    if (!servers[serverId]) return;

    const wasOnIt = currentServer === serverId;

    if (wasOnIt){ currentServer = null; currentTextChannel = null; setPage('pageHome'); }

    delete servers[serverId];

    myServers = myServers.filter(s => s !== serverId);

    if (typeof renderServerRails === 'function') renderServerRails();

    if (typeof renderHomeMyServers === 'function') renderHomeMyServers();

    if (typeof renderOrbSlides === 'function') renderOrbSlides();

    showToast('A server you were in was deleted','warn');

  }

  function _onChannelPin({ serverId, channelId, pinnedMsgId, pinnedMsg, pinnedBy }){

    const s = servers[serverId]; if (!s) return;

    const tc = (s.textChannels||[]).find(t => t.id === channelId);

    if (!tc) return;

    tc.pinnedMsgId = pinnedMsgId || null;

    tc.pinnedMsg   = pinnedMsg   || null;

    tc.pinnedBy    = pinnedBy    || null;

    if (currentServer === serverId && currentTextChannel === channelId){

      if (typeof renderChannelView === 'function') renderChannelView();

    }

  }

  function _onChannelMessageDeleted({ serverId, channelId, messageId }){

    const key = serverId + '__' + channelId;

    const arr = serverChannelMessages[key];

    if (!arr) return;

    const m = arr.find(x => String(x.id) === String(messageId));

    if (m){ m.deleted = true; m.text = ''; }

    if (currentServer === serverId && currentTextChannel === channelId) renderChannelView();

  }

  function _onServerPin({ serverId, pinned }){

    const s = servers[serverId]; if (!s) return;

    s.pinned = pinned ? { text: pinned.text, by: pinned.by, time: pinned.time || 'just now' } : null;

    if (currentServer === serverId) renderServerOverview();

  }

  function _onServerCategoryAdded({ serverId, category }){

    const s = servers[serverId]; if (!s) return;

    s.categories = s.categories || [];

    if (!s.categories.find(c => c.id === category.id)){

      s.categories.push({ id: category.id, name: category.name, textChannels:[], voiceChannels:[] });

    }

    if (currentServer === serverId) renderServerOverview();

  }

  function _onServerCategoryDeleted({ serverId, categoryId }){

    const s = servers[serverId]; if (!s) return;

    s.categories = (s.categories||[]).filter(c => c.id !== categoryId);

    if (currentServer === serverId) renderServerOverview();

  }

  function _onServerChannelAdded({ serverId, channelKind, channel, categoryId }){

    const s = servers[serverId]; if (!s) return;

    if (channelKind === 'text'){

      s.textChannels = s.textChannels || [];

      if (!s.textChannels.find(t => t.id === channel.id)){

        s.textChannels.push({ id: channel.id, name: channel.name, style: channel.style || 'glow', unread:0 });

      }

      if (categoryId){

        const cat = (s.categories||[]).find(c => c.id === categoryId);

        if (cat){ cat.textChannels = cat.textChannels || []; if (!cat.textChannels.includes(channel.id)) cat.textChannels.push(channel.id); }

      }

    } else if (channelKind === 'voice'){

      s.voiceChannels = s.voiceChannels || [];

      if (!s.voiceChannels.find(v => v.id === channel.id)){

        s.voiceChannels.push({ id: channel.id, name: channel.name, style: channel.style || 'indigo' });

      }

      if (categoryId){

        const cat = (s.categories||[]).find(c => c.id === categoryId);

        if (cat){ cat.voiceChannels = cat.voiceChannels || []; if (!cat.voiceChannels.includes(channel.id)) cat.voiceChannels.push(channel.id); }

      }

      // Materialise channelData entry so the orb UI can find this voice channel.

      if (!channelData[channel.id]){

        const st = voiceStyles[channel.style] || voiceStyles.indigo;

        const m = (st.glow||'rgba(99,102,241,0.4)').match(/rgba\((\d+),(\d+),(\d+),/);

        channelData[channel.id] = {

          name: channel.name, users: [],

          color: 'rgba('+(m?m[1]:99)+','+(m?m[2]:102)+','+(m?m[3]:241)+',',

          planetGrad: st.grad, atmoColor: st.glow, orbiterColor: st.c,

          avBorder:'#fff', emoji:'🪐',

          tier: st.skin ? 'legendary' : 'common', skin: st.skin || undefined

        };

      }

    }

    if (currentServer === serverId) renderServerOverview();

    if (typeof renderOrbSlides === 'function') renderOrbSlides();

  }

  function _onServerChannelDeleted({ serverId, channelKind, channelId }){

    const s = servers[serverId]; if (!s) return;

    if (channelKind === 'text'){

      s.textChannels = (s.textChannels||[]).filter(t => t.id !== channelId);

      (s.categories||[]).forEach(c => { c.textChannels = (c.textChannels||[]).filter(x => x !== channelId); });

      delete serverChannelMessages[serverId+'__'+channelId];

      if (currentServer === serverId && currentTextChannel === channelId){

        currentTextChannel = null; goToServerMain();

      }

    } else if (channelKind === 'voice'){

      s.voiceChannels = (s.voiceChannels||[]).filter(v => v.id !== channelId);

      (s.categories||[]).forEach(c => { c.voiceChannels = (c.voiceChannels||[]).filter(x => x !== channelId); });

      if (channelData[channelId]) delete channelData[channelId];

      if (connectedChannel === channelId && typeof endVoiceCall === 'function') endVoiceCall();

    }

    if (currentServer === serverId) renderServerOverview();

    if (typeof renderOrbSlides === 'function') renderOrbSlides();

  }

  function _onPresence({ name, online }){

    // Mirror onto every conversation that maps to this user. We don't have

    // uid on conversations, so match by display name.

    Object.values(conversations).forEach(c => {

      if (c.name === name) c.online = !!online;

    });

    if (typeof renderHomeFriends === 'function') renderHomeFriends();

    if (typeof renderDmList === 'function') renderDmList();

    // For the open thread we only need to repaint the small subtitle —

    // calling renderConversation() here would nuke the whole transcript

    // (including any in-flight optimistic bubble waiting on a slow

    // network round-trip), which is exactly the "page reloaded after I

    // sent" flicker users hit. Keep the bubbles untouched and just

    // rewrite the "ONLINE / OFFLINE" line in the header.

    if (currentConversation && conversations[currentConversation] &&

        conversations[currentConversation].name === name){

      const conv = conversations[currentConversation];

      const sub = document.getElementById('dmHeadSubText');

      if (sub){

        sub.textContent = conv.isSaved

          ? 'PERSONAL NOTES · ONLY YOU'

          : (conv.online

              ? 'ONLINE · ENCRYPTED CHANNEL'

              : 'OFFLINE · LAST SEEN '+(conv.lastSeen || 'NOW').toUpperCase());

      }

    }

  }

  function _onIncomingDm({ message, from }){

    if (!message) return;

    // The peer's handle is what the frontend keys conversations by.

    const k = (message.peerHandle || '').replace(/^@/,'').toLowerCase();

    if (!k) return;

    if (!conversations[k]){

      conversations[k] = {

        uid: from ? String(from) : null,

        peerId: from ? String(from) : null,

        name: message.peerName || k,

        online: true, unread: 0,

        avColor: 'linear-gradient(135deg,#a78bfa,#1e1b4b)',

        initial: (message.peerName||k).charAt(0).toUpperCase(),

        handle: '@'+k, bio:''

      };

    } else if (from && !conversations[k].uid){

      conversations[k].uid = String(from);

      conversations[k].peerId = String(from);

    }

    if (!messages[k]) messages[k] = [];

    const incoming = {

      id: message.id,

      sender: 'them',

      text: message.text || '',

      time: message.time, day: message.day,

      status: 'delivered',

      payload: message.payload || null

    };

    _expandChannelMessage(incoming); // share the expander used for text channels

    messages[k].push(incoming);

    if (currentConversation !== k){

      conversations[k].unread = (conversations[k].unread || 0) + 1;

    }

    bumpDmList(k);

    if (typeof renderDmList === 'function') renderDmList();

    // Repaint the open thread. renderConversation()'s fast-path will

    // detect this is just an append and add a single bubble in place,

    // leaving any optimistic outgoing bubble (the clock icon during a

    // slow send) untouched.

    if (currentConversation === k && typeof renderConversation === 'function') renderConversation();

    if (typeof renderMarkedPanel === 'function') renderMarkedPanel();

    if (typeof updateBadges === 'function') updateBadges();

    // Browser notification — only when the user isn't viewing this

    // conversation. Privacy "show message content" toggle hides the

    // preview body. The tab-focused case is handled inside

    // showBrowserNotification, which silently skips when the tab has

    // focus; the read-receipt sound still plays here for that case.

    if (currentConversation !== k){

      const allowed = notificationAllowed('dms', k);

      if (allowed){

        const senderName = (conversations[k] && conversations[k].name) || k;

        const showContent = notifSettings.master.showContent;

        const body = showContent

          ? ((message.text || '').slice(0, 140) || 'New direct message')

          : 'New direct message';

        // Use the sender's uploaded avatar URL if we have one. The

        // Notifications API only accepts a real image URL, so for users

        // whose avatar is just a gradient + initial we fall back to the

        // app icon (which carries the ORBLOOD brand). The favicon is

        // used as the small "badge" so the OS shows our brand even when

        // the icon is the contact's photo.

        const senderAvatar = (conversations[k] && conversations[k].avImage) || null;

        const fired = showBrowserNotification({

          title: senderName,

          body, tag: 'dm:'+k,

          icon:  senderAvatar || '/favicon.ico',

          badge: '/favicon.ico',

          onclick: () => {

            try { setPage('pageMessages'); openConversation(k); } catch(_){}

          },

        });

        if (fired && notifSettings.master.sound) _playNotifSound();

      }

    } else {

      _playNotifSound();

    }

  }

  // Peer just opened the thread and read up through `upToId`. Walk our copy

  // of the conversation, flip every "delivered" outgoing bubble to "read",

  // and patch the status icon in-place so the second tick lights up without

  // rebuilding the transcript.

  function _onDmRead({ from, upToId }){

    if (!from) return;

    const fromKey = String(from);

    // The peer key in `conversations` is keyed by handle most of the time,

    // not user id, so search across every open thread for any message with

    // sender 'me' that the peer has now read.

    Object.keys(messages).forEach(k => {

      const arr = messages[k];

      if (!arr || !arr.length) return;

      let touched = false;

      for (const m of arr){

        if (m.sender !== 'me') continue;

        // upToId is the server max id at read time; tmp_ ids never made it

        // there, so we leave them alone.

        if (typeof m.id === 'string' && m.id.startsWith('tmp_')) continue;

        if (Number(m.id) > Number(upToId || 0)) continue;

        if (m.status !== 'read'){ m.status = 'read'; touched = true; if (k === currentConversation) _patchDmBubbleInPlace(k, m.id, m); }

      }

      if (touched && k !== currentConversation) invalidateDmCache(k);

    });

  }

  // Peer edited one of their own messages — find by id and update text.

  // Patches the bubble's body in-place; full re-render is overkill and

  // causes the same flash the original send/receive bug had.

  function _onDmEdited({ from, messageId, text }){

    if (messageId === undefined || messageId === null) return;

    const target = String(messageId);

    let touched = false;

    Object.keys(messages).forEach(k => {

      const arr = messages[k] || [];

      const m = arr.find(x => String(x.id) === target);

      if (m){

        m.text = text || ''; m.edited = true; touched = true;

        if (k === currentConversation){

          // Update the body text inside the bubble without recreating it.

          const msgsEl = document.getElementById('dmMsgs');

          const bubble = msgsEl && msgsEl.querySelector('[data-msg-row="'+CSS.escape(target)+'"] .dm-bubble');

          if (bubble){

            // Preserve forward tag + reply preview if present, only swap

            // the trailing text node.

            const fwd = bubble.querySelector('.dm-fwd-tag');

            const reply = bubble.querySelector('.dm-reply-preview');

            bubble.classList.add('edited');

            // Drop everything except the preserved chips, then append text.

            Array.from(bubble.childNodes).forEach(n => bubble.removeChild(n));

            if (fwd) bubble.appendChild(fwd);

            if (reply) bubble.appendChild(reply);

            bubble.appendChild(document.createTextNode(text || ''));

          } else {

            // Bubble not in DOM (different scroll, virtualised, etc.): drop

            // the cache so the next renderConversation rebuilds.

            invalidateDmCache(k);

          }

        } else {

          invalidateDmCache(k);

        }

      }

    });

    if (touched && typeof renderDmList === 'function') renderDmList();

  }

  // Peer pushed a "this single message was deleted" — find by id and soft-

  // delete it locally so the bubble flips to the placeholder without a reload.

  function _onDmDeleted({ from, messageId }){

    if (messageId === undefined || messageId === null) return;

    // Patch the soft-delete in-place (replace bubble body with the standard

    // "Message deleted" placeholder + remove hover actions). Falls through

    // to a cache-invalidate when the bubble isn't in the DOM.

    const target = String(messageId);

    let touched = false;

    Object.keys(messages).forEach(k => {

      const arr = messages[k] || [];

      const m = arr.find(x => String(x.id) === target);

      if (m){

        m.deleted = true; m.text = ''; touched = true;

        if (k === currentConversation){

          const msgsEl = document.getElementById('dmMsgs');

          const row = msgsEl && msgsEl.querySelector('[data-msg-row="'+CSS.escape(target)+'"]');

          if (row){

            const wrap = row.querySelector('.dm-bubble-wrap');

            if (wrap){

              wrap.innerHTML = '<div class="dm-bubble deleted" data-msg-id="'+target+'">Message deleted</div>'

                + '<div class="dm-bubble-meta"><span></span></div>';

            }

            const acts = row.querySelector('.dm-bubble-hover-actions');

            if (acts) acts.remove();

          } else {

            invalidateDmCache(k);

          }

        } else {

          invalidateDmCache(k);

        }

      }

    });

    if (touched && typeof renderDmList === 'function') renderDmList();

  }

  // Peer cleared the entire conversation. Find the thread by the sender's

  // uid (we map uid → handle via the snapshot's `peers` table when we have

  // it; otherwise just blast every conversation that matches by name).

  function _onDmCleared({ from }){

    // Find the conversation key whose peer uid matches the sender. We don't

    // store uid → conversation key, so fall back to scanning conversations

    // that have a backend uid attached (set by /me/snapshot hydration).

    const key = Object.keys(conversations).find(k => {

      const c = conversations[k];

      return c && (String(c.uid||'') === String(from) || c.peerId === from);

    });

    const target = key || null;

    if (target && messages[target]){

      messages[target] = [];

      if (currentConversation === target && typeof renderConversation === 'function') renderConversation();

      if (typeof renderDmList === 'function') renderDmList();

      showToast('The other person cleared this chat', 'warn');

    }

  }

  // Lift fields from the JSON `payload` blob into top-level message keys so

  // the renderer can find type/serverCard/channelCard/etc. without changing

  // every render path. Used by the realtime push, the openTextChannel fetch

  // and the optimistic send-echo reconciliation.

  function _expandChannelMessage(m){

    if (!m) return m;

    let p = m.payload;

    if (typeof p === 'string'){ try { p = JSON.parse(p); } catch(_){} }

    if (p && typeof p === 'object'){

      if (p.type) m.type = m.type || p.type;

      if (p.forwarded) m.forwarded = true;

      if (p.serverCard)  m.serverCard  = m.serverCard  || p.serverCard;

      if (p.channelCard) m.channelCard = m.channelCard || p.channelCard;

      if (p.userCard)    m.userCard    = m.userCard    || p.userCard;

      if (p.src && !m.src) m.src = p.src;

      if (p.caption && !m.caption) m.caption = p.caption;

    }

    return m;

  }

  function _onChannelMessage({ serverId, channelId, message }){

    const key = serverId + '__' + channelId;

    if (!serverChannelMessages[key]) serverChannelMessages[key] = [];

    // Skip if this is the echo of our own send (REST already added it).

    if (message.user === selfProfile.name) return;

    _expandChannelMessage(message);

    serverChannelMessages[key].push(message);

    const isHere = currentServer === serverId && currentTextChannel === channelId;

    if (isHere && typeof renderChannelView === 'function'){

      renderChannelView();

    } else {

      // Bump unread on the channel.

      const s = servers[serverId];

      if (s){

        const tc = (s.textChannels||[]).find(t => t.id === channelId);

        if (tc) tc.unread = (tc.unread || 0) + 1;

        if (typeof renderServerOverview === 'function' && currentServer === serverId) renderServerOverview();

        if (typeof updateBadges === 'function') updateBadges();

      }

    }

    // Browser notification dispatch — only when the user isn't already

    // viewing the channel. Mentions get their own (more permissive)

    // category; a plain channel message uses the textChannels category.

    if (!isHere){

      const text = message.text || '';

      const myHandle = (selfProfile.handle || '').replace(/^@/,'').toLowerCase();

      const myName   = (selfProfile.name || '').toLowerCase();

      const isMention = !!myHandle && (

        text.toLowerCase().includes('@'+myHandle) ||

        (myName && text.toLowerCase().includes('@'+myName))

      );

      const category = isMention ? 'mentions' : 'textChannels';

      const allowed = notificationAllowed(category, channelId);

      if (allowed){

        const s = servers[serverId];

        const tc = s && (s.textChannels||[]).find(t => t.id === channelId);

        const chName = tc ? '#'+tc.name : 'a channel';

        const userName = message.user || 'Someone';

        const showContent = notifSettings.master.showContent;

        const title = isMention

          ? userName + ' mentioned you in ' + chName

          : userName + ' in ' + chName;

        const body = showContent

          ? ((text || '').slice(0, 140) || 'New message')

          : (isMention ? 'You were mentioned' : 'New message');

        // Resolve the sender's avatar across known conversations so the

        // notification shows their face when they have one. Falls back

        // to the app icon (favicon) when no image is available.

        const senderAv = (() => {

          const a = (typeof resolveUserAvatar === 'function') ? resolveUserAvatar(message.user || '') : null;

          if (a && a.isImage){

            const m = (a.bg || '').match(/url\(([^)]+)\)/);

            if (m && m[1]) return m[1].replace(/^['"]|['"]$/g,'');

          }

          return null;

        })();

        const fired = showBrowserNotification({

          title, body, tag: 'ch:'+channelId,

          icon:  senderAv || '/favicon.ico',

          badge: '/favicon.ico',

          onclick: () => {

            try { selectServer(serverId); selectChannel(channelId); } catch(_){}

          },

        });

        if (fired && notifSettings.master.sound) _playNotifSound();

      }

    }

  }

  // The admin / mod kicked us out of a voice channel — tear down our local

  // call so the WebRTC peer connections close, the orb shows us as gone, and

  // the user gets a heads-up. The peers see this as a regular voice:leave.

  function _onVoiceKicked({ serverId, channelId }){

    const wasInThisCall = inVoice && connectedChannel === channelId;

    showToast('You were kicked from the voice channel', 'warn');

    if (wasInThisCall && typeof endVoiceCall === 'function'){

      try { endVoiceCall(); } catch(_){}

    }

    // Drop our name from the local channelData snapshot too so the orb

    // updates immediately even before the voice:leave fan-out arrives.

    if (channelData[channelId] && Array.isArray(channelData[channelId].users)){

      channelData[channelId].users = channelData[channelId].users.filter(u => u !== selfProfile.name);

    }

    if (typeof updateOrbStates === 'function') updateOrbStates();

    if (typeof renderOrbSlides === 'function') renderOrbSlides();

    if (typeof renderServerOverview === 'function' && currentServer === serverId) renderServerOverview();

    if (typeof renderVoiceUsers === 'function' && voiceUsersSidebarOpen) renderVoiceUsers();

  }

  function _onVoiceMembership({ type, serverId, channelId, members }){

    const s = servers[serverId];

    if (!s) return;

    const ch = (s.voiceChannels||[]).find(v => v.id === channelId);

    if (ch && channelData[ch.id]){

      channelData[ch.id].users = (members||[]).slice();

    }

    // Re-render every surface that can show a voice channel's roster so

    // remote join/leave events reflect immediately without needing the

    // viewer to refresh or click into the server.

    if (typeof updateOrbStates === 'function') updateOrbStates();

    if (typeof renderOrbSlides === 'function') renderOrbSlides();

    if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

    if (typeof renderMarkedPanel === 'function') renderMarkedPanel();

    if (typeof renderServerOverview === 'function' && currentServer === serverId) renderServerOverview();

    if (typeof renderVoiceUsers === 'function' && voiceUsersSidebarOpen) renderVoiceUsers();

    if (typeof renderMembers === 'function' && membersOpen && currentServer === serverId) renderMembers();



    // For voice signaling: when someone joins our channel, voice.onPeerJoined

    // fires and we initiate an offer.

    if (type === 'voice:join' && typeof voice !== 'undefined' && voice.onPeerJoined){

      voice.onPeerJoined(serverId, channelId, members);

    }

    if (type === 'voice:leave' && typeof voice !== 'undefined' && voice.onPeerLeft){

      voice.onPeerLeft(serverId, channelId, members);

    }

  }

  function _onServerMembership({ type, serverId, name }){

    const s = servers[serverId];

    if (!s) return;

    if (type === 'server:member-joined'){

      if (!(s.members||[]).includes(name)) s.members = (s.members||[]).concat([name]);

    } else {

      s.members = (s.members||[]).filter(m => m !== name);

      s.admins  = (s.admins ||[]).filter(m => m !== name);

    }

    if (currentServer === serverId){

      if (typeof renderServerOverview === 'function') renderServerOverview();

      if (typeof renderMembers === 'function' && membersOpen) renderMembers();

    }

  }

  function _onFriendRequest({ request }){

    if (!request) return;

    // Avoid duplicates if the user already has it from the snapshot.

    if (friendRequests.incoming.some(r => r.id === request.id)) return;

    friendRequests.incoming.push(request);

    if (typeof renderFriendRequestsHome === 'function') renderFriendRequestsHome();

    if (typeof renderFriendsLists === 'function') renderFriendsLists();

    if (typeof updateBadges === 'function') updateBadges();

    if (notificationAllowed('friendRequests')){

      const fired = showBrowserNotification({

        title: 'Friend request',

        body:  request.name + ' wants to be friends',

        tag:   'fr:'+(request.id||request.name),

        onclick: () => { try { setPage('pageSettings'); setSettingsTab('incoming'); } catch(_){} },

      });

      if (fired && notifSettings.master.sound) _playNotifSound();

    }

  }

  function _onFriendAccepted({ peer }){

    if (!peer) return;

    const k = (peer.handle||'').replace(/^@/,'').toLowerCase();

    if (k && !friendsList.includes(k)) friendsList.push(k);

    friendRequests.outgoing = friendRequests.outgoing.filter(r =>

      (r.handle||'').replace(/^@/,'').toLowerCase() !== k);

    const isOnlinePeer = !!peer.online;

    if (k && !conversations[k]){

      conversations[k] = {

        name: peer.name,

        online: isOnlinePeer, unread: 0,

        avColor: peer.avColor,

        avImage: peer.avImage || null,

        initial: peer.initial,

        handle: peer.handle, bio: peer.bio || ''

      };

    } else if (k){

      conversations[k].online = isOnlinePeer;

    }

    if (typeof renderHomeFriends === 'function') renderHomeFriends();

    if (typeof renderFriendRequestsHome === 'function') renderFriendRequestsHome();

    if (typeof renderFriendsLists === 'function') renderFriendsLists();

    if (typeof renderDmList === 'function') renderDmList();

    if (typeof updateBadges === 'function') updateBadges();

    showToast(peer.name+' accepted your friend request','success');

    _playNotifSound();

  }

  // The other person unfriended us — drop them from the friend list locally

  // so the bubble disappears without a refresh. We deliberately keep the

  // conversation thread + history in case the user wants to keep messaging.

  function _onFriendRemoved({ peerId, peerHandle }){

    const k = peerHandle ? peerHandle.replace(/^@/, '').toLowerCase() : null;

    if (k){

      friendsList = friendsList.filter(x => x !== k);

      if (conversations[k]) conversations[k].isFriend = false;

    }

    if (typeof renderHomeFriends === 'function') renderHomeFriends();

    if (typeof renderFriendsLists === 'function') renderFriendsLists();

    if (typeof renderDmList === 'function') renderDmList();

    if (typeof updateBadges === 'function') updateBadges();

  }

  // Peer just blocked / unblocked us. Update blockedByUsers and lock the

  // compose box live so the user can't keep typing into a dead thread.

  // Peer updated their public profile (avatar / banner / handle / bio /

  // name / baseColor / rank). Patch every conversation row that points

  // at this user, plus every server membership that lists their old name,

  // and re-paint surfaces that show their avatar.

  function _onProfileUpdated({ uid, name, handle, bio, baseColor, rank, avImage, bannerImage }){

    if (!uid) return;

    const oldHandleKey = Object.keys(conversations).find(k => {

      const c = conversations[k];

      return c && (String(c.uid||'') === String(uid) || String(c.peerId||'') === String(uid));

    });

    const newHandleKey = (handle || '').replace(/^@/, '').toLowerCase();

    if (oldHandleKey){

      const c = conversations[oldHandleKey];

      if (name)      c.name = name;

      if (handle)    c.handle = handle;

      if (typeof bio === 'string') c.bio = bio;

      if (baseColor) c.baseColor = baseColor;

      if (rank)      c.rank = rank;

      c.avImage      = avImage    || null;

      c.bannerImage  = bannerImage || null;

      if (baseColor){

        c.avColor = 'linear-gradient(135deg,'+baseColor+',#1e1b4b)';

      }

      // If their handle changed, move the conversation under the new key.

      if (newHandleKey && newHandleKey !== oldHandleKey){

        conversations[newHandleKey] = c;

        delete conversations[oldHandleKey];

        if (messages[oldHandleKey]){

          messages[newHandleKey] = messages[oldHandleKey];

          delete messages[oldHandleKey];

        }

        if (currentConversation === oldHandleKey) currentConversation = newHandleKey;

      }

    }

    // Replace the old display name in every server membership list so

    // their avatar repaints with the new image where the renderer keys

    // off m.user.

    if (name){

      Object.values(servers).forEach(s => {

        if (Array.isArray(s.memberDetails)){

          s.memberDetails.forEach(md => { if (String(md.id) === String(uid)) md.name = name; });

        }

      });

    }

    if (typeof renderConversation === 'function' && currentConversation) renderConversation();

    if (typeof renderDmList === 'function') renderDmList();

    if (typeof renderHomeFriends === 'function') renderHomeFriends();

    if (typeof renderMarkedPanel === 'function') renderMarkedPanel();

    if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

    if (typeof renderOrbSlides === 'function') renderOrbSlides();

    if (typeof renderServerOverview === 'function' && currentServer) renderServerOverview();

    if (typeof renderVoiceUsers === 'function' && voiceUsersSidebarOpen) renderVoiceUsers();

  }

  // Server fan-out: someone (us or the peer) pinned/unpinned a DM message.

  // We can't trivially map thread_id back to peerKey here, so the WS

  // payload includes the message id; we re-render every conversation

  // view that's open and let renderConversation pick up the new value

  // from dmPinnedByConv on next paint.

  function _onDmPin({ threadId, messageId }){

    void threadId;

    // Cheap approach: walk every conversation and find the one whose

    // history includes that message id (server-only path), or just

    // re-render the active conversation. The next snapshot will

    // reconcile any drift.

    if (currentConversation && messages[currentConversation]){

      const has = (messages[currentConversation]||[]).some(m => String(m.id) === String(messageId));

      if (has){

        dmPinnedByConv[currentConversation] = messageId || null;

        if (typeof renderConversation === 'function') renderConversation();

      }

    }

  }

  function _onBlockStatus({ handle, on }){

    const k = (handle || '').replace(/^@/, '').toLowerCase();

    if (!k) return;

    if (on) blockedByUsers.add(k);

    else blockedByUsers.delete(k);

    if (currentConversation === k && typeof renderConversation === 'function') renderConversation();

    if (typeof renderDmList === 'function') renderDmList();

  }

  function _onTyping({ from }){

    const k = (from||'').replace(/^@/,'').toLowerCase();

    const conv = conversations[k]; if (!conv) return;

    conv.typing = true;

    if (typeof renderDmList === 'function') renderDmList();

    clearTimeout(conv._typingTimer);

    conv._typingTimer = setTimeout(() => {

      conv.typing = false;

      if (typeof renderDmList === 'function') renderDmList();

    }, 4000);

  }

  function _playNotifSound(){

    // Reuse the existing voice cue if available; otherwise silent.

    try { if (typeof playVoiceCue === 'function') playVoiceCue('join'); } catch(_){}

  }

  // ============== VOICE (WebRTC + ExpressTurn) ==============

  //

  // One peer connection per remote user in the same voice channel.

  // The server is the signaling relay (voice-signal envelope over the WS).

  //

  //   voice.start(serverId, channelId)  → grab mic + announce to peers

  //   voice.stop()                      → tear down all PCs + release mic

  //   voice.onPeerJoined / onPeerLeft   → called by the WS handler

  //   voice.handleSignal                → consume a relayed offer/answer/ICE

  //

  // Audio elements are appended to <body> so the user hears every remote.

  const voice = (() => {

    let localStream = null;

    let serverId = null, channelId = null;

    const peers = new Map();    // peerName → { pc, audioEl, polite }

    let iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];

    async function loadIceConfig(){

      if (!backend.isConfigured()) return;

      const r = await fetch(_backendBase()+'/voice/config', {

        headers: { 'Authorization': 'Bearer '+(backend.token.read()||'') }

      }).then(x => x.json()).catch(()=>null);

      if (r && Array.isArray(r.iceServers) && r.iceServers.length) iceServers = r.iceServers;

    }

    // Look up the configured bitrate for the active voice channel.

    // Defaults to 64 kbps when nothing is set, mirroring the server.

    function _currentChannelBitrate(){

      if (!serverId || !channelId) return 64;

      const s = servers[serverId]; if (!s) return 64;

      const vc = (s.voiceChannels || []).find(v => v.id === channelId);

      return (vc && Number(vc.bitrate)) || 64;

    }

    // Set the maximum send bitrate for the audio sender on this PC.

    // This is a soft cap — the encoder may use less for silent audio.

    async function _applyBitrateToPc(pc){

      const kbps = _currentChannelBitrate();

      try {

        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');

        if (!sender) return;

        const params = sender.getParameters();

        if (!params.encodings || !params.encodings.length){

          params.encodings = [{}];

        }

        params.encodings[0].maxBitrate = kbps * 1000;

        await sender.setParameters(params);

      } catch(_){}

    }

    // Re-apply the bitrate cap on every active peer. Called when the

    // server broadcasts a server-update with a new voice-channel value.

    function _applyBitrateToAllPeers(){

      peers.forEach(rec => { _applyBitrateToPc(rec.pc).catch(()=>{}); });

    }

    function _buildAudioConstraints(){

      // Reflect the user's Voice Settings toggles + selected input device

      // into the mic constraints so the actual call honours Echo

      // Cancellation, Noise Suppression and Auto Gain Control.

      const vs = (typeof voiceSettings === 'object' && voiceSettings) || {};

      return {

        deviceId: vs.inputDevice && vs.inputDevice !== 'default'

          ? { exact: vs.inputDevice } : undefined,

        echoCancellation: 'echo' in vs ? !!vs.echo  : true,

        noiseSuppression: 'noise' in vs ? !!vs.noise : true,

        autoGainControl:  'agc'   in vs ? !!vs.agc   : false,

      };

    }

    // Build a processed MediaStream by wiring the raw mic through the

    // same Web Audio chain the playback test uses, so what the peer

    // hears matches the self-monitor preview exactly.

    //

    // Important: the noise gate's GainNode starts at 1, not 0. Earlier

    // versions defaulted to 0 and only opened on the first rAF tick,

    // which made background-tab sessions silent because rAF doesn't

    // fire when the tab is hidden. Starting at 1 means worst case we

    // pass audio through; the analyser loop tightens it once visible.

    let _callCtx = null;

    let _callGateRAF = 0;

    let _callChain = null;   // { highpass, lowpass, compressor, agc, gate, analyser }

    let _callNoiseFloor = 0.02;

    function _applyCallStrengths(){

      const c = _callChain; if (!c || !_callCtx) return;

      const nTen = voiceSettings.noise ? voiceSettings.noiseStr/100 : 0;

      const eTen = voiceSettings.echo  ? voiceSettings.echoStr /100 : 0;

      const aTen = voiceSettings.agc   ? voiceSettings.agcStr  /100 : 0;

      c.highpass  .frequency.setTargetAtTime(40   + nTen * 180,  _callCtx.currentTime, 0.05);

      c.lowpass   .frequency.setTargetAtTime(12000 - nTen * 6500, _callCtx.currentTime, 0.05);

      c.compressor.threshold.setTargetAtTime(-12  - eTen * 38,   _callCtx.currentTime, 0.05);

      c.compressor.ratio    .setTargetAtTime(2    + eTen * 6,    _callCtx.currentTime, 0.05);

      c.compressor.knee     .setTargetAtTime(24   - eTen * 18,   _callCtx.currentTime, 0.05);

      c.agc.gain.setTargetAtTime(1 + aTen * 1.5, _callCtx.currentTime, 0.05);

    }

    function _startCallGate(){

      const c = _callChain; if (!c || !_callCtx || !c.analyser) return;

      const data = new Uint8Array(c.analyser.fftSize);

      let lastT = performance.now();

      _callNoiseFloor = 0.02;

      const tick = () => {

        if (!_callCtx || _callCtx.state === 'closed') return;

        c.analyser.getByteTimeDomainData(data);

        let peak = 0;

        for (let i=0;i<data.length;i++){

          const v = Math.abs(data[i]-128)/128;

          if (v > peak) peak = v;

        }

        const now = performance.now();

        const dt = Math.min(0.1, (now - lastT)/1000);

        lastT = now;

        const quiet = peak < _callNoiseFloor * 4;

        if (quiet) _callNoiseFloor += (peak - _callNoiseFloor) * (dt/5);

        else       _callNoiseFloor += (peak - _callNoiseFloor) * (dt/60);

        _callNoiseFloor = Math.max(0.002, Math.min(0.1, _callNoiseFloor));

        const t = voiceSettings.noise ? voiceSettings.noiseStr/100 : 0;

        const openMult = 1.2 + t * 6.8;

        const open = t < 0.1 ? true : peak > _callNoiseFloor * openMult;

        c.gate.gain.setTargetAtTime(open ? 1 : 0, _callCtx.currentTime, open ? 0.003 : 0.08);

        _callGateRAF = requestAnimationFrame(tick);

      };

      _callGateRAF = requestAnimationFrame(tick);

    }

    function _stopCallGate(){

      if (_callGateRAF){ cancelAnimationFrame(_callGateRAF); _callGateRAF = 0; }

    }

    function _buildProcessedCallStream(raw){

      try {

        const AC = window.AudioContext || window.webkitAudioContext;

        _callCtx = new AC({ latencyHint: 'interactive' });

        const src = _callCtx.createMediaStreamSource(raw);

        const highpass = _callCtx.createBiquadFilter();   highpass.type = 'highpass';

        const lowpass  = _callCtx.createBiquadFilter();   lowpass.type  = 'lowpass';

        const comp     = _callCtx.createDynamicsCompressor();

        const agc      = _callCtx.createGain();

        const gate     = _callCtx.createGain(); gate.gain.value = 1;

        const analyser = _callCtx.createAnalyser(); analyser.fftSize = 1024;

        const dest     = _callCtx.createMediaStreamDestination();

        src.connect(highpass);

        highpass.connect(lowpass);

        lowpass.connect(comp);

        comp.connect(agc);

        agc.connect(analyser);

        agc.connect(gate);

        gate.connect(dest);

        _callChain = { highpass, lowpass, compressor: comp, agc, gate, analyser };

        _applyCallStrengths();

        _startCallGate();

        const out = dest.stream;

        out._rawStream = raw;

        return out;

      } catch(e){

        console.warn('[voice] processed call stream build failed:', e && e.message);

        return raw;

      }

    }

    function _destroyCallChain(){

      _stopCallGate();

      if (_callCtx){ try { _callCtx.close(); } catch(_){} _callCtx = null; }

      _callChain = null;

    }

    async function ensureMic(){

      if (localStream) return localStream;

      let raw = null;

      try {

        raw = await navigator.mediaDevices.getUserMedia({ audio: _buildAudioConstraints() });

      } catch(e){

        showToast('Microphone permission denied','warn');

        throw e;

      }

      localStream = _buildProcessedCallStream(raw);

      return localStream;

    }


    // Re-acquire the mic with the user's latest processing toggles and

    // swap the new audio track into every active peer connection in

    // place — no SDP renegotiation, no audio drop. Used by the Voice

    // Settings modal so flipping a toggle takes effect mid-call.

    async function reconfigureMic(){

      if (!localStream) return false;

      // Strength tweaks alone don't require getUserMedia — the chain

      // updates its parameters live. Only re-acquire when the user

      // changed device or flipped a boolean toggle that the browser

      // pipeline owns (echo/noise/AGC constraints).

      _applyCallStrengths();

      // For boolean toggles + device changes, do a full swap.

      let rawNext = null;

      try {

        rawNext = await navigator.mediaDevices.getUserMedia({ audio: _buildAudioConstraints() });

      } catch(e){

        console.warn('[voice] reconfigureMic getUserMedia failed:', e && e.message);

        return false;

      }

      // Tear down the old Web Audio chain and build a fresh one over

      // the new mic so the new echo/noise/agc browser constraints

      // actually apply.

      _destroyCallChain();

      const next = _buildProcessedCallStream(rawNext);

      const newTrack = next.getAudioTracks()[0]; if (!newTrack) return false;

      peers.forEach(rec => {

        const sender = rec.pc.getSenders().find(s => s.track && s.track.kind === 'audio');

        if (sender) sender.replaceTrack(newTrack).catch(()=>{});

      });

      // Stop the old raw + processed tracks AFTER swap so there's no

      // silence window.

      try {

        if (localStream._rawStream) localStream._rawStream.getTracks().forEach(t => t.stop());

        localStream.getTracks().forEach(t => t.stop());

      } catch(_){}

      localStream = next;

      // Preserve the muted-flag — if the user was muted, keep them muted.

      if (typeof muted !== 'undefined' && muted){

        localStream.getAudioTracks().forEach(t => t.enabled = false);

      }

      return true;

    }

    function newPc(peerName){

      const pc = new RTCPeerConnection({ iceServers });

      const audioEl = document.createElement('audio');

      audioEl.autoplay = true;

      audioEl.playsInline = true;

      audioEl.dataset.voicePeer = peerName;

      // Some browsers ignore autoplay on freshly-created elements that

      // never received a user-gesture in the same stack frame. Joining

      // a voice channel itself is a click, so explicitly calling

      // play() with a catch is the canonical workaround.

      document.body.appendChild(audioEl);

      pc.ontrack = ev => {

        audioEl.srcObject = ev.streams[0];

        // Honour the user's current deafened state when a new peer joins

        // mid-deafen — otherwise they'd hear that one peer until they

        // re-toggled.

        if (typeof deafened !== 'undefined' && deafened) audioEl.muted = true;

        const p = audioEl.play();

        if (p && typeof p.catch === 'function') p.catch(err => {

          console.warn('[voice] audio play blocked:', err && err.message);

          showToast('Browser blocked audio playback. Click anywhere on the page.', 'warn');

        });

      };

      pc.onicecandidate = ev => {

        if (ev.candidate){

          _signal(peerName, { kind:'ice', candidate: ev.candidate });

        }

      };

      // Watch ICE state to drive the orb status indicator (idle /

      // connecting / connected / reconnecting / failed) and to trigger

      // an automatic ICE restart on a transient drop — Chrome's

      // getStats() considers 'failed' permanent, but a single restart

      // recovers most NAT-rebind cases without user action.

      pc.oniceconnectionstatechange = () => {

        const state = pc.iceConnectionState;

        const rec = peers.get(peerName);

        if (!rec) return;

        rec.iceState = state;

        if (state === 'connected' || state === 'completed'){

          rec.reconnectAttempts = 0;

        } else if (state === 'failed' || state === 'disconnected'){

          // فقط طرف impolite restart می‌کنه که دو طرف با هم نجنگن

          if (!rec.polite && (rec.reconnectAttempts || 0) < 3){

            rec.reconnectAttempts = (rec.reconnectAttempts || 0) + 1;

            // failed → فوری restart؛ disconnected → ۱.۵ ثانیه صبر (شاید خودش recover بشه)

            const delay = state === 'failed' ? 0 : 1500;

            console.warn('[voice] ICE '+state+', restart in '+delay+'ms (attempt '+rec.reconnectAttempts+')');

            setTimeout(() => {

              if (rec.iceState === 'connected' || rec.iceState === 'completed'){

                rec.reconnectAttempts = 0; return;

              }

              try {

                pc.restartIce && pc.restartIce();

                _makeOffer(peerName).catch(()=>{});

              } catch(_){}

            }, delay);

          }

        }

        _recomputeVoiceStatus();

        _refreshConnectingDots();

      };

      pc.onconnectionstatechange = () => {

        const rec = peers.get(peerName);

        if (rec) rec.connState = pc.connectionState;

        _recomputeVoiceStatus();

        _refreshConnectingDots();

      };

      if (localStream){

        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

      }

      // Apply this voice channel's configured bitrate (kbps) to the

      // outgoing audio sender. Uses RTCRtpSender.setParameters which

      // works without renegotiation.

      _applyBitrateToPc(pc).catch(()=>{});

      const rec = {

        pc, audioEl, polite: false,

        iceState: 'new', connState: 'new',

        reconnectAttempts: 0, rtt: null,

        // ICE candidates that arrive before the remote SDP has been

        // applied (very common with our signalling order); we queue

        // them on the rec and flush after setRemoteDescription.

        pendingIce: [],

        hasRemoteDesc: false,

      };

      peers.set(peerName, rec);

      _refreshConnectingDots();

      return rec;

    }


    // Paints/removes the small "…" three-dot spinner on the carousel

    // avatars for peers we're still negotiating with. The spinner sits

    // on top of the planet so the user sees who's still loading without

    // staring at the status pill.

    function _refreshConnectingDots(){

      if (typeof updateOrbStates === 'function') updateOrbStates();

      // Mirror onto the Voice Users sidebar too — it builds its own

      // avatar grid, so we re-render whenever a peer's state flips.

      if (typeof renderVoiceUsers === 'function' && typeof voiceUsersSidebarOpen !== 'undefined' && voiceUsersSidebarOpen){

        renderVoiceUsers();

      }

    }


    // Tell callers (renderers) whether a given peer is still negotiating

    // so they can paint the connecting-dots indicator. Exposed via the

    // returned interface as `voice.peerState(name)`.

    function _peerState(peerName){

      const rec = peers.get(peerName);

      if (!rec) return null;

      if (rec.iceState === 'connected' || rec.iceState === 'completed') return 'connected';

      if (rec.iceState === 'failed')        return 'failed';

      if (rec.iceState === 'disconnected')  return 'reconnecting';

      return 'connecting';

    }


    // Aggregate the connection state across all peers in the call into a

    // single status the orb panel renders ("CONNECTING…", "CONNECTED",

    // "RECONNECTING…", "FAILED"). The order of precedence is biased

    // toward the worst state so the user sees the real problem.

    function _recomputeVoiceStatus(){

      if (!inVoice){ setVoiceStatus('idle'); return; }

      const states = [];

      peers.forEach(rec => states.push(rec.iceState || 'new'));

      // Alone in the room → we ARE connected to the channel; there's

      // just no peer to negotiate ICE with yet. Show "connected" the

      // moment the mic is live so the user isn't stuck on "connecting"

      // forever waiting for a friend to join.

      if (!states.length){

        setVoiceStatus(localStream ? 'connected' : 'connecting');

        return;

      }

      if (states.some(s => s === 'failed'))        return setVoiceStatus('failed');

      if (states.some(s => s === 'disconnected'))  return setVoiceStatus('reconnecting');

      if (states.some(s => s === 'checking' || s === 'new'))

                                                   return setVoiceStatus('connecting');

      setVoiceStatus('connected');

    }


    // Poll RTCPeerConnection stats once a second while in a call so the

    // orb HUD can display a real round-trip time instead of a fake

    // random number. We average across all peers.

    let _statsTimer = null;

    function _startStatsPoller(){

      if (_statsTimer) return;

      _statsTimer = setInterval(async () => {

        if (!inVoice || peers.size === 0) return;

        let totalRtt = 0, samples = 0;

        for (const [, rec] of peers){

          if (!rec.pc) continue;

          try {

            const report = await rec.pc.getStats(null);

            report.forEach(s => {

              // candidate-pair on the *currently selected* path carries

              // currentRoundTripTime in seconds; fall back to roundTripTime

              // for older browsers.

              if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated){

                const rtt = s.currentRoundTripTime != null

                  ? s.currentRoundTripTime

                  : s.roundTripTime;

                if (rtt != null){

                  rec.rtt = rtt;

                  totalRtt += rtt;

                  samples++;

                }

              }

            });

          } catch(_){}

        }

        // We deliberately don't write the WebRTC RTT into the orb HUD

        // any more — the HUD is owned by the WS ping loop (one source

        // of truth, always present, even when alone). We still keep

        // per-peer rec.rtt around for any future debug overlay.

      }, 1000);

    }

    function _stopStatsPoller(){

      if (_statsTimer){ clearInterval(_statsTimer); _statsTimer = null; }

    }


    // Paint the status pill below the orb timer. Hides itself entirely

    // in the 'idle' state so a not-connected user doesn't see chrome.

    function setVoiceStatus(state){

      const el = document.getElementById('orbVoiceStatus');

      if (!el) return;

      el.classList.remove('is-connecting','is-connected','is-reconnecting','is-failed');

      const label = el.querySelector('.ovstatus-text');

      if (state === 'idle' || !state){ el.style.display = 'none'; return; }

      el.style.display = 'inline-flex';

      const map = {

        connecting:   { cls:'is-connecting',   text:'CONNECTING' },

        connected:    { cls:'is-connected',    text:'CONNECTED'  },

        reconnecting: { cls:'is-reconnecting', text:'RECONNECTING' },

        failed:       { cls:'is-failed',       text:'CONNECTION LOST' },

      };

      const next = map[state] || map.connecting;

      el.classList.add(next.cls);

      if (label) label.textContent = next.text;

    }

    function _signal(peerName, signal){

      // peerName is the *display name* of the peer in this voice room.

      peerName = (peerName || '').trim();

      let handle = null;

      const conv = Object.values(conversations).find(c => c && (c.name||'').trim() === peerName);

      if (conv && conv.handle) handle = conv.handle.replace(/^@/, '');

      if (!handle){

        for (const s of Object.values(servers || {})){

          if (!s || !Array.isArray(s.members)) continue;

          // members may be raw display names or {name, handle} objects.

          const m = s.members.find(x => (typeof x === 'string' ? x : x && x.name) === peerName);

          if (m && typeof m === 'object' && m.handle){

            handle = m.handle.replace(/^@/, ''); break;

          }

        }

      }

      // Fall back to the display name. The server accepts either; if

      // it can't resolve, the relay silently drops the message but we

      // get a useful warning in the console instead of a stuck call.

      const to = handle || peerName;

      if (!to){

        console.warn('[voice] _signal: no routable identifier for peer', peerName);

        return;

      }

      console.debug('[voice] sending', signal.kind, 'to', to);

      wsSend({ type:'voice-signal', to, signal });

    }

    async function _makeOffer(peerName){

      const rec = peers.get(peerName) || newPc(peerName);

      // We initiated → we're the impolite side. The impolite side

      // doesn't yield on glare and is the one that retries on ICE failure.

      rec.polite = false;

      const offer = await rec.pc.createOffer();

      await rec.pc.setLocalDescription(offer);

      _signal(peerName, { kind:'sdp', sdp: rec.pc.localDescription });

      _recomputeVoiceStatus();

    }

    async function _onSdp(peerName, sdp){

      let rec = peers.get(peerName);

      if (!rec){

        rec = newPc(peerName);

        // Peer offered first → we're polite (the side that yields on glare).

        rec.polite = true;

      }

      try {

        await rec.pc.setRemoteDescription(sdp);

      } catch(e){

        console.warn('[voice] setRemoteDescription failed for', peerName, e && e.message);

        return;

      }

      rec.hasRemoteDesc = true;

      // Flush any ICE candidates that arrived before the SDP did.

      if (rec.pendingIce && rec.pendingIce.length){

        for (const c of rec.pendingIce){

          try { await rec.pc.addIceCandidate(c); }

          catch(e){ console.warn('[voice] queued addIceCandidate failed:', e && e.message); }

        }

        rec.pendingIce.length = 0;

      }

      if (sdp.type === 'offer'){

        try {

          const answer = await rec.pc.createAnswer();

          await rec.pc.setLocalDescription(answer);

          _signal(peerName, { kind:'sdp', sdp: rec.pc.localDescription });

        } catch(e){

          console.warn('[voice] createAnswer failed:', e && e.message);

        }

      }

      _recomputeVoiceStatus();

    }

    async function _onIce(peerName, candidate){

      const rec = peers.get(peerName);

      if (!rec) return;

      // Queue ICE that arrives before remoteDescription — addIceCandidate

      // throws "Cannot add ICE candidate before setRemoteDescription" in

      // Chrome otherwise and the connection silently never completes.

      if (!rec.hasRemoteDesc){

        rec.pendingIce.push(candidate);

        return;

      }

      try { await rec.pc.addIceCandidate(candidate); }

      catch(e){ console.warn('[voice] addIceCandidate failed:', e && e.message); }

    }

    function tearDownPeer(peerName){

      const rec = peers.get(peerName); if (!rec) return;

      try { rec.pc.close(); } catch(_){}

      if (rec.audioEl && rec.audioEl.parentNode) rec.audioEl.parentNode.removeChild(rec.audioEl);

      peers.delete(peerName);

      _refreshConnectingDots();

    }


    // Initiate connections to any member we don't yet have a PC for.

    // هش پایدار از یک رشته (روی هر مرورگر همون مقدار رو می‌ده)

    function _stableHash(s){

      let h = 5381;

      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;

      return h >>> 0;

    }

    // قانون قطعی برای اینکه کدوم طرف offer بفرسته (جلوگیری از glare)

    function _shouldOffer(myName, peerName){

      const hm = _stableHash(myName), hp = _stableHash(peerName);

      if (hm !== hp) return hm < hp;

      if (myName.length !== peerName.length) return myName.length < peerName.length;

      return false; // در صورت همنامی کامل، منتظر offer می‌مونیم

    }

    

    function _ensurePeersForMembers(members){

      const myName = (selfProfile.name || '').trim();

      members.forEach(rawName => {

        const name = (rawName || '').trim();

        if (!name) return;

        if (name === myName) return;

        if (peers.has(name)) return;

        if (_shouldOffer(myName, name)){

          _makeOffer(name).catch(e => console.warn('[voice] makeOffer failed:', e && e.message));

        } else {

          newPc(name); // منتظر offer از طرف مقابل

        }

      });

    }

    // Membership snapshot we received while still booting (mic / ICE

    // config not ready). We replay it the moment start() finishes so

    // peers who joined before we were ready still get an offer.

    let _pendingMembers = null;

    return {

      async start(sid, cid){

        if (!backend.isConfigured()) return;

        // Set the routing keys immediately so any voice:join event the

        // server sends while ICE config / getUserMedia are still pending

        // gets matched against our active call (instead of being dropped

        // because serverId/channelId were still null).

        serverId = sid; channelId = cid;

        setVoiceStatus('connecting');

        await loadIceConfig();

        try { await ensureMic(); } catch(_){

          setVoiceStatus('failed');

          return;

        }

        // The localStream just became available. Replay the most recent

        // membership snapshot so any peer who was already in the room

        // gets an offer with the audio track attached, plus retro-fit

        // tracks onto any RTCPeerConnection we created early.

        peers.forEach((rec) => {

          if (localStream && rec.pc && !rec.pc.getSenders().some(s => s.track && s.track.kind === 'audio')){

            localStream.getAudioTracks().forEach(t => rec.pc.addTrack(t, localStream));

          }

        });

        if (_pendingMembers){

          const snap = _pendingMembers; _pendingMembers = null;

          _ensurePeersForMembers(snap);

        }

        _startStatsPoller();

        // Once the mic is live, even a one-person room counts as

        // "connected" — re-evaluate the status pill instead of leaving

        // it on the initial 'connecting'.

        _recomputeVoiceStatus();

      },

      stop(){

        _stopStatsPoller();

        peers.forEach((_, name) => tearDownPeer(name));

        if (localStream){

          try {

            if (localStream._rawStream) localStream._rawStream.getTracks().forEach(t => t.stop());

            localStream.getTracks().forEach(t => t.stop());

          } catch(_){}

          localStream = null;

        }

        _destroyCallChain();

        serverId = null; channelId = null;

        setVoiceStatus('idle');

      },

      mute(on){

        if (!localStream) return;

        localStream.getAudioTracks().forEach(t => t.enabled = !on);

      },

      onPeerJoined(sid, cid, members){

        if (sid !== serverId || cid !== channelId) return;

        // If we're still in the boot path (no mic yet), buffer this

        // membership snapshot and replay after start() resolves —

        // otherwise we'd build PCs without an audio track.

        if (!localStream){ _pendingMembers = members; return; }

        _ensurePeersForMembers(members);

      },

      onPeerLeft(sid, cid, members){

        if (sid !== serverId || cid !== channelId) return;

        // Anyone we have a PC for who isn't in members → tear down.

        for (const name of [...peers.keys()]){

          if (!members.includes(name)) tearDownPeer(name);

        }

      },

      peerState(name){ return _peerState(name); },

      // Used by Voice Settings modal when the user flips echo / noise /

      // AGC mid-call. Swaps in a fresh mic track with the new processing.

      reconfigureMic(){ return reconfigureMic(); },

      // Used by the Voice Settings strength sliders mid-call to push

      // the new filter parameters into the live Web Audio chain

      // without re-acquiring the mic. Cheap and continuous.

      applyStrengths(){ _applyCallStrengths(); },

      // Called by the server-update handler when an admin changes the

      // bitrate on the current voice channel — propagates the new cap

      // to every active sender without renegotiation.

      applyBitrate(){ _applyBitrateToAllPeers(); },

      // Deafen: silence every remote audio element AND set their

      // <audio>.muted so the browser also stops decoding. mute() handles

      // the outbound side; we leave that to the existing mic toggle.

      deafen(on){

        peers.forEach(rec => {

          if (rec.audioEl) rec.audioEl.muted = !!on;

        });

      },

      handleSignal(msg){

        if (!serverId || !channelId) return;

        const peerName = (msg.fromName || '').trim();

        if (!peerName) return;

        const sig = msg.signal;

        if (!sig) return;

        if (sig.kind === 'sdp')  _onSdp(peerName, sig.sdp);

        else if (sig.kind === 'ice') _onIce(peerName, sig.candidate);

      }

    };

  })();

  // ============== AUTH (signup / login + splash) ==============

  const AUTH_KEY = 'nexus_auth_v1';

  let authMode = 'login'; // 'login' | 'signup'

  function readAuth(){ try { return JSON.parse(localStorage.getItem(AUTH_KEY)||'null'); } catch(_){ return null; } }

  function writeAuth(obj){ try { localStorage.setItem(AUTH_KEY, JSON.stringify(obj)); } catch(_){ } }

  function clearAuth(){ try { localStorage.removeItem(AUTH_KEY); } catch(_){ } }

  function setAuthTab(mode){

    authMode = mode;

    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.authTab === mode));

    document.querySelectorAll('[data-auth-fld]').forEach(el => el.style.display = el.dataset.authFld.startsWith(mode) ? 'flex' : 'none');

    document.getElementById('authTitle').textContent = mode === 'signup' ? '// CREATE ACCOUNT' : '// SIGN IN';

    document.getElementById('authSubmitLbl').textContent = mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN';

    document.getElementById('authError').textContent = '';

  }

  function showAuthError(msg){ document.getElementById('authError').textContent = msg||''; }

  // Pre-auth lock. While the auth modal is up, we add `is-pre-auth` to

  // <html> so the dashboard underneath can't be poked at via Escape, the

  // tab key, or third-party browser extensions that try to dismiss the

  // overlay. CSS handles the visual gate (pointer-events:none on the

  // dashboard, and lifting the auth modal above any other modal).

  function showAuthModal(){

    document.documentElement.classList.add('is-pre-auth');

    document.getElementById('authBackdrop').classList.add('show');

  }

  function hideAuthModal(){

    document.documentElement.classList.remove('is-pre-auth');

    document.getElementById('authBackdrop').classList.remove('show');

  }

  function resetSelfProfileForSignup(user){

    // Wipe out demo Cooper data so a brand-new account is its own person.

    selfProfile.name    = user.name;

    selfProfile.initial = user.name.charAt(0).toUpperCase();

    selfProfile.handle  = '@'+user.handle.replace(/^@/,'');

    selfProfile.email   = user.email || '';

    selfProfile.phone   = user.phone || '';

    selfProfile.bio     = '';

    selfProfile.rank    = 'NEW EXPLORER';

    selfProfile.avImage = null;

    selfProfile.bannerImage = null;

    selfProfile.baseColor = '#a78bfa';

    selfProfile.orbColor  = '#a78bfa';

    selfProfile.orbGrad   = colorToOrbGrad('#a78bfa');

    selfProfile.avColor   = colorToFlatGrad('#a78bfa');

    // Clear any DM mark / hidden / blocked state from the previous session.

    if (typeof markedFriends !== 'undefined') markedFriends.length = 0;

    if (typeof markedTextChannels !== 'undefined') markedTextChannels.length = 0;

    if (typeof dmListHidden !== 'undefined') dmListHidden.clear();

    if (typeof blockedUsers !== 'undefined') blockedUsers.clear();

    // Drop any temp profile entries we created on the fly.

    Object.keys(conversations).forEach(k => { if (k.startsWith('__')) delete conversations[k]; });

    // Re-render everything that read these.

    if (typeof renderHomeFriends === 'function') renderHomeFriends();

    if (typeof renderDmList === 'function') renderDmList();

    if (typeof renderMarkedPanel === 'function') renderMarkedPanel();

    if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

    if (typeof updateBadges === 'function') updateBadges();

  }

  function applyProfileFromAuth(user){

    selfProfile.name    = user.name || selfProfile.name;

    selfProfile.handle  = user.handle ? ('@'+user.handle.replace(/^@/,'')) : selfProfile.handle;

    selfProfile.initial = (user.name || selfProfile.name).charAt(0).toUpperCase();

    selfProfile.email   = user.email || '';

    if (user.phone) selfProfile.phone = user.phone;

    if (user.avImage) selfProfile.avImage = user.avImage;

    if (typeof user.bannerImage !== 'undefined') selfProfile.bannerImage = user.bannerImage;

    if (user.baseColor){

      selfProfile.baseColor = user.baseColor;

      selfProfile.orbColor  = user.baseColor;

      selfProfile.orbGrad   = colorToOrbGrad(user.baseColor);

      selfProfile.avColor   = colorToFlatGrad(user.baseColor);

    }

  }

  function runSplash(label, ms){

    return new Promise(res => {

      const sp = document.getElementById('authSplash');

      const lbl = document.getElementById('authSplashLbl');

      lbl.textContent = label || 'LOADING TRANSMISSIONS';

      sp.classList.add('show');

      setTimeout(() => { sp.classList.remove('show'); res(); }, ms||1300);

    });

  }

  // Demo data ships with "Cooper" as the local user's stand-in. Once a real

  // account name is known, rewrite every reference in the seeded data so the

  // user sees themselves — not Cooper — as the owner / admin / channel member.

  // No-op now that the demo "Cooper" persona has been removed from seed data.

  // Kept as a stable hook so callers (bootAuth / signup / profile rename) can

  // ask the runtime to swap any leftover references to the local user.

  function rebrandLocalUser(toName){

    if (!toName) return;

    Object.values(channelData).forEach(d => {

      if (Array.isArray(d.users)) d.users = d.users.filter(x => x !== toName);

    });

  }

  async function bootAuth(){

    const existing = readAuth();

    if (existing && existing.email){

      // Already signed in - skip the modal, just show a brief splash, hydrate profile.

      applyProfileFromAuth(existing);

      rebrandLocalUser(selfProfile.name);

      refreshSelfAvatarsEverywhere();

      await runSplash('LOADING YOUR TRANSMISSIONS', 900);

      // Pull the freshest copy of every store from the backend (servers, DMs,

      // friends, marks, blocks). Falls through silently if no API is wired up.

      const _ok = await hydrateFromBackend();

      // Whether the API responded or not, the initial load attempt is

      // over. Clearing the flag here is critical — otherwise every

      // render function keeps painting skeletons forever, which is the

      // "home/DMs take ages to load" report. (Worlds didn't suffer

      // because we never gated it on this flag.)

      _initialHydrating = false;

      if (_ok){

        if (typeof renderHomeFriends === 'function') renderHomeFriends();

        if (typeof renderHomeMyServers === 'function') renderHomeMyServers();

        if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

        if (typeof renderDmList === 'function') renderDmList();

        if (typeof renderMarkedPanel === 'function') renderMarkedPanel();

        if (typeof renderFriendRequestsHome === 'function') renderFriendRequestsHome();

        if (typeof renderOrbSlides === 'function') renderOrbSlides();

        if (typeof renderServerRails === 'function') renderServerRails();

        if (typeof updateBadges === 'function') updateBadges();

      } else {

        // No backend / offline: clear the skeletons too so the user sees

        // the real empty-state copy instead of shimmer bars forever.

        if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

        if (typeof renderHomeMyServers   === 'function') renderHomeMyServers();

        if (typeof renderDmList          === 'function') renderDmList();

        if (typeof renderMarkedPanel     === 'function') renderMarkedPanel();

        if (typeof renderOrbSlides       === 'function') renderOrbSlides();

        if (typeof updateConnBanner      === 'function') updateConnBanner();

      }

      connectRealtime();

      return;

    }

    setAuthTab('login');

    showAuthModal();

  }

  document.querySelectorAll('.auth-tab').forEach(t => t.addEventListener('click', () => setAuthTab(t.dataset.authTab)));

  document.getElementById('authSubmit').addEventListener('click', async () => {

    const email = (document.getElementById('authEmail').value||'').trim().toLowerCase();

    const pwd   = (document.getElementById('authPassword').value||'').trim();

    if (!email || !email.includes('@')){ showAuthError('Enter a valid email'); return; }

    // Length cap matches the backend's password rule (min 8). When no backend

    // is wired up we still allow the legacy >= 4 path so local demos work.

    const minPwd = backend.isConfigured() ? 8 : 4;

    if (pwd.length < minPwd){ showAuthError('Password must be at least '+minPwd+' characters'); return; }

    if (authMode === 'signup'){

      const name   = (document.getElementById('authName').value||'').trim();

      const handle = (document.getElementById('authHandle').value||'').trim().replace(/^@/,'').toLowerCase();

      if (!name){ showAuthError('Display name is required'); return; }

      if (!handle){ showAuthError('Username is required'); return; }

      // Backend path

      if (backend.isConfigured()){

        const r = await backend.auth.signup({ email, password:pwd, name, handle });

        if (r.offline){ showAuthError('Cannot reach the server. Try again.'); return; }

        if (r.error){ showAuthError(_authErrorLabel(r.error)); return; }

        backend.token.write(r.token);

        writeAuth(r.user);

        resetSelfProfileForSignup(r.user);

        applyProfileFromAuth(r.user);

        rebrandLocalUser(selfProfile.name);

        refreshSelfAvatarsEverywhere();

        hideAuthModal();

        await runSplash('PROVISIONING YOUR ORBIT', 800);

        await _hydrateAndRefresh();

        showToast('Welcome aboard, '+r.user.name,'success');

        return;

      }

      // Local-only fallback

      const user = { email, name, handle, avImage:null, createdAt:Date.now() };

      writeAuth(user);

      resetSelfProfileForSignup(user);

      rebrandLocalUser(selfProfile.name);

      refreshSelfAvatarsEverywhere();

      hideAuthModal();

      await runSplash('PROVISIONING YOUR ORBIT', 1500);

      // Local-only signup (no backend) — nothing to hydrate, but the

      // flag still needs to flip so home/DM skeletons clear.

      _initialHydrating = false;

      if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

      if (typeof renderHomeMyServers   === 'function') renderHomeMyServers();

      if (typeof renderDmList          === 'function') renderDmList();

      if (typeof renderMarkedPanel     === 'function') renderMarkedPanel();

      if (typeof renderOrbSlides       === 'function') renderOrbSlides();

      if (typeof updateConnBanner      === 'function') updateConnBanner();

      showToast('Welcome aboard, '+name,'success');

      return;

    }

    // Login

    if (backend.isConfigured()){

      const r = await backend.auth.login({ email, password:pwd });

      if (r.offline){ showAuthError('Cannot reach the server. Try again.'); return; }

      if (r.error){ showAuthError(_authErrorLabel(r.error)); return; }

      backend.token.write(r.token);

      writeAuth(r.user);

      applyProfileFromAuth(r.user);

      rebrandLocalUser(selfProfile.name);

      refreshSelfAvatarsEverywhere();

      hideAuthModal();

      await runSplash('LOADING YOUR TRANSMISSIONS', 800);

      await _hydrateAndRefresh();

      showToast('Signed in as '+r.user.name,'success');

      return;

    }

    // Local-only fallback

    const existing = readAuth();

    const user = existing && existing.email === email

      ? existing

      : { email, name: email.split('@')[0].replace(/^./, x=>x.toUpperCase()), handle: email.split('@')[0].toLowerCase(), avImage:null, createdAt:Date.now() };

    writeAuth(user);

    applyProfileFromAuth(user);

    rebrandLocalUser(selfProfile.name);

    refreshSelfAvatarsEverywhere();

    hideAuthModal();

    await runSplash('LOADING YOUR TRANSMISSIONS', 1100);

    _initialHydrating = false;

    if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

    if (typeof renderHomeMyServers   === 'function') renderHomeMyServers();

    if (typeof renderDmList          === 'function') renderDmList();

    if (typeof renderMarkedPanel     === 'function') renderMarkedPanel();

    if (typeof renderOrbSlides       === 'function') renderOrbSlides();

    if (typeof updateConnBanner      === 'function') updateConnBanner();

    showToast('Signed in as '+user.name,'success');

  });

  // Map backend error codes to human-readable strings for the auth modal.

  function _authErrorLabel(code){

    switch (code){

      case 'invalid_credentials':    return 'Wrong email or password.';

      case 'email_or_handle_taken':  return 'That email or username is already in use.';

      case 'handle_taken':           return 'That username is already taken.';

      case 'email_taken':            return 'That email is already in use.';

      case 'validation_failed':      return 'Some fields are invalid.';

      default:                       return 'Sign-in failed: ' + code;

    }

  }

  // Pull a fresh snapshot from the backend and re-render every section that

  // reads from in-memory stores. Called after login/signup so the UI doesn't

  // briefly show empty state before the snapshot arrives.

  // Flips to false the moment _hydrateAndRefresh() finishes (success or

  // graceful no-op). Render functions for home/dms/orbits consult this

  // flag to decide whether to paint a skeleton instead of "empty" copy.

  let _initialHydrating = true;

  async function _hydrateAndRefresh(){

    const ok = await hydrateFromBackend();

    // Whether we have data or not, the initial load attempt is over.

    // Render functions can stop showing skeletons.

    _initialHydrating = false;

    if (!ok){

      // Repaint affected surfaces so any leftover skeletons clear.

      if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

      if (typeof renderHomeMyServers   === 'function') renderHomeMyServers();

      if (typeof renderDmList          === 'function') renderDmList();

      if (typeof renderOrbSlides       === 'function') renderOrbSlides();

      return;

    }

    // Refresh the home greeting now that selfProfile.name has been set —

    // otherwise the first login still shows "GOOD MORNING, EXPLORER"

    // because the greeting was painted before the auth response arrived.

    if (typeof refreshHomeGreeting === 'function') refreshHomeGreeting();

    if (typeof renderHomeFriends === 'function') renderHomeFriends();

    if (typeof renderHomeMyServers === 'function') renderHomeMyServers();

    if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

    if (typeof renderDmList === 'function') renderDmList();

    if (typeof renderMarkedPanel === 'function') renderMarkedPanel();

    if (typeof renderFriendRequestsHome === 'function') renderFriendRequestsHome();

    if (typeof renderOrbSlides === 'function') renderOrbSlides();

    if (typeof renderServerRails === 'function') renderServerRails();

    if (typeof updateConnBanner === 'function') updateConnBanner();

    if (typeof updateBadges === 'function') updateBadges();

    // Open the realtime channel now that we have a token + state is in sync.

    connectRealtime();

  }

  function refreshSelfAvatarsEverywhere(){

    const tb = document.getElementById('tbAvatar');

    if (tb){ tb.style.background = selfAvStyle(); tb.textContent = selfAvInner(); tb.style.color = selfProfile.avImage ? 'transparent' : ''; }

    refreshHomeHeroIdentity();

    if (typeof renderConversation === 'function' && currentConversation) renderConversation();

    if (typeof renderVoiceUsers === 'function' && voiceUsersSidebarOpen) renderVoiceUsers();

    if (typeof updateOrbStates === 'function') updateOrbStates();

  }

  // Drives the home hero badge: paints the user's avatar onto the red orb and

  // their cover behind the whole hero panel. Toggleable via the gear button

  // in the corner; the on/off preference is remembered in localStorage.

  const HOME_HERO_KEY = 'orblood_home_hero_identity_v1';

  function readHomeHeroOn(){ try { return localStorage.getItem(HOME_HERO_KEY) !== '0'; } catch(_){ return true; } }

  function writeHomeHeroOn(on){ try { localStorage.setItem(HOME_HERO_KEY, on?'1':'0'); } catch(_){} }

  function refreshHomeHeroIdentity(){

    const hero  = document.getElementById('homeHero');

    const cover = document.getElementById('homeHeroCover');

    const orb   = document.getElementById('homeHeroOrb');

    const lett  = document.getElementById('homeHeroOrbLetter');

    if (!hero || !cover || !orb || !lett) return;

    const on = readHomeHeroOn();

    hero.classList.toggle('has-identity', !!on);

    if (on){

      // Orb: avatar image (or a flat colored disc with the user's initial).

      if (selfProfile.avImage){

        orb.style.background = 'transparent url('+selfProfile.avImage+') center/cover no-repeat';

        lett.textContent = '';

      } else {

        orb.style.background = selfProfile.orbGrad || selfProfile.avColor || 'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.4),'+(selfProfile.orbColor||'#22c55e')+' 60%,#14532d)';

        lett.textContent = selfProfile.initial || (selfProfile.name||'?').charAt(0).toUpperCase();

      }

      // Cover: explicit bannerImage only — never the avatar.

      cover.style.background = selfProfile.bannerImage

        ? 'transparent url('+selfProfile.bannerImage+') center/cover no-repeat'

        : '';

    } else {

      orb.style.background = '';

      cover.style.background = '';

      lett.textContent = '';

    }

  }

  // Open profile by display-name. Falls through to a temp profile entry when the user

  // isn't already in conversations[]. Crucially, never accidentally falls back to self.

  function openProfileByName(name){

    if (!name) return;

    if (name === selfProfile.name){ openProfile(null); return; }

    // First try to match an existing conversation by lowercased display name

    // OR by display name itself (conversations[] is keyed by handle, not name).

    const lower = name.toLowerCase();

    if (conversations[lower]){ openProfile(lower); return; }

    const byName = Object.entries(conversations).find(([k, c]) => c && c.name === name && !c.isSaved);

    if (byName){ openProfile(byName[0]); return; }

    // Otherwise resolve via the backend so we get the *real* handle / id

    // before stamping a temp entry. Without this, the synthesized handle

    // ends up as "@<lowercased name with spaces>" and friend requests

    // against it always 404.

    const tempKey = '__u_'+lower.replace(/\s+/g, '_');

    const stamp = (handle, avImage, bio, bannerImage, baseColor) => {

      // Build the orb gradient from baseColor when we have one, otherwise

      // the indigo fallback. Banner image is also passed straight through

      // so the profile modal can paint the cover for non-friends, not

      // just users we've already DMed.

      const grad = baseColor

        ? 'radial-gradient(circle at 35% 30%,rgba(255,200,200,0.5),'+baseColor+' 55%,#1e1b4b)'

        : 'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.5),#a78bfa 55%,#1e1b4b)';

      const avColor = baseColor

        ? 'linear-gradient(135deg,'+baseColor+',#1e1b4b)'

        : 'linear-gradient(135deg,#a78bfa,#1a0b2e)';

      conversations[tempKey] = {

        name, online:false, unread:0, avColor, avImage: avImage || null,

        bannerImage: bannerImage || null,

        baseColor: baseColor || null,

        initial: name.charAt(0).toUpperCase(), handle: handle || '@'+lower.replace(/\s+/g,''),

        bio: bio || 'No bio yet.', stats:{posts:0,friends:0,orbits:0}, joined:'—',

        lastSeen:'unknown', rank:'EXPLORER', orbColor: baseColor || '#a78bfa',

        orbGrad: grad,

        isTemp:true

      };

    };

    if (backend.isConfigured()){

      backend.users.lookup(name).then(r => {

        if (r && r.user){

          stamp(

            '@'+(r.user.handle||'').replace(/^@/,''),

            r.user.avImage || null,

            r.user.bio || '',

            r.user.bannerImage || null,

            r.user.baseColor || null

          );

        } else {

          stamp(null);

        }

        openProfile(tempKey);

      }).catch(() => { stamp(null); openProfile(tempKey); });

    } else {

      stamp(null);

      openProfile(tempKey);

    }

  }

  function openProfile(key){

    const isSelf = !key;

    const data = isSelf ? selfProfile : conversations[key];

    if (!data) return;

    profileEditingSelf = false;

    const modal = document.getElementById('profileModal');

    modal.classList.toggle('is-self', isSelf);

    modal.classList.toggle('is-saved', !!data.isSaved);

    modal.classList.remove('is-editing');

    const core = document.getElementById('modalOrbCore');

    if (data.avImage){

      core.textContent = '';

      // Use individual background properties so background-size:cover

      // sticks. The shorthand form was getting clobbered in some

      // browsers when the image dimensions weren't square, leaving the

      // raw rectangular image visible inside the round orb.

      core.style.backgroundImage    = 'url('+data.avImage+')';

      core.style.backgroundSize     = 'cover';

      core.style.backgroundPosition = 'center';

      core.style.backgroundRepeat   = 'no-repeat';

      core.style.backgroundColor    = 'transparent';

    } else {

      core.textContent = data.initial;

      core.style.backgroundImage = '';

      core.style.background = data.orbGrad || data.avColor;

    }

    const orbClr = data.orbColor || '#a78bfa';

    const r = parseInt(orbClr.slice(1,3),16), g = parseInt(orbClr.slice(3,5),16), b = parseInt(orbClr.slice(5,7),16);

    core.style.boxShadow = '0 4px 16px rgba(0,0,0,0.45)';

    document.getElementById('modalStatusDot').classList.toggle('offline', !data.online);

    document.getElementById('modalName').textContent = data.name;

    document.getElementById('modalHandle').textContent = data.handle;

    document.getElementById('modalBio').textContent = data.bio;

    const stat = document.getElementById('modalStatusV');

    stat.textContent = data.online?'ONLINE':'OFFLINE';

    stat.classList.toggle('offline', !data.online);

    document.getElementById('modalRank').textContent = data.rank || 'EXPLORER';

    document.getElementById('modalMessage').dataset.targetKey = key || '';

    if (!isSelf) setTimeout(syncProfileFriendBtn, 0);

    // Sync block button label/state

    if (!isSelf){

      const blockBtn = document.getElementById('modalBlock');

      const blockedNow = key && isBlocked(key);

      blockBtn.innerHTML = (blockedNow ? '<i data-lucide="shield" style="width:11px;height:11px"></i>UNBLOCK' : '<i data-lucide="shield-off" style="width:11px;height:11px"></i>BLOCK');

      blockBtn.style.color = blockedNow ? 'var(--success)' : 'var(--danger)';

      blockBtn.style.borderColor = blockedNow ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';

    }

    // Last seen tag (only when offline)

    const lastSeenEl = document.getElementById('modalLastSeen');

    if (!data.online && data.lastSeen){ lastSeenEl.style.display = ''; lastSeenEl.textContent = 'LAST SEEN '+(data.lastSeen||'').toUpperCase(); }

    else lastSeenEl.style.display = 'none';

    // Banner: only use an explicitly-set bannerImage. We deliberately do NOT

    // fall back to the avatar image — covers are independent of avatars.

    const banner = document.getElementById('modalBanner');

    if (data.bannerImage){

      banner.style.background = 'linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(2,1,3,0.85)) , transparent url('+data.bannerImage+') center/cover no-repeat';

    } else {

      banner.style.background = 'radial-gradient(ellipse at 50% 0%,rgba('+r+','+g+','+b+',0.4),transparent 70%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent)';

    }

    // Joined

    const joined = isSelf ? (function(){ const a=readAuth&&readAuth(); return a&&a.createdAt ? new Date(a.createdAt).toLocaleDateString(undefined,{month:'short',year:'numeric'}).toUpperCase() : null; })() : data.joined;

    if (joined){ document.getElementById('modalJoinedRow').style.display = ''; document.getElementById('modalJoinedV').textContent = joined; }

    else document.getElementById('modalJoinedRow').style.display = 'none';

    // Shared servers (only for OTHER users): every server where both Cooper and this user are members.

    const sharedRow = document.getElementById('modalSharedRow');

    const sharedList = document.getElementById('modalSharedList');

    if (!isSelf){

      const shared = Object.values(servers).filter(srv => (srv.members||[]).includes(selfProfile.name) && (srv.members||[]).includes(data.name));

      if (shared.length){

        sharedRow.style.display = '';

        sharedList.innerHTML = shared.map(srv => srv.emblemImage

          ? '<div class="profile-shared-orb" data-shared-server="'+srv.id+'" title="'+escapeHtml(srv.name)+'" style="background-image:url('+srv.emblemImage+')"></div>'

          : '<div class="profile-shared-orb" data-shared-server="'+srv.id+'" title="'+escapeHtml(srv.name)+'" style="background:'+srv.grad+';box-shadow:0 0 8px '+srv.glow+'">'+escapeHtml(srv.initial||'?')+'</div>'

        ).join('');

      } else { sharedRow.style.display = 'none'; }

    } else { sharedRow.style.display = 'none'; }

    // Sync edit-form fields (filled on demand when entering settings).

    document.getElementById('profileEditName').value = data.name;

    document.getElementById('profileEditHandle').value = (data.handle||'').replace(/^@/,'');

    document.getElementById('profileEditBio').value = data.bio || '';

    if (isSelf){

      const auth = (typeof readAuth === 'function' && readAuth()) || {};

      const emailEl = document.getElementById('profileEditEmail'); if (emailEl) emailEl.value = data.email || auth.email || '';

      const phoneEl = document.getElementById('profileEditPhone'); if (phoneEl) phoneEl.value = data.phone || auth.phone || '';

      const colorChip = document.getElementById('profileColorChip');

      const colorInp = document.getElementById('profileColorInput');

      const baseColor = data.baseColor || data.orbColor || '#22c55e';

      if (colorChip) colorChip.style.background = baseColor;

      if (colorInp)  colorInp.value = baseColor;

      const hexEl = document.getElementById('profileColorHex'); if (hexEl) hexEl.textContent = baseColor.toUpperCase();

      syncCoverPreview();

      // Reset to PROFILE tab whenever the modal opens fresh.

      setSettingsTab('profile');

      // Reflect the current friends-only setting on the privacy toggle.

      const fo = document.getElementById('privFriendsOnly'); if (fo) fo.checked = readFriendsOnly();

      renderFriendsLists();

    }

    const avPrev = document.getElementById('profileEditAvatarPreview');

    if (data.avImage){

      avPrev.textContent = '';

      avPrev.style.background = 'transparent url('+data.avImage+') center/cover no-repeat';

    } else {

      avPrev.textContent = data.initial;

      avPrev.style.background = data.orbGrad || data.avColor;

    }

    const urlInp = document.getElementById('profileEditAvatarUrl'); if (urlInp) urlInp.value = data.avImage || '';

    document.getElementById('profileModalBackdrop').classList.add('show');

    refreshIcons();

  }

  function enterProfileEdit(){

    profileEditingSelf = true;

    document.getElementById('profileModal').classList.add('is-editing');

  }

  function cancelProfileEdit(){

    profileEditingSelf = false;

    document.getElementById('profileModal').classList.remove('is-editing');

  }

  // ============== SETTINGS · FRIEND PANELS ==============

  function renderFriendsLists(){

    renderSettingsFriends();

    renderSettingsIncoming();

    renderSettingsPending();

    renderSettingsBlocked();

    refreshIcons();

  }

  function setBadge(id, n){

    const b = document.getElementById(id); if (!b) return;

    b.textContent = n; b.style.display = n>0 ? '' : 'none';

  }

  function rowAvHtml(c){

    const av = c.avImage

      ? '<div class="fp-av'+(c.online?'':' offline')+'" style="background:transparent url('+c.avImage+') center/cover no-repeat"><span class="fp-status"></span></div>'

      : '<div class="fp-av'+(c.online?'':' offline')+'" style="background:'+(c.avColor||'linear-gradient(135deg,#818cf8,#1e1b4b)')+'"><span>'+(c.initial||'?')+'</span><span class="fp-status"></span></div>';

    return av;

  }

  function reqAvHtml(r){

    return '<div class="fp-av offline" style="background:'+(r.avColor||'linear-gradient(135deg,#818cf8,#1e1b4b)')+'"><span>'+(r.initial||'?')+'</span></div>';

  }

  function renderSettingsFriends(){

    const list = document.getElementById('settingsFriendsList'); if (!list) return;

    const entries = friendsList.map(k => [k, conversations[k]]).filter(([_,c]) => c);

    setBadge('settingsFriendsCount', entries.length);

    if (!entries.length){ list.innerHTML = '<div class="fp-empty">No friends yet. Send a friend request to get started.</div>'; return; }

    list.innerHTML = entries.map(([k,c]) =>

      '<div class="fp-row" data-fp-key="'+k+'">'+

        rowAvHtml(c)+

        '<div class="fp-mid"><div class="fp-name">'+escapeHtml(c.name)+'</div><div class="fp-meta">'+escapeHtml(c.handle||'')+(c.online?' · online':' · offline')+'</div></div>'+

        '<div class="fp-actions">'+

          '<button class="fp-btn" data-fp-message="'+k+'" title="Message"><i data-lucide="message-circle" style="width:13px;height:13px"></i></button>'+

          '<button class="fp-btn danger" data-fp-remove="'+k+'" title="Remove friend"><i data-lucide="user-x" style="width:13px;height:13px"></i></button>'+

        '</div>'+

      '</div>'

    ).join('');

  }

  function renderSettingsIncoming(){

    const list = document.getElementById('settingsIncomingList'); if (!list) return;

    const items = friendRequests.incoming;

    setBadge('settingsIncomingCount', items.length);

    if (!items.length){ list.innerHTML = '<div class="fp-empty">No incoming friend requests.</div>'; return; }

    list.innerHTML = items.map(r =>

      '<div class="fp-row" data-fp-req="'+r.id+'">'+

        reqAvHtml(r)+

        '<div class="fp-mid"><div class="fp-name">'+escapeHtml(r.name)+'</div><div class="fp-meta">'+escapeHtml(r.handle||'')+' · '+escapeHtml(r.meta||'')+'</div></div>'+

        '<div class="fp-actions">'+

          '<button class="fp-btn success" data-fp-accept="'+r.id+'" title="Accept"><i data-lucide="check" style="width:13px;height:13px"></i></button>'+

          '<button class="fp-btn danger" data-fp-reject="'+r.id+'" title="Reject"><i data-lucide="x" style="width:13px;height:13px"></i></button>'+

        '</div>'+

      '</div>'

    ).join('');

  }

  function renderSettingsPending(){

    const list = document.getElementById('settingsPendingList'); if (!list) return;

    const items = friendRequests.outgoing;

    setBadge('settingsPendingCount', items.length);

    if (!items.length){ list.innerHTML = '<div class="fp-empty">No pending friend requests.</div>'; return; }

    list.innerHTML = items.map(r =>

      '<div class="fp-row" data-fp-out="'+r.id+'">'+

        reqAvHtml(r)+

        '<div class="fp-mid"><div class="fp-name">'+escapeHtml(r.name)+'</div><div class="fp-meta">'+escapeHtml(r.handle||'')+' · '+escapeHtml(r.meta||'')+'</div></div>'+

        '<div class="fp-actions">'+

          '<button class="fp-btn danger" data-fp-cancel="'+r.id+'" title="Cancel request"><i data-lucide="x" style="width:13px;height:13px"></i></button>'+

        '</div>'+

      '</div>'

    ).join('');

  }

  function renderSettingsBlocked(){

    const list = document.getElementById('settingsBlockedList'); if (!list) return;

    const keys = Array.from(blockedUsers);

    setBadge('settingsBlockedCount', keys.length);

    if (!keys.length){ list.innerHTML = '<div class="fp-empty">No blocked users.</div>'; return; }

    list.innerHTML = keys.map(k => {

      const c = conversations[k] || { name:k, initial:k.charAt(0).toUpperCase(), avColor:'linear-gradient(135deg,#818cf8,#1e1b4b)', handle:'@'+k, online:false };

      return '<div class="fp-row" data-fp-blocked="'+k+'">'+

        rowAvHtml(c)+

        '<div class="fp-mid"><div class="fp-name">'+escapeHtml(c.name)+'</div><div class="fp-meta">'+escapeHtml(c.handle||'')+'</div></div>'+

        '<div class="fp-actions">'+

          '<button class="fp-btn success" data-fp-unblock="'+k+'" title="Unblock"><i data-lucide="shield" style="width:13px;height:13px"></i></button>'+

        '</div>'+

      '</div>';

    }).join('');

  }

  async function applyProfileEdit(){

    const name = document.getElementById('profileEditName').value.trim() || selfProfile.name;

    const handleRaw = document.getElementById('profileEditHandle').value.trim().replace(/^@/,'');

    const handle = handleRaw ? '@'+handleRaw.toLowerCase().replace(/[^a-z0-9_]/g,'') : selfProfile.handle;

    const bio = document.getElementById('profileEditBio').value.trim() || selfProfile.bio;

    const oldName = selfProfile.name;

    // Account tab fields

    const emailEl = document.getElementById('profileEditEmail');

    const phoneEl = document.getElementById('profileEditPhone');

    const pwdEl   = document.getElementById('profileEditPassword');

    const newEmail = emailEl ? emailEl.value.trim() : '';

    const newPhone = phoneEl ? phoneEl.value.trim() : '';

    const newPwd   = pwdEl ? pwdEl.value : '';

    // Backend-side persistence first. If the server rejects (e.g. handle

    // already taken), surface the message and DON'T mutate local state.

    if (backend.isConfigured()){

      const patch = { name, handle: handle.replace(/^@/,''), bio };

      if (newEmail) patch.email = newEmail;

      if (newPhone) patch.phone = newPhone;

      if (newPwd)   patch.password = newPwd;

      const r = await backend.me.patch(patch);

      if (r.error === 'handle_taken'){ showToast('That username is taken','warn'); return; }

      if (r.error === 'email_taken'){  showToast('That email is taken','warn'); return; }

      if (r.error){ showToast('Could not save: '+r.error,'warn'); return; }

      if (r.user) applyProfileFromAuth(r.user);

    }

    selfProfile.name = name;

    selfProfile.initial = name.charAt(0).toUpperCase();

    selfProfile.handle = handle;

    selfProfile.bio = bio;

    if (emailEl) selfProfile.email = newEmail;

    if (phoneEl) selfProfile.phone = newPhone;

    if (pwdEl && newPwd){ selfProfile.password = newPwd; pwdEl.value = ''; }

    // Persist a few of these into auth so the next reload remembers them.

    const auth = readAuth() || {};

    if (selfProfile.email) auth.email = selfProfile.email;

    if (selfProfile.phone) auth.phone = selfProfile.phone;

    if (selfProfile.password) auth.password = selfProfile.password;

    auth.name = selfProfile.name;

    auth.handle = (selfProfile.handle||'').replace(/^@/,'');

    auth.avImage = selfProfile.avImage || null;

    auth.baseColor = selfProfile.baseColor || null;

    writeAuth(auth);

    // If the display name changed, propagate it everywhere the old one was used

    // (server members/admins/pinned-by, voice channel users) so we don't leave

    // stale references behind.

    if (oldName && oldName !== name){

      const swap = arr => Array.isArray(arr) ? arr.map(x => x === oldName ? name : x) : arr;

      Object.values(servers).forEach(s => {

        s.members = swap(s.members);

        s.admins  = swap(s.admins);

        if (s.pinned && s.pinned.by === oldName) s.pinned.by = name;

        (s.categories||[]).forEach(cat => { if (cat.pinned && cat.pinned.by === oldName) cat.pinned.by = name; });

        (s.roles||[]).forEach(r => { if (Array.isArray(r.members)) r.members = swap(r.members); });

      });

      Object.values(channelData).forEach(d => { if (Array.isArray(d.users)) d.users = swap(d.users); });

      if (typeof renderServerOverview === 'function' && currentServer) renderServerOverview();

    }

    cancelProfileEdit();

    openProfile(null);

    refreshSelfAvatarsEverywhere();

    refreshHomeGreeting();

    auth.bannerImage = selfProfile.bannerImage || null;

    writeAuth(auth);

    showToast('Profile updated','success');

  }

  // Avatar (orb) gradient cycle for self

  const SELF_ORB_PRESETS = [

    { color:'#4ade80', grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.4),#22c55e 55%,#14532d)', av:'linear-gradient(135deg,#22c55e,#15803d)' },

    { color:'#a78bfa', grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.4),#8b5cf6 55%,#1e1b4b)', av:'linear-gradient(135deg,#8b5cf6,#3730a3)' },

    { color:'#f472b6', grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.4),#ec4899 55%,#831843)', av:'linear-gradient(135deg,#ec4899,#9d174d)' },

    { color:'#fbbf24', grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.4),#f59e0b 55%,#7c2d12)', av:'linear-gradient(135deg,#f59e0b,#92400e)' },

    { color:'#22d3ee', grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.4),#06b6d4 55%,#164e63)', av:'linear-gradient(135deg,#06b6d4,#155e75)' },

    { color:'#f87171', grad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.4),#ef4444 55%,#7f1d1d)', av:'linear-gradient(135deg,#ef4444,#7f1d1d)' }

  ];

  let selfOrbPresetIdx = 0;

  function cycleSelfAvatar(){

    selfOrbPresetIdx = (selfOrbPresetIdx + 1) % SELF_ORB_PRESETS.length;

    const p = SELF_ORB_PRESETS[selfOrbPresetIdx];

    selfProfile.orbColor = p.color;

    selfProfile.orbGrad = p.grad;

    selfProfile.avColor = p.av;

    const prev = document.getElementById('profileEditAvatarPreview');

    prev.style.background = p.grad;

    refreshHomeHeroIdentity();

  }

  function closeProfile(){ document.getElementById('profileModalBackdrop').classList.remove('show'); cancelProfileEdit(); }

  // ============== FORWARD (CENTER MODAL) ==============

  let fwdSelectedTargets = new Set();

  let fwdSourceMsg = null;

  let pendingJoinCard = null;

  let ownerTransferTarget = null;

  function handleUserCardOpen(jsonStr){

    let card; try { card = JSON.parse(decodeURIComponent(jsonStr)); } catch(_){ return; }

    if (!card) return;

    if (card.userKey === 'self'){ openProfile(null); return; }

    openProfileByName(card.name);

  }

  function handleChannelCardOpen(jsonStr){

    let card; try { card = JSON.parse(jsonStr); } catch(_){ return; }

    if (!card) return;

    const srv = servers[card.serverId];

    if (!srv){

      // Step 1: not a member - prompt to join the server first.

      showToast('Join '+(card.serverName||'this server')+' first to access this channel','warn');

      openServerJoinModal({ id:card.serverId, name:card.serverName, emblem:card.serverEmblem, grad:card.serverGrad, glow:card.serverGlow, initial:card.serverInitial, invite:card.serverInvite, members:0, desc:'You need to join this server before opening the shared channel.' });

      return;

    }

    // Step 2: member but maybe not enough role to see the channel.

    const ent = card.kind === 'text'

      ? srv.textChannels.find(x => x.id === card.channelId)

      : srv.voiceChannels.find(x => x.id === card.channelId);

    if (!ent){ showToast('That channel no longer exists','warn'); return; }

    if (!memberCanSeeChannelCascaded(srv,selfProfile.name, ent)){

      showToast('Restricted access - you do not have the required role','warn');

      return;

    }

    setPage('pageWorld');

    selectServer(card.serverId);

    if (card.kind === 'text'){ openTextChannel(card.channelId); return; }

    const chKey = vcChannelKey(ent);

    if (!channelData[chKey]){ showToast('Voice orb data missing','warn'); return; }

    joinVoiceChannel(chKey);

  }

  function openOwnerTransferModal(){

    if (!currentServer) return;

    ownerTransferTarget = null;

    document.getElementById('ownerTransferSearch').value = '';

    renderOwnerTransferList('');

    document.getElementById('ownerTransferConfirm').disabled = true;

    document.getElementById('ownerTransferConfirm').style.opacity = '0.5';

    document.getElementById('ownerTransferConfirm').style.cursor = 'not-allowed';

    document.getElementById('ownerTransferBackdrop').classList.add('show');

  }

  function renderOwnerTransferList(filter){

    const s = servers[currentServer]; if (!s) return;

    const owner = s.roles.find(r => r.id === 'owner');

    const ownerName = owner ? owner.members[0] : null;

    const q = (filter||'').trim().toLowerCase();

    const candidates = (s.members||[]).filter(m => m !== ownerName && m.toLowerCase().includes(q)).slice(0,30);

    const list = document.getElementById('ownerTransferList');

    if (!candidates.length){ list.innerHTML = '<div class="role-search-empty">No matching members.</div>'; return; }

    list.innerHTML = candidates.map(m => {

      const ck = m.toLowerCase();

      const conv = conversations[ck];

      const av = conv ? conv.avColor : 'linear-gradient(135deg,#a78bfa,#1a0b2e)';

      const sel = ownerTransferTarget === m ? ' is-selected' : '';

      return '<div class="role-search-result'+sel+'" data-owner-pick="'+escapeHtml(m)+'"><div class="role-member-av" style="background:'+av+'">'+m.charAt(0)+'</div><span class="role-search-result-name">'+escapeHtml(m)+'</span></div>';

    }).join('');

  }

  function openServerJoinModal(card){

    pendingJoinCard = card;

    document.getElementById('sjName').textContent = card.name || '';

    document.getElementById('sjMeta').textContent = (card.members||0)+' members';

    document.getElementById('sjDesc').textContent = card.desc || 'No description provided.';

    document.getElementById('sjKey').textContent = card.invite || '-';

    const cover = document.getElementById('sjCover');

    cover.style.backgroundImage = card.cover ? 'url('+card.cover+')' : '';

    const emblem = document.getElementById('sjEmblem');

    if (card.emblem){

      emblem.textContent = '';

      emblem.style.background = 'transparent url('+card.emblem+') center/cover no-repeat';

      emblem.style.boxShadow = '0 4px 18px rgba(0,0,0,0.45)';

    } else {

      emblem.textContent = card.initial || '?';

      emblem.style.background = card.grad || 'linear-gradient(135deg,#b91c4a,#7f1d1d)';

      emblem.style.boxShadow = '0 0 18px '+(card.glow||'rgba(185,28,74,0.4)')+',0 4px 18px rgba(0,0,0,0.45)';

    }

    // Private tag.

    const isPrivate = !!card.isPrivate || (servers[card.id] && servers[card.id].isPrivate);

    const tag = document.getElementById('sjPrivateTag');

    if (tag) tag.style.display = isPrivate ? 'inline-flex' : 'none';

    // Decide button state. Already-member users get an OPEN action regardless

    // of privacy. Private servers block strangers (button disabled with hint).

    const exists = !!servers[card.id];

    const alreadyIn = exists && (servers[card.id].members||[]).includes(selfProfile.name);

    const btn = document.getElementById('sjJoinBtn');

    if (alreadyIn){

      btn.innerHTML = '<i data-lucide="arrow-right" style="width:11px;height:11px"></i>OPEN SERVER';

      btn.classList.remove('disabled');

      btn.disabled = false;

    } else if (isPrivate){

      btn.innerHTML = '<i data-lucide="lock" style="width:11px;height:11px"></i>PRIVATE — TRY LATER';

      btn.classList.add('disabled');

      btn.disabled = true;

    } else {

      btn.innerHTML = '<i data-lucide="log-in" style="width:11px;height:11px"></i>JOIN SERVER';

      btn.classList.remove('disabled');

      btn.disabled = false;

    }

    document.getElementById('serverJoinBackdrop').classList.add('show');

    refreshIcons();

  }

  function renderChannelCardHtml(card){

    const isVoice = card.kind === 'voice';

    const emblem = card.serverEmblem

      ? '<div class="sc-emblem" style="width:34px;height:34px;font-size:0.85rem;background:transparent url('+card.serverEmblem+') center/cover no-repeat"></div>'

      : '<div class="sc-emblem" style="width:34px;height:34px;font-size:0.85rem;background:'+card.serverGrad+';box-shadow:0 0 10px '+card.serverGlow+'">'+escapeHtml(card.serverInitial||'?')+'</div>';

    const memberLine = isVoice ? ((card.channelMembers||0)+' connected') : 'Text channel';

    return '<div class="sc-card">'+

      '<div class="sc-eyebrow">'+(isVoice?'VOICE ORB INVITE':'CHANNEL INVITE')+'</div>'+

      '<div class="sc-row">'+

        '<div class="sc-channel-icon '+(isVoice?'is-voice':'is-text')+'">'+(isVoice?'<i data-lucide="orbit" style="width:18px;height:18px"></i>':'<i data-lucide="hash" style="width:18px;height:18px"></i>')+'</div>'+

        '<div class="sc-info"><div class="sc-name">'+(isVoice?'':'#')+escapeHtml(card.channelName||'')+'</div><div class="sc-meta">'+escapeHtml(card.serverName||'')+' · '+memberLine+'</div></div>'+

        emblem+

      '</div>'+

      '<div class="sc-actions"><button class="sc-btn" data-channel-card-open="'+escapeHtml(JSON.stringify(card))+'">'+

        (isVoice?'<i data-lucide="log-in" style="width:11px;height:11px"></i>JOIN':'<i data-lucide="arrow-right" style="width:11px;height:11px"></i>OPEN')+

      '</button></div>'+

    '</div>';

  }

  function renderServerCardHtml(card){

    const emblem = card.emblem

      ? '<div class="sc-emblem" style="background:transparent url('+card.emblem+') center/cover no-repeat"></div>'

      : '<div class="sc-emblem" style="background:'+card.grad+';box-shadow:0 0 14px '+card.glow+'">'+escapeHtml(card.initial||'?')+'</div>';

    const desc = card.desc ? '<div class="sc-desc">'+escapeHtml(String(card.desc).slice(0,140))+'</div>' : '';

    // The card always shows JOIN; clicking it opens the server-join confirmation modal.

    const cardJson = encodeURIComponent(JSON.stringify(card));

    const isPrivate = !!card.isPrivate;

    const action = isPrivate

      ? '<button class="sc-btn" data-server-card-join="'+cardJson+'" style="opacity:0.85"><i data-lucide="lock" style="width:11px;height:11px"></i>VIEW</button>'

      : '<button class="sc-btn" data-server-card-join="'+cardJson+'"><i data-lucide="log-in" style="width:11px;height:11px"></i>JOIN</button>';

    const privTag = isPrivate

      ? '<div class="sc-private-tag"><i data-lucide="lock" style="width:9px;height:9px"></i>PRIVATE</div>'

      : '';

    return '<div class="sc-card">'+

      '<div class="sc-eyebrow">SERVER INVITE'+privTag+'</div>'+

      '<div class="sc-row">'+emblem+'<div class="sc-info"><div class="sc-name">'+escapeHtml(card.name||'')+'</div><div class="sc-meta">'+(card.members||0)+' members</div></div></div>'+

      desc+

      '<div class="sc-actions">'+action+'</div>'+

    '</div>';

  }

  // ============== CUSTOMIZATION PACKS ==============

  // Catalog mirrors what /api/packs returns. We cache it after the first

  // GET so opening the modal repeatedly doesn't hit the network. The

  // catalog also drives the per-surface picker UI.

  let _packsCatalog = null;

  let _packsLoaded = false;

  // Surfaces a pack can target. Used both to filter the picker rows and

  // to know which class to write into the rendered DOM.

  const PACK_SURFACES = ['serverName','serverPin','category','textChannel','voiceChannel','orbit'];

  // Map a pack id + surface to the css class the renderer should add to

  // the matching dom node. Keep in sync with /styles/packs/*.css.

  function packClassFor(packId, surface){

    if (!packId) return '';

    const map = {

      serverName:   'cz-'+packId+'-text',

      serverPin:    'cz-'+packId+'-pin',

      category:     'cz-'+packId+'-category',

      textChannel:  'cz-'+packId+'-textchannel',

      voiceChannel: 'cz-'+packId+'-voicechannel',

      orbit:        'cz-'+packId+'-orb'

    };

    return map[surface] || '';

  }

  async function loadPacksCatalog(){

    if (_packsLoaded) return _packsCatalog;

    try {

      const r = await _apiRequest('GET', '/packs');

      _packsCatalog = (r && r.packs) || [];

      _packsLoaded = true;

    } catch(_){ _packsCatalog = []; _packsLoaded = true; }

    return _packsCatalog;

  }

  function ownedPackIds(){

    const fromUser = (selfProfile && selfProfile.unlockedPacks) || [];

    const fromCatalog = (_packsCatalog || []).filter(p => p.owned).map(p => p.id);

    return new Set([...fromUser, ...fromCatalog]);

  }

  function packSupports(pack, surface){

    return Array.isArray(pack.surfaces) && pack.surfaces.includes(surface);

  }

  async function openCustomizeModal(){

    if (!currentServer) return;

    // Force a fresh fetch so newly-added pack surfaces (e.g. serverCover,

    // serverEmblem) show up without a hard reload.

    _packsLoaded = false;

    await loadPacksCatalog();

    _renderCustomizeModal();

    document.getElementById('customizeBackdrop').classList.add('show');

  }

  function _renderCustomizeModal(){

    const owned = ownedPackIds();

    const s = servers[currentServer]; if (!s) return;

    // Library: render a chip row per surface (currently serverName + serverPin).

    function renderRow(target){

      const wrap = document.querySelector('[data-cz-target="'+target+'"]');

      if (!wrap) return;

      const current = target === 'serverName'   ? s.styleName

                    : target === 'serverPin'    ? s.stylePin

                    : target === 'serverCover'  ? s.styleCover

                    : target === 'serverEmblem' ? s.styleEmblem

                    : null;

      const chips = [];

      // "Default" chip is always available and clears the customization.

      chips.push('<button class="cz-pack-chip'+(!current?' active':'')+'" data-cz-pack="" data-cz-set="'+target+'">DEFAULT</button>');

      (_packsCatalog||[]).filter(p => packSupports(p, target)).forEach(p => {

        const isOwned = owned.has(p.id);

        const isActive = current === p.id;

        chips.push(

          '<button class="cz-pack-chip'+(isActive?' active':'')+(isOwned?'':' locked')+'" '

            + 'data-cz-pack="'+p.id+'" data-cz-set="'+target+'" '

            + (isOwned?'':'title="Unlock from the Shop tab first" disabled')+'>'

            + escapeHtml(p.name.toUpperCase())

          + '</button>'

        );

      });

      wrap.innerHTML = chips.join('');

    }

    renderRow('serverName');

    renderRow('serverPin');

    // Shop tab.

    const shopList = document.getElementById('czShopList');

    shopList.innerHTML = (_packsCatalog||[]).map(p => {

      const isOwned = owned.has(p.id);

      return '<div class="cz-shop-item" data-cz-preview="'+p.id+'" style="cursor:pointer">'

        + '<div class="cz-shop-info">'

          + '<div class="cz-shop-name">'+escapeHtml(p.name)+'</div>'

          + '<div class="cz-shop-desc">'+escapeHtml(p.desc)+'</div>'

          + '<div class="cz-shop-price">'+(p.price > 0 ? '$'+p.price : 'FREE')+'</div>'

        + '</div>'

        + (isOwned

            ? '<button class="sm-btn cancel" disabled>OWNED</button>'

            : '<button class="sm-btn primary" data-cz-unlock="'+p.id+'">UNLOCK</button>')

      + '</div>';

    }).join('');

    refreshIcons();

  }

  async function _setServerStyle(target, packId){

    if (!currentServer) return;

    const s = servers[currentServer]; if (!s) return;

    const fieldMap = {

      serverName:   'styleName',

      serverPin:    'stylePin',

      serverCover:  'styleCover',

      serverEmblem: 'styleEmblem'

    };

    const field = fieldMap[target]; if (!field) return;

    const body = {}; body[field] = packId || null;

    s[field] = packId || null;

    if (backend.isConfigured()){

      try {

        await _apiRequest('PATCH', '/servers/'+s.id, body);

      } catch(e){ showToast('Could not save style','warn'); }

    }

    renderServerOverview && renderServerOverview();

    _renderCustomizeModal();

  }

  // Open a style picker anchored to a screen point. The caller passes

  // the click coordinates so the menu appears next to where the user

  // actually clicked, like a Windows submenu, instead of jumping to

  // the centre of the page.

  async function openStylePicker(target, id, current, coords){

    await loadPacksCatalog();

    const owned = ownedPackIds();

    const surface = target === 'text'    ? 'textChannel'

                  : target === 'voice'   ? 'voiceChannel'

                  : target === 'category' ? 'category' : null;

    if (!surface) return;

    const items = [

      { icon: current ? 'circle' : 'check', label:'Default', action:()=>{ _saveCustomStyle(target, id, null); } }

    ];

    (_packsCatalog||[]).filter(p => owned.has(p.id) && packSupports(p, surface)).forEach(p => {

      items.push({

        icon: current === p.id ? 'check' : 'circle',

        label: p.name,

        action: () => { _saveCustomStyle(target, id, p.id); }

      });

    });

    if (items.length === 1){

      items.push({ sep:true });

      items.push({ icon:'shopping-bag', label:'Open Customize…', action:()=>{ openCustomizeModal(); } });

    }

    const cx = (coords && coords.x) != null ? coords.x : window.innerWidth/2;

    const cy = (coords && coords.y) != null ? coords.y : window.innerHeight/2;

    showCtxMenu(cx, cy, items, 'STYLE');

  }

  async function _saveCustomStyle(target, id, packId){

    if (!currentServer) return;

    const s = servers[currentServer]; if (!s) return;

    let urlPath, localObj;

    if (target === 'text'){

      const tc = (s.textChannels||[]).find(x => x.id === id); if (!tc) return;

      tc.customStyle = packId || null;

      urlPath = '/channels/text/'+s.id+'/'+id;

      localObj = tc;

    } else if (target === 'voice'){

      const vc = (s.voiceChannels||[]).find(x => x.id === id); if (!vc) return;

      vc.customStyle = packId || null;

      urlPath = '/channels/voice/'+s.id+'/'+id;

      localObj = vc;

    } else if (target === 'category'){

      const cat = (s.categories||[]).find(x => x.id === id); if (!cat) return;

      cat.customStyle = packId || null;

      urlPath = '/servers/'+s.id+'/categories/'+id;

      localObj = cat;

    } else return;

    if (backend.isConfigured()){

      try { await _apiRequest('PATCH', urlPath, { customStyle: packId || null }); }

      catch(_){ showToast('Could not save style','warn'); }

    }

    renderServerOverview && renderServerOverview();

    renderHomeMarkedOrbits && renderHomeMarkedOrbits();

    renderOrbSlides && renderOrbSlides();

  }

  // Build a fake server view with the pack's classnames applied across

  // every styled surface, so the user can see what they'd be buying

  // before they unlock it. The markup mirrors the real renderers (same

  // class names) so the pack CSS just lights up here automatically.

  function openPackPreview(packId){

    const pack = (_packsCatalog||[]).find(p => p.id === packId);

    if (!pack) return;

    const owned = ownedPackIds().has(packId);

    document.getElementById('packPreviewTitle').textContent = '// PREVIEW · ' + pack.name.toUpperCase();

    const unlockBtn = document.getElementById('packPreviewUnlock');

    if (owned){ unlockBtn.disabled = true; unlockBtn.textContent = 'OWNED'; }

    else { unlockBtn.disabled = false; unlockBtn.textContent = 'UNLOCK'; unlockBtn.dataset.czUnlock = packId; }

    const surfaceCls = (k) => packClassFor(packId, k);

    // Preview body: a header summarising the pack + three labelled
    // surface frames matching the world-view chrome. Each frame uses
    // the same DOM/classnames the live renderer uses so the pack CSS
    // automatically lights it up.
    const html =

      '<div class="pp-head">'

        + '<div class="pp-head-name">'+escapeHtml(pack.name)+'</div>'

        + '<div class="pp-head-desc">'+escapeHtml(pack.desc)+'</div>'

        + '<div class="pp-head-meta">'

          + '<span class="pp-pill">'+(pack.price > 0 ? '$'+pack.price : 'FREE')+'</span>'

          + '<span class="pp-pill">'+(pack.surfaces ? pack.surfaces.length : 0)+' SURFACES</span>'

          + (owned ? '<span class="pp-pill pp-pill-owned">OWNED</span>' : '')

        + '</div>'

      + '</div>'

      + '<div class="pp-stack">'

      // 1. Banner — cover, emblem halo, server name

      + '<div class="pp-frame">'

        + '<div class="pp-frame-h"><span class="pp-frame-n">01</span> SERVER BANNER</div>'

        + '<div class="pp-frame-sub">cover · emblem halo · server name</div>'

        + '<div class="pp-banner '+surfaceCls('serverCover')+' '+surfaceCls('serverEmblem')+'">'

          + '<div class="ws-banner-cover" style="background-image:linear-gradient(135deg,#1f1f28,#0d0d12)"></div>'

          + '<div class="pp-banner-row">'

            + '<div class="pp-emblem ws-emblem" style="--srv-grad:linear-gradient(135deg,#ff7eb6,#7a0a14)">A</div>'

            + '<div class="pp-banner-meta">'

              + '<div class="pp-banner-name ws-banner-title '+surfaceCls('serverName')+'">Sample Server</div>'

              + '<div class="pp-banner-sub">3 channels · 2 members</div>'

            + '</div>'

          + '</div>'

        + '</div>'

      + '</div>'

      // 2. Server pin

      + '<div class="pp-frame">'

        + '<div class="pp-frame-h"><span class="pp-frame-n">02</span> PINNED MESSAGE</div>'

        + '<div class="pp-frame-sub">server-wide pin banner</div>'

        + '<div class="ws-pinned-box pp-pin '+surfaceCls('serverPin')+'">'

          + '<div class="ws-pin-icon"><i data-lucide="pin" style="width:14px;height:14px"></i></div>'

          + '<div class="ws-pin-info">'

            + '<div class="ws-pin-l">SERVER PIN</div>'

            + '<div class="ws-pin-text">Welcome — read the rules in #announcements.</div>'

          + '</div>'

        + '</div>'

      + '</div>'

      // 3. Category, text channel, voice channel

      + '<div class="pp-frame">'

        + '<div class="pp-frame-h"><span class="pp-frame-n">03</span> CHANNELS</div>'

        + '<div class="pp-frame-sub">category title · text channel · voice channel</div>'

        + '<div class="pp-rows">'

          + '<div class="pp-cat-h '+surfaceCls('category')+'">'

            + '<div class="ws-cat-h-name">GENERAL</div>'

          + '</div>'

          + '<div class="pp-row pp-row-tc ws-cat-tc style-glow '+surfaceCls('textChannel')+'">'

            + '<i data-lucide="hash" style="width:14px;height:14px;color:var(--t2);flex-shrink:0"></i>'

            + '<span class="ws-cat-tc-n">general</span>'

          + '</div>'

          + '<div class="pp-row pp-row-vc ws-cat-vc style-aurora '+surfaceCls('voiceChannel')+'">'

            + '<div class="ws-cat-vc-orb pp-vc-orb"></div>'

            + '<div class="ws-cat-vc-info">'

              + '<div class="ws-cat-vc-n">LOUNGE</div>'

              + '<div class="ws-cat-vc-c">0 MEMBERS</div>'

            + '</div>'

          + '</div>'

        + '</div>'

      + '</div>'

      + '</div>';

    document.getElementById('packPreviewBody').innerHTML = html;

    document.getElementById('packPreviewBackdrop').classList.add('show');

    refreshIcons();

  }

  async function _unlockPack(packId){

    if (!backend.isConfigured()) { showToast('Sign in to unlock packs','warn'); return; }

    try {

      const r = await _apiRequest('POST', '/packs/'+packId+'/unlock');

      if (r && r.owned){

        if (!selfProfile.unlockedPacks) selfProfile.unlockedPacks = [];

        selfProfile.unlockedPacks = r.owned.slice();

        // Mark in catalog too so the chip flips to OWNED without re-fetch.

        (_packsCatalog||[]).forEach(p => { if (p.id === packId) p.owned = true; });

        showToast('Pack unlocked','success');

        _renderCustomizeModal();

      }

    } catch(_){ showToast('Could not unlock pack','warn'); }

  }

  function openShareServerModal(){

    if (!currentServer) return;

    const s = servers[currentServer];

    if (!s.inviteKey) s.inviteKey = 'NEX-'+Math.random().toString(36).slice(2,7).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase();

    openForwardModal({ type:'serverCard', serverId:s.id, serverName:s.name, serverDesc:s.desc, serverEmblem:s.emblemImage||null, serverCover:s.cover||null, serverGrad:s.grad, serverGlow:s.glow, serverInitial:s.initial, serverInvite:s.inviteKey, serverMembers:(s.members||[]).length, serverPrivate:!!s.isPrivate });

  }

  // ========== Channel/Category Settings (rename + role-gated visibility) ==========

  // Targets: { type:'category'|'text'|'voice', id:string }

  let chanSettingsTarget = null;

  function getEntity(s, target){

    if (!target) return null;

    if (target.type === 'category') return s.categories.find(x => x.id === target.id);

    if (target.type === 'text')     return s.textChannels.find(x => x.id === target.id);

    if (target.type === 'voice')    return s.voiceChannels.find(x => x.id === target.id);

    return null;

  }

  function openChanSettings(target){

    if (!currentServer) return;

    const s = servers[currentServer];

    if (!memberHasPerm(s,selfProfile.name,'manageRoles') && !memberHasPerm(s,selfProfile.name, target.type==='text'?'manageTextCh':target.type==='voice'?'manageVoiceCh':'manageCategory')){

      showToast('You do not have permission to edit this','warn'); return;

    }

    const ent = getEntity(s, target); if (!ent) return;

    chanSettingsTarget = target;

    document.getElementById('chanSettingsTitle').textContent = '// '+(target.type==='category'?'CATEGORY':target.type==='text'?'TEXT CHANNEL':'VOICE ORB')+' SETTINGS';

    document.getElementById('chanSettingsNameLbl').textContent = target.type==='category' ? 'CATEGORY NAME' : 'CHANNEL NAME';

    document.getElementById('chanSettingsName').value = ent.name || '';

    const restricted = Array.isArray(ent.visibleRoleIds) && ent.visibleRoleIds.length > 0;

    setChanSettingsVis(restricted ? 'roles' : 'all');

    renderChanSettingsRoles();

    // Per-role allow/deny editor lives on text channels only — categories

    // and voice orbs use visibility for now. Reset the local buffer from

    // the entity so reopening the modal shows whatever the user already

    // saved; clear it on cancel-by-not-touching.

    chanSettings_overrideAllow = JSON.parse(JSON.stringify(ent.permissionAllow || {}));

    chanSettings_overrideDeny  = JSON.parse(JSON.stringify(ent.permissionDeny  || {}));

    const permField = document.getElementById('chanSettingsPermsField');

    if (permField){

      permField.style.display = (target.type === 'text') ? '' : 'none';

      document.getElementById('chanSettingsPerms').style.display = 'none';

      document.getElementById('chanSettingsPermsToggle').textContent = 'SHOW';

      if (target.type === 'text') renderChanSettingsOverrides();

    }

    // Voice-orb-only: bitrate picker. Default to 64 kbps if the channel

    // has no value yet (mirrors Discord's default audio quality).

    const brField = document.getElementById('chanSettingsBitrateField');

    if (brField){

      brField.style.display = (target.type === 'voice') ? '' : 'none';

      if (target.type === 'voice'){

        const cur = Number(ent.bitrate) || 64;

        document.querySelectorAll('[data-cs-br]').forEach(b => {

          b.classList.toggle('active', Number(b.dataset.csBr) === cur);

        });

        document.getElementById('chanSettingsBitrateLbl').textContent = cur + ' kbps';

      }

    }

    document.getElementById('chanSettingsBackdrop').classList.add('show');

  }

  function setChanSettingsVis(mode){

    document.querySelectorAll('[data-cs-vis]').forEach(b => b.classList.toggle('active', b.dataset.csVis === mode));

    document.getElementById('chanSettingsRoles').style.display = mode === 'roles' ? 'flex' : 'none';

  }

  // Per-role override editor state. Each map is { roleId: ["sendMessages",...] }.

  // Cleared on every openChanSettings, persisted on Save.

  let chanSettings_overrideAllow = {};

  let chanSettings_overrideDeny  = {};

  function renderChanSettingsOverrides(){

    if (!currentServer) return;

    const s = servers[currentServer]; const ent = getEntity(s, chanSettingsTarget); if (!ent) return;

    const wrap = document.getElementById('chanSettingsPerms');

    if (!wrap) return;

    const roles = (s.roles||[]).filter(r => r.id !== 'owner');

    if (!roles.length){ wrap.innerHTML = '<div style="font-size:0.7rem;color:var(--t3)">No roles defined yet.</div>'; return; }

    let html = '';

    roles.forEach(r => {

      const allowList = chanSettings_overrideAllow[r.id] || [];

      const denyList  = chanSettings_overrideDeny[r.id]  || [];

      const isAllow = allowList.includes('sendMessages');

      const isDeny  = denyList.includes('sendMessages');

      html += '<div class="cs-ovr-row" style="--role-c:'+r.color+'">' +

        '<div class="cs-ovr-label">'+escapeHtml(r.name)+'</div>' +

        '<button type="button" class="cs-ovr-pill '+(isAllow?'allow':'')+'" data-ovr-role="'+r.id+'" data-ovr-target="allow">ALLOW</button>' +

        '<button type="button" class="cs-ovr-pill '+(isDeny?'deny':'')+'" data-ovr-role="'+r.id+'" data-ovr-target="deny">DENY</button>' +

      '</div>';

    });

    wrap.innerHTML = html;

  }

  function _toggleSendOverride(roleId, target){

    // Toggle: clicking the same pill again clears it (back to inherit).

    const allowList = chanSettings_overrideAllow[roleId] || [];

    const denyList  = chanSettings_overrideDeny[roleId]  || [];

    const wasAllow  = allowList.includes('sendMessages');

    const wasDeny   = denyList.includes('sendMessages');

    chanSettings_overrideAllow[roleId] = allowList.filter(p => p !== 'sendMessages');

    chanSettings_overrideDeny[roleId]  = denyList.filter(p => p !== 'sendMessages');

    if (target === 'allow' && !wasAllow) chanSettings_overrideAllow[roleId].push('sendMessages');

    if (target === 'deny'  && !wasDeny)  chanSettings_overrideDeny[roleId].push('sendMessages');

    if (!chanSettings_overrideAllow[roleId].length) delete chanSettings_overrideAllow[roleId];

    if (!chanSettings_overrideDeny[roleId].length)  delete chanSettings_overrideDeny[roleId];

    renderChanSettingsOverrides();

  }

  function renderChanSettingsRoles(){

    if (!currentServer) return;

    const s = servers[currentServer]; const ent = getEntity(s, chanSettingsTarget); if (!ent) return;

    const allowed = new Set(ent.visibleRoleIds || []);

    const grid = document.getElementById('chanSettingsRoles');

    // Owner is always implicit; show every other role as a toggle chip.

    const roles = (s.roles||[]).filter(r => r.id !== 'owner');

    if (!roles.length){ grid.innerHTML = '<div style="font-size:0.7rem;color:var(--t3)">No roles defined yet.</div>'; return; }

    grid.innerHTML = roles.map(r => '<div class="cs-role-chip'+(allowed.has(r.id)?' on':'')+'" data-cs-role="'+r.id+'" style="--role-c:'+r.color+'">'+escapeHtml(r.name)+'</div>').join('');

  }

  function renderUserCardHtml(card){

    const av = card.avImage

      ? '<div class="sc-emblem" style="background:transparent url('+card.avImage+') center/cover no-repeat"></div>'

      : '<div class="sc-emblem" style="background:'+card.avColor+'">'+escapeHtml(card.initial||'?')+'</div>';

    const cardJson = encodeURIComponent(JSON.stringify(card));

    const desc = card.bio ? '<div class="sc-desc">'+escapeHtml(String(card.bio).slice(0,140))+'</div>' : '';

    return '<div class="sc-card">'+

      '<div class="sc-eyebrow">USER PROFILE</div>'+

      '<div class="sc-row">'+av+'<div class="sc-info"><div class="sc-name">'+escapeHtml(card.name||'')+'</div><div class="sc-meta">'+escapeHtml(card.handle||'')+'</div></div></div>'+

      desc+

      '<div class="sc-actions"><button class="sc-btn" data-user-card-open="'+cardJson+'"><i data-lucide="user" style="width:11px;height:11px"></i>VIEW PROFILE</button></div>'+

    '</div>';

  }

  function openShareUserModal(key){

    const conv = key === null ? selfProfile : conversations[key];

    if (!conv) return;

    const card = { type:'userCard', userKey: key||'self', name:conv.name, handle:conv.handle, initial:conv.initial, avColor:conv.avColor||conv.orbGrad, avImage:conv.avImage||null, bio:conv.bio||'' };

    openForwardModal(card);

  }

  function openShareChannelModal(kind, chId){

    if (!currentServer) return;

    const s = servers[currentServer];

    let card;

    if (kind === 'text'){

      const tc = s.textChannels.find(x => x.id === chId); if (!tc) return;

      card = { type:'channelCard', kind:'text', serverId:s.id, serverName:s.name, serverEmblem:s.emblemImage||null, serverGrad:s.grad, serverGlow:s.glow, serverInitial:s.initial, channelId:chId, channelName:tc.name, channelStyle:tc.style };

    } else {

      const vc = s.voiceChannels.find(x => x.id === chId); if (!vc) return;

      const chKey = vcChannelKey(vc);

      const data = channelData[chKey] || {};

      card = { type:'channelCard', kind:'voice', serverId:s.id, serverName:s.name, serverEmblem:s.emblemImage||null, serverGrad:s.grad, serverGlow:s.glow, serverInitial:s.initial, channelId:chId, channelName:vc.name, channelStyle:vc.style, channelMembers:(data.users||[]).length };

    }

    openForwardModal(card);

  }

  function openForwardModal(source){

    fwdSourceMsg = source;

    fwdSelectedTargets = new Set();

    document.getElementById('fwdFilter').value = '';

    renderFwdList();

    updateFwdFoot();

    // Server-card forward (i.e. share-server flow): expose the invite

    // code with a copy button so the user can grab the raw token when

    // they don't want to pick a recipient.

    const invitePanel = document.getElementById('fwdInvitePanel');

    if (source && source.type === 'serverCard' && source.serverInvite && !source.serverPrivate){

      invitePanel.style.display = '';

      const inp = document.getElementById('fwdInviteInput');

      inp.value = source.serverInvite;

    } else if (source && source.type === 'serverCard' && source.serverPrivate){

      // Private servers: show a placeholder message instead of the invite.

      invitePanel.style.display = '';

      const inp = document.getElementById('fwdInviteInput');

      inp.value = 'PRIVATE — invite link disabled';

      inp.classList.add('is-disabled');

    } else {

      invitePanel.style.display = 'none';

    }

    document.getElementById('forwardBackdrop').classList.add('show');

  }

  function closeForwardModal(){ document.getElementById('forwardBackdrop').classList.remove('show'); }

  function renderFwdList(){

    const list = document.getElementById('fwdList');

    const q = (document.getElementById('fwdFilter').value||'').toLowerCase();

    let html = '';

    // Saved Messages first

    const saved = conversations.saved;

    if (saved && (!q || saved.name.toLowerCase().includes(q))){

      const checked = fwdSelectedTargets.has('dm:saved');

      html += '<div class="fwd-section-h">SAVED</div>';

      html += '<div class="fwd-item'+(checked?' checked':'')+'" data-fwd-target="dm:saved"><div class="fwd-item-av" style="background:'+saved.avColor+'">'+saved.initial+'</div><div class="fwd-item-name">'+escapeHtml(saved.name)+'</div><div class="fwd-item-check"><i data-lucide="check" style="width:11px;height:11px"></i></div></div>';

    }

    const friends = Object.entries(conversations).filter(([k,c])=>k!=='saved' && !isBlocked(k) && (!q||c.name.toLowerCase().includes(q)));

    if (friends.length){

      html += '<div class="fwd-section-h">FRIENDS</div>';

      html += friends.map(([k,c])=>{

        const checked = fwdSelectedTargets.has('dm:'+k);

        return '<div class="fwd-item'+(checked?' checked':'')+'" data-fwd-target="dm:'+k+'"><div class="fwd-item-av" style="background:'+c.avColor+'">'+c.initial+'</div><div class="fwd-item-name">'+escapeHtml(c.name)+'</div><div class="fwd-item-check"><i data-lucide="check" style="width:11px;height:11px"></i></div></div>';

      }).join('');

    }

    // Build the text-channel list across every server the user is a member of.

    // Voice orbs are NOT valid forward targets. Servers the user has left

    // or deleted are excluded so we never expose channels they can no longer

    // access. We also gate by visibility (visibleRoleIds) and the per-channel

    // sendMessages override — sharing into a channel we can't see, or into a

    // read-only announcements channel where our roles are deny-listed, is

    // exactly what triggered the "private channel got messaged anyway" bug.

    const tcEntries = [];

    Object.keys(servers).forEach(sid => {

      const srv = servers[sid]; if (!srv) return;

      // Skip servers the user isn't actually a member of (defensive — the

      // forwarder UI shouldn't even surface them, but `servers` carries every

      // server we've ever inspected).

      const isMember = !!(srv.members && srv.members.includes(selfProfile.name));

      if (!isMember) return;

      (srv.textChannels||[]).forEach(tc => {

        if (q && !tc.name.toLowerCase().includes(q) && !srv.name.toLowerCase().includes(q)) return;

        // Visibility gate — admins / owners always pass, everyone else needs

        // a role on the entity's allow list (cascaded down from the parent

        // category if any) and not a deny-on-viewChannel override.

        if (!memberCanSeeChannelCascaded(srv, selfProfile.name, tc)) return;

        // Send gate — owner / admins always pass, otherwise sendMessages

        // must not be denied for any of the user's roles in this channel.

        if (!memberHasPermInChannel(srv, selfProfile.name, 'sendMessages', tc)) return;

        tcEntries.push({ srv, tc });

      });

    });

    if (tcEntries.length){

      html += '<div class="fwd-section-h">CHANNELS</div>';

      html += tcEntries.map(({srv, tc}) => {

        const targetKey = 'tc:'+srv.id+':'+tc.id;

        const checked = fwdSelectedTargets.has(targetKey);

        const emblem = srv.emblemImage

          ? '<div class="fwd-item-srv" style="background:transparent url('+srv.emblemImage+') center/cover no-repeat"></div>'

          : '<div class="fwd-item-srv" style="background:'+srv.grad+'">'+escapeHtml(srv.initial||'?')+'</div>';

        return '<div class="fwd-item'+(checked?' checked':'')+'" data-fwd-target="'+targetKey+'">'+

          '<div class="fwd-item-av channel"><i data-lucide="hash" style="width:14px;height:14px"></i></div>'+

          '<div class="fwd-item-name"><div>#'+escapeHtml(tc.name)+'</div><div class="fwd-item-sub">'+escapeHtml(srv.name)+'</div></div>'+

          emblem+

          '<div class="fwd-item-check"><i data-lucide="check" style="width:11px;height:11px"></i></div>'+

        '</div>';

      }).join('');

    }

    if (!html) html = '<div class="sr-empty">No matches</div>';

    list.innerHTML = html;

    refreshIcons();

  }

  function updateFwdFoot(){

    const info = document.getElementById('fwdFootInfo');

    const btn = document.getElementById('fwdSendBtn');

    const n = fwdSelectedTargets.size;

    info.textContent = n===0 ? 'SELECT RECIPIENTS' : (n+' SELECTED');

    btn.classList.toggle('disabled', n===0);

  }

  function executeForward(){

    if (fwdSelectedTargets.size === 0 || !fwdSourceMsg) return;

    const src = fwdSourceMsg;

    fwdSelectedTargets.forEach(target => {

      if (target.startsWith('dm:')){

        const k = target.slice(3);

        if (!messages[k]) messages[k] = [];

        const time = nowTime();

        const tempId = 'tmp_'+uid();

        const newMsg = { id:tempId, sender:'me', time, day:todayDayLabel(), status:'pending', _pending:true, forwarded:true };

        // Build the payload we send to /api/dms; the message we drop into

        // local state mirrors that payload so the bubble looks identical

        // before and after the server confirms.

        let payload = null;

        if (src.type==='serverCard'){

          newMsg.type = 'serverCard';

          newMsg.serverCard = { id:src.serverId, name:src.serverName, desc:src.serverDesc, emblem:src.serverEmblem, cover:src.serverCover, grad:src.serverGrad, glow:src.serverGlow, initial:src.serverInitial, invite:src.serverInvite, members:src.serverMembers, isPrivate:!!src.serverPrivate };

          payload = { type:'serverCard', forwarded:true, serverCard:newMsg.serverCard };

        } else if (src.type==='channelCard'){

          newMsg.type = 'channelCard';

          newMsg.channelCard = { kind:src.kind, serverId:src.serverId, serverName:src.serverName, serverEmblem:src.serverEmblem, serverGrad:src.serverGrad, serverGlow:src.serverGlow, serverInitial:src.serverInitial, channelId:src.channelId, channelName:src.channelName, channelStyle:src.channelStyle, channelMembers:src.channelMembers };

          payload = { type:'channelCard', forwarded:true, channelCard:newMsg.channelCard };

        } else if (src.type==='userCard'){

          newMsg.type = 'userCard';

          newMsg.userCard = { userKey:src.userKey, name:src.name, handle:src.handle, initial:src.initial, avColor:src.avColor, avImage:src.avImage, bio:src.bio };

          payload = { type:'userCard', forwarded:true, userCard:newMsg.userCard };

        } else if (src.type==='image'){

          newMsg.type='image'; newMsg.src=src.src; if (src.text||src.caption) newMsg.caption = src.text||src.caption;

          payload = { type:'image', forwarded:true, src:src.src, caption: src.text||src.caption||'' };

        } else {

          newMsg.text = src.text || '';

        }

        messages[k].push(newMsg);

        bumpDmList(k);

        // Persist to the backend so the peer sees it (via dm:new) and the

        // bubble survives a refresh on both sides.

        if (backend.isConfigured() && k !== 'saved'){

          const peerKey = k;

          backend.dms.send(peerKey, { text: newMsg.text || src.text || '', payload }).then(r => {

            const arr = messages[k] || [];

            const idx = arr.findIndex(x => x.id === tempId);

            if (r && r.message && idx >= 0){

              const merged = { ...arr[idx], ...r.message, status:'delivered', _pending:false };

              merged.id = r.message.id;

              arr[idx] = merged;

              if (currentConversation === k && typeof renderConversation === 'function') renderConversation();

            } else if (r && r.error && idx >= 0){

              arr[idx].status = 'failed'; arr[idx]._pending = false;

              if (currentConversation === k && typeof renderConversation === 'function') renderConversation();

            }

          }).catch(()=>{

            const arr = messages[k] || [];

            const idx = arr.findIndex(x => x.id === tempId);

            if (idx >= 0){ arr[idx].status = 'failed'; arr[idx]._pending = false; }

            if (currentConversation === k && typeof renderConversation === 'function') renderConversation();

          });

        } else if (k === 'saved' && backend.isConfigured()){

          backend.dms.send('saved', { text: newMsg.text || src.text || '', payload }).catch(()=>{});

        }

      } else if (target.startsWith('tc:')){

        // Forward to a server text channel: srvId:chId

        const rest = target.slice(3);

        const sep = rest.indexOf(':');

        if (sep < 0) return;

        const srvId = rest.slice(0, sep);

        const chId  = rest.slice(sep+1);

        // Build a payload object that captures the forwarded card / image so

        // the receiver renders it the same way after a refresh.

        let payload = null;

        if (src.type==='serverCard'){

          payload = { type:'serverCard', forwarded:true, serverCard:{ id:src.serverId, name:src.serverName, desc:src.serverDesc, emblem:src.serverEmblem, cover:src.serverCover, grad:src.serverGrad, glow:src.serverGlow, initial:src.serverInitial, invite:src.serverInvite, members:src.serverMembers, isPrivate:!!src.serverPrivate } };

        } else if (src.type==='channelCard'){

          payload = { type:'channelCard', forwarded:true, channelCard:{ kind:src.kind, serverId:src.serverId, serverName:src.serverName, serverEmblem:src.serverEmblem, serverGrad:src.serverGrad, serverGlow:src.serverGlow, serverInitial:src.serverInitial, channelId:src.channelId, channelName:src.channelName, channelStyle:src.channelStyle, channelMembers:src.channelMembers } };

        } else if (src.type==='userCard'){

          payload = { type:'userCard', forwarded:true, userCard:{ userKey:src.userKey, name:src.name, handle:src.handle, initial:src.initial, avColor:src.avColor, avImage:src.avImage, bio:src.bio } };

        } else if (src.type==='image'){

          payload = { type:'image', forwarded:true, src: src.src };

        } else {

          payload = { type:'forward', forwarded:true };

        }

        if (backend.isConfigured()){

          backend.servers.sendChannelMessage(srvId, chId, { text: src.text || '', payload }).catch(()=>{});

        } else {

          // Local-only fallback (no backend) — keep the legacy behaviour so the

          // forward button still does *something* in offline demos.

          const k = srvId+'__'+chId;

          serverChannelMessages[k] = serverChannelMessages[k] || [];

          const newMsg = { id:Date.now()+Math.floor(Math.random()*1000), user:selfProfile.name, text:src.text||'', time:nowTime(), forwarded:true };

          if (payload && payload.type !== 'forward') Object.assign(newMsg, payload);

          serverChannelMessages[k].push(newMsg);

          const srv = servers[srvId]; if (srv){ const tc = srv.textChannels.find(x => x.id === chId); if (tc && !(currentServer===srvId && currentTextChannel===chId)){ tc.unread = (tc.unread||0)+1; updateBadges(); } }

        }

      }

    });

    showToast('Forwarded to '+fwdSelectedTargets.size+' recipient(s)','success');

    closeForwardModal();

    if (currentConversation) renderConversation();

    if (currentServer && currentTextChannel) renderChannelView();

    renderDmList();

  }

  // ============== CREATE CHANNEL MODAL (admin) ==============

  let ccActiveTab = 'text';

  let ccSelectedStyle = 'glow';

  let ccTargetCategory = null;

  function openCreateChannel(forceTab, targetCatId){

    ccActiveTab = forceTab || 'text';

    ccSelectedStyle = ccActiveTab==='voice' ? 'indigo' : 'glow';

    ccTargetCategory = targetCatId || null;

    document.getElementById('ccNameInput').value = '';

    document.querySelectorAll('[data-cc-tab]').forEach(t => t.classList.toggle('active', t.dataset.ccTab === ccActiveTab));

    renderCcCategorySelect();

    renderCcStyles();

    showCcStyleField();

    document.getElementById('createChannelBackdrop').classList.add('show');

    setTimeout(()=>document.getElementById('ccNameInput').focus(), 100);

  }

  function renderCcCategorySelect(){

    const sel = document.getElementById('ccCategorySelect');

    if (!sel) return;

    if (!currentServer){ sel.innerHTML = '<option value="">— no server —</option>'; return; }

    const s = servers[currentServer];

    const cats = (s.categories || []);

    // If the caller did not pass an explicit target category (and the user has

    // exactly one), preselect it so they don't get the "select a category"

    // error after creating their first category. Otherwise highlight the

    // explicit target.

    const defaultId = ccTargetCategory || (cats.length === 1 ? cats[0].id : null);

    let opts = '<option value="">— select a category —</option>';

    cats.forEach(cat => {

      const sel2 = (defaultId===cat.id) ? ' selected' : '';

      opts += '<option value="'+cat.id+'"'+sel2+'>'+escapeHtml(cat.name)+'</option>';

    });

    sel.innerHTML = opts;

  }

  function showCcStyleField(){

    // CATEGORY tab hides both the voice-style picker and the category select.

    // TEXT/VOICE tabs require a category, so keep the select visible.

    const vf = document.getElementById('ccVoiceStyleField'); if (vf) vf.style.display = ccActiveTab==='voice'?'flex':'none';

    const cf = document.getElementById('ccCategoryField'); if (cf) cf.style.display = ccActiveTab==='category'?'none':'flex';

    const hint = document.getElementById('ccCategoryHint'); if (hint) hint.style.display = 'none';

    const lbl = document.getElementById('ccNameLabel');

    if (lbl) lbl.textContent = ccActiveTab==='category' ? 'CATEGORY NAME' : 'CHANNEL NAME';

    const input = document.getElementById('ccNameInput');

    if (input) input.placeholder = ccActiveTab==='category' ? 'e.g. COMMAND CENTER' : 'general';

    const title = ccActiveTab==='voice' ? 'VOICE ORB' : ccActiveTab==='category' ? 'CATEGORY' : 'TEXT CHANNEL';

    document.getElementById('ccTitle').textContent = '// CREATE '+title;

  }

  function renderCcStyles(){

    // The TEXT CHANNEL BUTTON STYLE picker was removed - text channels just use a default style.

    if (ccActiveTab === 'text' && (!ccSelectedStyle || textStyles.indexOf(ccSelectedStyle) < 0)) ccSelectedStyle = textStyles[0];

    // voice styles - render as a 3-up slider so legendary skins also fit

    const vg = document.getElementById('ccVoiceStyleGrid');

    const keys = Object.keys(voiceStyles);

    if (keys.indexOf(ccSelectedStyle) < 0) ccSelectedStyle = keys[0];

    vg.innerHTML = '<button class="cc-orb-arrow" data-cc-orb-nav="-1" type="button"><i data-lucide="chevron-left" style="width:14px;height:14px"></i></button>'+

      '<div class="cc-orb-track" id="ccOrbTrack">'+

        keys.map(st => {

          const sObj = voiceStyles[st];

          const isSel = ccActiveTab==="voice" && ccSelectedStyle===st;

          const legBadge = sObj.skin ? '<div class="cc-orb-tier">★ LEGENDARY</div>' : '';

          return '<div class="cc-orb-card'+(sObj.skin?" skin-"+sObj.skin:"")+(sObj.skin?" is-legendary":"")+(isSel?" selected":"")+'" data-cc-voice-style="'+st+'">'+

            '<div class="cc-orb-glow" style="background:radial-gradient(circle at 50% 50%,'+sObj.glow+',transparent 65%)"></div>'+

            '<div class="cc-orb-bead" style="background:'+sObj.grad+';box-shadow:0 0 14px '+sObj.glow+',inset 0 0 8px rgba(255,255,255,0.25)"></div>'+

            '<div class="cc-orb-label">'+escapeHtml(sObj.label||st.toUpperCase())+'</div>'+

            legBadge+

          '</div>';

        }).join('')+

      '</div>'+

      '<button class="cc-orb-arrow" data-cc-orb-nav="1" type="button"><i data-lucide="chevron-right" style="width:14px;height:14px"></i></button>';

    refreshIcons();

  }

  async function submitCreateChannel(){

    if (!currentServer){ showToast('Open a server first','warn'); return; }

    const name = document.getElementById('ccNameInput').value.trim();

    const s = servers[currentServer];

    if (ccActiveTab==='category'){

      if (!name){ showToast('Enter a category name','warn'); return; }

      if (!memberHasPerm(s,selfProfile.name,'manageCategory')){ showToast('You do not have permission to add categories','warn'); return; }

      s.categories = s.categories || [];

      let cid = 'cat-'+uid();

      if (backend.isConfigured()){

        const r = await backend.servers.addCategory(currentServer, { name: name.toUpperCase() });

        if (r.offline){ showToast('Cannot reach the server','warn'); return; }

        if (r.error){ showToast('Could not create category: '+r.error,'warn'); return; }

        cid = r.category.id;

      }

      // The realtime `server:category-added` event may have already arrived

      // before this POST resolved — guard against duplicate inserts.

      if (!s.categories.find(c => c.id === cid)){

        s.categories.push({ id:cid, name:name.toUpperCase(), textChannels:[], voiceChannels:[] });

      }

      document.getElementById('createChannelBackdrop').classList.remove('show');

      renderServerOverview();

      showToast('Category "'+name+'" created','success');

      return;

    }

    if (!name){ showToast('Enter a channel name','warn'); return; }

    // Channels MUST belong to a category.

    const selCatId = (document.getElementById('ccCategorySelect') || {}).value || '';

    const cat = (s.categories || []).find(c => c.id === selCatId);

    if (!cat){

      const hint = document.getElementById('ccCategoryHint'); if (hint) hint.style.display = 'block';

      if (!(s.categories || []).length){

        showToast('Create a category first','warn');

      } else {

        showToast('Select a category for this channel','warn');

      }

      return;

    }

    let newId;

    if (ccActiveTab==='text'){

      newId = uid();

      if (backend.isConfigured()){

        const r = await backend.servers.addTextChannel(currentServer, { name, style: ccSelectedStyle, categoryId: cat.id });

        if (r.offline){ showToast('Cannot reach the server','warn'); return; }

        if (r.error){ console.warn('[orblood] addTextChannel error', r); showToast('Could not create channel: '+r.error,'warn'); return; }

        newId = r.channel.id;

      }

      // De-dup against the realtime `server:channel-added` echo that may

      // have already inserted this channel before our POST resolved.

      if (!s.textChannels.find(t => t.id === newId)){

        s.textChannels.push({ id:newId, name, style: ccSelectedStyle, unread:0 });

      }

      cat.textChannels = cat.textChannels || [];

      if (!cat.textChannels.includes(newId)) cat.textChannels.push(newId);

      showToast('Text channel #'+name+' created','success');

    } else {

      newId = 'custom-'+uid();

      if (backend.isConfigured()){

        const r = await backend.servers.addVoiceChannel(currentServer, { name: name.toUpperCase(), style: ccSelectedStyle, categoryId: cat.id });

        if (r.offline){ showToast('Cannot reach the server','warn'); return; }

        if (r.error){ console.warn('[orblood] addVoiceChannel error', r); showToast('Could not create voice channel: '+r.error,'warn'); return; }

        newId = r.channel.id;

      }

      if (!s.voiceChannels.find(v => v.id === newId)){

        s.voiceChannels.push({ id:newId, name: name.toUpperCase(), style: ccSelectedStyle });

      }

      if (!channelData[newId]){

        const st = voiceStyles[ccSelectedStyle];

        const m = (st.glow||'rgba(185,28,74,0.4)').match(/rgba\((\d+),(\d+),(\d+),/);

        const isLeg = !!st.skin;

        channelData[newId] = { name:name.toUpperCase(), users:[], color:'rgba('+(m?m[1]:99)+','+(m?m[2]:102)+','+(m?m[3]:241)+',', planetGrad:st.grad, atmoColor:st.glow, orbiterColor:st.c, avBorder:'#fff', emoji:'🪐', tier:isLeg?'legendary':'common', skin:st.skin||undefined };

      }

      cat.voiceChannels = cat.voiceChannels || [];

      if (!cat.voiceChannels.includes(newId)) cat.voiceChannels.push(newId);

      showToast('Voice orb '+name+' created','success');

    }

    document.getElementById('createChannelBackdrop').classList.remove('show');

    renderServerOverview();

    if (voiceUsersSidebarOpen) renderVoiceUsers();

  }

  // ============== CREATE / JOIN SERVER ==============

  let csActiveTab = 'create';

  let csSelectedColor = 'indigo';

  const serverColorPalette = {

    indigo: { grad:'linear-gradient(135deg,#6366f1,#1e1b4b)', glow:'rgba(185,28,74,0.55)' },

    pink:   { grad:'linear-gradient(135deg,#ec4899,#831843)', glow:'rgba(236,72,153,0.55)' },

    green:  { grad:'linear-gradient(135deg,#22c55e,#14532d)', glow:'rgba(34,197,94,0.55)' },

    cyan:   { grad:'linear-gradient(135deg,#22d3ee,#164e63)', glow:'rgba(34,211,238,0.55)' },

    gold:   { grad:'linear-gradient(135deg,#fbbf24,#92400e)', glow:'rgba(245,158,11,0.55)' },

    purple: { grad:'linear-gradient(135deg,#a855f7,#3b0764)', glow:'rgba(190,18,60,0.55)' }

  };

  function openCreateServer(){

    csActiveTab = 'create';

    // Pick a random palette key for this server. We deliberately do not

    // expose the palette to the user — too many decisions for a one-off.

    const keys = Object.keys(serverColorPalette);

    csSelectedColor = keys[Math.floor(Math.random() * keys.length)];

    document.querySelectorAll('[data-cs-tab]').forEach(t => t.classList.toggle('active', t.dataset.csTab === csActiveTab));

    document.getElementById('csCreatePane').style.display = '';

    document.getElementById('csJoinPane').style.display = 'none';

    document.getElementById('csNameInput').value = '';

    document.getElementById('csDescInput').value = '';

    document.getElementById('csJoinInput').value = '';

    // Reset visibility radio to public.

    const pubRadio = document.querySelector('input[name="csVisibility"][value="public"]');

    if (pubRadio) pubRadio.checked = true;

    document.getElementById('createServerBackdrop').classList.add('show');

  }

  async function submitCreateServer(){

    if (csActiveTab==='create'){

      const name = document.getElementById('csNameInput').value.trim();

      if (!name){ showToast('Enter a server name','warn'); return; }

      const desc = document.getElementById('csDescInput').value.trim() || 'A new ORBLOOD server.';

      const p = serverColorPalette[csSelectedColor];

      const hexMatch = p.grad.match(/#([0-9a-fA-F]{6})/);

      const baseColor = hexMatch ? '#'+hexMatch[1] : '#b91c4a';

      // Backend path — we let the server allocate the id + invite key.

      if (backend.isConfigured()){

        const visRadio = document.querySelector('input[name="csVisibility"]:checked');

        const isPrivate = !!(visRadio && visRadio.value === 'private');

        const r = await backend.servers.create({

          name, desc, baseColor,

          grad: p.grad, glow: p.glow,

          isPrivate

        });

        if (r.offline){ showToast('Cannot reach the server','warn'); return; }

        if (r.error){ showToast('Could not create server: '+r.error,'warn'); return; }

        servers[r.server.id] = r.server;

        myServers.push(r.server.id);

        persistPinnedServers();

        // Seed channelData for the default voice channels so the orbs

        // column / world view can render their members + skin without

        // waiting for the next snapshot. Without this the freshly-

        // created LOUNGE has no entry in channelData and joining/

        // deleting it desyncs the UI until the next reload.

        (r.server.voiceChannels || []).forEach(vc => {

          if (channelData[vc.id]) return;

          const st = voiceStyles[vc.style] || voiceStyles.indigo;

          const m = (st.glow||'rgba(99,102,241,0.4)').match(/rgba\((\d+),(\d+),(\d+),/);

          channelData[vc.id] = {

            name: vc.name, users: [],

            color: 'rgba('+(m?m[1]:99)+','+(m?m[2]:102)+','+(m?m[3]:241)+',',

            planetGrad: st.grad, atmoColor: st.glow, orbiterColor: st.c,

            avBorder: '#fff', emoji: '🪐',

            tier: st.skin ? 'legendary' : 'common',

            skin: st.skin || undefined

          };

        });

        showToast('Server "'+name+'" created','success');

        renderServerRails(); renderHomeMyServers();

        document.getElementById('createServerBackdrop').classList.remove('show');

        setPage('pageWorld');

        selectServer(r.server.id);

        return;

      }

      // Local-only fallback

      const sid = 'srv-'+uid();

      servers[sid] = {

        id:sid, name:name.toUpperCase(), initial:name.charAt(0).toUpperCase(), desc,

        baseColor,

        grad:p.grad, glow:p.glow, bannerC1:p.glow.replace('0.55','0.18'), bannerC2:'rgba(185,28,74,0.1)',

        members:[selfProfile.name], admins:[selfProfile.name],

        textChannels:[], voiceChannels:[], categories:[],

        pinned:null,

        isPrivate: !!(document.querySelector('input[name="csVisibility"]:checked')||{}).value &&

                   document.querySelector('input[name="csVisibility"]:checked').value === 'private'

      };

      myServers.push(sid);

      showToast('Server "'+name+'" created','success');

      renderServerRails(); renderHomeMyServers();

      document.getElementById('createServerBackdrop').classList.remove('show');

      setPage('pageWorld');

      selectServer(sid);

      return;

    }

    // JOIN tab

    const code = document.getElementById('csJoinInput').value.trim();

    if (!code){ showToast('Enter an invite ID','warn'); return; }

    let preview = null;

    if (backend.isConfigured()){

      // Server-side lookup. Returns 404 if the key/id isn't valid.

      const r = await fetch(_backendBase()+'/servers/lookup/'+encodeURIComponent(code), {

        headers: { 'Authorization': 'Bearer '+(backend.token.read()||'') }

      }).then(x => x.json()).catch(()=>null);

      if (!r || r.error === 'not_found'){

        showToast('No server found for "'+code+'"','warn'); return;

      }

      if (r.error){ showToast('Could not look up server','warn'); return; }

      preview = r.server;

    } else {

      const found = Object.values(servers).find(sv =>

        (sv.inviteKey && sv.inviteKey.toLowerCase() === code.toLowerCase()) || sv.id === code

      );

      if (!found){ showToast('No server found for "'+code+'"','warn'); return; }

      if (found.isPrivate && !(found.members||[]).includes(selfProfile.name)){

        showToast(found.name+' is private — try again later','warn'); return;

      }

      preview = {

        id: found.id, name: found.name, desc: found.desc,

        emblem: found.emblemImage || null, cover: found.cover || null,

        grad: found.grad, glow: found.glow, initial: found.initial,

        invite: found.inviteKey || null,

        members: (found.members||[]).length,

        isPrivate: !!found.isPrivate

      };

    }

    document.getElementById('createServerBackdrop').classList.remove('show');

    openServerJoinModal(preview);

  }

  // ============== GENERIC DRAG-REORDER ==============

  // Wires up an HTMLDragEvent-based reorder on a container holding `itemSelector` children.

  // Each child must expose a `data-key` attribute. After reorder, `onReorder(newKeyArray)` fires.

  function wireDragReorder(container, itemSelector, onReorder){

    if (!container) return;

    container.querySelectorAll(itemSelector).forEach(el => {

      el.draggable = true;

      el.addEventListener('dragstart', e => {

        const draggedEl = e.target.closest('[draggable="true"]');

        if (draggedEl !== el){ e.stopPropagation(); return; }

        el.classList.add('drag-source');

        try { e.dataTransfer.setData('text/plain', el.dataset.key); e.dataTransfer.effectAllowed = 'move'; } catch(_){}

        e.stopPropagation();

      });

      el.addEventListener('dragend', () => {

        el.classList.remove('drag-source');

        container.querySelectorAll('.drag-over-before,.drag-over-after').forEach(x => x.classList.remove('drag-over-before','drag-over-after'));

      });

      el.addEventListener('dragover', e => {

        const innermost = e.target.closest(itemSelector);

        if (innermost && innermost !== el) return;

        e.preventDefault();

        e.stopPropagation();

        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

        const rect = el.getBoundingClientRect();

        const horizontal = container.scrollWidth > container.clientWidth || rect.width > rect.height;

        const before = horizontal

          ? (e.clientX < rect.left + rect.width / 2)

          : (e.clientY < rect.top + rect.height / 2);

        container.querySelectorAll('.drag-over-before,.drag-over-after').forEach(x => x.classList.remove('drag-over-before','drag-over-after'));

        el.classList.add(before ? 'drag-over-before' : 'drag-over-after');

      });

      el.addEventListener('drop', e => {

        const innermost = e.target.closest(itemSelector);

        if (innermost && innermost !== el) return;

        e.preventDefault();

        e.stopPropagation();

        const srcKey = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';

        const dstKey = el.dataset.key;

        if (!srcKey || srcKey === dstKey) return;

        const before = el.classList.contains('drag-over-before');

        el.classList.remove('drag-over-before','drag-over-after');

        const keys = Array.from(container.querySelectorAll(itemSelector)).map(x => x.dataset.key);

        const fromIdx = keys.indexOf(srcKey);

        if (fromIdx >= 0) keys.splice(fromIdx, 1);

        let toIdx = keys.indexOf(dstKey);

        if (!before) toIdx += 1;

        keys.splice(toIdx, 0, srcKey);

        onReorder(keys);

      });

    });

  }

  // ============== GENERIC PORTAL MENU (used by DM header, channel header) ==============

  let portalMenuEl = null;

  function closePortalMenu(){ if (portalMenuEl){ portalMenuEl.remove(); portalMenuEl = null; } }

  function openPortalMenu(anchorBtn, items){

    closePortalMenu();

    const pop = document.createElement('div');

    pop.className = 'banner-portal-menu';

    pop.innerHTML = items.map((it,i) => it.sep

      ? '<div class="bpm-sep"></div>'

      : '<button class="bpm-item'+(it.danger?' danger':'')+'" data-pm-idx="'+i+'"><i data-lucide="'+it.icon+'"></i>'+escapeHtml(it.label)+'</button>'

    ).join('');

    document.body.appendChild(pop);

    refreshIcons();

    const r = anchorBtn.getBoundingClientRect();

    const pr = pop.getBoundingClientRect();

    let top = r.bottom + 6;

    let left = r.right - pr.width;

    if (left < 8) left = 8;

    if (top + pr.height > window.innerHeight - 8) top = r.top - pr.height - 6;

    if (top < 8) top = 8;

    pop.style.top = top + 'px';

    pop.style.left = left + 'px';

    pop.addEventListener('click', e => {

      const b = e.target.closest('[data-pm-idx]'); if (!b) return;

      const idx = parseInt(b.dataset.pmIdx);

      const it = items[idx];

      closePortalMenu();

      if (it && it.action) it.action();

    });

    portalMenuEl = pop;

    // Close on outside click. We delay attach by a tick so the very click that opened the menu doesn't immediately close it.

    setTimeout(() => {

      function onDoc(ev){

        if (!portalMenuEl) return;

        if (portalMenuEl.contains(ev.target)) return;

        if (anchorBtn.contains(ev.target)) return;

        closePortalMenu();

        document.removeEventListener('mousedown', onDoc, true);

        document.removeEventListener('touchstart', onDoc, true);

      }

      document.addEventListener('mousedown', onDoc, true);

      document.addEventListener('touchstart', onDoc, true);

    }, 0);

  }

  // ============== VOICE SETTINGS MODAL ==============

  const VOICE_LS_KEY = 'orblood:voiceSettings';

  // Load persisted voice settings before constructing the object so

  // partial saves don't clobber the new schema. Anything missing falls

  // back to the literal defaults below via Object spread.

  const _voicePersisted = (() => {

    try { return JSON.parse(localStorage.getItem(VOICE_LS_KEY) || 'null') || {}; }

    catch(_){ return {}; }

  })();

  function _saveVoiceSettings(){

    try { localStorage.setItem(VOICE_LS_KEY, JSON.stringify(voiceSettings)); } catch(_){}

  }

  const voiceSettings = Object.assign({

    inputDevice:'default', outputDevice:'default',

    inputVolume:100, outputVolume:100,

    mode:'vad', pttKey:'V', sensitivity:-50,

    echo:true,  echoStr:70,    // 0-100 — translated to constraint hints + post-DSP

    noise:true, noiseStr:60,

    agc:false,  agcStr:50,

    // Self-monitor: when enabled, the user's own mic plays back to them

    // through `selfMonAudio` so they can verify input level + processing

    // toggles without joining a call. Volume is independent so they can

    // listen at a low level even with a high input level.

    selfMon:false, selfMonVolume:60,

    // Hotkey strings: combos like "Ctrl+Shift+M" or "F1". null = no

    // shortcut. Stored in lower-case + sorted modifier order so

    // matchesCombo() can compare canonical forms.

    muteHotkey: null,

    deafenHotkey: null

  }, _voicePersisted);

  // Live audio chain used by the self-monitor toggle. Built lazily the

  // first time the user turns it on; torn down when toggled off so the

  // mic light goes away.

  let _selfMonStream = null;

  let _selfMonAudio  = null;

  // The self-monitor pipeline keeps a single AudioContext + filter

  // chain so we can tweak strength values in real time without

  // tearing the stream down. Refs are stored at module scope.

  let _smCtx = null;

  let _smHighpass = null;     // noise-suppression strength → cutoff Hz

  let _smCompressor = null;   // echo strength → threshold/ratio

  let _smAgc = null;          // auto-gain strength → makeup gain

  let _smLowpass = null;      // noise strength → trim high-frequency hiss

  let _smGate = null;         // noise strength → adaptive noise gate

  let _smAnalyser = null;     // drives the gate envelope

  let _smGateRAF = 0;

  let _smNoiseFloor = 0.02;   // EMA of background noise level (linear)

  let _smRawStream = null;    // the actual mic stream behind the chain

  function _smApplyStrengths(){

    if (!_smCtx) return;

    if (_smHighpass){

      // Noise suppression strength 0..100 → highpass cutoff 40-220 Hz.

      // Sweeps out HVAC rumble, fan hum, mic-stand thumps.

      const t = voiceSettings.noise ? voiceSettings.noiseStr/100 : 0;

      _smHighpass.frequency.setTargetAtTime(40 + t * 180, _smCtx.currentTime, 0.05);

    }

    if (_smLowpass){

      // Same noise strength also pulls the lowpass cutoff inward —

      // 12 kHz (off) → 5.5 kHz (max). Voice intelligibility lives below

      // 4 kHz; cutting hiss above that is a clean perceptual win.

      const t = voiceSettings.noise ? voiceSettings.noiseStr/100 : 0;

      _smLowpass.frequency.setTargetAtTime(12000 - t * 6500, _smCtx.currentTime, 0.05);

    }

    if (_smCompressor){

      // Echo strength → harder compression on the residual room

      // reflections that survived the browser's AEC. Threshold drops

      // -12 → -50 dB; ratio climbs 2:1 → 8:1.

      const t = voiceSettings.echo ? voiceSettings.echoStr/100 : 0;

      _smCompressor.threshold.setTargetAtTime(-12 - t*38, _smCtx.currentTime, 0.05);

      _smCompressor.ratio.setTargetAtTime(2 + t*6, _smCtx.currentTime, 0.05);

      _smCompressor.knee.setTargetAtTime(24 - t*18, _smCtx.currentTime, 0.05);

    }

    if (_smAgc){

      const t = voiceSettings.agc ? voiceSettings.agcStr/100 : 0;

      _smAgc.gain.setTargetAtTime(1 + t * 1.5, _smCtx.currentTime, 0.05);

    }

  }

  // Adaptive noise gate. Tracks the rolling background noise floor and

  // opens the gate when the instantaneous level is some multiplier

  // above that floor. The multiplier scales with the noise strength so

  // a higher strength means a tighter gate (more aggressive silence).

  function _smStartGate(){

    if (!_smCtx || !_smAnalyser || !_smGate) return;

    const data = new Uint8Array(_smAnalyser.fftSize);

    let lastT = performance.now();

    const tick = () => {

      if (!_smCtx || _smCtx.state === 'closed') return;

      _smAnalyser.getByteTimeDomainData(data);

      // Peak amplitude on the [-1,1] scale.

      let peak = 0;

      for (let i=0;i<data.length;i++){

        const v = Math.abs(data[i] - 128) / 128;

        if (v > peak) peak = v;

      }

      // Update the rolling noise floor only during quiet stretches —

      // an EMA with a slow time constant. This way a person who's been

      // silent for a few seconds re-baselines the gate without speech

      // dragging the floor up.

      const now = performance.now();

      const dt = Math.min(0.1, (now - lastT) / 1000);

      lastT = now;

      const quiet = peak < _smNoiseFloor * 4;

      if (quiet){

        // ~5 s time constant when quiet so the floor settles.

        _smNoiseFloor += (peak - _smNoiseFloor) * (dt / 5);

      } else {

        // Tiny upward drift during speech so we don't lock in too low.

        _smNoiseFloor += (peak - _smNoiseFloor) * (dt / 60);

      }

      _smNoiseFloor = Math.max(0.002, Math.min(0.1, _smNoiseFloor));

      // Gate ratio: at strength 0 we never close; at strength 100 the

      // gate needs the signal to be 8x the floor to open.

      const t = voiceSettings.noise ? voiceSettings.noiseStr/100 : 0;

      const openMultiplier = 1.2 + t * 6.8;   // 1.2x (loose) → 8x (tight)

      const open = peak > _smNoiseFloor * openMultiplier;

      const target = open ? 1 : (t > 0.1 ? 0 : 1);  // disabled below 10%

      _smGate.gain.setTargetAtTime(target, _smCtx.currentTime,

        open ? 0.003 : 0.08);  // fast attack, slow release

      _smGateRAF = requestAnimationFrame(tick);

    };

    _smGateRAF = requestAnimationFrame(tick);

  }

  function _smStopGate(){

    if (_smGateRAF){ cancelAnimationFrame(_smGateRAF); _smGateRAF = 0; }

  }

  async function startSelfMonitor(){

    if (_selfMonStream) return;

    try {

      _smRawStream = await navigator.mediaDevices.getUserMedia({

        audio: {

          deviceId: voiceSettings.inputDevice && voiceSettings.inputDevice !== 'default'

            ? { exact: voiceSettings.inputDevice } : undefined,

          echoCancellation:  !!voiceSettings.echo,

          noiseSuppression:  !!voiceSettings.noise,

          autoGainControl:   !!voiceSettings.agc

        }

      });

    } catch(e){

      showToast('Microphone permission denied','warn');

      voiceSettings.selfMon = false;

      const cb = document.getElementById('vsSelfMon'); if (cb) cb.checked = false;

      const ctl = document.getElementById('vsSelfMonControls'); if (ctl) ctl.style.display = 'none';

      return;

    }

    // Build the strength-driven chain: src → highpass → compressor →

    // AGC → destination. Each node's parameter is wired to a slider so

    // dragging is audible immediately.

    try {

      const AC = window.AudioContext || window.webkitAudioContext;

      _smCtx = new AC({ latencyHint: 'interactive' });

      const src = _smCtx.createMediaStreamSource(_smRawStream);

      // Filter chain:

      //   src → highpass → lowpass → compressor → AGC → gate → dest

      // The analyser taps off after the compressor so the gate

      // decides on already-leveled material, not raw input where loud

      // breaths could trip it open.

      _smHighpass = _smCtx.createBiquadFilter();

      _smHighpass.type = 'highpass';

      _smLowpass = _smCtx.createBiquadFilter();

      _smLowpass.type = 'lowpass';

      _smCompressor = _smCtx.createDynamicsCompressor();

      _smAgc = _smCtx.createGain();

      _smGate = _smCtx.createGain();

      _smGate.gain.value = 1;

      _smAnalyser = _smCtx.createAnalyser();

      _smAnalyser.fftSize = 1024;

      const dest = _smCtx.createMediaStreamDestination();

      src.connect(_smHighpass);

      _smHighpass.connect(_smLowpass);

      _smLowpass.connect(_smCompressor);

      _smCompressor.connect(_smAgc);

      _smAgc.connect(_smAnalyser);

      _smAgc.connect(_smGate);

      _smGate.connect(dest);

      _smNoiseFloor = 0.02;

      _smApplyStrengths();

      _smStartGate();

      _selfMonStream = dest.stream;

    } catch(e){

      console.warn('[voice] self-monitor chain build failed, using raw:', e && e.message);

      _selfMonStream = _smRawStream;

    }

    _selfMonAudio = document.createElement('audio');

    _selfMonAudio.autoplay = true;

    _selfMonAudio.dataset.selfMonitor = '1';

    _selfMonAudio.srcObject = _selfMonStream;

    _selfMonAudio.volume = Math.max(0, Math.min(1, voiceSettings.selfMonVolume / 100));

    document.body.appendChild(_selfMonAudio);

    // While the user is listening to themselves, force mute+deafen so

    // peers in any active voice channel don't hear the test, and so

    // we don't pick up our own playback through speakers. Remember the

    // pre-test state and restore on stop.

    _selfMonPrevMuted   = (typeof muted   !== 'undefined') ? muted   : false;

    _selfMonPrevDeafened= (typeof deafened!== 'undefined') ? deafened: false;

    if (!muted){

      muted = true;

      try { voice.mute(true); } catch(_){}

      const m = document.getElementById('btnMic');

      if (m){ m.classList.add('muted-state'); m.innerHTML = '<i data-lucide="mic-off" style="width:14px;height:14px"></i>'; if (typeof refreshIcons==='function') refreshIcons(); }

    }

    if (!deafened){

      deafened = true;

      try { voice.deafen(true); } catch(_){}

      const d = document.getElementById('btnDeafen');

      if (d){ d.classList.add('muted-state'); d.innerHTML = '<i data-lucide="headphone-off" style="width:14px;height:14px"></i>'; if (typeof refreshIcons==='function') refreshIcons(); }

    }

  }

  // State captured at startSelfMonitor() so stopSelfMonitor() can put

  // mic+deafen back exactly as it found them.

  let _selfMonPrevMuted = false;

  let _selfMonPrevDeafened = false;

  function stopSelfMonitor(){

    if (_selfMonAudio){

      try { _selfMonAudio.pause(); _selfMonAudio.srcObject = null; } catch(_){}

      _selfMonAudio.remove(); _selfMonAudio = null;

    }

    if (_smRawStream){

      _smRawStream.getTracks().forEach(t => { try { t.stop(); } catch(_){} });

      _smRawStream = null;

    }

    if (_selfMonStream){

      try { _selfMonStream.getTracks().forEach(t => t.stop()); } catch(_){}

      _selfMonStream = null;

    }

    _smStopGate();

    if (_smCtx){ try { _smCtx.close(); } catch(_){} _smCtx = null; }

    _smHighpass = _smLowpass = _smCompressor = _smAgc = _smGate = _smAnalyser = null;

    // Restore the pre-test mic/deafen state.

    if (!_selfMonPrevDeafened && deafened){

      deafened = false;

      try { voice.deafen(false); } catch(_){}

      const d = document.getElementById('btnDeafen');

      if (d){ d.classList.remove('muted-state'); d.innerHTML = '<i data-lucide="headphones" style="width:14px;height:14px"></i>'; if (typeof refreshIcons==='function') refreshIcons(); }

    }

    if (!_selfMonPrevMuted && muted){

      muted = false;

      try { voice.mute(false); } catch(_){}

      const m = document.getElementById('btnMic');

      if (m){ m.classList.remove('muted-state'); m.innerHTML = '<i data-lucide="mic" style="width:14px;height:14px"></i>'; if (typeof refreshIcons==='function') refreshIcons(); }

    }

  }

  // Re-create the self-monitor stream so processing toggles / device

  // selection take effect immediately while the user is testing.

  async function refreshSelfMonitor(){

    if (!voiceSettings.selfMon) return;

    stopSelfMonitor();

    await startSelfMonitor();

  }


  // ============== NOTIFICATION SETTINGS ==============

  // Persisted via localStorage so the user's choices survive a reload.

  // Schema:

  //   master.allow / showContent / sound

  //   cats.{dms,mentions,textChannels,voiceJoins,friendRequests}

  //   overrides.channels[chId]      = 'always' | 'mute'  (absent = default)

  //   overrides.dms[conversationKey]= 'always' | 'mute'

  // Resolution rule (notificationAllowed): per-row override beats

  // category which beats master. So a channel set to "always" still

  // notifies even with master OFF; a channel set to "mute" stays

  // silent even with master ON.

  const NOTIF_LS_KEY = 'orblood:notifSettings';

  const notifSettings = (() => {

    const def = {

      master: { allow: true, showContent: true, sound: true, browser: false },

      cats: {

        dms: true,

        mentions: true,

        textChannels: false,

        voiceJoins: true,

        friendRequests: true,

      },

      overrides: { channels: {}, dms: {} }

    };

    try {

      const raw = localStorage.getItem(NOTIF_LS_KEY);

      if (!raw) return def;

      const parsed = JSON.parse(raw);

      return {

        master:    Object.assign({}, def.master,    parsed.master    || {}),

        cats:      Object.assign({}, def.cats,      parsed.cats      || {}),

        overrides: {

          channels: Object.assign({}, def.overrides.channels, (parsed.overrides && parsed.overrides.channels) || {}),

          dms:      Object.assign({}, def.overrides.dms,      (parsed.overrides && parsed.overrides.dms)      || {}),

        }

      };

    } catch (_) { return def; }

  })();

  function _saveNotifSettings(){

    try { localStorage.setItem(NOTIF_LS_KEY, JSON.stringify(notifSettings)); } catch(_){}

  }

  // Decide whether a single notification should fire. Caller passes the

  // category and an optional override key (channel id or dm key).

  function notificationAllowed(category, overrideKey){

    if (overrideKey){

      const map = category === 'dms' ? notifSettings.overrides.dms : notifSettings.overrides.channels;

      const v = map[overrideKey];

      if (v === 'always') return true;

      if (v === 'mute')   return false;

    }

    if (!notifSettings.master.allow) return false;

    return !!notifSettings.cats[category];

  }


  // ============== BROWSER NOTIFICATION DISPATCHER ==============

  // Wraps the Web Notifications API. The web build relies on this for

  // any "user isn't looking at the tab" alerts — there is no in-app

  // toast bubble for messages anymore. Permission is requested lazily

  // the first time the user enables the toggle in Settings.

  function _notifPermission(){

    if (typeof Notification === 'undefined') return 'unsupported';

    return Notification.permission;        // 'granted' | 'denied' | 'default'

  }

  async function _ensureBrowserNotifPermission(){

    const p = _notifPermission();

    if (p === 'unsupported') return false;

    if (p === 'granted')     return true;

    if (p === 'denied')      return false;

    try {

      const next = await Notification.requestPermission();

      return next === 'granted';

    } catch(_){ return false; }

  }

  // Fire a single notification. Returns true when one was actually

  // shown so callers can know whether the user got pinged. Skipped

  // automatically when the tab is focused — that's the original

  // "user is here, no need to ping" behaviour.

  function showBrowserNotification(opts){

    if (typeof Notification === 'undefined') return false;

    if (!notifSettings.master.browser) return false;

    if (Notification.permission !== 'granted') return false;

    if (typeof document !== 'undefined' && document.hasFocus && document.hasFocus()) return false;

    const { title, body, tag, icon, onclick } = opts || {};

    try {

      const n = new Notification(title || 'ORBLOOD', {

        body: body || '',

        tag:  tag  || undefined,

        icon: icon || '/favicon.ico',

        silent: !notifSettings.master.sound,

      });

      n.onclick = () => {

        try { window.focus(); } catch(_){}

        try { n.close(); } catch(_){}

        if (typeof onclick === 'function'){ try { onclick(); } catch(_){} }

      };

      return true;

    } catch(_){ return false; }

  }


  // ============== NOTIFICATIONS PANEL — RENDER + WIRING ==============

  let _nfTab = 'channels';   // 'channels' | 'dms'

  let _nfFilter = '';

  function renderNotifPanel(){

    const idMap = {

      notifAll:        ['master','allow'],

      notifShowContent:['master','showContent'],

      notifSound:      ['master','sound'],

      notifBrowser:    ['master','browser'],

      notifDM:         ['cats','dms'],

      notifMentions:   ['cats','mentions'],

      notifTextCh:     ['cats','textChannels'],

      notifVoice:      ['cats','voiceJoins'],

      notifFriends:    ['cats','friendRequests'],

    };

    Object.entries(idMap).forEach(([id, path]) => {

      const el = document.getElementById(id); if (!el) return;

      el.checked = !!notifSettings[path[0]][path[1]];

    });

    _nfPaintPermissionPill();

    _nfRenderLists();

  }

  // Paint the small status pill next to the BROWSER NOTIFICATIONS

  // label so the user can tell at a glance whether the browser is

  // letting us pop notifications.

  function _nfPaintPermissionPill(){

    const pill = document.getElementById('notifPermPill');

    const hint = document.getElementById('notifPermHint');

    if (!pill) return;

    const p = _notifPermission();

    pill.classList.remove('nf-perm-default','nf-perm-granted','nf-perm-denied','nf-perm-unsupported');

    if (p === 'granted'){

      pill.classList.add('nf-perm-granted');  pill.textContent = 'ALLOWED';

      if (hint) hint.textContent = 'The browser is allowing system pop-ups for ORBLOOD.';

    } else if (p === 'denied'){

      pill.classList.add('nf-perm-denied');   pill.textContent = 'BLOCKED';

      if (hint) hint.textContent = 'The browser blocked notifications. Allow them in your browser site settings, then reload.';

    } else if (p === 'unsupported'){

      pill.classList.add('nf-perm-unsupported');pill.textContent = 'UNSUPPORTED';

      if (hint) hint.textContent = 'This browser does not support system notifications.';

    } else {

      pill.classList.add('nf-perm-default');  pill.textContent = 'NOT ASKED';

      if (hint) hint.textContent = 'Browser pop-ups appear even when the ORBLOOD tab is in the background. You\'ll be asked to allow notifications the first time you turn this on.';

    }

  }

  function _nfChannelRows(){

    const out = [];

    Object.values(servers || {}).forEach(s => {

      if (!s) return;

      (s.textChannels || []).forEach(tc => {

        out.push({ id: tc.id, name: '#'+tc.name, sub: s.name });

      });

    });

    return out;

  }

  function _nfDmRows(){

    const out = [];

    Object.entries(conversations || {}).forEach(([k, c]) => {

      if (!c || c.isSaved) return;

      out.push({

        id: k,

        name: c.name || k,

        sub: c.handle || '',

        avColor: c.avColor || null,

        avImage: c.avImage || null,

        initial: c.initial || (c.name ? c.name[0] : '?'),

      });

    });

    return out;

  }

  function _nfRenderLists(){

    const channelsList = document.getElementById('nfChannelsList');

    const dmsList      = document.getElementById('nfDmsList');

    const empty        = document.getElementById('nfEmpty');

    if (!channelsList || !dmsList) return;

    document.querySelectorAll('.nf-tab').forEach(t =>

      t.classList.toggle('active', t.dataset.nfTab === _nfTab));

    const filter = (_nfFilter || '').toLowerCase().trim();

    const matches = (row) =>

      !filter ||

      (row.name && row.name.toLowerCase().includes(filter)) ||

      (row.sub  && row.sub.toLowerCase().includes(filter));

    function renderRow(row, kind){

      const overrideMap = kind === 'channels' ? notifSettings.overrides.channels : notifSettings.overrides.dms;

      const state = overrideMap[row.id] || 'default';

      let iconHtml;

      if (kind === 'channels'){

        iconHtml = '<div class="nf-row-icon hash">#</div>';

      } else {

        const style = row.avImage

          ? 'background:transparent url('+row.avImage+') center/cover no-repeat'

          : (row.avColor ? 'background:'+row.avColor : '');

        const inner = row.avImage ? '' : escapeHtml(row.initial || '?');

        iconHtml = '<div class="nf-row-icon" style="'+style+'">'+inner+'</div>';

      }

      return ''

        + '<div class="nf-row" data-nf-row="'+row.id+'" data-nf-kind="'+kind+'">'

        +   iconHtml

        +   '<div class="nf-row-meta">'

        +     '<div class="nf-row-name">'+escapeHtml(row.name)+'</div>'

        +     (row.sub ? '<div class="nf-row-sub">'+escapeHtml(row.sub)+'</div>' : '')

        +   '</div>'

        +   '<div class="nf-seg">'

        +     '<button type="button" class="nf-seg-btn def'+(state==='default'?' active':'')+'" data-nf-state="default">DEFAULT</button>'

        +     '<button type="button" class="nf-seg-btn always'+(state==='always'?' active':'')+'" data-nf-state="always">ALWAYS</button>'

        +     '<button type="button" class="nf-seg-btn mute'+(state==='mute'?' active':'')+'" data-nf-state="mute">MUTE</button>'

        +   '</div>'

        + '</div>';

    }

    const channelRows = _nfChannelRows().filter(matches);

    const dmRows      = _nfDmRows().filter(matches);

    channelsList.innerHTML = channelRows.map(r => renderRow(r, 'channels')).join('');

    dmsList.innerHTML      = dmRows.map(r => renderRow(r, 'dms')).join('');

    const activeRows = _nfTab === 'channels' ? channelRows : dmRows;

    if (empty){

      empty.style.display = activeRows.length ? 'none' : 'flex';

    }

    channelsList.style.display = (_nfTab==='channels' && activeRows.length) ? '' : 'none';

    dmsList.style.display      = (_nfTab==='dms'      && activeRows.length) ? '' : 'none';

    if (typeof refreshIcons === 'function') refreshIcons();

  }

  // Wire the section once on boot. The DOM ids exist in index.html

  // before this script runs, so it's safe to query them here.

  (function _wireNotifPanel(){

    const idMap = {

      notifAll:        ['master','allow'],

      notifShowContent:['master','showContent'],

      notifSound:      ['master','sound'],

      notifDM:         ['cats','dms'],

      notifMentions:   ['cats','mentions'],

      notifTextCh:     ['cats','textChannels'],

      notifVoice:      ['cats','voiceJoins'],

      notifFriends:    ['cats','friendRequests'],

    };

    Object.entries(idMap).forEach(([id, path]) => {

      const el = document.getElementById(id); if (!el) return;

      el.addEventListener('change', () => {

        notifSettings[path[0]][path[1]] = !!el.checked;

        _saveNotifSettings();

      });

    });

    // Browser notifications toggle has its own handler because turning

    // it ON has to ask the browser for permission first; if the user

    // denies, we flip the checkbox back off.

    const browserCb = document.getElementById('notifBrowser');

    if (browserCb){

      browserCb.addEventListener('change', async () => {

        if (browserCb.checked){

          const ok = await _ensureBrowserNotifPermission();

          if (!ok){

            browserCb.checked = false;

            notifSettings.master.browser = false;

            _saveNotifSettings();

            _nfPaintPermissionPill();

            const p = _notifPermission();

            const msg = p === 'denied'

              ? 'Notifications are blocked in this browser. Allow them in site settings and try again.'

              : (p === 'unsupported'

                  ? 'This browser does not support system notifications.'

                  : 'Notification permission was not granted.');

            showToast(msg, 'warn');

            return;

          }

        }

        notifSettings.master.browser = browserCb.checked;

        _saveNotifSettings();

        _nfPaintPermissionPill();

      });

    }

    document.querySelectorAll('.nf-tab').forEach(btn => {

      btn.addEventListener('click', () => {

        _nfTab = btn.dataset.nfTab || 'channels';

        _nfRenderLists();

      });

    });

    const search = document.getElementById('nfSearch');

    if (search){

      search.addEventListener('input', () => {

        _nfFilter = search.value;

        _nfRenderLists();

      });

    }

    function _onSegClick(e){

      const btn = e.target.closest('[data-nf-state]'); if (!btn) return;

      const row = e.target.closest('[data-nf-row]'); if (!row) return;

      const kind  = row.dataset.nfKind;

      const id    = row.dataset.nfRow;

      const next  = btn.dataset.nfState;

      const map = kind === 'channels' ? notifSettings.overrides.channels : notifSettings.overrides.dms;

      if (next === 'default') delete map[id];

      else map[id] = next;

      _saveNotifSettings();

      _nfRenderLists();

    }

    const channelsList = document.getElementById('nfChannelsList');

    const dmsList      = document.getElementById('nfDmsList');

    if (channelsList) channelsList.addEventListener('click', _onSegClick);

    if (dmsList)      dmsList.addEventListener('click', _onSegClick);

    const reset = document.getElementById('nfResetOverrides');

    if (reset){

      reset.addEventListener('click', () => {

        notifSettings.overrides.channels = {};

        notifSettings.overrides.dms      = {};

        _saveNotifSettings();

        _nfRenderLists();

        showToast('Notification overrides reset','success');

      });

    }

  })();


  async function openVoiceSettings(){

    document.getElementById('voiceSettingsBackdrop').classList.add('show');

    populateVoiceDevices();

    syncVoiceSettingsUI();

  }

  let _micPermissionGranted = false;

  async function _ensureMicPermission(){

    if (_micPermissionGranted) return true;

    try {

      if (navigator.permissions && navigator.permissions.query){

        const st = await navigator.permissions.query({name:'microphone'}).catch(()=>null);

        if (st && st.state === 'granted'){ _micPermissionGranted = true; return true; }

        if (st && st.state === 'denied') return false;

      }

    } catch(_){}

    try {

      const stream = await navigator.mediaDevices.getUserMedia({audio:true});

      _micPermissionGranted = true;

      // Stop the temporary stream straight away; we only wanted to unlock device labels.

      stream.getTracks().forEach(t => t.stop());

      return true;

    } catch(_){ return false; }

  }

  async function populateVoiceDevices(){

    const inputSel = document.getElementById('vsInputSelect');

    const outputSel = document.getElementById('vsOutputSelect');

    let inputs = [{deviceId:'default', label:'System default microphone'}];

    let outputs = [{deviceId:'default', label:'System default speakers'}];

    try {

      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices){

        await _ensureMicPermission();

        const devs = await navigator.mediaDevices.enumerateDevices();

        const ins  = devs.filter(d => d.kind === 'audioinput');

        const outs = devs.filter(d => d.kind === 'audiooutput');

        if (ins.length) inputs  = ins.map(d => ({deviceId:d.deviceId, label:d.label || ('Microphone '+d.deviceId.slice(0,4))}));

        if (outs.length) outputs = outs.map(d => ({deviceId:d.deviceId, label:d.label || ('Speakers '+d.deviceId.slice(0,4))}));

      }

    } catch(_){}

    inputSel.innerHTML  = inputs.map(d => '<option value="'+d.deviceId+'"'+(voiceSettings.inputDevice===d.deviceId?' selected':'')+'>'+escapeHtml(d.label)+'</option>').join('');

    outputSel.innerHTML = outputs.map(d => '<option value="'+d.deviceId+'"'+(voiceSettings.outputDevice===d.deviceId?' selected':'')+'>'+escapeHtml(d.label)+'</option>').join('');

  }

  function syncVoiceSettingsUI(){

    document.getElementById('vsInputVol').value = voiceSettings.inputVolume;

    document.getElementById('vsInputVolLbl').textContent = voiceSettings.inputVolume+'%';

    document.getElementById('vsOutputVol').value = voiceSettings.outputVolume;

    document.getElementById('vsOutputVolLbl').textContent = voiceSettings.outputVolume+'%';

    document.getElementById('vsSens').value = voiceSettings.sensitivity;

    document.getElementById('vsSensLbl').textContent = voiceSettings.sensitivity+' dB';

    document.querySelectorAll('[data-vs-mode]').forEach(b => b.classList.toggle('active', b.dataset.vsMode === voiceSettings.mode));

    document.getElementById('vsPttRow').style.display = voiceSettings.mode === 'ptt' ? 'flex' : 'none';

    document.getElementById('vsVadRow').style.display = voiceSettings.mode === 'vad' ? 'flex' : 'none';

    document.getElementById('vsPttKey').textContent = voiceSettings.pttKey || 'Click and press a key...';

    document.getElementById('vsEcho').checked  = voiceSettings.echo;

    document.getElementById('vsNoise').checked = voiceSettings.noise;

    document.getElementById('vsAgc').checked   = voiceSettings.agc;

    const _setStr = (id, lbl, val) => {

      const s = document.getElementById(id); if (s) s.value = val;

      const l = document.getElementById(lbl); if (l) l.textContent = val;

    };

    _setStr('vsEchoStr',  'vsEchoStrLbl',  voiceSettings.echoStr);

    _setStr('vsNoiseStr', 'vsNoiseStrLbl', voiceSettings.noiseStr);

    _setStr('vsAgcStr',   'vsAgcStrLbl',   voiceSettings.agcStr);

    // Self-monitor always opens disabled — it streams the mic, so

    // resuming it on every modal open would be a privacy surprise.

    voiceSettings.selfMon = false;

    document.getElementById('vsSelfMon').checked = false;

    document.getElementById('vsSelfMonVol').value = voiceSettings.selfMonVolume;

    document.getElementById('vsSelfMonVolLbl').textContent = voiceSettings.selfMonVolume+'%';

    document.getElementById('vsSelfMonControls').style.display = 'none';

  }

  // ============== BANNER SETTINGS MENU (portal to body, escapes any clipping/stacking) ==============

  let bannerMenuEl = null;

  function closeBannerMenu(){

    if (bannerMenuEl){ bannerMenuEl.remove(); bannerMenuEl = null; }

  }

  function openBannerMenu(anchorBtn){

    if (bannerMenuEl){ closeBannerMenu(); return; }

    // Build the menu using only the actions the user actually has permission

    // to perform. The cog button only opens this menu when the user has at

    // least one of these perms, but we still gate every entry so removing

    // a single perm from a role hides only that one row.

    const s = currentServer ? servers[currentServer] : null;

    const can = key => s ? memberHasPerm(s, selfProfile.name, key) : false;

    const isOwner = s ? (s.admins||[]).includes(selfProfile.name) : false;

    const canCreate = can('manageCategory') || can('manageTextCh') || can('manageVoiceCh');

    const items = [];

    if (canCreate) items.push({ action:'create', icon:'plus-circle', label:'Create channel or category' });

    if (canCreate && (isOwner || can('manageServer') || can('managePins'))) items.push({ sep:true });

    if (isOwner || can('manageServer')) items.push({ action:'cover', icon:'image', label:'Server identity' });

    if (can('managePins'))              items.push({ action:'addpin', icon:'pin',  label:'Edit server pin' });

    if (can('manageRoles')){

      if (items.length) items.push({ sep:true });

      items.push({ action:'roles', icon:'shield', label:'Roles & permissions' });

    }

    if (!items.length){ closeBannerMenu(); return; }

    const pop = document.createElement('div');

    pop.className = 'banner-portal-menu';

    pop.innerHTML = items.map(it => it.sep

      ? '<div class="bpm-sep"></div>'

      : '<button class="bpm-item" data-bm-action="'+it.action+'"><i data-lucide="'+it.icon+'"></i>'+it.label+'</button>'

    ).join('');

    document.body.appendChild(pop);

    refreshIcons();

    // Position relative to the gear button, clamped to viewport.

    const r = anchorBtn.getBoundingClientRect();

    const pr = pop.getBoundingClientRect();

    let top = r.bottom + 6;

    let left = r.right - pr.width;

    if (left < 8) left = 8;

    if (top + pr.height > window.innerHeight - 8) top = r.top - pr.height - 6;

    if (top < 8) top = 8;

    pop.style.top = top + 'px';

    pop.style.left = left + 'px';

    pop.addEventListener('click', e => {

      const b = e.target.closest('[data-bm-action]'); if (!b) return;

      const a = b.dataset.bmAction;

      closeBannerMenu();

      if (a === 'create') openCreateChannel('text');

      else if (a === 'cover') openCoverModal();

      else if (a === 'addpin') openPinModal();

      else if (a === 'roles') openRolesModal();

      else if (a === 'share') openShareServerModal();

    });

    bannerMenuEl = pop;

  }

  // ============== ROLES MODAL ==============

  let activeRoleId = null;

  function openRolesModal(){

    if (!currentServer){ showToast('Open a server first','warn'); return; }

    const s = servers[currentServer];

    if (!memberHasPerm(s,selfProfile.name,'manageRoles')){ showToast('You do not have permission to manage roles','warn'); return; }

    ensureRoles(s);

    activeRoleId = s.roles[0] ? s.roles[0].id : null;

    renderRolesList();

    renderRoleEditor();

    document.getElementById('rolesBackdrop').classList.add('show');

  }

  function renderRolesList(){

    if (!currentServer) return;

    const s = servers[currentServer];

    ensureRoles(s);

    const list = document.getElementById('rolesList');

    list.innerHTML = s.roles.map(r => {

      const lockBadge = r.system ? '<i data-lucide="crown" style="width:11px;height:11px;color:#fde68a;margin-left:auto;margin-right:4px"></i>' : '';

      return '<div class="role-item'+(r.id===activeRoleId?' active':'')+(r.system?' is-system':'')+'" data-role-id="'+r.id+'" style="--role-c:'+r.color+'"><div class="role-dot"></div><div class="role-name">'+escapeHtml(r.name)+'</div>'+lockBadge+'<div class="role-count">'+(r.members||[]).length+'</div></div>';

    }).join('');

    refreshIcons();

  }

  function renderRoleEditor(){

    const pane = document.getElementById('roleEditPane');

    if (!currentServer || !activeRoleId){ pane.innerHTML = '<div class="roles-empty">Select a role on the left to edit.</div>'; return; }

    const s = servers[currentServer];

    const r = s.roles.find(x => x.id === activeRoleId); if (!r){ pane.innerHTML = '<div class="roles-empty">Role not found.</div>'; return; }

    let html = '';

    // Role name + inline custom color picker (no presets, full custom only).

    html += '<div class="role-edit-h">'+

      '<input class="sm-input" id="roleNameInp" value="'+escapeHtml(r.name)+'" placeholder="Role name" />'+

      '<label class="role-color-chip" id="roleColorPreview" title="Pick color" style="background:'+r.color+'">'+

        '<input type="color" id="roleColorInp" value="'+r.color+'" />'+

        '<i data-lucide="droplet" style="width:13px;height:13px"></i>'+

      '</label>'+

      '<span id="roleColorHex" class="role-color-hex">'+r.color.toUpperCase()+'</span>'+

    '</div>';

    // Featured-in-staff toggle (visible for non-system roles too; owner is always featured separately).

    if (r.id !== 'owner'){

      const featuredOn = r.featured !== false;

      html += '<div class="role-feature-row" data-role-feature-toggle><i data-lucide="shield-check" style="width:13px;height:13px"></i>'+

        '<div class="role-feature-info"><div class="role-perm-n">Show in STAFF list</div><div class="role-perm-d">Members of this role appear in the highlighted staff strip on the server overview.</div></div>'+

        '<div class="role-feature-toggle'+(featuredOn?' on':'')+'"></div>'+

      '</div>';

    }

    html += '<div><div class="role-perm-h">PERMISSIONS</div><div class="role-perms">';

    PERMISSIONS.forEach(p => {

      const on = !!r.perms[p.key];

      html += '<div class="role-perm-row'+(on?' on':'')+'" data-role-perm="'+p.key+'"><div class="role-perm-info"><div class="role-perm-n">'+p.name+'</div><div class="role-perm-d">'+p.desc+'</div></div><div class="role-perm-toggle"></div></div>';

    });

    html += '</div></div>';

    // MEMBERS — assigned list + search box for adding

    const assigned = (r.members||[]);

    html += '<div><div class="role-perm-h">MEMBERS WITH THIS ROLE <span style="color:var(--t2);font-weight:400;letter-spacing:0;text-transform:none">('+assigned.length+')</span></div>';

    if (assigned.length){

      html += '<div class="role-assigned-list">';

      assigned.forEach(m => {

        const ck = m.toLowerCase();

        const c = conversations[ck];

        const av = c ? c.avColor : 'linear-gradient(135deg,#a78bfa,#1a0b2e)';

        html += '<div class="role-assigned-row"><div class="role-member-av" style="background:'+av+'">'+m.charAt(0)+'</div><span class="role-assigned-name">'+escapeHtml(m)+'</span><button class="role-assigned-x" data-role-unassign="'+escapeHtml(m)+'" title="Remove role"><i data-lucide="x" style="width:11px;height:11px"></i></button></div>';

      });

      html += '</div>';

    } else {

      html += '<div class="role-assigned-empty">No members assigned yet — search below to add some.</div>';

    }

    html += '<div class="role-search-wrap"><i data-lucide="search" style="width:13px;height:13px"></i><input type="text" id="roleMemberSearch" class="role-search-input" placeholder="Search members to add..." /><div id="roleMemberSearchResults" class="role-search-results" style="display:none"></div></div>';

    html += '</div>';

    if (r.id === 'owner'){

      html += '<button class="role-delete" id="roleTransferBtn" style="background:linear-gradient(135deg,rgba(245,158,11,0.18),rgba(185,28,74,0.18));color:var(--legendary,#fde68a);border-color:rgba(245,158,11,0.4)"><i data-lucide="crown" style="width:11px;height:11px"></i>TRANSFER OWNERSHIP</button>';

    } else if (!r.system && r.id !== 'admin'){

      html += '<button class="role-delete" id="roleDeleteBtn"><i data-lucide="trash-2" style="width:11px;height:11px"></i>DELETE ROLE</button>';

    }

    pane.innerHTML = html;

    refreshIcons();

  }

  // ============== ADD WORLD/CATEGORY PIN (admin) ==============

  let pinModalTarget = { type:'server', catId:null };

  function openPinModal(){

    if (!currentServer){ showToast('Open a server first','warn'); return; }

    const s = servers[currentServer];

    if (!memberHasPerm(s,selfProfile.name,'managePins')){ showToast('You do not have permission to pin messages','warn'); return; }

    pinModalTarget = { type:'server', catId:null };

    document.getElementById('pinTextInput').value = s.pinned ? s.pinned.text : '';

    document.querySelector('#addPinBackdrop .smodal-title').textContent = '// PIN TO SERVER';

    document.getElementById('addPinBackdrop').classList.add('show');

  }

  function openCategoryPinModal(catId){

    if (!currentServer){ showToast('Open a server first','warn'); return; }

    const s = servers[currentServer];

    if (!memberHasPerm(s,selfProfile.name,'managePins')){ showToast('You do not have permission to pin messages','warn'); return; }

    const cat = s.categories && s.categories.find(c => c.id === catId);

    if (!cat) return;

    pinModalTarget = { type:'category', catId };

    document.getElementById('pinTextInput').value = cat.pinned ? cat.pinned.text : '';

    document.querySelector('#addPinBackdrop .smodal-title').textContent = '// PIN TO ' + cat.name;

    document.getElementById('addPinBackdrop').classList.add('show');

  }

  async function submitPin(){

    if (!currentServer) return;

    const text = document.getElementById('pinTextInput').value.trim();

    const s = servers[currentServer];

    if (pinModalTarget.type === 'category' && pinModalTarget.catId){

      const cat = s.categories && s.categories.find(c => c.id === pinModalTarget.catId);

      if (!cat) return;

      if (backend.isConfigured()){

        const r = await backend.servers.patchCategory(currentServer, cat.id, { pinnedText: text || null });

        if (r.offline){ showToast('Cannot reach the server','warn'); return; }

        if (r.error){ showToast('Could not update pin: '+r.error,'warn'); return; }

      }

      if (!text){ cat.pinned = null; showToast('Category pin removed','warn'); }

      else { cat.pinned = { text, by:selfProfile.name, time:'just now' }; showToast('Pinned to category','success'); }

    } else {

      // Persist server-level pin to backend so other members see it.

      if (backend.isConfigured()){

        const r = await backend.servers.patch(currentServer, { pinnedText: text || null });

        if (r.offline){ showToast('Cannot reach the server','warn'); return; }

        if (r.error){ showToast('Could not update pin: '+r.error,'warn'); return; }

      }

      if (!text){ s.pinned = null; showToast('Pin removed','warn'); }

      else { s.pinned = { text, by:selfProfile.name, time:'just now' }; showToast('Pinned to server','success'); }

    }

    document.getElementById('addPinBackdrop').classList.remove('show');

    renderServerOverview();

  }

  // ============== SERVER COVER (admin) ==============

  function openCoverModal(){

    if (!currentServer){ showToast('Open a server first','warn'); return; }

    const s = servers[currentServer];

    if (!s.admins.includes(selfProfile.name)){ showToast('Only admins can edit identity','warn'); return; }

    if (!s.inviteKey) s.inviteKey = 'NEX-'+Math.random().toString(36).slice(2,7).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase();

    document.getElementById('serverNameInput').value = s.name || '';

    document.getElementById('serverAboutInput').value = s.desc || '';

    document.getElementById('coverUrlInput').value = s.cover || '';

    document.getElementById('emblemUrlInput').value = s.emblemImage || '';

    document.getElementById('serverInviteKey').value = s.inviteKey;

    const privEl = document.getElementById('serverPrivateInput'); if (privEl) privEl.checked = !!s.isPrivate;

    const colorChip = document.getElementById('serverColorChip');

    const colorInp  = document.getElementById('serverColorInput');

    const baseColor = s.baseColor || '#b91c4a';

    if (colorChip) colorChip.style.background = baseColor;

    if (colorInp) colorInp.value = baseColor;

    const bChip = document.getElementById('serverBannerColorChip');

    const bInp  = document.getElementById('serverBannerColor');

    const bannerColor = s.bannerColor || baseColor;

    if (bChip) bChip.style.background = bannerColor;

    if (bInp) bInp.value = bannerColor;

    renderCoverPreview();

    // Pack-active toggles for cover + emblem halo. When a pack owns

    // either surface, the colour picker for that field is the only

    // thing the pack visually overrides; uploads still work. Toggle

    // unchecked → clear the surface's pack so the colour picker takes

    // effect. Toggle checked → re-apply the previous pack id (we

    // remember which one via a data attribute). The notice version

    // produced too much noise and disabled the upload buttons too.

    function _wireIdentityPackToggle(field){

      const dbField   = field === 'cover' ? 'styleCover' : 'styleEmblem';

      const wrap      = document.getElementById(field+'PackToggleWrap');

      const cb        = document.getElementById(field+'PackToggle');

      const colorChip = document.getElementById(field === 'cover' ? 'serverBannerColorChip' : 'serverColorChip');

      const colorInp  = document.getElementById(field === 'cover' ? 'serverBannerColor'   : 'serverColorInput');

      if (!wrap || !cb) return;

      const remembered = wrap.dataset.lastPack || s[dbField] || '';

      const active = !!s[dbField];

      if (s[dbField]) wrap.dataset.lastPack = s[dbField];

      if (!active && !remembered){

        // No pack has ever been set on this surface — hide the toggle

        // entirely so the modal stays clean for users who haven't

        // unlocked any packs.

        wrap.style.display = 'none';

        if (colorChip) { colorChip.style.opacity = ''; colorChip.style.pointerEvents = ''; }

        return;

      }

      wrap.style.display = 'flex';

      cb.checked = active;

      // Disable only the colour picker while the pack owns the surface.

      // Uploads keep working — the user might prefer their own image

      // even though the pack is providing the colour wash.

      if (colorChip){

        colorChip.style.opacity = active ? '0.45' : '';

        colorChip.style.pointerEvents = active ? 'none' : '';

      }

      if (colorInp) colorInp.disabled = active;

      cb.onchange = async () => {

        const want = cb.checked ? (wrap.dataset.lastPack || remembered || null) : null;

        s[dbField] = want;

        if (want) wrap.dataset.lastPack = want;

        if (backend.isConfigured()){

          try {

            const body = {}; body[dbField] = want || null;

            await _apiRequest('PATCH', '/servers/'+s.id, body);

          } catch(_){ showToast('Could not save pack toggle','warn'); }

        }

        if (colorChip){

          colorChip.style.opacity = want ? '0.45' : '';

          colorChip.style.pointerEvents = want ? 'none' : '';

        }

        if (colorInp) colorInp.disabled = !!want;

        renderServerOverview && renderServerOverview();

      };

    }

    _wireIdentityPackToggle('cover');

    _wireIdentityPackToggle('emblem');

    document.getElementById('coverBackdrop').classList.add('show');

  }

  function renderCoverPreview(){

    const url = document.getElementById('coverUrlInput').value.trim();

    const emb = document.getElementById('emblemUrlInput').value.trim();

    const colorInp = document.getElementById('serverColorInput');

    const bannerInp = document.getElementById('serverBannerColor');

    const color = (colorInp && colorInp.value) || (servers[currentServer].baseColor || '#b91c4a');

    const bannerColor = (bannerInp && bannerInp.value) || color;

    const bC1 = colorToGlow(bannerColor, 0.18);

    const bC2 = colorToGlow(bannerColor, 0.10);

    const grad  = colorToOrbGrad(color);

    const glow  = colorToGlow(color, 0.4);

    const s = servers[currentServer];

    const prev = document.getElementById('coverPreview');

    const embStyle = emb ? 'background:transparent url('+emb+') center/cover no-repeat' : ('background:'+grad);

    prev.innerHTML = '<div class="cv-prev-banner" style="--srv-banner-c1:'+bC1+';--srv-banner-c2:'+bC2+'">'+

      (url?'<div class="cv-prev-cover" style="background-image:url('+url+')"></div>':'')+

      '<div class="cv-prev-emblem" style="'+embStyle+';box-shadow:0 0 24px '+glow+'">'+(emb?'':s.initial)+

      '</div>'+

      '<div class="cv-prev-info"><div class="cv-prev-eyebrow">PREVIEW</div><div class="cv-prev-title">'+escapeHtml(s.name)+'</div></div>'+

    '</div>';

  }

  function colorToOrbGrad(hex){

    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);

    const dark = '#'+[r,g,b].map(x => Math.max(0, Math.round(x*0.32)).toString(16).padStart(2,'0')).join('');

    return 'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.45),'+hex+' 55%,'+dark+')';

  }

  function colorToFlatGrad(hex){

    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);

    const dark = '#'+[r,g,b].map(x => Math.max(0, Math.round(x*0.4)).toString(16).padStart(2,'0')).join('');

    return 'linear-gradient(135deg,'+hex+','+dark+')';

  }

  function colorToGlow(hex, a){

    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);

    return 'rgba('+r+','+g+','+b+','+(a||0.4)+')';

  }

  async function submitCover(){

    if (!currentServer) return;

    const newName = document.getElementById('serverNameInput').value.trim();

    const newAbout = document.getElementById('serverAboutInput').value.trim();

    const url = document.getElementById('coverUrlInput').value.trim();

    const emb = document.getElementById('emblemUrlInput').value.trim();

    const s = servers[currentServer];

    const colorInp = document.getElementById('serverColorInput');

    const color = colorInp ? colorInp.value : (s.baseColor || null);

    const privEl = document.getElementById('serverPrivateInput');

    const isPrivate = privEl ? !!privEl.checked : !!s.isPrivate;

    // Build the patch payload from the form values (only fields the schema

    // accepts — bannerColor/C1/C2 are pure UI helpers and stay client-side).

    const patch = {

      name: newName || s.name,

      desc: newAbout,

      isPrivate,

      cover: url || null,

      emblemImage: emb || null

    };

    if (color){

      patch.baseColor = color;

      patch.grad      = colorToOrbGrad(color);

      patch.glow      = colorToGlow(color, 0.4);

    }

    if (backend.isConfigured()){

      const r = await backend.servers.patch(currentServer, patch);

      if (r.offline){ showToast('Cannot reach the server','warn'); return; }

      if (r.error){ showToast('Could not save: '+r.error,'warn'); return; }

      Object.assign(s, r.server || {});

    } else {

      Object.assign(s, patch);

      if (newName) s.initial = newName.charAt(0).toUpperCase();

    }

    const bInp = document.getElementById('serverBannerColor');

    if (bInp){

      s.bannerColor = bInp.value;

      s.bannerC1 = colorToGlow(bInp.value, 0.18);

      s.bannerC2 = colorToGlow(bInp.value, 0.10);

    }

    document.getElementById('coverBackdrop').classList.remove('show');

    document.getElementById('worldHeaderTitle').textContent = '// '+s.name;

    renderServerOverview();

    renderHomeMyServers();

    renderServerRails();

    showToast('Server identity updated','success');

  }

  // ============== PAGE NAV ==============

  function setPage(pageId){

    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));

    document.querySelectorAll('.tb[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === pageId));

    // Clear "I'm actively viewing this DM" state whenever the user leaves

    // the messages page. Otherwise currentConversation stays set after the

    // user navigates away and incoming dm:new events are silently treated

    // as "already seen" — no toast, no badge.

    if (pageId !== 'pageMessages' && currentConversation){

      currentConversation = null;

    }

    if (pageId === 'pageMessages' && !currentConversation){

      const firstKey = Object.keys(conversations)[0];

      if (firstKey) openConversation(firstKey);

    }

    if (pageId === 'pageHome'){

      // Refresh the home content the user is most likely about to look at —

      // server cards, marked orbits, requests counts can drift from those

      // arrays while they were on another tab.

      if (typeof renderHomeMyServers === 'function') renderHomeMyServers();

      if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

      if (typeof renderFriendRequestsHome === 'function') renderFriendRequestsHome();

      if (typeof renderHomeFriends === 'function') renderHomeFriends();

    }

    if (pageId === 'pageWorld' && !currentServer){

      // Default to the most recently opened server so reload lands the

      // user back where they were. Falls back to the first pinned server

      // if the saved one is gone (left, deleted, or membership lost) —

      // and finally to the empty "create / join" state.

      let lastSid = null;

      try { lastSid = localStorage.getItem('orblood:lastServer'); } catch(_){}

      if (lastSid && servers[lastSid]) selectServer(lastSid);

      else if (myServers.length) selectServer(myServers[0]);

      else if (Object.keys(servers).length) selectServer(Object.keys(servers)[0]);

      else { setServerView('feed'); }

    }

  }

  // ============== DRAG CAROUSEL ==============

  (function setupDragCarousel(){

    const car = document.getElementById('orbCarousel');

    const slides = document.getElementById('orbSlides');

    let isDown = false, startX=0, dragMoved=false;

    function onDown(x){ isDown = true; dragMoved = false; startX = x; slides.style.transition = 'none'; car.classList.add('dragging'); }

    function onMove(x){

      if (!isDown) return;

      const dx = x - startX;

      if (Math.abs(dx) > 4) dragMoved = true;

      const w = car.offsetWidth;

      let cur = currentSlideIndex * w - dx;

      slides.style.transform = 'translateX(-'+cur+'px)';

    }

    function onUp(x){

      if (!isDown) return;

      isDown = false;

      car.classList.remove('dragging');

      slides.style.transition = '';

      const dx = x - startX;

      const w = car.offsetWidth;

      const list = getAllChannels();

      let target = currentSlideIndex;

      if (Math.abs(dx) > w * 0.18){

        target = currentSlideIndex + (dx < 0 ? 1 : -1);

        target = Math.max(0, Math.min(list.length-1, target));

      }

      goToSlide(target, true);

      car._wasDragging = () => dragMoved;

      setTimeout(()=>{ car._wasDragging = () => false; }, 0);

    }

    car.addEventListener('mousedown', e => onDown(e.clientX));

    document.addEventListener('mousemove', e => onMove(e.clientX));

    document.addEventListener('mouseup', e => onUp(e.clientX));

    car.addEventListener('touchstart', e => onDown(e.touches[0].clientX), {passive:true});

    car.addEventListener('touchmove', e => onMove(e.touches[0].clientX), {passive:true});

    car.addEventListener('touchend', e => onUp((e.changedTouches[0]||{clientX:startX}).clientX), {passive:true});

  })();

  // ============== EVENT WIRING ==============

  document.querySelectorAll('.tb[data-page]').forEach(b => { b.addEventListener('click', () => setPage(b.dataset.page)); });

  document.getElementById('tbLogo').addEventListener('click', () => setPage('pageHome'));

  function handleAction(a){

    if (a === 'dms') setPage('pageMessages');

    else if (a === 'world') setPage('pageWorld');

    else if (a === 'voice') showToast('Pick an orb on the left to join voice','warn');

    else if (a === 'codex') showToast('Codex view — open an orb to inspect','warn');

    else if (a === 'requests'){

      // Friend requests live on the Home page now; just navigate there.

      setPage('pageHome');

    }

  }

  document.querySelectorAll('[data-action]').forEach(t => { t.addEventListener('click', () => handleAction(t.dataset.action)); });

  document.getElementById('homeOrbCodexLink').addEventListener('click', e => { e.stopPropagation(); showToast('Codex coming soon','warn'); });

  // ============== QUICK SEND (DM by @handle from Home) ==============

  function findUserByHandle(handle){

    const norm = handle.toLowerCase().replace(/^@/,'');

    for (const k in conversations){

      const h = (conversations[k].handle||'').toLowerCase().replace(/^@/,'');

      if (h === norm) return { key:k, name:conversations[k].name, handle:conversations[k].handle };

      if (k === norm) return { key:k, name:conversations[k].name, handle:conversations[k].handle };

    }

    return null;

  }

  function parseQsHandles(text){

    const re = /@([a-zA-Z0-9_]+)/g;

    const out = []; let m;

    while ((m = re.exec(text)) !== null){

      const handle = '@'+m[1];

      const found = findUserByHandle(handle);

      out.push({ handle, found });

    }

    const seen = new Set(); const uniq = [];

    out.forEach(o => { if (!seen.has(o.handle)){ seen.add(o.handle); uniq.push(o); }});

    return uniq;

  }

  function refreshQsTags(){

    const txt = document.getElementById('qsInput').value;

    const tags = parseQsHandles(txt);

    const wrap = document.getElementById('qsTags');

    if (!tags.length){ wrap.innerHTML = '<span style="font-family:Space Mono,monospace;font-size:0.5rem;color:var(--t3);letter-spacing:1px">No targets yet — tag friends with @handle</span>'; return; }

    wrap.innerHTML = tags.map(t => {

      if (t.found) return '<span class="qs-tag"><i data-lucide="check" style="width:9px;height:9px"></i>'+escapeHtml(t.handle)+' → '+escapeHtml(t.found.name)+'</span>';

      return '<span class="qs-tag unknown"><i data-lucide="x" style="width:9px;height:9px"></i>'+escapeHtml(t.handle)+' (unknown)</span>';

    }).join('');

    refreshIcons();

  }

  // Get the @-token currently being typed (at cursor position)

  function getActiveAtToken(input){

    const pos = input.selectionStart || 0;

    const before = input.value.slice(0, pos);

    const m = before.match(/@([a-zA-Z0-9_]*)$/);

    if (!m) return null;

    return { query:m[1], start:pos - m[0].length, end:pos };

  }

  let qsSuggestHighlight = 0;

  let qsSuggestItems = [];

  function renderQsSuggest(){

    const ip = document.getElementById('qsInput');

    const sg = document.getElementById('qsSuggest');

    const tok = getActiveAtToken(ip);

    if (tok === null){ sg.style.display = 'none'; qsSuggestItems = []; return; }

    const q = tok.query.toLowerCase();

    // Suggest from conversations (friends), excluding myself

    const items = [];

    for (const k in conversations){

      const c = conversations[k];

      const h = (c.handle||'').toLowerCase().replace(/^@/,'');

      if (q === '' || k.includes(q) || h.includes(q) || c.name.toLowerCase().includes(q)){

        items.push({ key:k, name:c.name, handle:c.handle, av:c.avColor });

      }

      if (items.length >= 8) break;

    }

    qsSuggestItems = items;

    if (qsSuggestHighlight >= items.length) qsSuggestHighlight = 0;

    if (!items.length){

      sg.innerHTML = '<div class="qs-suggest-empty">No friends match "@'+escapeHtml(tok.query)+'"</div>';

      sg.style.display = 'block';

      return;

    }

    sg.innerHTML = items.map((it, i) => 

      '<div class="qs-suggest-item'+(i===qsSuggestHighlight?' highlight':'')+'" data-qs-idx="'+i+'">'+

        '<div class="qs-suggest-av" style="background:'+it.av+'">'+it.name.charAt(0)+'</div>'+

        '<div class="qs-suggest-info"><div class="qs-suggest-n">'+escapeHtml(it.name)+'</div><div class="qs-suggest-h">'+escapeHtml(it.handle||'@'+it.key)+'</div></div>'+

      '</div>'

    ).join('');

    sg.style.display = 'block';

    sg.querySelectorAll('[data-qs-idx]').forEach(el => {

      el.addEventListener('click', () => { qsAcceptSuggest(parseInt(el.dataset.qsIdx)); });

    });

  }

  function qsAcceptSuggest(idx){

    const ip = document.getElementById('qsInput');

    const it = qsSuggestItems[idx]; if (!it) return;

    const tok = getActiveAtToken(ip); if (tok === null) return;

    const handle = (it.handle && it.handle.startsWith('@')) ? it.handle : '@'+it.key;

    const v = ip.value;

    ip.value = v.slice(0, tok.start) + handle + ' ' + v.slice(tok.end);

    const newPos = tok.start + handle.length + 1;

    ip.setSelectionRange(newPos, newPos);

    ip.focus();

    document.getElementById('qsSuggest').style.display = 'none';

    qsSuggestItems = [];

    // refresh tags + send button

    const tags = parseQsHandles(ip.value);

    const valid = tags.filter(t => t.found);

    document.getElementById('qsSend').classList.toggle('disabled', !ip.value.trim() || valid.length === 0);

    refreshQsTags();

  }

  (function bindQs(){

    const ip = document.getElementById('qsInput');

    const sb = document.getElementById('qsSend');

    const sg = document.getElementById('qsSuggest');

    ip.addEventListener('input', () => {

      ip.style.height = 'auto';

      ip.style.height = Math.min(100, ip.scrollHeight) + 'px';

      const tags = parseQsHandles(ip.value);

      const valid = tags.filter(t => t.found);

      sb.classList.toggle('disabled', !ip.value.trim() || valid.length === 0);

      refreshQsTags();

      qsSuggestHighlight = 0;

      renderQsSuggest();

    });

    ip.addEventListener('keydown', e => {

      if (sg.style.display === 'block' && qsSuggestItems.length){

        if (e.key === 'ArrowDown'){ e.preventDefault(); qsSuggestHighlight = (qsSuggestHighlight + 1) % qsSuggestItems.length; renderQsSuggest(); return; }

        if (e.key === 'ArrowUp'){ e.preventDefault(); qsSuggestHighlight = (qsSuggestHighlight - 1 + qsSuggestItems.length) % qsSuggestItems.length; renderQsSuggest(); return; }

        if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); qsAcceptSuggest(qsSuggestHighlight); return; }

        if (e.key === 'Tab'){ e.preventDefault(); qsAcceptSuggest(qsSuggestHighlight); return; }

        if (e.key === 'Escape'){ sg.style.display = 'none'; qsSuggestItems = []; return; }

      }

      if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); qsDoSend(); }

    });

    ip.addEventListener('click', () => renderQsSuggest());

    ip.addEventListener('keyup', e => {

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') renderQsSuggest();

    });

    ip.addEventListener('blur', () => { setTimeout(() => { sg.style.display = 'none'; }, 180); });

    sb.addEventListener('click', qsDoSend);

    refreshQsTags();

    function qsDoSend(){

      const txt = ip.value.trim(); if (!txt) return;

      const tags = parseQsHandles(txt);

      const valid = tags.filter(t => t.found);

      if (!valid.length){ showToast('Add at least one valid @handle','warn'); return; }

      const cleanText = txt.replace(/@([a-zA-Z0-9_]+)/g,'').trim() || 'Hey!';

      valid.forEach(t => {

        const k = t.found.key;

        if (!messages[k]) messages[k] = [];

        const tempId = 'tmp_qs_'+uid();

        const optimistic = { id: tempId, sender:'me', text:cleanText, time:nowTime(), day:todayDayLabel(), status:'pending', _pending:true };

        messages[k].push(optimistic);

        bumpDmList(k);

        // Persist to the backend so the recipient actually receives it.

        if (backend.isConfigured() && k !== 'saved'){

          backend.dms.send(k, { text: cleanText }).then(r => {

            const arr = messages[k] || [];

            const idx = arr.findIndex(x => x.id === tempId);

            if (idx >= 0){

              if (r && r.message){

                arr[idx] = { ...arr[idx], ...r.message, status:'delivered', _pending:false };

              } else if (r && r.error){

                arr[idx].status = 'failed'; arr[idx]._pending = false;

              }

              if (currentConversation === k && typeof renderConversation === 'function') renderConversation();

              if (typeof renderDmList === 'function') renderDmList();

            }

          }).catch(()=>{

            const arr = messages[k] || [];

            const idx = arr.findIndex(x => x.id === tempId);

            if (idx >= 0){ arr[idx].status = 'failed'; arr[idx]._pending = false; }

            if (typeof renderDmList === 'function') renderDmList();

          });

        }

      });

      if (typeof renderDmList === 'function') renderDmList();

      ip.value = ''; ip.style.height = 'auto';

      sb.classList.add('disabled');

      sg.style.display = 'none';

      refreshQsTags();

      showToast('Transmitted to '+valid.length+' '+(valid.length===1?'recipient':'recipients'),'success');

      // Stay on Home (do NOT auto-navigate)

    }

  })();

  // PURPLE ORBS — toggle server rails

  document.getElementById('homePurpleOrb').addEventListener('mousedown', e => e.stopPropagation());

  document.getElementById('homePurpleOrb').addEventListener('click', e => { e.stopPropagation(); toggleHomeRail(); });

  document.getElementById('worldPurpleOrb').addEventListener('mousedown', e => e.stopPropagation());

  document.getElementById('worldPurpleOrb').addEventListener('click', e => { e.stopPropagation(); toggleWorldRail(); });

  const dmsOrb = document.getElementById('dmsPurpleOrb');

  if (dmsOrb){

    dmsOrb.addEventListener('mousedown', e => e.stopPropagation());

    dmsOrb.addEventListener('click', e => { e.stopPropagation(); toggleDmsRail(); });

  }

  // SERVER RAIL clicks (delegated)

  function bindServerRail(railId, isWorld){

    document.getElementById(railId).addEventListener('click', e => {

      const create = e.target.closest('[data-srv-action="create"]');

      if (create){ e.stopPropagation(); openCreateServer(); return; }

      const orb = e.target.closest('[data-srv-id]');

      if (orb){

        e.stopPropagation();

        const sid = orb.dataset.srvId;

        if (!isWorld) setPage('pageWorld');

        selectServer(sid);

        if (isWorld){ /* keep rail open */ }

      }

    });

  }

  bindServerRail('homeServerRail', false);

  bindServerRail('worldServerRail', true);

  if (document.getElementById('dmsServerRail')) bindServerRail('dmsServerRail', false);

  // Members toggle

  document.getElementById('worldMembersToggle').addEventListener('click', toggleMembers);

  document.getElementById('msClose').addEventListener('click', toggleMembers);

  document.getElementById('msInner').addEventListener('click', e => {

    const r = e.target.closest('[data-ms-name]'); if (!r) return;

    openProfileByName(r.dataset.msName);

  });

  // Avatar -> own profile

  document.getElementById('tbAvatar').addEventListener('click', () => openProfile(null));

  // Profile modal

  document.getElementById('modalClose').addEventListener('click', closeProfile);

  document.getElementById('profileModalBackdrop').addEventListener('mousedown', e => { if (e.target.id === 'profileModalBackdrop') closeProfile(); });

  document.getElementById('modalMessage').addEventListener('click', e => {

    const k = e.currentTarget.dataset.targetKey;

    closeProfile();

    if (k){ setPage('pageMessages'); openConversation(k); }

  });

  document.getElementById('modalCall').addEventListener('click', () => { closeProfile(); showToast('Voice call would start here'); });

  document.getElementById('modalEditBtn').addEventListener('click', enterProfileEdit);

  document.getElementById('profileEditLogout').addEventListener('click', () => {

    appConfirm('Log out of NEXUS?', {title:'LOG OUT', confirmLabel:'LOG OUT', danger:true}).then(async ok => {

      if (!ok) return;

      // Best-effort backend logout. Stateless JWTs mean the token would expire

      // on its own, but we still tell the server in case it tracks sessions.

      if (backend.isConfigured()){

        try { await backend.auth.logout(); } catch(_){}

      }

      backend.token.write(null);

      disconnectRealtime();

      try { voice.stop(); } catch(_){}

      clearAuth();

      closeProfile();

      // Wipe the in-memory profile + every store so nothing from the previous

      // user bleeds through behind the auth modal. Without this, the layout

      // (server rails, friend bubbles, DM list, profile name/handle) shows

      // the old account while the user types new credentials.

      selfProfile.name = '';

      selfProfile.handle = '';

      selfProfile.email = '';

      selfProfile.initial = '?';

      selfProfile.avImage = null;

      selfProfile.bannerImage = null;

      selfProfile.bio = '';

      selfProfile.baseColor = null;

      selfProfile.avColor = 'linear-gradient(135deg,#a78bfa,#1e1b4b)';

      selfProfile.orbColor = '#a78bfa';

      selfProfile.orbGrad = 'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.4),#a78bfa 55%,#1e1b4b)';

      Object.keys(servers).forEach(k => delete servers[k]);

      myServers.length = 0;

      Object.keys(channelData).forEach(k => { if (k !== '__empty__') delete channelData[k]; });

      Object.keys(conversations).forEach(k => { if (k !== 'saved') delete conversations[k]; });

      Object.keys(messages).forEach(k => delete messages[k]);

      messages.saved = [];

      friendsList.length = 0;

      markedFriends.length = 0;

      markedTextChannels.length = 0;

      marked.length = 0;

      notifications.length = 0;

      blockedUsers.clear();

      friendRequests.incoming.length = 0;

      friendRequests.outgoing.length = 0;

      currentServer = null;

      currentTextChannel = null;

      currentConversation = null;

      // Re-render the now-empty surfaces so the modal sits over a clean page.

      if (typeof renderHomeFriends === 'function') renderHomeFriends();

      if (typeof renderHomeMyServers === 'function') renderHomeMyServers();

      if (typeof renderHomeMarkedOrbits === 'function') renderHomeMarkedOrbits();

      if (typeof renderDmList === 'function') renderDmList();

      if (typeof renderMarkedPanel === 'function') renderMarkedPanel();

      if (typeof renderFriendRequestsHome === 'function') renderFriendRequestsHome();

      if (typeof renderOrbSlides === 'function') renderOrbSlides();

      if (typeof renderServerRails === 'function') renderServerRails();

      if (typeof refreshSelfAvatarsEverywhere === 'function') refreshSelfAvatarsEverywhere();

      if (typeof updateBadges === 'function') updateBadges();

      setAuthTab('login');

      ['authEmail','authPassword','authName','authHandle'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

      showAuthModal();

      showToast('Logged out','warn');

    });

  });

  // Settings sidebar nav + color picker + notif toggles

  function setSettingsTab(tab){

    document.querySelectorAll('.settings-side-item').forEach(x => x.classList.toggle('active', x.dataset.stTab === tab));

    document.querySelectorAll('[data-st-pane]').forEach(p => p.classList.toggle('active', p.dataset.stPane === tab));

    if (tab === 'friends' || tab === 'incoming' || tab === 'pending' || tab === 'blocked'){

      renderFriendsLists();

    }

    if (tab === 'appearance'){ syncThemePicker(); }

    if (tab === 'notif'){ renderNotifPanel(); }

  }

  document.querySelectorAll('.settings-side-item').forEach(t => t.addEventListener('click', async () => {

    if (t.dataset.stAction === 'voice'){ openVoiceSettings(); return; }

    if (t.dataset.stAction === 'change-server'){

      // Only available inside the desktop shell — preload exposes the API.

      if (window.orblood && typeof window.orblood.resetBackend === 'function'){

        const ok = await appConfirm('Disconnect from this server and pick a different one? You\'ll need to sign in again.', { title: 'CHANGE SERVER', confirmLabel: 'CHANGE', danger: true });

        if (ok) await window.orblood.resetBackend();

      }

      return;

    }

    setSettingsTab(t.dataset.stTab);

  }));

  // Reveal desktop-only entries when running inside Electron.

  if (window.orblood && window.orblood.isDesktop){

    const cs = document.getElementById('settingsChangeServer');

    if (cs) cs.style.display = '';

  }

  // Theme switcher: paint the active card and persist the chosen theme to

  // localStorage. The early <head> script already applies it on next boot

  // so the user never sees a flash of the wrong palette.

  function readActiveTheme(){

    try { return localStorage.getItem('orblood:theme') || 'orblood-dark'; } catch(_){ return 'orblood-dark'; }

  }

  function applyTheme(name){

    document.documentElement.setAttribute('data-theme', name);

    try { localStorage.setItem('orblood:theme', name); } catch(_){}

    syncThemePicker();

  }

  function syncThemePicker(){

    const active = readActiveTheme();

    document.querySelectorAll('[data-theme-pick]').forEach(c => c.classList.toggle('active', c.dataset.themePick === active));

  }

  document.addEventListener('click', e => {

    const card = e.target.closest('[data-theme-pick]');

    if (!card) return;

    applyTheme(card.dataset.themePick);

  });

  // Friend panel actions

  document.getElementById('settingsFriendsList').addEventListener('click', e => {

    const m = e.target.closest('[data-fp-message]'); if (m){ const k = m.dataset.fpMessage; closeProfile(); setPage('pageMessages'); openConversation(k); return; }

    const r = e.target.closest('[data-fp-remove]');

    if (r){

      const k = r.dataset.fpRemove; const c = conversations[k]; const name = c?c.name:k;

      appConfirm('Remove '+name+' from your friends list?', {title:'REMOVE FRIEND', confirmLabel:'REMOVE', danger:true}).then(ok => {

        if (!ok) return;

        removeFriend(k);

        renderFriendsLists();

        renderHomeFriends();

        renderDmList();

        renderMarkedPanel();

        showToast(name+' removed from friends','warn');

      });

    }

  });

  document.getElementById('settingsIncomingList').addEventListener('click', async e => {

    const a = e.target.closest('[data-fp-accept]');

    if (a){

      const id = parseInt(a.dataset.fpAccept);

      const r = friendRequests.incoming.find(x => x.id === id); if (!r) return;

      let peer = null;

      if (backend.isConfigured()){

        const resp = await backend.friends.accept(id);

        if (resp.error){ showToast('Could not accept: '+resp.error,'warn'); return; }

        peer = resp.peer || null;

      }

      const k = (peer && peer.handle ? peer.handle : (r.handle || r.name)).replace(/^@/,'').toLowerCase();

      if (!conversations[k]){

        conversations[k] = { name: peer ? peer.name : r.name, online:true, unread:0, avColor: peer ? peer.avColor : r.avColor, avImage: peer ? peer.avImage : null, initial: peer ? peer.initial : r.initial, handle: peer ? peer.handle : r.handle, bio: peer ? peer.bio : 'New friend.', stats:{posts:0,friends:1,orbits:0}, location:'UNKNOWN', joined:'NOW', lastSeen:'just now', rank:'EXPLORER', orbColor:'#818cf8', orbGrad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.5),#818cf8 55%,#1e1b4b)' };

        messages[k] = [];

      } else {

        // Existing conversation slot: mark as online so the friend bubble

        // appears in the "online" half of the list right away.

        conversations[k].online = true;

      }

      if (!friendsList.includes(k)) friendsList.push(k);

      friendRequests.incoming = friendRequests.incoming.filter(x => x.id !== id);

      renderFriendsLists();

      renderHomeFriends();

      renderDmList();

      updateBadges();

      showToast((peer ? peer.name : r.name)+' is now your friend','success');

      return;

    }

    const j = e.target.closest('[data-fp-reject]');

    if (j){

      const id = parseInt(j.dataset.fpReject);

      const r = friendRequests.incoming.find(x => x.id === id); if (!r) return;

      if (backend.isConfigured()){

        const resp = await backend.friends.reject(id);

        if (resp.error){ showToast('Could not reject','warn'); return; }

      }

      friendRequests.incoming = friendRequests.incoming.filter(x => x.id !== id);

      renderFriendsLists();

      updateBadges();

      showToast(r.name+' declined','warn');

    }

  });

  document.getElementById('settingsPendingList').addEventListener('click', async e => {

    const c = e.target.closest('[data-fp-cancel]');

    if (c){

      const id = parseInt(c.dataset.fpCancel);

      const r = friendRequests.outgoing.find(x => x.id === id); if (!r) return;

      if (backend.isConfigured()){

        const resp = await backend.friends.cancel(id);

        if (resp.error){ showToast('Could not cancel','warn'); return; }

      }

      friendRequests.outgoing = friendRequests.outgoing.filter(x => x.id !== id);

      renderFriendsLists();

      showToast('Cancelled request to '+r.name,'warn');

    }

  });

  document.getElementById('settingsBlockedList').addEventListener('click', e => {

    const u = e.target.closest('[data-fp-unblock]');

    if (u){

      const k = u.dataset.fpUnblock;

      unblockUser(k);

      renderFriendsLists();

      showToast('Unblocked','success');

    }

  });

  // Privacy: friends-only DM toggle

  document.getElementById('privFriendsOnly').addEventListener('change', e => {

    writeFriendsOnly(!!e.target.checked);

    if (currentConversation) renderConversation();

    showToast(e.target.checked ? 'Friends-only messages enabled' : 'Friends-only messages disabled','success');

  });

  // Send friend request straight from the locked compose banner.

  document.getElementById('dmComposeFriendBtn').addEventListener('click', async () => {

    if (!currentConversation) return;

    const conv = conversations[currentConversation]; if (!conv) return;

    if (isAlreadyFriend(currentConversation)){ showToast('Already friends','warn'); return; }

    if (friendRequests.outgoing.some(r => r.name.toLowerCase() === currentConversation.toLowerCase())){ showToast('Friend request already pending','warn'); return; }

    let req;

    if (backend.isConfigured()){

      const r = await backend.friends.request(conv.handle || ('@'+currentConversation));

      if (r.error){ showToast('Could not send request','warn'); return; }

      req = r.request;

    } else {

      req = { id:Date.now(), name:conv.name, handle:conv.handle, initial:conv.initial, avColor:conv.avColor, meta:'sent just now' };

    }

    friendRequests.outgoing.push(req);

    renderFriendsLists();

    if (typeof renderFriendRequestsHome === 'function') renderFriendRequestsHome();

    showToast('Friend request sent to '+conv.name,'success');

  });

  // Color picker streams 'input' events on every cursor move. Only update the

  // local preview chip + avatar preview live; defer the heavy avatar refresh

  // (re-renders DM list, voice users, orbits) until the picker commits via

  // 'change'. Otherwise the picker UI feels laggy.

  document.getElementById('profileColorInput').addEventListener('input', e => {

    const v = e.target.value;

    document.getElementById('profileColorChip').style.background = v;

    document.getElementById('profileColorHex').textContent = v.toUpperCase();

    selfProfile.baseColor = v;

    selfProfile.orbColor = v;

    selfProfile.orbGrad  = colorToOrbGrad(v);

    selfProfile.avColor  = colorToFlatGrad(v);

    applyProfileAvatarPreview();

  });

  document.getElementById('profileColorInput').addEventListener('change', () => {

    refreshSelfAvatarsEverywhere();

  });

  document.getElementById('modalHandleCopy').addEventListener('click', e => {

    e.stopPropagation();

    const h = document.getElementById('modalHandle').textContent;

    copyToClipboardSafe(h).then(ok => showToast(ok ? 'Handle copied' : 'Copy failed', ok ? 'success' : 'warn'));

  });

  document.getElementById('modalShareUser').addEventListener('click', () => {

    const targetKey = (document.getElementById('modalMessage').dataset.targetKey || '').toLowerCase();

    if (!targetKey){ showToast('Cannot share this profile','warn'); return; }

    closeProfile();

    openShareUserModal(targetKey);

  });

  document.getElementById('modalShareSelf').addEventListener('click', () => {

    closeProfile();

    openShareUserModal(null);

  });

  document.getElementById('dmShareUserBtn').addEventListener('click', () => {

    if (!currentConversation || (conversations[currentConversation]||{}).isSaved){ showToast('Cannot share this chat','warn'); return; }

    openShareUserModal(currentConversation);

  });

  document.getElementById('modalAddFriend').addEventListener('click', async () => {

    const targetKey = (document.getElementById('modalMessage').dataset.targetKey || '').toLowerCase();

    if (!targetKey){ showToast('Cannot send friend request','warn'); return; }

    if (isAlreadyFriend(targetKey)){ showToast('Already friends','warn'); return; }

    const conv = conversations[targetKey];

    if (!conv){ showToast('Cannot resolve user','warn'); return; }

    if (friendRequests.outgoing.some(r => (r.name||'').toLowerCase() === (conv.name||'').toLowerCase())){ showToast('Friend request already pending','warn'); return; }

    let req;

    if (backend.isConfigured()){

      // Pick the most reliable identifier we have. A handle with whitespace

      // is a synthesized fallback ('@user two') and won't match any real

      // user — fall back to the display name so the server's name lookup

      // path can find them.

      let target;

      const handle = (conv.handle || '').trim();

      const handleClean = handle.replace(/^@/, '');

      if (handle && !/\s/.test(handleClean)){

        target = handle;

      } else {

        target = conv.name;

      }

      const r = await backend.friends.request(target);

      if (r.error === 'user_not_found'){

        // The handle we know is stale (the peer changed theirs). Prompt the

        // user to look them up afresh — falling back to display name would

        // let us route around the peer's handle change which is a privacy

        // hole.

        showToast('User not found — handle may have changed','warn');

        return;

      } else if (r.error === 'already_friends'){ showToast('Already friends','warn'); return; }

      else if (r.error === 'request_already_pending'){ showToast('Request already pending','warn'); return; }

      else if (r.error){ showToast('Could not send request: '+r.error,'warn'); return; }

      else if (r.offline){ showToast('Cannot reach the server','warn'); return; }

      else { req = r.request; }

    } else {

      req = { id:Date.now(), name:conv.name, handle:conv.handle, initial:conv.initial, avColor:conv.avColor, meta:'sent just now' };

    }

    friendRequests.outgoing.push(req);

    showToast('Friend request sent to '+conv.name,'success');

    renderFriendRequestsHome();

    syncProfileFriendBtn();

  });

  // Friend-status check used by profile UI. Synthetic '__u_*' lookup keys

  // and saved/temp entries can never be friends.

  function isAlreadyFriend(key){

    if (!key) return false;

    if (key.startsWith && key.startsWith('__')) return false;

    const conv = conversations[key];

    if (!conv || conv.isSaved || conv.isTemp) return false;

    return isFriend(key);

  }

  function syncProfileFriendBtn(){

    const targetKey = (document.getElementById('modalMessage').dataset.targetKey || '').toLowerCase();

    const btn = document.getElementById('modalAddFriend');

    if (!btn) return;

    const friend  = isAlreadyFriend(targetKey);

    // Match outgoing requests by display name. The current modal target key may be a

    // synthetic key like '__u_<name>' for users without a conversation entry yet, so

    // comparing keys directly would miss the pending state.

    const targetName = (document.getElementById('modalName').textContent||'').trim().toLowerCase();

    const pending = !friend && targetName && friendRequests.outgoing.some(r => r.name.toLowerCase() === targetName);

    const disabled = friend || pending;

    btn.disabled = disabled;

    btn.style.opacity = disabled ? '0.55' : '';

    btn.style.cursor = disabled ? 'not-allowed' : '';

    btn.innerHTML = friend

      ? '<i data-lucide="check" style="width:11px;height:11px"></i>FRIEND'

      : (pending

        ? '<i data-lucide="clock" style="width:11px;height:11px"></i>PENDING'

        : '<i data-lucide="user-plus" style="width:11px;height:11px"></i>+ FRIEND');

  }

  document.getElementById('modalBlock').addEventListener('click', () => {

    const targetKey = (document.getElementById('modalMessage').dataset.targetKey || '').toLowerCase();

    if (!targetKey || (conversations[targetKey] && conversations[targetKey].isSaved)){ showToast('Cannot block this user','warn'); return; }

    const name = document.getElementById('modalName').textContent;

    const blocked = isBlocked(targetKey);

    if (blocked){

      appConfirm('Unblock '+name+'? Their messages and history will be visible again.', {title:'UNBLOCK USER', confirmLabel:'UNBLOCK'}).then(ok => {

        if (!ok) return;

        unblockUser(targetKey);

        showToast(name+' unblocked','success');

        closeProfile();

      });

    } else {

      appConfirm('Block '+name+'? Your chat with them will be hidden for both sides until you unblock.', {title:'BLOCK USER', confirmLabel:'BLOCK', danger:true}).then(ok => {

        if (!ok) return;

        blockUser(targetKey);

        showToast(name+' blocked','warn');

        closeProfile();

        renderDmList();

      });

    }

  });

  document.getElementById('modalSharedList').addEventListener('click', e => {

    const orb = e.target.closest('[data-shared-server]'); if (!orb) return;

    const sid = orb.dataset.sharedServer;

    if (!servers[sid]) return;

    closeProfile();

    setPage('pageWorld');

    selectServer(sid);

  });

  document.getElementById('profileEditCancel').addEventListener('click', cancelProfileEdit);

  document.getElementById('profileEditSave').addEventListener('click', applyProfileEdit);

  document.getElementById('profileEditAvatarBtn').addEventListener('click', () => { selfProfile.avImage = null; cycleSelfAvatar(); applyProfileAvatarPreview(); });

  document.getElementById('profileEditAvatarUploadBtn').addEventListener('click', () => document.getElementById('profileAvatarFile').click());

  // Try the backend upload endpoint first; fall back to in-memory data URL so

  // the page still works against an offline / static-only host.

  async function _readImageOrUpload(file){

    if (!file || !file.type.startsWith('image/')) return null;

    if (backend.isConfigured()){

      const fd = new FormData(); fd.append('file', file);

      const r = await backend.uploads.image(fd);

      if (r && r.url){

        // Resolve relative URLs (/uploads/...) against the API origin so the

        // browser can fetch them when the app is hosted on a different host.

        if (r.url.startsWith('/')){

          const base = _backendBase().replace(/\/api$/, '');

          return base ? base + r.url : r.url;

        }

        return r.url;

      }

      // Fall through to data URL on upload failure

    }

    return await new Promise((res, rej) => {

      const rd = new FileReader();

      rd.onload = ev => res(ev.target.result);

      rd.onerror = rej;

      rd.readAsDataURL(file);

    });

  }

  document.getElementById('profileAvatarFile').addEventListener('change', async e => {

    const f = e.target.files && e.target.files[0]; if (!f) return;

    const url = await _readImageOrUpload(f);

    if (!url){ showToast('Pick an image file','warn'); return; }

    selfProfile.avImage = url;

    applyProfileAvatarPreview();

    refreshHomeHeroIdentity();

    document.getElementById('profileEditAvatarUrl').value = '';

    if (backend.isConfigured()) backend.me.patch({ avImage: url }).catch(()=>{});

  });

  // Profile cover (banner) — independent from avatar.

  document.getElementById('profileEditCoverUploadBtn').addEventListener('click', () => document.getElementById('profileCoverFile').click());

  document.getElementById('profileEditCoverClearBtn').addEventListener('click', () => {

    selfProfile.bannerImage = null;

    syncCoverPreview();

    refreshHomeHeroIdentity();

    if (backend.isConfigured()) backend.me.patch({ bannerImage: null }).catch(()=>{});

  });

  document.getElementById('profileCoverFile').addEventListener('change', async e => {

    const f = e.target.files && e.target.files[0]; if (!f) return;

    const url = await _readImageOrUpload(f);

    if (!url){ showToast('Pick an image file','warn'); return; }

    selfProfile.bannerImage = url;

    syncCoverPreview();

    refreshHomeHeroIdentity();

    if (backend.isConfigured()) backend.me.patch({ bannerImage: url }).catch(()=>{});

    return;

    // Legacy: original code kept a file-reader path; left here only as a hint

    // for what *was* the reader callback signature.

    const rd = new FileReader();

    rd.onload = ev => { selfProfile.bannerImage = ev.target.result; syncCoverPreview(); refreshHomeHeroIdentity(); };

    rd.readAsDataURL(f);

  });

  function syncCoverPreview(){

    const prev = document.getElementById('profileEditCoverPreview');

    if (!prev) return;

    if (selfProfile.bannerImage){

      prev.style.background = 'transparent url('+selfProfile.bannerImage+') center/cover no-repeat';

    } else {

      const c = selfProfile.orbColor || '#22c55e';

      const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);

      prev.style.background = 'radial-gradient(ellipse at 50% 0%,rgba('+r+','+g+','+b+',0.4),transparent 70%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent)';

    }

  }

  function applyProfileAvatarPreview(){

    const avPrev = document.getElementById('profileEditAvatarPreview');

    if (selfProfile.avImage){

      avPrev.textContent = '';

      avPrev.style.background = 'transparent url('+selfProfile.avImage+') center/cover no-repeat';

    } else {

      avPrev.textContent = selfProfile.initial;

      avPrev.style.background = selfProfile.orbGrad || selfProfile.avColor;

    }

  }

  // Generic smodal close

  document.querySelectorAll('[data-close-smodal]').forEach(b => {

    b.addEventListener('click', () => {

      const id = b.dataset.closeSmodal;

      const el = document.getElementById(id);

      if (el) el.classList.remove('show');

    });

  });

  // Add Friend

  // Pressing Enter inside the dialog input should fire SEND REQUEST too.

  document.getElementById('addFriendInput').addEventListener('keydown', e => {

    if (e.key === 'Enter' && !e.shiftKey){

      e.preventDefault();

      document.getElementById('addFriendSend').click();

    }

  });

  // Click outside the dialog to close it (consistent with the other modals).

  document.getElementById('addFriendBackdrop').addEventListener('mousedown', e => {

    if (e.target.id === 'addFriendBackdrop'){

      e.target.classList.remove('show');

    }

  });

  document.getElementById('addFriendSend').addEventListener('click', async () => {

    const raw = document.getElementById('addFriendInput').value.trim();

    if (!raw){ showToast('Enter an ID or handle','warn'); return; }

    const handle = raw.startsWith('@') ? raw : '@'+raw.toLowerCase().replace(/[^a-z0-9_]/g,'');

    const handleKey = handle.replace(/^@/,'').toLowerCase();

    // Self-add guard.

    if (handleKey === (selfProfile.handle||'').replace(/^@/,'').toLowerCase()){

      showToast('You can\'t friend yourself','warn'); return;

    }

    // Resolve the target. With a backend we ask /users/search; without one,

    // we look in conversations[] (any user we've seen). If nothing is found,

    // bail with an error rather than silently sending a request to nobody.

    let target = null;

    if (backend.isConfigured()){

      const lookup = await backend.users.lookup(raw);

      if (lookup && !lookup.error && !lookup.offline && lookup.user){

        target = { name:lookup.user.name, handle:lookup.user.handle, initial:(lookup.user.name||'?').charAt(0).toUpperCase(), avColor:lookup.user.avColor||'linear-gradient(135deg,#818cf8,#1e1b4b)' };

      }

    }

    if (!target){

      const conv = conversations[handleKey] || Object.values(conversations).find(c => (c.handle||'').toLowerCase() === handle.toLowerCase());

      if (conv) target = { name:conv.name, handle:conv.handle, initial:conv.initial, avColor:conv.avColor };

    }

    if (!target){

      showToast('No user found for "'+raw+'"','warn'); return;

    }

    // Already friends or already pending?

    if (isFriend(target.name.toLowerCase())){ showToast('Already friends with '+target.name,'warn'); return; }

    if (friendRequests.outgoing.some(r => r.name.toLowerCase() === target.name.toLowerCase())){ showToast('Friend request already pending','warn'); return; }

    let req;

    if (backend.isConfigured()){

      // Pass the most specific identifier first: prefer the resolved

      // handle from the user lookup, then fall back to the raw input.

      const target1 = (target.handle || '').trim() || raw;

      const r = await backend.friends.request(target1);

      if (r.error === 'user_not_found'){ showToast('No user found for "'+raw+'"','warn'); return; }

      if (r.error === 'already_friends'){ showToast('Already friends','warn'); return; }

      if (r.error === 'request_already_pending'){ showToast('Request already pending','warn'); return; }

      if (r.error){ showToast('Could not send request: '+r.error,'warn'); return; }

      if (r.offline){ showToast('Cannot reach the server','warn'); return; }

      req = r.request;

    } else {

      req = { id:Date.now(), name:target.name, handle:target.handle, initial:target.initial, avColor:target.avColor, meta:'sent just now' };

    }

    friendRequests.outgoing.push(req);

    document.getElementById('addFriendInput').value = '';

    document.getElementById('addFriendBackdrop').classList.remove('show');

    showToast('Friend request sent to '+target.name,'success');

    frActiveTab = 'outgoing';

    renderFriendRequestsHome();

    if (typeof renderFriendsLists === 'function') renderFriendsLists();

    updateBadges();

  });

  // Create Server

  document.querySelectorAll('[data-cs-tab]').forEach(t => t.addEventListener('click', () => {

    csActiveTab = t.dataset.csTab;

    document.querySelectorAll('[data-cs-tab]').forEach(x => x.classList.toggle('active', x === t));

    document.getElementById('csCreatePane').style.display = csActiveTab==='create'?'':'none';

    document.getElementById('csJoinPane').style.display = csActiveTab==='join'?'':'none';

  }));

  // Customize modal — tab switching + chip clicks + unlock button.

  document.querySelectorAll('[data-cz-tab]').forEach(t => t.addEventListener('click', () => {

    document.querySelectorAll('[data-cz-tab]').forEach(x => x.classList.toggle('active', x === t));

    const tab = t.dataset.czTab;

    document.getElementById('czLibraryPane').style.display = tab==='library'?'':'none';

    document.getElementById('czShopPane').style.display    = tab==='shop'?'':'none';

  }));

  document.getElementById('customizeBackdrop').addEventListener('click', e => {

    const chip = e.target.closest('[data-cz-set]');

    if (chip && !chip.classList.contains('locked')){

      e.stopPropagation();

      _setServerStyle(chip.dataset.czSet, chip.dataset.czPack);

      return;

    }

    const unlock = e.target.closest('[data-cz-unlock]');

    if (unlock){

      e.stopPropagation();

      _unlockPack(unlock.dataset.czUnlock);

      return;

    }

    // Click anywhere on a shop card (outside the UNLOCK button) opens

    // a preview. The button still bubbles UNLOCK first so a direct

    // press of the action skips the preview when the user already knows.

    const shopCard = e.target.closest('[data-cz-preview]');

    if (shopCard){

      e.stopPropagation();

      openPackPreview(shopCard.dataset.czPreview);

      return;

    }

    if (e.target.id === 'customizeBackdrop'){

      document.getElementById('customizeBackdrop').classList.remove('show');

    }

  });

  // Pack preview modal — UNLOCK button + backdrop close.

  document.getElementById('packPreviewBackdrop').addEventListener('click', e => {

    if (e.target.id === 'packPreviewBackdrop'){

      document.getElementById('packPreviewBackdrop').classList.remove('show');

      return;

    }

    const unlockBtn = e.target.closest('#packPreviewUnlock');

    if (unlockBtn && !unlockBtn.disabled && unlockBtn.dataset.czUnlock){

      e.stopPropagation();

      _unlockPack(unlockBtn.dataset.czUnlock).then(() => {

        document.getElementById('packPreviewBackdrop').classList.remove('show');

      });

    }

  });



  // Color grid removed — colour is randomised at openCreateServer time.

  document.getElementById('csSubmit').addEventListener('click', submitCreateServer);

  // Create Channel

  document.querySelectorAll('[data-cc-tab]').forEach(t => t.addEventListener('click', () => {

    ccActiveTab = t.dataset.ccTab;

    ccSelectedStyle = ccActiveTab==='voice'?'indigo':'glow';

    document.querySelectorAll('[data-cc-tab]').forEach(x => x.classList.toggle('active', x === t));

    showCcStyleField();

    renderCcStyles();

  }));

  function centerCcOrb(animate){

    const track = document.getElementById('ccOrbTrack');

    if (!track) return;

    const sel = track.querySelector('.cc-orb-card.selected');

    if (!sel) return;

    // Only scroll if the selected card is partially or fully out of view.

    // Otherwise leave the carousel where it is so each arrow press visibly advances one card.

    const trackRect = track.getBoundingClientRect();

    const selRect = sel.getBoundingClientRect();

    const margin = 4;

    let delta = 0;

    if (selRect.left < trackRect.left + margin){

      delta = selRect.left - (trackRect.left + margin);

    } else if (selRect.right > trackRect.right - margin){

      delta = selRect.right - (trackRect.right - margin);

    }

    if (delta === 0) return;

    const max = Math.max(0, track.scrollWidth - track.clientWidth);

    const target = Math.max(0, Math.min(max, track.scrollLeft + delta));

    if (animate === false) track.scrollLeft = target;

    else track.scrollTo({ left: target, behavior: 'smooth' });

  }

  document.getElementById('ccVoiceStyleGrid').addEventListener('click', e => {

    const nav = e.target.closest('[data-cc-orb-nav]');

    if (nav){

      const dir = parseInt(nav.dataset.ccOrbNav);

      const keys = Object.keys(voiceStyles);

      let idx = keys.indexOf(ccSelectedStyle);

      idx = (idx + dir + keys.length) % keys.length;

      ccSelectedStyle = keys[idx];

      // Update selected class in-place instead of re-rendering the

      // whole track. A full re-render resets scrollLeft to 0 and the

      // subsequent smooth-scroll fights scroll-snap, which is what

      // made repeated right-arrow clicks "stick" instead of advancing

      // visibly. Keeping the DOM stable lets centerCcOrb pan from the

      // current position to the next card cleanly.

      const track = document.getElementById('ccOrbTrack');

      if (track){

        track.querySelectorAll('.cc-orb-card').forEach(el => {

          el.classList.toggle('selected', el.dataset.ccVoiceStyle === ccSelectedStyle);

        });

      }

      requestAnimationFrame(() => centerCcOrb(true));

      return;

    }

    const b = e.target.closest('[data-cc-voice-style]'); if (!b) return;

    // Click on a card just selects it without scrolling/sliding.

    ccSelectedStyle = b.dataset.ccVoiceStyle;

    document.querySelectorAll('#ccOrbTrack .cc-orb-card').forEach(el => el.classList.toggle('selected', el.dataset.ccVoiceStyle === ccSelectedStyle));

  });

  document.getElementById('ccSubmit').addEventListener('click', submitCreateChannel);

  // Pin

  document.getElementById('pinSubmit').addEventListener('click', submitPin);

  // Cover

  document.getElementById('coverSubmit').addEventListener('click', submitCover);

  document.getElementById('serverInviteCopy').addEventListener('click', () => {

    const key = document.getElementById('serverInviteKey').value;

    copyToClipboardSafe(key).then(ok => showToast(ok ? 'Invite key copied' : 'Copy failed', ok ? 'success' : 'warn'));

  });

  document.getElementById('serverInviteRegen').addEventListener('click', async () => {

    if (!currentServer) return;

    const ok = await appConfirm('Regenerate the invite key? Anyone who saved the old one won\'t be able to use it anymore.', { title: 'NEW INVITE KEY', confirmLabel: 'REGENERATE', danger: true });

    if (!ok) return;

    if (!backend.isConfigured()){ showToast('Cannot reach the server','warn'); return; }

    const r = await backend.servers.regenerateInvite(currentServer);

    if (r && r.error){ showToast('Could not regenerate: '+r.error,'warn'); return; }

    if (r && r.offline){ showToast('Cannot reach the server','warn'); return; }

    if (r && r.inviteKey){

      document.getElementById('serverInviteKey').value = r.inviteKey;

      const s = servers[currentServer]; if (s) s.inviteKey = r.inviteKey;

      showToast('Invite key regenerated','success');

    }

  });

  document.getElementById('serverRemoveBtn').addEventListener('click', () => {

    if (!currentServer) return;

    const s = servers[currentServer];

    appConfirm('Permanently delete server "'+s.name+'"? All channels, messages and members are gone.', {title:'DELETE SERVER', confirmLabel:'DELETE', danger:true}).then(async ok => {

      if (!ok) return;

      const sid = currentServer;

      // Drop voice connection if any voice channel of this server is active.

      if (inVoice && connectedChannel){

        const isOurs = (s.voiceChannels||[]).some(v => {

          const k = vcChannelKey(v);

          return k === connectedChannel;

        });

        if (isOurs) endVoiceCall();

      }

      if (backend.isConfigured()){

        const r = await backend.servers.remove(sid);

        if (r.error){ showToast('Delete failed: '+r.error,'warn'); return; }

      }

      purgeServerReferences(sid);

      delete servers[sid];

      myServers = myServers.filter(x => x !== sid);

      persistPinnedServers();

      currentServer = null; currentTextChannel = null;

      document.getElementById('coverBackdrop').classList.remove('show');

      setServerView('feed');

      document.getElementById('worldHeaderTitle').textContent = '// WORLD';

      document.getElementById('worldHeaderSub').textContent = 'Public broadcast - all stations';

      renderHomeMyServers();

      renderServerRails();

      renderHomeMarkedOrbits();

      renderOrbSlides();

      if (currentConversation) renderConversation();

      renderMarkedPanel();

      showToast('Server deleted','warn');

    });

  });

  document.getElementById('serverColorInput').addEventListener('input', e => {

    document.getElementById('serverColorChip').style.background = e.target.value;

    renderCoverPreview();

  });

  document.getElementById('serverBannerColor').addEventListener('input', e => {

    document.getElementById('serverBannerColorChip').style.background = e.target.value;

    renderCoverPreview();

  });

  // Helper: upload an image to /api/uploads/image and return an absolute

  // /uploads/<file> URL the server can store. Falls back to a data URL if

  // the upload endpoint is unreachable or returns nothing.

  async function _uploadImageOrDataUrl(file){

    if (!file || !file.type.startsWith('image/')) return null;

    if (backend.isConfigured()){

      const fd = new FormData(); fd.append('file', file);

      const r = await backend.uploads.image(fd);

      if (r && r.url){

        if (r.url.startsWith('/')){

          const apiBase = (typeof _backendBase === 'function' ? _backendBase() : '') || '';

          return apiBase ? apiBase.replace(/\/api$/, '') + r.url : r.url;

        }

        return r.url;

      }

    }

    return await new Promise((res, rej) => {

      const rd = new FileReader();

      rd.onload = ev => res(ev.target.result);

      rd.onerror = rej;

      rd.readAsDataURL(file);

    });

  }

  document.getElementById('coverUploadBtn').addEventListener('click', () => document.getElementById('coverFile').click());

  document.getElementById('coverFile').addEventListener('change', async e => {

    const f = e.target.files && e.target.files[0]; if (!f) return;

    if (!f.type.startsWith('image/')){ showToast('Pick an image file','warn'); return; }

    const url = await _uploadImageOrDataUrl(f);

    if (!url){ showToast('Could not upload cover','warn'); return; }

    document.getElementById('coverUrlInput').value = url;

    renderCoverPreview();

  });

  document.getElementById('emblemUploadBtn').addEventListener('click', () => document.getElementById('emblemFile').click());

  document.getElementById('emblemFile').addEventListener('change', async e => {

    const f = e.target.files && e.target.files[0]; if (!f) return;

    if (!f.type.startsWith('image/')){ showToast('Pick an image file','warn'); return; }

    const url = await _uploadImageOrDataUrl(f);

    if (!url){ showToast('Could not upload emblem','warn'); return; }

    document.getElementById('emblemUrlInput').value = url;

    renderCoverPreview();

  });

  // Roles modal

  document.getElementById('rolesBackdrop').addEventListener('mousedown', e => { if (e.target.id === 'rolesBackdrop') document.getElementById('rolesBackdrop').classList.remove('show'); });

  document.getElementById('rolesList').addEventListener('click', e => {

    const it = e.target.closest('[data-role-id]'); if (!it) return;

    activeRoleId = it.dataset.roleId;

    renderRolesList();

    renderRoleEditor();

  });

  document.getElementById('roleAddBtn').addEventListener('click', () => {

    if (!currentServer) return;

    const s = servers[currentServer]; ensureRoles(s);

    const id = 'role-'+uid();

    const colors = ['#a855f7','#22d3ee','#22c55e','#f59e0b','#ef4444','#ec4899','#7c3aed'];

    s.roles.push({ id, name:'New role', color:colors[s.roles.length % colors.length], members:[], perms:{} });

    activeRoleId = id;

    renderRolesList(); renderRoleEditor();

    persistRoles(s);

    showToast('Role created','success');

  });

  document.getElementById('roleEditPane').addEventListener('click', e => {

    if (!currentServer || !activeRoleId) return;

    const s = servers[currentServer]; const r = s.roles.find(x => x.id === activeRoleId); if (!r) return;

    const perm = e.target.closest('[data-role-perm]');

    if (perm){

      if (r.system){ showToast('The Owner role always has every permission','warn'); return; }

      const k = perm.dataset.rolePerm; r.perms[k] = !r.perms[k]; renderRoleEditor(); persistRoles(s); return;

    }

    if (e.target.closest('[data-role-feature-toggle]')){

      r.featured = !(r.featured !== false); // default true; toggle

      renderRoleEditor();

      renderServerOverview();

      return;

    }

    const unassign = e.target.closest('[data-role-unassign]');

    if (unassign){

      const name = unassign.dataset.roleUnassign;

      if (r.system){ showToast('Owner cannot be removed - transfer ownership instead','warn'); return; }

      r.members = (r.members||[]).filter(x => x !== name);

      renderRoleEditor(); renderRolesList();

      if (membersOpen) renderMembers();

      renderServerOverview();

      persistRoles(s);

      return;

    }

    const sres = e.target.closest('[data-role-search-add]');

    if (sres){

      const name = sres.dataset.roleSearchAdd;

      if (r.system){ showToast('Use Transfer Ownership to change the Owner','warn'); return; }

      r.members = r.members || [];

      if (!r.members.includes(name)){

        // A user can hold multiple roles — additive. Each role's permissions

        // are unioned, and the member list groups them under the highest

        // role they hold (see renderMembers).

        r.members.push(name);

      }

      renderRoleEditor(); renderRolesList();

      if (membersOpen) renderMembers();

      renderServerOverview();

      persistRoles(s);

      return;

    }

    if (e.target.closest('#roleTransferBtn')){

      openOwnerTransferModal();

      return;

    }

    if (e.target.closest('#roleDeleteBtn')){

      if (r.system){ showToast('System role cannot be deleted','warn'); return; }

      s.roles = s.roles.filter(x => x.id !== r.id);

      activeRoleId = s.roles[0] ? s.roles[0].id : null;

      renderRolesList(); renderRoleEditor();

      persistRoles(s);

      showToast('Role deleted','warn');

    }

  });

  document.getElementById('roleEditPane').addEventListener('input', e => {

    if (!currentServer || !activeRoleId) return;

    const s = servers[currentServer]; const r = s.roles.find(x => x.id === activeRoleId); if (!r) return;

    if (e.target.id === 'roleNameInp'){

      if (r.system){ e.target.value = r.name; return; }

      r.name = e.target.value; renderRolesList(); if (membersOpen) renderMembers(); renderServerOverview();

      persistRoles(s);

    }

    if (e.target.id === 'roleColorInp'){

      if (r.system){ e.target.value = r.color; return; }

      r.color = e.target.value;

      const prev = document.getElementById('roleColorPreview');

      if (prev){ prev.style.background = r.color; const hex = document.getElementById('roleColorHex'); if (hex) hex.textContent = r.color.toUpperCase(); }

      renderRolesList(); if (membersOpen) renderMembers();

      renderServerOverview();

      persistRoles(s);

    }

    if (e.target.id === 'roleMemberSearch'){

      const q = e.target.value.trim().toLowerCase();

      const box = document.getElementById('roleMemberSearchResults');

      if (!q){ box.style.display = 'none'; return; }

      const candidates = s.members.filter(m => m.toLowerCase().includes(q) && !(r.members||[]).includes(m));

      if (!candidates.length){

        box.innerHTML = '<div class="role-search-empty">No matches.</div>';

      } else {

        box.innerHTML = candidates.slice(0,12).map(m => {

          const ck = m.toLowerCase();

          const c = conversations[ck];

          const av = c ? c.avColor : 'linear-gradient(135deg,#a78bfa,#1a0b2e)';

          const otherRole = s.roles.find(x => x !== r && (x.members||[]).includes(m));

          const tag = otherRole ? '<span class="role-search-result-tag" style="color:'+otherRole.color+'">'+escapeHtml(otherRole.name.toUpperCase())+'</span>' : '';

          return '<div class="role-search-result" data-role-search-add="'+escapeHtml(m)+'"><div class="role-member-av" style="background:'+av+'">'+m.charAt(0)+'</div><span class="role-search-result-name">'+escapeHtml(m)+'</span>'+tag+'</div>';

        }).join('');

      }

      box.style.display = 'block';

    }

  });

  // Right-click on a text or voice channel in the server overview opens a small menu

  // with Mark/Unmark + Share. This works regardless of admin status.

  document.getElementById('serverOverview').addEventListener('contextmenu', e => {

    const tcEl = e.target.closest('[data-tc-id]');

    const vcEl = e.target.closest('[data-vc-id]');

    const catHeadEl = e.target.closest('.ws-cat-h');

    if (!tcEl && !vcEl && !catHeadEl) return;

    e.preventDefault();

    // Capture click coords for any submenu action that wants to anchor

    // a picker next to the cursor (e.g. Style submenu).

    const _ctxAt = { x: e.clientX, y: e.clientY };

    const s = servers[currentServer]; if (!s) return;

    const canManageRoles = memberHasPerm(s,selfProfile.name,'manageRoles');

    if (tcEl){

      const tcId = tcEl.dataset.tcId;

      const tc = s.textChannels.find(x => x.id === tcId); if (!tc) return;

      const key = currentServer+'__'+tcId;

      const isMk = markedTextChannels.includes(key);

      const items = [

        { icon: isMk?'bookmark-x':'bookmark', label: isMk?'Unmark from Quick Access':'Mark to Quick Access', action:()=>{ toggleChannelMark(currentServer, tcId); renderServerOverview(); renderMarkedPanel(); } },

        { icon:'share-2', label:'Share channel', action:()=>{ openShareChannelModal('text', tcId); } }

      ];

      if (memberHasPerm(s,selfProfile.name,'manageTextCh') || canManageRoles){

        items.push({ sep:true });

        items.push({ icon:'palette', label:'Style…', action:()=>{ openStylePicker('text', tcId, tc.customStyle, _ctxAt); } });

        items.push({ icon:'settings', label:'Channel settings', action:()=>{ openChanSettings({type:'text', id:tcId}); } });

      }

      showCtxMenu(e.clientX, e.clientY, items, '#'+tc.name);

    } else if (vcEl){

      const vcId = vcEl.dataset.vcId;

      const vc = s.voiceChannels.find(x => x.id === vcId); if (!vc) return;

      const chKey = vcEl.dataset.vcCh;

      const isMk = marked.includes(chKey);

      const items = [

        { icon: isMk?'bookmark-x':'bookmark', label: isMk?'Unmark from Marked Orbits':'Mark as Marked Orb', action:()=>{ toggleMark(chKey); } },

        { icon:'share-2', label:'Share voice orb', action:()=>{ openShareChannelModal('voice', vcId); } }

      ];

      if (memberHasPerm(s,selfProfile.name,'manageVoiceCh') || canManageRoles){

        items.push({ sep:true });

        items.push({ icon:'settings', label:'Voice orb settings', action:()=>{ openChanSettings({type:'voice', id:vcId}); } });

      }

      showCtxMenu(e.clientX, e.clientY, items, vc.name);

    } else {

      // Right-click on a category header.

      const catCard = catHeadEl.closest('[data-cat-id]'); if (!catCard) return;

      const catId = catCard.dataset.catId;

      const cat = s.categories.find(x => x.id === catId); if (!cat) return;

      const items = [];

      if (memberHasPerm(s,selfProfile.name,'manageCategory') || canManageRoles){

        items.push({ icon:'palette', label:'Style…', action:()=>{ openStylePicker('category', catId, cat.customStyle, _ctxAt); } });

        items.push({ icon:'settings', label:'Category settings', action:()=>{ openChanSettings({type:'category', id:catId}); } });

      }

      if (!items.length) return;

      showCtxMenu(e.clientX, e.clientY, items, cat.name);

    }

  });

  // SERVER OVERVIEW interactions

  document.getElementById('serverOverview').addEventListener('click', e => {

    const menuToggle = e.target.closest('[data-srv-action="banner-menu-toggle"]');

    if (menuToggle){

      e.stopPropagation();

      openBannerMenu(menuToggle);

      return;

    }

    // legacy banner-menu items removed - actions now wired through openBannerMenu() portal popup.

    // Server-pin EDIT/PIN buttons inside the pinned-box use data-srv-action='addpin'.

    if (e.target.closest('[data-srv-action="addpin"]')){ e.stopPropagation(); openPinModal(); return; }

    if (e.target.closest('[data-srv-action="share"]')){ e.stopPropagation(); openShareServerModal(); return; }

    if (e.target.closest('[data-srv-action="customize"]')){ e.stopPropagation(); openCustomizeModal(); return; }

    if (e.target.closest('[data-srv-action="leave"]')){

      e.stopPropagation();

      const sid = currentServer; const s = servers[sid]; if (!s) return;

      appConfirm('Leave server "'+s.name+'"? You will be removed from this server until you rejoin via invite.', {title:'LEAVE SERVER', confirmLabel:'LEAVE', danger:true}).then(async ok => {

        if (!ok) return;

        if (inVoice && connectedChannel){

          const isOurs = (s.voiceChannels||[]).some(v => {

            const k = vcChannelKey(v);

            return k === connectedChannel;

          });

          if (isOurs) endVoiceCall();

        }

        if (backend.isConfigured()){

          const r = await backend.servers.leave(sid);

          if (r.error === 'last_admin_must_transfer'){

            showToast('Transfer ownership before leaving.','warn'); return;

          }

          if (r.error){ showToast('Could not leave: '+r.error,'warn'); return; }

        }

        s.members = (s.members||[]).filter(m => m !== selfProfile.name);

        s.admins = (s.admins||[]).filter(m => m !== selfProfile.name);

        purgeServerReferences(sid);

        myServers = myServers.filter(x => x !== sid);

        persistPinnedServers();

        currentServer = null; currentTextChannel = null;

        setServerView('feed');

        document.getElementById('worldHeaderTitle').textContent = '// WORLD';

        document.getElementById('worldHeaderSub').textContent = 'Public broadcast - all stations';

        renderHomeMyServers();

        renderServerRails();

        renderMarkedPanel();

        renderHomeMarkedOrbits();

        renderOrbSlides();

        if (currentConversation) renderConversation();

        showToast('Left '+s.name,'warn');

      });

      return;

    }

    const pinEdit = e.target.closest('[data-cat-pin-edit]');

    if (pinEdit){

      e.stopPropagation();

      openCategoryPinModal(pinEdit.dataset.catPinEdit);

      return;

    }

    // Per-user collapse toggle on the chevron next to the category name.

    const catToggle = e.target.closest('[data-cat-toggle]');

    if (catToggle){

      e.stopPropagation();

      e.preventDefault();

      toggleCategoryCollapsed(currentServer, catToggle.dataset.catToggle);

      renderServerOverview();

      return;

    }

    const catDel = e.target.closest('[data-cat-delete]');

    if (catDel){

      e.stopPropagation();

      const id = catDel.dataset.catDelete;

      const s = servers[currentServer]; const cat = s.categories.find(x => x.id === id);

      if (!cat) return;

      appConfirm('Delete category "'+cat.name+'" and unlink its channels?', {title:'DELETE CATEGORY', confirmLabel:'DELETE', danger:true}).then(async ok => {

        if (!ok) return;

        if (backend.isConfigured()){

          const r = await backend.servers.delCategory(currentServer, id);

          if (r && r.error){ showToast('Could not delete: '+r.error,'warn'); return; }

        }

        s.categories = s.categories.filter(x => x.id !== id);

        showToast('Category deleted','warn');

        renderServerOverview();

      });

      return;

    }

    const tcDel = e.target.closest('[data-tc-delete]');

    if (tcDel){

      e.stopPropagation();

      const id = tcDel.dataset.tcDelete;

      const s = servers[currentServer]; const tc = s.textChannels.find(x => x.id === id);

      if (!tc) return;

      appConfirm('Delete text channel #'+tc.name+'?', {title:'DELETE CHANNEL', confirmLabel:'DELETE', danger:true}).then(async ok => {

        if (!ok) return;

        if (backend.isConfigured()){

          const r = await backend.servers.delTextChannel(currentServer, id);

          if (r && r.error){ showToast('Could not delete: '+r.error,'warn'); return; }

        }

        s.textChannels = s.textChannels.filter(x => x.id !== id);

        (s.categories||[]).forEach(cat => { cat.textChannels = (cat.textChannels||[]).filter(x => x !== id); });

        markedTextChannels = markedTextChannels.filter(k => k !== currentServer+'__'+id);

        persistMarkedTextChannels();

        delete serverChannelMessages[currentServer+'__'+id];

        if (currentTextChannel === id){ currentTextChannel = null; goToServerMain(); }

        showToast('Text channel deleted','warn');

        renderServerOverview();

        renderMarkedPanel();

      });

      return;

    }

    const vcDel = e.target.closest('[data-vc-delete]');

    if (vcDel){

      e.stopPropagation();

      const id = vcDel.dataset.vcDelete;

      const s = servers[currentServer]; const vc = s.voiceChannels.find(x => x.id === id);

      if (!vc) return;

      appConfirm('Delete voice channel '+vc.name+'?', {title:'DELETE VOICE ORB', confirmLabel:'DELETE', danger:true}).then(async ok => {

        if (!ok) return;

        if (backend.isConfigured()){

          const r = await backend.servers.delVoiceChannel(currentServer, id);

          if (r && r.error){ showToast('Could not delete: '+r.error,'warn'); return; }

        }

        s.voiceChannels = s.voiceChannels.filter(x => x.id !== id);

        (s.categories||[]).forEach(cat => { cat.voiceChannels = (cat.voiceChannels||[]).filter(x => x !== id); });

        const chKey = vcChannelKey(vc);

        if (connectedChannel === chKey) endVoiceCall();

        // Drop every reference to this channel: marks, last-joined sticker,

        // and the underlying channelData entry. Without this the orb column

        // would keep rendering a ghost slide for the deleted channel.

        marked = marked.filter(x => x !== chKey);

        persistMarkedOrbits();

        if (lastJoinedChannel === chKey){

          lastJoinedChannel = null;

          try { localStorage.removeItem('orblood:lastJoined'); } catch(_){}

        }

        if (channelData[chKey]) delete channelData[chKey];

        showToast('Voice channel deleted','warn');

        renderServerOverview();

        renderHomeMarkedOrbits();

        renderOrbSlides();

      });

      return;

    }

    const tcStar = e.target.closest('[data-tc-star]');

    if (tcStar){ e.stopPropagation(); toggleChannelMark(currentServer, tcStar.dataset.tcStar); renderServerOverview(); return; }

    const catAdd = e.target.closest('[data-cat-add]');

    if (catAdd){ openCreateChannel(catAdd.dataset.catAdd, catAdd.dataset.catTarget); return; }

    const tc = e.target.closest('[data-tc-id]');

    if (tc){ openTextChannel(tc.dataset.tcId); return; }

    const vc = e.target.closest('[data-vc-id]');

    if (vc){

      const chKey = vc.dataset.vcCh;

      if (channelData[chKey]){

        const idx = getAllChannels().indexOf(chKey);

        if (idx>=0){ goToSlide(idx, true); }

        joinVoiceChannel(chKey);

      } else {

        joinVoiceChannel(chKey);

      }

      return;

    }

    const ad = e.target.closest('[data-admin-name]');

    if (ad){

      openProfileByName(ad.dataset.adminName);

    }

  });

  // Server channel chat send

  const wsCi = document.getElementById('wsChannelInput');

  const wsCs = document.getElementById('wsChannelSend');

  let wsAttachImage = null; // base64 data URL of attached image, if any

  let wsAttachFile = null;  // raw File so we can upload to /api/uploads/image

  function wsRefreshSendBtn(){ wsCs.classList.toggle('disabled', !(wsCi.value.trim() || wsAttachImage)); }

  wsCi.addEventListener('input', () => {

    wsCi.style.height = 'auto';

    wsCi.style.height = Math.min(120, wsCi.scrollHeight) + 'px';

    wsRefreshSendBtn();

  });

  document.getElementById('wsChannelImageBtn').addEventListener('click', () => document.getElementById('wsChannelImageFile').click());

  document.getElementById('wsChannelImageFile').addEventListener('change', e => {

    const f = e.target.files && e.target.files[0]; if (!f) return;

    if (!f.type.startsWith('image/')){ showToast('Pick an image file','warn'); return; }

    const rd = new FileReader();

    rd.onload = ev => {

      wsAttachImage = ev.target.result;

      wsAttachFile = f;

      const prev = document.getElementById('wsAttachPreview');

      prev.innerHTML = '<div class="ws-attach-row"><img src="'+wsAttachImage+'" alt="" /><button class="ws-attach-x" id="wsAttachClear" title="Remove"><i data-lucide="x" style="width:11px;height:11px"></i></button></div>';

      prev.style.display = 'block';

      refreshIcons();

      document.getElementById('wsAttachClear').addEventListener('click', clearWsAttach);

      wsRefreshSendBtn();

    };

    rd.readAsDataURL(f);

    e.target.value = '';

  });

  function clearWsAttach(){

    wsAttachImage = null;

    wsAttachFile = null;

    const prev = document.getElementById('wsAttachPreview');

    prev.innerHTML = ''; prev.style.display = 'none';

    wsRefreshSendBtn();

  }

  async function wsSendMessage(){

    const txt = wsCi.value.trim();

    if (!txt && !wsAttachImage) return;

    if (!currentServer || !currentTextChannel) return;

    // Honour per-channel send-message override before optimistically

    // appending — otherwise the bubble would appear, the server would

    // reject it, and the user would see an inconsistent UI flash.

    const _s = servers[currentServer];

    const _tc = _s && (_s.textChannels || []).find(t => t.id === currentTextChannel);

    if (_s && _tc && !memberHasPermInChannel(_s, selfProfile.name, 'sendMessages', _tc)){

      showToast("You can\u2019t send messages in this channel.", 'warn');

      return;

    }

    const key = currentServer+'__'+currentTextChannel;

    serverChannelMessages[key] = serverChannelMessages[key] || [];

    const sid = currentServer, cid = currentTextChannel;

    const replyToId = chReplyTo;

    // Optimistic local insert with a temporary id; replaced once the server

    // returns the canonical message.

    const tempId = 'tmp-'+Date.now()+'-'+Math.floor(Math.random()*1000);

    const optimistic = { id:tempId, user:selfProfile.name, text:txt, time:'now', _pending:true };

    if (wsAttachImage){ optimistic.type = 'image'; optimistic.src = wsAttachImage; }

    if (replyToId) optimistic.replyTo = replyToId;

    serverChannelMessages[key].push(optimistic);

    wsCi.value = ''; wsCi.style.height = 'auto';

    const sentImage = wsAttachImage;

    const sentFile  = wsAttachFile;

    clearWsAttach();

    chReplyTo = null;

    renderChannelView();

    if (backend.isConfigured()){

      const payload = { text: txt };

      // Upload the actual file first so the peer (and a refresh) gets a

      // /uploads/... URL instead of the in-memory data URL we used for

      // the optimistic bubble.

      let uploadedUrl = sentImage;

      if (sentFile){

        const fd = new FormData(); fd.append('file', sentFile);

        const up = await backend.uploads.image(fd);

        if (up && up.url){

          if (up.url.startsWith('/')){

            const apiBase = (typeof _backendBase === 'function' ? _backendBase() : '') || '';

            uploadedUrl = apiBase ? apiBase.replace(/\/api$/, '') + up.url : up.url;

          } else {

            uploadedUrl = up.url;

          }

          // Patch the optimistic bubble to point at the real URL too.

          const idx0 = serverChannelMessages[key].findIndex(m => m.id === tempId);

          if (idx0 >= 0){ serverChannelMessages[key][idx0].src = uploadedUrl; }

        } else {

          showToast('Image upload failed','warn');

        }

      }

      if (uploadedUrl){ payload.payload = { type:'image', src: uploadedUrl }; }

      if (replyToId && typeof replyToId !== 'string') payload.replyTo = replyToId;

      const r = await backend.servers.sendChannelMessage(sid, cid, payload);

      const idx = serverChannelMessages[key].findIndex(m => m.id === tempId);

      if (r.error || r.offline){

        if (idx >= 0) serverChannelMessages[key].splice(idx, 1);

        showToast('Could not send: '+(r.error||'offline'),'warn');

      } else if (r.message){

        if (idx >= 0){

          const merged = Object.assign({}, optimistic, r.message, { _pending:false });

          _expandChannelMessage(merged);

          serverChannelMessages[key][idx] = merged;

        }

      }

      if (sid === currentServer && cid === currentTextChannel) renderChannelView();

    }

  }

  wsCs.addEventListener('click', wsSendMessage);

  wsCi.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); wsSendMessage(); } });

  // Channel message actions (reply / forward / copy / pin / delete)

  document.getElementById('wsChannelMsgs').addEventListener('click', async e => {

    // Tap a channel image to open the lightbox viewer (mirrors DM behaviour).

    const chImg = e.target.closest('[data-ch-img]');

    if (chImg){

      e.stopPropagation();

      const k = currentServer+'__'+currentTextChannel;

      const m = (serverChannelMessages[k]||[]).find(x => String(x.id) === String(chImg.dataset.chImg));

      if (m && m.src){

        const av = (function(){ const a = resolveUserAvatar(m.user); return a.bg; })();

        openImageViewer(m.src, { sender: m.user || 'Unknown', time: m.time || '', av });

      }

      return;

    }

    // Tapping a channel-msg avatar opens that sender's profile.

    const wsAv = e.target.closest('.ws-msg-av');

    if (wsAv){

      e.stopPropagation();

      const row = wsAv.closest('[data-ch-msg]');

      if (row){

        const k = currentServer+'__'+currentTextChannel;

        const m = (serverChannelMessages[k]||[]).find(x => x.id === parseInt(row.dataset.chMsg));

        if (m) openProfileByName(m.user);

      }

      return;

    }

    // Pinned-banner X (admin only) lives at the top of the channel view.

    const pinX = e.target.closest('[data-ch-pin-x]');

    if (pinX){

      e.stopPropagation();

      const s = servers[currentServer];

      const tc = s.textChannels.find(x => x.id === currentTextChannel);

      if (tc){

        tc.pinnedMsgId = null; tc.pinnedMsg = null; tc.pinnedBy = null;

        if (backend.isConfigured()){

          backend.servers.pinChannelMessage(currentServer, currentTextChannel, null).catch(()=>{});

        }

        renderChannelView();

        showToast('Unpinned','warn');

      }

      return;

    }

    const ccOpenCh = e.target.closest('[data-channel-card-open]');

    if (ccOpenCh){ e.stopPropagation(); handleChannelCardOpen(ccOpenCh.dataset.channelCardOpen); return; }

    const ucOpenCh = e.target.closest('[data-user-card-open]');

    if (ucOpenCh){ e.stopPropagation(); handleUserCardOpen(ucOpenCh.dataset.userCardOpen); return; }

    const scJoinCh = e.target.closest('[data-server-card-join]');

    if (scJoinCh){ e.stopPropagation(); try { openServerJoinModal(JSON.parse(decodeURIComponent(scJoinCh.dataset.serverCardJoin))); } catch(_){} return; }

    if (chSelectMode){

      const row = e.target.closest('[data-ch-msg]');

      if (row){ e.stopPropagation(); toggleChSelect(row.dataset.chMsg); return; }

    }

    const btn = e.target.closest('[data-ch-action]'); if (!btn) return;

    const idRaw = btn.dataset.chId;

    const id = idRaw;

    const action = btn.dataset.chAction;

    const key = currentServer+'__'+currentTextChannel;

    const msgs = serverChannelMessages[key] || [];

    const m = msgs.find(x => String(x.id) === String(id)); if (!m) return;

    if (action === 'reply'){ chReplyTo = id; renderChannelReplyPreview(); document.getElementById('wsChannelInput').focus(); }

    else if (action === 'copy'){

      const t = m.text || '';

      if (!t){ showToast('Nothing to copy','warn'); }

      else copyToClipboardSafe(t).then(ok => showToast(ok ? 'Copied to clipboard' : 'Copy failed', ok ? 'success' : 'warn'));

    }

    else if (action === 'delete'){

      // Persist deletion to backend so other members see it disappear too.

      const sid = currentServer, cid = currentTextChannel;

      if (backend.isConfigured() && typeof m.id === 'number'){

        backend.servers.delChannelMessage(sid, cid, m.id).catch(()=>{});

      }

      m.deleted = true; m.text = ''; renderChannelView(); showToast('Message deleted','info');

    }

    else if (action === 'forward'){ openForwardModal({ text:m.text, type:m.type, src:m.src }); }

    else if (action === 'pin'){

      const s = servers[currentServer];

      const tc = s.textChannels.find(c => c.id === currentTextChannel);

      const willPin = !tc.pinnedMsgId || String(tc.pinnedMsgId) !== String(id);

      if (backend.isConfigured()){

        const r = await backend.servers.pinChannelMessage(currentServer, currentTextChannel, willPin ? id : null);

        if (r.error){ showToast('Could not pin: '+r.error,'warn'); return; }

        if (r.offline){ showToast('Cannot reach the server','warn'); return; }

      }

      if (willPin){ tc.pinnedMsgId = id; tc.pinnedMsg = m.text||'(image)'; tc.pinnedBy = m.user; showToast('Pinned in #'+tc.name,'success'); }

      else { tc.pinnedMsgId = null; tc.pinnedMsg = null; tc.pinnedBy = null; showToast('Unpinned','warn'); }

      renderChannelView();

    }

  });

  // Header "go to server main" button

  document.getElementById('worldGoServerMain').addEventListener('click', goToServerMain);

  // Pin/unpin the currently open server to home (toggles its presence in myServers).

  document.getElementById('worldPinServerBtn').addEventListener('click', () => {

    if (!currentServer){ showToast('Open a server first','warn'); return; }

    if (myServers.includes(currentServer)){

      myServers = myServers.filter(s => s !== currentServer);

      showToast('Server unpinned from home','warn');

    } else {

      myServers.push(currentServer);

      showToast('Server pinned to home','success');

    }

    renderHomeMyServers();

    renderServerRails();

    syncWorldPinBtn();

    persistPinnedServers();

  });

  function syncWorldPinBtn(){

    const btn = document.getElementById('worldPinServerBtn');

    if (!btn) return;

    const isPinned = currentServer && myServers.includes(currentServer);

    btn.classList.toggle('active', !!isPinned);

    btn.title = isPinned ? 'Unpin server from home' : 'Pin server to home';

  }

  // Friend requests (home)

  document.querySelectorAll('.fr-tab').forEach(t => t.addEventListener('click', () => {

    frActiveTab = t.dataset.frTab;

    renderFriendRequestsHome();

  }));

  document.getElementById('frList').addEventListener('click', e => {

    const btn = e.target.closest('[data-fr-action]');

    if (!btn){

      // Open profile when the row itself (not the action buttons) is clicked.

      const row = e.target.closest('.fr-row');

      if (row){

        const name = row.dataset.frName;

        if (name){

          const k = name.toLowerCase();

          // Build a temporary profile if user isn't a contact yet.

          if (conversations[k]) openProfile(k);

          else {

            const r = friendRequests.incoming.find(x => x.name === name) || friendRequests.outgoing.find(x => x.name === name);

            if (r){

              const tempKey = '__fr_'+name.toLowerCase();

              conversations[tempKey] = { name:r.name, online:false, unread:0, avColor:r.avColor, initial:r.initial, handle:r.handle, bio:'Friend request — not connected yet.', stats:{posts:0,friends:0,orbits:0}, location:'UNKNOWN', joined:'—', lastSeen:'unknown', rank:'EXPLORER', orbColor:'#a78bfa', orbGrad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.5),#a78bfa 55%,#1e1b4b)', isTemp:true };

              openProfile(tempKey);

            }

          }

        }

      }

      return;

    }

    const id = parseInt(btn.dataset.frId);

    const action = btn.dataset.frAction;

    if (action === 'accept'){

      const r = friendRequests.incoming.find(x=>x.id===id);

      if (r){

        // Persist before mutating local state so we surface server errors.

        if (backend.isConfigured()){

          (async () => {

            const resp = await backend.friends.accept(id);

            if (resp.error){ showToast('Could not accept: '+resp.error,'warn'); return; }

            const peer = resp.peer || {};

            const k = (peer.handle || r.handle || r.name).replace(/^@/,'').toLowerCase();

            if (!conversations[k]){

              conversations[k] = { name: peer.name || r.name, online: !!peer.online, unread:0, avColor: peer.avColor || r.avColor, avImage: peer.avImage || null, initial: peer.initial || r.initial, handle: peer.handle || r.handle, bio: peer.bio || 'New friend.', stats:{posts:0,friends:1,orbits:0}, location:'UNKNOWN', joined:'NOW', lastSeen:'just now', rank:'EXPLORER', orbColor:'#818cf8', orbGrad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.5),#818cf8 55%,#1e1b4b)' };

              messages[k] = [];

            } else {

              conversations[k].online = !!peer.online;

            }

            addFriend(k);

            friendRequests.incoming = friendRequests.incoming.filter(x=>x.id!==id);

            renderDmList();

            renderHomeFriends();

            renderFriendRequestsHome();

            if (typeof renderFriendsLists === 'function') renderFriendsLists();

            updateBadges();

            showToast((peer.name || r.name)+' is now your friend','success');

          })();

          return;

        }

        // Local-only fallback (no backend wired up).

        const k = r.name.toLowerCase();

        if (!conversations[k]){

          conversations[k] = { name:r.name, online:false, unread:0, avColor:r.avColor, initial:r.initial, handle:r.handle, bio:'New friend.', stats:{posts:0,friends:1,orbits:0}, location:'UNKNOWN', joined:'NOW', lastSeen:'just now', rank:'EXPLORER', orbColor:'#818cf8', orbGrad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.5),#818cf8 55%,#1e1b4b)' };

          messages[k] = [];

        }

        addFriend(k);

        renderDmList();

        renderHomeFriends();

        if (typeof renderFriendsLists === 'function') renderFriendsLists();

        friendRequests.incoming = friendRequests.incoming.filter(x=>x.id!==id);

        showToast(r.name+' is now your friend','success');

      }

    } else if (action === 'reject'){

      const r = friendRequests.incoming.find(x=>x.id===id);

      if (backend.isConfigured()){

        backend.friends.reject(id).catch(()=>{});

      }

      friendRequests.incoming = friendRequests.incoming.filter(x=>x.id!==id);

      renderFriendRequestsHome();

      if (r) showToast(r.name+' declined','warn');

    } else if (action === 'cancel'){

      const r = friendRequests.outgoing.find(x=>x.id===id);

      if (backend.isConfigured()){

        backend.friends.cancel(id).catch(()=>{});

      }

      friendRequests.outgoing = friendRequests.outgoing.filter(x=>x.id!==id);

      if (r) showToast('Cancelled request to '+r.name,'warn');

    }

    renderFriendRequestsHome();

    updateBadges();

  });

  // Orb top buttons

  document.getElementById('orbConnBanner').addEventListener('click', toggleVoiceUsers);

  document.getElementById('vuClose').addEventListener('click', () => setVoiceUsers(false));

  document.getElementById('orbEditBtn').addEventListener('click', () => setEditMode(!editMode));

  document.getElementById('orbPrev').addEventListener('click', () => goToSlide(currentSlideIndex-1, true));

  document.getElementById('orbNext').addEventListener('click', () => goToSlide(currentSlideIndex+1, true));

  document.getElementById('orbDots').addEventListener('click', e => {

    const d = e.target.closest('.orb-dot'); if (!d) return;

    goToSlide(parseInt(d.dataset.idx), true);

  });

  document.getElementById('orbSlides').addEventListener('click', e => {

    const car = document.getElementById('orbCarousel');

    if (car._wasDragging && car._wasDragging()) return;

    const wrap = e.target.closest('.orb-wrap'); if (!wrap) return;

    const slide = wrap.closest('.orb-slide'); if (!slide) return;

    const ch = slide.dataset.channel;

    if (editMode){ toggleMark(ch); return; }

    const list = getAllChannels();

    const idx = list.indexOf(ch);

    // Always toggle the voice users sidebar based on the live DOM state.

    // If the user clicks a different orb, slide to it first so the carousel

    // catches up — but the *open/closed* decision is the toggle, not a

    // forced "always open". This makes the third / fourth tap behave

    // exactly the same as the first / second.

    const side = document.getElementById('voiceUsersSidebar');

    const isOpenInDom = !!(side && side.classList.contains('open'));

    const movingSlide = idx >= 0 && idx !== currentSlideIndex;

    if (movingSlide) goToSlide(idx, true);

    // After a slide change we want the panel open (showing the new orb's

    // members); on a same-slide click we just flip whatever state the DOM is in.

    if (movingSlide) setVoiceUsers(true);

    else setVoiceUsers(!isOpenInDom);

  });

  document.getElementById('mcList').addEventListener('click', e => {

    const it = e.target.closest('.mc-item'); if (!it) return;

    const ch = it.dataset.channel;

    const idx = getAllChannels().indexOf(ch);

    if (idx>=0) goToSlide(idx, true);

  });

  // Voice user RIGHT-CLICK

  document.getElementById('voiceUsersInner').addEventListener('contextmenu', e => {

    const item = e.target.closest('[data-vu-user]'); if (!item) return;

    const userName = item.dataset.vuUser;

    const channelKey = item.dataset.vuCh;

    openVoiceUserCtx(e, userName, channelKey);

  });

  // Connect / mic / end

  document.getElementById('btnConnect').addEventListener('click', () => joinVoiceChannel(selectedSlideChannel));

  document.getElementById('orbEmptyCreateBtn').addEventListener('click', () => openCreateServer());

  document.getElementById('orbEmptyJoinBtn').addEventListener('click', () => { openCreateServer(); const joinTab = document.querySelector('[data-cs-tab="join"]'); if (joinTab) joinTab.click(); });

  document.getElementById('btnEnd').addEventListener('click', endVoiceCall);


  // ===== HOTKEY RECORDING + GLOBAL DISPATCH =====

  // Build a canonical combo string from a KeyboardEvent. Modifiers come

  // first in alphabetical order so the comparison is order-independent.

  function _comboFromEvent(e){

    if (!e.key) return null;

    const mods = [];

    if (e.ctrlKey)  mods.push('Ctrl');

    if (e.altKey)   mods.push('Alt');

    if (e.shiftKey) mods.push('Shift');

    if (e.metaKey)  mods.push('Meta');

    let key = e.key;

    // Modifier keys alone are not a valid shortcut.

    if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return null;

    // Normalise letters to upper-case, leave function/named keys alone.

    if (key.length === 1) key = key.toUpperCase();

    return mods.concat(key).join('+');

  }

  function _matchesCombo(e, combo){

    if (!combo) return false;

    return _comboFromEvent(e) === combo;

  }

  let _shortcutRecording = null;

  function _bindShortcutButton(btnId, settingKey, clearId){

    const btn = document.getElementById(btnId);

    const clr = document.getElementById(clearId);

    if (!btn) return;

    function paint(){

      const combo = voiceSettings[settingKey];

      btn.textContent = combo || 'Click and press a combo...';

      btn.classList.toggle('recording', _shortcutRecording === btn);

    }

    btn.addEventListener('click', () => {

      // Reset any other recording button before starting a new one.

      if (_shortcutRecording && _shortcutRecording !== btn){

        _shortcutRecording.classList.remove('recording');

      }

      _shortcutRecording = btn;

      btn.classList.add('recording');

      btn.textContent = 'Press combo or Esc to cancel';

    });

    if (clr) clr.addEventListener('click', () => {

      voiceSettings[settingKey] = null;

      _shortcutRecording = null;

      paint();

    });

    btn._paintShortcut = paint;

    paint();

  }

  _bindShortcutButton('vsMuteKey',   'muteHotkey',   'vsMuteClear');

  _bindShortcutButton('vsDeafenKey', 'deafenHotkey', 'vsDeafenClear');

  // Recording: capture mode so the chosen combo can include keys that

  // would otherwise be eaten by an input. Live dispatch: bubble mode +

  // skip when typing in input/textarea so normal typing isn't blocked.

  window.addEventListener('keydown', e => {

    if (!_shortcutRecording) return;

    if (e.key === 'Escape'){

      e.preventDefault();

      const btn = _shortcutRecording;

      _shortcutRecording = null;

      if (btn._paintShortcut) btn._paintShortcut();

      return;

    }

    const combo = _comboFromEvent(e);

    if (!combo) return;          // wait for a non-modifier key

    e.preventDefault(); e.stopPropagation();

    const btn = _shortcutRecording;

    const settingKey = btn.id === 'vsMuteKey' ? 'muteHotkey' : 'deafenHotkey';

    voiceSettings[settingKey] = combo;

    _shortcutRecording = null;

    if (btn._paintShortcut) btn._paintShortcut();

  }, true);

  // Live dispatch — runs in bubble phase, never blocks regular typing.

  document.addEventListener('keydown', e => {

    if (_shortcutRecording) return;

    const t = e.target;

    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    if (_matchesCombo(e, voiceSettings.muteHotkey)){

      e.preventDefault();

      const btnMic = document.getElementById('btnMic');

      if (btnMic && btnMic.style.display !== 'none') btnMic.click();

      return;

    }

    if (_matchesCombo(e, voiceSettings.deafenHotkey)){

      e.preventDefault();

      const btnDe = document.getElementById('btnDeafen');

      if (btnDe && btnDe.style.display !== 'none') btnDe.click();

      return;

    }

  });

  document.getElementById('btnMic').addEventListener('click', () => {

    muted = !muted;

    try { voice.mute(muted); } catch(_){}

    document.getElementById('btnMic').classList.toggle('muted-state', muted);

    document.getElementById('btnMic').innerHTML = muted ? '<i data-lucide="mic-off" style="width:14px;height:14px"></i>' : '<i data-lucide="mic" style="width:14px;height:14px"></i>';

    refreshIcons();

    if (voiceUsersSidebarOpen) renderVoiceUsers();

    showToast(muted?'Microphone muted':'Microphone live', muted?'warn':'success');

  });

  // Tracks whether the mic was already muted BEFORE deafen activated, so toggling deafen off

  // restores the previous mic state instead of always unmuting.

  let micMutedBeforeDeafen = false;

  document.getElementById('btnDeafen').addEventListener('click', () => {

    const btn = document.getElementById('btnDeafen');

    const m = document.getElementById('btnMic');

    if (!deafened){

      // Going INTO deafen: silence remote audio + mute own mic. Standard

      // convention across Discord/TS: deafen always pulls mic with it,

      // because if you can't hear, you usually shouldn't be talking either.

      deafened = true;

      micMutedBeforeDeafen = muted;

      btn.classList.add('muted-state');

      btn.innerHTML = '<i data-lucide="headphone-off" style="width:14px;height:14px"></i>';

      try { voice.deafen(true); } catch(_){}

      if (!muted){

        muted = true;

        try { voice.mute(true); } catch(_){}

        m.classList.add('muted-state');

        m.innerHTML = '<i data-lucide="mic-off" style="width:14px;height:14px"></i>';

      }

      showToast('Deafened — remote audio + mic silenced','warn');

    } else {

      // Going OUT of deafen: un-silence remote audio + restore mic to

      // whatever state it had before deafen activated.

      deafened = false;

      btn.classList.remove('muted-state');

      btn.innerHTML = '<i data-lucide="headphones" style="width:14px;height:14px"></i>';

      try { voice.deafen(false); } catch(_){}

      if (!micMutedBeforeDeafen){

        muted = false;

        try { voice.mute(false); } catch(_){}

        m.classList.remove('muted-state');

        m.innerHTML = '<i data-lucide="mic" style="width:14px;height:14px"></i>';

      }

      showToast(micMutedBeforeDeafen ? 'Remote audio on (mic still muted)' : 'Remote audio and mic on','success');

    }

    refreshIcons();

  });

  document.getElementById('btnSetup').addEventListener('click', openVoiceSettings);

  // Voice settings interactions

  document.getElementById('voiceSettingsBackdrop').addEventListener('mousedown', e => { if (e.target.id === 'voiceSettingsBackdrop') document.getElementById('voiceSettingsBackdrop').classList.remove('show'); });

  document.getElementById('vsInputSelect').addEventListener('change', e => voiceSettings.inputDevice = e.target.value);

  document.getElementById('vsOutputSelect').addEventListener('change', e => voiceSettings.outputDevice = e.target.value);

  document.getElementById('vsInputVol').addEventListener('input', e => { voiceSettings.inputVolume = parseInt(e.target.value); document.getElementById('vsInputVolLbl').textContent = voiceSettings.inputVolume+'%'; });

  document.getElementById('vsOutputVol').addEventListener('input', e => { voiceSettings.outputVolume = parseInt(e.target.value); document.getElementById('vsOutputVolLbl').textContent = voiceSettings.outputVolume+'%'; });

  document.getElementById('vsSens').addEventListener('input', e => { voiceSettings.sensitivity = parseInt(e.target.value); document.getElementById('vsSensLbl').textContent = voiceSettings.sensitivity+' dB'; });

  document.querySelectorAll('[data-vs-mode]').forEach(b => b.addEventListener('click', () => {

    voiceSettings.mode = b.dataset.vsMode;

    syncVoiceSettingsUI();

  }));

  document.getElementById('vsPttKey').addEventListener('click', e => {

    const btn = e.currentTarget;

    btn.textContent = 'Press a key...';

    const onKey = ev => {

      ev.preventDefault();

      const k = ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;

      voiceSettings.pttKey = k;

      btn.textContent = k;

      window.removeEventListener('keydown', onKey, true);

    };

    window.addEventListener('keydown', onKey, true);

  });

  // Each processing toggle re-creates the self-monitor stream when

  // it's active, so the user can hear the difference immediately.

  document.getElementById('vsEcho').addEventListener('change', async e => {

    voiceSettings.echo = e.target.checked;

    _saveVoiceSettings();

    _smApplyStrengths();

    if (inVoice && voice && voice.reconfigureMic) await voice.reconfigureMic();

  });

  document.getElementById('vsNoise').addEventListener('change', async e => {

    voiceSettings.noise = e.target.checked;

    _saveVoiceSettings();

    _smApplyStrengths();

    if (inVoice && voice && voice.reconfigureMic) await voice.reconfigureMic();

  });

  document.getElementById('vsAgc').addEventListener('change', async e => {

    voiceSettings.agc = e.target.checked;

    _saveVoiceSettings();

    _smApplyStrengths();

    if (inVoice && voice && voice.reconfigureMic) await voice.reconfigureMic();

  });

  // Strength sliders — dragged live during the playback test so the

  // user can dial in their preferred filter aggressiveness. Saved on

  // every change and re-applied via reconfigureMic() if a call is

  // active.

  const _wireStr = (sliderId, lblId, key) => {

    const s = document.getElementById(sliderId); const l = document.getElementById(lblId);

    if (!s) return;

    s.addEventListener('input', () => {

      voiceSettings[key] = Number(s.value);

      if (l) l.textContent = voiceSettings[key];

      _saveVoiceSettings();

      _smApplyStrengths();

    });

    s.addEventListener('change', () => {

      // Strength changes are applied live on the chain itself — no

      // need to re-acquire the mic. applyStrengths() pushes the new

      // value into the active call's Web Audio nodes immediately.

      if (inVoice && voice && voice.applyStrengths) voice.applyStrengths();

    });

  };

  _wireStr('vsEchoStr',  'vsEchoStrLbl',  'echoStr');

  _wireStr('vsNoiseStr', 'vsNoiseStrLbl', 'noiseStr');

  _wireStr('vsAgcStr',   'vsAgcStrLbl',   'agcStr');

  // Self-monitor: enable the local mic playback, with a separate volume

  // slider so the user can listen quietly while their actual call

  // volume stays at full.

  document.getElementById('vsSelfMon').addEventListener('change', async e => {

    voiceSettings.selfMon = e.target.checked;

    document.getElementById('vsSelfMonControls').style.display = voiceSettings.selfMon ? '' : 'none';

    if (voiceSettings.selfMon) await startSelfMonitor();

    else stopSelfMonitor();

  });

  document.getElementById('vsSelfMonVol').addEventListener('input', e => {

    voiceSettings.selfMonVolume = parseInt(e.target.value);

    document.getElementById('vsSelfMonVolLbl').textContent = voiceSettings.selfMonVolume+'%';

    if (_selfMonAudio) _selfMonAudio.volume = Math.max(0, Math.min(1, voiceSettings.selfMonVolume / 100));

  });

  // Closing the modal stops self-monitor so the mic light goes away

  // and the user doesn't accidentally leave it on while talking.

  document.querySelector('[data-close-smodal="voiceSettingsBackdrop"]').addEventListener('click', () => {

    voiceSettings.selfMon = false;

    const cb = document.getElementById('vsSelfMon'); if (cb) cb.checked = false;

    const ctl = document.getElementById('vsSelfMonControls'); if (ctl) ctl.style.display = 'none';

    stopSelfMonitor();

  });

  document.getElementById('vsSave').addEventListener('click', () => {

    // Save closes the modal too — kill self-monitor for the same reason.

    voiceSettings.selfMon = false;

    const cb = document.getElementById('vsSelfMon'); if (cb) cb.checked = false;

    const ctl = document.getElementById('vsSelfMonControls'); if (ctl) ctl.style.display = 'none';

    stopSelfMonitor();

    document.getElementById('voiceSettingsBackdrop').classList.remove('show');

    showToast('Voice settings saved','success');

  });

  // In-app confirm modal wiring

  // Server join modal

  document.getElementById('serverJoinBackdrop').addEventListener('mousedown', e => { if (e.target.id === 'serverJoinBackdrop') document.getElementById('serverJoinBackdrop').classList.remove('show'); });

  // Owner transfer wiring

  document.getElementById('ownerTransferBackdrop').addEventListener('mousedown', e => { if (e.target.id === 'ownerTransferBackdrop') document.getElementById('ownerTransferBackdrop').classList.remove('show'); });

  document.getElementById('ownerTransferSearch').addEventListener('input', e => renderOwnerTransferList(e.target.value));

  document.getElementById('ownerTransferList').addEventListener('click', e => {

    const pick = e.target.closest('[data-owner-pick]'); if (!pick) return;

    ownerTransferTarget = pick.dataset.ownerPick;

    const btn = document.getElementById('ownerTransferConfirm');

    btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = '';

    renderOwnerTransferList(document.getElementById('ownerTransferSearch').value);

  });

  document.getElementById('ownerTransferConfirm').addEventListener('click', () => {

    if (!ownerTransferTarget || !currentServer) return;

    const target = ownerTransferTarget;

    const s = servers[currentServer];

    appConfirm('Transfer ownership of "'+s.name+'" to '+target+'? This cannot be undone from your side.', {title:'TRANSFER OWNERSHIP', confirmLabel:'TRANSFER', danger:true}).then(async ok => {

      if (!ok) return;

      // Resolve target user id from the server's memberDetails.

      const md = (s.memberDetails || []).find(m => m.name === target);

      if (backend.isConfigured()){

        if (!md){ showToast('Cannot resolve member id','warn'); return; }

        const r = await backend.servers.transferOwnership(currentServer, md.id);

        if (r.offline){ showToast('Cannot reach the server','warn'); return; }

        if (r.error){ showToast('Could not transfer: '+r.error,'warn'); return; }

        Object.assign(s, r.server || {});

      }

      const owner = s.roles && s.roles.find(r => r.id === 'owner');

      if (owner) owner.members = [target];

      if (s.roles) s.roles.forEach(r => { if (r.id !== 'owner') r.members = (r.members||[]).filter(m => m !== target); });

      if (!s.admins.includes(target)) s.admins.unshift(target);

      const me = selfProfile.name;

      if (me && me !== target) s.admins = (s.admins||[]).filter(m => m !== me);

      isAdmin = (s.admins||[]).includes(me);

      document.getElementById('ownerTransferBackdrop').classList.remove('show');

      document.getElementById('coverBackdrop').classList.remove('show');

      if (typeof renderRolesList === 'function') renderRolesList();

      if (typeof renderRoleEditor === 'function') renderRoleEditor();

      renderServerOverview();

      showToast('Ownership transferred to '+target,'success');

    });

  });

  document.getElementById('sjJoinBtn').addEventListener('click', async () => {

    if (!pendingJoinCard) return;

    const card = pendingJoinCard;

    document.getElementById('serverJoinBackdrop').classList.remove('show');

    // Backend path: hit /servers/:keyOrId/join. Honour invite key when present.

    if (backend.isConfigured()){

      const keyOrId = card.invite || card.id;

      const r = await backend.servers.join

        ? await backend.servers.join(keyOrId)

        : await fetch(_backendBase()+'/servers/'+encodeURIComponent(keyOrId)+'/join', {

            method: 'POST',

            headers: {

              'Authorization': 'Bearer '+(backend.token.read()||''),

              'Content-Type': 'application/json'

            },

            body: '{}'

          }).then(x => x.json()).catch(()=>({offline:true}));

      if (r.offline){ showToast('Cannot reach the server','warn'); return; }

      if (r.error === 'private_server'){ showToast(card.name+' is private — try again later','warn'); pendingJoinCard = null; return; }

      if (r.error === 'not_found'){    showToast('Server not found','warn'); pendingJoinCard = null; return; }

      if (r.error){ showToast('Could not join: '+r.error,'warn'); pendingJoinCard = null; return; }

      servers[r.server.id] = r.server;

      if (!myServers.includes(r.server.id)) myServers.push(r.server.id);

      // Materialise channelData entries for every voice channel in the

      // newly-joined server so the orb UI can find them. Without this the

      // guest has to reload before joining a voice channel actually works.

      (r.server.voiceChannels || []).forEach(vc => {

        if (channelData[vc.id]) return;

        const st = voiceStyles[vc.style] || voiceStyles.indigo;

        const m = (st.glow||'rgba(99,102,241,0.4)').match(/rgba\((\d+),(\d+),(\d+),/);

        channelData[vc.id] = {

          name: vc.name, users: [],

          color: 'rgba('+(m?m[1]:99)+','+(m?m[2]:102)+','+(m?m[3]:241)+',',

          planetGrad: st.grad, atmoColor: st.glow, orbiterColor: st.c,

          avBorder:'#fff', emoji:'🪐',

          tier: st.skin ? 'legendary' : 'common', skin: st.skin || undefined

        };

      });

      // Pull the latest snapshot too so other server-scoped state (live voice

      // members, recent text-channel pin status) is up to date.

      if (typeof _hydrateAndRefresh === 'function') _hydrateAndRefresh().catch(()=>{});

      renderServerRails(); renderHomeMyServers();

      setPage('pageWorld'); selectServer(r.server.id);

      showToast(r.alreadyMember ? 'Opened '+r.server.name : 'Joined '+r.server.name, 'success');

      pendingJoinCard = null;

      return;

    }

    // Local-only fallback

    const existing = servers[card.id];

    if (existing){

      const alreadyIn = (existing.members||[]).includes(selfProfile.name);

      if (alreadyIn){

        setPage('pageWorld'); selectServer(card.id);

        pendingJoinCard = null;

        return;

      }

      if (existing.isPrivate){

        showToast(existing.name+' is private — try again later','warn');

        pendingJoinCard = null;

        return;

      }

      existing.members = (existing.members||[]).concat([selfProfile.name]);

      if (!myServers.includes(card.id)) myServers.push(card.id);

      renderServerRails(); renderHomeMyServers();

      setPage('pageWorld'); selectServer(card.id);

      showToast('Joined '+existing.name,'success');

      pendingJoinCard = null;

      return;

    }

    showToast('Server is no longer available','warn');

    pendingJoinCard = null;

  });

  // Channel/category settings modal

  document.getElementById('chanSettingsBackdrop').addEventListener('mousedown', e => { if (e.target.id === 'chanSettingsBackdrop') document.getElementById('chanSettingsBackdrop').classList.remove('show'); });

  document.querySelectorAll('[data-cs-vis]').forEach(b => b.addEventListener('click', () => setChanSettingsVis(b.dataset.csVis)));

  document.getElementById('chanSettingsRoles').addEventListener('click', e => {

    const chip = e.target.closest('[data-cs-role]'); if (!chip) return;

    chip.classList.toggle('on');

  });

  // Expand / collapse the per-role override panel.

  const _csPermsHead = document.getElementById('chanSettingsPermsHead');

  if (_csPermsHead){

    _csPermsHead.addEventListener('click', () => {

      const body  = document.getElementById('chanSettingsPerms');

      const label = document.getElementById('chanSettingsPermsToggle');

      const isOpen = body.style.display !== 'none';

      body.style.display = isOpen ? 'none' : 'flex';

      if (label) label.textContent = isOpen ? 'SHOW' : 'HIDE';

    });

  }

  // Click an Allow / Deny pill to toggle that role's send-message override.

  const _csPerms = document.getElementById('chanSettingsPerms');

  if (_csPerms){

    _csPerms.addEventListener('click', e => {

      const pill = e.target.closest('[data-ovr-role]'); if (!pill) return;

      _toggleSendOverride(pill.dataset.ovrRole, pill.dataset.ovrTarget);

    });

  }

  document.querySelectorAll('[data-cs-br]').forEach(btn => {

    btn.addEventListener('click', () => {

      document.querySelectorAll('[data-cs-br]').forEach(b => b.classList.toggle('active', b === btn));

      document.getElementById('chanSettingsBitrateLbl').textContent = btn.dataset.csBr + ' kbps';

    });

  });

  document.getElementById('chanSettingsSave').addEventListener('click', async () => {

    if (!currentServer || !chanSettingsTarget) return;

    const s = servers[currentServer]; const ent = getEntity(s, chanSettingsTarget); if (!ent) return;

    const newName = (document.getElementById('chanSettingsName').value||'').trim();

    const tType = chanSettingsTarget.type;

    // Resolve the new visibility from the modal first so we can send it in

    // the same patch as the rename, instead of two round trips.

    const visMode = document.querySelector('[data-cs-vis].active').dataset.csVis;

    let newVisible = null;

    if (visMode === 'all'){

      newVisible = null;

    } else {

      newVisible = Array.from(document.querySelectorAll('#chanSettingsRoles .cs-role-chip.on')).map(el => el.dataset.csRole);

    }

    if (backend.isConfigured()){

      const patch = {};

      if (newName) patch.name = (tType === 'voice') ? newName.toUpperCase() : newName;

      patch.visibleRoleIds = newVisible;

      // Send the per-role allow/deny maps too, but only for text channels —

      // categories + voice orbs don't surface the editor yet. Empty maps

      // send as null so the column actually clears, otherwise we'd happily

      // store {} forever.

      if (tType === 'text'){

        patch.permissionAllow = Object.keys(chanSettings_overrideAllow).length ? chanSettings_overrideAllow : null;

        patch.permissionDeny  = Object.keys(chanSettings_overrideDeny ).length ? chanSettings_overrideDeny  : null;

      }

      if (tType === 'voice'){

        const active = document.querySelector('[data-cs-br].active');

        if (active) patch.bitrate = Number(active.dataset.csBr);

      }

      let r = null;

      if (tType === 'text')      r = await backend.servers.patchTextChannel(currentServer, ent.id, patch);

      else if (tType === 'voice') r = await backend.servers.patchVoiceChannel(currentServer, ent.id, patch);

      // Category targets come in as type:'category' from the context menu;

      // accept the legacy 'cat' alias too in case anything still emits it.

      else if (tType === 'category' || tType === 'cat') r = await backend.servers.patchCategory(currentServer, ent.id, patch);

      if (r && r.error){ showToast('Could not save: '+r.error,'warn'); return; }

      if (r && r.offline){ showToast('Cannot reach the server','warn'); return; }

    }

    if (newName){

      ent.name = (tType === 'voice') ? newName.toUpperCase() : newName;

      if (tType === 'voice'){

        const chKey = vcChannelKey(ent);

        if (channelData[chKey]) channelData[chKey].name = newName.toUpperCase();

      }

    }

    ent.visibleRoleIds = newVisible;

    if (tType === 'text'){

      ent.permissionAllow = Object.keys(chanSettings_overrideAllow).length ? chanSettings_overrideAllow : null;

      ent.permissionDeny  = Object.keys(chanSettings_overrideDeny ).length ? chanSettings_overrideDeny  : null;

    }

    document.getElementById('chanSettingsBackdrop').classList.remove('show');

    showToast('Settings saved','success');

    renderServerOverview();

    renderHomeMarkedOrbits();

    renderOrbSlides();

    if (voiceUsersSidebarOpen) renderVoiceUsers();

  });

  document.getElementById('confirmYes').addEventListener('click', () => _confirmDone(true));

  document.getElementById('confirmNo').addEventListener('click', () => _confirmDone(false));

  document.getElementById('confirmBackdrop').addEventListener('mousedown', e => { if (e.target.id === 'confirmBackdrop') _confirmDone(false); });

  // DM list & tabs

  document.getElementById('dmItems').addEventListener('click', e => {

    const star = e.target.closest('[data-dm-star]');

    if (star){ e.stopPropagation(); toggleFriendMark(star.dataset.dmStar); return; }

    const checkBtn = e.target.closest('[data-dm-list-check]');

    if (checkBtn){

      e.stopPropagation();

      const key = checkBtn.dataset.dmListCheck;

      if (conversations[key] && conversations[key].isSaved) return;

      if (dmListSelectedKeys.has(key)) dmListSelectedKeys.delete(key);

      else dmListSelectedKeys.add(key);

      document.getElementById('dmItems').classList.toggle('has-selection', dmListSelectedKeys.size > 0);

      renderDmList();

      renderDmListSelectionBar();

      return;

    }

    const it = e.target.closest('.dm-item'); if (!it) return;

    const key = it.dataset.conv;

    if (dmListSelectedKeys.size > 0){

      if (conversations[key] && conversations[key].isSaved){ openConversation(key); return; }

      if (dmListSelectedKeys.has(key)) dmListSelectedKeys.delete(key);

      else dmListSelectedKeys.add(key);

      document.getElementById('dmItems').classList.toggle('has-selection', dmListSelectedKeys.size > 0);

      renderDmList();

      renderDmListSelectionBar();

      return;

    }

    openConversation(key);

  });

  function renderDmListSelectionBar(){

    let bar = document.getElementById('dmListSelBar');

    if (dmListSelectedKeys.size === 0){ if (bar) bar.style.display = 'none'; return; }

    if (!bar){

      bar = document.createElement('div');

      bar.id = 'dmListSelBar';

      bar.className = 'dm-selection-bar';

      bar.innerHTML =

        '<button class="dm-sel-cancel" id="dmListSelCancel"><i data-lucide="x" style="width:13px;height:13px"></i></button>'+

        '<div class="dm-sel-count" id="dmListSelCount">0 selected</div>'+

        '<button class="dm-sel-delete" id="dmListSelDelete"><i data-lucide="trash-2" style="width:13px;height:13px"></i>DELETE</button>';

      const list = document.querySelector('.dm-list');

      list.insertBefore(bar, list.firstChild);

      document.getElementById('dmListSelCancel').addEventListener('click', () => {

        dmListSelectedKeys.clear();

        document.getElementById('dmItems').classList.remove('has-selection');

        renderDmList();

        renderDmListSelectionBar();

      });

      document.getElementById('dmListSelDelete').addEventListener('click', () => {

        // Saved Messages can never be deleted from the DM list.

        const targets = Array.from(dmListSelectedKeys).filter(k => !(conversations[k] && conversations[k].isSaved));

        if (!targets.length){ showToast('Saved Messages cannot be removed','warn'); return; }

        appConfirm('Remove '+targets.length+' chat(s) from this list? Messages and pins with these contacts will be wiped, but they remain in your friends list.', {title:'REMOVE FROM DMS', confirmLabel:'REMOVE', danger:true}).then(ok => {

          if (!ok) return;

          targets.forEach(k => {

            // Hide from DM list AND wipe history with this contact (friend stays).

            dmListHidden.add(k);

            messages[k] = [];

            dmPinnedByConv[k] = null;

            if (conversations[k]) conversations[k].unread = 0;

            // Persist the one-sided clear server-side so reloading doesn't

            // resurrect the messages from the backend's preview / history.

            if (backend.isConfigured() && k !== 'saved'){

              backend.dms.clear(k).catch(()=>{});

            }

            if (currentConversation === k){

              currentConversation = null;

              document.getElementById('dmEmpty').style.display = 'flex';

              document.getElementById('dmHead').style.display = 'none';

              document.getElementById('dmMsgs').style.display = 'none';

              document.getElementById('dmInputWrap').style.display = 'none';

            }

          });

          showToast(targets.length+' chat(s) removed from DMs','warn');

          dmListSelectedKeys.clear();

          document.getElementById('dmItems').classList.remove('has-selection');

          renderDmList();

          renderDmListSelectionBar();

          renderHomeFriends();

          renderMarkedPanel();

          updateBadges();

        });

      });

      refreshIcons();

    }

    bar.style.display = 'flex';

    document.getElementById('dmListSelCount').textContent = dmListSelectedKeys.size + ' selected';

  }

  document.getElementById('dmListFilter').addEventListener('input', renderDmList);

  document.querySelectorAll('.dm-tab').forEach(t => t.addEventListener('click', () => {

    activeDmTab = t.dataset.tab;

    document.querySelectorAll('.dm-tab').forEach(x => x.classList.toggle('active', x === t));

    renderDmList();

  }));

  document.getElementById('dmHeadAv').addEventListener('click', () => { if (currentConversation) openProfile(currentConversation); });

  // DM voice call

  document.getElementById('dmCallBtn').addEventListener('click', () => {

    if (!currentConversation) return;

    const c = conversations[currentConversation]; if (!c) return;

    if (c.isSaved){ showToast('Cannot call Saved Messages','warn'); return; }

    showToast('Calling '+c.name+'...','success');

  });

  // DM 3-dot menu

  document.getElementById('dmMoreBtn').addEventListener('click', e => {

    e.stopPropagation();

    if (!currentConversation) return;

    const conv = conversations[currentConversation];

    const isSaved = conv && conv.isSaved;

    const blocked = isBlocked(currentConversation);

    const items = [

      { icon:'check-square', label:'Select messages', action:()=>{ enterDmSelectMode(); } },

      { icon:'eraser',       label:'Clear chat',      action:()=>{ appConfirm('Clear all messages with this contact?', {title:'CLEAR CHAT', confirmLabel:'CLEAR', danger:true}).then(ok => { if (ok) clearDmChat(); }); } },

      { sep:true },

      { icon:'bell-off',     label:'Mute notifications', action:()=>{ showToast('Muted','warn'); } }

    ];

    if (!isSaved){

      items.push({

        icon: blocked ? 'shield' : 'user-x',

        label: blocked ? 'Unblock user' : 'Block user',

        danger: !blocked,

        action: () => {

          if (blocked){ unblockUser(currentConversation); showToast('Unblocked '+(conv?conv.name:''),'success'); }

          else {

            appConfirm('Block '+(conv?conv.name:'this user')+'? You won\'t be able to message each other.', {title:'BLOCK USER', confirmLabel:'BLOCK', danger:true}).then(ok => {

              if (!ok) return;

              blockUser(currentConversation);

              if (typeof renderFriendsLists === 'function') renderFriendsLists();

              showToast('Blocked '+(conv?conv.name:''),'warn');

            });

          }

        }

      });

    }

    openPortalMenu(e.currentTarget, items);

  });

  document.getElementById('dmSearchInChatBtn').addEventListener('click', () => showToast('Search-in-chat coming soon','warn'));

  // DM input

  const dmInputEl = document.getElementById('dmInput');

  dmInputEl.addEventListener('input', e => {

    autoResizeInput(e.target); updateSendBtn();

    // Push a typing event to the current peer at most once every 2.5s.

    // The receiving client's _onTyping auto-clears the indicator after 4s,

    // so we only need to keep ticking while the user is actively typing.

    if (!currentConversation || currentConversation === 'saved') return;

    if (!conversations[currentConversation] || conversations[currentConversation].isSaved) return;

    const now = Date.now();

    if (!_dmTypingLastSent || now - _dmTypingLastSent > 2500){

      _dmTypingLastSent = now;

      const handle = conversations[currentConversation].handle;

      if (handle) wsSend({ type:'typing', to: handle });

    }

  });

  let _dmTypingLastSent = 0;

  dmInputEl.addEventListener('keydown', e => {

    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendDM(); }

    if (e.key === 'Escape'){ if (dmEditingId) cancelEdit(); else if (dmReplyTo) cancelReply(); }

  });

  document.getElementById('dmSend').addEventListener('click', sendDM);

  // World empty-state actions

  document.getElementById('worldEmptyCreate').addEventListener('click', () => openCreateServer());

  document.getElementById('worldEmptyJoin').addEventListener('click', () => { openCreateServer(); const joinTab = document.querySelector('[data-cs-tab="join"]'); if (joinTab) joinTab.click(); });

  // Reply / edit close

  document.getElementById('dmReplyClose').addEventListener('click', cancelReply);

  document.getElementById('dmEditClose').addEventListener('click', cancelEdit);

  document.getElementById('dmAttachClose').addEventListener('click', clearDmAttach);

  // Attach

  document.getElementById('dmAttachBtn').addEventListener('click', () => document.getElementById('dmFileInput').click());

  document.getElementById('dmFileInput').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) setDmAttach(f); });

  // DM message: bubble click → show actions; image click → viewer; reply preview click → jump

  document.getElementById('dmMsgs').addEventListener('click', e => {

    // Server card -> open the join confirmation modal.

    const scJoinDm = e.target.closest('[data-server-card-join]');

    if (scJoinDm){

      e.stopPropagation();

      try { openServerJoinModal(JSON.parse(decodeURIComponent(scJoinDm.dataset.serverCardJoin))); } catch(_){}

      return;

    }

    const ccOpenDm = e.target.closest('[data-channel-card-open]');

    if (ccOpenDm){ e.stopPropagation(); handleChannelCardOpen(ccOpenDm.dataset.channelCardOpen); return; }

    const ucOpenDm = e.target.closest('[data-user-card-open]');

    if (ucOpenDm){ e.stopPropagation(); handleUserCardOpen(ucOpenDm.dataset.userCardOpen); return; }

    // Tapping a message avatar opens that sender's profile.

    const av = e.target.closest('.dm-msg-av');

    if (av){

      e.stopPropagation();

      const row = av.closest('[data-msg-row]');

      if (!row) return;

      const m = findMsg(row.dataset.msgRow); if (!m) return;

      if (m.sender === 'me') openProfile(null);

      else { const conv = conversations[currentConversation]; if (conv) openProfileByName(conv.name); }

      return;

    }

    // In selection mode: tapping a message row toggles selection.

    if (dmSelectMode){

      const row = e.target.closest('[data-msg-row]');

      if (row){ e.stopPropagation(); toggleDmSelect(row.dataset.msgRow); return; }

    }

    // Image

    const img = e.target.closest('.dm-bubble-img');

    if (img){

      const id = img.dataset.msgId;

      const m = findMsg(id);

      if (m && m.src){

        const conv = conversations[currentConversation];

        openImageViewer(m.src, { sender: m.sender==='me'?'You':conv.name, time: m.time, av: m.sender==='me'?'linear-gradient(135deg,#22c55e,#15803d)':conv.avColor });

      }

      return;

    }

    // Pinned-banner X (must run BEFORE [data-jump-to] check, since X sits inside the banner).

    const pinX = e.target.closest('.dm-pinned-x');

    if (pinX){

      e.stopPropagation();

      if (currentConversation){

        dmPinnedByConv[currentConversation] = null;

        if (backend.isConfigured() && currentConversation !== 'saved'){

          backend.dms.pin(currentConversation, null).catch(()=>{});

        }

        renderConversation();

        showToast('Unpinned','warn');

      }

      return;

    }

    // Reply preview jump

    const rp = e.target.closest('[data-jump-to]');

    if (rp){

      e.stopPropagation();

      const tid = rp.dataset.jumpTo;

      const row = document.querySelector('[data-msg-row="'+tid+'"]');

      if (row){

        row.scrollIntoView({behavior:'smooth', block:'center'});

        row.style.transition = 'background 0.4s';

        row.style.background = 'rgba(185,28,74,0.18)';

        setTimeout(()=>{ row.style.background = ''; }, 1200);

      }

      return;

    }

    // Touch-friendly toggle: tapping the bubble body (not avatar / action

    // button / image / link) opens the action toolbar. Tapping the same

    // bubble again or anywhere else closes it. This makes Reply / Edit /

    // Copy / Delete reachable on iOS / Android where :hover doesn't fire.

    const bubbleTap = e.target.closest('.dm-bubble');

    if (bubbleTap && !e.target.closest('.dm-bubble-hover-actions, .dm-bubble-img, .dm-msg-av, button, a, [data-jump-to]')){

      const row = bubbleTap.closest('.dm-msg[data-msg-row]');

      if (row){

        e.stopPropagation();

        const wasOpen = row.classList.contains('actions-open');

        document.querySelectorAll('.dm-msg.actions-open').forEach(r => r.classList.remove('actions-open'));

        if (!wasOpen) row.classList.add('actions-open');

        return;

      }

    }

    // Hover actions click handler (delegated within dm-msgs)

    // Both hover-toolbar buttons and the X on the pinned banner share [data-msg-action]

    const actBtn = e.target.closest('[data-msg-action]');

    if (actBtn){

      e.stopPropagation();

      const action = actBtn.dataset.msgAction;

      const id = actBtn.dataset.msgId;

      const m = findMsg(id);

      if (action === 'reply'){ setReply(id); }

      else if (action === 'edit'){ setEdit(id); }

      else if (action === 'delete'){ deleteMsg(id); }

      else if (action === 'copy'){ copyMsg(id); }

      else if (action === 'forward'){ if (m) openForwardModal(m); }

      else if (action === 'pin'){

        if (!currentConversation) return;

        const cur = dmPinnedByConv[currentConversation];

        const wasPinned = cur !== undefined && cur !== null && String(cur) === String(id);

        const next = wasPinned ? null : id;

        dmPinnedByConv[currentConversation] = next;

        if (backend.isConfigured() && currentConversation !== 'saved'){

          backend.dms.pin(currentConversation, next).catch(()=>{});

        }

        showToast(wasPinned ? 'Unpinned' : 'Pinned to chat', wasPinned ? 'warn' : 'success');

        renderConversation();

      }

      else if (action === 'download-img'){ if (m && m.src){ const a = document.createElement('a'); a.href = m.src; a.download = 'image-'+id+'.png'; a.click(); showToast('Image saved','success'); } }

      return;

    }

  });

  // Home friends row

  document.getElementById('homeFriendsRow').addEventListener('click', e => {

    if (e.target.closest('#addFriendBtn')){ document.getElementById('addFriendBackdrop').classList.add('show'); setTimeout(()=>document.getElementById('addFriendInput').focus(),100); return; }

    const fb = e.target.closest('[data-conv]');

    if (fb){ setPage('pageMessages'); openConversation(fb.dataset.conv); }

  });

  // Marked panel (home — marked friends + channels)

  document.querySelectorAll('.mp-tab').forEach(t => t.addEventListener('click', () => { markedPanelTab = t.dataset.mpTab; renderMarkedPanel(); }));

  document.getElementById('markedPanelList').addEventListener('click', e => {

    const unstarF = e.target.closest('[data-mp-unstar-friend]');

    if (unstarF){ e.stopPropagation(); toggleFriendMark(unstarF.dataset.mpUnstarFriend); return; }

    const unstarC = e.target.closest('[data-mp-unstar-tc]');

    if (unstarC){

      e.stopPropagation();

      const [sid, tcId] = unstarC.dataset.mpUnstarTc.split('__');

      toggleChannelMark(sid, tcId); return;

    }

    const friendRow = e.target.closest('[data-mp-friend]');

    if (friendRow){ setPage('pageMessages'); openConversation(friendRow.dataset.mpFriend); return; }

    const tcRow = e.target.closest('[data-mp-tc]');

    if (tcRow){

      const [sid, tcId] = tcRow.dataset.mpTc.split('__');

      setPage('pageWorld'); selectServer(sid); openTextChannel(tcId);

    }

  });

  // Home marked orbits — tap = join that voice channel (and slide it into

  // view in the orb carousel). Tapping the card a second time while already

  // connected acts as a disconnect via joinVoiceChannel's internal toggle.

  document.getElementById('homeMarkedOrbits').addEventListener('click', e => {

    const c = e.target.closest('[data-mark-card]'); if (!c) return;

    const ch = c.dataset.markCard;

    if (!channelData[ch]) return;

    const idx = getAllChannels().indexOf(ch);

    if (idx>=0) goToSlide(idx, true);

    if (typeof joinVoiceChannel === 'function') joinVoiceChannel(ch);

    else setVoiceUsers(true);

  });

  // Home my-servers row → jump to that server in WORLD

  document.getElementById('homeMyServers').addEventListener('click', e => {

    const c = e.target.closest('[data-my-server]'); if (!c) return;

    const sid = c.dataset.myServer;

    setPage('pageWorld');

    selectServer(sid);

  });

  // (Recent activity removed)

  // POPUPS WIRING

  document.querySelectorAll('[data-popup]').forEach(b => {

    b.addEventListener('click', e => {

      e.stopPropagation();

      const popupId = b.dataset.popup;

      if (popupId === 'emojiPop'){

        if (b.id === 'dmEmojiBtn') emojiTargetInput = document.getElementById('dmInput');

        else if (b.id === 'worldEmojiBtn') emojiTargetInput = document.getElementById('worldInput');

        else if (b.closest('#wsChannelView')) emojiTargetInput = document.getElementById('wsChannelInput');

      }

      toggleAnchoredPopup(popupId, b);

    });

  });

  document.querySelectorAll('[data-close-popup]').forEach(b => { b.addEventListener('click', closeAllPopups); });

  document.getElementById('popupBackdrop').addEventListener('click', closeAllPopups);

  document.addEventListener('mousedown', e => {

    const insidePopup = e.target.closest('.popup');

    const onTrigger = e.target.closest('[data-popup]');

    if (!insidePopup && !onTrigger){ if (document.querySelector('.popup.show')) closeAllPopups(); }

    // Hide bubble actions when clicking outside

    const insideBA = e.target.closest('#bubbleActions');

    const insideBubble = e.target.closest('.dm-bubble');

    const insideMsgRow = e.target.closest('.dm-msg, .dm-bubble-hover-actions');

    if (!insideBA && !insideBubble && document.getElementById('bubbleActions').classList.contains('show')) hideBubbleActions();

    // Close any tap-opened DM action toolbar when clicking outside the row.

    // We treat the message row (which contains the bubble AND the floating

    // toolbar) as the safe area, otherwise tapping a Copy/Edit button —

    // which lives on top of the bubble, not inside it — would close the

    // toolbar before the click handler had a chance to run.

    if (!insideMsgRow){

      document.querySelectorAll('.dm-msg.actions-open').forEach(r => r.classList.remove('actions-open'));

    }

    // Hide ctx menu

    if (!e.target.closest('#ctxMenu')) hideCtxMenu();

    // Close banner settings menu when clicking outside

    if (bannerMenuEl && !e.target.closest('.banner-portal-menu') && !e.target.closest('[data-srv-action="banner-menu-toggle"]')){

      closeBannerMenu();

    }

  });

  window.addEventListener('scroll', hideBubbleActions, true);

  window.addEventListener('resize', hideBubbleActions);

  document.getElementById('dmMsgs').addEventListener('scroll', hideBubbleActions);

  // Long-press a DM bubble to enter selection mode and pre-select that message.

  attachLongPress(document.getElementById('dmMsgs'), '.dm-msg[data-msg-row]', el => {

    const id = el.dataset.msgRow;

    if (!dmSelectMode) enterDmSelectMode();

    if (id) toggleDmSelect(id);

  }, { delay: 500 });

  attachLongPress(document.getElementById('wsChannelMsgs'), '[data-ch-msg]', el => {

    const id = parseInt(el.dataset.chMsg);

    if (!chSelectMode) enterChSelectMode();

    if (!isNaN(id)) toggleChSelect(id);

  }, { delay: 500 });

  // Notifications

  document.getElementById('notifList').addEventListener('click', e => {

    const it = e.target.closest('.notif-item'); if (!it) return;

    const id = parseInt(it.dataset.notifId);

    const n = notifications.find(x=>x.id===id);

    if (n){ n.unread = false; }

    updateBadges();

    renderNotifications();

  });

  document.getElementById('notifMarkRead').addEventListener('click', e => {

    e.stopPropagation();

    notifications.forEach(n => n.unread = false);

    renderNotifications();

    updateBadges();

    showToast('All notifications marked as read','success');

  });

  // Friend request popup actions (from taskbar popup)

  document.getElementById('reqList').addEventListener('click', e => {

    const btn = e.target.closest('[data-req-action]'); if (!btn) return;

    const id = parseInt(btn.dataset.reqId);

    const r = friendRequests.incoming.find(x=>x.id===id); if (!r) return;

    if (btn.dataset.reqAction === 'accept'){

      showToast(r.name+' is now your friend','success');

      const k = r.name.toLowerCase();

      if (!conversations[k]){

        conversations[k] = { name:r.name, online:false, unread:0, avColor:r.avColor, initial:r.initial, handle:r.handle, bio:'New friend.', stats:{posts:0,friends:1,orbits:0}, location:'UNKNOWN', joined:'NOW', lastSeen:'just now', rank:'EXPLORER', orbColor:'#818cf8', orbGrad:'radial-gradient(circle at 35% 30%,rgba(255,255,255,0.5),#818cf8 55%,#1e1b4b)' };

        messages[k] = [];

      }

      addFriend(k);

      renderDmList();

      renderHomeFriends();

      if (typeof renderFriendsLists === 'function') renderFriendsLists();

    } else { showToast(r.name+' declined','warn'); }

    friendRequests.incoming = friendRequests.incoming.filter(x=>x.id!==id);

    renderRequestsPopup();

    renderFriendRequestsHome();

    updateBadges();

  });

  // Calendar removed

  // Emoji

  document.getElementById('emojiPop').addEventListener('click', e => {

    e.stopPropagation();

    const tab = e.target.closest('[data-emoji-cat]');

    if (tab){ activeEmojiCat = tab.dataset.emojiCat; renderEmojiPicker(); return; }

    const cell = e.target.closest('[data-emoji]');

    if (cell && emojiTargetInput){

      const start = emojiTargetInput.selectionStart||emojiTargetInput.value.length;

      const v = emojiTargetInput.value;

      emojiTargetInput.value = v.slice(0,start) + cell.dataset.emoji + v.slice(start);

      emojiTargetInput.focus();

      autoResizeInput(emojiTargetInput);

      if (emojiTargetInput.id==='dmInput') updateSendBtn();

      if (emojiTargetInput.id==='worldInput') updateWorldSendBtn();

    }

  });

  // Search

  document.getElementById('homeSearchBtn').addEventListener('click', openSearchOverlay);

  document.getElementById('dmSearchBtn').addEventListener('click', openSearchOverlay);

  document.getElementById('worldSearchBtn').addEventListener('click', openSearchOverlay);

  document.getElementById('searchOverlay').addEventListener('mousedown', e => { if (e.target.id === 'searchOverlay') closeSearchOverlay(); });

  document.getElementById('searchInput').addEventListener('input', e => renderSearchResults(e.target.value));

  document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key==='Escape') closeSearchOverlay(); });

  document.getElementById('searchResults').addEventListener('click', e => {

    const fr = e.target.closest('[data-search-friend]');

    if (fr){ closeSearchOverlay(); setPage('pageMessages'); openConversation(fr.dataset.searchFriend); return; }

    const ch = e.target.closest('[data-search-channel]');

    if (ch){ closeSearchOverlay(); const idx = getAllChannels().indexOf(ch.dataset.searchChannel); if (idx>=0) goToSlide(idx, true); return; }

    const pg = e.target.closest('[data-search-page]');

    if (pg){ closeSearchOverlay(); setPage(pg.dataset.searchPage); }

  });

  // Image viewer

  document.getElementById('imgViewClose').addEventListener('click', closeImageViewer);

  document.getElementById('imgViewStage').addEventListener('click', e => {

    if (e.target.id !== 'imgViewImg' && e.target.id !== 'imgViewStage') return;

    if (imgZoomLevel === 1){ imgZoomLevel = 2; } else { imgZoomLevel = 1; }

    updateImgZoom();

  });

  document.getElementById('imgViewZoomIn').addEventListener('click', e => { e.stopPropagation(); imgZoomLevel = Math.min(4, imgZoomLevel+0.25); updateImgZoom(); });

  document.getElementById('imgViewZoomOut').addEventListener('click', e => { e.stopPropagation(); imgZoomLevel = Math.max(0.5, imgZoomLevel-0.25); updateImgZoom(); });

  document.getElementById('imgViewReset').addEventListener('click', e => { e.stopPropagation(); imgZoomLevel = 1; updateImgZoom(); });

  document.getElementById('imgViewDownload').addEventListener('click', e => {

    e.stopPropagation();

    const img = document.getElementById('imgViewImg');

    const a = document.createElement('a'); a.href = img.src; a.download = 'nexus-image.png'; a.click();

    showToast('Image saved','success');

  });

  document.getElementById('imgViewForward').addEventListener('click', e => {

    e.stopPropagation();

    if (imgViewCurrentMsg){

      const src = document.getElementById('imgViewImg').src;

      closeImageViewer();

      openForwardModal({ type:'image', src:src });

    }

  });

  // Forward

  document.getElementById('fwdList').addEventListener('click', e => {

    const it = e.target.closest('[data-fwd-target]'); if (!it) return;

    const k = it.dataset.fwdTarget;

    if (fwdSelectedTargets.has(k)) fwdSelectedTargets.delete(k);

    else fwdSelectedTargets.add(k);

    renderFwdList();

    updateFwdFoot();

  });

  document.getElementById('fwdFilter').addEventListener('input', renderFwdList);

  document.getElementById('fwdSendBtn').addEventListener('click', e => { e.stopPropagation(); executeForward(); });

  // Copy invite token from the share-server flow.

  document.getElementById('fwdInviteCopy').addEventListener('click', async e => {

    e.stopPropagation();

    const inp = document.getElementById('fwdInviteInput');

    if (!inp.value || inp.classList.contains('is-disabled')) return;

    const ok = await copyToClipboardSafe(inp.value);

    showToast(ok ? 'Invite copied' : 'Could not copy invite', ok ? 'success' : 'warn');

  });

  document.getElementById('forwardBackdrop').addEventListener('mousedown', e => { if (e.target.id === 'forwardBackdrop') closeForwardModal(); });

  // Backdrop close for smodals

  ['addFriendBackdrop','createServerBackdrop','createChannelBackdrop','addPinBackdrop'].forEach(id => {

    document.getElementById(id).addEventListener('mousedown', e => { if (e.target.id === id) document.getElementById(id).classList.remove('show'); });

  });

  // Global ESC + Cmd/Ctrl+K + Enter on auth fields.

  document.addEventListener('keydown', e => {

    // Enter on the auth modal — same effect as clicking SIGN IN /

    // CREATE ACCOUNT. Without this the user has to mouse over to the

    // submit button after typing the password.

    if (e.key === 'Enter' && document.getElementById('authBackdrop').classList.contains('show')){

      const target = e.target;

      const isAuthInput = target && (target.id === 'authEmail' || target.id === 'authPassword'

        || target.id === 'authName' || target.id === 'authHandle');

      if (isAuthInput){

        e.preventDefault();

        document.getElementById('authSubmit').click();

      }

      return;

    }

    if (e.key === 'Escape'){

      if (document.getElementById('imgView').classList.contains('show')) closeImageViewer();

      else if (document.getElementById('searchOverlay').classList.contains('show')) closeSearchOverlay();

      else if (document.getElementById('profileModalBackdrop').classList.contains('show')) closeProfile();

      else if (document.getElementById('forwardBackdrop').classList.contains('show')) closeForwardModal();

      else if (document.querySelector('.modal-backdrop.show')){

        // Don't let Escape dismiss the auth gate. Until login completes

        // there's no usable dashboard underneath; closing the modal would

        // expose a half-empty page. Every other modal closes normally.

        document.querySelectorAll('.modal-backdrop.show').forEach(m => {

          if (m.id !== 'authBackdrop') m.classList.remove('show');

        });

      }

      // Esc inside an open text channel: step out to the server main page.

      // From server main, step out to home. From DM thread, step out to

      // the DM list. Each press unwinds one nav level the way browser

      // back would, but stays inside the SPA.

      else if (document.getElementById('pageWorld').classList.contains('active') && currentTextChannel){

        goToServerMain();

      }

      else if (document.getElementById('pageWorld').classList.contains('active') && currentServer){

        currentServer = null;

        currentTextChannel = null;

        try { localStorage.removeItem('orblood:lastServer'); } catch(_){}

        setPage('pageHome');

      }

      else if (document.getElementById('pageMessages').classList.contains('active') && currentConversation){

        // First Esc: close the open thread but stay on DMs.

        currentConversation = null;

        document.getElementById('dmEmpty').style.display = 'flex';

        document.getElementById('dmHead').style.display = 'none';

        document.getElementById('dmMsgs').style.display = 'none';

        document.getElementById('dmInputWrap').style.display = 'none';

        renderDmList();

      }

      else if (document.getElementById('pageMessages').classList.contains('active')){

        // Second Esc on DMs (no open thread): step out to home.

        setPage('pageHome');

      }

      else { hideBubbleActions(); hideCtxMenu(); closeAllPopups(); }

    }

    if ((e.ctrlKey||e.metaKey) && e.key === 'k'){ e.preventDefault(); openSearchOverlay(); }

  });

  // ============== INIT ==============

  renderOrbSlides();

  renderDmList();

  renderWorldMessages();

  renderHomeFriends();

  renderHomeMarkedOrbits();

  renderHomeMyServers();

  renderMarkedPanel();

  renderFriendRequestsHome();

  renderServerRails();

  updateBadges();

  updateConnBanner();

  refreshSelfAvatarsEverywhere();

  refreshIcons();

  // Auth bootstrap: gate the app behind a sign-in/sign-up modal on first run.

  bootAuth();

  function refreshHomeGreeting(){

    const h = new Date().getHours();

    const name = (selfProfile.name || 'EXPLORER').toUpperCase();

    let g = 'GOOD EVENING, '+name;

    if (h<12) g = 'GOOD MORNING, '+name;

    else if (h<18) g = 'GOOD AFTERNOON, '+name;

    else if (h>=22 || h<5) g = 'GOOD NIGHT, '+name;

    const el = document.getElementById('greetGreeting'); if (el) el.textContent = g;

  }

  refreshHomeGreeting();

  refreshHomeHeroIdentity();

  document.getElementById('homeHeroToggle').addEventListener('click', () => {

    const next = !readHomeHeroOn();

    writeHomeHeroOn(next);

    refreshHomeHeroIdentity();

    showToast(next ? 'Profile preview enabled' : 'Profile preview hidden','success');

  });

  refreshIcons();

  let attempts = 0;

  const iconIt = setInterval(()=>{

    attempts++;

    if (window.lucide && window.lucide.createIcons){ try { window.lucide.createIcons(); } catch(e){} if (attempts > 4) clearInterval(iconIt); }

    if (attempts > 30) clearInterval(iconIt);

  }, 200);

  // (Removed: a demo timer that randomly flipped 'typing' on online

  // conversations every 9s. Real typing indicators come from WS 'typing'

  // events handled by _onTyping().)

  (function setupAsyncButtonUI(){

    const ARM_WINDOW_MS = 80;

    const MIN_VISIBLE_MS = 220;

    let armedBtn = null;

    let armedAt = 0;

    const startedAt = new WeakMap();

    function startBtnLoading(btn){

      if (!btn || btn.classList.contains('is-loading')) return;

      btn.classList.add('is-loading');

      btn.setAttribute('aria-busy','true');

      startedAt.set(btn, performance.now());

    }

    function stopBtnLoading(btn){

      if (!btn || !btn.classList.contains('is-loading')) return;

      const elapsed = performance.now() - (startedAt.get(btn) || 0);

      const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

      setTimeout(()=>{

        btn.classList.remove('is-loading');

        btn.removeAttribute('aria-busy');

      }, wait);

    }

    window.startBtnLoading = startBtnLoading;

    window.stopBtnLoading = stopBtnLoading;

    document.addEventListener('click', (e)=>{

      const btn = e.target && e.target.closest && e.target.closest('button, .sm-btn, .ph-icon-btn, .ob, .ob-empty-btn, .auth-tab, [role="button"]');

      if (!btn || btn.disabled) return;

      armedBtn = btn;

      armedAt = performance.now();

      setTimeout(()=>{ if (armedBtn === btn && performance.now() - armedAt >= ARM_WINDOW_MS) armedBtn = null; }, ARM_WINDOW_MS + 5);

    }, true);

    const origFetch = window.fetch.bind(window);

    window.fetch = function(...args){

      let trackedBtn = null;

      if (armedBtn && performance.now() - armedAt < ARM_WINDOW_MS){

        trackedBtn = armedBtn;

        armedBtn = null;

        startBtnLoading(trackedBtn);

      }

      const p = origFetch(...args);

      if (trackedBtn){

        const release = ()=>{ stopBtnLoading(trackedBtn); };

        p.then(release, release);

      }

      return p;

    };

  })();

  // Best-effort voice-channel cleanup when the user closes the tab or hits

  // reload while still in a call. Without this, the WS close event races

  // the page's new socket coming up — which can leave the user listed in

  // voice_channel_members on the server even though their browser is gone.

  window.addEventListener('beforeunload', () => {

    if (!inVoice || !connectedChannel || !currentServer) return;

    if (!backend.isConfigured()) return;

    const base = (typeof _backendBase === 'function' ? _backendBase() : '') || '';

    if (!base) return;

    const url = base + '/channels/voice/' + encodeURIComponent(currentServer) + '/' + encodeURIComponent(connectedChannel) + '/leave';

    const tok = backend.token && backend.token.read && backend.token.read();

    try {

      // sendBeacon ignores headers, so we tunnel the auth token in a

      // throwaway query param the leave endpoint accepts via attachUser

      // (it already reads ?token=… for the WS upgrade path).

      navigator.sendBeacon(url + '?token=' + encodeURIComponent(tok || ''), new Blob(['{}'], { type: 'application/json' }));

    } catch(_){}

  });

  // ============== WEB VERSION: REFRESH & DOWNLOAD BUTTONS ==============
  // Add refresh and download buttons to the web version (similar to Electron app).
  // These buttons appear in the bottom-left corner for both web and Electron.
  
  (function setupWebButtons(){
    // Skip if we're in Electron (it has its own buttons)
    if (window.electronAPI) return;
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', setupWebButtons);
      return;
    }
    
    // Inject CSS for web buttons
    const style = document.createElement('style');
    style.textContent = `
      .web-controls {
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 999999;
        display: flex;
        gap: 10px;
      }
      
      .web-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(20, 20, 30, 0.95);
        border: 1px solid rgba(139, 92, 246, 0.3);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      
      .web-btn:hover {
        background: rgba(139, 92, 246, 0.2);
        border-color: rgba(139, 92, 246, 0.6);
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(139, 92, 246, 0.3);
      }
      
      .web-btn:active {
        transform: translateY(0);
      }
      
      .web-btn svg {
        width: 18px;
        height: 18px;
        stroke: rgba(139, 92, 246, 0.9);
        fill: none;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    `;
    document.head.appendChild(style);
    
    // Create controls container
    const controls = document.createElement('div');
    controls.className = 'web-controls';
    
    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'web-btn';
    refreshBtn.title = 'Refresh';
    refreshBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>';
    refreshBtn.onclick = () => {
      location.reload();
    };
    
    // Download button (opens GitHub releases page)
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'web-btn';
    downloadBtn.title = 'Download Desktop App';
    downloadBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
    downloadBtn.onclick = () => {
      window.open('https://github.com/DiyakoMk/meeting/releases/latest', '_blank');
    };
    
    controls.appendChild(refreshBtn);
    controls.appendChild(downloadBtn);
    document.body.appendChild(controls);
  })();

})();

