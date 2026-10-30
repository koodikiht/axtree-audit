// SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { buildSemanticAXTree } from "../src/axtree.ts";
import { auditAXSnapshot } from "../src/cli.ts";
import { inspectNetworkPrivacy } from "../src/privacy.ts";
import { formatSarif, formatW3CEarl } from "../src/reporters.ts";
import type { RawAXNode } from "../src/types.ts";

const SAMPLE_NODES: RawAXNode[] = [
  {
    nodeId: "1",
    role: { type: "role", value: "RootWebArea" },
    name: { type: "computedString", value: "Portal Dashboard" },
    childIds: ["2", "3", "4", "5", "6"],
  },
  {
    nodeId: "2",
    role: { type: "role", value: "generic" },
    ignored: true,
    childIds: ["7"],
  },
  {
    nodeId: "7",
    role: { type: "role", value: "heading" },
    name: { type: "computedString", value: "Overview" },
    properties: [{ name: "level", value: { type: "integer", value: 1 } }],
  },
  {
    nodeId: "3",
    role: { type: "role", value: "heading" },
    name: { type: "computedString", value: "Skipped Subheading" },
    properties: [{ name: "level", value: { type: "integer", value: 3 } }],
  },
  {
    nodeId: "4",
    role: { type: "role", value: "button" },
    name: { type: "computedString", value: "" },
    properties: [{ name: "focusable", value: { type: "boolean", value: true } }],
    backendDOMNodeId: 42,
  },
  {
    nodeId: "5",
    role: { type: "role", value: "link" },
    name: { type: "computedString", value: "Click here" },
    properties: [{ name: "focusable", value: { type: "boolean", value: true } }],
  },
  {
    nodeId: "6",
    role: { type: "role", value: "image" },
    name: { type: "computedString", value: "" },
  },
];

describe("axtree-audit v0.1.0 core verification", () => {
  test("collapses ignored wrappers and flags WCAG 4.1.2, 2.4.4, 1.1.1, and 1.3.1 violations", () => {
    const res = buildSemanticAXTree(SAMPLE_NODES);

    expect(res.roots.length).toBe(1);
    expect(res.interactiveCount).toBe(2);
    const ruleIds = res.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain("WCAG-4.1.2-NAME");
    expect(ruleIds).toContain("WCAG-2.4.4-LINK");
    expect(ruleIds).toContain("WCAG-1.1.1-IMG");
    expect(ruleIds).toContain("WCAG-1.3.1-HEADING-ORDER");
    expect(ruleIds).toContain("WCAG-1.3.1-LANDMARK");
  });

  test("detects focusable element trapped inside an ignored AXNode", () => {
    const trapped: RawAXNode[] = [
      {
        nodeId: "10",
        role: { type: "role", value: "main" },
        name: { type: "computedString", value: "Main" },
        childIds: ["11"],
      },
      {
        nodeId: "11",
        ignored: true,
        role: { type: "role", value: "button" },
        name: { type: "computedString", value: "Ghost Button" },
        properties: [{ name: "focusable", value: { type: "boolean", value: true } }],
      },
    ];

    const res = buildSemanticAXTree(trapped);
    expect(res.findings.map((f) => f.ruleId)).toContain("WCAG-4.1.2-FOCUS-HIDDEN");
  });

  test("detects pre-consent third-party trackers and missing CSP headers", () => {
    const netRes = inspectNetworkPrivacy("https://portal.example.eu/login", [
      {
        url: "https://portal.example.eu/login",
        resourceType: "Document",
        responseHeaders: { "content-type": "text/html" },
      },
      {
        url: "https://www.google-analytics.com/g/collect?v=2",
        resourceType: "Fetch",
      },
      {
        url: "https://cdn.example.eu/app.js",
        resourceType: "Script",
      },
    ]);

    expect(netRes.thirdPartyHosts).toEqual(["www.google-analytics.com"]);
    expect(netRes.findings.map((f) => f.ruleId)).toEqual([
      "PRIV-001-MISSING-CSP",
      "PRIV-003-PRECONSENT-TRACKER",
    ]);
  });

  test("exports valid W3C EARL 1.0 JSON-LD and SARIF v2.1.0 reports", () => {
    const report = auditAXSnapshot({
      url: "https://portal.example.eu",
      nodes: SAMPLE_NODES,
    });

    const earl = JSON.parse(formatW3CEarl(report));
    expect(earl["@context"]).toBe("https://www.w3.org/ns/earl#");
    expect(earl["@graph"].length).toBeGreaterThan(2);

    const sarif = JSON.parse(formatSarif(report));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].results.length).toBe(5);
  });
});
