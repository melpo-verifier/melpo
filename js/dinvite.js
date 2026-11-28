// NOTE: This file is fully rewritten by AI (Gemini 4 Neon) and checked by Milo, it's not a critical feature and full manual rewrite would've taken a lot more time. This version uses the database to store invite tracking instead of refetching on every startup which was unfeasable at 10k+ servers.
const { Events, PermissionsBitField, Routes } = require("discord.js");
const { GuildInviteSnapshot, InviteTracker } = require("../dbObjects.js");

const HOT_CACHE_MAX = 500;
const HOT_CACHE_TTL_MS = 15 * 60 * 1000;
const RECENT_DELETE_TTL_MS = 15 * 1000;
const RECENT_DELETE_PER_GUILD_MAX = 25;
const EXPIRE_SKEW_MS = 5 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;
const RAID_WINDOW_MS = 10 * 1000;
const RAID_MAX_JOINS = 10;
const RAID_COOLDOWN_MS = 30 * 1000;
const RAID_STATE_MAX = 10000;
const MAX_INVITE_EVENT_QUEUE_DEPTH = 10;
const CLUSTER_REST_MAX_PER_SEC = 20;
const IGNORED_ERRORS = new Set([10004, 50001, 50013]);

async function canTrackInvites(guild) {
	const me = await guild?.members?.fetchMe?.().catch(() => null);
	return Boolean(me?.permissions?.has(PermissionsBitField.Flags.ManageGuild));
}

function hasVanityUrl(guild) {
	return Boolean(guild?.features?.includes("VANITY_URL") && guild?.vanityURLCode);
}

function toExpiresAtMs(expiresAt, createdAt, maxAge) {
	if (expiresAt != null) {
		const ms = typeof expiresAt === "number" ? expiresAt : Date.parse(expiresAt);
		if (Number.isFinite(ms)) return ms;
	}
	if (maxAge > 0 && createdAt != null) {
		const ms = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
		if (Number.isFinite(ms)) return ms + maxAge * 1000;
	}
	return null;
}

function serializeRestInvites(rawInvites) {
	const invites = {};
	if (!Array.isArray(rawInvites)) return invites;
	for (const inv of rawInvites) {
		if (!inv?.code) continue;
		invites[inv.code] = {
			uses: inv.uses ?? 0,
			inviterId: inv.inviter?.id ?? inv.inviter_id ?? null,
			maxUses: inv.max_uses ?? 0,
			expiresAt: toExpiresAtMs(inv.expires_at, inv.created_at, inv.max_age),
		};
	}
	return invites;
}

function isFiniteUnexpired(invite, now) {
	return Boolean(invite && invite.maxUses > 0 && (!invite.expiresAt || invite.expiresAt > now + EXPIRE_SKEW_MS));
}

function setBounded(map, key, value, max = HOT_CACHE_MAX) {
	map.delete(key);
	map.set(key, value);
	if (map.size > max) {
		map.delete(map.keys().next().value);
	}
}

class InviteManager {
	constructor(client) {
		if (!client) throw new Error("InviteManager: client is required");

		this.client = client;
		this.hotCache = new Map();
		this.recentDeleted = new Map();
		this.raidState = new Map();
		this.guildQueues = new Map();
		this.guildQueueDepths = new Map();
		this._restWindowStart = 0;
		this._restWindowCount = 0;

		this._listeners = [
			[Events.InviteCreate, (invite) => void this.handleInviteCreate(invite)],
			[Events.InviteDelete, (invite) => void this.handleInviteDelete(invite)],
			[Events.GuildUnavailable, (guild) => this.handleGuildUnavailable(guild)],
			[Events.GuildDelete, (guild) => void this.handleGuildDelete(guild)],
			[Events.GuildMemberAdd, (member) => void this.handleGuildMemberAdd(member)],
			[Events.GuildMemberRemove, (member) => void this.handleGuildMemberRemove(member)],
		];
		for (const [event, handler] of this._listeners) {
			client.on(event, handler);
		}

		this._sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
		this._sweepTimer.unref?.();
	}

	destroy() {
		if (this._sweepTimer) {
			clearInterval(this._sweepTimer);
			this._sweepTimer = null;
		}
		for (const [event, handler] of this._listeners) {
			this.client.off?.(event, handler);
		}
		this.hotCache.clear();
		this.recentDeleted.clear();
		this.raidState.clear();
		this.guildQueues.clear();
		this.guildQueueDepths.clear();
	}

