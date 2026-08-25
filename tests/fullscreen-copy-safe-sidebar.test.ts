import { ScrollView, TuiAltScreen } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { createSplitPaneController } from "../src/split-pane.js";

const press = (x: number, y: number) => `\u001b[<0;${x};${y}M`;
const motion = (x: number, y: number) => `\u001b[<32;${x};${y}M`;
const release = (x: number, y: number) => `\u001b[<0;${x};${y}m`;

describe("fullscreen Sidebar selection", () => {
	it("copies transcript content without Sidebar text", () => {
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
		split.attach(renderer);
		split.show();
		const overlayHandle = renderer.showOverlay(
			{
				render: () => ["SIDEBAR", "TOKEN BURDEN"],
				invalidate() {},
			},
			split.overlayOptions(),
		);
		renderer.renderNow();

		// The Sidebar is visibly part of the HStack, but its lifecycle overlay is
		// non-visible so Pi can bind text selection to the transcript ScrollView.
		expect(renderer.render(120).join("\n")).toContain("SIDEBAR");
		expect(renderer.hasOverlay()).toBe(false);

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
