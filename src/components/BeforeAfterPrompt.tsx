import React from "react";
import { Text, Box, Newline, useInput } from "ink";
import { SnapshotFile } from "../types/index.js";
import { formatBytes } from "../utils/heapAnalyzer.js";

interface BeforeAfterPromptProps {
  snapshotCount: number;
  snapshotFiles: SnapshotFile[];
  onAnalyze: () => void;
  onView: () => void;
  onRescan: () => void;
  onExit: () => void;
  isRescanning?: boolean;
}

export const BeforeAfterPrompt: React.FC<BeforeAfterPromptProps> = ({
  snapshotCount,
  snapshotFiles,
  onAnalyze,
  onView,
  onRescan,
  onExit,
  isRescanning = false,
}) => {
  // Check for required snapshots
  const hasBeforeSnapshot = snapshotFiles.some(
    (file) => file.name === "before.heapsnapshot"
  );
  const hasAfterSnapshot = snapshotFiles.some(
    (file) => file.name === "after.heapsnapshot"
  );
  const hasComparisonPair = hasBeforeSnapshot && hasAfterSnapshot;

  useInput((input) => {
    if (isRescanning) return;

    if (snapshotCount === 0) {
      switch (input) {
        case "1":
        case "r":
          onRescan?.();
          break;
        case "2":
        case "q":
          onExit();
          break;
      }
    } else {
      switch (input) {
        case "1":
          if (hasComparisonPair) {
            onAnalyze();
          } else {
            // Need to create missing snapshots
            onRescan?.();
          }
          break;
        case "2":
          onView();
          break;
        case "3":
          onRescan?.();
          break;
        case "4":
          onExit();
          break;
        case "r":
          onRescan?.();
          break;
        case "q":
          onExit();
          break;
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="cyan" bold>
        🔍 Memory Leak Detection Tool
      </Text>
      <Newline />

      {isRescanning && (
        <>
          <Text color="yellow">🔄 Rescanning snapshots directory...</Text>
          <Newline />
        </>
      )}

      {snapshotCount === 0 && !isRescanning && (
        <>
          <Text color="red" bold>
            📁 No snapshots found in ./snapshots directory
          </Text>
          <Newline />

          <Text color="yellow" bold>
            This tool requires TWO heap snapshots:
          </Text>
          <Text color="cyan">1. 📸 Create Chrome DevTools snapshots</Text>
          <Text color="cyan">2. Go to Memory tab</Text>
          <Text color="cyan">3. Take "before.heapsnapshot"</Text>
          <Text color="cyan">4. Perform leak-prone actions</Text>
          <Text color="cyan">5. Take "after.heapsnapshot"</Text>
          <Text color="green">6. Save both files to ./snapshots directory</Text>
          <Newline />
        </>
      )}

      {snapshotCount > 0 && !isRescanning && (
        <>
          <Text color="cyan" bold>
            📁 Found snapshots:
          </Text>
          {snapshotFiles.map((file) => (
            <Text
              key={file.name}
              color={
                file.name.includes("before")
                  ? "green"
                  : file.name.includes("after")
                  ? "blue"
                  : "gray"
              }
            >
              • {file.name} ({formatBytes(file.size)})
            </Text>
          ))}
          <Newline />

          {!hasComparisonPair && (
            <>
              <Text color="yellow" bold>
                ⚠️ Missing required snapshots:
              </Text>
              {!hasBeforeSnapshot && (
                <Text color="red">
                  ✗ before.heapsnapshot - needed for baseline
                </Text>
              )}
              {!hasAfterSnapshot && (
                <Text color="red">
                  ✗ after.heapsnapshot - needed for comparison
                </Text>
              )}
              <Newline />
            </>
          )}

          {hasComparisonPair && (
            <>
              <Text color="green" bold>
                ✅ Ready for memory leak analysis!
              </Text>
              <Text>
                We'll compare before.heapsnapshot → after.heapsnapshot
              </Text>
              <Newline />
            </>
          )}
        </>
      )}

      {!isRescanning && (
        <>
          <Text color="cyan" bold>
            What would you like to do?
          </Text>
          <Newline />

          {snapshotCount === 0 ? (
            <>
              <Text color="green">
                [1] Rescan directory for snapshots (or press 'r')
              </Text>
              <Text color="red">[2] Exit (or press 'q')</Text>
            </>
          ) : (
            <>
              {hasComparisonPair ? (
                <Text color="green">
                  [1] 🚀 Analyze memory leaks (compare before → after)
                </Text>
              ) : (
                <Text color="yellow">
                  [1] 📝 Create missing snapshots (follow guide)
                </Text>
              )}
              <Text color="blue">[2] 📊 View snapshot details</Text>
              <Text color="green">[3] 🔄 Rescan directory (or press 'r')</Text>
              <Text color="red">[4] ❌ Exit (or press 'q')</Text>
            </>
          )}
        </>
      )}
    </Box>
  );
};