	sweep(now = Date.now()) {
		for (const [guildId, entry] of this.hotCache) {
			if (now - entry.cachedAt >= HOT_CACHE_TTL_MS) this.hotCache.delete(guildId);
		}
		for (const [guildId, list] of this.recentDeleted) {
			const fresh = list.filter((item) => now - item.deletedAt < RECENT_DELETE_TTL_MS);
			if (fresh.length) this.recentDeleted.set(guildId, fresh);
			else this.recentDeleted.delete(guildId);
		}
		for (const [guildId, raid] of this.raidState) {
			if (!raid.needsResync && now >= raid.pausedUntil && now - raid.windowStart >= RAID_WINDOW_MS) {
				this.raidState.delete(guildId);
			}
		}
	}

	enqueue(guildId, task) {
		const prev = this.guildQueues.get(guildId) ?? Promise.resolve();
		this.guildQueueDepths.set(guildId, (this.guildQueueDepths.get(guildId) ?? 0) + 1);
		const next = prev.then(task, task);
		this.guildQueues.set(guildId, next);
		void next
			.finally(() => {
				const depth = (this.guildQueueDepths.get(guildId) ?? 1) - 1;
				if (depth <= 0) this.guildQueueDepths.delete(guildId);
				else this.guildQueueDepths.set(guildId, depth);
				if (this.guildQueues.get(guildId) === next) this.guildQueues.delete(guildId);
			})
			.catch(() => {});
		return next;
	}

	consumeClusterRestBudget(now = Date.now()) {
		if (now - this._restWindowStart >= 1000) {
			this._restWindowStart = now;
			this._restWindowCount = 1;
			return true;
		}
		if (this._restWindowCount >= CLUSTER_REST_MAX_PER_SEC) return false;
		this._restWindowCount++;
		return true;
	}

	markNeedsResync(guildId, now = Date.now()) {
		const prev = this.raidState.get(guildId);
		setBounded(
			this.raidState,
			guildId,
			{
				windowStart: prev?.windowStart ?? now,
				count: prev?.count ?? 0,
				pausedUntil: prev?.pausedUntil ?? 0,
				needsResync: true,
			},
			RAID_STATE_MAX,
		);
	}

	setCachedSnapshot(guildId, snapshot, now = Date.now()) {
		setBounded(this.hotCache, guildId, {
			invites: snapshot.invites,
			vanityCode: snapshot.vanityCode ?? null,
			vanityUses: snapshot.vanityUses ?? null,
			cachedAt: now,
		});
	}

	async loadSnapshot(guildId, now = Date.now()) {
		const cached = this.hotCache.get(guildId);
		if (cached) {
			if (now - cached.cachedAt < HOT_CACHE_TTL_MS) return cached;
			this.hotCache.delete(guildId);
		}
		const row = await GuildInviteSnapshot.findByPk(guildId);
		if (!row) return null;
		return {
			invites: row.invites || {},
			vanityCode: row.vanity_code ?? null,
			vanityUses: row.vanity_uses ?? null,
		};
	}

	async saveSnapshot(guildId, snapshot, now = Date.now(), cacheIfCold = true) {
		await GuildInviteSnapshot.upsert({
			guild_id: guildId,
			invites: snapshot.invites,
			vanity_code: snapshot.vanityCode ?? null,
			vanity_uses: snapshot.vanityUses ?? null,
		});
		if (cacheIfCold || this.hotCache.has(guildId)) {
			this.setCachedSnapshot(guildId, snapshot, now);
		}
	}

	async fetchRest(route, label) {
		try {
			return await this.client.rest.get(route);
		} catch (error) {
			if (!IGNORED_ERRORS.has(error?.code) && error?.status !== 403 && error?.status !== 404) {
				console.error(`Failed to fetch ${label}:`, error);
			}
			return null;
		}
	}

	isRaidPaused(guildId, now = Date.now()) {
		const state = this.raidState.get(guildId);
		if (state && now < state.pausedUntil) return true;

		if (!state || state.pausedUntil > 0 || now - state.windowStart >= RAID_WINDOW_MS) {
			setBounded(
				this.raidState,
				guildId,
				{
					windowStart: now,
					count: 1,
					pausedUntil: 0,
					needsResync: Boolean(state?.needsResync),
				},
				RAID_STATE_MAX,
			);
			return false;
		}

		if (++state.count > RAID_MAX_JOINS) {
			state.pausedUntil = now + RAID_COOLDOWN_MS;
			state.needsResync = true;
			return true;
		}
		return false;
	}

