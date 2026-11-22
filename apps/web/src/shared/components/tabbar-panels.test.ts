import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TabBar } from "./TabBar";

const tabs = [{ id: "board", label: "Board" }, { id: "list", label: "List" }];
const render = (panels?: boolean) => renderToStaticMarkup(createElement(TabBar, { tabs, value: "board", onChange: () => {}, ariaLabel: "View", idPrefix: "t", ...(panels === undefined ? {} : { panels }) }));

describe("TabBar panel links (axe aria-valid-attr-value)", () => {
  it("points each tab at its panel by default", () => {
    const html = render();
    expect(html).toContain('aria-controls="t-panel-board"');
    expect(html).toContain('aria-controls="t-panel-list"');
  });
  it("omits aria-controls when the page renders no TabPanel, so no tab points at a missing element", () => {
    expect(render(false)).not.toContain("aria-controls");
  });
});
