// SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht
// SPDX-License-Identifier: MIT

import type { AuditFinding, RawAXNode, SemanticNode } from "./types.ts";

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "menuitem",
  "tab",
]);

const LANDMARK_ROLES = new Set([
  "banner",
  "navigation",
  "main",
  "complementary",
  "contentinfo",
  "search",
  "region",
]);

const GENERIC_LINK_NAMES = new Set([
  "click here",
  "here",
  "read more",
  "more",
  "link",
  "learn more",
]);

function readProp(node: RawAXNode, propName: string): string | number | boolean | undefined {
  if (!node.properties) return undefined;
  for (const p of node.properties) {
    if (p.name === propName) return p.value?.value;
  }
  return undefined;
}

export function buildSemanticAXTree(rawNodes: RawAXNode[]): {
  roots: SemanticNode[];
  semanticNodeCount: number;
  interactiveCount: number;
  landmarks: string[];
  findings: AuditFinding[];
} {
  const byId = new Map<string, RawAXNode>();
  for (const n of rawNodes) {
    byId.set(n.nodeId, n);
  }

  const findings: AuditFinding[] = [];
  const landmarks: string[] = [];
  let semanticNodeCount = 0;
  let interactiveCount = 0;
  let lastHeadingLevel = 0;

  function toSemantic(nodeId: string, visited: Set<string>): SemanticNode[] {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);

    const raw = byId.get(nodeId);
    if (!raw) return [];

    const role = String(raw.role?.value ?? "generic");
    const name = String(raw.name?.value ?? "").trim();
    const val = raw.value?.value !== undefined ? String(raw.value.value) : undefined;
    const focusable = Boolean(readProp(raw, "focusable"));
    const disabled = Boolean(readProp(raw, "disabled"));
    const hidden = Boolean(raw.ignored) || Boolean(readProp(raw, "hidden"));
    const levelRaw = readProp(raw, "level");
    const level = typeof levelRaw === "number" ? levelRaw : undefined;

    const childNodes: SemanticNode[] = [];
    for (const cid of raw.childIds ?? []) {
      childNodes.push(...toSemantic(cid, visited));
    }

    // Check if an ignored/aria-hidden container still holds focusable children (WCAG 4.1.2 / 2.4.3 trap)
    if (raw.ignored && focusable && !disabled) {
      findings.push({
        ruleId: "WCAG-4.1.2-FOCUS-HIDDEN",
        wcagCriterion: "4.1.2",
        category: "accessibility",
        severity: "HIGH",
        message: `Focusable element (role=${role}) is marked ignored in the Accessibility Tree, creating a keyboard focus trap invisible to screen readers`,
        nodeId: raw.nodeId,
        backendDOMNodeId: raw.backendDOMNodeId,
      });
    }

    // Collapse purely structural generic/ignored wrappers while preserving semantic descendants
    const isStructuralWrapper =
      raw.ignored ||
      ((role === "generic" || role === "none" || role === "presentation" || role === "InlineTextBox") &&
        !name &&
        !focusable);

    if (isStructuralWrapper) {
      return childNodes;
    }

    semanticNodeCount++;

    if (LANDMARK_ROLES.has(role)) {
      landmarks.push(role);
    }

    if (INTERACTIVE_ROLES.has(role)) {
      interactiveCount++;
      if (!name) {
        findings.push({
          ruleId: "WCAG-4.1.2-NAME",
          wcagCriterion: "4.1.2",
          category: "accessibility",
          severity: "CRITICAL",
          message: `Interactive control with role '${role}' has an empty accessible name in the computed AXTree`,
          nodeId: raw.nodeId,
          backendDOMNodeId: raw.backendDOMNodeId,
        });
      } else if (role === "link" && GENERIC_LINK_NAMES.has(name.toLowerCase())) {
        findings.push({
          ruleId: "WCAG-2.4.4-LINK",
          wcagCriterion: "2.4.4",
          category: "accessibility",
          severity: "MEDIUM",
          message: `Link has non-descriptive accessible name '${name}' out of context`,
          nodeId: raw.nodeId,
          backendDOMNodeId: raw.backendDOMNodeId,
        });
      }
    }

    if ((role === "image" || role === "img") && !name) {
      findings.push({
        ruleId: "WCAG-1.1.1-IMG",
        wcagCriterion: "1.1.1",
        category: "accessibility",
        severity: "HIGH",
        message: "Non-decorative image node is exposed in the AXTree without an accessible text alternative",
        nodeId: raw.nodeId,
        backendDOMNodeId: raw.backendDOMNodeId,
      });
    }

    if (role === "heading" && level !== undefined) {
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        findings.push({
          ruleId: "WCAG-1.3.1-HEADING-ORDER",
          wcagCriterion: "1.3.1",
          category: "accessibility",
          severity: "LOW",
          message: `Skipped heading hierarchy level from h${lastHeadingLevel} to h${level} ('${name}')`,
          nodeId: raw.nodeId,
          backendDOMNodeId: raw.backendDOMNodeId,
        });
      }
      lastHeadingLevel = level;
    }

    const semNode: SemanticNode = {
      nodeId: raw.nodeId,
      role,
      name,
      value: val,
      focusable,
      disabled,
      hidden,
      level,
      backendDOMNodeId: raw.backendDOMNodeId,
      children: childNodes,
    };

    return [semNode];
  }

  const childIdSet = new Set<string>();
  for (const n of rawNodes) {
    for (const c of n.childIds ?? []) childIdSet.add(c);
  }

  const rootCandidates = rawNodes.filter((n) => !n.parentId && !childIdSet.has(n.nodeId));
  const startNodes = rootCandidates.length > 0 ? rootCandidates : rawNodes.slice(0, 1);

  const visited = new Set<string>();
  const roots: SemanticNode[] = [];
  for (const r of startNodes) {
    roots.push(...toSemantic(r.nodeId, visited));
  }

  if (semanticNodeCount > 0 && !landmarks.includes("main")) {
    findings.push({
      ruleId: "WCAG-1.3.1-LANDMARK",
      wcagCriterion: "1.3.1",
      category: "accessibility",
      severity: "MEDIUM",
      message: "Document AXTree does not expose a 'main' landmark region for assistive navigation",
    });
  }

  return {
    roots,
    semanticNodeCount,
    interactiveCount,
    landmarks: Array.from(new Set(landmarks)),
    findings,
  };
}

export function renderCompactAXTree(nodes: SemanticNode[], depth = 0): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  for (const n of nodes) {
    const lvl = n.level !== undefined ? `[L${n.level}]` : "";
    const focus = n.focusable ? " (focusable)" : "";
    const label = n.name ? ` "${n.name}"` : "";
    const val = n.value ? ` val="${n.value}"` : "";
    lines.push(`${indent}- [${n.role}${lvl}]${label}${val}${focus}`);
    if (n.children.length > 0) {
      lines.push(renderCompactAXTree(n.children, depth + 1));
    }
  }
  return lines.join("\n");
}