	matchInvite(guildId, prevInvites, currentInvites, now) {
		if (prevInvites) {
			for (const [code, inv] of Object.entries(currentInvites)) {
				if (Object.hasOwn(prevInvites, code) && inv.uses > prevInvites[code].uses) {
					return { code, inviterId: inv.inviterId ?? prevInvites[code].inviterId ?? null, uses: inv.uses };
				}
			}
			// Invite created without a gateway event — only trust uses === 1 so unseen old invites cannot steal vanity
			for (const [code, inv] of Object.entries(currentInvites)) {
				if (!Object.hasOwn(prevInvites, code) && inv.uses === 1) {
					return { code, inviterId: inv.inviterId ?? null, uses: 1 };
				}
			}
		}

		// Finite-use invite deleted right before guildMemberAdd arrived
		const deleted = this.recentDeleted.get(guildId);
		if (deleted?.length) {
			const fresh = deleted.filter((item) => now - item.deletedAt < RECENT_DELETE_TTL_MS);
			const idx = fresh.findIndex(
				(item) =>
					!Object.hasOwn(currentInvites, item.code) && isFiniteUnexpired(item, now) && item.uses + 1 === item.maxUses,
			);
			const chosen = idx !== -1 ? fresh.splice(idx, 1)[0] : null;
			if (fresh.length) this.recentDeleted.set(guildId, fresh);
			else this.recentDeleted.delete(guildId);
			if (chosen) return { code: chosen.code, inviterId: chosen.inviterId ?? null, uses: chosen.maxUses };
		}

		// Finite-use invite exhausted before inviteDelete arrived
		if (prevInvites) {
			for (const [code, inv] of Object.entries(prevInvites)) {
				if (!Object.hasOwn(currentInvites, code) && isFiniteUnexpired(inv, now) && inv.uses + 1 === inv.maxUses) {
					return { code, inviterId: inv.inviterId ?? null, uses: inv.maxUses };
				}
			}
		}

		return null;
	}

	async handleInviteCreate(invite) {
		const guild = invite?.guild;
		if (!guild?.id || !invite?.code) return;

		const raid = this.raidState.get(guild.id);
		if (raid && (Date.now() < raid.pausedUntil || raid.needsResync)) return;
		if ((this.guildQueueDepths.get(guild.id) ?? 0) >= MAX_INVITE_EVENT_QUEUE_DEPTH) return;
		// Skip cold unlimited invites — matchInvite already matches unseen uses === 1 invites on join
		if ((invite.maxUses ?? 0) === 0 && !this.hotCache.has(guild.id)) return;
		if (!(await canTrackInvites(guild))) return;

		try {
			await this.enqueue(guild.id, async () => {
				const now = Date.now();
				const snapshot = await this.loadSnapshot(guild.id, now);
				if (!snapshot) return;

				const entry = {
					uses: invite.uses ?? 0,
					inviterId: invite.inviterId ?? invite.inviter?.id ?? null,
					maxUses: invite.maxUses ?? 0,
					expiresAt: invite.expiresTimestamp ?? toExpiresAtMs(null, invite.createdTimestamp, invite.maxAge),
				};
				await this.saveSnapshot(
					guild.id,
					{ ...snapshot, invites: { ...snapshot.invites, [invite.code]: entry } },
					now,
					false,
				);
			});
		} catch (error) {
			console.error(`Error handling inviteCreate for guild ${guild.id}:`, error);
		}
	}

	async handleInviteDelete(invite) {
		const guild = invite?.guild;
		if (!guild?.id || !invite?.code) return;

		const raid = this.raidState.get(guild.id);
		if (raid && (Date.now() < raid.pausedUntil || raid.needsResync)) return;
		if ((this.guildQueueDepths.get(guild.id) ?? 0) >= MAX_INVITE_EVENT_QUEUE_DEPTH) return;
		if (!(await canTrackInvites(guild))) return;

		try {
			await this.enqueue(guild.id, async () => {
				const now = Date.now();
				const snapshot = await this.loadSnapshot(guild.id, now);
				if (!snapshot || !Object.hasOwn(snapshot.invites, invite.code)) return;

				const removed = snapshot.invites[invite.code];
				const trackDeleted = isFiniteUnexpired(removed, now) && removed.uses + 1 === removed.maxUses;
				// Skip DB writes for cold unlimited/expired deletes — next join refreshes the full invite list
				if (!trackDeleted && !this.hotCache.has(guild.id)) return;

				const nextInvites = { ...snapshot.invites };
				delete nextInvites[invite.code];
				await this.saveSnapshot(guild.id, { ...snapshot, invites: nextInvites }, now, false);

				if (trackDeleted) {
					const existing = this.recentDeleted.get(guild.id) ?? [];
					const fresh = existing.filter(
						(item) => now - item.deletedAt < RECENT_DELETE_TTL_MS && item.code !== invite.code,
					);
					fresh.push({ code: invite.code, ...removed, deletedAt: now });
					if (fresh.length > RECENT_DELETE_PER_GUILD_MAX) {
						fresh.splice(0, fresh.length - RECENT_DELETE_PER_GUILD_MAX);
					}
					setBounded(this.recentDeleted, guild.id, fresh);
				}
			});
		} catch (error) {
			console.error(`Error handling inviteDelete for guild ${guild.id}:`, error);
		}
	}

