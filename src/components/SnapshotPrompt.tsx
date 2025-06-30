import React from "react";
import { Text, Box, Newline, useInput } from "ink";
import { MenuOption } from "../types/index.js";

interface SnapshotPromptProps {
  snapshotCount: number;
  onAnalyze: () => void;
  onView: () => void;
  onRescan?: () => void;
  onExit: () => void;
  isRescanning?: boolean;
}

export const SnapshotPrompt: React.FC<SnapshotPromptProps> = ({
  snapshotCount,
  onAnalyze,
  onView,
  onRescan,
  onExit,
  isRescanning = false,
}) => {
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
          onAnalyze();
          break;
        case "2":
          onView();
          break;
        case "3":
        case "r":
          onRescan?.();
          break;
        case "4":
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
            • <Text color="magenta">single.heapsnapshot</Text> - Single snapshot
            analysis
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
              <Text color="green">[1] Analyze snapshots for memory leaks</Text>
              <Text color="yellow">[2] View snapshot information</Text>
              <Text color="cyan">
                [3] Rescan directory for new snapshots (or press 'r')
              </Text>
              <Text color="red">[4] Exit (or press 'q')</Text>
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
