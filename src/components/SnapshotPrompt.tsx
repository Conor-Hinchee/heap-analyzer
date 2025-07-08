import React from "react";
import { Text, Box, Newline, useInput } from "ink";
import { MenuOption, SnapshotFile } from "../types/index.js";
import { formatBytes } from "../utils/heapAnalyzer.js";

interface SnapshotPromptProps {
  snapshotCount: number;
  snapshotFiles: SnapshotFile[];
  onAnalyze: () => void;
  onSingleAnalysis: (filename: string) => void;
  onView: () => void;
  onRescan?: () => void;
  onExit: () => void;
  onGenerateReport?: (filename: string) => void;
  isRescanning?: boolean;
}

export const SnapshotPrompt: React.FC<SnapshotPromptProps> = ({
  snapshotCount,
  snapshotFiles,
  onAnalyze,
  onSingleAnalysis,
  onView,
  onRescan,
  onExit,
  onGenerateReport,
  isRescanning = false,
}) => {
  // Check for single.heapsnapshot file
  const hasSingleSnapshot = snapshotFiles.some(
    (file) => file.name === "single.heapsnapshot"
  );

  // Check for before/after snapshots for comparison
  const hasBeforeSnapshot = snapshotFiles.some(
    (file) => file.name === "before.heapsnapshot"
  );
  const hasAfterSnapshot = snapshotFiles.some(
    (file) => file.name === "after.heapsnapshot"
  );
  const hasComparisonPair = hasBeforeSnapshot && hasAfterSnapshot;
  useInput((input) => {
    // Prevent input handling while rescanning
    if (isRescanning) return;

    if (snapshotCount === 0) {
      // Different options when no snapshots
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
      // Normal options when snapshots exist
      switch (input) {
        case "1":
          if (hasSingleSnapshot) {
            onSingleAnalysis("single.heapsnapshot");
          } else {
            onAnalyze();
          }
          break;
        case "2":
          if (hasSingleSnapshot && hasComparisonPair) {
            onAnalyze(); // Compare before/after
          } else if (hasSingleSnapshot) {
            onGenerateReport?.("single.heapsnapshot");
          } else {
            onAnalyze();
          }
          break;
        case "3":
          if (hasSingleSnapshot && hasComparisonPair) {
            onGenerateReport?.("single.heapsnapshot");
          } else if (hasSingleSnapshot) {
            onView();
          } else {
            onView();
          }
          break;
        case "4":
          if (hasSingleSnapshot && hasComparisonPair) {
            onView();
          } else if (hasSingleSnapshot) {
            onRescan?.();
          } else {
            onRescan?.();
          }
          break;
        case "5":
          if (hasSingleSnapshot && hasComparisonPair) {
            onRescan?.();
          } else if (hasSingleSnapshot) {
            onExit();
          } else {
            onExit();
          }
          break;
        case "6":
          if (hasSingleSnapshot && hasComparisonPair) {
            onExit();
          }
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
      <Text color="green" bold>
        📊 Heap Analyzer - Main Menu
      </Text>
      <Newline />
      <Text>
        Found {snapshotCount} snapshot file(s) in ./snapshots directory
      </Text>

      {isRescanning && (
        <>
          <Newline />
          <Box flexDirection="row" alignItems="center">
            <Text color="cyan">🔄 Rescanning snapshots directory...</Text>
          </Box>
        </>
      )}

      <Newline />

      {snapshotCount === 0 && (
        <>
          <Text color="yellow" bold>
            📸 No snapshots found! Here's how to take one:
          </Text>
          <Newline />
          <Text color="cyan">1. Open your web app in Chrome</Text>
          <Text color="cyan">2. Press F12 to open DevTools</Text>
          <Text color="cyan">3. Go to the "Memory" tab</Text>
          <Text color="cyan">4. Click "Take snapshot"</Text>
          <Text color="cyan">5. Right-click the snapshot → "Save as..."</Text>
          <Text color="green">6. Save to your ./snapshots directory</Text>
          <Newline />

          <Text color="magenta" bold>
            💡 Recommended naming:
          </Text>
          <Text>
            • <Text color="magenta">single.heapsnapshot</Text> - For single
            snapshot analysis
          </Text>
          <Text>
            • <Text color="magenta">before.heapsnapshot</Text> - Initial state
          </Text>
          <Text>
            • <Text color="magenta">after.heapsnapshot</Text> - After
            interactions
          </Text>
          <Newline />
        </>
      )}

      {snapshotCount > 0 && (
        <>
          <Text color="cyan" bold>
            📁 Found snapshots:
          </Text>
          {snapshotFiles.map((file) => (
            <Text key={file.name} color="gray">
              • {file.name} ({formatBytes(file.size)})
            </Text>
          ))}
          <Newline />
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
                [1] Rescan directory for new snapshots (or press 'r')
              </Text>
              <Text color="red">[2] Exit (or press 'q')</Text>
            </>
          ) : (
            <>
              {hasSingleSnapshot && (
                <Text color="blue">
                  [1] � Analyze single.heapsnapshot (top memory retainers)
                </Text>
              )}
              {!hasSingleSnapshot && (
                <Text color="green">
                  [1] Analyze snapshots for memory leaks
                </Text>
              )}

              {hasSingleSnapshot && hasComparisonPair && (
                <Text color="green">
                  [2] 📊 Compare before.heapsnapshot vs after.heapsnapshot
                </Text>
              )}
              {hasSingleSnapshot && !hasComparisonPair && (
                <Text color="green">[2] 📝 Generate markdown report</Text>
              )}
              {!hasSingleSnapshot && (
                <Text color="yellow">[2] View snapshot information</Text>
              )}

              {hasSingleSnapshot && hasComparisonPair ? (
                <Text color="green">[3] 📝 Generate markdown report</Text>
              ) : hasSingleSnapshot ? (
                <Text color="yellow">[3] View snapshot information</Text>
              ) : (
                <Text color="yellow">[3] View snapshot information</Text>
              )}

              {hasSingleSnapshot && hasComparisonPair ? (
                <Text color="yellow">[4] View snapshot information</Text>
              ) : hasSingleSnapshot ? (
                <Text color="cyan">[4] Rescan directory (or press 'r')</Text>
              ) : (
                <Text color="cyan">[4] Rescan directory (or press 'r')</Text>
              )}

              {hasSingleSnapshot && hasComparisonPair ? (
                <Text color="cyan">[5] Rescan directory (or press 'r')</Text>
              ) : hasSingleSnapshot ? (
                <Text color="red">[5] Exit (or press 'q')</Text>
              ) : (
                <Text color="red">[5] Exit (or press 'q')</Text>
              )}

              {hasSingleSnapshot && hasComparisonPair && (
                <Text color="red">[6] Exit (or press 'q')</Text>
              )}
            </>
          )}

          <Newline />
          <Text color="gray" italic>
            Press a number to select an option...
          </Text>
        </>
      )}
    </Box>
  );
};
