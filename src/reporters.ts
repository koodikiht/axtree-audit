// SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht
// SPDX-License-Identifier: MIT

import { renderCompactAXTree } from "./axtree.ts";
import type { AXAuditReport, Severity } from "./types.ts";

function sarifLevel(sev: Severity): "error" | "warning" | "note" {
  if (sev === "CRITICAL" || sev === "HIGH") return "error";
  if (sev === "MEDIUM") return "warning";
  return "note";
}

export function formatSarif(report: AXAuditReport): string {
  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "axtree-audit",
            version: "0.1.0",
            informationUri: "https://github.com/koodikiht/axtree-audit",
          },
        },
        results: report.findings.map((f) => ({
          ruleId: f.ruleId,
          level: sarifLevel(f.severity),
          message: { text: f.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: f.targetUrl ?? report.target },
              },
            },
          ],
          properties: {
            category: f.category,
            severity: f.severity,
            wcagCriterion: f.wcagCriterion,
            nodeId: f.nodeId,
            backendDOMNodeId: f.backendDOMNodeId,
          },
        })),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

// W3C Evaluation and Report Language (EARL) 1.0 JSON-LD export for WCAG conformance workflows
export function formatW3CEarl(report: AXAuditReport): string {
  const earl = {
    "@context": "https://www.w3.org/ns/earl#",
    "@graph": [
      {
        "@id": "#assertor",
        "@type": ["Assertor", "Software"],
        title: "axtree-audit",
        hasVersion: "0.1.0",
        homepage: "https://github.com/koodikiht/axtree-audit",
      },
      {
        "@id": "#subject",
        "@type": ["TestSubject", "WebPage"],
        source: report.target,
        date: report.timestamp,
      },
      ...report.findings.map((f, idx) => ({
        "@id": `#assertion-${idx + 1}`,
        "@type": "Assertion",
        assertedBy: "#assertor",
        subject: "#subject",
        test: {
          "@id": `https://github.com/koodikiht/axtree-audit/rules/${f.ruleId}`,
          title: f.ruleId,
          isPartOf: f.wcagCriterion ? `https://www.w3.org/TR/WCAG22/#${f.wcagCriterion}` : undefined,
        },
        result: {
          "@type": "TestResult",
          outcome: "earl:failed",
          description: f.message,
          pointer: f.nodeId
            ? `axnode:${f.nodeId}${f.backendDOMNodeId ? ` (backendDOMNodeId:${f.backendDOMNodeId}${f.selector ? `, selector:${f.selector}` : ""})` : ""}`
            : f.targetUrl,
        },
      })),
    ],
  };

  return JSON.stringify(earl, null, 2);
}

export function formatTextSummary(report: AXAuditReport, includeTree = true): string {
  const lines: string[] = [];
  lines.push(`=== axtree-audit v0.1.0 | target: ${report.target} ===`);
  lines.push(
    `[AXTREE] Raw CDP nodes: ${report.totalRawNodes} -> Semantic nodes: ${report.semanticNodeCount} | Interactive: ${report.interactiveCount}`,
  );
  lines.push(`[LANDMARKS] ${report.landmarks.length > 0 ? report.landmarks.join(", ") : "none"}`);

  if (report.thirdPartyHosts.length > 0) {
    lines.push(`[PRIVACY] Third-party origins contacted (${report.thirdPartyHosts.length}): ${report.thirdPartyHosts.join(", ")}`);
  }

  lines.push(`[FINDINGS] Accessibility & privacy issues: ${report.findings.length}`);
  for (const f of report.findings) {
    const nodeRef = f.nodeId ? ` (nodeId=${f.nodeId})` : "";
    lines.push(`  - [${f.severity}] ${f.ruleId}: ${f.message}${nodeRef}`);
  }

  if (includeTree && report.tree.length > 0) {
    lines.push("\n--- Computed Semantic AXTree ---");
    lines.push(renderCompactAXTree(report.tree));
  }

  return lines.join("\n");
}
