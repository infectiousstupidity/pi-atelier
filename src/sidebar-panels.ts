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
	return typeof value === "string" && (BUILTIN_IDS.has(value) || NAMESPACED_ID.test(value));
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

function sanitizeContribution(value: unknown): SidebarPanelContribution | undefined {
	if (
		!isRecord(value) ||
		!isSidebarPanelId(value.id) ||
		typeof value.title !== "string" ||
		!Array.isArray(value.rows)
	)
		return undefined;
	const rows: SidebarPanelRow[] = [];
	for (const row of value.rows) {
		if (typeof row === "string") rows.push({ text: row });
		else if (isRecord(row) && typeof row.text === "string")
			rows.push({ text: row.text, ...(isSidebarPanelRole(row.role) ? { role: row.role } : {}) });
		else return undefined;
	}
	return {
		id: value.id,
		title: value.title,
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
	const acceptRevision = (source: string, revision: number): boolean => {
		const previous = revisions.get(source) ?? 0;
		if (!Number.isSafeInteger(revision) || revision <= previous) return false;
		revisions.set(source, revision);
		return true;
	};
	const register = (panel: SidebarPanelContribution, source = sourceFor(panel.id)): boolean => {
		if (disposed || typeof source !== "string" || source.trim() === "") return false;
		const safe = sanitizeContribution(panel);
		if (!safe || !safe.id.includes(":")) return false;
		const owner = owners.get(safe.id);
		if (owner && owner !== source) return false;
		owners.set(safe.id, source);
		const next: SidebarPanelData = { ...safe, rows: safe.rows as SidebarPanelRow[], available: true, source };
		const previous = panels.get(safe.id);
		if (previous && JSON.stringify(previous) === JSON.stringify(next)) return false;
		panels.set(safe.id, next);
		changed();
		return true;
	};
	const unregister = (id: SidebarPanelId, source = sourceFor(id)): boolean => {
		if (disposed || !isSidebarPanelId(id) || typeof source !== "string" || source.trim() === "") return false;
		if (owners.get(id) !== source) return false;
		owners.delete(id);
		const removed = panels.delete(id);
		changed();
		return removed;
	};
	const handleEvent = (data: unknown): void => {
		if (disposed || !isEvent(data)) return;
		if (typeof data.source === "string" && options.instanceId && data.source === options.instanceId) return;
		if (data.type === "discover") return;
		if (typeof data.source !== "string" || data.source.trim() === "" || !Number.isSafeInteger(data.revision))
			return;
		let panel: SidebarPanelContribution | undefined;
		if (data.type === "register") {
			panel = sanitizeContribution(data.panel);
			if (!panel) return;
		} else if (data.type !== "unregister" || !isSidebarPanelId(data.id)) return;
		const revision = data.revision as number;
		if (!acceptRevision(data.source, revision)) return;
		if (panel) register(panel, data.source);
		else unregister(data.id as SidebarPanelId, data.source);
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
	const source = options.source ?? sourceFor(panel.id);
	const stableId = panel.id;
	let revision = 0;
	let current = { ...panel, id: stableId };
	let disposed = false;
	const emitRegister = (requestId?: string): void => {
		if (disposed) return;
		revision += 1;
		pi.events.emit(SIDEBAR_PANEL_EVENT_CHANNEL, {
			version: SIDEBAR_PANEL_PROTOCOL_VERSION,
			type: "register",
			source,
			revision,
			panel: current,
			...(requestId ? { requestId } : {}),
		});
	};
	const unsubscribe = pi.events.on(SIDEBAR_PANEL_EVENT_CHANNEL, (data) => {
		if (!isEvent(data) || data.type !== "discover" || typeof data.requestId !== "string") return;
		emitRegister(data.requestId);
	});
	emitRegister();
	return {
		update(next) {
			if (disposed) return;
			// A publisher owns one stable ID for its whole lifetime. Ignore an
			// attempted ID change rather than orphaning the previous registration.
			current = { ...next, id: stableId };
			emitRegister();
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			unsubscribe();
			revision += 1;
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
