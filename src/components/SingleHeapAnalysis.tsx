import React from "react";
import { Text, Box, Newline, useInput } from "ink";
import { AnalysisResult, formatBytes } from "../utils/heapAnalyzer.js";

interface SingleHeapAnalysisProps {
  analysisResult: AnalysisResult;
  snapshotName: string;
  onBack: () => void;
}

export const SingleHeapAnalysis: React.FC<SingleHeapAnalysisProps> = ({
  analysisResult,
  snapshotName,
  onBack,
}) => {
  const [currentPage, setCurrentPage] = React.useState(0);
  const { topRetainers, summary } = analysisResult;

  useInput((input, key) => {
    if (key.rightArrow || input === "n" || input === "N") {
      if (currentPage < topRetainers.length - 1) {
        setCurrentPage(currentPage + 1);
      }
    } else if (key.leftArrow || input === "p" || input === "P") {
      if (currentPage > 0) {
        setCurrentPage(currentPage - 1);
      }
    } else if (input === "b" || input === "B" || key.escape) {
      onBack();
    }
  });

  const currentRetainer = topRetainers[currentPage];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color="green" bold>
          🔍 Single Heap Analysis - {snapshotName}
        </Text>
        <Text color="gray">
          {currentPage + 1} of {topRetainers.length}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyan" bold>
          📊 Summary:
        </Text>
        <Text>Total Objects: {summary.totalObjects.toLocaleString()}</Text>
        <Text>
          Top {topRetainers.length} Memory Usage:{" "}
          {formatBytes(summary.totalRetainedSize)}
        </Text>

        <Text color="yellow" bold>
          🏷️ Categories Found:
        </Text>
        {Object.entries(summary.categories).map(([category, count]) => (
          <Text key={category}>
            {category}: {count} objects
          </Text>
        ))}
      </Box>

      <Newline />

      {currentRetainer && (
        <Box flexDirection="column">
          <Text color="cyan" bold>
            {currentRetainer.emoji} #{currentPage + 1}{" "}
            {currentRetainer.node.name || currentRetainer.node.type} (
            {currentRetainer.category})
          </Text>

          <Box flexDirection="column" marginY={1}>
            <Text color="blue">
              Retained Size: {formatBytes(currentRetainer.node.retainedSize)}
            </Text>
            <Text color="blue">
              Self Size: {formatBytes(currentRetainer.node.selfSize)}
            </Text>
          </Box>

          <Box flexDirection="column" marginY={1}>
            <Text color="yellow" bold>
              🔗 Retainer Path:
            </Text>
            {currentRetainer.retainerPaths[0]?.map((step, index) => (
              <Text key={index} color="gray">
                {index > 0 ? "   → " : "   "}
                {step}
              </Text>
            ))}
          </Box>

          <Box flexDirection="column" marginY={1}>
            <Text color="green" bold>
              💡 Suggested Fix:
            </Text>
            <Text color="white">{currentRetainer.suggestion}</Text>
          </Box>
        </Box>
      )}

      <Newline />

      <Box
        flexDirection="column"
        borderStyle="single"
        borderTop={true}
        paddingTop={1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row" gap={4}>
            {currentPage > 0 && <Text color="blue">[P] Previous</Text>}
            {currentPage < topRetainers.length - 1 && (
              <Text color="blue">[N] Next</Text>
            )}
          </Box>
          <Text color="yellow">[B] Back to menu</Text>
        </Box>
        <Newline />
        <Text color="gray" italic>
          Use arrow keys or N/P to navigate • Press B to go back
        </Text>
      </Box>
    </Box>
  );
};
