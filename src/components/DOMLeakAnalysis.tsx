import React from "react";
import { Text, Box, Newline } from "ink";
import { DetachedDOMNode, DOMLeakSummary } from "../types/index.js";

interface DOMLeakAnalysisProps {
  detachedNodes: DetachedDOMNode[];
  summary: DOMLeakSummary;
}

export const DOMLeakAnalysis: React.FC<DOMLeakAnalysisProps> = ({
  detachedNodes,
  summary,
}) => {
  if (summary.totalDetachedNodes === 0) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="green" bold>
          ✅ No Detached DOM Nodes Detected
        </Text>
        <Text color="gray">
          Great! No detached DOM nodes were found in your heap snapshot.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="red" bold>
        🏝️ Detached DOM Nodes Analysis
      </Text>
      <Newline />

      {/* Summary Section */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyan" bold>
          Summary:
        </Text>
        <Text>Total Detached Nodes: {summary.totalDetachedNodes}</Text>

        {Object.entries(summary.detachedNodesByType).map(([type, count]) => (
          <Text key={type} color="yellow">
            • {type}: {count} nodes
          </Text>
        ))}
      </Box>

      {/* Suspicious Patterns */}
      {summary.suspiciousPatterns.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red" bold>
            ⚠️ Suspicious Patterns:
          </Text>
          {summary.suspiciousPatterns.map((pattern, index) => (
            <Text key={index} color="yellow">
              • {pattern}
            </Text>
          ))}
        </Box>
      )}

      {/* Retainer Arrays */}
      {summary.retainerArrays.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="magenta" bold>
            📋 Arrays Retaining DOM Nodes:
          </Text>
          {summary.retainerArrays.map((array, index) => (
            <Box key={index} flexDirection="column" marginLeft={2}>
              <Text color="cyan">
                {array.name}: {array.nodeCount} nodes
              </Text>
              {array.retainedNodes.slice(0, 3).map((node, i) => (
                <Text key={i} color="gray">
                  - {node}
                </Text>
              ))}
              {array.retainedNodes.length > 3 && (
                <Text color="gray">
                  ... and {array.retainedNodes.length - 3} more
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* Top Detached Nodes */}
      {detachedNodes.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="blue" bold>
            🔍 Top Detached DOM Nodes:
          </Text>
          {detachedNodes.slice(0, 5).map((domNode, index) => (
            <Box key={index} flexDirection="column" marginLeft={2} marginY={1}>
              <Text color="yellow">
                {domNode.elementType} -{" "}
                {(domNode.node.selfSize / 1024).toFixed(1)}KB
              </Text>
              <Text color="gray">
                Node: {domNode.node.name || domNode.node.type}
              </Text>
              {Object.keys(domNode.attributes).length > 0 && (
                <Text color="cyan">
                  Attributes: {Object.keys(domNode.attributes).join(", ")}
                </Text>
              )}
              {domNode.retainerInfo.length > 0 && (
                <Text color="gray">
                  Retained by: {domNode.retainerInfo.slice(0, 2).join(" → ")}
                </Text>
              )}
            </Box>
          ))}
          {detachedNodes.length > 5 && (
            <Text color="gray">
              ... and {detachedNodes.length - 5} more detached nodes
            </Text>
          )}
        </Box>
      )}

      {/* Recommendations */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="green" bold>
          💡 Recommendations:
        </Text>
        <Text color="gray">
          • Clear DOM references in useEffect cleanup functions
        </Text>
        <Text color="gray">
          • Set arrays to empty after removing DOM elements
        </Text>
        <Text color="gray">
          • Use WeakMap/WeakSet for DOM references when possible
        </Text>
        <Text color="gray">
          • Remove event listeners before removing DOM elements
        </Text>
      </Box>
    </Box>
  );
};
