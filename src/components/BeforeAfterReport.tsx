import React from "react";
import { Text, Box, Newline, useInput } from "ink";
import { ComparisonResult } from "../utils/beforeAfterAnalyzer.js";

interface BeforeAfterReportProps {
  result: ComparisonResult;
  onRestart: () => void;
}

export const BeforeAfterReport: React.FC<BeforeAfterReportProps> = ({
  result,
  onRestart,
}) => {
  const [currentSection, setCurrentSection] = React.useState(0);

  const sections = [
    {
      title: "📊 Memory Growth Analysis",
      content: () => (
        <>
          <Text color="cyan" bold>
            Memory Usage Changes:
          </Text>
          <Text>
            Before: {(result.memoryGrowth.beforeSize / 1024 / 1024).toFixed(1)}
            MB
          </Text>
          <Text>
            After: {(result.memoryGrowth.afterSize / 1024 / 1024).toFixed(1)}MB
          </Text>
          <Text color={result.memoryGrowth.totalGrowth > 0 ? "red" : "green"}>
            Growth: {result.memoryGrowth.totalGrowth > 0 ? "+" : ""}
            {(result.memoryGrowth.totalGrowth / 1024 / 1024).toFixed(1)}MB (
            {result.memoryGrowth.percentageGrowth.toFixed(1)}%)
          </Text>
          <Newline />

          <Text color="yellow" bold>
            Overall Assessment:
          </Text>
          <Text
            color={
              result.summary.leakConfidence === "high"
                ? "red"
                : result.summary.leakConfidence === "medium"
                ? "yellow"
                : "green"
            }
          >
            Leak Confidence: {result.summary.leakConfidence.toUpperCase()}
          </Text>

          {result.summary.primaryConcerns.length > 0 && (
            <>
              <Newline />
              <Text color="red" bold>
                Primary Concerns:
              </Text>
              {result.summary.primaryConcerns.map((concern, i) => (
                <Text key={i}>• {concern}</Text>
              ))}
            </>
          )}
        </>
      ),
    },
    {
      title: "🚨 Potential Memory Leaks",
      content: () => (
        <>
          {result.potentialLeaks.length === 0 ? (
            <Text color="green">
              ✅ No high-confidence memory leaks detected!
            </Text>
          ) : (
            result.potentialLeaks.map((leak, i) => (
              <Box key={i} flexDirection="column" marginBottom={1}>
                <Text color="red" bold>
                  {leak.type.toUpperCase()}: {leak.description}
                </Text>
                <Text color="yellow">
                  Confidence: {leak.confidence.toFixed(0)}%
                </Text>
                <Text color="cyan">Fix: {leak.suggestedFix}</Text>
                <Text color="gray">Affected objects: {leak.nodes.length}</Text>
                <Newline />
              </Box>
            ))
          )}
        </>
      ),
    },
    {
      title: "📈 New Objects Created",
      content: () => (
        <>
          <Text color="cyan" bold>
            {result.newObjects.length} new objects detected since before
            snapshot
          </Text>
          <Newline />

          {result.newObjects.slice(0, 10).map((obj, i) => (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text>
                {i + 1}. <Text color="yellow">{obj.category}</Text> -{" "}
                {(obj.size / 1024).toFixed(1)}KB
              </Text>
              <Text color="gray">Confidence: {obj.confidence.toFixed(0)}%</Text>
              {obj.retainerPath.length > 0 && (
                <Text color="gray">
                  Path: {obj.retainerPath.slice(0, 3).join(" → ")}
                </Text>
              )}
            </Box>
          ))}

          {result.newObjects.length > 10 && (
            <Text color="gray">
              ...and {result.newObjects.length - 10} more objects
            </Text>
          )}
        </>
      ),
    },
    {
      title: "📈 Objects That Grew",
      content: () => (
        <>
          {result.grownObjects.length === 0 ? (
            <Text color="green">✅ No significant object growth detected</Text>
          ) : (
            <>
              <Text color="cyan" bold>
                {result.grownObjects.length} objects grew significantly
              </Text>
              <Newline />

              {result.grownObjects.slice(0, 10).map((obj, i) => (
                <Box key={i} flexDirection="column" marginBottom={1}>
                  <Text>
                    {i + 1}.{" "}
                    <Text color="yellow">{obj.node.name || obj.node.type}</Text>
                  </Text>
                  <Text color="gray">
                    Before: {(obj.beforeSize / 1024).toFixed(1)}KB → After:{" "}
                    {(obj.afterSize / 1024).toFixed(1)}KB
                  </Text>
                  <Text color="red">
                    Growth: +{(obj.growth / 1024).toFixed(1)}KB
                  </Text>
                </Box>
              ))}

              {result.grownObjects.length > 10 && (
                <Text color="gray">
                  ...and {result.grownObjects.length - 10} more objects
                </Text>
              )}
            </>
          )}
        </>
      ),
    },
    {
      title: "💡 Recommendations",
      content: () => (
        <>
          <Text color="green" bold>
            Recommended Actions:
          </Text>
          {result.summary.recommendations.map((rec, i) => (
            <Text key={i}>• {rec}</Text>
          ))}
          <Newline />

          <Text color="cyan" bold>
            General Tips:
          </Text>
          <Text>• Clean up event listeners in component unmount</Text>
          <Text>• Use WeakMap/WeakSet for temporary references</Text>
          <Text>• Clear timers and intervals</Text>
          <Text>• Remove global references when done</Text>
          <Text>• Use React.useCallback for stable references</Text>
          <Newline />

          <Text color="magenta" bold>
            Next Steps:
          </Text>
          <Text>• Focus on high-confidence leaks first</Text>
          <Text>• Take another after snapshot to verify fixes</Text>
          <Text>• Monitor memory usage in production</Text>
        </>
      ),
    },
  ];

  useInput((input, key) => {
    if (key.rightArrow || input === "n" || input === "N") {
      if (currentSection < sections.length - 1) {
        setCurrentSection(currentSection + 1);
      }
    } else if (key.leftArrow || input === "p" || input === "P") {
      if (currentSection > 0) {
        setCurrentSection(currentSection - 1);
      }
    } else if (input === "r" || input === "R") {
      onRestart();
    } else if (input === "q" || input === "Q") {
      process.exit(0);
    }
  });

  const currentSectionData = sections[currentSection];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color="green" bold>
          {currentSectionData.title}
        </Text>
        <Text color="gray">
          Section {currentSection + 1} of {sections.length}
        </Text>
      </Box>

      <Box flexDirection="column" minHeight={15}>
        {currentSectionData.content()}
      </Box>

      <Newline />

      <Box
        flexDirection="column"
        borderStyle="single"
        borderTop={true}
        paddingTop={1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row" gap={4}>
            {currentSection > 0 && <Text color="blue">[P] Previous</Text>}
            {currentSection < sections.length - 1 && (
              <Text color="blue">[N] Next</Text>
            )}
          </Box>
          <Box flexDirection="row" gap={4}>
            <Text color="green">[R] Run new analysis</Text>
            <Text color="red">[Q] Exit</Text>
          </Box>
        </Box>
        <Newline />
        <Text color="gray" italic>
          {currentSection < sections.length - 1
            ? "Use arrow keys or N/P to navigate • Press R for new analysis or Q to exit"
            : "Press R to analyze new snapshots or Q to exit"}
        </Text>
      </Box>
    </Box>
  );
};
