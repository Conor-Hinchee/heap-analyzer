import React from "react";
import { Text, Box, Newline } from "ink";
import { AnalysisResult } from "../types/index.js";
import { DOMLeakAnalysis } from "./DOMLeakAnalysis.js";

interface AnalysisProps {
  results?: AnalysisResult;
  isLoading?: boolean;
}

export const Analysis: React.FC<AnalysisProps> = ({
  results,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>
          🔍 Analyzing heap snapshots...
        </Text>
        <Newline />
        <Text>Please wait while we process your memory data...</Text>
        <Text color="gray">
          This may take a few moments depending on snapshot size.
        </Text>
      </Box>
    );
  }

  if (!results) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="red">❌ No analysis results available</Text>
        <Text>
          Please ensure you have valid .heapsnapshot files in the snapshots
          directory.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="green" bold>
        📈 Analysis Results
      </Text>
      <Newline />

      <Text color="cyan" bold>
        Summary:
      </Text>
      <Text>
        Total Objects: {results.summary.totalObjects.toLocaleString()}
      </Text>
      <Text>
        Total Retained Size:{" "}
        {(results.summary.totalRetainedSize / 1024 / 1024).toFixed(2)} MB
      </Text>
      <Text>
        Categories:{" "}
        {Object.entries(results.summary.categories)
          .map(([cat, count]) => `${cat}: ${count}`)
          .join(", ")}
      </Text>
      <Newline />

      {/* DOM Leak Analysis */}
      {results.detachedDOMNodes && results.domLeakSummary && (
        <>
          <DOMLeakAnalysis
            detachedNodes={results.detachedDOMNodes}
            summary={results.domLeakSummary}
          />
          <Newline />
        </>
      )}

      {/* Top Retainers */}
      {results.topRetainers && results.topRetainers.length > 0 && (
        <>
          <Text color="blue" bold>
            🔝 Top Memory Retainers:
          </Text>
          {results.topRetainers.slice(0, 5).map((retainer, index) => (
            <Box key={index} flexDirection="column" marginY={1}>
              <Text color="yellow">
                {retainer.emoji} {retainer.category}:{" "}
                {retainer.node.name || retainer.node.type}
              </Text>
              <Text color="gray">
                Size: {(retainer.node.selfSize / 1024).toFixed(1)}KB
              </Text>
              <Text color="cyan">{retainer.suggestion}</Text>
            </Box>
          ))}
          <Newline />
        </>
      )}

      {/* Legacy leaks support */}
      {results.leaks && results.leaks.length > 0 && (
        <>
          <Text color="red" bold>
            ⚠️ Potential Memory Leaks:
          </Text>
          {results.leaks.map((leak, index) => (
            <Box key={index} flexDirection="column" marginY={1}>
              <Text color="yellow">
                • {leak.type}: {leak.description}
              </Text>
              {leak.suggestions.map((suggestion, i) => (
                <Text key={i} color="gray">
                  {" "}
                  - {suggestion}
                </Text>
              ))}
            </Box>
          ))}
        </>
      )}

      <Newline />
      <Text color="gray">Press Ctrl+C to exit</Text>
    </Box>
  );
};