	handleGuildUnavailable(guild) {
		if (!guild?.id) return;
		this.hotCache.delete(guild.id);
		this.recentDeleted.delete(guild.id);
		this.markNeedsResync(guild.id);
	}

	async handleGuildDelete(guild) {
		if (!guild?.id) return;
		const guildId = guild.id;
		this.hotCache.delete(guildId);
		this.recentDeleted.delete(guildId);
		this.raidState.delete(guildId);

		try {
			await this.enqueue(guildId, async () => {
				this.hotCache.delete(guildId);
				this.recentDeleted.delete(guildId);
				this.raidState.delete(guildId);
				await GuildInviteSnapshot.destroy({ where: { guild_id: guildId } });
			});
		} catch (error) {
			console.error(`Failed to delete invite snapshot for guild ${guildId}:`, error);
		}
	}

	async handleGuildMemberAdd(member) {
		if (!member?.user || !member.guild || member.user.bot) return;
		if (!(await canTrackInvites(member.guild))) return;

		const guild = member.guild;
		const guildId = guild.id;
		if (this.isRaidPaused(guildId, Date.now())) return;

		try {
			await this.enqueue(guildId, async () => {
				const now = Date.now();
				const raid = this.raidState.get(guildId);
				if (raid && now < raid.pausedUntil) return;

				if (!this.consumeClusterRestBudget(now)) {
					this.markNeedsResync(guildId, now);
					return;
				}

				// First post-cooldown join skips previous snapshot so it cleanly re-baselines without attributing
				const isResync = Boolean(raid?.needsResync);
				const prevSnapshot = isResync ? null : await this.loadSnapshot(guildId, now);
				const rawInvites = await this.fetchRest(Routes.guildInvites(guildId), `invites for guild ${guildId}`);
				if (rawInvites === null) return;

				const currentInvites = serializeRestInvites(rawInvites);
				const matchedInvite = prevSnapshot
					? this.matchInvite(guildId, prevSnapshot.invites, currentInvites, now)
					: null;

				const guildHasVanity = hasVanityUrl(guild);
				let vanityCode = guildHasVanity ? (prevSnapshot?.vanityCode ?? null) : null;
				let vanityUses = guildHasVanity ? (prevSnapshot?.vanityUses ?? null) : null;
				let matchedVanity = null;

				if (!matchedInvite && guildHasVanity && this.consumeClusterRestBudget(Date.now())) {
					const vanity = await this.fetchRest(Routes.guildVanityUrl(guildId), `vanity URL for guild ${guildId}`);
					if (vanity?.code && typeof vanity.uses === "number") {
						vanityCode = vanity.code;
						vanityUses = vanity.uses;
						if (
							prevSnapshot &&
							((prevSnapshot.vanityCode === vanity.code &&
								typeof prevSnapshot.vanityUses === "number" &&
								vanity.uses > prevSnapshot.vanityUses) ||
								(prevSnapshot.vanityCode !== vanity.code && vanity.uses === 1))
						) {
							matchedVanity = { code: vanity.code, uses: vanity.uses };
						}
					}
				}

				await this.saveSnapshot(guildId, { invites: currentInvites, vanityCode, vanityUses }, now);

				if (isResync) {
					this.recentDeleted.delete(guildId);
					const latestRaid = this.raidState.get(guildId);
					if (latestRaid && Date.now() >= latestRaid.pausedUntil) {
						latestRaid.needsResync = false;
					}
				}

				const match = matchedInvite
					? { id: matchedInvite.inviterId ?? "Unknown", code: matchedInvite.code, uses: matchedInvite.uses }
					: matchedVanity
						? { id: "vanity", code: matchedVanity.code, uses: matchedVanity.uses }
						: null;
				if (match) {
					await InviteTracker.upsert({ unique_id: `${member.user.id}_${guildId}`, ...match });
				}
			});
		} catch (error) {
			console.error(`Error processing guildMemberAdd in dinvite for guild ${guildId}:`, error);
		}
	}

	async handleGuildMemberRemove(member) {
		if (member?.user?.bot) return;
		const userId = member?.user?.id ?? member?.id;
		const guildId = member?.guild?.id;
		if (!userId || !guildId) return;

		try {
			await InviteTracker.destroy({ where: { unique_id: `${userId}_${guildId}` } });
		} catch (error) {
			console.error(`Failed to delete invite tracker data for user ${userId}:`, error);
		}
	}
}

module.exports = InviteManager;
