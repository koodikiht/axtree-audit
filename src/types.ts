// SPDX-FileCopyrightText: 2026 Mark (malfunctionAI) / KoodiKiht
// SPDX-License-Identifier: MIT

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AXValue {
  type: string;
  value?: string | number | boolean;
}

export interface AXProperty {
  name: string;
  value: AXValue;
}

export interface RawAXNode {
  nodeId: string;
  ignored?: boolean;
  ignoredReasons?: AXProperty[];
  role?: AXValue;
  name?: AXValue;
  description?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  parentId?: string;
  childIds?: string[];
  backendDOMNodeId?: number;
}

export interface SemanticNode {
  nodeId: string;
  role: string;
  name: string;
  value?: string;
  focusable: boolean;
  disabled: boolean;
  hidden: boolean;
  level?: number;
  backendDOMNodeId?: number;
  children: SemanticNode[];
}

export interface NetworkEntry {
  url: string;
  method?: string;
  resourceType?: string;
  initiatorUrl?: string;
  responseHeaders?: Record<string, string>;
}

export interface AuditFinding {
  ruleId: string;
  wcagCriterion?: string;
  category: "accessibility" | "privacy";
  severity: Severity;
  message: string;
  nodeId?: string;
  backendDOMNodeId?: number;
  targetUrl?: string;
}

export interface AXAuditReport {
  target: string;
  timestamp: string;
  totalRawNodes: number;
  semanticNodeCount: number;
  interactiveCount: number;
  landmarks: string[];
  tree: SemanticNode[];
  thirdPartyHosts: string[];
  findings: AuditFinding[];
}
