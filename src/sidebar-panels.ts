import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
	ConfigurationSource,
	SidebarPanelId,
	SidebarPanelLayout,
	SidebarPanelLayoutEntry,
} from "./types.js";

/** The event channel used by the public sidebar contribution protocol. */
export const SIDEBAR_PANEL_EVENT_CHANNEL = "pi-atelier:sidebar-panels" as const;
export const SIDEBAR_PANEL_PROTOCOL_VERSION = 1 as const;

/** Maximum visible characters retained for a contributed panel title. */
export const SIDEBAR_PANEL_MAX_TITLE_CHARS = 48;
/** Maximum structured rows retained for one contributed panel. */
export const SIDEBAR_PANEL_MAX_ROWS = 24;
/** Maximum visible characters retained for one contributed row. */
export const SIDEBAR_PANEL_MAX_ROW_CHARS = 160;
/** Maximum characters accepted for a namespaced contributed panel ID. */
export const SIDEBAR_PANEL_MAX_ID_CHARS = 128;
/** Maximum characters accepted for a contributed panel source name. */
export const SIDEBAR_PANEL_MAX_SOURCE_CHARS = 128;
/** Maximum contributed panels retained by one registry. */
export const SIDEBAR_PANEL_MAX_PANELS = 64;
/** Maximum distinct event sources tracked by one registry. */
export const SIDEBAR_PANEL_MAX_TRACKED_SOURCES = SIDEBAR_PANEL_MAX_PANELS;

/** Built-in panels remain available even when their optional content is empty. */
export const BUILTIN_SIDEBAR_PANEL_IDS = [
	"agent",
	"activity",
	"alerts",
	"todos",
	"context",
	"workspace",
	"usage",
	"tools",
] as const;

export const DEFAULT_SIDEBAR_PANEL_LAYOUT: SidebarPanelLayout = BUILTIN_SIDEBAR_PANEL_IDS.map((id) => ({
	id,
	visible: true,
}));

const BUILTIN_IDS = new Set<string>(BUILTIN_SIDEBAR_PANEL_IDS);
const NAMESPACED_ID = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/;
const PANEL_ROLES = new Set([
	"primary",
	"accent",
	"muted",
	"dim",
	"ready",
	"working",
	"warning",
	"error",
	"input",
	"output",
	"cache",
	"context",
]);

export type SidebarPanelRole =
	| "primary"
	| "accent"
	| "muted"
	| "dim"
	| "ready"
	| "working"
	| "warning"
	| "error"
	| "input"
	| "output"
	| "cache"
	| "context";

export interface SidebarPanelRow {
	text: string;
	role?: SidebarPanelRole;
}

/** Structured, presentation-only data accepted from another extension. */
export interface SidebarPanelContribution {
	id: SidebarPanelId;
	title: string;
	rows: readonly (string | SidebarPanelRow)[];
	role?: SidebarPanelRole;
}

export interface SidebarPanelData extends Omit<SidebarPanelContribution, "rows"> {
	rows: readonly SidebarPanelRow[];
	available: true;
	source: string;
}

export type SidebarPanelLayoutSource = ConfigurationSource;
export type { SidebarPanelLayout, SidebarPanelLayoutEntry };

export interface SidebarPanelRegisterEvent {
	version: typeof SIDEBAR_PANEL_PROTOCOL_VERSION;
	type: "register";
	source: string;
	revision: number;
	panel: SidebarPanelContribution;
	/** Optional correlation token used by load-order discovery. */
	requestId?: string;
}

export interface SidebarPanelUnregisterEvent {
	version: typeof SIDEBAR_PANEL_PROTOCOL_VERSION;
	type: "unregister";
	source: string;
	revision: number;
	id: SidebarPanelId;
}

export interface SidebarPanelDiscoveryEvent {
	version: typeof SIDEBAR_PANEL_PROTOCOL_VERSION;
	type: "discover";
	requestId: string;
}

export type SidebarPanelEvent =
	| SidebarPanelRegisterEvent
	| SidebarPanelUnregisterEvent
	| SidebarPanelDiscoveryEvent;

export interface SidebarPanelEventTransport {
	on(channel: string, handler: (data: unknown) => void): () => void;
	emit(channel: string, data: unknown): void;
}

export interface SidebarPanelRegistry {
	register(panel: SidebarPanelContribution, source?: string): boolean;
	unregister(id: SidebarPanelId, source?: string): boolean;
	getAvailable(): readonly SidebarPanelData[];
	get(id: string): SidebarPanelData | undefined;
	/** Handle a public event directly; useful for runtime and public-seam tests. */
	handleEvent(data: unknown): void;
	requestDiscovery(): void;
	dispose(): void;
}

