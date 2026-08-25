import type { TUI } from "@earendil-works/pi-tui";
import { ScrollView, TuiAltScreen } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { createSplitPaneController } from "../src/split-pane.js";

const press = (x: number, y: number) => `\u001b[<0;${x};${y}M`;
const motion = (x: number, y: number) => `\u001b[<32;${x};${y}M`;
const release = (x: number, y: number) => `\u001b[<0;${x};${y}m`;

function stableTuiReference(getRenderer: () => TUI): TUI {
	return new Proxy({} as TUI, {
		get: (_target, property) => {
			const renderer = getRenderer();
			const value = Reflect.get(renderer, property, renderer);
			if (typeof value !== "function") return value;
			return (...args: unknown[]) => {
				const currentRenderer = getRenderer();
				const method = Reflect.get(currentRenderer, property, currentRenderer);
				if (typeof method !== "function") throw new TypeError(`${String(property)} is not callable`);
				return Reflect.apply(method, currentRenderer, args);
			};
		},
		set: (_target, property, value) => {
			const renderer = getRenderer();
			return Reflect.set(renderer, property, value, renderer);
		},
		getPrototypeOf: () => Reflect.getPrototypeOf(getRenderer()),
	}) as TUI;
}

describe("fullscreen Sidebar selection", () => {
	it("copies transcript content without Sidebar text through Pi's stable TUI reference", () => {
		let deliverInput: ((data: string) => void) | undefined;
		const write = vi.fn();
		const terminal = {
			columns: 120,
			rows: 8,
			write,
			start: vi.fn((onInput: (data: string) => void) => {
				deliverInput = onInput;
			}),
			stop: vi.fn(),
			hideCursor: vi.fn(),
			showCursor: vi.fn(),
		};
		const renderer = new TuiAltScreen(terminal as never);
		const tui = stableTuiReference(() => renderer);
		const transcript = new ScrollView(
			{
				render: () => ["alpha", "beta", "gamma"],
				invalidate() {},
			},
			{ primary: true },
		);
		renderer.setLayoutRoot(transcript);
		renderer.start();

		const split = createSplitPaneController();
		split.attach(tui);
		split.show();
		const overlayHandle = tui.showOverlay(
			{
				render: () => ["SIDEBAR", "TOKEN BURDEN"],
				invalidate() {},
			},
			split.overlayOptions(),
		);
		renderer.renderNow();

		// The Sidebar is visibly part of the HStack, but its lifecycle overlay is
		// non-visible so Pi can bind text selection to the transcript ScrollView.
		expect(tui.render(120).join("\n")).toContain("SIDEBAR");
		expect(tui.hasOverlay()).toBe(false);

		deliverInput?.(press(1, 1));
		deliverInput?.(motion(4, 2));
		deliverInput?.(release(4, 2));

		const copyWrite = write.mock.calls
			.map(([value]) => String(value))
			.findLast((value) => value.includes("\u001b]52;c;"));
		expect(copyWrite).toBeDefined();
		const encoded = copyWrite?.match(/\u001b\]52;c;([A-Za-z0-9+/=]+)\u0007/)?.[1];
		expect(encoded).toBeDefined();
		const copied = Buffer.from(encoded ?? "", "base64").toString("utf8");
		expect(copied).toBe("alpha\nbeta");
		expect(copied).not.toContain("SIDEBAR");
		expect(copied).not.toContain("TOKEN BURDEN");

		overlayHandle.hide();
		split.dispose();
		renderer.stop();
	});
});
