import React from "react";
import { Text, Box, Newline, useInput } from "ink";
import { AnalysisResult, formatBytes } from "../utils/heapAnalyzer.js";
import { RetainerTracer, TraceResult } from "../utils/retainerTracer.js";

interface SingleHeapAnalysisProps {
  analysisResult: AnalysisResult;
  snapshotName: string;
  snapshotData?: any; // Raw snapshot data for tracing
  onBack: () => void;
}

export const SingleHeapAnalysis: React.FC<SingleHeapAnalysisProps> = ({
  analysisResult,
  snapshotName,
  snapshotData,
  onBack,
}) => {
  const [currentPage, setCurrentPage] = React.useState(0);
  const [showLeakAnalysis, setShowLeakAnalysis] = React.useState(false);
  const [traceResults, setTraceResults] = React.useState<TraceResult[]>([]);
  const { topRetainers, summary } = analysisResult;

  // Key leak types for summary
  const keyLeakTypes = [
    { label: "Detached DOM nodes", keywords: ["detached", "dom"] },
    { label: "Unmounted React", keywords: ["unmounted", "fiber"] },
    { label: "Orphaned closures", keywords: ["closure"] },
    { label: "Leaked listeners", keywords: ["listener", "event"] },
  ];

  // Initialize tracer if snapshot data is available
  React.useEffect(() => {
    if (snapshotData && topRetainers.length > 0) {
      const tracer = new RetainerTracer(
        snapshotData,
        topRetainers.map((r) => r.node)
      );
      const traces = topRetainers.map((retainer) =>
        tracer.traceObject(retainer.node)
      );
      setTraceResults(traces);
    }
  }, [snapshotData, topRetainers]);

  useInput((input, key) => {
    if (key.rightArrow || input === "n" || input === "N") {
      if (currentPage < topRetainers.length - 1) {
        setCurrentPage(currentPage + 1);
      }
    } else if (key.leftArrow || input === "p" || input === "P") {
      if (currentPage > 0) {
        setCurrentPage(currentPage - 1);
      }
    } else if (input === "t" || input === "T") {
      setShowLeakAnalysis(!showLeakAnalysis);
    } else if (input === "b" || input === "B" || key.escape) {
      onBack();
    }
  });

  // --- Immediate Attention Section ---
  let immediateLines: string[] = [];
  if (traceResults.length > 0) {
    for (const leakType of keyLeakTypes) {
      const count = traceResults.filter(
        (tr, idx) =>
          tr &&
          tr.isLikelyLeak &&
          leakType.keywords.some((k) =>
            (topRetainers[idx].category || "").toLowerCase().includes(k)
          )
      ).length;
      if (count > 0) {
        immediateLines.push(`- ${count} ${leakType.label} retained`);
      }
    }
  }

  // --- Key Leak Type Table ---
  let leakTypeTable: string[][] = [];
  if (traceResults.length > 0) {
    for (const leakType of keyLeakTypes) {
      const count = traceResults.filter(
        (tr, idx) =>
          tr &&
          tr.isLikelyLeak &&
          leakType.keywords.some((k) =>
            (topRetainers[idx].category || "").toLowerCase().includes(k)
          )
      ).length;
      if (count > 0) {
        leakTypeTable.push([leakType.label, String(count)]);
      }
    }
  }

  const currentRetainer = topRetainers[currentPage];
  const currentTrace = traceResults[currentPage];

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

      {/* Immediate Attention Section */}
      {immediateLines.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red" bold>
            🔴 IMMEDIATE ATTENTION
          </Text>
          {immediateLines.map((line, idx) => (
            <Text key={idx} color="red">
              {line}
            </Text>
          ))}
        </Box>
      )}

      {/* Key Leak Type Table */}
      {leakTypeTable.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="cyan" bold>
            🧠 LEAK TYPE SUMMARY
          </Text>
          <Text>{`| Type                | Count |`}</Text>
          <Text>{`|---------------------|-------|`}</Text>
          {leakTypeTable.map(([type, count], idx) => (
            <Text key={type + idx}>{`| ${type.padEnd(20)} | ${count.padEnd(
              5
            )} |`}</Text>
          ))}
        </Box>
      )}

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
          <Box flexDirection="row" justifyContent="space-between">
            <Text color="cyan" bold>
              {currentRetainer.emoji} #{currentPage + 1}{" "}
              {currentRetainer.node.name || currentRetainer.node.type} (
              {currentRetainer.category})
            </Text>
            {currentTrace && (
              <Text color={currentTrace.isLikelyLeak ? "red" : "green"}>
                {currentTrace.isLikelyLeak ? "🚨 LEAK" : "✅ OK"} (
                {(currentTrace.confidence * 100).toFixed(0)}%)
              </Text>
            )}
          </Box>

          <Box flexDirection="column" marginY={1}>
            <Text color="blue">
              Retained Size: {formatBytes(currentRetainer.node.retainedSize)}
            </Text>
            <Text color="blue">
              Self Size: {formatBytes(currentRetainer.node.selfSize)}
            </Text>
          </Box>

          {!showLeakAnalysis ? (
            <>
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
                  💡 Smart Analysis:
                </Text>
                {currentTrace ? (
                  <Box flexDirection="column">
                    <Text color="white">{currentRetainer.suggestion}</Text>
                    <Text color="gray" italic>
                      Leak probability:{" "}
                      {(currentTrace.confidence * 100).toFixed(0)}% -{" "}
                      {currentTrace.isLikelyLeak
                        ? "Monitor closely"
                        : "Likely normal"}
                    </Text>
                  </Box>
                ) : (
                  <Text color="white">{currentRetainer.suggestion}</Text>
                )}
              </Box>
            </>
          ) : (
            currentTrace && (
              <>
                <Box flexDirection="column" marginY={1}>
                  <Text color="yellow" bold>
                    🧠 Leak Analysis:
                  </Text>
                  <Text color="white">{currentTrace.explanation}</Text>
                </Box>

                <Box flexDirection="column" marginY={1}>
                  <Text color="cyan" bold>
                    🔗 Root Cause Path:
                  </Text>
                  {currentTrace.rootPath.map((step, index) => (
                    <Text key={index} color="gray">
                      {index > 0 ? "   → " : "   "}
                      {step}
                    </Text>
                  ))}
                </Box>

                <Box flexDirection="column" marginY={1}>
                  <Text color="green" bold>
                    🔧 Smart Recommendation:
                  </Text>
                  <Text color="white">{currentTrace.actionableAdvice}</Text>
                </Box>

                <Box flexDirection="column" marginY={1}>
                  <Text color="magenta" bold>
                    📊 Context Details:
                  </Text>
                  <Text color="gray">
                    Retainer Type: {currentTrace.retainerInfo.rootType}
                  </Text>
                  <Text color="gray">
                    Path Length: {currentTrace.retainerInfo.pathLength}
                  </Text>
                  <Text color="gray">
                    Detached:{" "}
                    {currentTrace.retainerInfo.isDetached ? "Yes" : "No"}
                  </Text>
                </Box>
              </>
            )
          )}
        </Box>
      )}

      <Newline />

      {/* Manual Debug Checklist */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderTop={true}
        paddingTop={1}
      >
        <Text color="yellow" bold>
          ✅ MANUAL DEBUG CHECKLIST
        </Text>
        <Text color="gray">- [ ] Review all detached DOM nodes</Text>
        <Text color="gray">- [ ] Check for unmounted React components</Text>
        <Text color="gray">- [ ] Investigate large arrays/maps</Text>
        <Newline />
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row" gap={4}>
            {currentPage > 0 && <Text color="blue">[P] Previous</Text>}
            {currentPage < topRetainers.length - 1 && (
              <Text color="blue">[N] Next</Text>
            )}
            {traceResults.length > 0 && (
              <Text color="magenta">
                [T] {showLeakAnalysis ? "Basic View" : "Leak Analysis"}
              </Text>
            )}
          </Box>
          <Text color="yellow">[B] Back to menu</Text>
        </Box>
        <Newline />
        <Text color="gray" italic>
          Use arrow keys or N/P to navigate •{" "}
          {traceResults.length > 0 ? "T for leak analysis • " : ""}Press B to go
          back
        </Text>
      </Box>
    </Box>
  );
};