export interface SidebarPanelRegistryOptions {
	events?: SidebarPanelEventTransport;
	onChange?: () => void;
	/** A registry ignores events for another instance when a source includes one. */
	instanceId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSidebarPanelId(value: unknown): value is SidebarPanelId {
	return (
		typeof value === "string" &&
		(BUILTIN_IDS.has(value) || (value.length <= SIDEBAR_PANEL_MAX_ID_CHARS && NAMESPACED_ID.test(value)))
	);
}

/** Validate the source name retained with a contributed panel and its events. */
export function isSidebarPanelSource(value: unknown): value is string {
	return typeof value === "string" && value.length <= SIDEBAR_PANEL_MAX_SOURCE_CHARS && value.trim() !== "";
}

export function isSidebarPanelRole(value: unknown): value is SidebarPanelRole {
	return typeof value === "string" && PANEL_ROLES.has(value);
}

export function cloneSidebarPanelLayout(layout: readonly SidebarPanelLayoutEntry[]): SidebarPanelLayout {
	return layout.map((entry) => ({ id: entry.id, visible: entry.visible }));
}

/**
 * Normalizes persisted layout while retaining valid namespaced IDs that are not
 * currently available. Built-ins omitted by an older config are appended in
 * product order; newly discovered contributed panels are intentionally not
 * appended here and therefore remain hidden until explicitly enabled.
 */
export function normalizeSidebarPanelLayout(
	entries: readonly SidebarPanelLayoutEntry[],
	warnings: string[] = [],
): SidebarPanelLayout {
	const normalized: SidebarPanelLayout = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		if (!entry || !isSidebarPanelId(entry.id)) {
			warnings.push(`Unknown sidebar panel: ${String(entry?.id)}`);
			continue;
		}
		if (seen.has(entry.id)) {
			warnings.push(`Ignoring duplicate sidebar panel: ${entry.id}`);
			continue;
		}
		seen.add(entry.id);
		normalized.push({ id: entry.id, visible: entry.visible === true });
	}
	for (const id of BUILTIN_SIDEBAR_PANEL_IDS) {
		if (!seen.has(id)) normalized.push({ id, visible: true });
	}
	if (!normalized.some((entry) => entry.visible)) {
		warnings.push("sidebarPanelLayout must include at least one visible panel; restoring agent");
		const first = normalized.find((entry) => entry.id === "agent");
		if (first) first.visible = true;
	}
	return normalized;
}

