# guest-invite

Fragment token (`#t=...`) -> POST exchange, then `history.replaceState` to strip token.
Same-origin `/api` so HttpOnly guest cookies persist. Never log token.
