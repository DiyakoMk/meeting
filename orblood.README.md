# ORBLOOD — wiring up a real backend

The page (`orblood.html`) ships with **no demo data**. All in-memory stores
(`servers`, `conversations`, `messages`, `friendsList`, `friendRequests`,
`marked`, `markedFriends`, `markedTextChannels`, `notifications`,
`worldMessages`, `activityFeed`, `blockedUsers`) start empty.

A new user signing up sees:
- An empty home page (no marked orbits, no online friends, no marked channels).
- An empty server rail (the prompt asks them to create or join a server).
- An "EMPTY" placeholder orb in the orbits column.
- An empty `Saved Messages` thread.

## Pointing the UI at your MySQL-backed API

1. **Create the database** using `orblood.sql` (provided alongside this file).
   It defines every table the snapshot endpoint needs — users, friendships,
   friend_requests, blocked_users, dm_threads, dm_messages, dm_pinned, servers,
   server_members, server_categories, text_channels, voice_channels,
   voice_channel_members, server_roles, server_role_members,
   text_channel_messages, user_marked_*, user_pinned_servers, notifications.

2. **Build a thin HTTP API** with whatever stack you prefer (Node/Express,
   Go, FastAPI, Laravel, etc.). The frontend `backend` adapter expects:

   ```
   POST /auth/signup         {email,password,name,handle}     -> {token,user}
   POST /auth/login          {email,password}                 -> {token,user}
   POST /auth/logout
   GET  /me                                                    -> {user}
   PATCH /me                 {name?,handle?,bio?,avImage?,...}
   GET  /me/snapshot                                           -> hydration payload

   POST /servers                {name,desc,baseColor,grad,glow}
   PATCH /servers/:id           {...}
   DELETE /servers/:id
   POST /servers/:id/leave
   POST /servers/:id/categories            {name}
   DELETE /servers/:id/categories/:cid
   POST /servers/:id/text-channels         {name,style,categoryId}
   DELETE /servers/:id/text-channels/:cid
   POST /servers/:id/voice-channels        {name,style,categoryId}
   DELETE /servers/:id/voice-channels/:cid
   POST /servers/:id/voice-channels/:cid/join
   POST /servers/:id/voice-channels/:cid/leave

   GET  /dms/:peerKey
   POST /dms/:peerKey                       {text,replyTo?,attachment?}
   POST /dms/:peerKey/clear
   DELETE /dms/:peerKey/:msgId

   POST /friends/request                    {target}
   POST /friends/:reqId/accept
   POST /friends/:reqId/reject
   DELETE /friends/:reqId
   POST /friends/:userId/remove

   POST /users/:userId/block
   POST /users/:userId/unblock
   GET  /users/search?q=...
   ```

3. **Tell the page where the API lives** in one of three ways:
   - Add a meta tag in `<head>`:
     ```html
     <meta name="orblood-api" content="https://api.example.com">
     ```
   - Or set `window.ORBLOOD_API` before the inline script runs.
   - Or hard-code it in `_backendBase()` (search the source for that function).

4. **Hydration shape.** `GET /me/snapshot` should return:

   ```json
   {
     "user":            { "name":"...", "handle":"...", "avImage":null, "bannerImage":null, "baseColor":"#a78bfa", "email":"...", "phone":"...", "bio":"...", "rank":"EXPLORER" },
     "servers":         { "<sid>": { "id":"...", "name":"...", "members":[...], "admins":[...], "textChannels":[...], "voiceChannels":[...], "categories":[...], "pinned":{...} } },
     "myServers":       ["<sid1>","<sid2>"],
     "channelData":     { "<voiceChannelId>": { "name":"...", "users":[...], ... } },
     "conversations":   { "<peerKey>": { "name":"...", "online":true, "avColor":"...", "initial":"...", "handle":"@...", "bio":"..." } },
     "messages":        { "<peerKey>": [ { "id":"...", "sender":"me|them", "text":"...", "time":"...", "day":"..." } ] },
     "friendsList":     ["<peerKey>", ...],
     "markedFriends":   ["<peerKey>", ...],
     "markedTextChannels": ["<sid>__<channelId>", ...],
     "marked":          ["<voiceChannelId>", ...],
     "blockedUsers":    ["<peerKey>", ...],
     "notifications":   [ { "id":1, "type":"...", "title":"...", "desc":"...", "time":"...", "unread":true } ],
     "friendRequests":  { "incoming":[...], "outgoing":[...] }
   }
   ```

   Anything missing is silently kept empty.

5. **Auth tokens** are stored in `localStorage` under `orblood_token_v1`. The
   adapter sends them as `Authorization: Bearer <token>` on every request.

That's it. Once `_backendBase()` returns a non-empty URL, every mutation in the
UI also calls into the backend, and `hydrateFromBackend()` runs at boot to
replace the empty stores with whatever the server has. If the API is
unreachable or returns an error, the UI quietly falls back to the previous
in-memory state and logs a warning to the console.