const ANSI_ESCAPE =
	/(?:\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b\[[0-?]*[ -/]*[@-~]|\u009b[0-?]*[ -/]*[@-~])/g;

function cleanSidebarPanelText(value: string): string {
	return value
		.replace(ANSI_ESCAPE, "")
		.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Defensively sanitize text before any Settings or Sidebar interpolation. */
export function sanitizeSidebarPanelText(value: string, maxChars = SIDEBAR_PANEL_MAX_ROW_CHARS): string {
	return Array.from(cleanSidebarPanelText(value)).slice(0, maxChars).join("");
}

function fitsSidebarPanelText(value: string, maxChars: number): boolean {
	return Array.from(cleanSidebarPanelText(value)).length <= maxChars;
}

function sanitizeContribution(value: unknown): SidebarPanelContribution | undefined {
	if (
		!isRecord(value) ||
		!isSidebarPanelId(value.id) ||
		typeof value.title !== "string" ||
		!Array.isArray(value.rows) ||
		value.rows.length > SIDEBAR_PANEL_MAX_ROWS ||
		!fitsSidebarPanelText(value.title, SIDEBAR_PANEL_MAX_TITLE_CHARS)
	)
		return undefined;
	const rows: SidebarPanelRow[] = [];
	for (const row of value.rows) {
		const text =
			typeof row === "string" ? row : isRecord(row) && typeof row.text === "string" ? row.text : undefined;
		if (text === undefined || !fitsSidebarPanelText(text, SIDEBAR_PANEL_MAX_ROW_CHARS)) return undefined;
		rows.push({
			text: sanitizeSidebarPanelText(text, SIDEBAR_PANEL_MAX_ROW_CHARS),
			...(isRecord(row) && isSidebarPanelRole(row.role) ? { role: row.role } : {}),
		});
	}
	return {
		id: value.id,
		title: sanitizeSidebarPanelText(value.title, SIDEBAR_PANEL_MAX_TITLE_CHARS),
		rows,
		...(isSidebarPanelRole(value.role) ? { role: value.role } : {}),
	};
}

function sourceFor(id: string): string {
	return id.includes(":") ? id.slice(0, id.indexOf(":")) : "pi-atelier";
}

function isEvent(value: unknown): value is Record<string, unknown> {
	return (
		isRecord(value) && value.version === SIDEBAR_PANEL_PROTOCOL_VERSION && typeof value.type === "string"
	);
}

// Revision numbers are part of the event protocol's per-source ordering, not
// of an individual publisher. Keep the allocator scoped to each transport so
// separate Pi runtimes (and test buses) cannot affect one another, while the
// weak key avoids retaining an event bus after its runtime is gone.
//
// Source entries are bounded tombstones: disposed publishers keep their last
// revision so a later publisher reusing that source cannot reset to one and
// resurrect stale events. A new source beyond the cap becomes an inert
// publisher because this API cannot report allocation failure to its caller.
const sidebarPanelRevisionAllocators = new WeakMap<object, Map<string, number>>();

function nextSidebarPanelRevision(events: SidebarPanelEventTransport, source: string): number | undefined {
	if (!isSidebarPanelSource(source)) return undefined;
	let revisions = sidebarPanelRevisionAllocators.get(events);
	if (!revisions) {
		revisions = new Map<string, number>();
		sidebarPanelRevisionAllocators.set(events, revisions);
	}
	const previous = revisions.get(source);
	if (previous === undefined && revisions.size >= SIDEBAR_PANEL_MAX_TRACKED_SOURCES) return undefined;
	const next = (previous ?? 0) + 1;
	revisions.set(source, next);
	return next;
}

function sidebarPanelDataEqual(first: SidebarPanelData, second: SidebarPanelData): boolean {
	return (
		first.id === second.id &&
		first.title === second.title &&
		first.role === second.role &&
		first.available === second.available &&
		first.source === second.source &&
		first.rows.length === second.rows.length &&
		first.rows.every(
			(row, index) => row.text === second.rows[index]?.text && row.role === second.rows[index]?.role,
		)
	);
}

/** Create a lifecycle-safe registry backed only by Pi's public event bus. */
export function createSidebarPanelRegistry(options: SidebarPanelRegistryOptions = {}): SidebarPanelRegistry {
	const panels = new Map<string, SidebarPanelData>();
	const owners = new Map<string, string>();
	const revisions = new Map<string, number>();
	let disposed = false;
	let requestSequence = 0;
	let unsubscribe: (() => void) | undefined;

	const changed = (): void => {
		try {
			options.onChange?.();
		} catch {
			// Rendering invalidation is best effort and must not break event handling.
		}
	};
	const canAcceptRevision = (source: string, revision: number): boolean => {
		const previous = revisions.get(source) ?? 0;
		return Number.isSafeInteger(revision) && revision > previous;
	};
	const trackRevision = (source: string, revision: number): void => {
		revisions.set(source, revision);
	};
	const canTrackSource = (source: string): boolean =>
		revisions.has(source) || revisions.size < SIDEBAR_PANEL_MAX_TRACKED_SOURCES;
	const canRegister = (panel: SidebarPanelContribution, source: string): boolean => {
		const owner = owners.get(panel.id);
		if (owner !== undefined && owner !== source) return false;
		return panels.has(panel.id) || panels.size < SIDEBAR_PANEL_MAX_PANELS;
	};
	const applyRegister = (safe: SidebarPanelContribution, resolvedSource: string): boolean => {
		owners.set(safe.id, resolvedSource);
		const next: SidebarPanelData = {
			...safe,
			rows: safe.rows as SidebarPanelRow[],
			available: true,
			source: resolvedSource,
		};
		const previous = panels.get(safe.id);
		if (previous && sidebarPanelDataEqual(previous, next)) return false;
		panels.set(safe.id, next);
		changed();
		return true;
	};
	const register = (panel: SidebarPanelContribution, source?: string): boolean => {
		if (disposed) return false;
		const safe = sanitizeContribution(panel);
		if (!safe || !safe.id.includes(":")) return false;
		const resolvedSource = source ?? sourceFor(safe.id);
		if (!isSidebarPanelSource(resolvedSource) || !canRegister(safe, resolvedSource)) return false;
		return applyRegister(safe, resolvedSource);
	};
	const canUnregister = (id: SidebarPanelId, source: string): boolean => owners.get(id) === source;
	const applyUnregister = (id: SidebarPanelId): boolean => {
		owners.delete(id);
		const removed = panels.delete(id);
		changed();
		return removed;
	};
	const unregister = (id: SidebarPanelId, source?: string): boolean => {
		if (disposed || !isSidebarPanelId(id)) return false;
		const resolvedSource = source ?? sourceFor(id);
		if (!isSidebarPanelSource(resolvedSource) || !canUnregister(id, resolvedSource)) return false;
		return applyUnregister(id);
	};
	const handleEvent = (data: unknown): void => {
		if (disposed || !isEvent(data)) return;
		if (typeof data.source === "string" && options.instanceId && data.source === options.instanceId) return;
		if (data.type === "discover") return;
		if (!isSidebarPanelSource(data.source) || !Number.isSafeInteger(data.revision)) return;
		let panel: SidebarPanelContribution | undefined;
		if (data.type === "register") {
			panel = sanitizeContribution(data.panel);
			if (!panel) return;
		} else if (data.type !== "unregister" || !isSidebarPanelId(data.id)) return;
		const revision = data.revision as number;
		if (!canTrackSource(data.source) || !canAcceptRevision(data.source, revision)) return;
		if (panel) {
			if (!canRegister(panel, data.source)) return;
			trackRevision(data.source, revision);
			applyRegister(panel, data.source);
		} else {
			const id = data.id as SidebarPanelId;
			if (!canUnregister(id, data.source)) return;
			trackRevision(data.source, revision);
			applyUnregister(id);
		}
	};
	if (options.events) {
		unsubscribe = options.events.on(SIDEBAR_PANEL_EVENT_CHANNEL, handleEvent);
	}
	const requestDiscovery = (): void => {
		if (disposed || !options.events) return;
		requestSequence += 1;
		options.events.emit(SIDEBAR_PANEL_EVENT_CHANNEL, {
			version: SIDEBAR_PANEL_PROTOCOL_VERSION,
			type: "discover",
			requestId: `${options.instanceId ?? "atelier"}-${requestSequence}`,
		});
	};
	requestDiscovery();
	return {
		register,
		unregister,
		handleEvent,
		requestDiscovery,
		getAvailable: () =>
			[...panels.values()].map((panel) => ({
				...panel,
				rows: panel.rows.map((row) => ({ text: row.text, ...(row.role ? { role: row.role } : {}) })),
			})),
		get: (id) => {
			const panel = panels.get(id);
			return panel
				? {
						...panel,
						rows: panel.rows.map((row) => ({ text: row.text, ...(row.role ? { role: row.role } : {}) })),
					}
				: undefined;
		},
		dispose: () => {
			if (disposed) return;
			disposed = true;
			unsubscribe?.();
			unsubscribe = undefined;
			panels.clear();
			owners.clear();
		},
	};
}

/**
 * Convenience publisher for contributing extensions. It replays registration
 * when Atelier asks for discovery, so loading either extension first works.
 */
export function registerSidebarPanel(
	pi: Pick<ExtensionAPI, "events">,
	panel: SidebarPanelContribution,
	options: { source?: string } = {},
): { update(panel: SidebarPanelContribution): void; dispose(): void } {
	const initial = sanitizeContribution(panel);
	const stableId = initial?.id && initial.id.includes(":") ? initial.id : undefined;
	const requestedSource = options.source ?? (stableId ? sourceFor(stableId) : undefined);
	const source =
		stableId && requestedSource !== undefined && isSidebarPanelSource(requestedSource)
			? requestedSource
			: undefined;
	let current = source && stableId && initial ? initial : undefined;
	let disposed = false;
	const emitRegister = (requestId?: string): void => {
		if (disposed || !source || !current) return;
		const revision = nextSidebarPanelRevision(pi.events, source);
		if (revision === undefined) return;
		pi.events.emit(SIDEBAR_PANEL_EVENT_CHANNEL, {
			version: SIDEBAR_PANEL_PROTOCOL_VERSION,
			type: "register",
			source,
			revision,
			panel: current,
			...(requestId ? { requestId } : {}),
		});
	};
	const unsubscribe = source
		? pi.events.on(SIDEBAR_PANEL_EVENT_CHANNEL, (data) => {
				if (!isEvent(data) || data.type !== "discover" || typeof data.requestId !== "string") return;
				emitRegister(data.requestId);
			})
		: () => undefined;
	if (current) emitRegister();
	return {
		update(next) {
			if (disposed || !source || !stableId) return;
			const safe = sanitizeContribution(next);
			// A publisher owns one stable ID for its whole lifetime. Ignore an
			// invalid payload, but preserve the historical behavior of treating
			// an attempted ID change as an update to that stable ID.
			if (!safe) return;
			current = { ...safe, id: stableId };
			emitRegister();
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			unsubscribe();
			if (!source || !current) return;
			const revision = nextSidebarPanelRevision(pi.events, source);
			if (revision === undefined) return;
			pi.events.emit(SIDEBAR_PANEL_EVENT_CHANNEL, {
				version: SIDEBAR_PANEL_PROTOCOL_VERSION,
				type: "unregister",
				source,
				revision,
				id: current.id,
			});
		},
	};
}
