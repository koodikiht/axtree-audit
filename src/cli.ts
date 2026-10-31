#!/usr/bin/env bun
// SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { buildSemanticAXTree } from "./axtree.ts";
import { fetchLiveCDPAXTree } from "./cdp.ts";
import { inspectNetworkPrivacy } from "./privacy.ts";
import { formatSarif, formatTextSummary, formatW3CEarl } from "./reporters.ts";
import type { AXAuditReport, NetworkEntry, RawAXNode } from "./types.ts";

export interface SnapshotInput {
  url?: string;
  nodes: RawAXNode[];
  network?: NetworkEntry[];
}

export function auditAXSnapshot(input: SnapshotInput, fallbackTarget = "snapshot.json"): AXAuditReport {
  const target = input.url ?? fallbackTarget;
  const axRes = buildSemanticAXTree(input.nodes);
  const netRes = input.network
    ? inspectNetworkPrivacy(target, input.network)
    : { thirdPartyHosts: [], findings: [] };

  return {
    target,
    timestamp: new Date().toISOString(),
    totalRawNodes: input.nodes.length,
    semanticNodeCount: axRes.semanticNodeCount,
    interactiveCount: axRes.interactiveCount,
    landmarks: axRes.landmarks,
    tree: axRes.roots,
    thirdPartyHosts: netRes.thirdPartyHosts,
    findings: [...axRes.findings, ...netRes.findings],
  };
}

function printUsage(): void {
  console.log(`axtree-audit v0.1.0 - Out-of-band CDP Accessibility Tree (WCAG 2.2) & privacy verifier

Usage:
  axtree-audit scan <snapshot.json> [--format text|json|sarif|earl] [--no-tree] [--fail-on-high]
  axtree-audit live [--url <https://...>] [--cdp http://127.0.0.1:9222] [--format text|json|sarif|earl] [--no-tree] [--fail-on-high]
  axtree-audit --help
`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const cmd = args[0];
  let format = "text";
  let cdpUrl = "http://127.0.0.1:9222";
  let navUrl: string | undefined;
  let showTree = true;
  let failOnHigh = false;
  let snapshotPath: string | undefined;

  if (cmd === "scan") {
    snapshotPath = args[1];
  }

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--format" && args[i + 1]) {
      format = args[++i];
    } else if (args[i] === "--cdp" && args[i + 1]) {
      cdpUrl = args[++i];
    } else if (args[i] === "--url" && args[i + 1]) {
      navUrl = args[++i];
    } else if (args[i] === "--no-tree") {
      showTree = false;
    } else if (args[i] === "--fail-on-high") {
      failOnHigh = true;
    }
  }

  let report: AXAuditReport;

  if (cmd === "scan" && snapshotPath) {
    const raw = JSON.parse(readFileSync(snapshotPath, "utf8")) as SnapshotInput | RawAXNode[];
    const input: SnapshotInput = Array.isArray(raw) ? { nodes: raw } : raw;
    report = auditAXSnapshot(input, snapshotPath);
  } else if (cmd === "live") {
    const live = await fetchLiveCDPAXTree(cdpUrl, navUrl);
    report = auditAXSnapshot({ url: live.pageUrl, nodes: live.nodes }, live.pageUrl);
  } else {
    printUsage();
    process.exit(1);
  }

  if (format === "sarif") {
    console.log(formatSarif(report));
  } else if (format === "earl") {
    console.log(formatW3CEarl(report));
  } else if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatTextSummary(report, showTree));
  }

  if (
    failOnHigh &&
    report.findings.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
  ) {
    process.exit(2);
  }
}
