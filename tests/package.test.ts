import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { SidebarPanelRole, SidebarPanelRow } from "../extensions/index.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("npm package contract", () => {
	it("publishes a Pi extension with compatible peers", () => {
		expect(pkg.name).toBe("pi-atelier");
		expect(pkg.version).toBe("0.7.0");
		expect(pkg.description).toBe("A responsive status rail and live activity sidebar for Pi");
		expect(pkg.keywords).toContain("pi-package");
		expect(pkg.pi.extensions).toEqual(["./extensions/index.ts"]);
		expect(pkg.peerDependencies["@earendil-works/pi-coding-agent"]).toBe(">=0.80.7");
		expect(pkg.peerDependencies["@earendil-works/pi-tui"]).toBe(">=0.80.7");
		expect(pkg.engines.node).toBe(">=22.19.0");
		expect(pkg.files).toEqual(expect.arrayContaining(["extensions", "src", "README.md", "LICENSE"]));
	});

	it("documents the split sidebar Resize interaction", async () => {
		const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
		expect(readme).toContain("Ctrl+Shift+R");
		expect(readme).toContain("28");
		expect(readme).toContain("72");
		expect(readme).toContain("version-sensitive");
	});

	it("publishes the Sidebar layout and contribution contract", async () => {
		const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
		expect(readme).toContain("sidebarPanelLayout");
		expect(readme).toContain("pi-atelier:sidebar-panels");
		expect(readme).toContain("namespaced");
		expect(readme).toContain("No available panels");
		expect(readme).toContain("when the Sidebar draft is dirty");
	});

	it("exports structured contribution row and role types from the package entrypoint", () => {
		const row: SidebarPanelRow = { text: "Ready", role: "ready" };
		const role: SidebarPanelRole = row.role ?? "primary";
		expect(row).toEqual({ text: "Ready", role: "ready" });
		expect(role).toBe("ready");
	});

	it("publishes the direct Display workspace and keyboard contract", async () => {
		const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
		expect(readme).toContain("/atelier display");
		expect(readme).toContain("Shift+Up/Shift+Down");
		expect(readme).toContain("Undo");
		expect(readme).toContain("Revert");
	});
});
